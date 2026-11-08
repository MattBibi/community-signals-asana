// Slack side, over Socket Mode (the app connects out to Slack, so no public
// URL): new top-level messages in one channel become signals, and finished
// tasks get a reply in the message's thread.
import { App, LogLevel } from "@slack/bolt";
import { config } from "./config.js";
import { loadExisting, processSignal } from "./pipeline.js";
import type { Signal } from "./triage.js";
import type { TriageProject } from "./triage-project.js";

let app: App | undefined;
let channelId: string | undefined;

export const slackConfigured = () => Boolean(config.SLACK_BOT_TOKEN && config.SLACK_APP_TOKEN);

function slack(): App {
  if (!slackConfigured()) throw new Error("Set SLACK_BOT_TOKEN and SLACK_APP_TOKEN in .env");
  app ??= new App({
    token: config.SLACK_BOT_TOKEN!,
    appToken: config.SLACK_APP_TOKEN!,
    socketMode: true,
    logLevel: LogLevel.WARN,
  });
  return app;
}

async function resolveChannel(): Promise<string> {
  if (channelId) return channelId;
  let cursor: string | undefined;
  do {
    const res = await slack().client.conversations.list({ types: "public_channel", limit: 200, cursor });
    const found = res.channels?.find((c) => c.name === config.SLACK_CHANNEL);
    if (found?.id) {
      if (!found.is_member) {
        throw new Error(`Invite the bot to #${config.SLACK_CHANNEL}: type /invite @Community Signals in the channel`);
      }
      return (channelId = found.id);
    }
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  throw new Error(`Channel #${config.SLACK_CHANNEL} not found`);
}

export async function startSlackListener(tp: TriageProject): Promise<void> {
  const app = slack();
  const channel = await resolveChannel();

  // One message at a time, so each new task is visible to the next
  // message's duplicate check.
  let queue = Promise.resolve();

  app.message(async ({ message, client }) => {
    // Only new, human, top-level messages: no edits, joins, bots or thread replies.
    if (message.channel !== channel || message.subtype !== undefined) return;
    if ("bot_id" in message && message.bot_id) return;
    if (message.thread_ts && message.thread_ts !== message.ts) return;
    const text = message.text?.trim();
    if (!text) return;

    queue = queue.then(async () => {
      try {
        const [{ permalink }, { user }] = await Promise.all([
          client.chat.getPermalink({ channel, message_ts: message.ts }),
          client.users.info({ user: message.user }),
        ]);
        if (!permalink) throw new Error("Slack returned no permalink");
        const signal: Signal = {
          source: "slack",
          url: permalink,
          author: user?.profile?.display_name || user?.real_name || user?.name || "unknown",
          body: text,
        };

        const existing = await loadExisting(tp);
        if (existing.urls.has(permalink)) return;
        const out = await processSignal(signal, tp, existing);
        const cost = `$${out.usage.costUsd.toFixed(4)}`;
        if (out.kind === "skipped") {
          console.log(`Slack message skipped: ${out.reason} (${cost})`);
          return;
        }
        // A small visible acknowledgement in Slack.
        await client.reactions.add({ channel, timestamp: message.ts, name: "eyes" });
        console.log(
          `Slack → ${out.needsReview ? "Needs review" : out.result.type} · ${out.result.priority}: ${out.task.name} (${cost})\n   ${out.task.permalink_url}`,
        );
      } catch (err) {
        console.error(`Slack message failed: ${err instanceof Error ? err.message : err}`);
      }
    });
  });

  await app.start();
  console.log(`Listening to Slack #${config.SLACK_CHANNEL}`);
}

/** Channel and message ts from a permalink, only for our channel. The
 * Source URL can be edited in Asana, so never post anywhere else. */
export async function slackMessageFromUrl(url: string): Promise<{ channel: string; ts: string } | null> {
  const m = url.match(/^https:\/\/[\w-]+\.slack\.com\/archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})/);
  if (!m || !slackConfigured() || m[1] !== (await resolveChannel())) return null;
  return { channel: m[1], ts: `${m[2]}.${m[3]}` };
}

const REPLY_EVENT = "community_signals_reply";

export async function alreadyRepliedInThread(channel: string, ts: string, taskGid: string): Promise<boolean> {
  const res = await slack().client.conversations.replies({ channel, ts, include_all_metadata: true, limit: 200 });
  return (res.messages ?? []).some(
    (m) =>
      m.metadata?.event_type === REPLY_EVENT &&
      (m.metadata.event_payload as Record<string, unknown> | undefined)?.task_gid === taskGid,
  );
}

export async function replyInThread(channel: string, ts: string, taskGid: string, text: string): Promise<string> {
  const client = slack().client;
  const res = await client.chat.postMessage({
    channel,
    thread_ts: ts,
    text,
    // Hidden marker so the same task never gets two replies.
    metadata: { event_type: REPLY_EVENT, event_payload: { task_gid: taskGid } },
  });
  const link = await client.chat.getPermalink({ channel, message_ts: res.ts! });
  return link.permalink ?? `${channel}/${res.ts}`;
}
