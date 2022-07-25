<br />
<div align="center">
  <img src="./docs/inigo.svg">
  <img src="./docs/js.svg">

  <p align="center">
    An Apollo GraphQL Middleware
    <br />
    <!-- <a href="https://github.com/github_username/repo_name"><strong>Explore the docs »</strong></a> <br /> <br />  -->
    <a href="https://inigo.io">Homepage</a>
    ·
    <a href="https://github.com/inigolabs/inigo-js/tree/master/example">View an example</a>
    ·
    <a href="https://github.com/inigolabs/inigo-js/issues">Report Bug</a>
  </p>
</div>

## Getting Started

### Prerequisites

A working development environment is always preferred with a stable node.js and build essentials
* having setup an inigo account and created a service token
* having already worked with the inigo cli to apply configurations
* nodejs & npm: https://nodejs.org
* gcc (in case the ffi module is not prebuilt for your platform)

### Installation

1. Install inigo.js middleware
   ```sh
   npm install inigo.js
   ```
2. Install your platform specific library, available libraries:
   ```sh
   # inigo-alpine-amd64, inigo-win-amd64 inigo-darwin-amd64, inigo-darwin-arm64
   npm install inigo-linux-amd64 
   ```
### Configuration
1. Import inigo.js modules
    ```js
    import { InigoPlugin, InigoConfig } from 'inigo.js'; // ES6
    const { InigoPlugin, InigoConfig } = require('inigo.js'); // CommonJS
    ```
2. Create an inigo config object
    ```js
    const inigoCfg = new InigoConfig({
        Token: "eyJhbGc..", // Input token generated using inigo cli or web panel
        Schema: typeDefs // String based SDL format GraphQL Schema
    });
    ```

    For runtime generated type definitions, [GraphQL.js](https://www.npmjs.com/package/graphql) utilities can be utilized for conversion:
    ```js
    import { printSchema } from 'graphql'; // ES6
    const { printSchema } = require('graphql'); // CommonJS
    ```

    ```js
    const inigoCfg = new InigoConfig({
        Token: "eyJhbGc..", // Input token generated using inigo cli or web panel
        Schema: printSchema(typeDefs) // Convert GraphQLSchema object to SDL format
    });
    ```
3. Plugging-in the middleware
    ```js
    const server = new ApolloServer({
        typeDefs,
        resolvers,
        introspection: true,
        plugins: [
            InigoPlugin(inigoCfg), // <------
        ]
    });
    ```

4. Your final configuration should look like the following example
    ```js
    const { ApolloServer } = require('apollo-server');
    const { InigoPlugin, InigoConfig } = require('inigo.js'); // <---

    const typeDefs = `
        type Query {
            hello: String
        }
    `;

    const resolvers = {
        Query: {
            hello: () => 'world',
        },
    };

    const inigoCfg = new InigoConfig({  // <---
        Token: "eyJhbGc..",             // <---
        Schema: typeDefs                // <---
    });                                 // <---

    const server = new ApolloServer({
        typeDefs,
        resolvers,
        introspection: true,
        plugins: [                      // <---
            InigoPlugin(inigoCfg),      // <---
        ]                               // <---
    });

    server.listen().then(({ url }) => {
        console.log(`🚀 Server ready at ${url}`);
    });
    ```

## Passing Authentication
1. Configure and apply your `service.yml`
```yaml
kind: Service
name: starwars
spec:
  path_user_id: ctx.user_name         # jwt.user_name
  path_user_profile: ctx.user_profile # jwt.user_profile
  path_user_role: ctx.user_roles      # jwt.user_roles
```

2. Configure `ApolloServer` to pass in an `inigo` object within context containing either your jwt from headers or your data from context. 
> Note: `jwt` is always prioritized when found with `ctx` or other.
```js
const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true,
  plugins: [
    InigoPlugin(inigoCfg),
  ],
  context: async ({ req }) => {
    return { 
      inigo: {
        // jwt: req.headers.authorization ?? "" // Enable for passing jwt from headers
        ctx: {
          // Important to have object names identical to what was referenced in the service.yml
          user_name: "yoda", 
          user_profile: "admin",
          user_roles: [ "producer", "director", "actor", "viewer" ],
        }
      }
    }
  }
);
```

## Logging blocked requests
```js
const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true,
  plugins: [
    InigoPlugin(inigoCfg),
    LogInigoBlockedRequests() // <---
  ],
}

function LogInigoBlockedRequests() { // <---
  return { 
    async requestDidStart({ context } /* : { context: InigoContext } */) {
      return {
        async didEncounterErrors({ errors }) {
          // check for `blocked` state
          if (!context.inigo.blocked) return; 

          // Print the request processing result
          console.log("Inigo blocked request:", context.inigo.result); 
        }
      };
    }
  }
}
```

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

## License
Distributed under the MIT License.