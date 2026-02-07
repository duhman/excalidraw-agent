#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXAMPLES_DIR="$SKILL_ROOT/assets/examples"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/excalidraw-agent-test-XXXXXX")"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "[1/12] Checking runtime environment"
"$SCRIPT_DIR/check_env.sh"

echo "[2/12] Creating temporary Node workspace at $TMP_DIR"
cat > "$TMP_DIR/package.json" <<'JSON'
{
  "name": "excalidraw-agent-self-test",
  "private": true,
  "type": "module"
}
JSON

(
  cd "$TMP_DIR"
  pnpm add --silent @excalidraw/excalidraw@0.18.0 @excalidraw/mermaid-to-excalidraw@2.0.0
)

echo "[3/12] Running Mermaid -> scene conversion"
(
  cd "$TMP_DIR"
  node "$SCRIPT_DIR/mermaid_to_scene.mjs" \
    --input "$EXAMPLES_DIR/flowchart-basic.mmd" \
    --output "$TMP_DIR/generated.excalidraw" \
    --font-size 16 \
    --regenerate-ids true \
    --pretty true
)

echo "[4/12] Linting generated scene"
(
  cd "$TMP_DIR"
  node "$SCRIPT_DIR/scene_lint.mjs" --input "$TMP_DIR/generated.excalidraw"
)

echo "[5/12] Verifying linter catches invalid payload"
cat > "$TMP_DIR/invalid.excalidraw" <<'JSON'
{
  "type": "excalidraw",
  "version": 2,
  "elements": [
    { "id": "dup", "type": "rectangle", "width": 0, "height": 0, "fileId": "missing-file" },
    { "id": "dup", "type": "ellipse", "width": 10, "height": 10 }
  ],
  "files": {}
}
JSON

if (
  cd "$TMP_DIR"
  node "$SCRIPT_DIR/scene_lint.mjs" --input "$TMP_DIR/invalid.excalidraw" >/dev/null 2>&1
); then
  echo "[ERROR] scene_lint unexpectedly succeeded on invalid input" >&2
  exit 1
fi

echo "[6/12] Merging sample libraries"
(
  cd "$TMP_DIR"
  node "$SCRIPT_DIR/library_merge.mjs" \
    --base "$EXAMPLES_DIR/lib-a.excalidrawlib" \
    --other "$EXAMPLES_DIR/lib-b.excalidrawlib" \
    --output "$TMP_DIR/merged.excalidrawlib" \
    --default-status unpublished
)

node - "$TMP_DIR/merged.excalidrawlib" <<'NODE'
const fs = require("node:fs");
const file = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
if (!Array.isArray(data.libraryItems) || data.libraryItems.length < 2) {
  console.error("Merged library does not contain expected items");
  process.exit(1);
}
console.log(`[OK] merged library has ${data.libraryItems.length} item(s)`);
NODE

echo "[7/12] Dry-run account-link import: scene -> plus"
bash "$SCRIPT_DIR/import_to_excalidraw.sh" \
  --input "$EXAMPLES_DIR/scene-minimal.excalidraw" \
  --destination plus \
  --dry-run true \
  --output-dir "$TMP_DIR" >/dev/null

echo "[8/12] Dry-run account-link import: library -> plus"
bash "$SCRIPT_DIR/import_to_excalidraw.sh" \
  --input "$EXAMPLES_DIR/lib-a.excalidrawlib" \
  --destination plus \
  --dry-run true \
  --output-dir "$TMP_DIR" >/dev/null

echo "[9/12] Dry-run account-link import: scene -> excalidraw"
bash "$SCRIPT_DIR/import_to_excalidraw.sh" \
  --input "$EXAMPLES_DIR/scene-minimal.excalidraw" \
  --destination excalidraw \
  --dry-run true \
  --output-dir "$TMP_DIR" >/dev/null

echo "[10/12] Verifying invalid extension fails"
cat > "$TMP_DIR/not-supported.txt" <<'TXT'
not a valid excalidraw file
TXT

if bash "$SCRIPT_DIR/import_to_excalidraw.sh" \
  --input "$TMP_DIR/not-supported.txt" \
  --dry-run true >/dev/null 2>&1; then
  echo "[ERROR] import_to_excalidraw unexpectedly succeeded on invalid extension" >&2
  exit 1
fi

echo "[11/12] Verifying invalid --pwcli path fails deterministically"
if bash "$SCRIPT_DIR/import_to_excalidraw.sh" \
  --input "$EXAMPLES_DIR/scene-minimal.excalidraw" \
  --dry-run true \
  --pwcli "$TMP_DIR/does-not-exist.sh" >/dev/null 2>&1; then
  echo "[ERROR] import_to_excalidraw unexpectedly accepted invalid --pwcli path" >&2
  exit 1
fi

echo "[12/12] Self-test complete"
echo "[OK] All self-tests passed"
