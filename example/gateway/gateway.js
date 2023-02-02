const { ApolloServer } = require("apollo-server");
const { readFileSync } = require("fs");
const { ApolloGateway } = require("@apollo/gateway");
const { InigoApolloGatewayPlugin, InigoConfig, InigoRemoteDataSource  } = require("./../../index");
const { config } = require("dotenv");

config();

const supergraphSdl = readFileSync('./schema.graphql').toString();

const inigoCfg = new InigoConfig({
  Debug: true,
  Schema: supergraphSdl,
  Token: process.env.INIGO_SERVICE_TOKEN,
});

(async () => {
  let inigo = await InigoApolloGatewayPlugin(inigoCfg);

  const gateway = new ApolloGateway({
    supergraphSdl: supergraphSdl,
    buildService(service) {
      return new InigoRemoteDataSource(inigo.info, service)
    }
  });

  const server = new ApolloServer({
    gateway,
    plugins: [
        inigo.plugin,
    ],
  });

  server.listen().then(({ url }) => {
    console.log(`🚀 Server ready at ${url}`);
  });
})()
