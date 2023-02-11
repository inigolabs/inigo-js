const { Library } = require("@inigolabs/ffi-napi");
const ref = require("@inigolabs/ref-napi");
const struct = require("ref-struct-di")(ref);
const { resolve } = require("path");
const { buildSchema, introspectionFromSchema, printSchema } = require("graphql");
const { GraphQLClient, gql } = require("graphql-request");
const { RemoteGraphQLDataSource } = require("@apollo/gateway");
const jwt = require("jsonwebtoken");

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
  EgressUrl: string
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
    // Get introspection schema
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

// returns the key of the ctx. Key is different between version v2 - v4
function getCtxKey(requestContext) {
  if (requestContext.context !== undefined) {
    return "context"
  }

  return "contextValue"
}

function InigoPlugin(config) {
  if (process.env.INIGO_ENABLE === "false") {
    // return empty handlers. It's mandatory to return the value from here.
    return {}
  }

  if (!config) {
    // if config is not provided, create new one with the token from env var
    config = new InigoConfig({
      Token: process.env.INIGO_SERVICE_TOKEN
    })
  }

  let handlers = {}

  let instance = 0;
  if (config.Schema) {
    instance = new Inigo(config);
  } else {
    // lazy init for Inigo plugin. When static schema is not provided
    handlers.serverWillStart = async function({ apollo, schema, logger }) {
      return {
        schemaDidLoadOrUpdate({ apiSchema, coreSupergraphSdl }) {
          if (instance) {
            // just in case. Should not happen as this callback is attached only if schema is not there initially
            return
          }

          if (coreSupergraphSdl !== undefined) { // use-case: apollo-server with gateway
            config.Schema = coreSupergraphSdl
          } else { // use-case: apollo-server without gateway. api-schema suppose to always be present
            config.Schema = printSchema(apiSchema)
          }

          instance = new Inigo(config)
        }
      };
    }
  }


  handlers.requestDidStart = async function(requestContext) {
    // if (requestContext.request.operationName == "IntrospectionQuery") return null; // debug purposes

    if (instance === 0) {
      console.warn("no inigo plugin instance")
      return
    }

    // Create inigo query
    const query = instance.newQuery(requestContext.request.query);

    let ctxKey = getCtxKey(requestContext)
    let auth = requestContext[ctxKey].inigo?.jwt;

    // Create jwt from auth object
    if (requestContext[ctxKey]?.inigo?.ctx !== undefined) {
      auth = jwt.sign(requestContext[ctxKey].inigo.ctx, null, { algorithm: "none" });
    }

    // Process request
    const processed = query.processRequest(auth);

    // Create request context, for storing blocked status
    if (requestContext[ctxKey].inigo === undefined) {
      requestContext[ctxKey].inigo = {
        blocked: false,
        auth: auth,
      };
    }

    // is an introspection
    if (processed?.request.data?.__schema != undefined) {
      requestContext.request = { http: requestContext.http };  // remove request from pipeline
      requestContext[ctxKey].inigo.blocked = true; // set blocked state
      return { willSendResponse(respContext) {
          setResponse(respContext, processed.request);
          query.ingest();
        }
      }
    }

    // If request is blocked
    if (processed?.result.status == "BLOCKED") {
      requestContext.request = { http: requestContext.http };  // remove request from pipeline
      requestContext[ctxKey].inigo.blocked = true; // set blocked state
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
    return {
      async willSendResponse(respContext) {
        let resp;
        if (respContext.response?.body?.singleResult !== undefined) {
          resp = respContext.response.body.singleResult
        } else {
          resp = respContext.response
        }

        const rawResponse = JSON.stringify(resp, (key, value) => (key == "http" ? undefined : value));
        const processed = query.processResponse(rawResponse);
        setResponse(respContext, processed);
      },
    };
  }

  return handlers;
}
exports.InigoPlugin = InigoPlugin;

function setResponse(respContext, processed) {
  // if 'singleResult' key is present - it's apollo-server v4, otherwise it v2/v3
  if (respContext.response?.body?.singleResult !== undefined) {
    respContext.response.body.singleResult.data = processed?.data
    respContext.response.body.singleResult.errors = processed?.errors
    respContext.response.body.singleResult.extensions = processed?.extensions

    return
  }

  respContext.response.data = processed?.data;
  respContext.response.errors = processed?.errors;
  respContext.response.extensions = processed?.extensions;
}

async function InigoFetchGatewayInfo(token) {
  token = token || process.env.INIGO_SERVICE_TOKEN
  const url = process.env.INIGO_SERVICE_URL || "https://app.inigo.io/agent/query" // default url

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
    }`;

  let resp = await graphQLClient.request(query);

  return resp?.gatewayInfo?.services?.reduce((acc, i) => {
    acc[i.name] = i
    return acc
  }, {})
}

class InigoRemoteDataSource extends RemoteGraphQLDataSource {
  #instance = 0

  constructor(info, {name, url}) {
    super();

    if (!name) {
      throw new Error("Name of the subgraph service should be provided to InigoRemoteDataSource.")
    }

    if (Object.getPrototypeOf(this).hasOwnProperty("willSendRequest") ||
        Object.getPrototypeOf(this).hasOwnProperty("didReceiveResponse")) {

      throw new Error(`
      Methods 'willSendRequest' and 'didReceiveResponse' cannot be overwritten.
      Use 'onBeforeSendRequest' and 'onAfterReceiveResponse' respectively.
      `)
    }

    this.name = name
    this.url = url

    const details = info[name]
    if (details === undefined) {
      console.error(`inigo: service '${this.name}' is not specified for gateway.`)
      return
    }

    let config = new InigoConfig({
      Token: details.token,
      EgressUrl: url
    })

    this.#instance = new Inigo(config);
  }

  // NOTE. overriding private method to prevent request sending if Inigo plugin generated the response.
  async sendRequest(requestWithQuery, context) {
    if (context?.inigo?.response !== undefined) {
      return Promise.resolve(context.inigo.response);
    }

    return super.sendRequest(requestWithQuery, context)
  }

  async processRequest(options) {
    let query = this.#instance.newQuery(options.request.query)

    // expect Inigo ctx to be created by parent plugin instance
    if (options.context.inigo === undefined) {
      options.context.inigo = {
        blocked: false // init empty context if it does not exist
      }
    }

    options.context.inigo.query = query

    // Process request
    const auth = options.context.inigo.auth || "" // attempts to get auth, processed by parent inigo plugin
    const processed = query.processRequest(auth);

    // introspection request
    if (processed?.request?.data?.__schema !== undefined) {
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

  // implements the method from RemoteGraphQLDataSource class
  async willSendRequest(options) {
    if (this.#instance !== 0) {
      await this.processRequest(options)
    }

    // execute customers callback if defined
    if (this.onBeforeSendRequest) {
      await this.onBeforeSendRequest(options);
    }
  }

  // implements the method from RemoteGraphQLDataSource class
  async didReceiveResponse({ response, request, context }) {
    if (this.#instance !== 0) {
      if (context.inigo.blocked) {
        context.inigo.query.ingest();
        return response;
      }

      // execute customers callback if defined, before processing response by Inigo
      if (typeof this.onAfterReceiveResponse === 'function') {
        const updatedResp = await this.onAfterReceiveResponse({ response, request, context })
        response = updatedResp || response // use updatedResp if returned from
      }

      delete response.http; // "http" part is attached by the RemoteGraphQLDataSource, remove before processResponse fn execution

      response = context.inigo.query.processResponse(JSON.stringify(response));
      context.inigo.query.ingest();

      return response
    }

    return response
  }
}

exports.InigoFetchGatewayInfo = InigoFetchGatewayInfo;
exports.InigoRemoteDataSource = InigoRemoteDataSource;
