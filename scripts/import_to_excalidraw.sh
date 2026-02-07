#!/usr/bin/env bash
set -euo pipefail

EXIT_BAD_ARGS=2
EXIT_TOOLING=3
EXIT_LOGIN=4
EXIT_IMPORT=5
EXIT_ASSERT=6
EXIT_PERSISTENCE=7

DESTINATION="plus"
KIND="auto"
MODE="headed"
SESSION="excalidraw-link"
OUTPUT_DIR=""
TIMEOUT_SEC=600
DRY_RUN="false"
CLOSE_ON_COMPLETE="false"
INPUT_PATH=""
PWCLI_OVERRIDE=""
DEST_URL=""
EXPECTED_HOST=""

PW_CMD_LABEL=""
declare -a PW_CMD=()

usage() {
  cat <<'USAGE'
Usage:
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

Defaults:
  --destination plus
  --kind auto
  --mode headed
  --session excalidraw-link
  --timeout-sec 600
  --dry-run false
  --close-on-complete false
USAGE
}

is_bool() {
  [[ "$1" == "true" || "$1" == "false" ]]
}

json_string() {
  node -e 'console.log(JSON.stringify(process.argv[1]))' "$1"
}

log_info() {
  printf '[INFO] %s\n' "$1"
}

log_warn() {
  printf '[WARN] %s\n' "$1" >&2
}

log_error() {
  printf '[ERROR] %s\n' "$1" >&2
}

emit_result_json() {
  local status="$1"
  local reason="$2"
  local strategy="$3"
  local screenshot="$4"

  node -e '
const [status, reason, destination, kind, input, url, session, strategy, screenshot, pwProvider] = process.argv.slice(1);
const payload = {
  status,
  reason,
  destination,
  kind,
  input,
  url,
  session,
  strategy,
  screenshot,
  playwrightProvider: pwProvider,
  timestamp: new Date().toISOString(),
};
console.log("RESULT_JSON=" + JSON.stringify(payload));
' "$status" "$reason" "$DESTINATION" "$KIND" "$INPUT_PATH" "$DEST_URL" "$SESSION" "$strategy" "$screenshot" "$PW_CMD_LABEL"
}

fail() {
  local code="$1"
  local message="$2"
  emit_result_json "error" "$message" "none" ""
  log_error "$message"
  exit "$code"
}

prompt_with_timeout() {
  local message="$1"
  local expected="$2"
  local timeout="$3"
  local answer

  printf '%s\n' "$message"
  printf '> '
  if ! read -r -t "$timeout" answer; then
    return 1
  fi

  answer="$(echo "$answer" | tr '[:upper:]' '[:lower:]' | xargs)"
  [[ "$answer" == "$expected" ]]
}

resolve_playwright_command() {
  local candidate
  local explicit="${PWCLI_OVERRIDE:-${PWCLI:-}}"

  if [[ -n "$explicit" ]]; then
    if [[ -x "$explicit" ]]; then
      PW_CMD=("$explicit")
      PW_CMD_LABEL="wrapper:$explicit"
      return 0
    fi
    fail "$EXIT_TOOLING" "Playwright wrapper specified by --pwcli/PWCLI is not executable: $explicit"
  fi

  for candidate in \
    "${CODEX_HOME:-$HOME/.codex}/skills/playwright/scripts/playwright_cli.sh" \
    "$HOME/.claude/skills/playwright/scripts/playwright_cli.sh" \
    "$HOME/.cursor/skills/playwright/scripts/playwright_cli.sh" \
    "$HOME/.config/zed/skills/playwright/scripts/playwright_cli.sh"
  do
    if [[ -x "$candidate" ]]; then
      PW_CMD=("$candidate")
      PW_CMD_LABEL="wrapper:$candidate"
      return 0
    fi
  done

  if command -v playwright-cli >/dev/null 2>&1; then
    PW_CMD=(playwright-cli)
    PW_CMD_LABEL="global:playwright-cli"
    return 0
  fi

  if command -v npx >/dev/null 2>&1; then
    PW_CMD=(npx --yes --package @playwright/mcp playwright-cli)
    PW_CMD_LABEL="npx:@playwright/mcp"
    return 0
  fi

  fail "$EXIT_TOOLING" "No Playwright CLI runner found. Provide --pwcli, install playwright-cli globally, or install Node.js/npm (for npx fallback)."
}

