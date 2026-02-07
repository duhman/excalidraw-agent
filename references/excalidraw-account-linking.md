# Excalidraw Account Linking via Authenticated UI Import

## What "Linked to Account" Means in This Skill

This skill does not use a private Excalidraw account API token flow.

Instead, it links generated content to your account by importing files in a browser session where you are already authenticated. For Excalidraw+, success is confirmed through a user checkpoint that imported content is visible in workspace/files context.

## Security Model

- Authentication is manual and interactive.
- Credentials are never captured or stored by this skill.
- Session state stays in the browser profile/session controlled by Playwright CLI.

## Supported Destinations

- `plus`: `https://plus.excalidraw.com`
- `excalidraw`: `https://excalidraw.com`

Default destination is `plus` when account-linked persistence is required.

## Supported Content Types

- `.excalidraw` (scene)
- `.excalidrawlib` (library)

Use `--kind auto` to infer from extension.

## Script Interface

```bash
scripts/import_to_excalidraw.sh \
  --input <path> \
  --destination <plus|excalidraw> \
  --kind <auto|scene|library> \
  --mode <headed|headless> \
  --session <name> \
  --output-dir <path> \
  --timeout-sec <n> \
  --dry-run <true|false> \
  --close-on-complete <true|false> \
  --pwcli <path-to-playwright-wrapper>
```

Recommended defaults:

- `--destination plus`
- `--mode headed`
- `--kind auto`

Playwright runner resolution order:

1. explicit `--pwcli` flag or `PWCLI` env var
2. known skill wrapper paths for Codex/Claude/Cursor/Zed homes
3. global `playwright-cli` command
4. `npx --yes --package @playwright/mcp playwright-cli`

For client-specific setup details, also load `references/excalidraw-client-compatibility.md`.

## Import Strategy Order

The script tries upload methods in deterministic order:

1. direct `input[type=file]` assignment
2. open-file shortcut then upload
3. menu-triggered open/import then upload

## Verification and Artifact Output

After import attempt, the script verifies:

- expected destination host
- canvas presence
- no obvious immediate error toast/dialog

Then captures a screenshot proof artifact in output directory (temp by default).

## Manual Checkpoints

1. Login checkpoint: type `continue` after completing sign-in/MFA.
2. Excalidraw+ persistence checkpoint: type `yes` after confirming imported content is visible in workspace/files context.

## Failure Handling

- MFA/CAPTCHA/manual auth delays: controlled by `--timeout-sec`.
- destination host mismatch: assertion failure.
- upload strategy exhaustion: import failure.
- no persistence confirmation on plus: explicit non-zero exit.

## Exit Codes

- `2`: argument/input validation failure
- `3`: tooling missing (`npx`, Playwright wrapper)
- `4`: login checkpoint timeout/decline
- `5`: import action failure
- `6`: assertion failure
- `7`: persistence confirmation missing/declined

## Manual Smoke Test Checklist

1. Scene import to plus:
   - `--input <file.excalidraw> --destination plus --mode headed`
2. Library import to plus:
   - `--input <file.excalidrawlib> --destination plus --mode headed`
3. Scene import to excalidraw:
   - `--input <file.excalidraw> --destination excalidraw --mode headed`
4. Confirm screenshot artifact path from output.
5. Confirm `RESULT_JSON` status is `success`.
