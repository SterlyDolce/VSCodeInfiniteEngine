# Project format

An Infinite Engine project is a directory containing `Infinite.ieproject`.
`IEProject.js` creates this layout:

```text
Game/
├── Assets/
├── Scenes/
│   └── Main.iescene
├── Scripts/
├── Infinite.ieproject
└── main.js
```

## `Infinite.ieproject`

```json
{
  "name": "Native Example",
  "version": 1,
  "entry": "main.js",
  "startScene": "Scenes/Main.iescene"
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | string | Project display name. |
| `version` | number | Current generated format version is `1`. |
| `entry` | string | Project-relative CommonJS game entry file. |
| `startScene` | string | Project-relative `.iescene` loaded on play. |

Paths are relative to the project root. Do not use asset UUIDs for `entry` or
`startScene`. The project generator creates `Assets`, `Scenes`, and `Scripts`
even when they are initially empty.

## Entry module

The entry module must export a `Game` instance constructor:

```js
const { Game } = require('@infinite/Runtime');

class NativeGame extends Game {
    onBegin() {}
    onUpdate(deltaTime) {}
    onEnd() {}
}

module.exports = NativeGame;
```

See [Runtime API](runtime-api.md). Do not import the installed extension by a
relative filesystem path.

## Source references

- `IEProject.js`
- `extension.js` (project discovery and play startup)
