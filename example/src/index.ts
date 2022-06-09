import { ApolloServer, gql } from 'apollo-server-fastify';
import fastify from 'fastify';
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { parse } from "yaml";
import { IResolvers, ISchemaLevelResolver } from '@graphql-tools/utils';
import { buildSchema, printSchema, Kind } from "graphql"; // printType, printSchema, GraphQLSchema
import { EdgesMaps } from './types.js';
import { GraphQLInterfaceTypeNormalizedConfig, GraphQLScalarType } from "graphql/type/definition.js";
import { InigoPlugin, InigoConfig } from 'inigo.js';
import * as url from "url";
import { 
  ApolloServerPluginLandingPageGraphQLPlayground,
  ApolloServerPluginLandingPageDisabled
} from 'apollo-server-core';

config();

const { 
  INIGO_SCHEMA_PATH, 
  INIGO_DATA_PATH, 
  INIGO_PORT, 
  INIGO_SERVICE_TOKEN,
  INIGO_GRAPHQL_ROUTE,
  INIGO_GRAPHQL_PLAYGROUND_ROUTE,
} = process.env;

const convertKeysToCamelCase = (obj: any) => {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => {
    return [
      key.replace(/([-_][a-z])/g, group => group
        .toUpperCase()
        .replace('-', '')
        .replace('_', '')
      ),
      value
    ];
  }))
}

const getResolver = (sourceType: string): ISchemaLevelResolver<any, any> => {
  const map = EdgesMaps[sourceType];

  return (source, args, context, info) => {
    const returnType = info.returnType.toString().replace(/\[|\]|\!/g, "");
    const edge = map[returnType];
    const collection = returnType.toLowerCase();

    let nodes = source.edges[edge];

    if (!nodes) {
      nodes = data[collection].map((item, id) => ({ id, ...item })).filter(item => item.edges[EdgesMaps[returnType][sourceType]]?.includes(source.id)).map(item => item.id);
    }

    return nodes.map(id => convertKeysToCamelCase({ id, ...data[collection][id] }));
  }
};

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const cwd = resolve(__dirname, "..");

const typeDefs = readFileSync(resolve(cwd, "data", INIGO_SCHEMA_PATH), "utf-8");
const data = parse(readFileSync(resolve(cwd, "data", INIGO_DATA_PATH), "utf-8"));

const resolvers: IResolvers = {
  Query: {
    films: () => data.film.map((obj, id) => convertKeysToCamelCase({ id, ...obj })),
    people: () => data.person.map((obj, id) => convertKeysToCamelCase({ id, ...obj })),
    planets: () => data.planet.map((obj, id) => convertKeysToCamelCase({ id, ...obj })),
    species: () => data.species.map((obj, id) => convertKeysToCamelCase({ id, ...obj })),
    starships: () => data.starship.map((obj, id) => convertKeysToCamelCase({ id, ...obj })),
    vehicles: () => data.vehicle.map((obj, id) => convertKeysToCamelCase({ id, ...obj })),
  },
  Film: {
    characters: getResolver("Film"),
    planets: getResolver("Film"),
    species: getResolver("Film"),
    starships: getResolver("Film"),
    vehicles: getResolver("Film"),
  },
  Person: {
    pilotedStarship: getResolver("Person"),
    pilotedVehicle: getResolver("Person"),
    appearedIn: getResolver("Person"),
    type: getResolver("Person"),
    fromPlanet: getResolver("Person"),
  },
  Planet: {
    homeTo: getResolver("Planet"),
    appearedIn: getResolver("Planet"),
    originOf: getResolver("Planet"),
  },
  Species: {
    originatesFrom: getResolver("Species"),
    appearedIn: getResolver("Species"),
    includesPerson: getResolver("Species"),
  },
  Starship: {
    appearedIn: getResolver("Starship"),
    pilotedBy: getResolver("Starship"),
  },
  Vehicle: {
    appearedIn: getResolver("Vehicle"),
    pilotedBy: getResolver("Vehicle"),
  }
};

const inigoCfg = new InigoConfig({
  Debug: true,
  Token: INIGO_SERVICE_TOKEN,
  Schema: typeDefs
});

const app = fastify();
const server = new ApolloServer({
  debug: false,
  typeDefs,
  resolvers,
  introspection: true,
  plugins: [
    InigoPlugin(inigoCfg),
    ApolloServerPluginLandingPageDisabled(),
  ]
});
await server.start();
app.register(server.createHandler({ path: INIGO_GRAPHQL_ROUTE }));

// Setup playground
const pg = new ApolloServer({
  typeDefs,
  plugins: [
    ApolloServerPluginLandingPageGraphQLPlayground({ endpoint: INIGO_GRAPHQL_ROUTE }),
  ]
});
await pg.start();
app.register(pg.createHandler({path: INIGO_GRAPHQL_PLAYGROUND_ROUTE, disableHealthCheck: true }));


app.listen({ port: INIGO_PORT ? Number(INIGO_PORT) : undefined }).then((url) => {
  console.log(`🚀 Server ready at ${url}${server.graphqlPath}`);
});