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

// A table can be given one result, or a sequence for routes that read it more
// than once (the login path looks a profile up and may then insert one). The
// last entry stays in force once the sequence is drained, so a test only has to
// queue the calls it actually cares about.
function nextResult(store, key, fallback) {
    const queued = store.get(key);
    if (queued === undefined) return fallback;
    if (Array.isArray(queued)) {
        return queued.length > 1 ? queued.shift() : queued[0];
    }
    return queued;
}

function createMockSupabase() {
    const tableResults = new Map();
    const rpcResults = new Map();
    const authState = {
        getUser: { data: { user: null }, error: new Error("no user") },
        signUp: { data: { user: null }, error: null },
        signInWithPassword: { data: { user: null, session: null }, error: null },
        refreshSession: { data: { user: null, session: null }, error: null },
        resend: { error: null },
        resetPasswordForEmail: { data: {}, error: null },
        deleteUser: { data: {}, error: null },
        updateUserById: { data: { user: null }, error: null },
        adminSignOut: { data: null, error: null }
    };

    const client = {
        from: jest.fn((table) =>
            makeBuilder(() => nextResult(tableResults, table, { data: null, error: null, count: 0 }))
        ),
        rpc: jest.fn((name) =>
            makeBuilder(() => nextResult(rpcResults, name, { data: null, error: null }))
        ),
        auth: {
            getUser: jest.fn(() => Promise.resolve(authState.getUser)),
            signUp: jest.fn(() => Promise.resolve(authState.signUp)),
            signInWithPassword: jest.fn(() => Promise.resolve(authState.signInWithPassword)),
            refreshSession: jest.fn(() => Promise.resolve(authState.refreshSession)),
            resend: jest.fn(() => Promise.resolve(authState.resend)),
            resetPasswordForEmail: jest.fn(() => Promise.resolve(authState.resetPasswordForEmail)),
            signOut: jest.fn(() => Promise.resolve({ error: null })),
            admin: {
                deleteUser: jest.fn(() => Promise.resolve(authState.deleteUser)),
                createUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
                updateUserById: jest.fn(() => Promise.resolve(authState.updateUserById)),
                signOut: jest.fn(() => Promise.resolve(authState.adminSignOut))
            }
        }
    };

    return {
        client,
        setTable: (table, result) => tableResults.set(table, result),
        setTableSequence: (table, results) => tableResults.set(table, results.slice()),
        setRpc: (name, result) => rpcResults.set(name, result),
        setAuth: (key, result) => { authState[key] = result; },
        reset: () => {
            tableResults.clear();
            rpcResults.clear();
            authState.getUser = { data: { user: null }, error: new Error("no user") };
            authState.signUp = { data: { user: null }, error: null };
            authState.signInWithPassword = { data: { user: null, session: null }, error: null };
            authState.refreshSession = { data: { user: null, session: null }, error: null };
            authState.resend = { error: null };
            authState.updateUserById = { data: { user: null }, error: null };
        }
    };
}

module.exports = { createMockSupabase };
