const { Library } = require("@inigolabs/ffi-napi");
const ref = require("@inigolabs/ref-napi");
const struct = require("ref-struct-di")(ref);
const { resolve } = require("path");
const { buildSchema, introspectionFromSchema } = require("graphql");
const jwt = require("jsonwebtoken");
const { RemoteGraphQLDataSource } = require("@apollo/gateway");
const { gql, GraphQLClient } = require('graphql-request');

const pointer = "pointer";
const string = ref.types.CString;
const bool = ref.types.bool;
const int = ref.types.int;
const uint64 = ref.types.uint64;
const _void_ = ref.types.void;

const InigoConfig = struct({
  Debug: bool,
  Ingest: string,
  Service: string,
  Token: string,
  Schema: string,
  Introspection: string,
  EgressUrl: string,
});
exports.InigoConfig = InigoConfig;

function getArch() {
  const arch = process.arch;
  if (arch == "x64") return "amd64";
  if (arch == "x32") return "i386";
  return arch;
}

function getOS() {
  const os = process.platform;
  if (os == "win32") return "windows";
  return os;
}

const pf = `inigo-${getOS()}-${getArch()}`;
var ext = ".so" // Linux

if (getOS() == "windows") {
  ext = ".dll"
}

if (getOS() == "darwin") {
  ext = ".dylib"
}

const ffi = Library(resolve(__dirname, `../${pf}/${pf}${ext}`), {
  create: [uint64, [ref.refType(InigoConfig)]],
  process_request: [ 
    uint64, // requestData handle
    [ 
      uint64, // request handle 
      pointer, int, // header
      pointer, int, // query
      ref.refType(pointer), ref.refType(int), // result
      ref.refType(pointer), ref.refType(int) // status
    ],
  ],
  process_response: [
    _void_,
    [uint64, uint64, pointer, int, ref.refType(pointer), ref.refType(int)],
  ],
  ingest_query_data: [
    _void_,
    [uint64, uint64],
  ],
  get_version: [ string, [] ],
  disposeHandle: [ _void_, [ uint64 ] ],
  disposeMemory: [ _void_, [ pointer ] ],
  update_schema: [ bool, [ uint64, string ] ],
  check_lasterror: [ string, [] ],
});

class Inigo {
  #instance = 0;

  constructor(config) {
    if (config.Schema !== null) {
      config.Introspection = `{ "data": ${JSON.stringify(introspectionFromSchema(buildSchema(config.Schema)))} }`
    }

    this.#instance = ffi.create(config.ref());
    const err = ffi.check_lasterror();
    if (err != "") {
      console.log("inigo-js:", err);
      process.exit()
    }

    if (this.#instance == 0) {
      console.log("inigo-js: error, instance could not be created.");
      process.exit()
    }
  }

  newQuery(query) {
    return new Query(this.#instance, query);
  }

  updateSchema(schema) {
    // ref.allocCString
  }
}

function version() {
  return JSON.parse(ffi.get_version());
}
exports.version = version;

class Query {
  #instance = 0;
  #handle = 0;
  #query = "";

  constructor(instance, query) {
    this.#instance = instance;
    this.#query = query;
  }

  processRequest(auth) {
    const input = Buffer.from(this.#query);
    const output_ptr = ref.alloc(ref.refType(pointer));
    const output_len_ptr = ref.alloc(int);

    const status_ptr = ref.alloc(ref.refType(pointer));
    const status_len_ptr = ref.alloc(int);

    const authObj = { jwt: auth };
    const authBuf = Buffer.from(JSON.stringify(authObj));

    this.#handle = ffi.process_request(
      this.#instance,
      authBuf,
      authBuf.length,
      input,
      input.length,
      output_ptr,
      output_len_ptr,
      status_ptr,
      status_len_ptr
    );

    let request = {};
    let result = {};

    if (output_len_ptr.deref() > 0) {
      request = JSON.parse(ref.readPointer(output_ptr, 0, output_len_ptr.deref()));
    }

    if (status_len_ptr.deref() > 0) {
      result = JSON.parse(ref.readPointer(status_ptr, 0, status_len_ptr.deref()));
    }

    ffi.disposeMemory(output_ptr.deref())
    ffi.disposeMemory(status_ptr.deref())
    
    return { request, result };
  }

