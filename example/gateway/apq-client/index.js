const { ApolloClient, InMemoryCache, gql, HttpLink } = require('@apollo/client');
const { createPersistedQueryLink } = require('@apollo/client/link/persisted-queries');
const { createHash } = require('crypto');
const fetch = require('cross-fetch');


const linkChain = createPersistedQueryLink({
    sha256: data => createHash('sha256')
        .update(data)
        .digest('hex')
}).concat(
    new HttpLink({ uri: 'http://localhost:4000/graphql', fetch }),
);

const options = {
    watchQuery: {
        fetchPolicy: 'no-cache',
        errorPolicy: 'ignore',
    },
    query: {
        fetchPolicy: 'no-cache',
        errorPolicy: 'all',
    },
}

const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: linkChain,
    defaultOptions: options,
});

(async () => {
    for (let i = 0; i < 5; i++) {
        let resp = await client.query({ query: gql`query ExampleQuery {
                me {
                    name
                    reviews {
                        body
                        author {
                            name
                        }
                    }
                }
            }` });
        console.log(`response ${ i }: ${ JSON.stringify(resp) } `)
    }
})()
