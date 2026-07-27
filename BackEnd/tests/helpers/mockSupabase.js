// Chainable stand-in for the supabase-js query builder.
//
// Every builder method returns `this`, and the object is thenable, so any
// chain shape the routes use (`.from().select().eq().maybeSingle()`,
// `.update().eq().select()`, `.rpc().single()`, ...) resolves to whatever
// result was queued for that table/rpc.

function makeBuilder(resolveResult) {
    const builder = {};
    const chainMethods = [
        "select", "insert", "update", "delete", "upsert",
        "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is",
        "order", "limit", "range", "filter", "match"
    ];

    for (const m of chainMethods) {
        builder[m] = jest.fn(() => builder);
    }

    builder.single = jest.fn(() => Promise.resolve(resolveResult()));
    builder.maybeSingle = jest.fn(() => Promise.resolve(resolveResult()));
    builder.then = (onFulfilled, onRejected) =>
        Promise.resolve(resolveResult()).then(onFulfilled, onRejected);

    return builder;
}

function createMockSupabase() {
    const tableResults = new Map();
    const rpcResults = new Map();
    const authState = {
        getUser: { data: { user: null }, error: new Error("no user") },
        signUp: { data: { user: null }, error: null },
        signInWithPassword: { data: { user: null, session: null }, error: null },
        refreshSession: { data: { user: null, session: null }, error: null },
        deleteUser: { data: {}, error: null }
    };

    const client = {
        from: jest.fn((table) =>
            makeBuilder(() => tableResults.get(table) ?? { data: null, error: null, count: 0 })
        ),
        rpc: jest.fn((name) =>
            makeBuilder(() => rpcResults.get(name) ?? { data: null, error: null })
        ),
        auth: {
            getUser: jest.fn(() => Promise.resolve(authState.getUser)),
            signUp: jest.fn(() => Promise.resolve(authState.signUp)),
            signInWithPassword: jest.fn(() => Promise.resolve(authState.signInWithPassword)),
            refreshSession: jest.fn(() => Promise.resolve(authState.refreshSession)),
            resend: jest.fn(() => Promise.resolve({ error: null })),
            signOut: jest.fn(() => Promise.resolve({ error: null })),
            admin: {
                deleteUser: jest.fn(() => Promise.resolve(authState.deleteUser)),
                createUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null }))
            }
        }
    };

    return {
        client,
        setTable: (table, result) => tableResults.set(table, result),
        setRpc: (name, result) => rpcResults.set(name, result),
        setAuth: (key, result) => { authState[key] = result; },
        reset: () => {
            tableResults.clear();
            rpcResults.clear();
            authState.getUser = { data: { user: null }, error: new Error("no user") };
        }
    };
}

module.exports = { createMockSupabase };
