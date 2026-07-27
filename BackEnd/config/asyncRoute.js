const { logError } = require("./logger");

// Wraps an async route handler so that any thrown/rejected error is logged with
// its route context and turned into a clean 500, instead of each handler
// repeating an identical try/catch that swallowed the error with no output.
function asyncRoute(handler) {
    return async function (req, res, next) {
        try {
            await handler(req, res, next);
        } catch (err) {
            logError(`${req.method} ${req.originalUrl}`, err);
            if (!res.headersSent) {
                res.status(500).json({ message: "Server error" });
            }
        }
    };
}

module.exports = asyncRoute;