run_pw() {
  "${PW_CMD[@]}" --session "$SESSION" "$@"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)
      INPUT_PATH="${2:-}"
      shift 2
      ;;
    --destination)
      DESTINATION="${2:-}"
      shift 2
      ;;
    --kind)
      KIND="${2:-}"
      shift 2
      ;;
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --session)
      SESSION="${2:-}"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="${2:-}"
      shift 2
      ;;
    --timeout-sec)
      TIMEOUT_SEC="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="${2:-}"
      shift 2
      ;;
    --close-on-complete)
      CLOSE_ON_COMPLETE="${2:-}"
      shift 2
      ;;
    --pwcli)
      PWCLI_OVERRIDE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      fail "$EXIT_BAD_ARGS" "Unknown argument: $1"
      ;;
  esac
done

if [[ -z "$INPUT_PATH" ]]; then
  usage
  fail "$EXIT_BAD_ARGS" "Missing required flag: --input"
fi

if ! [[ "$DESTINATION" == "plus" || "$DESTINATION" == "excalidraw" ]]; then
  fail "$EXIT_BAD_ARGS" "--destination must be plus or excalidraw"
fi

if ! [[ "$KIND" == "auto" || "$KIND" == "scene" || "$KIND" == "library" ]]; then
  fail "$EXIT_BAD_ARGS" "--kind must be auto, scene, or library"
fi

if ! [[ "$MODE" == "headed" || "$MODE" == "headless" ]]; then
  fail "$EXIT_BAD_ARGS" "--mode must be headed or headless"
fi

if ! [[ "$TIMEOUT_SEC" =~ ^[0-9]+$ ]] || [[ "$TIMEOUT_SEC" -le 0 ]]; then
  fail "$EXIT_BAD_ARGS" "--timeout-sec must be a positive integer"
fi

if ! is_bool "$DRY_RUN"; then
  fail "$EXIT_BAD_ARGS" "--dry-run must be true or false"
fi

if ! is_bool "$CLOSE_ON_COMPLETE"; then
  fail "$EXIT_BAD_ARGS" "--close-on-complete must be true or false"
fi

if [[ ! -f "$INPUT_PATH" ]]; then
  fail "$EXIT_BAD_ARGS" "Input file not found: $INPUT_PATH"
fi

INPUT_PATH="$(cd "$(dirname "$INPUT_PATH")" && pwd)/$(basename "$INPUT_PATH")"
EXT="${INPUT_PATH##*.}"
EXT="$(echo "$EXT" | tr '[:upper:]' '[:lower:]')"

case "$EXT" in
  excalidraw)
    EXT_KIND="scene"
    ;;
  excalidrawlib)
    EXT_KIND="library"
    ;;
  *)
    fail "$EXIT_BAD_ARGS" "Unsupported file extension '.$EXT'. Expected .excalidraw or .excalidrawlib"
    ;;
esac

if [[ "$KIND" == "auto" ]]; then
  KIND="$EXT_KIND"
elif [[ "$KIND" != "$EXT_KIND" ]]; then
  fail "$EXIT_BAD_ARGS" "--kind ($KIND) does not match file extension .$EXT"
fi

if [[ "$DESTINATION" == "plus" ]]; then
  DEST_URL="https://plus.excalidraw.com"
  EXPECTED_HOST="plus.excalidraw.com"
else
  DEST_URL="https://excalidraw.com"
  EXPECTED_HOST="excalidraw.com"
fi

if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/excalidraw-import-XXXXXX")"
else
  mkdir -p "$OUTPUT_DIR"
fi

BASE_NAME="$(basename "$INPUT_PATH")"
BASE_NAME="${BASE_NAME%.*}"
STAMP="$(date +%Y%m%d-%H%M%S)"
SCREENSHOT_PATH="$OUTPUT_DIR/${BASE_NAME}-${DESTINATION}-${STAMP}.png"

resolve_playwright_command

if [[ "$DRY_RUN" == "true" ]]; then
  log_info "Dry-run mode enabled. No browser actions will run."
  log_info "Input: $INPUT_PATH"
  log_info "Kind: $KIND"
  log_info "Destination: $DESTINATION ($DEST_URL)"
  log_info "Mode: $MODE"
  log_info "Session: $SESSION"
  log_info "Playwright provider: $PW_CMD_LABEL"
  log_info "Output screenshot path: $SCREENSHOT_PATH"
  log_info "Planned strategy order: A=input[type=file], B=keyboard-open+upload, C=menu-open+upload"
  emit_result_json "dry-run" "planned" "none" "$SCREENSHOT_PATH"
  exit 0
fi

log_info "Opening destination in browser"
log_info "Playwright provider: $PW_CMD_LABEL"
run_pw open "$DEST_URL" "--$MODE" >/dev/null

