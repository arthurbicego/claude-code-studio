#!/usr/bin/env bash
# Claude Code Studio statusLine tap.
#
# Wraps the user's own statusLine script transparently:
#   1. Reads the JSON payload from stdin.
#   2. Persists it to ~/.claude-code-studio/statusline-cache/<session_id>.json
#      and a global rate-limits snapshot — these feed the per-session footer
#      shown in the Studio web UI.
#   3. Pipes the same stdin to the user's ~/.claude/statusline.sh (when it
#      exists and is executable) and prints whatever it produces, so the
#      visible statusLine inside the embedded PTY stays identical to what the
#      user sees in their own terminal.
#
# Defensive by design: any failure here MUST NOT break the visible statusLine
# beyond what the user's own script would produce. set +e + explicit `exit 0`.

set +e
umask 077

input=$(cat)

cache_root="${HOME}/.claude-code-studio"
mkdir -p "$cache_root/statusline-cache" 2>/dev/null
chmod 700 "$cache_root" 2>/dev/null

session_id=""
if command -v jq >/dev/null 2>&1; then
  session_id=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
fi

if [ -n "$session_id" ]; then
  case "$session_id" in
    *[!a-zA-Z0-9._-]*) session_id="" ;;
  esac
fi

if [ -n "$session_id" ]; then
  tmp="$cache_root/statusline-cache/.${session_id}.tmp.$$"
  printf '%s' "$input" > "$tmp" 2>/dev/null \
    && mv -f "$tmp" "$cache_root/statusline-cache/${session_id}.json" 2>/dev/null
  rm -f "$tmp" 2>/dev/null
fi

if command -v jq >/dev/null 2>&1; then
  global_tmp="$cache_root/.global-meta.tmp.$$"
  printf '%s' "$input" \
    | jq --argjson at "$(date +%s)" '{rate_limits: (.rate_limits // null), at: $at}' \
        > "$global_tmp" 2>/dev/null \
    && mv -f "$global_tmp" "$cache_root/global-meta.json" 2>/dev/null
  rm -f "$global_tmp" 2>/dev/null
fi

user_script="${HOME}/.claude/statusline.sh"
if [ -x "$user_script" ]; then
  printf '%s' "$input" | "$user_script"
elif [ -r "$user_script" ]; then
  printf '%s' "$input" | bash "$user_script"
fi

exit 0
