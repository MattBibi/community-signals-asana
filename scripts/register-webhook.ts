// npm run webhook:register -- https://<your-tunnel>.trycloudflare.com
// Points an Asana webhook on Community Triage at the running server. Old
// webhooks on the project are removed first (quick tunnels get a new URL
// every time), so there's only ever one.
import { asana } from "../src/asana.js";
import { resolveTriageProject } from "../src/triage-project.js";

const base = process.argv[2]?.replace(/\/$/, "");
if (!base?.startsWith("https://")) {
  console.error("Usage: npm run webhook:register -- https://<public url of npm start>");
  process.exit(1);
}
const target = `${base}/webhooks/asana`;

const tp = await resolveTriageProject();
for (const old of await asana.webhooks(tp.workspace, tp.project)) {
  await asana.deleteWebhook(old.gid);
  console.log(`Removed old webhook → ${old.target}`);
}

const hook = await asana.createWebhook(tp.project, target);
console.log(`Webhook ${hook.gid} active=${hook.active} → ${hook.target}`);