if ! prompt_with_timeout "Complete login/MFA in the browser, then type: continue" "continue" "$TIMEOUT_SEC"; then
  fail "$EXIT_LOGIN" "Login checkpoint not confirmed within timeout"
fi

SUCCESS_STRATEGY=""
FILE_JSON="$(json_string "$INPUT_PATH")"
EXPECTED_HOST_JSON="$(json_string "$EXPECTED_HOST")"
SCREENSHOT_JSON="$(json_string "$SCREENSHOT_PATH")"

assert_ui() {
  local assert_js
  assert_js=$(cat <<EOF_ASSERT
const host = new URL(page.url()).host;
if (!(host === ${EXPECTED_HOST_JSON} || host.endsWith('.' + ${EXPECTED_HOST_JSON}))) {
  throw new Error('unexpected host after import: ' + host);
}
const canvas = document.querySelector('.excalidraw canvas, canvas');
if (!canvas) {
  throw new Error('excalidraw canvas not found');
}
const badNodes = [...document.querySelectorAll('[role="alert"], [data-testid*="toast"], .Toastify__toast, .toast, [class*="toast"]')];
const bad = badNodes.find((node) => /(failed|error|invalid|unable|could not)/i.test((node.textContent || '').trim()));
if (bad) {
  throw new Error('error toast detected: ' + (bad.textContent || '').trim());
}
EOF_ASSERT
)
  run_pw run-code "$assert_js" >/dev/null
}

attempt_strategy_a() {
  local js
  js=$(cat <<EOF_A
const input = await page.\$('input[type="file"]');
if (!input) {
  throw new Error('no file input available for direct assignment');
}
await input.setInputFiles(${FILE_JSON});
await page.waitForTimeout(1200);
EOF_A
)
  run_pw run-code "$js" >/dev/null
}

attempt_strategy_b() {
  local js
  js=$(cat <<'EOF_B'
const combo = process.platform === 'darwin' ? 'Meta+O' : 'Control+O';
await page.keyboard.press(combo);
await page.waitForTimeout(800);
EOF_B
)
  run_pw run-code "$js" >/dev/null
  run_pw upload "$INPUT_PATH" >/dev/null
  run_pw run-code "await page.waitForTimeout(1200)" >/dev/null
}

attempt_strategy_c() {
  local js
  js=$(cat <<'EOF_C'
const nodes = [...document.querySelectorAll('button, [role="menuitem"], a, div')];
const target = nodes.find((node) => /(open|import|load|file)/i.test((node.textContent || '').trim()));
if (!target) {
  throw new Error('no menu trigger found for import');
}
target.click();
await page.waitForTimeout(800);
EOF_C
)
  run_pw run-code "$js" >/dev/null
  run_pw upload "$INPUT_PATH" >/dev/null
  run_pw run-code "await page.waitForTimeout(1200)" >/dev/null
}

for strategy in A B C; do
  log_info "Trying import strategy $strategy"
  if [[ "$strategy" == "A" ]]; then
    if attempt_strategy_a && assert_ui; then
      SUCCESS_STRATEGY="A"
      break
    fi
  elif [[ "$strategy" == "B" ]]; then
    if attempt_strategy_b && assert_ui; then
      SUCCESS_STRATEGY="B"
      break
    fi
  else
    if attempt_strategy_c && assert_ui; then
      SUCCESS_STRATEGY="C"
      break
    fi
  fi
  log_warn "Strategy $strategy failed"
done

if [[ -z "$SUCCESS_STRATEGY" ]]; then
  fail "$EXIT_IMPORT" "All import strategies failed"
fi

log_info "Capturing proof screenshot"
run_pw run-code "await page.screenshot({ path: ${SCREENSHOT_JSON}, fullPage: true });" >/dev/null

if ! assert_ui; then
  fail "$EXIT_ASSERT" "Post-import UI assertions failed"
fi

if [[ "$DESTINATION" == "plus" ]]; then
  if ! prompt_with_timeout "Confirm the imported content is visible in your Excalidraw+ workspace/files. Type: yes" "yes" "$TIMEOUT_SEC"; then
    fail "$EXIT_PERSISTENCE" "Persistence confirmation not provided"
  fi
fi

if [[ "$CLOSE_ON_COMPLETE" == "true" ]]; then
  run_pw close >/dev/null || log_warn "Could not close browser session cleanly"
fi

emit_result_json "success" "imported" "$SUCCESS_STRATEGY" "$SCREENSHOT_PATH"
log_info "Import complete"
log_info "Destination: $DESTINATION"
log_info "Kind: $KIND"
log_info "Strategy: $SUCCESS_STRATEGY"
log_info "Screenshot: $SCREENSHOT_PATH"
