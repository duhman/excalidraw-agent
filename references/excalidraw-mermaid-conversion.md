# Excalidraw Mermaid Conversion

## Conversion Pipeline

Use two-step conversion:

1. `parseMermaidToExcalidraw(mermaidSyntax, { fontSize })`
2. `convertToExcalidrawElements(skeleton, { regenerateIds })`

Then normalize and write scene envelope.

## Scripted Path

Use bundled script:

```bash
node scripts/mermaid_to_scene.mjs \
  --input assets/examples/flowchart-basic.mmd \
  --output /tmp/flowchart.excalidraw \
  --font-size 16 \
  --regenerate-ids true \
  --pretty true
```

Then lint:

```bash
node scripts/scene_lint.mjs --input /tmp/flowchart.excalidraw --strict-diagram true
```

The script attempts the official `parseMermaidToExcalidraw` + `convertToExcalidrawElements` path first. If the current Node runtime cannot load required Excalidraw internals, it falls back to deterministic flowchart parsing and emits a warning.
Fallback output now enforces wrapped text in containers and bound connectors for better readability and editability.

## Supported Mermaid Scope

Based on Excalidraw mermaid docs:

- flowcharts are supported as native elements
- unsupported types can fallback to image representations
- unsupported shapes may degrade to closest supported Excalidraw shape

## Known Fallback Behaviors

- markdown-rich Mermaid labels may degrade to plain text
- unsupported icon sets may degrade to text
- unsupported arrowheads may be downgraded

Report these fallbacks explicitly when they appear.

## Reliability Guidelines

- Treat parser output as untrusted input and normalize before use.
- Preserve `files` returned by parser in final scene payload.
- Prefer pretty JSON for human audit in generated artifacts.

## Layout and Readability Limitations

Mermaid conversion can produce layouts that are valid but difficult to read in Excalidraw, especially for dense graphs with long labels. A common failure mode is a narrow, very tall single-column scene.

Recommended mitigation sequence:

1. Reduce label length and avoid sentence-like node text.
2. Reduce graph density (split one large flowchart into multiple smaller diagrams).
3. Increase conversion font size for readability:
   - `--font-size 20` or higher for presentation-oriented diagrams.
4. Re-run conversion and lint:
   - `node scripts/mermaid_to_scene.mjs ...`
   - `node scripts/scene_lint.mjs --strict-diagram true ...`
5. If still unreadable, manually arrange nodes/connectors in Excalidraw after import.

Use this rule of thumb:

- Script output is the structurally correct baseline.
- Final communication diagrams may require manual visual refinement.
