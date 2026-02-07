# Excalidraw Props and API

## High-Value Props

Use these first for host integration:

- `initialData`
- `excalidrawAPI`
- `onChange`
- `onPointerUpdate`
- `onPointerDown`
- `onScrollChange`
- `onPaste`
- `onLibraryChange`
- `generateLinkForSelection`
- `onLinkOpen`
- `theme`
- `UIOptions`
- `viewModeEnabled`
- `zenModeEnabled`
- `gridModeEnabled`
- `validateEmbeddable`
- `renderEmbeddable`

## `initialData`

Accepts object or promise resolving to object:

- `elements`
- `appState`
- `files`
- `libraryItems`
- `scrollToContent`

Use it for deterministic startup state. If preserving prior scroll, pass `appState.scrollX` and `appState.scrollY` when `scrollToContent` is false.

## `excalidrawAPI` Callback

Capture API instance for imperative operations:

```tsx
const [api, setApi] = useState(null);
<Excalidraw excalidrawAPI={setApi} />;
```

Key methods:

- `updateScene(sceneData)`
- `updateLibrary(opts)`
- `addFiles(files)`
- `resetScene(opts?)`
- `getSceneElements()`
- `getSceneElementsIncludingDeleted()`
- `getAppState()`
- `getFiles()`
- `scrollToContent(target?, opts?)`
- `setActiveTool(tool)`
- `setCursor(cursor)`
- `resetCursor()`
- `toggleSidebar(opts)`
- `setToast(toastOrNull)`
- subscriptions: `onChange`, `onPointerDown`, `onPointerUp`

## `captureUpdate` Semantics

When calling `updateScene`, control history behavior:

- `CaptureUpdateAction.IMMEDIATELY`: local undoable edits
- `CaptureUpdateAction.EVENTUALLY`: staged async updates
- `CaptureUpdateAction.NEVER`: remote sync and initialization updates

Use `NEVER` for remote collaboration updates to avoid polluting local undo stack.

## Event Hooks

- `props.onChange(elements, appState, files)` for persistence and analytics
- API subscription `api.onChange(...)` for imperative setup lifecycle
- pointer hooks for custom interaction telemetry

Always unsubscribe API subscriptions on teardown.

## UI and Mode Control

- `viewModeEnabled`, `zenModeEnabled`, `gridModeEnabled` become host-controlled when provided.
- `theme` becomes host-controlled when provided.
- `UIOptions` controls menu actions, tool visibility, sidebar docking breakpoints.

## Linking and Embed Handling

- `generateLinkForSelection` to customize generated element links
- `onLinkOpen` to intercept routing and call `event.preventDefault()` for internal app routing
- `validateEmbeddable` to control allowed embed hosts
- `renderEmbeddable` to replace default iframe rendering

## Integration Guardrails

- Prefer controlled behavior only when the host app actually needs control.
- Keep state ownership explicit: editor state vs host state.
- Treat library update flows as async and validate item status defaults.

