// npm run try:triage: Step 2 checkpoint. Runs the triage agent on the
// sample signals (no GitHub, Slack or Asana involved) and compares the
// results with what we expect.
import { triage, type TriageResult } from "../src/triage.js";
import { SAMPLES, type Sample } from "./samples.js";

function check(expect: Sample["expect"], r: TriageResult): string[] {
  const misses: string[] = [];
  if (expect.skip && !r.skip) misses.push("expected skip");
  if (!expect.skip && r.skip) misses.push(`unexpected skip (${r.skip_reason})`);
  if (expect.type && r.type !== expect.type) misses.push(`type ${r.type}, expected ${expect.type}`);
  if (expect.priority && r.priority !== expect.priority) {
    misses.push(`priority ${r.priority}, expected ${expect.priority}`);
  }
  return misses;
}

const started = Date.now();
const results = await Promise.allSettled(SAMPLES.map((s) => triage(s.signal)));

let passed = 0;
results.forEach((res, i) => {
  const sample = SAMPLES[i]!;
  const label = sample.signal.title ?? sample.signal.body.slice(0, 60);
  console.log(`\n#${i + 1} ${label}`);
  if (res.status === "rejected") {
    console.log(`  ✗ error: ${res.reason instanceof Error ? res.reason.message : res.reason}`);
    return;
  }
  const r = res.value;
  const misses = check(sample.expect, r);
  if (misses.length === 0) passed++;
  console.log(
    `  ${misses.length ? "✗" : "✓"} ${r.skip ? `SKIP: ${r.skip_reason}` : `${r.type} · ${r.priority}${r.confident ? "" : " · needs review"}`}`,
  );
  if (!r.skip) console.log(`  title:   ${r.title}\n  summary: ${r.summary}`);
  for (const m of misses) console.log(`  ! ${m}`);
});

console.log(`\n${passed}/${SAMPLES.length} matched expectations in ${((Date.now() - started) / 1000).toFixed(1)}s`);
