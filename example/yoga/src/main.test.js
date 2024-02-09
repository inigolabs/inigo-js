const { createSchema, createYoga } = require("graphql-yoga");
const { YogaInigoPlugin } = require("inigo.js");
const { buildHTTPExecutor } = require("@graphql-tools/executor-http");
const { parse } = require("graphql");

const typeDefinitions = `
  type Query {
    version: String!
  }
`;

const schema = createSchema({
  typeDefs: typeDefinitions,
  resolvers: {
    Query: {
      version: () => "v0.0.0",
    },
  },
});

describe("yoga-integration", () => {
  test("version", async () => {
    yoga = createYoga({
      schema,
      plugins: [YogaInigoPlugin({ Disabled: true, Schema: typeDefinitions })],
    });
    const executor = buildHTTPExecutor({
      fetch: yoga.fetch,
    });

    const result = await executor({
      document: parse(`query { version }`),
    });

    expect(result.data?.version).toBe("v0.0.0");
  });
});
