const { Library } = require("ffi-napi");
const ref = require("ref-napi");
const struct = require("ref-struct-di")(ref);
const { resolve } = require("path");
const { buildSchema, introspectionFromSchema } = require("graphql");

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
      ref.refType(pointer), ref.refType(int) // result
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
  dispose: [ _void_, [ uint64 ] ],
  update_schema: [ bool, [ uint64, pointer, int ] ]
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
      // TOOD: implement
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

    const authObj = { jwt: auth };
    const authBuf = Buffer.from(JSON.stringify(authObj));

    this.#handle = ffi.process_request(
      this.#instance,
      authBuf,
      authBuf.length,
      input,
      input.length,
      output_ptr,
      output_len_ptr
    );
    const output = ref.readPointer(output_ptr, 0, output_len_ptr.deref());

    return JSON.parse(output);
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

    // TODO: dispose of handle
    this.#handle = 0;

    return JSON.parse(output);
  }

  ingest() {
    if (this.#handle == 0) return;
    ffi.ingest_query_data(this.#instance, this.#handle) // info: auto disposes of request handle
    this.#handle = 0;
  } 
}

function InigoPlugin(config) {
  const instance = new Inigo(config);

  return {
    async requestDidStart(requestContext) {
      // if (requestContext.request.operationName == "IntrospectionQuery") return null; // debug purposes
      const query = instance.newQuery(requestContext.request.query);
      const result = query.processRequest(requestContext.context?.auth);
      requestContext.inigo = { result };

      // If we have some errors, get the mutated query
      if (result?.errors?.length > 0) {
        requestContext.request.query = result.query;
      }

      return {
        async willSendResponse(respContext) {
          // Handle introspection
          if (respContext.inigo.result?.data?.__schema != undefined) {
            respContext.response.data = respContext.inigo.result.data;
            query.ingest();
            return
          }

          // Handle errors with empty response data
          if (respContext.inigo.result?.errors?.length > 0 && respContext.response.data === undefined) {
            respContext.response.data = respContext.inigo.result.data;
            respContext.response.errors = respContext.inigo.result?.errors;
            respContext.response.extensions = respContext.inigo.result?.extensions;
            query.ingest();
            return
          }

          const rawResponse = JSON.stringify(
            respContext.response,
            (key, value) => (key == "http" ? undefined : value)
          );
          const processed = query.processResponse(rawResponse);

          respContext.response.data = processed.data;
          respContext.response.errors = processed?.errors;
          respContext.response.extensions = processed?.extensions;
        },
      };
    },
  };
}
exports.InigoPlugin = InigoPlugin;
