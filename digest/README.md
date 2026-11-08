# Weekly digest through Asana's MCP server

The webhook loop uses Asana's REST API. This part shows the other side of the
platform: an AI client reading the same Community Triage project through
[Asana's V2 MCP server](https://developers.asana.com/docs/using-asanas-mcp-server)
and drafting a community update from it.

- [PROMPT.md](PROMPT.md) is the weekly prompt. It only reads from Asana.
- [examples/](examples/) holds generated updates. The first one was made on 8 November 2026.

## Connect Claude Code to Asana's MCP server

Pick one:

**Claude's Asana connector (quickest).** In the Claude app, open Settings → Connectors and connect Asana. To use it from the `claude` command line, run `claude`, type `/mcp`, choose "claude.ai Asana" and sign in once.

**Your own MCP app.** V2 doesn't support dynamic client registration, so create an app at
[app.asana.com/0/my-apps](https://app.asana.com/0/my-apps) with the redirect URL
`http://localhost:8080/callback`, make it available to your workspace, then:

```bash
claude mcp add --transport http --client-id YOUR_CLIENT_ID --client-secret --callback-port 8080 asana https://mcp.asana.com/v2/mcp
```

(With this route the tools are named `mcp__asana__…`; adjust `TOOLS` in `scripts/digest.sh`.)

## Run it

```bash
npm run digest
```

This writes `examples/<today>.md`. The script lets Claude use only Asana's read tools, so the digest can't change anything in Asana.
