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

// Every admin action that changes or destroys something goes through here.
// Bans, deletions and leaderboard resets previously left no trace at all, so
// there was no way to answer "who did this, and when" after the fact. Tagged
// AUDIT rather than INFO so it can be grepped and shipped somewhere separate.
function logAudit(action, actor, detail = {}) {
    console.log(`[${ts()}] AUDIT ${action} actor=${actor} ${JSON.stringify(detail)}`);
}

module.exports = { logError, logWarn, logInfo, logAudit };
