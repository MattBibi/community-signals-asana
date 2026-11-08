// npm run serve: receives Asana webhook events. Run cloudflared in front of
// it, then `npm run webhook:register -- <public url>`.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { replyIfCompleted } from "./close-the-loop.js";
import { slackConfigured, startSlackListener } from "./slack.js";
import { resolveTriageProject } from "./triage-project.js";
import { isValidSignature, loadSecret, saveSecret } from "./webhook-secret.js";

interface AsanaEvent {
  action: string;
  resource: { gid: string; resource_type: string };
  change?: { field: string };
}

const tp = await resolveTriageProject();
const app = new Hono();

app.get("/", (c) => c.text("community-signals-asana is running"));

app.post("/webhooks/asana", async (c) => {
  // 1. Handshake: Asana sends X-Hook-Secret once, while the webhook is being
  //    created. Echoing it back confirms we own this URL; we keep it to
  //    verify every event after this.
  const handshake = c.req.header("X-Hook-Secret");
  if (handshake) {
    saveSecret(handshake);
    console.log("Webhook handshake completed, secret saved");
    c.header("X-Hook-Secret", handshake);
    return c.body(null, 200);
  }

  // 2. Every event after that is signed with the secret. Reject anything else.
  const secret = loadSecret();
  const rawBody = await c.req.text(); // the signature covers the exact raw bytes
  if (!secret || !isValidSignature(rawBody, c.req.header("X-Hook-Signature"), secret)) {
    console.warn("Rejected a webhook call with a missing or invalid signature");
    return c.body(null, 401);
  }

  // 3. Events are compact (ids only), so fetch what we need. Answer Asana
  //    straight away and do the work afterwards: it expects a reply within
  //    seconds. An empty events list is a heartbeat.
  const { events = [] } = JSON.parse(rawBody) as { events?: AsanaEvent[] };
  const taskGids = new Set(
    events
      .filter((e) => e.resource.resource_type === "task" && e.change?.field === "completed")
      .map((e) => e.resource.gid),
  );
  for (const gid of taskGids) {
    replyIfCompleted(gid, tp)
      .then((out) =>
        console.log(out.kind === "replied" ? `Task ${gid}: replied ${out.replyUrl}` : `Task ${gid}: ${out.reason}`),
      )
      .catch((err) => console.error(`Task ${gid} failed: ${err instanceof Error ? err.message : err}`));
  }
  return c.body(null, 200);
});

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`Listening on http://localhost:${port}`));

// Slack is optional: start it only when its tokens are set.
if (slackConfigured()) {
  startSlackListener(tp).catch((err) => console.error(`Slack failed to start: ${err instanceof Error ? err.message : err}`));
} else {
  console.log("Slack not configured (SLACK_BOT_TOKEN / SLACK_APP_TOKEN), skipping");
}
