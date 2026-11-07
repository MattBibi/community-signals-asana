// GitHub side: read open issues as signals, and (Step 4) reply on them.
import { Octokit } from "@octokit/rest";
import { config } from "./config.js";
import type { Signal } from "./triage.js";

export interface GitHubIssueSignal extends Signal {
  source: "github";
  number: number;
}

let client: { octokit: Octokit; owner: string; repo: string } | undefined;

function github() {
  if (client) return client;
  if (!config.GITHUB_TOKEN || !config.GITHUB_REPO) {
    throw new Error("Set GITHUB_TOKEN and GITHUB_REPO in .env (see .env.example)");
  }
  const [owner, repo] = config.GITHUB_REPO.split("/") as [string, string];
  client = {
    octokit: new Octokit({ auth: config.GITHUB_TOKEN, userAgent: "community-signals-asana" }),
    owner,
    repo,
  };
  return client;
}

/** Open issues on the repo, oldest first. Pull requests and bots are left out. */
export async function openIssues(): Promise<GitHubIssueSignal[]> {
  const { octokit, owner, repo } = github();
  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    state: "open",
    sort: "created",
    direction: "asc",
    per_page: 100,
  });
  return issues
    .filter((i) => !i.pull_request && i.user?.type !== "Bot")
    .map((i) => ({
      source: "github" as const,
      number: i.number,
      url: i.html_url,
      author: i.user?.login ?? "unknown",
      title: i.title,
      body: i.body ?? "",
    }));
}

export async function commentOnIssue(number: number, body: string): Promise<string> {
  const { octokit, owner, repo } = github();
  const { data } = await octokit.rest.issues.createComment({ owner, repo, issue_number: number, body });
  return data.html_url;
}
