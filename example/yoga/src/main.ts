import { createServer } from "http";
import { createYoga } from "graphql-yoga";
import { YogaInigoPlugin } from "inigo.js";
import { makeExecutableSchema } from "@graphql-tools/schema";

export const typeDefinitions = /* GraphQL */ `
  type Query {
    hello: String!
    version: String!
  }

  type Subscription {
    countdown(from: Int!): Int!
  }
`;

const resolvers = {
  Query: {
    hello: () => "Hello World!",
    version: () => "local-0.1.0",
  },
  Subscription: {
    countdown: {
      // This will return the value on every 1 sec until it reaches 0
      subscribe: async function* (_: any, { from }: { from: number }) {
        for (let i = from; i >= 0; i--) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          yield { countdown: i };
        }
      },
    },
  },
};

export const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: [typeDefinitions],
});

const token = "your-inigo-token";

function main() {
  const yoga = createYoga({
    schema,
    plugins: [YogaInigoPlugin(token, typeDefinitions)],
  });
  const server = createServer(yoga);
  server.listen(4000, () => {
    console.info("Server is running on http://localhost:4000/graphql");
  });
}

main();
