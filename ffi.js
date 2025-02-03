const koffi = require('koffi');
const { resolve } = require("path");
const fs = require("fs");

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

const libinigo = "libinigo"
const pf = `inigo-${getOS()}-${getArch()}`;
var ext = ".so" // Linux

if (getOS() == "windows") {
    ext = ".dll"
}

if (getOS() == "darwin") {
    ext = ".dylib"
}

let libraryPath = resolve(__dirname, `../${pf}/${pf}${ext}`);

if (!fs.existsSync(libraryPath)) {
  libraryPath = resolve(process.cwd(), "node_modules", `${pf}/${pf}${ext}`);
}

if (fs.existsSync(libinigo+ext)) {
  libraryPath = libinigo+ext
}

// Use development library
if (process.env.DEVFFI) {
  libraryPath =  resolve(__dirname, `../inigo/dist_ffi/inigo_${getOS()}_${getArch()}/lib${pf}${ext}`);
  console.log(libraryPath);
}

koffi.struct('Config', {
    Debug: 'bool',
    Name: 'string',
    Service: 'string',
    Token: 'string',
    Schema: 'string',
    Runtime: 'string',
    EgressUrl: 'string',
    Gateway: 'uintptr',
    DisableResponseData: 'bool'
});

const lib = koffi.load(libraryPath);
const ffi = {
    create: lib.func('uintptr create(Config* c)'),
    process_service_request_v2: lib.func('uintptr process_service_request_v2(uintptr, char* subgraph_name, int64 subgraph_name_len, char* header, int64 header_len, char* input, int64 input_len, _Out_ char** output, _Out_ int64* output_len, _Out_ char** status_output, _Out_ int64* status_output_len, _Out_ char** analysis, _Out_ int64* analysis_len)'),
    process_response: lib.func('void process_response(uintptr, uint64 reqHandle, char* input, int64 input_len, _Out_ char** output, _Out_ int64* output_len)'),
    get_version: lib.func('string get_version()'),
    update_schema: lib.func('bool update_schema(uintptr, char* input, int input_len)'),
    check_lasterror: lib.func('string check_lasterror()'),
    copy_querydata: lib.func('uintptr copy_querydata(uintptr)'),
    disposeHandle: lib.func('void disposeHandle(uintptr)'),
    disposePinner: lib.func('void disposePinner(uintptr)'),
    shutdown: lib.func('void shutdown(uintptr)'),
    flush: lib.func('void flush(uintptr)'),
};

function create(val) {
    const cfg = { // Maintain struct order
        Debug: val.Debug || false,
        Name: val.Name || '',
        Service: val.Service || '',
        Token: val.Token || '',
        Schema: val.Schema || '',
        Runtime: val.Runtime || '',
        EgressUrl: val.EgressUrl || '',
        Gateway: val.Gateway || 0,
        DisableResponseData: val.DisableResponseData
    }
    return ffi.create(cfg);
}

function check_lasterror() {
    return ffi.check_lasterror();
}

function copy_querydata(val) {
    return ffi.copy_querydata(val);
}

function process_service_request_v2(instance, subgraph, query, header) {
    const subgraphs = Buffer.from(subgraph);
    const headers = Buffer.from(JSON.stringify(header));
    const input = Buffer.from(JSON.stringify(query));

    let output = Buffer.allocUnsafe(8), output_len = [null];
    let status_output = Buffer.allocUnsafe(8), status_output_len = [null];
    let analysis = Buffer.allocUnsafe(8), analysis_len = [null];

    let handle = ffi.process_service_request_v2(
        instance, 
        subgraphs, 
        subgraphs.length, 
        headers, 
        headers.length, 
        input, 
        input.length,
        output,
        output_len,
        status_output,
        status_output_len,
        analysis,
        analysis_len
    );

    let response = null;
    let request = null;
    let scalars = null;

    // response
    if (output_len[0] > 0) {
        response = JSON.parse(koffi.decode(output, 'char*', output_len));
        ffi.disposeHandle(handle);
        output = null;
        status_output = null;
        analysis = null;
        handle = 0;
        return { handle, scalars, response, request };
    }

    // request
    if (status_output_len[0] > 0) {
        request = JSON.parse(koffi.decode(status_output, 'char*', status_output_len));
    }

    // analysis
    if (analysis_len[0] > 0) {
        scalars = new Set(koffi.decode(analysis, 'char*', analysis_len).split(","));
    }

    output = null;
    status_output = null;
    analysis = null;
    ffi.disposePinner(handle);
    return { handle, scalars, response, request };
}

function process_response(instance, handle, data) {
  const input = Buffer.from(data);
  let output = Buffer.allocUnsafe(8), output_len = [null];

  ffi.process_response(
    instance,
    handle,
    input,
    input.length,
    output,
    output_len
  );
  
  let result;
  if (output_len[0] > 0) {
    result = JSON.parse(koffi.decode(output, 'char*', output_len));
  }

  output = null;
  ffi.disposeHandle(handle);
  return result;
}

function get_version() {
  return JSON.parse(ffi.get_version());
}

function disposeHandle(handle) {
  return ffi.disposeHandle(handle);
}

function update_schema(handle, schema) {
  const buf = Buffer.from(schema.toString('base64'))
  return ffi.update_schema(handle, buf, buf.length);
}

function flush(handle) {
  return ffi.flush(handle);
}

function shutdown(handle) {
  return ffi.shutdown(handle);
}

module.exports = {
  check_lasterror,
  copy_querydata,
  create,
  process_service_request_v2,
  process_response,
  get_version,
  disposeHandle,
  update_schema,
  shutdown,
  flush
};