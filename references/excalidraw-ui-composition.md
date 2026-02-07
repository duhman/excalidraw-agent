# Excalidraw UI Composition

Use child components to extend editor UI while keeping editor behavior native.

## MainMenu

Render custom menu content with `<MainMenu>` and optionally include defaults via `MainMenu.DefaultItems.*`.

Key primitives:

- `MainMenu`
- `MainMenu.Item`
- `MainMenu.ItemLink`
- `MainMenu.ItemCustom`
- `MainMenu.Group`
- `MainMenu.DefaultItems.*`

When selecting custom menu actions, keep host-side side effects explicit.

## WelcomeScreen

Render `<WelcomeScreen />` to enable splash UX on empty canvas.

Composable groups:

- `WelcomeScreen.Center`
- `WelcomeScreen.Center.Logo`
- `WelcomeScreen.Center.Heading`
- `WelcomeScreen.Center.Menu`
- `WelcomeScreen.Hints.*`

Use this to direct first-run actions (load scene, help, collaboration entry).

## Sidebar

Use `<Sidebar name="...">` for custom right-side panels.

Key controls:

- `Sidebar.Header`
- `Sidebar.Tabs`
- `Sidebar.Tab`
- `Sidebar.TabTriggers`
- `Sidebar.TabTrigger`
- `Sidebar.Trigger`

Docking behavior can be host-controlled with `docked` + `onDock`.

Use `UIOptions.dockedSidebarBreakpoint` to tune docking availability.

## Footer

Use `<Footer>` children for desktop footer customization.

For mobile behavior, route equivalent actions into `MainMenu`.

## LiveCollaborationTrigger

Use `<LiveCollaborationTrigger>` with `renderTopRightUI` for a collaboration button matching Excalidraw UX.

Host app must supply:

- `isCollaborating`
- `onSelect` handler
- collaborator state updates (via `updateScene({ collaborators })`)

## Composition Guidelines

- Keep custom controls minimal and aligned with Excalidraw interaction model.
- Do not hide core controls unless product requirements demand it.
- Use semantic labels and titles for accessibility.

