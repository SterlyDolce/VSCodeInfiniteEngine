# Native UI

Native UI uses `ui` assets rendered by the IUG runtime. Do not replace it with
project-created DOM elements or a separate fullscreen canvas.

## Asset shape

```json
{
  "id": "UUID",
  "name": "HUD",
  "type": "ui",
  "data": {
    "version": 1,
    "canvas": {
      "type": "overlay",
      "width": 1280,
      "height": 720,
      "background": "transparent"
    },
    "elements": []
  }
}
```

The template defaults to a `menu` canvas with a 1280×720 design size and
`#15171c` background. Menu canvases require mouse input; overlays are suitable
for non-interactive HUDs.

## Elements

The runtime supports presentation/layout elements such as panels and text plus
interactive `button`, `input`, and `checkbox` widgets and `image` elements.
Common fields include `id`, `name`, `type`, `parent`, `x`, `y`, `width`,
`height`, `z`, `display`, colors, and type-specific text/image values. Parent
chains control visibility; cycles are treated as hidden.

Use the IUG Editor for authoritative element defaults and layout. The runtime
sorts hit testing by descending `z`. Buttons can be disabled and have normal,
hovered, pressed, and disabled colors. Input widgets emit changes while typing;
checkboxes toggle `checked`.

## Runtime operations

Visual-script nodes can show/hide a UI, set widget text, and bind a widget
property. UI events include hovered, pressed, released, clicked, and changed;
payloads include UI ID, widget ID/name/type, value, and checkbox state.

Texture and font assets referenced by UI are loaded alongside UI assets. Font
assets are supported by the runtime even though the current general asset
template list does not expose a font template.

## Source references

- `IEActorAssetEditor/IEAssetTemplates.js` (`ui`)
- `IESceneEditor/IUGRuntime.mjs`, `Nodes/UI.mjs`, `Nodes/IEUIEventNodes.mjs`
- `IUGEditor/`
