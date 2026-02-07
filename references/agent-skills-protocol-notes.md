# Agent Skills Protocol Notes for `excalidraw-agent`

## Required Skill Format

A valid skill directory must contain `SKILL.md` with YAML frontmatter and Markdown body.

Required frontmatter fields:

- `name`
- `description`

Current skill uses:

- `name: excalidraw-agent`
- trigger-rich `description` covering Excalidraw, Mermaid, `.excalidraw`, `.excalidrawlib`, integration, and troubleshooting contexts.

## Naming and Structure Constraints

- Name must match parent directory.
- Name should be lowercase with hyphen separators and no trailing/leading hyphen.
- Keep `SKILL.md` concise; place deep content into `references/`.

## Progressive Disclosure Contract

1. Metadata loaded at discovery time.
2. Full `SKILL.md` loaded on activation.
3. `references/`, `scripts/`, `assets/` loaded only when needed.

This skill intentionally keeps references one hop from `SKILL.md`.

## File Reference Practice

Use root-relative references from skill directory, for example:

- `references/excalidraw-props-and-api.md`
- `scripts/mermaid_to_scene.mjs`
- `references/excalidraw-account-linking.md`
- `references/excalidraw-client-compatibility.md`
- `scripts/import_to_excalidraw.sh`

Avoid nested chains where one reference depends on another reference to be useful.

## Validation and Prompt Generation

Reference tooling:

- Validate:
  - `skills-ref validate <path-to-skill-dir>`
- Read properties:
  - `skills-ref read-properties <path-to-skill-dir>`
- Prompt XML:
  - `skills-ref to-prompt <path-to-skill-dir>`

Optional local validator:

- `python <path-to-skill-creator>/scripts/quick_validate.py <path-to-skill-dir>`

## Codex Metadata

`agents/openai.yaml` provides UI-facing metadata:

- `display_name`
- `short_description`
- `default_prompt`

This file is not required by core Agent Skills spec but is kept for Codex UX compatibility.
Other clients (for example Claude Code, Cursor, and Zed) can use `SKILL.md` + references/scripts directly and ignore `agents/openai.yaml`.

## Cross-Client Portability Rules

To keep this skill portable across agent clients:

1. Keep all operational behavior specified in `SKILL.md` (not in client-specific metadata files).
2. Keep script invocation examples skill-root relative.
3. Avoid hardcoded single-client paths in docs and scripts.
4. Treat `agents/openai.yaml` as optional metadata, never as required execution config.
