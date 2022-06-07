import { Library } from "ffi-napi";
import ref from "ref-napi";
import structFactory from "ref-struct-di";
import { resolve } from "path";
import * as url from "url";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

const struct = structFactory(ref);
const pointer = "pointer";
const string = ref.types.CString;
const bool = ref.types.bool;
const int = ref.types.int;
const uint64 = ref.types.uint64;
const _void_ = ref.types.void;

export const InigoConfig = struct({
  Debug: bool,
  Ingest: string,
  Service: string,
  Token: string,
  Schema: string,
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
const ffi = Library(resolve(__dirname, `../${pf}/lib${pf}.so`), {
  create: [uint64, [ref.refType(InigoConfig)]],
  process_request: [
    uint64,
    [uint64, pointer, int, ref.refType(pointer), ref.refType(int)],
  ],
  process_response: [
    _void_,
    [uint64, uint64, pointer, int, ref.refType(pointer), ref.refType(int)],
  ],
  // TODO: add 'update_schema'
  // dispose
});

export default class Inigo {
  #instance = 0;

  constructor(config) {
    this.#instance = ffi.create(config.ref());
    if (this.#instance == 0) {
      throw "error, instance could not be created.";
    }
  }

  newQuery(query) {
    return new Query(this.#instance, query);
  }

  // updateSchema() {
  //     // TOOD: implement
  // }
}

class Query {
  #instance = 0;
  #handle = 0;
  #query = "";

  constructor(instance, query) {
    this.#instance = instance;
    this.#query = query;
  }

  processRequest() {
    const input = Buffer.from(this.#query);
    const output_ptr = ref.alloc(ref.refType(pointer));
    const output_len_ptr = ref.alloc(int);

    this.#handle = ffi.process_request(
      this.#instance,
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
}

export function InigoPlugin(config) {
  const instance = new Inigo(config);

  return {
    async requestDidStart(requestContext) {
      // if (requestContext.request.operationName == "IntrospectionQuery") return null; // debug purposes
      const query = instance.newQuery(requestContext.request.query);
      const result = query.processRequest();

      // If we have some errors, get the mutated query
      if (result?.errors?.length > 0) {
        requestContext.request.query = result.query;
      }

      return {
        async willSendResponse(respContext) {
          if (respContext.response.data === undefined) {
            respContext.response.data = null;
          }

          const rawResponse = JSON.stringify(
            respContext.response,
            (key, value) => (key == "http" ? undefined : value)
          );
          const processed = query.processResponse(rawResponse);

          respContext.response.data = processed.data;
          respContext.response.errors = processed.errors;
          respContext.response.extensions = processed.extensions;
        },
      };
    },
  };
}
