# Excalidraw Agent Client Compatibility

## Purpose

This reference explains how to use this skill across agent clients (Codex, Claude Code, Cursor, Zed) without changing the core skill behavior.

## Compatibility Model

- Canonical contract: `SKILL.md` frontmatter + body.
- Optional resources: `references/`, `scripts/`, `assets/`.
- Client-specific metadata: `agents/openai.yaml` is optional and mainly used by Codex UI.
- Non-Codex clients should rely on `SKILL.md` and can ignore `agents/openai.yaml`.

## Skill Directory Placement

Use one of these patterns:

1. Copy skill folder into the client skill root.
2. Symlink skill folder from the project location into the client skill root.

Examples of commonly used local roots:

- `~/.codex/skills/excalidraw-agent`
- `~/.claude/skills/excalidraw-agent`
- `~/.cursor/skills/excalidraw-agent`
- `~/.config/zed/skills/excalidraw-agent`

If your client uses another root, keep the same folder structure and ensure the client can read `SKILL.md`.

## Runtime Requirements

- `node` available on `PATH`
- `pnpm` available on `PATH`
- `npx` available on `PATH` (needed for Playwright fallback and some validation flows)

Run:

```bash
bash scripts/check_env.sh
```

## Playwright Provider Resolution

`scripts/import_to_excalidraw.sh` resolves a browser runner in this order:

1. `--pwcli <path>` flag
2. `PWCLI` environment variable
3. known wrapper paths under `~/.codex`, `~/.claude`, `~/.cursor`, `~/.config/zed`
4. global `playwright-cli`
5. `npx --yes --package @playwright/mcp playwright-cli`

This makes account-linked import portable across clients.

## Validation by Client

Minimal portability check:

```bash
bash scripts/check_env.sh
bash scripts/import_to_excalidraw.sh \
  --input assets/examples/scene-minimal.excalidraw \
  --destination plus \
  --dry-run true
```

Full local verification:

```bash
bash scripts/self_test.sh
npx --yes skills-ref validate <path-to-skill-dir>
```

## Known Client-Specific Notes

- Codex: can additionally read `agents/openai.yaml` for skill UI metadata.
- Claude Code/Cursor/Zed: use `SKILL.md` instructions directly; metadata files not recognized by that client are ignored.
- If a client restricts interactive browser automation, use `--dry-run true` for planning and run import in a permissive shell.

## Troubleshooting Cross-Client Issues

1. Skill not discovered:
   - verify folder name matches frontmatter `name` (`excalidraw-agent`)
   - verify `SKILL.md` is at the skill root
2. Script path issues:
   - run commands from skill root, or use absolute paths
3. Browser automation not launching:
   - pass `--pwcli` explicitly
   - verify `playwright-cli` or `npx` availability
4. Dependencies not resolved:
   - run from project with required packages installed, or install in temporary workspace
