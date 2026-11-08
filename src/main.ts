// npm start: everything in one process.
//   - the Asana webhook server (replies when tasks are completed)
//   - the GitHub poller (new issues become tasks)
//   - the Slack listener (new #questions messages become tasks), if configured
import { config } from "./config.js";
import { createGithubPoller } from "./github-poller.js";
import { startWebhookServer } from "./server.js";
import { slackConfigured, startSlackListener } from "./slack.js";
import { resolveTriageProject } from "./triage-project.js";

const tp = await resolveTriageProject();
console.log(`Asana project: ${config.ASANA_PROJECT_NAME}`);

await startWebhookServer(tp, Number(process.env.PORT ?? 3000));

if (config.GITHUB_TOKEN && config.GITHUB_REPO) {
  const seconds = Number(process.env.POLL_SECONDS ?? 30);
  console.log(`Watching GitHub ${config.GITHUB_REPO} every ${seconds}s`);
  void createGithubPoller(tp).start(seconds);
} else {
  console.log("GitHub not configured (GITHUB_TOKEN / GITHUB_REPO), skipping");
}

if (slackConfigured()) {
  startSlackListener(tp).catch((err) =>
    console.error(`Slack failed to start: ${err instanceof Error ? err.message : err}`),
  );
} else {
  console.log("Slack not configured (SLACK_BOT_TOKEN / SLACK_APP_TOKEN), skipping");
}
