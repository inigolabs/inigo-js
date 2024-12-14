const koffi = require('koffi');
const assert = require('assert');

const mainLib = koffi.load(__dirname+'/go/main.so');

describe('Koffi Tests', function() {
    it('should add two numbers', function() {
        const Add = mainLib.func('int add(int a, int b)');
        const result = Add(5, 7);
        assert.strictEqual(result, 12);
    });

    it('should add two numbers and return result by pointer', function() {
        const AddResult = mainLib.func('int add_result(int a, int b, _Out_ int* result)');
        const sum = [null];
        AddResult(5, 7, sum);
        assert.strictEqual(sum[0], 12);
    });

    it('should echo a string', function() {
        const EchoString = mainLib.func('char* echo_string(char* str)');
        const str = "Hello, World!";
        const result = EchoString(str);
        assert.strictEqual(result, str);
    });

    it('should echo a struct', function() {
        const X = koffi.struct('X', {
            Integer: 'int64_t',
            Double: 'double',
            Str: 'char*',
        });
        const EchoStruct = mainLib.func('X* echo_struct(X* data)');
        const input = {
            Integer: 42,
            Double: 3.14,
            Str: "Test String"
        };
        const result = EchoStruct(input);
        const output = koffi.decode(result, X);
        assert.deepStrictEqual(output, input);
    });

    it('should set a value by pointer', function() {
        const result = [null];
        const setValue = mainLib.func('void set_value(_Out_ int* result)');
        setValue(result);
        assert.strictEqual(result[0], 42);
    });

    it('should set a string by pointer', function() {
        const setString = mainLib.func('void set_string(_Out_ char** result, _Out_ int* length)');
        const result = Buffer.alloc(8), len = [null];
        setString(result, len);
        assert.strictEqual(koffi.decode(result, 'char*', len[0]), "🚁💥!");
    });

    it('should read a buffer', function() {
        const readBuffer = mainLib.func('void read_buffer(char** buffer, int length)');
        const buf = Buffer.from("Hello World!");
        readBuffer(buf, buf.length);
        // No assertion needed, just ensure no errors
    });

    it('should echo bytes', function() {
        const echoBytes = mainLib.func('void echo_bytes(char* buffer, int length, _Out_ char** result, _Out_ int* length)');
        const result = Buffer.allocUnsafe(8), len = [null];
        const buf = Buffer.from("Hello World!");
        echoBytes(buf, buf.length, result, len);
        assert.strictEqual(koffi.decode(result, 'char*', len[0]), "Hello World!");
    });

    it('should benchmark add function', async function() {
        const Add = mainLib.func('int add(int a, int b)');
        const iterations = 1000000;
        for (let i = 0; i < iterations; i++) {
            Add(5, 7);
        }
    });
});
