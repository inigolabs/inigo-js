const inigo = require("./index");

describe("CountResponseFields", () => {
  let tests = [
    {
      name: "Test 1",
      payload: '{"data":{"key1":"val1","key2":"val2"}}',
      expected: {
        "data": 1,
        "data.key1": 1,
        "data.key2": 1,
        "errors": 0,
      },
      expected_total_counts: {
        "total_objects": 1,
        "errors": 0,
      }
    },
    {
      name: "Test 2",
      payload: '{"data":{"key":[]}}',
      expected: {
        "data": 1,
        "errors": 0,
      },
      expected_total_counts: {
        "total_objects": 1,
        "errors": 0,
      }
    },
    {
      name: "Test 3",
      payload:
        '{"data":{"key1":[["val1.0","val1.1","val1.2"],["val1.0","val1.1",["v1","v2"]]],"key2":["val2.0","val2.1"]}}',
      expected: {
        "data": 1,
        "data.key1": 7,
        "data.key2": 2,
        "errors": 0,
      },
      expected_total_counts: {
        "total_objects": 1,
        "errors": 0,
      }
    },
    {
      name: "Test 4",
      payload:
        '{"data":{"key1":["val1.0","val1.1"],"key2":["val2.0","val2.1"]}}',
      expected: {
        "data": 1,
        "data.key1": 2,
        "data.key2": 2,
        "errors": 0,
      },
      expected_total_counts: {
        "total_objects": 1,
        "errors": 0,
      }
    },
    {
      name: "Test 5",
      payload: '{"data":[{"key":"val"},{"key":"val"}]}',
      expected: {
        "data": 2,
        "data.key": 2,
        "errors": 0,
      },
      expected_total_counts: {
        "total_objects": 2,
        "errors": 0,
      }
    },
    {
      name: "Test 6",
      payload: '{"data":null}',
      expected: {
        "data": 1,
        "errors": 0,
      },
      expected_total_counts: {
        "total_objects": 0,
        "errors": 0,
      }
    },
    {
      name: "Test 7",
      payload:
        '{"data":{"first":[{"key":"val"},{"key":"val"}],"second":[{"key":"val"},{"key":"val"}]}}',
      expected: {
        "data": 1,
        "data.first": 2,
        "data.first.key": 2,
        "data.second": 2,
        "data.second.key": 2,
        "errors": 0,
      },
      expected_total_counts: {
        "total_objects": 5,
        "errors": 0,
      }
    },
    {
      name: "Test 8",
      payload:
        '{"data":{"first":[{"key1":"val"},{"key2":"val"}],"second":[{"key1":"val"},{"key2":"val"}]}}',
      expected: {
        "data": 1,
        "data.first": 2,
        "data.first.key1": 1,
        "data.first.key2": 1,
        "data.second": 2,
        "data.second.key1": 1,
        "data.second.key2": 1,
        "errors": 0,
      },
      expected_total_counts: {
        "total_objects": 5,
        "errors": 0,
      }
    },
    {
      name: "Test 9",
      payload:
        '{"data":{"first":[{"key":"val","key1":"val"},{"key":"val","key2":"val"}],"second":[{"key":"val","key1":"val"},{"key":"val","key2":"val"}]}}',
      expected: {
        "data": 1,
        "data.first": 2,
        "data.first.key": 2,
        "data.first.key1": 1,
        "data.first.key2": 1,
        "data.second": 2,
        "data.second.key": 2,
        "data.second.key1": 1,
        "data.second.key2": 1,
        "errors": 0,
      },
      expected_total_counts: {
        "total_objects": 5,
        "errors": 0,
      }
    },
    {
      name: "Test 10",
      payload:
        '{"data":{"first":[{"key":"val","key1":{"first":[{"key":"val","key1":"val"},{"key":"val","key2":"val"}]}},["ignore",{"nested":"val"}],{"key":"val","key2":"val"}],"second":[{"key":[{"first":[{"key":"val","key1":"val"},{"key":"val","key2":"val"}]}],"key1":"val"},{"key":"val","key2":"val"}]}}',
      expected: {
        "data": 1,
        "data.first": 4,
        "data.first.key": 2,
        "data.first.key1": 1,
        "data.first.key1.first": 2,
        "data.first.key1.first.key": 2,
        "data.first.key1.first.key1": 1,
        "data.first.key1.first.key2": 1,
        "data.first.key2": 1,
        "data.first.nested": 1,
        "data.second": 2,
        "data.second.key": 2,
        "data.second.key.first": 2,
        "data.second.key.first.key": 2,
        "data.second.key.first.key1": 1,
        "data.second.key.first.key2": 1,
        "data.second.key1": 1,
        "data.second.key2": 1,
        "errors": 0,
      },
      expected_total_counts: {
        "total_objects": 12,
        "errors": 0,
      }
    },
  ];

  for (const t of tests) {
    test(
      t.name,
      () => {
        expect(inigo.countResponseFields(JSON.parse(t.payload))).toEqual(t.expected)
        expect(inigo.responseCounts(JSON.parse(t.payload))).toEqual(t.expected_total_counts)
      }
    );
  }
});
