import { existsSync } from "node:fs";
import { z } from "zod";

// Node 20.12+ reads .env natively, so there's no dotenv dependency.
if (existsSync(".env")) process.loadEnvFile(".env");

const Env = z.object({
  ASANA_PAT: z.string().min(1, "Set ASANA_PAT in .env (see .env.example)"),
  ASANA_WORKSPACE_GID: z.string().optional(),
  ASANA_PROJECT_NAME: z.string().default("Community Triage"),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_REPO: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, "GITHUB_REPO must look like owner/name")
    .optional(),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:\n" + z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
