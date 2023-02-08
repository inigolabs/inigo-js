<br />
<div align="center">
  <img src="https://raw.githubusercontent.com/inigolabs/inigo-js/master/docs/inigo.svg">
  <img src="https://raw.githubusercontent.com/inigolabs/inigo-js/master/docs/js.svg">

  <p align="center">
    GraphQL Middleware
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
* having [setup](app.inigo.io) an inigo account and created a service token
* nodejs & npm: https://nodejs.org
* gcc (in case the ffi module is not prebuilt for your platform)

### Installation

1. Install the `inigo.js` middleware package
   ```sh
   npm install inigo.js
   ```
2. Install your platform specific library:
    
    #### Available libraries:
    ```
    - inigo-linux-amd64
    - inigo-linux-arm64
    - inigo-darwin-amd64
    - inigo-darwin-arm64
    - inigo-windows-amd64
    - inigo-windows-arm64
    ```
    For example, install `inigo-linux-amd64`
    ```sh
    npm install inigo-linux-amd64 
    ```

### Usage
The simplest setup looks like the example below.

```js
import { ApolloServer } from 'apollo-server';
import { InigoPlugin } from 'inigo.js';

// ...

const server = new ApolloServer({
   // ...
   plugins: [
      InigoPlugin()
   ]
   // ...
});
```
Start your app with `INIGO_SERVICE_TOKEN` passed as an environment variable.
GraphQL schema will be fetched from the server on startup.
```shell
INIGO_SERVICE_TOKEN=<inigo-service-token> npm start
```

### Configuration
1. Import `InigoPlugin` & `InigoConfig` from `inigo.js` module
    ```js
    import { InigoPlugin, InigoConfig } from 'inigo.js';
    ```

    - ### For predefined GraphQL schema definitions
      - Create an inigo config object
        ```js
        const inigoCfg = new InigoConfig({
            Token: "eyJhbGc..", // Input token generated using inigo cli or web panel
            Schema: typeDefs // String based SDL format GraphQL Schema
        });
        ```

    - ### For runtime-generated GraphQL schema definitions
      [GraphQL.js](https://www.npmjs.com/package/graphql) utilities can be utilized for conversion.

      1. Install the `graphql` package
          ```sh
          npm install graphql
          ```

      2. Import `printSchema` from `graphql` package
          ```js
          import { printSchema } from 'graphql';
          ```
      
      3. Create an inigo config object
          ```js
          const inigoCfg = new InigoConfig({
              Token: "eyJhbGc..", // Input token generated using inigo cli or web panel
              Schema: printSchema(typeDefs) // Convert GraphQLSchema object to SDL format
          });
          ```

3. Plug in the middleware by adding the following to `plugins` within `ApolloServer`
    ```js
    InigoPlugin(inigoCfg)
    ```

    Result:
    ```js
    const server = new ApolloServer({
        typeDefs,
        resolvers,
        introspection: true,
        plugins: [
            InigoPlugin(inigoCfg) // <---
        ]
    });
    ```

4. Your final configuration should look like the following example
    ```js
    import { ApolloServer } from 'apollo-server';
    import { InigoPlugin, InigoConfig } from 'inigo.js'; // <---

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
            InigoPlugin(inigoCfg)       // <---
        ]                               // <---
    });

    server.listen().then(({ url }) => {
        console.log(`🚀 Server ready at ${url}`);
    });
    ```

## Passing Authentication using JWT header
  1. Configure and apply your `service.yml`
  ```yaml
  kind: Service
  name: starwars
  spec:
    path_user_id: jwt.user_name
    path_user_profile: jwt.user_profile
    path_user_role: jwt.user_roles
  ```

  2. Configure `ApolloServer` to pass in an `inigo` object within context containing the `jwt` from the request headers. 
  > Note: `jwt` is always prioritized when found with `ctx` or other.
  ```js
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true,
    plugins: [
      InigoPlugin(inigoCfg)
    ],
    context: async ({ req }) => {
      return { 
        inigo: {
          jwt: req.headers.authorization ?? ""
        }
      }
    }
  );
  ```

## Passing Authentication using Context

  1. Configure and apply your `service.yml`
  ```yaml
  kind: Service
  name: starwars
  spec:
    path_user_id: ctx.user_name
    path_user_profile: ctx.user_profile
    path_user_role: ctx.user_roles
  ```

  2. Configure `ApolloServer` to pass in an `inigo` object containing context.
  > Note: `jwt` is always prioritized when found with `ctx` or other.

  > Note: It's important to have object names identical to what was referenced in the service.yml
  ```js
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true,
    plugins: [
      InigoPlugin(inigoCfg)
    ],
    context: async ({ req }) => {
      return { 
        inigo: {
          ctx: {
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

## Docker Image Limitation
Alpine-based docker images are not supported, since Alpine project uses `musl` as the implementation for the C standard library.

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

## License
Distributed under the MIT License.