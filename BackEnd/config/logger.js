// Minimal structured logger. The original code swallowed every error with a
// bare `res.status(500)` and no output, which is exactly why two guaranteed
// ReferenceError crashes sat unnoticed in production. Everything that returns
// a 5xx must now leave a trace.

function ts() {
    return new Date().toISOString();
}

function logError(context, err, extra = {}) {
    const detail = err instanceof Error ? (err.stack || err.message) : JSON.stringify(err);
    const meta = Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : "";
    console.error(`[${ts()}] ERROR ${context}${meta}\n  ${detail}`);
}

function logWarn(context, message, extra = {}) {
    const meta = Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : "";
    console.warn(`[${ts()}] WARN  ${context}: ${message}${meta}`);
}

function logInfo(context, message) {
    console.log(`[${ts()}] INFO  ${context}: ${message}`);
}

module.exports = { logError, logWarn, logInfo };
