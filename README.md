# excalidraw-agent

Production-grade Agent Skill for integrating and automating Excalidraw workflows across agent clients, including Codex, Claude Code, Cursor, and Zed.

This repository packages:

- Skill orchestration (`SKILL.md`) for progressive-disclosure agent execution.
- Domain references for Excalidraw installation, API usage, Mermaid conversion, collaboration patterns, export/import, and troubleshooting.
- Deterministic scripts for scene conversion, linting, library merge, account-linked import, and self-test verification.

## Table of Contents

1. [What This Skill Solves](#what-this-skill-solves)
2. [Repository Layout](#repository-layout)
3. [Requirements](#requirements)
4. [Quick Start](#quick-start)
5. [Script Reference](#script-reference)
6. [Account-Linked Import (Excalidraw / Excalidraw+)](#account-linked-import-excalidraw--excalidraw)
7. [Diagram Readability Guidance](#diagram-readability-guidance)
8. [Client Compatibility (Codex, Claude Code, Cursor, Zed)](#client-compatibility-codex-claude-code-cursor-zed)
9. [Validation and Quality Gates](#validation-and-quality-gates)
10. [Troubleshooting](#troubleshooting)
11. [Design Decisions and Guarantees](#design-decisions-and-guarantees)
12. [Version Baseline](#version-baseline)
13. [License](#license)

## What This Skill Solves

`excalidraw-agent` gives LLM agents a structured, deterministic way to handle Excalidraw end-to-end:

- Embed Excalidraw in React/Next.js host apps.
- Use Excalidraw props and imperative API correctly (`excalidrawAPI`, `updateScene`, event handlers).
- Convert Mermaid diagrams to `.excalidraw` scene files.
- Validate and lint generated/edited scenes.
- Merge and normalize `.excalidrawlib` libraries.
- Perform account-linked import in a real authenticated browser session.
- Diagnose integration/runtime issues quickly using a focused troubleshooting tree.

## Repository Layout

```text
.
├── SKILL.md
├── README.md
├── LICENSE.txt
├── agents/
│   └── openai.yaml
├── scripts/
│   ├── check_env.sh
│   ├── mermaid_to_scene.mjs
│   ├── scene_lint.mjs
│   ├── library_merge.mjs
│   ├── import_to_excalidraw.sh
│   └── self_test.sh
├── references/
│   ├── excalidraw-install-and-integration.md
│   ├── excalidraw-props-and-api.md
│   ├── excalidraw-utils-restore-export.md
│   ├── excalidraw-ui-composition.md
│   ├── excalidraw-mermaid-conversion.md
│   ├── excalidraw-collaboration-pattern.md
│   ├── excalidraw-account-linking.md
│   ├── excalidraw-client-compatibility.md
│   ├── excalidraw-troubleshooting.md
│   └── agent-skills-protocol-notes.md
└── assets/
    └── examples/
        ├── flowchart-basic.mmd
        ├── scene-minimal.excalidraw
        ├── lib-a.excalidrawlib
        └── lib-b.excalidrawlib
```

## Requirements

Required runtime:

- `node`
- `pnpm`
- `npx`
- `bash`

Optional tooling:

- `skills-ref` CLI (or use `npx --yes skills-ref ...`)
- Playwright CLI wrapper or command for interactive import automation

Check environment:

```bash
bash scripts/check_env.sh
```

## Quick Start

### 1) Validate the skill metadata/shape

```bash
npx --yes skills-ref validate .
```

### 2) Convert Mermaid to Excalidraw scene

```bash
node scripts/mermaid_to_scene.mjs \
  --input assets/examples/flowchart-basic.mmd \
  --output /tmp/flowchart.excalidraw \
  --font-size 16 \
  --regenerate-ids true \
  --pretty true
```

### 3) Lint resulting scene

```bash
node scripts/scene_lint.mjs --input /tmp/flowchart.excalidraw --strict-diagram true
```

### 4) Merge sample libraries

```bash
node scripts/library_merge.mjs \
  --base assets/examples/lib-a.excalidrawlib \
  --other assets/examples/lib-b.excalidrawlib \
  --output /tmp/merged.excalidrawlib \
  --default-status unpublished
```

### 5) Run full self-test

```bash
bash scripts/self_test.sh
```

## Script Reference

### `scripts/check_env.sh`

Purpose:

- Validates `node` and `pnpm` availability.
- Reports dependency visibility for Excalidraw packages from current working directory.

Usage:

```bash
bash scripts/check_env.sh
```

### `scripts/mermaid_to_scene.mjs`

Purpose:

- Converts Mermaid input into Excalidraw scene JSON envelope (`elements`, `appState`, `files`).
- Uses Excalidraw utils when available, with deterministic fallback normalization if runtime imports are unavailable.
- Prioritizes conversion correctness over visual layout optimization.

Usage:

```bash
node scripts/mermaid_to_scene.mjs \
  --input <file.mmd|-> \
  --output <file.excalidraw> \
  --font-size <number> \
  --regenerate-ids <true|false> \
  --pretty <true|false>
```

If the imported result is hard to read (for example a very tall single-column layout), apply the guidance in [Diagram Readability Guidance](#diagram-readability-guidance).

### `scripts/scene_lint.mjs`

Purpose:

- Validates scene payload integrity.
- Detects malformed structure, duplicate IDs, dangling file references, and invisible/tiny element issues.
- Optional strict diagram mode detects:
  - arrows without start/end bindings
  - text outside container sizing bounds
  - containerless text in diagram outputs

Usage:

```bash
node scripts/scene_lint.mjs --input <file.excalidraw> --strict-diagram <true|false>
```

### `scripts/library_merge.mjs`

Purpose:

- Restores and merges two `.excalidrawlib` files with normalization and dedupe behavior.
- Produces merged library output safe for Excalidraw consumption.

Usage:

```bash
node scripts/library_merge.mjs \
  --base <file-a.excalidrawlib> \
  --other <file-b.excalidrawlib> \
  --output <merged.excalidrawlib> \
  --default-status <published|unpublished>
```

### `scripts/import_to_excalidraw.sh`

Purpose:

- Opens Excalidraw in a real browser session.
- Pauses for manual login/MFA.
- Imports scene/library via deterministic strategy order.
- Performs UI assertions and captures screenshot proof.
- Enforces persistence confirmation for `plus` destination.

Usage:

```bash
bash scripts/import_to_excalidraw.sh \
  --input <path> \
  --destination <plus|excalidraw> \
  --kind <auto|scene|library> \
  --mode <headed|headless> \
  --session <name> \
  --output-dir <path> \
  --timeout-sec <n> \
  --dry-run <true|false> \
  --close-on-complete <true|false> \
  --pwcli <path>
```

Default behavior:

- `destination=plus`
- `kind=auto`
- `mode=headed`
- `session=excalidraw-link`
- `timeout-sec=600`

Exit codes:

- `2` bad arguments/input
- `3` tooling missing
- `4` login checkpoint timeout or decline
- `5` import action failure
- `6` UI assertion failure
- `7` persistence confirmation missing/declined

`RESULT_JSON` is emitted for machine-readable automation status.

### `scripts/self_test.sh`

Purpose:

- Runs deterministic golden-path checks across conversion, linting, merge, and import dry-run coverage.

Usage:

```bash
bash scripts/self_test.sh
```

## Account-Linked Import (Excalidraw / Excalidraw+)

Important constraints:

- No private API token flow is used.
- Authentication is manual in-browser.
- Credentials are never stored by this skill.

Destination mapping:

- `plus` -> `https://plus.excalidraw.com`
- `excalidraw` -> `https://excalidraw.com`

Import strategies are attempted in fixed order:

1. direct `input[type=file]` assignment
2. keyboard open-file + upload
3. menu-triggered open/import + upload

Manual checkpoints:

1. After login, type `continue` in terminal.
2. For Excalidraw+, confirm persisted workspace visibility by typing `yes`.

## Diagram Readability Guidance

Mermaid-to-Excalidraw conversion can produce technically correct but visually poor layouts for dense graphs (for example narrow, very tall diagrams with overlapping connectors). Use this process for readable outputs:

1. Keep labels short (2-5 words where possible).
2. Limit nodes per diagram; split into multiple diagrams when needed.
3. Prefer a simplified first-pass flowchart for communication artifacts.
4. Convert and lint:

```bash
node scripts/mermaid_to_scene.mjs --input diagram.mmd --output diagram.excalidraw --font-size 20 --regenerate-ids true --pretty true
node scripts/scene_lint.mjs --input diagram.excalidraw
```

5. If layout is still poor after import, do a light manual arrangement pass in Excalidraw and save as the presentation artifact.

Important: conversion scripts guarantee structural validity, not final presentation quality.

## Client Compatibility (Codex, Claude Code, Cursor, Zed)

Compatibility model:

- `SKILL.md` is the canonical contract.
- `references/`, `scripts/`, and `assets/` are portable across clients.
- `agents/openai.yaml` is optional metadata for Codex UI only.

Common placement patterns:

- `~/.codex/skills/excalidraw-agent`
- `~/.claude/skills/excalidraw-agent`
- `~/.cursor/skills/excalidraw-agent`
- `~/.config/zed/skills/excalidraw-agent`

Playwright provider resolution in `import_to_excalidraw.sh`:

1. explicit `--pwcli`
2. `PWCLI` env var
3. known wrapper paths under Codex/Claude/Cursor/Zed homes
4. global `playwright-cli`
5. `npx --yes --package @playwright/mcp playwright-cli`

Minimal cross-client smoke check:

```bash
bash scripts/check_env.sh
bash scripts/import_to_excalidraw.sh \
  --input assets/examples/scene-minimal.excalidraw \
  --destination plus \
  --dry-run true
```

## Validation and Quality Gates

Recommended validation stack:

```bash
npx --yes skills-ref validate .
bash scripts/self_test.sh
```

Optional metadata checks:

```bash
npx --yes skills-ref read-properties .
npx --yes skills-ref to-prompt .
```

Suggested CI checks:

- shell syntax check for `scripts/*.sh`
- `skills-ref validate`
- `scripts/self_test.sh`

## Troubleshooting

If anything fails, use:

- `references/excalidraw-troubleshooting.md`
- `references/excalidraw-account-linking.md`
- `references/excalidraw-client-compatibility.md`

Fast triage order:

1. Runtime missing (`node`, `pnpm`, `npx`) -> run `check_env.sh`
2. Module resolution problems -> run from project dir with required Excalidraw packages
3. Browser automation runner problems -> pass explicit `--pwcli`
4. Account import issues -> run `--dry-run true` first, then headed with larger timeout
5. Mermaid import unreadable -> simplify labels/graph, reconvert, then manually arrange if needed

## Design Decisions and Guarantees

Guarantees:

- Deterministic script interfaces and flag contracts.
- Progressive disclosure structure for agent context efficiency.
- Cross-client portable skill behavior (not tied to a single agent runtime).
- Human-in-the-loop account linking for strong security and MFA compatibility.

Non-goals:

- No promise of headless authentication bypass.
- No embedded full collaboration backend service.
- No private Excalidraw account API token integration.

## Version Baseline

Planning baseline used while authoring this skill:

- `@excalidraw/excalidraw`: `0.18.0`
- `@excalidraw/mermaid-to-excalidraw`: `2.0.0`

## License

See `LICENSE.txt`.