  processResponse(data) {
    if (this.#handle == 0) return;

    const input = Buffer.from(data);
    const output_ptr = ref.alloc(ref.refType(pointer));
    const output_len_ptr = ref.alloc(int);

    ffi.process_response(
      this.#instance,
      this.#handle,
      input,
      input.length,
      output_ptr,
      output_len_ptr
    );
    const output = ref.readPointer(output_ptr, 0, output_len_ptr.deref());
    const result = JSON.parse(output);
    
    ffi.disposeMemory(output_ptr.deref())
    ffi.disposeHandle(this.#handle)
    this.#handle = 0;

    return result
  }

  ingest() {
    if (this.#handle == 0) return;
    ffi.ingest_query_data(this.#instance, this.#handle) // info: auto disposes of request handle
    this.#handle = 0;
  } 
}

function InigoPlugin(config) {
  const instance = new Inigo(config);

  return { async requestDidStart(requestContext) {
      // if (requestContext.request.operationName == "IntrospectionQuery") return null; // debug purposes

      // Create inigo query
      const query = instance.newQuery(requestContext.request.query);

      let auth = requestContext.context?.inigo?.jwt;

      // Create jwt from auth object
      if (requestContext.context?.inigo?.ctx !== undefined) {
        auth = jwt.sign(requestContext.context.inigo.ctx, null, { algorithm: "none" });
      }

      // Process request
      const processed = query.processRequest(auth);
      requestContext.inigo = { processed };

      // Create request context, for storing blocked status
      if (requestContext.context.inigo === undefined) {
        requestContext.context.inigo = { blocked: false };
      }

      // is an introspection
      if (processed?.request.data?.__schema != undefined) {
        requestContext.request = { http: requestContext.http };  // remove request from pipeline
        requestContext.context.inigo.blocked = true; // set blocked state
        return { willSendResponse(respContext) {
            setResponse(respContext, processed.request );
            query.ingest();
          }
        }
      }

      // If request is blocked
      if (processed?.result.status == "BLOCKED") {
        requestContext.request = { http: requestContext.http };  // remove request from pipeline
        requestContext.context.inigo.blocked = true; // set blocked state
        return { willSendResponse(respContext) {
            setResponse(respContext, { data: null, errors: processed.result.errors, extensions: processed.result.extensions });
            query.ingest();
          }
        }
      }

      // If request query has been mutated
      if (processed?.result.errors?.length > 0) {
        requestContext.request.query = processed.request.query;
      }

      // Process Response
      return { async willSendResponse(respContext) {
          const rawResponse = JSON.stringify(respContext.response, (key, value) => (key == "http" ? undefined : value));
          const processed = query.processResponse(rawResponse);
          setResponse(respContext, processed);
        },
      };
    },
  };
}

function setResponse(respContext, processed) {
  respContext.response.data = processed?.data;
  respContext.response.errors = processed?.errors;
  respContext.response.extensions = processed?.extensions;
}

async function InigoApolloGatewayPlugin(config) {
  let info = await fetchGatewayInfo(config.Token)
  let subGraphSidecars = info.gatewayInfo.services.reduce((acc, i) => {
    acc[i.name] = i
    return acc
  }, {})

  return {
    plugin: InigoPlugin(config),
    info: subGraphSidecars,
  }
}
class InigoRemoteDataSource extends RemoteGraphQLDataSource {
  #instance = 0

  constructor(info, {name, url}) {
    super();
    this.url = url
    this.name = name

    let config = new InigoConfig({
      Token: info[name].token,
      EgressUrl: info[name].url,
    })

    this.#instance = new Inigo(config);
  }

  // NOTE. overriding private method
  async sendRequest(requestWithQuery, context) {
    if (context?.inigo?.response !== undefined) {
      return Promise.resolve(context.inigo.response);
    }

    return super.sendRequest(requestWithQuery, context)
  }
  willSendRequest(options) {
    // if (options.request.operationName === "IntrospectionQuery") return null; // debug purposes

    if (this.#instance === undefined) {
      throw new Error("instance is not found")
    }

    let query = this.#instance.newQuery(options.request.query)

    // expect Inigo ctx to be created by parent plugin instance
    if (!options.context.inigo) {
      throw new Error("sub-graph Inigo plugin requires parent Inigo plugin")
    }

    options.context.inigo.query = query

    // Process request
    const auth = ""
    const processed = query.processRequest(auth);

    // introspection request
    if (processed?.request.data?.__schema !== undefined) {
      options.context.inigo.blocked = true; // set blocked state
      options.context.inigo.response = processed.request;

      return
    }

    // request is blocked
    if (processed?.result.status === "BLOCKED") {
      options.context.inigo.blocked = true; // set blocked state
      options.context.inigo.response = {
        data: null,
        errors: processed.result.errors,
        extensions: processed.result.extensions
      };

      return
    }

    // request has been mutated
    if (processed?.result.errors?.length > 0) {
      options.request.query = processed.request.query;
    }
  }

  // didReceiveResponse modifies the response and return it
  didReceiveResponse({ response, request, context }) {
    if (context.inigo.blocked) {
      context.inigo.query.ingest();
      return response;
    }

    delete response.http; // "http" part is attached by the RemoteGraphQLDataSource

    response = context.inigo.query.processResponse(JSON.stringify(response));

    context.inigo.query.ingest();
    return response
  }
}

async function fetchGatewayInfo(token) {
  let url = process.env.INIGO_SERVICE_URL
  if (url === "") {
    url = "https://app.inigo.io/api/query" // default prod url
  }

  const graphQLClient = new GraphQLClient(url, {
    headers: {
      authorization: 'Bearer ' + token
    },
  });
  const query = gql`
	query GatewayInfo {
		gatewayInfo {
			services {
				name
				label
				url
				token
			}
		}
	}
  `;

  return await graphQLClient.request(query);
}

exports.InigoPlugin = InigoPlugin;
exports.InigoApolloGatewayPlugin = InigoApolloGatewayPlugin;
exports.InigoRemoteDataSource = InigoRemoteDataSource;
