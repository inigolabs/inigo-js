const { printSchema, parse, getOperationAST } = require("graphql");
const { GraphQLClient, gql } = require("graphql-request");
const { RemoteGraphQLDataSource } = require("@apollo/gateway");
const { v4: uuidv4 } = require("uuid");
const envelop = require("@envelop/core");
const ffi = require("./ffi.js");

class InigoInstance {
  #instance = 0;

  constructor(config) {
    this.#instance = ffi.create(config);
    const err = ffi.check_lasterror();
    if (err != "") {
      console.log("inigo-js:", err);
      process.exit();
    }

    if (this.#instance == 0) {
      console.log("inigo-js: error, instance could not be created.");
      process.exit();
    }
  }

  newQuery(query) {
    return new Query(this.#instance, query);
  }

  copyQuerydata(data) {
    return ffi.copy_querydata(data);
  }

  instance() {
    return this.#instance;
  }

  updateSchema(schema) {
    ffi.update_schema(this.#instance, schema);
  }

  flush() {
    ffi.flush(this.#instance);
  }

  shutdown() {
    ffi.shutdown(this.#instance);
  }
}

function version() {
  return ffi.get_version();
}

class Query {
  #instance = 0;
  #handle = 0;
  #query = {};
  #subgraph = "";

  scalars = {};

  constructor(instance, query) {
    this.#instance = instance;
    this.#query = query;
  }

  setSubgraphName(name) {
    this.#subgraph = name;
  }

  handle() {
    return this.#handle;
  }

  dispose() {
    ffi.disposeHandle(this.#handle);
    this.#handle = 0;
  }

  setHandle(val) {
    this.#handle = val;
  }

  processRequest(headers) {
    const newHeaders = {};

    if (headers !== undefined) {
      for (const [key, value] of headers.entries()) {
        newHeaders[key] = value.split(",").map((v) => v.trimStart());
      }
    }

    const result = ffi.process_service_request_v2(
      this.#instance,
      this.#subgraph,
      this.#query,
      newHeaders
    );

    this.#handle = result.handle;
    let response = result.response;
    let request = result.request;

    if (result.scalars !== null) {
      this.scalars = result.scalars;
    }

    return { response, request };
  }

  processResponse(data) {
    if (this.#handle == 0) return;

    const result = ffi.process_response(this.#instance, this.#handle, data);

    this.dispose();
    return result;
  }
}

// returns the key of the ctx. Key is different between version v2 - v4
function getCtxKey(requestContext) {
  if (requestContext.context !== undefined) {
    return "context";
  }

  return "contextValue";
}

function InigoPlugin(config) {
  let shutdown = () => {};
  const signalHandler = () => {
    shutdown();
    if (process.platform === "darwin") {
      process.exit(0);
    }
  };

  process.on("SIGINT", signalHandler);
  process.on("SIGTERM", signalHandler);
  process.on("SIGQUIT", signalHandler);

  const inigo = new Inigo(config);

  shutdown = () => {
    inigo.instance().shutdown();
  };

  return inigo.plugin();
}

class Inigo {
  #instance;
  #pluginConfig;
  #disabled = false;

  constructor(cfg) {
    if (process.env.INIGO_ENABLE === "false") {
      this.#disabled = true;
      return;
    }

    if (cfg?.Disabled) {
      this.#disabled = true;
      return;
    }

    // create internal configuration object
    const config = {
      Name: "inigo-js",
      Runtime: "node" + process.version.match(/\d+\.\d+/)[0],
      Token: process.env.INIGO_SERVICE_TOKEN,
      DisableResponseData: true,
    };

    // pass token if provided
    if (cfg?.Token && typeof cfg?.Token === "string") {
      config.Token = cfg.Token; // programmatically provided token overrides env var
    } else if (cfg?.Token !== undefined) {
      console.error("inigo-js: token should be a string.");
      process.exit();
    }

    // pass schema if provided
    if (cfg?.Schema && typeof cfg?.Schema === "string") {
      config.Schema = cfg.Schema; // statically provided schema. If not provided here, Inigo will subscribe on apollo-server schema update callback
    } else if (cfg?.Schema !== undefined) {
      console.error("inigo-js: schema should be a string.");
      process.exit();
    }

    this.#instance = new InigoInstance(config);
    if (this.#instance.instance() === 0) {
      console.log("inigo-js: error, instance could not be created.");
      process.exit();
    }

    // create internal configuration object
    this.#pluginConfig = {
      trace_header: "Inigo-Router-TraceID",
      listen_for_schema: config.Schema === null || config.Schema === undefined,
      skip_non_http_requests: cfg?.SkipNonHTTPRequests || false,
    };
  }

  instance() {
    return this.#instance;
  }

  plugin() {
    if (this.#disabled) {
      return {}; // silently return empty handlers
    }

    if (this.#instance === undefined || this.#instance.instance() === 0) {
      console.warn("InigoPlugin: Inigo instance is not found");
      return {}; // it's required to return empty handlers
    }

    return plugin(this.#instance, this.#pluginConfig);
  }
}

function plugin(inigo, config) {
  const serverWillStart = async function ({ apollo, schema, logger }) {
    const schemaDidLoadOrUpdate = function ({ apiSchema, coreSupergraphSdl }) {
      if (coreSupergraphSdl !== undefined) {
        // use-case: apollo-server with gateway
        inigo.updateSchema(coreSupergraphSdl);
      } else {
        // use-case: apollo-server without gateway
        try {
          const schema_str = printSchema(apiSchema);
          inigo.updateSchema(schema_str);
        } catch (e) {
          console.error("inigo.js: cannot print schema.", e);
        }
      }
    };

    const handlers = {
      serverWillStop: async () => {
        if (inigo instanceof InigoInstance) {
          await inigo.shutdown();
        }
      },
    };

    // attach callback only if schema was not passed explicitly
    if (config.listen_for_schema) {
      handlers.schemaDidLoadOrUpdate = schemaDidLoadOrUpdate;
    }

    return handlers;
  };

  const handlers = {
    inigo,
    // 'requestDidStart' callback is triggered when apollo receives request.
    // It returns handlers for query lifecycle events.
    async requestDidStart(requestContext) {
      // if (requestContext.request.operationName == "IntrospectionQuery") return null; // debug purposes

      if (inigo.instance() === 0) {
        console.warn("no inigo plugin instance");
        return;
      }

      // silently skip non-http requests if configured (typically internal requests, sent within the app itself)
      if (
        config.skip_non_http_requests &&
        (requestContext.request.http === undefined ||
          requestContext.request.http === null)
      ) {
        return;
      }

      // context key is derived once for every query. It's different based on the apollo server version
      let ctxKey = getCtxKey(requestContext);

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
          query = inigo.newQuery({
            query: ctx.source,
            operationName: ctx.request.operationName,
            variables: ctx.request.variables,
            extensions: ctx.request.extensions || {},
          });

          // Create request context, for storing blocked status
          if (ctx[ctxKey].inigo === undefined) {
            ctx[ctxKey].inigo = { blocked: false };
          }

          ctx[ctxKey].inigo.trace_header = config.trace_header;

          if (
            ctx.request.http &&
            ctx.request.http.headers &&
            !ctx.request.http.headers.get(config.trace_header)
          ) {
            ctx.request.http.headers.set(config.trace_header, uuidv4());
          }

          // process request
          const processed = query.processRequest(ctx.request.http?.headers);

          if (processed?.response != null) {
            response = processed.response;
            return;
          }

          // request query has been mutated
          if (processed?.request != null) {
            ctx.operationName = processed.request.operationName;
            ctx.request.operationName = processed.request.operationName;
            ctx.request.variables = processed.request.variables;

            if (
              ctx.request.http &&
              ctx.request.http.headers &&
              processed.request.extensions &&
              processed.request.extensions.traceparent
            ) {
              ctx.request.http.headers.set(
                "traceparent",
                processed.request.extensions.traceparent
              );
            }

            ctx.document = parse(processed.request.query);
            ctx.operation = getOperationAST(ctx.document, ctx.operationName);
          }
        },

        // responseForOperation executed right before request is propagated to the server
        responseForOperation(opCtx) {
          // response was provided by Inigo.
          if (response === undefined) {
            return;
          }

          if (ctxKey === "context") {
            // v2,v3
            return response;
          }

          // return response in order request to NOT be propagated to the server
          return {
            http: {
              status: 200,
            },
            body: {
              kind: "single",
              singleResult: response,
            },
          };
        },

        // willSendResponse is triggered before response is sent out
        async willSendResponse(respContext) {
          // query was not processed by Inigo.
          // Ex.: first APQ query (only query hash comes, server cannot resolve hash to string)
          if (query === undefined) {
            return;
          }

          // response was provided by Inigo.
          if (response !== undefined) {
            return;
          }

          // response came from the server.
          let resp;
          if (respContext.response?.body?.singleResult !== undefined) {
            resp = respContext.response.body.singleResult;
          } else {
            resp = respContext.response;
          }

          const processed = query.processResponse(
            JSON.stringify({
              extensions: resp.extensions,
              errors: resp.errors,
              response_size: 0,
              response_body_counts: responseCounts(resp, query.scalars),
            })
          );

          setResponse(respContext, modResponse(resp, processed));
        },
      };
    },
  };

  handlers.serverWillStart = serverWillStart;

  return handlers;
}

function setResponse(respContext, processed) {
  if (processed === undefined) {
    return;
  }

  // if 'singleResult' key is present - it's apollo-server v4, otherwise it v2/v3
  if (respContext.response?.body?.singleResult !== undefined) {
    respContext.response.body.singleResult.data = processed?.data;
    respContext.response.body.singleResult.errors = processed?.errors;
    respContext.response.body.singleResult.extensions = processed?.extensions;

    return;
  }

  respContext.response.data = processed?.data;
  respContext.response.errors = processed?.errors;
  respContext.response.extensions = processed?.extensions;
}

async function InigoFetchGatewayInfo(token) {
  if (process.env.INIGO_ENABLE === "false") {
    return {};
  }

  token = token || process.env.INIGO_SERVICE_TOKEN;
  const url =
    process.env.INIGO_SERVICE_URL || "https://app.inigo.io/agent/query"; // default url

  const graphQLClient = new GraphQLClient(url, {
    headers: {
      authorization: "Bearer " + token,
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
    }
  `;

  return graphQLClient.request(query).then((resp) => {
    return resp?.gatewayInfo?.services?.reduce((acc, i) => {
      acc[i.name] = i;
      return acc;
    }, {});
  });
}

const InigoDataSourceMixin = (superclass, inigo) =>
  class extends superclass {
    #instance = null;

    constructor(...args) {
      super(...args);

      if (inigo instanceof Inigo) {
        this.#instance = inigo.instance();
      }

      // backwards compatibility, when InigoRemoteDataSource is used as a base class and Inigo instance is provided as
      // a second argument
      if (args.length === 2 && args[1] instanceof Inigo) {
        this.#instance = args[1].instance();
      }

      if (this.#instance === null) {
        throw new Error(`
      inigo.js : InigoRemoteDataSource
      
      Inigo instance should be provided to InigoRemoteDataSource.
      
      `);
      }
    }

    // NOTE. overriding private method to prevent request sending if Inigo plugin generated the response.
    async sendRequest(request, context) {
      if (request.inigo !== undefined && request.inigo.response !== undefined) {
        // request was provided by Inigo

        return Promise.resolve(request.inigo.response);
      }

      // we use 'request' object as a context of subgraph request call since there's no other object suitable for that
      // purpose. In 'sendRequest' method 'request' object is also used as a body of the subgraph request. To ensure we don't
      // add 'inigo' object to the body of the request, we need to remove it from the 'request' object before sending the
      // request. (yoga server rejects graphql queries with unknown keys)
      const temp = request.inigo;
      delete request.inigo;

      const resp = await super.sendRequest(request, context);

      request.inigo = temp;

      return resp;
    }

    async processRequest({ request, context, incomingRequestContext }) {
      if (incomingRequestContext === undefined) {
        // internal request, ex.: IntrospectAndCompose is used
        return;
      }

      if (this.#instance?.instance() === 0) {
        console.error("inigo.js: Inigo instance is not found");
        return;
      }

      // get Inigo context provided from the parent plugin
      const ctxKey = getCtxKey(incomingRequestContext);
      const inigoCtx = incomingRequestContext[ctxKey].inigo;
      if (inigoCtx === undefined) {
        return; // request was not processed by Inigo main plugin, skip subgraph query processing
      }

      // create Inigo query instance
      let query = this.#instance.newQuery({
        query: request.query,
        operationName:
          request.operationName || incomingRequestContext?.operationName,
        variables: request.variables,
        extensions: request.extensions || {},
      });
      query.setSubgraphName(this.name);

      // pass traceid header to subgraph
      let traceid = incomingRequestContext.request.http?.headers.get(
        inigoCtx?.trace_header
      );
      if (traceid) {
        request.http.headers.set(inigoCtx?.trace_header, traceid);
      }

      // note: incomingRequestContext is undefined while IntrospectAndCompose is executed (bd it's not incoming request, it's internal)
      let traceparent =
        incomingRequestContext?.request.http?.headers.get("traceparent");
      if (traceparent) {
        request.http.headers.set("traceparent", traceparent);
      }

      const processed = query.processRequest(request.http?.headers);

      // handle case if invalid subgraph name is passed
      if (query.handle() === 0) {
        console.error(
          `inigo.js: cannot process subgraph '${this.name}' request.`
        );
        return;
      }

      if (request.inigo !== undefined) {
        console.error(`inigo.js: inigo is present on request.`);
      }

      request.inigo = { query: query };

      // introspection request
      if (processed?.response != null) {
        request.inigo.response = processed.response;
        return;
      }

      // request has been mutated
      if (processed?.request != null) {
        request.query = processed.request.query;
        request.operationName = processed.request.operationName;
        request.variables = processed.request.variables;

        if (
          request.http &&
          request.http.headers &&
          processed.request.extensions &&
          processed.request.extensions.traceparent
        ) {
          request.http.headers.set(
            "traceparent",
            processed.request.extensions.traceparent
          );
        }
      }
    }

    // implements the method from RemoteGraphQLDataSource class
    async willSendRequest(options) {
      // execute customers callback if defined.
      // should be executed before inigo. Ex.: in order to attach headers to request and so inigo can see them.
      if (typeof this.onBeforeSendRequest === "function") {
        try {
          await this.onBeforeSendRequest(options);
        } catch (e) {
          console.error(
            `inigo.js: ${
              super.name
            }: onBeforeSendRequest callback error. Error: ${e}`
          );
        }
      }

      // execute customers callback if defined
      if (typeof super.willSendRequest === "function") {
        try {
          await super.willSendRequest(options);
        } catch (e) {
          console.error(
            `inigo.js: ${
              super.name
            }: willSendRequest callback error. Error: ${e}`
          );
        }
      }

      if (this.#instance?.instance() === 0) {
        console.error("inigo.js: Inigo instance is not found");
        return;
      }

      // process request if Inigo is enabled and instance is created
      await this.processRequest(options);
    }

    // implements the method from RemoteGraphQLDataSource class
    async didReceiveResponse({ response, request, context }) {
      if (request.inigo !== undefined && request.inigo.response !== undefined) {
        // request was provided by Inigo
        return response;
      }

      // execute customers callback if defined, before processing response by Inigo
      if (typeof this.onAfterReceiveResponse === "function") {
        try {
          const updatedResp = await this.onAfterReceiveResponse({
            response,
            request,
            context,
          });
          response = updatedResp || response; // use updatedResp if returned
        } catch (e) {
          console.error(
            `inigo.js: ${
              super.name
            }: onAfterReceiveResponse callback error. Error: ${e}`
          );
        }
      }

      // execute customers callback if defined, before processing response by Inigo
      if (typeof super.didReceiveResponse === "function") {
        try {
          const updatedResp = await super.didReceiveResponse({
            response,
            request,
            context,
          });
          response = updatedResp || response; // use updatedResp if returned
        } catch (e) {
          console.error(
            `inigo.js: ${
              super.name
            }: didReceiveResponse callback error. Error: ${e}`
          );
        }
      }

      if (request.inigo === undefined || request.inigo.query === undefined) {
        return response;
      }

      // "http" part is attached by the RemoteGraphQLDataSource, remove before processResponse fn execution
      const inigo_resp = request.inigo.query.processResponse(
        JSON.stringify({
          extensions: response.extensions,
          errors: response.errors,
          response_size: 0,
          response_body_counts: responseCounts(
            response,
            request.inigo.query.scalars
          ),
        })
      );

      return modResponse(response, inigo_resp);
    }
  };

function modResponse(response, extended) {
  // note: do not set extensions if middleware returned empty extensions
  if (extended?.extensions && Object.keys(extended.extensions).length > 0) {
    if (!response.extensions) {
      response.extensions = {};
    }

    for (const [key, value] of Object.entries(extended.extensions)) {
      response.extensions[key] = value;
    }
  }

  if (extended?.errors) {
    if (!response.errors) {
      response.errors = [];
    }

    for (const error of extended.errors) {
      response.errors.push(error);
    }
  }

  return response;
}

function countResponseFields(resp) {
  const counts = {};

  if (resp.data) {
    countResponseFieldsRecursive(counts, "data", resp.data);
  }

  if (!counts["data"]) {
    counts["data"] = 1;
  }
  counts.errors = resp.errors ? resp.errors.length : 0;
  return counts;
}

function countResponseFieldsRecursive(hm, prefix, val) {
  if (!val || typeof val !== "object") {
    return;
  }

  const incr = (key, val) => {
    if (countResponseFieldsRecursive(hm, key, val)) {
      return;
    }

    hm[key] = (hm[key] || 0) + 1;
  };

  if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      incr(prefix, val[i]);
    }

    return true;
  }

  for (const [k, v] of Object.entries(val)) {
    incr(`${prefix}.${k}`, v);
  }

  return false;
}

const FEDERATED_SCHEMA_QUERY = gql`
  query FetchFederatedSchema($afterVersion: Int32!) {
    registry {
      federatedSchema(afterVersion: $afterVersion) {
        status
        version
        schema
      }
    }
  }
`;

class InigoSchemaManager {
  DEFAULT_ENDPOINT = "https://app.inigo.io/agent/query";
  #interval = 30_000; // 30s
  #currentSchemaVersion = 0;

  #client = null;
  #update = null;
  #timer = null;
  #onInitError = null;

  constructor({ token, endpoint, onInitError } = {}) {
    // check Inigo is enabled
    if (process.env.INIGO_ENABLE === "false") {
      throw Error(
        `InigoSchemaManager : cannot be used, when Inigo is disabled.`
      );
    }

    // check token
    let auth = process.env.INIGO_SERVICE_TOKEN;
    if (typeof token === "string" && token !== "") {
      auth = token;
    }
    if (auth === "") {
      throw Error(`
InigoSchemaManager : Inigo token is not provided.

It can be provided either via INIGO_SERVICE_TOKEN env var, or as a InigoSchemaManager param.
`);
    }

    this.#onInitError = onInitError;

    let url = this.DEFAULT_ENDPOINT;
    if (typeof endpoint === "string" && endpoint !== "") {
      url = endpoint;
    }

    // create client once
    this.#client = new GraphQLClient(url, {
      headers: { authorization: "Bearer " + auth },
    });
  }

  async initialize({ update }) {
    this.#update = update;

    // initial pull
    let initialSchema;
    try {
      initialSchema = await this.pull();
    } catch (err) {
      if (this.#onInitError) {
        initialSchema = await this.#onInitError(err);
      } else {
        throw new Error(`Error during initial schema pull: ${err}`);
      }
    }

    // start polling
    this.#timer = setInterval(async () => {
      try {
        const schema = await this.pull();
        if (typeof schema === "string" && schema !== "") {
          this.#update(schema);
        }
      } catch (err) {
        console.error(err);
      }
    }, this.#interval);

    return {
      supergraphSdl: initialSchema,
      cleanup: async () => {
        clearInterval(this.#timer);
      },
    };
  }

  async pull() {
    try {
      const resp = await this.#client.request(FEDERATED_SCHEMA_QUERY, {
        afterVersion: this.#currentSchemaVersion,
      });

      switch (resp?.registry?.federatedSchema?.status) {
        case "unchanged":
          // newer schema is not available
          return;
        case "updated":
          console.log(
            `InigoSchemaManager: new schema v${resp.registry.federatedSchema.version} pulled.`
          );

          this.#currentSchemaVersion = resp.registry.federatedSchema.version;
          return resp.registry.federatedSchema.schema;
        case "missing":
          throw new Error("schema is not available in the registry");
        default:
          throw new Error(`unknown or missing status`);
      }
    } catch (err) {
      throw Error(`
InigoSchemaManager: schema fetch failed. Current schema ${
        this.#currentSchemaVersion
      } is kept.

Error: ${err}
`);
    }
  }
}

const YogaInigoPlugin = (config) => {
  let shutdown = () => {};
  const signalHandler = () => {
    shutdown();
    if (process.platform === "darwin") {
      process.exit(0);
    }
  };

  process.on("SIGINT", signalHandler);
  process.on("SIGTERM", signalHandler);
  process.on("SIGQUIT", signalHandler);

  if (config?.Disabled) {
    return {};
  }

  if (!config?.Schema) {
    console.error("inigo-js: error, schema was not provided.");
    return {};
  }

  let cfg = {
    Token: process.env.INIGO_SERVICE_TOKEN,
    Schema: config.Schema,
    DisableResponseData: true,
  };

  if (config?.Token && typeof config?.Token === "string") {
    cfg.Token = config.Token;
  }

  const instance = new InigoInstance(cfg);
  if (instance.instance() === 0) {
    console.error("inigo-js: error, instance could not be created.");
    return {};
  }

  shutdown = () => {
    instance.shutdown();
  };

  return {
    onExecute(args) {
      const query = instance.newQuery(args.args.contextValue.params);

      const newHeaders = new Map();
      const headers = args.args.contextValue.req.rawHeaders;
      for (const [key] of headers.entries()) {
        if (key % 2 === 0) {
          newHeaders.set(headers[key], headers[key + 1]);
        }
      }

      const { response } = query.processRequest(newHeaders);
      if (response) {
        args.setResultAndStopExecution(response);
        return {};
      }

      return {
        onExecuteDone({ result, setResult }) {
          setResult(
            modResponse(
              result,
              query.processResponse(
                JSON.stringify({
                  extensions: result.extensions,
                  errors: result.errors,
                  response_size: 0,
                  response_body_counts: responseCounts(result, query.scalars),
                })
              )
            )
          );
        },
      };
    },
    onSubscribe(args) {
      const query = instance.newQuery(args.args.contextValue.params);

      const newHeaders = new Map();
      const headers = args.args.contextValue.req.rawHeaders;
      for (const [key] of headers.entries()) {
        if (key % 2 === 0) {
          newHeaders.set(headers[key], headers[key + 1]);
        }
      }

      const { response } = query.processRequest(newHeaders);
      if (response) {
        args.setResultAndStopExecution(response);
        return {};
      }

      const handle = query.handle();

      return {
        onSubscribeResult(payload) {
          return envelop.handleStreamOrSingleExecutionResult(
            payload,
            ({ result, setResult }) => {
              query.setHandle(instance.copyQuerydata(handle));
              setResult(
                modResponse(
                  result,
                  query.processResponse(
                    JSON.stringify({
                      extensions: result.extensions,
                      errors: result.errors,
                      response_size: 0,
                      response_body_counts: responseCounts(
                        result,
                        query.scalars
                      ),
                    })
                  )
                )
              );
            }
          );
        },
      };
    },
  };
};

function responseCounts(resp, scalarsSet) {
  return {
    errors: resp.errors ? resp.errors.length : 0,
    total_objects: countTotalObjects(resp, scalarsSet),
  };
}

function countTotalObjects(resp, customScalarPathSet = {}) {
  if (!resp.data) {
    return 0;
  }

  let total = 0;
  const stack = [{ key: "data", val: resp.data }];

  while (stack.length > 0) {
    const item = stack.pop();

    // skip potential JSON scalars
    if (item.key in customScalarPathSet) {
      continue;
    }

    // array
    if (Array.isArray(item.val)) {
      stack.push(...item.val.map((v) => ({ key: item.key, val: v })));
      continue;
    }

    // object
    if (typeof item.val === "object" && item.val !== null) {
      // count
      total++;
      stack.push(
        ...Object.entries(item.val).map(([k, v]) => ({
          key: `${item.key}.${k}`,
          val: v,
        }))
      );
    }
  }

  return total;
}

exports.responseCounts = responseCounts;
exports.countResponseFields = countResponseFields;
exports.InigoFetchGatewayInfo = InigoFetchGatewayInfo;
exports.InigoSchemaManager = InigoSchemaManager;
exports.InigoDataSourceMixin = InigoDataSourceMixin;
exports.InigoRemoteDataSource = InigoDataSourceMixin(RemoteGraphQLDataSource);
exports.InigoPlugin = InigoPlugin;
exports.Inigo = Inigo;
exports.version = version;
exports.YogaInigoPlugin = YogaInigoPlugin;