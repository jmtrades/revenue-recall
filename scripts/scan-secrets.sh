#!/usr/bin/env bash
# Fail the build if a likely secret VALUE is committed to tracked files.
# Patterns match real credential shapes, not variable names, so an empty
# placeholder in .env.example (e.g. ANTHROPIC_API_KEY=) is fine.
set -euo pipefail

patterns=(
  'sk-ant-[A-Za-z0-9_-]{20,}'                     # Anthropic API key
  'AKIA[0-9A-Z]{16}'                              # AWS access key id
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'            # PEM private key
  'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.' # JWT (e.g. Supabase service-role)
)

args=()
for p in "${patterns[@]}"; do args+=(-e "$p"); done

# Search tracked files only; exclude this script (it contains the patterns).
if git grep -nIE "${args[@]}" -- . ':(exclude)scripts/scan-secrets.sh'; then
  echo "" >&2
  echo "ERROR: a possible secret was found in tracked files (see above)." >&2
  echo "Rotate the credential immediately and use an environment variable instead." >&2
  exit 1
fi

echo "Secret scan clean — no committed secrets found."
