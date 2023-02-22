const { Library } = require("@inigolabs/ffi-napi");
const ref = require("@inigolabs/ref-napi");
const struct = require("ref-struct-di")(ref);
const { resolve } = require("path");
const { buildSchema, introspectionFromSchema, printSchema, parse, getOperationAST } = require("graphql");
const { GraphQLClient, gql } = require("graphql-request");
const { RemoteGraphQLDataSource } = require("@apollo/gateway");
const fs = require("fs");

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


let libraryPath = resolve(__dirname, `../${pf}/${pf}${ext}`);
if (fs.existsSync("libinigo.so")) {
  libraryPath = "libinigo.so"
}

const ffi = Library(libraryPath, {
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

class Query {
  #instance = 0;
  #handle = 0;
  #query = {};

  constructor(instance, query) {
    this.#instance = instance;
    this.#query = query;
  }

  processRequest(headers) {
    const input = Buffer.from(JSON.stringify(this.#query));
    const resp_ptr = ref.alloc(ref.refType(pointer));
    const resp_len_ptr = ref.alloc(int);

    const req_ptr = ref.alloc(ref.refType(pointer));
    const req_len_ptr = ref.alloc(int);

    const newHeaders = {};

    for (const [key, value] of headers.entries()) {
      newHeaders[key] =  value.split(',').map((v) => v.trimStart());
    }

    const headersBuf = Buffer.from(JSON.stringify(newHeaders));

    this.#handle = ffi.process_request(
        this.#instance,
        headersBuf,
        headersBuf.length,
        input,
        input.length,
        resp_ptr,
        resp_len_ptr,
        req_ptr,
        req_len_ptr
    );

    let response = null;
    let request = null;

    if (resp_len_ptr.deref() > 0) {
      response = JSON.parse(ref.readPointer(resp_ptr, 0, resp_len_ptr.deref()));
    }

    if (req_len_ptr.deref() > 0) {
      request = JSON.parse(ref.readPointer(req_ptr, 0, req_len_ptr.deref()));
    }

    ffi.disposeMemory(resp_ptr.deref())
    ffi.disposeMemory(req_ptr.deref())

    return { response, request };
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

  // instance stored in a closure
  let instance = 0;
  if (config.Schema) {
    instance = new Inigo(config);
  }

  return {
    async serverWillStart({ apollo, schema, logger }) {
      return {
        schemaDidLoadOrUpdate({ apiSchema, coreSupergraphSdl }) {
          if (instance === 0) { // instance can be not there if schema was not explicitly provided
            if (coreSupergraphSdl !== undefined) {
              // use-case: apollo-server with gateway
              config.Schema = coreSupergraphSdl
            } else {
              // use-case: apollo-server without gateway
              config.Schema = printSchema(apiSchema)
            }

            instance = new Inigo(config)
          } else {
            // TODO: handle schema update
          }
        }
      };
    },


    // 'requestDidStart' callback is triggered when apollo receives request.
    // It returns handlers for query lifecycle events.
    async requestDidStart(requestContext) {
      // if (requestContext.request.operationName == "IntrospectionQuery") return null; // debug purposes

      if (instance === 0) {
        console.warn("no inigo plugin instance")
        return
      }

      // context key is derived once for every query. It's different based on the apollo server version
      let ctxKey = getCtxKey(requestContext)

      let query; // instance of the Inigo query
      let response; // optional. If request was blocked by Inigo.

      return {
        // didResolveOperation callback is invoked after server has determined the string representation of the query.
        // Client can send query as a string or APQ (only query hash is sent). In this case, callback is executed after
        // query string is retrieved from cache by the hash.
        // Also, it's not triggered on the first APQ, when client sends query hash, but server cannot retrieve it.
        didResolveOperation(ctx) {
          // create Inigo query and store in a closure
          // ctx.source always holds the string representation of the query, in case of regular request or APQ
          query = instance.newQuery({
            query: ctx.source,
            operationName: ctx.request.operationName,
            variables: ctx.request.variables,
          });

          // Create request context, for storing blocked status
          if (ctx[ctxKey].inigo === undefined) {
            ctx[ctxKey].inigo = { blocked: false };
          }

          // process request
          const processed = query.processRequest(ctx.request.http.headers);

          if (processed?.response != null) {
            response = processed.response

            return
          }

          // request query has been mutated
          if (processed?.request != null) {
            ctx.operationName = processed.request.operationName;
            ctx.request.operationName = processed.request.operationName;
            ctx.request.variables = processed.request.variables;

            ctx.document = parse(processed.request.query);
            ctx.operation = getOperationAST(ctx.document, ctx.operationName);
          }
        },

        // responseForOperation executed right before request is propagated to the server
        responseForOperation(opCtx) {
          // response was provided by Inigo.
          if (response === undefined) {
            return
          }

          if (ctxKey === "context") { // v2,v3
            return response
          }

          // return response in order request to NOT be propagated to the server
          return {
            http: {
              status: 200
            },
            body: {
              kind: 'single',
              singleResult: response
            }
          };
        },

        // willSendResponse is triggered before response is sent out
        async willSendResponse(respContext) {
          // query was not processed by Inigo.
          // Ex.: first APQ query (only query hash comes, server cannot resolve hash to string)
          if (query === undefined) {
            return
          }

          // response was provided by Inigo.
          if (response !== undefined) {
            return
          }

          // response came from the server.
          let resp;
          if (respContext.response?.body?.singleResult !== undefined) {
            resp = respContext.response.body.singleResult
          } else {
            resp = respContext.response
          }

          const rawResponse = JSON.stringify(resp, (key, value) => (key == "http" ? undefined : value));
          const processed = query.processResponse(rawResponse);
          setResponse(respContext, processed);
        }
      };
    }
  }
}

function setResponse(respContext, processed) {
  if (processed === undefined) {
    return
  }

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
      inigo.js : InigoRemoteDataSource
      
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

    return await super.sendRequest(requestWithQuery, context)
  }

  async processRequest(options) {
    let query = this.#instance.newQuery({
      query: options.request.query,
      operationName: options.request.operationName,
      variables: options.request.variables,
    });

    // expect Inigo ctx to be created by parent plugin instance
    if (options.context.inigo === undefined) {
      options.context.inigo = {
        blocked: false // init empty context if it does not exist
      }
    }

    // options.context.inigo.query = query
    options.context.inigo[this.name] = query

    const processed = query.processRequest(options.request.http.headers);

    // introspection request
    if (processed?.response != null) {
      options.context.inigo.blocked = true; // set blocked state
      options.context.inigo.response = {
        data: processed?.response.data,
        errors: processed?.response.errors,
        extensions: processed?.response.extensions,
      };

      return
    }

    // request has been mutated
    if (processed?.request != null) {
      options.request.query = processed?.request.query;
      options.request.operationName = processed?.request.operationName;
      options.request.variables = processed?.request.variables;
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
    if (context.inigo?.blocked) {
      return response;
    }

    // execute customers callback if defined, before processing response by Inigo
    if (typeof this.onAfterReceiveResponse === 'function') {
      const updatedResp = await this.onAfterReceiveResponse({ response, request, context });
      response = updatedResp || response; // use updatedResp if returned
    }

    if (context.inigo[this.name] === undefined) {
      return response;
    }

    // "http" part is attached by the RemoteGraphQLDataSource, remove before processResponse fn execution
    const rawResponse = JSON.stringify(response, (key, value) => (key == "http" ? undefined : value));
    return context.inigo[this.name].processResponse(rawResponse);
  }
}

exports.InigoFetchGatewayInfo = InigoFetchGatewayInfo;
exports.InigoRemoteDataSource = InigoRemoteDataSource;
exports.InigoConfig = InigoConfig;
exports.InigoPlugin = InigoPlugin;
exports.version = version;
