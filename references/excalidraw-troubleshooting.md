# Excalidraw Troubleshooting

## SSR and Build Failures

### Symptom

- hydration mismatch
- runtime crash in Next.js server context

### Fix

- render Excalidraw only on client
- use dynamic import with `ssr: false`

## Editor Not Visible

### Symptom

Canvas area appears blank or collapsed.

### Fix

- verify parent container has non-zero height and width
- verify stylesheet import: `@excalidraw/excalidraw/index.css`

## Asset and Font Issues

### Symptom

Fonts/icons fail to load.

### Fix

- set `window.EXCALIDRAW_ASSET_PATH` correctly
- verify self-hosted font files are served from expected path

## Preact Build Issues

### Symptom

Preact integration fails due to runtime/build mismatch.

### Fix

- set `process.env.IS_PREACT = "true"`
- expose env in bundler config (for Vite, `define` setting)

## Browser-Specific Text Rendering Issues

### Symptom

Text element measurement/rendering issues in Brave.

### Fix

- disable aggressive anti-fingerprinting mode for affected origin

## Mermaid Import Looks Collapsed or Unreadable

### Symptom

Imported `.excalidraw` generated from Mermaid appears as a very tall single-column flow, with tiny or crowded labels and poor readability.

### Fix

1. shorten node labels (prefer short phrases over sentences)
2. split complex diagrams into smaller diagrams
3. regenerate with larger font size:
   - `node scripts/mermaid_to_scene.mjs --input diagram.mmd --output diagram.excalidraw --font-size 20 --regenerate-ids true --pretty true`
4. lint output:
   - `node scripts/scene_lint.mjs --input diagram.excalidraw --strict-diagram true`
5. if layout is still poor, manually arrange in Excalidraw after import

## Script Runtime Failures

### Symptom

Bundled scripts fail with module resolution errors.

### Fix

1. run `scripts/check_env.sh`
2. ensure Node + pnpm available
3. install required packages in current working directory:
   - `pnpm add @excalidraw/excalidraw@0.18.0 @excalidraw/mermaid-to-excalidraw@2.0.0`

## Account-Link Import Flow Failures

### Symptom

`import_to_excalidraw.sh` exits with non-zero code.

### Fix

1. check exit code meaning:
   - `2` bad args/input
   - `3` missing tooling (`npx`, Playwright wrapper)
   - `4` login checkpoint timeout
   - `5` import strategy failure
   - `6` UI assertion failure
   - `7` persistence confirmation missing/declined
2. rerun in dry-run mode to inspect planned flow:
   - `bash scripts/import_to_excalidraw.sh --input file.excalidraw --dry-run true`
3. rerun headed with larger timeout for MFA/captcha:
   - `--mode headed --timeout-sec 1200`
4. verify destination and file type alignment:
   - `.excalidraw` for scene
   - `.excalidrawlib` for library
5. verify Playwright wrapper exists:
   - pass `--pwcli <path>` explicitly, or set `PWCLI=<path>`
   - otherwise ensure one of these is available:
     - wrapper under `~/.codex`, `~/.claude`, `~/.cursor`, or `~/.config/zed`
     - global `playwright-cli`
     - `npx` (for `@playwright/mcp` fallback)

## Validation Approach

After any fix:

1. reproduce issue on minimal sample
2. apply targeted fix
3. rerun conversion/lint or host integration smoke test
4. confirm no regression in related flows

## Cross-Client Setup Issues

### Symptom

Skill works in one client runtime but fails in another.

### Fix

1. load `references/excalidraw-client-compatibility.md`
2. verify skill folder is in the expected client skill root
3. verify `SKILL.md` exists at skill root and folder name is `excalidraw-agent`
4. rerun minimal portability checks:
   - `bash scripts/check_env.sh`
   - `bash scripts/import_to_excalidraw.sh --input assets/examples/scene-minimal.excalidraw --dry-run true`
