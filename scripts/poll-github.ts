// npm run poll: checks the sandbox repo for new issues every 30 seconds and
// turns each one into a triaged Asana task. `npm run poll -- --once` runs a
// single pass and exits.
import { config } from "../src/config.js";
import { openIssues } from "../src/github.js";
import { loadExisting, processSignal } from "../src/pipeline.js";
import { resolveTriageProject } from "../src/triage-project.js";

const once = process.argv.includes("--once");
const intervalSeconds = Number(process.env.POLL_SECONDS ?? 30);

const tp = await resolveTriageProject();
// Skipped signals have no task, so remember them to avoid re-triaging
// every pass. (A restart triages them once more, which is fine.)
const skipped = new Set<string>();

// A failure can happen after the Claude call (e.g. Asana rejects the task),
// so retrying every pass would pay for triage again each time. Wait longer
// after each failure, then give up on that issue until the next restart.
const RETRY_DELAYS_MS = [60_000, 5 * 60_000];
const failures = new Map<string, { count: number; retryAt: number }>();

function recordFailure(url: string): string {
  const count = (failures.get(url)?.count ?? 0) + 1;
  const delay = RETRY_DELAYS_MS[count - 1];
  if (delay === undefined) {
    failures.delete(url);
    skipped.add(url);
    return "giving up until the next restart";
  }
  failures.set(url, { count, retryAt: Date.now() + delay });
  return `retrying in ${delay / 60_000} min`;
}

let totalCost = 0;

async function pass() {
  const existing = await loadExisting(tp);
  const now = Date.now();
  const fresh = (await openIssues()).filter(
    (i) => !existing.urls.has(i.url) && !skipped.has(i.url) && (failures.get(i.url)?.retryAt ?? 0) <= now,
  );
  if (fresh.length === 0) return;

  // One at a time, so each task is visible to the next issue's duplicate check.
  for (const issue of fresh) {
    try {
      const out = await processSignal(issue, tp, existing);
      failures.delete(issue.url);
      totalCost += out.usage.costUsd;
      const cost = `$${out.usage.costUsd.toFixed(4)}, session total $${totalCost.toFixed(4)}`;
      if (out.kind === "skipped") {
        skipped.add(issue.url);
        console.log(`#${issue.number} skipped: ${out.reason} (${cost})`);
      } else {
        const { type, priority } = out.result;
        console.log(
          `#${issue.number} → ${out.needsReview ? "Needs review" : type} · ${priority}: ${out.task.name} (${cost})\n   ${out.task.permalink_url}`,
        );
      }
    } catch (err) {
      const next = recordFailure(issue.url);
      console.error(`#${issue.number} failed, ${next}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

console.log(`Watching ${config.GITHUB_REPO} → Asana "${config.ASANA_PROJECT_NAME}"${once ? " (one pass)" : ` every ${intervalSeconds}s`}`);
do {
  try {
    await pass();
  } catch (err) {
    console.error(`Pass failed: ${err instanceof Error ? err.message : err}`);
    if (once) process.exitCode = 1;
  }
  if (!once) await new Promise((r) => setTimeout(r, intervalSeconds * 1000));
} while (!once);
