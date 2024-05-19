const { Library } = require("@inigolabs/ffi-napi")
const ref = require("@inigolabs/ref-napi")
const struct = require("ref-struct-di")(ref)
const { resolve } = require("path");
const fs = require("fs");

const pointer = "pointer"
const string = ref.types.CString
const bool = ref.types.bool
const int = ref.types.int
const uint64 = ref.types.uint64
const _void_ = ref.types.void

const InigoConfig = struct({
  Debug: bool,
  Name: string,
  Service: string,
  Token: string,
  Schema: string,
  Runtime: string,
  EgressUrl: string,
  Gateway: uint64,
  DisableResponseData: bool,
})

function getArch() {
  const arch = process.arch;
  if (arch == "x64") return "amd64"
  if (arch == "x32") return "i386"
  return arch
}

function getOS() {
  const os = process.platform;
  if (os == "win32") return "windows"
  return os
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
if (fs.existsSync("libinigo"+ext)) {
  libraryPath = "libinigo"+ext
}

const ffi = Library(libraryPath, {
  create: [uint64, [ref.refType(InigoConfig)]],
  process_service_request_v2: [
    uint64, // requestData handle
    [
      uint64, // request handle
      pointer, int, // subgraph name
      pointer, int, // header
      pointer, int, // query
      ref.refType(pointer), ref.refType(int), // result
      ref.refType(pointer), ref.refType(int), // status
      ref.refType(pointer), ref.refType(int), // analysis
    ],
  ],
  process_response: [
    _void_,
    [ uint64, uint64, pointer, int, ref.refType(pointer), ref.refType(int) ],
  ],
  get_version: [ string, [] ],
  disposeHandle: [ _void_, [ uint64 ] ],
  disposeMemory: [ _void_, [ pointer ] ],
  update_schema: [ bool, [ uint64, string, int ] ],
  check_lasterror: [ string, [] ],
  shutdown: [ _void_, [ uint64 ] ],
  copy_querydata: [ uint64, [ uint64 ] ],
})

function check_lasterror() {
  return ffi.check_lasterror();
}

function copy_querydata(val) {
  return ffi.copy_querydata(val);
}

function create(val) {
  return ffi.create(new InigoConfig(val).ref());
}

function process_service_request_v2(instance, subgraph, query, header) {
  const input = Buffer.from(JSON.stringify(query));
  const subgraphs = Buffer.from(subgraph);
  const headers = Buffer.from(JSON.stringify(header));

  const resp_ptr = ref.alloc(ref.refType(pointer));
  const resp_len_ptr = ref.alloc(int);

  const req_ptr = ref.alloc(ref.refType(pointer));
  const req_len_ptr = ref.alloc(int);

  const analysis_ptr = ref.alloc(ref.refType(pointer));
  const analysis_len_ptr = ref.alloc(int);

  const handle = ffi.process_service_request_v2(
    instance, 
    subgraphs, 
    subgraphs.length, 
    headers, 
    headers.length, 
    input, 
    input.length,
    resp_ptr,
    resp_len_ptr,
    req_ptr,
    req_len_ptr,
    analysis_ptr,
    analysis_len_ptr
  );

  let response = null;
  let request = null;
  let scalars = null;

  if (resp_len_ptr.deref() > 0) {
    response = JSON.parse(ref.readPointer(resp_ptr, 0, resp_len_ptr.deref()));
  }

  if (req_len_ptr.deref() > 0) {
    request = JSON.parse(ref.readPointer(req_ptr, 0, req_len_ptr.deref()));
  }

  if (analysis_len_ptr.deref() > 0) {
    scalars = new Set(ref.readPointer(analysis_ptr, 0, analysis_len_ptr.deref()).toString().split(","));
  }

  ffi.disposeMemory(resp_ptr.deref())
  ffi.disposeMemory(req_ptr.deref())
  ffi.disposeMemory(analysis_ptr.deref())

  return { handle, scalars, response, request };
}

function process_response(instance, handle, data) {
  const input = Buffer.from(data);

  const output_ptr = ref.alloc(ref.refType(pointer));
  const output_len_ptr = ref.alloc(int);

  ffi.process_response(
    instance,
    handle,
    input,
    input.length,
    output_ptr,
    output_len_ptr
  );
  
  const output = ref.readPointer(output_ptr, 0, output_len_ptr.deref());
  const result = JSON.parse(output);
  
  ffi.disposeMemory(output_ptr.deref())
  ffi.disposeHandle(handle)

  return result
}

function get_version() {
  return JSON.parse(ffi.get_version());
}

function disposeHandle(handle) {
  ffi.disposeHandle(handle);
}

function disposeMemory(ptr) {
  ffi.disposeMemory(ptr);
}

function update_schema(handle, schema) {
  const buf = Buffer.from(schema)
  return ffi.update_schema(handle, buf, buf.length);
}

function shutdown(handle) {
  ffi.shutdown(handle);
}

module.exports = {
  InigoConfig,
  check_lasterror,
  copy_querydata,
  create,
  process_service_request_v2,
  process_response,
  get_version,
  disposeHandle,
  disposeMemory,
  update_schema,
  shutdown
};