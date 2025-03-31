import { config } from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parse } from "yaml";
import { InigoPlugin } from 'inigo.js';
import * as url from "url";
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { ApolloServerPluginInlineTrace } from '@apollo/server/plugin/inlineTrace';
import resolvers from "./resolvers.js"

config();
const { INIGO_SERVICE_TOKEN } = process.env;

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const cwd = resolve(__dirname, "..");

const typeDefs = readFileSync(resolve(cwd, "data/schema.graphql"), "utf-8");
const data = parse(readFileSync(resolve(cwd, "data/starwars_data.yaml"), "utf-8"));

const inigoCfg = {
  Token: INIGO_SERVICE_TOKEN,
  Schema: typeDefs,
};

const server = new ApolloServer({
  typeDefs,
  resolvers: resolvers(data),
  plugins: [
    ApolloServerPluginInlineTrace(),
    InigoPlugin(inigoCfg),
  ]
});

startStandaloneServer(server, { listen: { port: 4000 }}).then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
