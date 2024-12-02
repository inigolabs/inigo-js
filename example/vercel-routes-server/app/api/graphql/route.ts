import { ApolloServer } from "@apollo/server";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { InigoPlugin, startServerAndCreateNextHandler } from "inigo.js";
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { schema, typeDefs } from "../../../shared/schema";

const server = new ApolloServer({
  schema,
  plugins: [
    InigoPlugin({
      Schema: typeDefs
    }),
    ApolloServerPluginLandingPageLocalDefault()
  ],
  introspection: true,
});

const handler = startServerAndCreateNextHandler(server);

export { handler as GET, handler as POST };
