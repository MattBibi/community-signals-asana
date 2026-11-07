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

async function pass() {
  const existing = await loadExisting(tp);
  const fresh = (await openIssues()).filter((i) => !existing.urls.has(i.url) && !skipped.has(i.url));
  if (fresh.length === 0) return;

  // One at a time, so each task is visible to the next issue's duplicate check.
  for (const issue of fresh) {
    try {
      const out = await processSignal(issue, tp, existing);
      if (out.kind === "skipped") {
        skipped.add(issue.url);
        console.log(`#${issue.number} skipped: ${out.reason}`);
      } else {
        const { type, priority } = out.result;
        console.log(
          `#${issue.number} → ${out.needsReview ? "Needs review" : type} · ${priority}: ${out.task.name}\n   ${out.task.permalink_url}`,
        );
      }
    } catch (err) {
      console.error(`#${issue.number} failed: ${err instanceof Error ? err.message : err}`);
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
