// Checks the GitHub repo for new issues and turns each into a triaged task.
// Polling keeps the demo free of a second webhook; swapping in GitHub
// webhooks later only changes how issues arrive, not what happens to them.
import { openIssues } from "./github.js";
import { loadExisting, processSignal } from "./pipeline.js";
import type { TriageProject } from "./triage-project.js";

// A failure can happen after the Claude call (e.g. Asana rejects the task),
// so retrying every pass would pay for triage again each time. Wait longer
// after each failure, then give up on that issue until the next restart.
const RETRY_DELAYS_MS = [60_000, 5 * 60_000];

export function createGithubPoller(tp: TriageProject) {
  // Skipped signals have no task, so remember them to avoid re-triaging
  // every pass. (A restart triages them once more, which is fine.)
  const skipped = new Set<string>();
  const failures = new Map<string, { count: number; retryAt: number }>();
  let totalCost = 0;

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

  async function pass() {
    const existing = await loadExisting(tp);
    const now = Date.now();
    const fresh = (await openIssues()).filter(
      (i) => !existing.urls.has(i.url) && !skipped.has(i.url) && (failures.get(i.url)?.retryAt ?? 0) <= now,
    );

    // One at a time, so each task is visible to the next issue's duplicate check.
    for (const issue of fresh) {
      try {
        const out = await processSignal(issue, tp, existing);
        failures.delete(issue.url);
        totalCost += out.usage.costUsd;
        const cost = `$${out.usage.costUsd.toFixed(4)}, session total $${totalCost.toFixed(4)}`;
        if (out.kind === "skipped") {
          skipped.add(issue.url);
          console.log(`GitHub #${issue.number} skipped: ${out.reason} (${cost})`);
        } else {
          const { type, priority } = out.result;
          console.log(
            `GitHub #${issue.number} → ${out.needsReview ? "Needs review" : type} · ${priority}: ${out.task.name} (${cost})\n   ${out.task.permalink_url}`,
          );
        }
      } catch (err) {
        const next = recordFailure(issue.url);
        console.error(`GitHub #${issue.number} failed, ${next}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  /** Run passes forever, `intervalSeconds` apart. A failed pass is logged and the next one runs as usual. */
  async function start(intervalSeconds: number) {
    for (;;) {
      try {
        await pass();
      } catch (err) {
        console.error(`GitHub pass failed: ${err instanceof Error ? err.message : err}`);
      }
      await new Promise((r) => setTimeout(r, intervalSeconds * 1000));
    }
  }

  return { pass, start };
}
