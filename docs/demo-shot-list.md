# Demo GIF shot list (about 30 seconds)

Record with your screen recorder of choice (on macOS, Cmd+Shift+5, then convert to GIF with
[Gifski](https://gif.ski)). Aim for under 5 MB, around 1200 px wide, and save as `docs/demo.gif`.

Before recording: `npm start` and the tunnel are running, the Asana project is open in one
window, and the GitHub repo's "New issue" page in another. Close notifications.

| # | Seconds | Show | Why |
|---|---|---|---|
| 1 | 0–6 | Type and submit a GitHub issue: *"Webhook signature check fails after upgrading the Node SDK to v3"* with one sentence of detail | A real signal, written live |
| 2 | 6–14 | Switch to Asana. The task appears in **Bug**, with Source, Signal type and Priority set. Click it to show the summary and Source URL | The agent's work, visible in Asana |
| 3 | 14–20 | Click **Mark complete** | The one action a team member takes |
| 4 | 20–28 | Switch to the GitHub issue and refresh. The reply is there | The loop closes |
| 5 | 28–30 | Optional: the terminal log showing `GitHub #2 → bug · high` and `replied` | Shows it's one running app |

Tips: zoom the browser to 125% so text is readable in a small GIF, and trim waiting time in
editing. The poller can take up to 30 seconds, and nobody needs to watch that.
