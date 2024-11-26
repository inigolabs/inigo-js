# Updates to the Default Boilerplate for Next.js + Vercel + GraphQL Apollo Server Setup

This document outlines the changes made to the default boilerplate to address deployment and data handling issues when integrating Next.js, Vercel routes, and a GraphQL Apollo Server.

---

## **Changes Overview**

### **#1 Vercel Route - Deploy Issue**

#### **Root Cause**
The issue arose from a compatibility mismatch when the pre-build process was performed on macOS (Darwin) but executed in a Linux environment on Vercel. Specifically, the Foreign Function Interface (FFI) library encountered issues due to platform differences.

#### **Workaround**

To resolve this, the following steps were implemented:

1. **Update `.npmrc`**
   Add the following line to your `.npmrc` file:
   ```
   force=true
   ```

2. **Install Platform-Compatible FFI Library**
   Run the following command to install the Linux-compatible version of the FFI library:
   ```bash
   npm i --save @yuuang/ffi-rs-linux-x64-gnu@1.0.76
   ```

3. **Update the Inigo JS Package**
   Use the updated Inigo JS package to resolve dependencies and compatibility:
   ```bash
   npm i --save github:inigolabs/inigo-js#3413c65
   ```

---

### **#2 Vercel Route - Show Data Issue**

#### **Root Cause**
The issue was related to the data flushing function, which was not being triggered upon termination due to missing functionality in the existing package version.

#### **Resolution**

1. **Update Your Code**
   The updated version of the Inigo JS package exposes the required function to flush data properly. Update your handler as follows:

   ```javascript
   import { InigoPlugin, startServerAndCreateNextHandler } from "inigo.js";

   // Example server initialization
   const server = new ApolloServer({
     typeDefs,
     resolvers,
     plugins: [new InigoPlugin()],
   });

   export default startServerAndCreateNextHandler(server);
   ```

---

## **Summary of Changes**

- Added platform compatibility settings in `.npmrc` (`force=true`).
- Installed platform-specific FFI library to address deployment issues on Linux environments.
- Updated Inigo JS package to include the data flushing function.
- Modified server initialization code to utilize the new Inigo handler.

---

## **Notes**
Ensure all dependencies are updated before deploying to Vercel to avoid runtime issues:
```bash
npm install
```

These changes will ensure seamless deployment and functionality for your customers.
