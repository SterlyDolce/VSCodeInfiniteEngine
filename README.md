# Infinite Engine

Infinite Engine is a 3D game-development environment built into Visual Studio Code. It combines scene editing, reusable actor assets, physics, animation state machines, visual scripting, materials, model importing, and an in-editor runtime in one workspace.

> Infinite Engine is under active development. Asset formats and editor behavior may continue to evolve.

## Features

- Edit `.iescene` worlds in a real-time 3D viewport.
- Create reusable `.ieasset` actors and compose them from components.
- Import GLTF and GLB models, including geometry, materials, textures, skeletons, and animations.
- Build gameplay with node-based visual scripts.
- Create layered animation state machines, transitions, and 1D/2D blend spaces.
- Simulate rigid bodies and colliders with Rapier physics.
- Configure cameras and spring arms for third-person gameplay.
- Run, pause, continue, and stop the current project without leaving VS Code.

## Requirements

- Visual Studio Code `1.140.0` or newer
- Node.js and npm for extension development
- A workspace folder for the game project

## Getting started

### Run the extension from source

```sh
npm install
```

Open this repository in VS Code and press `F5`. A new Extension Development Host window opens with Infinite Engine enabled.

### Create a game project

1. Open the **Infinite Engine** view in the Activity Bar.
2. Select **Create Project**.
3. Open `Scenes/Main.iescene` to edit the initial scene.
4. Create assets from the Assets view or import a GLTF/GLB model.
5. Use the editor title-bar controls to play, pause, continue, or stop the project.

An Infinite Engine project starts with this structure:

```text
MyProject/
├── Assets/
├── Scenes/
│   └── Main.iescene
├── Scripts/
├── Infinite.ieproject
└── main.js
```

`Infinite.ieproject` identifies the JavaScript entry point and the scene that starts when Play is pressed.

## JavaScript runtime

The default `main.js` extends the runtime `Game` class:

```js
const { Game } = require('@infinite/Runtime');

class MyGame extends Game {
	onBegin() {

	}

	onUpdate(deltaTime) {

	}

	onEnd() {

	}
}

module.exports = MyGame;
```

- `onBegin()` runs once when gameplay starts.
- `onUpdate(deltaTime)` runs every frame while gameplay is active.
- `onEnd()` runs when gameplay stops.
- `print(value)` writes to the **Infinite Engine** output channel during play.

`@infinite/Runtime` is registered by the extension at runtime. Game projects should use this package alias instead of a relative path to the extension source.

## Editors

### Scene Editor

Open a `.iescene` file to arrange the world, select actors, edit transforms and components, and preview the active camera. Built-in actor types include actors, meshes, cameras, point lights, directional lights, spot lights, and environments.

The Outliner represents the scene hierarchy. Drag an actor onto another actor to parent it, or move it back to the world root to unparent it.

### Actor Asset Editor

Actor assets are reusable actor definitions. Available components include:

- Transform, mesh, script, camera, and spring arm
- Rigid body and collider
- Point, directional, and spot lights
- Sky, fog, ambient light, and volumetric clouds

Component transforms are local to the actor or their parent component. A scene instance can then apply its own actor transform without changing the source asset.

### Visual Script Editor

Visual scripts contain nodes, links, variables, and functions. The editor includes execution flow, keyboard and mouse input, actor direction, player movement, physics, animation-state playback, and utility nodes.

Input nodes expose dropdowns for supported keys and mouse buttons. Mouse Button provides `onClicked`, `onReleased`, and `isPressed` outputs. Actor Forward and Actor Right provide directions based on the current actor orientation.

The Player Controller node supports:

- Forward/right movement input
- Walk and run speeds with acceleration and deceleration
- Optional movement-facing rotation and rotation speed
- Camera-relative movement
- Jump input, jump speed, and grounded output

For jumping, the controlled actor must have a dynamic rigid body, a collider, gravity enabled, and an unlocked vertical position. Feed a pressed-state boolean or key event into `jump`; the controller only applies jump velocity while grounded.

### Animation State Editor

Animation state assets support:

- Override and additive layers
- Number, boolean, and trigger parameters
- Animation states and 1D/2D blend spaces
- Immediate, condition-based, and on-end transitions
- Crossfade duration, exit time, and multiple transition conditions
- Per-layer masks, weights, and enablement

Select a transition to edit it in the main Properties panel. Save the asset with `Cmd+S` on macOS or `Ctrl+S` on Windows and Linux.

### Other asset editors

The asset creator can create visual scripts, actors, geometry, materials, textures, skeletons, animations, and animation states. Infinite Engine also provides editors or previews for those asset types and an optional GLTF/GLB model viewer.

## Physics and camera setup

Rigid Body supports dynamic, fixed, and kinematic bodies. Collider shapes include box, sphere, and capsule. Body type and collider shape are selected from dropdown menus in Properties.

For a typical third-person character:

1. Add a capsule collider and dynamic rigid body to the actor.
2. Lock unwanted rigid-body rotation axes so collisions do not tip the character.
3. Add a Spring Arm and parent a Camera beneath it.
4. Adjust the spring-arm transform and length to frame the character.
5. Leave **Follow Actor Rotation** disabled for an independent camera, or enable it when the camera should inherit actor rotation.

## Assets and scenes

- `.ieasset` stores reusable Infinite Engine assets.
- `.iescene` stores a world and its actor instances.
- `.gltf` and `.glb` files can be inspected and imported.
- `Infinite.ieproject` stores project metadata, the entry script, and the starting scene.

Avoid editing an asset externally while it has unsaved changes open in an Infinite Engine editor. If a file changes on disk, reopen it or accept the refreshed version before continuing.

## Settings

Search for **Infinite Engine** in VS Code Settings. Available settings include:

| Setting | Default | Purpose |
| --- | ---: | --- |
| `infinite.autoLoadProject` | `true` | Load a project when its workspace opens. |
| `infinite.autoSave` | `true` | Automatically save scene and asset changes. |
| `infinite.editor.showGrid` | `true` | Show the viewport grid. |
| `infinite.editor.backgroundColor` | `#000000` | Set the editor viewport background. |
| `infinite.editor.cameraSpeed` | `1` | Set viewport camera movement speed. |
| `infinite.editor.showOutliner` | `true` | Enable the Infinite Outliner. |
| `infinite.script.autoCompile` | `true` | Compile visual scripts after saving. |
| `infinite.script.showPinTypes` | `true` | Display visual-script pin types. |
| `infinite.runtime.showLogs` | `true` | Show runtime logs in the output channel. |
| `infinite.runtime.autoStart` | `false` | Start gameplay when a project opens. |
| `infinite.assets.autoScan` | `true` | Scan `Assets` for `.ieasset` files. |
| `infinite.assets.cacheEnabled` | `true` | Cache loaded assets. |

## Development

```sh
npm run lint
npm test
npm run package
```

- `npm run lint` checks the extension source.
- `npm test` runs the VS Code extension-host test suite.
- `npm run package` creates an installable VSIX package.

After changing extension code, restart or reload the Extension Development Host before validating editor behavior.

## License

Infinite Engine is released under the [MIT License](LICENSE).
