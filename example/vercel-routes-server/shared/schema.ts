import { makeExecutableSchema } from "@graphql-tools/schema";

export const typeDefs = `
  type Query {
    users: [User!]!
    user(username: String): User
  }
  type User {
    name: String
    username: String
  }
`;

const users = [
  { name: "Leeroy Jenkins", username: "leeroy" },
  { name: "Foo Bar", username: "foobar" },
];

export const resolvers = {
  Query: {
    users() {
      return users;
    },
    user(parent, { username }) {
      return users.find((user) => user.username === username);
    },
  },
};

export const schema = makeExecutableSchema({ typeDefs, resolvers });