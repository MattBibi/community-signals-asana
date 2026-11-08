// npm run poll -- --once: one pass over the GitHub repo, then exit. Handy for
// testing triage without starting the server. (`npm start` polls for you.)
import { config } from "../src/config.js";
import { createGithubPoller } from "../src/github-poller.js";
import { resolveTriageProject } from "../src/triage-project.js";

const once = process.argv.includes("--once");
const intervalSeconds = Number(process.env.POLL_SECONDS ?? 30);
const poller = createGithubPoller(await resolveTriageProject());

console.log(`Watching ${config.GITHUB_REPO} → Asana "${config.ASANA_PROJECT_NAME}"${once ? " (one pass)" : ` every ${intervalSeconds}s`}`);
if (once) {
  await poller.pass();
} else {
  await poller.start(intervalSeconds);
}
