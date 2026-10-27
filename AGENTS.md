# Infinite Engine AI Guide

Use this file when an AI coding assistant works on Infinite Engine itself or on
a game created with Infinite Engine (IE).

## What Infinite Engine is

Infinite Engine is a VS Code extension for building and running 3D games. It
provides custom editors for scenes, actors, visual scripts, materials, terrain,
animation state machines, and user interfaces.

Prefer the Infinite Engine editors for interactive authoring. When editing the
serialized files directly, preserve their schemas, IDs, references, and
hierarchies exactly.

## Native game authoring requirements

When a user asks to create, build, prototype, or improve a game for Infinite
Engine, the result must be a native Infinite Engine project. Build the visible
game world with IE scenes, actors, components, cameras, lights, geometry,
materials, terrain, UI assets, and the public runtime APIs that the engine
provides.

Do not substitute a browser game for an Infinite Engine game. Unless the user
explicitly requests a browser-based implementation:

- Do not create DOM elements or use HTML, SVG, Canvas 2D, or a separate WebGL
  renderer to display the game world or its interface.
- Do not cover the Scene Editor or play surface with a fullscreen browser
  overlay.
- Do not manually draw actors, terrain, lighting, or HUD elements from
  `main.js`.
- Do not treat importing `Game` from `@infinite/Runtime` as sufficient use of
  Infinite Engine when rendering and interaction bypass the engine.

For a playable game, create or update the complete project structure needed to
open and run it in IE: `Infinite.ieproject`, at least one `.iescene`, required
`.ieasset` files, and the entry script when gameplay logic is needed. The start
scene must contain the native camera, lighting, world content, and actors that
the player sees in play mode. Use `main.js` to coordinate game behavior, not to
replace scene rendering or the asset system.

Before implementing a game request, inspect an existing valid project or the
relevant engine serializers and templates to determine the current component
and asset schemas. Do not invent serialized component shapes from this guide's
abbreviated examples. After implementation, verify that the project opens in
the Infinite Engine editors and runs through IE play mode.

## Required documentation

The authoritative authoring documentation is bundled with the Infinite Engine
extension under `docs/`. Before creating or modifying an Infinite Engine game,
read the documentation index and the references relevant to the task:

1. `docs/README.md`
2. `docs/project-format.md`
3. `docs/scene-format.md`
4. `docs/components.md`
5. `docs/assets.md`
6. `docs/runtime-api.md`
7. `docs/input-and-gameplay.md`
8. `docs/validation.md`

Also read `docs/visual-scripting.md` before creating or modifying visual
scripts, and `docs/ui.md` before creating or modifying native UI. Inspect
`docs/examples/native-game/` before generating a new game project.

Documentation work under `docs/` is additionally governed by
`docs/AGENTS.md`. Do not begin implementation until the documentation relevant
to the requested feature has been read. If documentation conflicts with the
implementation, inspect the source, preserve working behavior, and report the
discrepancy.

These paths are relative to the Infinite Engine extension repository. An agent
working in a separate game-only workspace cannot discover extension-bundled
documentation automatically. In that situation, read the published extension
documentation at:

`https://github.com/SterlyDolce/VSCodeInfiniteEngine/tree/main/docs`

Use the bundled local documentation when it is available because it matches the
checked-out extension version. Otherwise, use the published documentation from
the matching repository branch or release. If neither is accessible, make the
extension repository available in the workspace or copy this guide and the
required `docs/` files into the game project. Do not proceed by guessing when
the referenced documentation is unavailable.

## Game project layout

A normal IE game project looks like this:

```text
Game/
├── Assets/                 # Reusable .ieasset files
├── Scenes/                 # Playable .iescene files
├── Scripts/
│   └── Nodes/              # Optional **/*.ienode.mjs custom nodes
├── Infinite.ieproject      # Project configuration
└── main.js                 # JavaScript game entry point
```

`Infinite.ieproject` uses project-relative paths:

```json
{
    "name": "My Game",
    "version": 1,
    "entry": "main.js",
    "startScene": "Scenes/Main.iescene"
}
```

Never confuse scenes with assets:

- `.iescene` is a standalone playable scene document. It is not wrapped in an
  asset envelope and does not have an asset UUID.
- `.ieasset` is a reusable asset with top-level `id`, `name`, `type`, and
  `data` fields.
- Scene references used by the Open Scene visual-script node are scene URIs at
  runtime. The editor displays the scene filename instead of that URI.

## Scenes

A scene contains a name, version, and actor array:

```json
{
    "name": "Main",
    "version": 1,
    "actors": [
        {
            "id": "UUID",
            "name": "World",
            "type": "World",
            "components": []
        }
    ]
}
```

Rules:

- Every scene must contain exactly one usable `World` actor.
- Every actor and component ID must be unique within the scene.
- Generate IDs as UUIDs. Never reuse an ID copied from another object.
- Non-World actors normally use the World actor ID as `parent`.
- Component `parent` values describe component hierarchy and are separate from
  actor hierarchy.
