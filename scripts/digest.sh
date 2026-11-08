#!/usr/bin/env bash
# npm run digest: asks Claude Code to write this week's community update from
# Asana, through the MCP server, using read-only tools only.
set -euo pipefail
cd "$(dirname "$0")/.."

TOOLS="mcp__claude_ai_Asana__get_me,mcp__claude_ai_Asana__get_projects,mcp__claude_ai_Asana__search_objects,mcp__claude_ai_Asana__get_tasks,mcp__claude_ai_Asana__get_task,ToolSearch"
OUT="digest/examples/$(date +%F).md"

result="$(claude -p "$(cat digest/PROMPT.md)" --allowedTools "$TOOLS" < /dev/null)"

# Only save something that looks like the digest (it starts with a heading).
# Anything else is usually Claude explaining it couldn't reach Asana.
if [[ "$result" != "#"* ]]; then
  echo "No digest written. Claude said:" >&2
  echo "$result" >&2
  echo "If it mentions authentication: run \`claude\`, type /mcp and sign in to Asana." >&2
  exit 1
fi

mkdir -p digest/examples
printf '%s\n' "$result" > "$OUT"
cat "$OUT"
echo "Saved $OUT" >&2
