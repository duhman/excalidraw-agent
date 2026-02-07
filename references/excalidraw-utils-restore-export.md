# Excalidraw Utils: Restore, Serialize, Export, Import

## Core Data Utilities

Use exports from `@excalidraw/excalidraw`:

- `serializeAsJSON`
- `serializeLibraryAsJSON`
- `loadFromBlob`
- `loadLibraryFromBlob`
- `loadSceneOrLibraryFromBlob`
- `restore`
- `restoreElements`
- `restoreAppState`
- `restoreLibraryItems`
- `mergeLibraryItems`

## Restore Strategy

Use restore helpers before persisting or merging external payloads:

1. Parse JSON payload.
2. Normalize with restore utility.
3. Apply to editor using API.

Scene normalization pattern:

```ts
const normalized = restore(importedData, localAppState ?? null, localElements ?? null);
api.updateScene({
  elements: normalized.elements,
  appState: normalized.appState,
  captureUpdate: CaptureUpdateAction.NEVER,
});
```

Library normalization pattern:

```ts
const normalizedItems = restoreLibraryItems(rawItems, "unpublished");
await api.updateLibrary({ libraryItems: normalizedItems, merge: false });
```

When running in Node-only automation contexts where `@excalidraw/excalidraw` cannot be imported cleanly, fallback normalization can be used, but official restore/merge utilities remain the preferred path whenever runtime compatibility allows.

## Library Merge Pattern

```ts
const base = restoreLibraryItems(baseItems, defaultStatus);
const other = restoreLibraryItems(otherItems, defaultStatus);
const merged = mergeLibraryItems(base, other);
```

Use this approach instead of ad hoc JSON concatenation.

## Export Utilities

- `exportToCanvas`
- `exportToBlob`
- `exportToSvg`
- `exportToClipboard`

Important export `appState` flags:

- `exportBackground`
- `viewBackgroundColor`
- `exportWithDarkMode`
- `exportEmbedScene`

## Import Safety

- Validate file type before scene apply.
- If `loadSceneOrLibraryFromBlob` returns library payload, call `updateLibrary` not `updateScene`.
- When preserving user defaults, pass `localAppState` into restore helpers.

## Practical Contracts

Scene envelope (`.excalidraw`) should include:

- `type: "excalidraw"`
- `version`
- `elements`
- `appState`
- `files`

Library envelope (`.excalidrawlib`) should include:

- `type: "excalidrawlib"`
- `version`
- `libraryItems`