- Keep transforms as three-number arrays. Positions and scales are ordinary
  values; rotations are serialized in radians.
- Do not add `id`, `type`, or `data` as a wrapper around an `.iescene` file.

The Open Scene visual-script node accepts only `.iescene` files from the same
project. During play it replaces the active gameplay scene. Outside play mode
it opens the target in the Scene Editor.

## Assets and references

The standard `.ieasset` envelope is:

```json
{
    "id": "UUID",
    "name": "Asset Name",
    "type": "script",
    "data": {}
}
```

Common asset types are `actor`, `script`, `geometry`, `material`, `texture`,
`terrain`, `skeleton`, `animation`, `animationState`, and `ui`.

Asset references normally use the target asset's UUID, either as a string or
as a typed object accepted by that field:

```json
{ "type": "material", "id": "UUID" }
```

Do not use filenames in fields that expect asset UUIDs. Do not use an asset
UUID where a scene URI/path is expected.

## JavaScript runtime

The project entry script imports the engine through its runtime alias:

```js
const { Game } = require('@infinite/Runtime');

class MyGame extends Game {
    onBegin() {
        // Called once when play starts.
    }

    onUpdate(deltaTime) {
        // Called every active frame. deltaTime is in seconds.
    }

    onEnd() {
        // Called once when play stops.
    }
}

module.exports = MyGame;
```

Use `print(value)` for the Infinite Engine output channel. Do not import files
from the installed extension by relative filesystem path; use
`@infinite/Runtime`.

The entry script is a gameplay lifecycle hook, not an alternate rendering
surface. Game code must not create a canvas, DOM-based HUD, or its own renderer
unless the user specifically asks for browser-rendered content. Prefer native
actors, components, visual scripts, and UI assets for gameplay and presentation.

Keep `onUpdate` fast, deterministic, and free of blocking work. Release any
listeners or external resources created by game code during teardown.

## Visual scripts

A visual-script asset has `type: "script"`. Its `data` contains `nodes`,
`links`, `variables`, and `functions` arrays.

- Node and pin IDs are UUIDs and must be unique.
- A link's `from` value is an output pin ID and its `to` value is an input pin
  ID.
- Execution pins connect only to execution pins.
- Ordinary input pins accept at most one incoming link.
- Prefer editing graphs through the Visual Script Editor because it creates
  valid pins from the current node registry.
- Do not rename serialized node `type` identifiers. Display names may change,
  but type identifiers are compatibility contracts.
- Asset inputs use `type: "asset"` plus an `assetType` filter.
- The scene picker uses `assetType: "scene"`, even though scenes are
  `.iescene` documents rather than `.ieasset` files.

## Custom visual-script nodes

Project-owned nodes live under `Scripts/Nodes/**/*.ienode.mjs`. Export a named
or default `registerNodes` function:

```js
export function registerNodes(registry, { THREE }) {
    registry.register('mygame.double', {
        name: 'Double',
        category: 'My Game',
        inputs: [{ name: 'Value', type: 'number', default: 0 }],
        outputs: [{ name: 'Result', type: 'number' }],
        evaluate({ readInput }) {
            return Number(readInput('Value')) * 2;
        }
    });
}
```

Use a project-specific namespace for node types. Use `evaluate` for pure data
nodes and `execute` for flow nodes. An execution node returns the exact name of
the execution output that should run next. Use the supplied `THREE` module
instead of importing another copy. See `docs/custom-nodes.md` in the engine
source for the complete node API.

## Working on the extension

Important implementation areas:

- `extension.js` registers commands, editors, views, and play-mode behavior.
- `IEScene.js` owns scene serialization.
- `IEAssetManager.js` scans and resolves `.ieasset` files.
- `IESceneEditor/` contains scene rendering and visual-script runtime code.
- `IESceneEditor/Nodes/` contains built-in visual-script definitions.
- `IEVisualScriptEditor/` edits visual-script graphs.
- `IEProperties/` renders and applies Properties panel changes.
- `IEActorAssetEditor/IEAssetTemplates.js` defines new asset templates.
- `Runtime/` contains the public JavaScript game runtime.

The extension currently uses CommonJS for host-side modules and ES modules
for browser/runtime files ending in `.mjs`. Match the surrounding module style.
When adding a visual-script feature, check all three paths: node registration,
graph/editor presentation, and runtime execution.

## Safe workflow

Before changing serialized formats, inspect the corresponding loader,
`fromJSON`, `toJSON`, type class, and editor code. Preserve backward-compatible
defaults when fields may be absent.

Do not overwrite unrelated unsaved editor changes. Do not hand-edit generated
geometry, texture, skeleton, or animation payloads unless the task explicitly
requires it.

For extension changes, run:

```sh
npm run lint
npm run test:unit
```

Run `npm test` when the local VS Code integration-test host is available. If an
integration run fails because VS Code cannot be downloaded or its GUI process
cannot launch, report that separately from unit-test results.
