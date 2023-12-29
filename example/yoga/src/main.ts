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

const token =
  "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOm51bGwsInRva2VuVHlwZSI6InNlcnZpY2VfdG9rZW4iLCJ1c2VyX3Byb2ZpbGUiOiJzaWRlY2FyIiwidXNlcl9yb2xlcyI6WyJzaWRlY2FyIl0sInVzZXJfaWQiOjE5LCJ1c2VyX25hbWUiOiJJbmlnby95b2dhIiwib3JnX2lkIjozLCJ0b2tlbiI6ImRhNDVjYmMwLTkwODEtNGIxMC1iMjRlLTlkMjEyOWQ0NjZhYiIsImVuY3J5cHRpb25fa2V5IjoicEFzU3A0T1IrelpsV2xoK0FURmgyOGVFNWxhN1NCVlFiWEhYUmtMY3FqQT0iLCJpYXQiOjE3MDQyMTQwODIsInN1YiI6InlvZ2EifQ.mAP_vZ6n82nlvjzEV11et47V20Rq52IziD4f4s0bSFCGsUl9BtBsG4rh55IBxcrs29dpvx_XZ8z-WkftS0OYsg";

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
