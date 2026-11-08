// When a triage task is completed in Asana, reply where the signal came from:
// the GitHub issue or the Slack thread. Safe to run more than once for the
// same task: a hidden marker stops a second reply (Asana may redeliver an
// event, or a task can be reopened and completed again).
import { asana } from "./asana.js";
import { commentOnIssue, issueCommentBodies, issueNumberFromUrl } from "./github.js";
import { alreadyRepliedInThread, replyInThread, slackMessageFromUrl } from "./slack.js";
import type { TriageProject } from "./triage-project.js";

export type ReplyOutcome =
  | { kind: "replied"; replyUrl: string }
  | { kind: "ignored"; reason: string };

// Deliberately generic: Asana comments can be internal, so nothing from the
// task beyond its completion is copied to a public place.
const REPLY =
  "Thanks for raising this! The team has looked into it and marked it as done.\n\n" +
  "If something still isn't working for you, reply here and we'll take another look.";

const githubMarker = (taskGid: string) => `<!-- community-signals-asana:task:${taskGid} -->`;

export async function replyIfCompleted(taskGid: string, tp: TriageProject): Promise<ReplyOutcome> {
  const task = await asana.task(taskGid);
  if (!task.completed) return { kind: "ignored", reason: "task is not completed" };

  const url = task.custom_fields.find((f) => f.gid === tp.sourceUrlField)?.text_value;
  if (!url) return { kind: "ignored", reason: "task has no Source URL" };

  const issue = issueNumberFromUrl(url);
  if (issue !== null) {
    if ((await issueCommentBodies(issue)).some((b) => b.includes(githubMarker(taskGid)))) {
      return { kind: "ignored", reason: `already replied on #${issue}` };
    }
    const replyUrl = await commentOnIssue(issue, `${REPLY}\n\n${githubMarker(taskGid)}`);
    return { kind: "replied", replyUrl };
  }

  const slackMsg = await slackMessageFromUrl(url);
  if (slackMsg) {
    if (await alreadyRepliedInThread(slackMsg.channel, slackMsg.ts, taskGid)) {
      return { kind: "ignored", reason: "already replied in the Slack thread" };
    }
    const replyUrl = await replyInThread(slackMsg.channel, slackMsg.ts, taskGid, REPLY);
    return { kind: "replied", replyUrl };
  }

  return { kind: "ignored", reason: `not a source we reply to: ${url}` };
}
