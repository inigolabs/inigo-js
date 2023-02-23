const { ApolloServer } = require("@apollo/server");
const { startStandaloneServer } = require("@apollo/server/standalone");
const { ApolloGateway, IntrospectAndCompose } = require("@apollo/gateway");
const { InigoPlugin, InigoRemoteDataSource, InigoFetchGatewayInfo } = require("inigo.js");
const { config } = require("dotenv");

config();

const supergraphSdl = new IntrospectAndCompose({
  subgraphs: [
    { name: "accounts", url: "http://localhost:4001/graphql" },
    { name: "reviews", url: "http://localhost:4002/graphql" },
    { name: "products", url: "http://localhost:4003/graphql" },
    { name: "inventory", url: "http://localhost:4004/graphql" },
  ],
});

// INIGO: use InigoRemoteDataSource instead of RemoteGraphQLDataSource.
// INIGO: instead of 'willSendRequest' and 'didReceiveResponse' use callbacks 'onBeforeSendRequest' and 'onAfterReceiveResponse'.
// INIGO: Signatures of callbacks are same.
class CustomRemoteDataSource extends InigoRemoteDataSource {
  async onBeforeSendRequest({ request, context }) {
    if (context.req && context.req.headers) {
      // pass all headers to subgraph
      Object.keys(context.headers || []).forEach(key => {
        if (context.headers[key]) {
          request.http.headers.set(key, context.headers[key]);
        }
      });
    }
  }

  async onAfterReceiveResponse({ request, response , context }) {
    console.log(context.inigo.blocked) // log request status

    return response // return response if it was modified
  }
}

function logHeadersAndOpPlugin() {
  return {
    requestDidStart: () => ({
      async didResolveOperation(requestContext) {
        console.log("headers: ", requestContext.request.http.headers)
        console.log("operation: ", requestContext.operation.operation)
      },
    }),
  };
}

(async () => {
  // INIGO: execute InigoFetchGatewayInfo as early as possible and use the result as a param for your custom data source.
  const info = await InigoFetchGatewayInfo();

  const gateway = new ApolloGateway({
    supergraphSdl: supergraphSdl,
    buildService(service) {
      return new CustomRemoteDataSource(info, service) // INIGO: this is required to get sub-graph visibility.
    }
  })

  const server = new ApolloServer({
    gateway: gateway,
    plugins: [
      InigoPlugin(), // INIGO: this line creates the parent Inigo plugin instance, required for Inigo sub-graph to work.
      logHeadersAndOpPlugin(),
    ],
  });

  const { url } = await startStandaloneServer(server, {
    context: async ({ req }) => ({ req }),
  });

  console.log(`🚀 Server ready at ${url}`);
})()
