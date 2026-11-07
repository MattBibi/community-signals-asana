// Signal → triage agent → Asana task. Shared by every input (GitHub now,
// Slack later), so each input only has to produce a Signal.
import { asana, type Task } from "./asana.js";
import { PRIORITIES, SIGNAL_TYPES, SOURCES } from "./taxonomy.js";
import { triage, type Signal, type TriageResult } from "./triage.js";
import type { TriageProject } from "./triage-project.js";

/** What's already in Asana: used to skip signals we've handled and to let
 * the agent spot duplicates. */
export interface Existing {
  urls: Set<string>;
  openTitles: string[];
}

export async function loadExisting(tp: TriageProject): Promise<Existing> {
  const tasks = await asana.allTasks(tp.project);
  const urls = new Set<string>();
  for (const t of tasks) {
    const url = t.custom_fields.find((f) => f.gid === tp.sourceUrlField)?.text_value;
    if (url) urls.add(url);
  }
  return { urls, openTitles: tasks.filter((t) => !t.completed).map((t) => t.name) };
}

export type Outcome =
  | { kind: "created"; task: Task; result: TriageResult; needsReview: boolean }
  | { kind: "skipped"; reason: string };

export async function processSignal(signal: Signal, tp: TriageProject, existing: Existing): Promise<Outcome> {
  const result = await triage(signal, existing.openTitles);

  if (result.skip) return { kind: "skipped", reason: result.skip_reason ?? "skipped by triage" };
  if (result.duplicate_of) return { kind: "skipped", reason: `duplicate of "${result.duplicate_of}"` };

  const needsReview = !result.confident;
  const f = tp.fields;
  const task = await asana.createTask({
    name: result.title,
    notes: [
      result.summary,
      "",
      `From ${SOURCES[signal.source]} · @${signal.author}`,
      signal.url,
      "",
      "Triaged automatically by community-signals-asana.",
    ].join("\n"),
    project: tp.project,
    section: needsReview ? tp.sections.needsReview : tp.sections[result.type],
    customFields: {
      [f.source.gid]: f.source.options[SOURCES[signal.source]]!,
      [f.type.gid]: f.type.options[SIGNAL_TYPES[result.type]]!,
      [f.priority.gid]: f.priority.options[PRIORITIES[result.priority]]!,
      [tp.sourceUrlField]: signal.url,
    },
  });

  existing.urls.add(signal.url);
  existing.openTitles.push(task.name);
  return { kind: "created", task, result, needsReview };
}
