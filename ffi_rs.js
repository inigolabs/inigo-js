const { DataType, open,  define, createPointer, restorePointer, freePointer } = require('ffi-rs')
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
if (fs.existsSync(libinigo+ext)) {
  libraryPath = libinigo+ext
}

open({
  library: libinigo, 
  path: libraryPath
})

const ffi = define({
  create: {
    library: libinigo,
    retType: DataType.U64,
    paramsType: [{
      Debug: DataType.Boolean,
      Name: DataType.String,
      Service: DataType.String,
      Token: DataType.String,
      Schema: DataType.String,
      Runtime: DataType.String,
      EgressUrl: DataType.String,
      Gateway: DataType.U64,
      DisableResponseData: DataType.Boolean,
    }],
  },
  process_service_request_v2: {
    library: libinigo,
    funcName: "process_service_request_v2",
    retType: DataType.U64,
    paramsType: [
      DataType.U64, // request handle
      DataType.U8Array, DataType.I64, // subgraph name
      DataType.U8Array, DataType.I64, // header
      DataType.U8Array, DataType.I64, // query
      DataType.External, DataType.External, // result
      DataType.External, DataType.External, // status
      DataType.External, DataType.External, // analysis
    ],
  },
  process_response: {
    library: libinigo,
    retType: DataType.Void,
    paramsType: [ 
      DataType.U64,       // instance
      DataType.U64,       // handle
      DataType.U8Array,   // input
      DataType.I64,       // input.length
      DataType.External,  // output_ptr[0] 
      DataType.External   // output_ptr[1]
    ],
  },
  get_version: {
    library: libinigo,
    retType: DataType.String,
    paramsType: [],
  },
  disposeHandle: {
    library: libinigo,
    retType: DataType.Void,
    paramsType: [ DataType.U64 ],
  },
  disposeMemory: {
    library: libinigo,
    retType: DataType.Void,
    paramsType: [ DataType.Void ],
  },
  update_schema: {
    library: libinigo,
    retType: DataType.Bool,
    paramsType: [ DataType.U64, DataType.String, DataType.I64 ],
  },
  check_lasterror: {
    library: libinigo,
    retType: DataType.String,
    paramsType: [],
  },
  shutdown: {
    library: libinigo,
    retType: DataType.Void,
    paramsType: [ DataType.U64 ],
  },
  copy_querydata: {
    library: libinigo,
    retType: DataType.U64,
    paramsType: [ DataType.U64 ],
  },
});

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
  return ffi.create([cfg]);
}

function check_lasterror() {
  return ffi.check_lasterror([]);
}

function copy_querydata(val) {
  return ffi.copy_querydata([val]);
}

function process_service_request_v2(instance, subgraph, query, header) {
  const retType = [DataType.String, DataType.I64];
  const subgraphs = Buffer.from(subgraph);
  const headers = Buffer.from(JSON.stringify(header));
  const input = Buffer.from(JSON.stringify(query));

  const externalPtr = createPointer({
    paramsType: [
      DataType.String, DataType.I64, // response
      DataType.String, DataType.I64, // request
      DataType.String, DataType.I64  // analysis
    ],
    paramsValue: [
      "", 0, 
      "", 0, 
      "", 0
    ]
  })

  const handle = ffi.process_service_request_v2([
    instance, 
    subgraphs, 
    subgraphs.length, 
    headers, 
    headers.length, 
    input, 
    input.length,
    externalPtr[0],
    externalPtr[1],
    externalPtr[2],
    externalPtr[3],
    externalPtr[4],
    externalPtr[5]
  ]);

  let response = null;
  let request = null;
  let scalars = null;

  const external = restorePointer({ paramsValue: externalPtr, retType: retType })

  // response
  if (external[1] > 0) {
    response = JSON.parse(external[0].substring(0, external[1]));
  }

  // request
  if (external[3] > 0) {
    request = JSON.parse(external[2].substring(0, external[3]));
  }

  // analysis
  if (external[5] > 0) {
    scalars = new Set(external[4].substring(0, external[5]).split(","));
  }
  
  freePointer(externalPtr);

  return { handle, scalars, response, request };
}

function process_response(instance, handle, data) {

  const input = Buffer.from(data);

  const retType = [DataType.String, DataType.I64];
  const output_ptr = createPointer({
    paramsType: retType,
    paramsValue: ["", 0]
  })

  ffi.process_response([
    instance,
    handle,
    input,
    input.length,
    output_ptr[0],
    output_ptr[1]
  ]);
  
  let result;
  const output = restorePointer({ paramsValue: output_ptr, retType: retType })
  if (output[1] > 0) {
    result = JSON.parse(output[0].substring(0, output[1]));
  }

  freePointer(output_ptr);
  ffi.disposeHandle([handle])

  return result
}

function get_version() {
  return JSON.parse(ffi.get_version([]));
}

function disposeHandle(handle) {
  return ffi.disposeHandle(handle);
}

function disposeMemory(ptr) {
  return ffi.disposeMemory(ptr);
}

function update_schema(handle, schema) {
  const buf = Buffer.from(schema.toString('base64'))
  return ffi.update_schema(handle, buf, buf.length);
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
  disposeMemory,
  update_schema,
  shutdown
};