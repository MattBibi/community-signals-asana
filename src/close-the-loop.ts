// When a triage task is completed in Asana, reply on the GitHub issue it
// came from. Safe to run more than once for the same task: a hidden marker
// in the comment stops a second reply (Asana may redeliver an event, or a
// task can be reopened and completed again).
import { asana } from "./asana.js";
import { commentOnIssue, issueCommentBodies, issueNumberFromUrl } from "./github.js";
import type { TriageProject } from "./triage-project.js";

export type ReplyOutcome =
  | { kind: "replied"; commentUrl: string }
  | { kind: "ignored"; reason: string };

const marker = (taskGid: string) => `<!-- community-signals-asana:task:${taskGid} -->`;

export async function replyIfCompleted(taskGid: string, tp: TriageProject): Promise<ReplyOutcome> {
  const task = await asana.task(taskGid);
  if (!task.completed) return { kind: "ignored", reason: "task is not completed" };

  const url = task.custom_fields.find((f) => f.gid === tp.sourceUrlField)?.text_value;
  if (!url) return { kind: "ignored", reason: "task has no Source URL" };

  const issue = issueNumberFromUrl(url);
  if (issue === null) return { kind: "ignored", reason: `not an issue on our repo: ${url}` };

  if ((await issueCommentBodies(issue)).some((b) => b.includes(marker(taskGid)))) {
    return { kind: "ignored", reason: `already replied on #${issue}` };
  }

  // Deliberately generic: Asana comments can be internal, so nothing from
  // the task beyond its completion is copied to the public issue.
  const commentUrl = await commentOnIssue(
    issue,
    [
      "Thanks for raising this! The team has looked into it and marked it as done.",
      "",
      "If something still isn't working for you, reply here and we'll take another look.",
      "",
      marker(taskGid),
    ].join("\n"),
  );
  return { kind: "replied", commentUrl };
}
