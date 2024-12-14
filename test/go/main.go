package main

/*
#include <stdlib.h>
#include <stdint.h>

typedef struct {
    int64_t Integer;
	double Double;
	char* Str;
} X;

typedef void (*fn_ptr)();
static inline void call_out(fn_ptr ptr, int data) {
    (ptr)(data);
}
*/
import "C"

import (
	"fmt"
	"unsafe"
)

func main() {}

//export add
func add(a, b int) int {
	return a + b
}

//export add_result
func add_result(a, b int, result *int) {
	*result = a + b
}

//export echo_string
func echo_string(data *C.char) *C.char {
	return C.CString(C.GoString(data))
}

//export echo_struct
func echo_struct(data *C.X) *C.X {
	s := (*C.X)(C.malloc(C.size_t(unsafe.Sizeof(C.X{})))) // Allocate from C, don't forget to free on the receiver part
	s.Integer = C.int64_t(int64(data.Integer))
	s.Double = C.double(float64(data.Double))
	s.Str = C.CString(C.GoString(data.Str))
	return s
}

//export set_value
func set_value(val *int) {
	*val = 42
}

//export set_string
func set_string(val **C.char, len_ *int) {
	str := "🚁💥!"
	*val = C.CString(str)
	*len_ = len(str)
}

//export echo_bytes
func echo_bytes(input *C.char, input_len int, output **C.char, output_len *int) { //) bool { //
	// slice := unsafe.Slice(input, input_len) // No copying, Go 1.17
	slice := (*[1 << 28]byte)(unsafe.Pointer(input))[:input_len:input_len] // No copying
	// slice := C.GoBytes(unsafe.Pointer(input), C.int32_t(input_len)) // Copying

	// copy for testing purposes, we need different pointers
	str := []byte(string(slice))

	*output = (*C.char)(unsafe.Pointer(&str[0])) // No copying, though still needs manual free
	//*output = (*C.char)(C.CBytes(str)) // Copying, C allocated, requires manual free
	*output_len = len(slice)
}

//export read_buffer
func read_buffer(input **C.char, input_len int) {
	slice := (*[1 << 28]byte)(unsafe.Pointer(input))[:input_len:input_len] // No copying
	fmt.Println(string(slice))
}
