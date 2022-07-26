const { Library } = require("@adam_inigo/ffi-napi");
const ref = require("@adam_inigo/ref-napi");
const struct = require("ref-struct-di")(ref);
const { resolve } = require("path");
const { buildSchema, introspectionFromSchema } = require("graphql");
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
  Storage: string
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
const ffi = Library(resolve(__dirname, `../${pf}/lib${pf}.so`), {
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
  update_schema: [ bool, [ uint64, string ] ]
});

class Inigo {
  #instance = 0;

  constructor(config) {
    // Get introspection schema
    config.Introspection = `{ "data": ${JSON.stringify(introspectionFromSchema(buildSchema(config.Schema)))} }`

    this.#instance = ffi.create(config.ref());
    if (this.#instance == 0) {
      throw "error, instance could not be created.";
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
            setResponse(respContext, { data: null, errors: processed.result.errors });
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
exports.InigoPlugin = InigoPlugin;

function setResponse(respContext, processed) {
  respContext.response.data = processed?.data;
  respContext.response.errors = processed?.errors;
  respContext.response.extensions = processed?.extensions;
}