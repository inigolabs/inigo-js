import { ApolloServer, gql } from 'apollo-server';
import { config } from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parse } from "yaml";
import { InigoPlugin, InigoConfig } from 'inigo.js';
import * as url from "url";
import resolvers from "./resolvers.js"

config();
const { INIGO_SERVICE_TOKEN } = process.env;

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const cwd = resolve(__dirname, "..");

const typeDefs = readFileSync(resolve(cwd, "data/schema.graphql"), "utf-8");
const data = parse(readFileSync(resolve(cwd, "data/starwars_data.yaml"), "utf-8"));

const inigoCfg = new InigoConfig({
  Token: INIGO_SERVICE_TOKEN,
  Schema: typeDefs,
  DisableResponseMerge: false,
});

const server = new ApolloServer({
  debug: false,
  typeDefs,
  resolvers: resolvers(data),
  plugins: [
    InigoPlugin(inigoCfg),
  ]
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
