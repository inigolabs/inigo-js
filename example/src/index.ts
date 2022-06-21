import { ApolloServer, gql } from 'apollo-server';
import { config } from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parse } from "yaml";
import { InigoPlugin, InigoConfig } from 'inigo.js';
import * as url from "url";
import { ApolloServerPluginLandingPageGraphQLPlayground } from 'apollo-server-core';
import resolvers from "./resolvers.js"

config();
const { 
  INIGO_SCHEMA_PATH, 
  INIGO_DATA_PATH, 
  INIGO_PORT, 
  INIGO_SERVICE_TOKEN,
} = process.env;

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const typeDefs = readFileSync(resolve(__dirname, "..", "data", INIGO_SCHEMA_PATH), "utf-8");
const data = parse(readFileSync(resolve(__dirname, "..", "data", INIGO_DATA_PATH), "utf-8"));

const inigoCfg = new InigoConfig({
  Debug: false,
  Token: INIGO_SERVICE_TOKEN,
  Schema: typeDefs
});

const server = new ApolloServer({
  debug: false,
  typeDefs,
  resolvers: resolvers(data),
  introspection: true,
  plugins: [
    InigoPlugin(inigoCfg),
    ApolloServerPluginLandingPageGraphQLPlayground(),
  ]
});

server.listen({ port: INIGO_PORT ? Number(INIGO_PORT) : undefined }).then((url) => {
  console.log(`🚀 Server ready at http://localhost:${url.port}${server.graphqlPath}`);
});