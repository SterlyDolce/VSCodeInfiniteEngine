# Runtime API

## Public project module

`@infinite/Runtime` currently exports only `Game`:

```js
const { Game } = require('@infinite/Runtime');
```

`Game` has an `engine` property assigned by the host and three overridable
callbacks:

| Callback | Timing |
| --- | --- |
| `onBegin()` | Once after the engine enters running state, before component starts. |
| `onUpdate(deltaTime)` | Every active frame; `deltaTime` is seconds. |
| `onEnd()` | Once during a normal stop and during rollback after partial startup. |

The base methods do nothing. Keep updates fast and deterministic. Clean up
listeners/resources in `onEnd`.

## Important limitation

The host assigns an internal `IEEngine` object to `game.engine`, but
`Runtime/index.js` does not define or export a stable public engine API. Do not
document internal methods as supported project-JavaScript methods. Current
gameplay-facing actor, transform, input, mesh, animation, scene, and UI bridges
are primarily consumed by visual-script nodes inside the Scene Editor.

Use `print(value)` for the extension output channel where the host provides it;
avoid `console.log` as a gameplay-facing interface.

## Host lifecycle behavior

The host requires an active scene and game before start. It targets 60 FPS,
converts elapsed milliseconds to seconds, skips updates while paused, invokes
the game update before actor component updates, and reports contextual errors.
If `onBegin` fails, startup is rolled back. If an update fails, play stops.

## Source references

- `Runtime/index.js`, `Runtime/Game.js`, `Runtime/registerAlias.js`
- `IEEngine.js`, `extension.js`
