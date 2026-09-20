const fs = require("fs");
const path = require("path");

const workflowPath = path.join(__dirname, "..", ".github", "workflows", "keep-alive.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");

let failures = 0;
function check(label, condition) {
    console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
    if (!condition) failures++;
}

check("runs at least once every 100 hours", /cron:\s*['"]13 7 \*\/4 \* \*['"]/.test(workflow));
check("can be run manually", /workflow_dispatch:\s*\{\}/.test(workflow));
check("reads the project URL from a repository secret", /secrets\.SUPABASE_URL/.test(workflow));
check("uses the limited anonymous key secret", /secrets\.SUPABASE_ANON_KEY/.test(workflow));
check("does not use the service-role secret", !/SUPABASE_SERVICE_ROLE_KEY/.test(workflow));
check("performs a one-row database query", /leaderboard\?select=id&limit=1/.test(workflow));
check("falls back to the app endpoint when anonymous RLS blocks the direct query",
    /https:\/\/vtcade\.vercel\.app\/api\/leaderboard/.test(workflow));
check("fails safely when credentials are missing", /SUPABASE_URL or SUPABASE_ANON_KEY secret is not set/.test(workflow));

process.exitCode = failures ? 1 : 0;
