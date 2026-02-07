# Excalidraw Install and Integration

## Package Baseline

Install core dependencies:

```bash
pnpm add react react-dom @excalidraw/excalidraw
```

Optional Mermaid conversion support:

```bash
pnpm add @excalidraw/mermaid-to-excalidraw
```

Version baseline used by this skill:

- `@excalidraw/excalidraw`: `0.18.0`
- `@excalidraw/mermaid-to-excalidraw`: `2.0.0`

## Required Embed Contract

1. Import stylesheet:
   - `import "@excalidraw/excalidraw/index.css";`
2. Excalidraw must render inside a container with non-zero dimensions.
3. Use `excalidrawAPI` callback for imperative integration.

## React Integration (Base)

```tsx
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

export function Whiteboard() {
  return (
    <div style={{ height: "70vh", width: "100%" }}>
      <Excalidraw />
    </div>
  );
}
```

## Next.js Integration

Excalidraw is client-side only. Do not SSR it.

### Pattern: dynamic import

```tsx
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false },
);

export default function WhiteboardPage() {
  return (
    <div style={{ height: "80vh", width: "100%" }}>
      <Excalidraw />
    </div>
  );
}
```

If using app router wrappers, keep the wrapper client-only and still use dynamic import when needed.

## Preact Caveat

For Preact builds, Excalidraw docs require enabling preact build mode:

- set `process.env.IS_PREACT = "true"`
- for Vite, expose this env via `define`

## Self-hosting Fonts and Asset Path

By default, Excalidraw fetches fonts/assets from CDN.

For self-hosting:

1. Copy `node_modules/@excalidraw/excalidraw/dist/prod/fonts` into hosted assets.
2. Set `window.EXCALIDRAW_ASSET_PATH` to that asset root.

Examples:

- root-hosted assets: `window.EXCALIDRAW_ASSET_PATH = "/";`
- CDN-hosted assets: `window.EXCALIDRAW_ASSET_PATH = "https://cdn.example.com/assets/";`

## Common Integration Failures

- Blank canvas: container height is `0`.
- Missing styles: forgot `index.css` import.
- Next.js hydration/runtime mismatch: SSR not disabled.
- Fonts/icons not loading: incorrect `EXCALIDRAW_ASSET_PATH`.

## Validation Steps

1. Editor renders and accepts pointer input.
2. Toolbar and menus are visible.
3. Export dialog opens.
4. No SSR/runtime errors in console for Next.js.

