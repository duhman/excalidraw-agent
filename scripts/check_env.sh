#!/usr/bin/env bash
set -euo pipefail

errors=0

check_cmd() {
  local cmd="$1"
  local label="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    printf '[OK] %s: %s\n' "$label" "$($cmd --version 2>/dev/null | head -n1)"
  else
    printf '[ERROR] Missing required command: %s\n' "$cmd" >&2
    errors=$((errors + 1))
  fi
}

check_cmd node "Node"
check_cmd pnpm "pnpm"

if [ "$errors" -gt 0 ]; then
  cat >&2 <<'MSG'

Install required runtime tools and retry.
Expected baseline:
- Node.js >= 20
- pnpm available on PATH
MSG
  exit 1
fi

node <<'NODE'
const path = require("node:path");
const { createRequire } = require("node:module");

function resolveFromCwd(name) {
  const req = createRequire(path.join(process.cwd(), "__skill_resolver__.cjs"));
  try {
    return req.resolve(name);
  } catch {
    return null;
  }
}

const packages = ["@excalidraw/excalidraw", "@excalidraw/mermaid-to-excalidraw"];
for (const pkg of packages) {
  const resolved = resolveFromCwd(pkg);
  if (resolved) {
    console.log(`[OK] Resolved from current directory: ${pkg} -> ${resolved}`);
  } else {
    console.log(`[WARN] ${pkg} not found from current directory.`);
  }
}
NODE

echo "[OK] Environment check complete"
