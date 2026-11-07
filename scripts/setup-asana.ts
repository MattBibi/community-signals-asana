// npm run setup: creates the Community Triage sections and custom fields.
// Safe to re-run: anything that already exists is left alone.
import { resolveTriageProject } from "../src/triage-project.js";

const result = await resolveTriageProject({ create: true, log: console.log });
console.log(
  `\nReady: ${Object.keys(result.sections).length} sections, ${Object.keys(result.fields).length + 1} custom fields.`,
);
