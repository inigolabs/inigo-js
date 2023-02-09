## Inigo Apollo Gateway Demo

This is the example of Inigo integration with Apollo Gateway. Original apollo gateway federation example is located [here](https://github.com/apollographql/federation-demo)

### Getting started

Install dependencies by running the bellow command.

```sh
npm install
```

Start sub-graph services. They can be found at http://localhost:4001, http://localhost:4002, http://localhost:4003, and http://localhost:4004.
```sh
npm run start-services
```

In another terminal window, start the gateway by running this command:

```sh
INIGO_SERVICE_TOKEN=<your-gateway-token> npm run start-gateway
```

Gateway playground can be accessed on http://localhost:4000
