# Updates to the Default Boilerplate for Next.js + Vercel + GraphQL Apollo Server Setup

This document serves as both a guide to integrating Next.js, Vercel routes, and a GraphQL Apollo Server into your project, and a working example to reference.

---

## How to Use

Running the following commands will install the necessary dependencies, build the project, and start the server:

```bash
npm install && npm run build && npm start
```

### How to implement in own project

   Make sure to include both inigo.js and as-integration-next packages in your project.
   
   ```bash
   npm install github:inigolabs/inigo-js
   npm install github:inigolabs/as-integration-next
   ```

   ```javascript
   import { InigoPlugin } from "inigo.js";
   import { startServerAndCreateNextHandler } from "as-integration-next";

   // Example server initialization
   const server = new ApolloServer({
     typeDefs,
     resolvers,
     plugins: [new InigoPlugin()],
   });

   const handler = startServerAndCreateNextHandler(server);

   export { handler as GET, handler as POST };
   ```


### Bundlers

This project depends on koffi.dev ffi library. If you are having deployment issues, i.e, missing libraries related to koffi, Make sure to include `node_modules/koffi` to your bundle. This will add all the necessary libraries for ffi to work properly, regardless of the platform.

You can take a look at the example of bundling in `next.config.js` file.

More info on https://koffi.dev/packaging