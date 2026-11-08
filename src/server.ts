// Receives Asana webhook events. Run cloudflared in front of it, then
// `npm run webhook:register -- <public url>`.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { replyIfCompleted } from "./close-the-loop.js";
import type { TriageProject } from "./triage-project.js";
import { isValidSignature, loadSecret, saveSecret } from "./webhook-secret.js";

interface AsanaEvent {
  action: string;
  resource: { gid: string; resource_type: string };
  change?: { field: string };
}

export function createApp(tp: TriageProject) {
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

  return app;
}

export function startWebhookServer(tp: TriageProject, port: number): Promise<void> {
  return new Promise((resolve) => {
    serve({ fetch: createApp(tp).fetch, port }, () => {
      console.log(`Webhook server on http://localhost:${port}`);
      resolve();
    });
  });
}
