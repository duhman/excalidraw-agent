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
node scripts/scene_lint.mjs --input /tmp/flowchart.excalidraw
```

The script attempts the official `parseMermaidToExcalidraw` + `convertToExcalidrawElements` path first. If the current Node runtime cannot load required Excalidraw internals, it falls back to deterministic flowchart parsing and emits a warning.

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
