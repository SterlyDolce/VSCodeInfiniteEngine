<p align="center">
  <img src="https://raw.githubusercontent.com/SterlyDolce/VSCodeInfiniteEngine/main/images/infinite-color.png" alt="Infinite Engine logo" width="160">
</p>

<h1 align="center">Infinite Engine</h1>

<p align="center">
  Build, edit, and run 3D games without leaving Visual Studio Code.
</p>

Infinite Engine turns VS Code into an integrated 3D game-development environment. Compose scenes, create reusable actors, build gameplay with visual scripts, configure physics and animation, import models, and run your project from the editor.

> **Early release:** Infinite Engine is under active development. Asset formats and editor behavior may evolve between versions. Keep backups of important projects.

## Highlights

- **Real-time scene editing** — Arrange actors in a 3D viewport, edit transforms and components, manage scene hierarchies, and preview the active camera.
- **Reusable actor assets** — Build `.ieasset` actors from meshes, scripts, cameras, lights, physics, spring arms, skies, fog, ambient light, and volumetric clouds.
- **Visual scripting** — Connect execution, input, movement, physics, animation, and utility nodes to create gameplay visually.
- **Animation state machines** — Create layered animation graphs with parameters, transitions, crossfades, masks, and 1D or 2D blend spaces.
- **Physics powered by Rapier** — Configure dynamic, fixed, and kinematic rigid bodies with box, sphere, and capsule colliders.
- **GLTF and GLB workflows** — Preview and import models with geometry, materials, textures, skeletons, and animations.
- **Integrated runtime** — Play, pause, continue, and stop the current project directly from VS Code.

## Requirements

- Visual Studio Code `1.140.0` or newer
- An open workspace folder for your Infinite Engine project

Node.js and npm are only required when developing the extension from source.

## Quick start

1. Install **Infinite Engine** from the Visual Studio Marketplace.
2. Open a folder in VS Code.
3. Select the **Infinite Engine** icon in the Activity Bar.
4. Choose **Create Project**.
5. Open `Scenes/Main.iescene` to begin editing the generated scene.
6. Use the editor title-bar controls to play, pause, continue, or stop your project.

A new project uses the following structure:

```text
MyProject/
├── Assets/
├── Scenes/
│   └── Main.iescene
├── Scripts/
├── Infinite.ieproject
└── main.js
```

`Infinite.ieproject` identifies the JavaScript entry point and the scene that opens when gameplay starts.

## Editors and workflows

### Scene Editor

Open a `.iescene` file to edit a world in a real-time 3D viewport. The Outliner displays its hierarchy: drag an actor onto another actor to parent it, or move it back to the world root to unparent it. Built-in actor types include meshes, cameras, point lights, directional lights, spot lights, and environments.

### Actor Asset Editor

Actor assets are reusable definitions composed from components. Component transforms are local to their actor or parent component, while each scene instance can apply its own transform without changing the source asset.

Available components include:

- Transform, mesh, script, camera, and spring arm
- Rigid body and collider
- Point, directional, and spot lights
- Sky, fog, ambient light, and volumetric clouds

### Visual Script Editor

Visual scripts contain nodes, links, variables, and functions. Available nodes cover execution flow, keyboard and mouse input, actor direction, player movement, physics, animation-state playback, and common utilities.

The Player Controller node supports walk and run speeds, acceleration and deceleration, camera-relative movement, optional movement-facing rotation, jumping, and grounded state output.

### Animation State Editor

Build animation state machines with:

- Override and additive layers
- Number, boolean, and trigger parameters
- Animation states and 1D or 2D blend spaces
- Immediate, condition-based, and on-end transitions
- Crossfade duration, exit time, and multiple transition conditions
- Per-layer masks, weights, and enablement

Select a transition to edit it in the Properties panel. Save with `Cmd+S` on macOS or `Ctrl+S` on Windows and Linux.

### Asset tools

Create visual scripts, actors, geometry, materials, textures, skeletons, animations, and animation states from the Assets view. Infinite Engine also includes dedicated editors or previews for these asset types and an optional GLTF/GLB model viewer.

## JavaScript runtime

The generated `main.js` extends the Infinite Engine `Game` class:

```js
const { Game } = require('@infinite/Runtime');

class MyGame extends Game {
  onBegin() {
    // Called once when gameplay starts.
  }

  onUpdate(deltaTime) {
    // Called every frame while gameplay is active.
  }

  onEnd() {
    // Called when gameplay stops.
  }
}

module.exports = MyGame;
```

Use `print(value)` to write to the **Infinite Engine** output channel during play. The extension registers `@infinite/Runtime` at runtime, so projects should use this alias instead of a relative path to the extension source.

## Supported files

| File | Purpose |
| --- | --- |
| `.iescene` | Infinite Engine worlds and actor instances |
| `.ieasset` | Reusable actors and other engine assets |
| `.gltf`, `.glb` | 3D model preview and import |
| `Infinite.ieproject` | Project entry script and starting scene |

Avoid editing an asset externally while it has unsaved changes in an Infinite Engine editor. If a file changes on disk, reopen it or accept the refreshed version before continuing.

## Settings

Search for **Infinite Engine** in VS Code Settings.

| Setting | Default | Purpose |
| --- | ---: | --- |
| `infinite.autoLoadProject` | `true` | Load a project when its workspace opens. |
| `infinite.autoSave` | `true` | Automatically save scene and asset changes. |
| `infinite.editor.showGrid` | `true` | Show the viewport grid. |
| `infinite.editor.backgroundColor` | `#000000` | Set the viewport background color. |
| `infinite.editor.cameraSpeed` | `1` | Set viewport camera movement speed. |
| `infinite.editor.showOutliner` | `true` | Enable the Infinite Outliner. |
| `infinite.script.autoCompile` | `true` | Compile visual scripts after saving. |
| `infinite.script.showPinTypes` | `true` | Display visual-script pin types. |
| `infinite.runtime.showLogs` | `true` | Show runtime logs in the output channel. |
| `infinite.runtime.autoStart` | `false` | Start gameplay when a project opens. |
| `infinite.assets.autoScan` | `true` | Scan `Assets` for `.ieasset` files. |
| `infinite.assets.cacheEnabled` | `true` | Cache loaded assets. |

## Feedback and issues

Found a bug or have an idea? [Open an issue on GitHub](https://github.com/SterlyDolce/VSCodeInfiniteEngine/issues) and include your VS Code version, Infinite Engine version, reproduction steps, and any relevant output logs.

## Developing from source

Clone the repository, run `npm install`, open it in VS Code, and press `F5` to start an Extension Development Host.

```sh
npm run lint
npm test
npm run package
```

## License

Infinite Engine is released under the [MIT License](LICENSE).
