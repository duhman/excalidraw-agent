# Excalidraw Collaboration Pattern (Host-Managed)

## Scope

`@excalidraw/excalidraw` does not include a full collaboration backend. Host apps own transport, identity, room membership, persistence, and conflict policy.

Excalidraw provides the scene surface and collaborator state rendering hooks.

## Recommended Architecture

1. Maintain authoritative room state in host backend.
2. Broadcast local scene deltas or snapshots over transport.
3. Apply remote updates through `updateScene`.
4. Keep remote updates out of local undo history.

## Remote Update Rule

Use non-undo capture for remote updates:

- `captureUpdate: CaptureUpdateAction.NEVER`

This prevents remote sync traffic from polluting local undo/redo behavior.

## Local Update Rule

Use immediate capture for local user actions:

- `captureUpdate: CaptureUpdateAction.IMMEDIATELY`

## Collaborators Surface

Render collaborator presence by updating `collaborators` map via `updateScene({ collaborators })`.

`LiveCollaborationTrigger` can display collaborator count when host provides that state.

## Suggested Event Wiring

- subscribe to editor changes (`onChange`) for outbound sync.
- debounce/coalesce outbound updates to avoid network churn.
- apply inbound updates using deterministic ordering (timestamp or vector clock strategy chosen by host).

## Failure Modes to Handle in Host App

- stale updates arriving late
- reconnect replay ordering
- duplicate event delivery
- partial room snapshots

Excalidraw skill code should document which ordering model is in effect.

