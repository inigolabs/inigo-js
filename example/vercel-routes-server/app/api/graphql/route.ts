import { ApolloServer } from "@apollo/server";
import { InigoPlugin } from "inigo.js";
import { startServerAndCreateNextHandler } from "@as-integrations/next";
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
