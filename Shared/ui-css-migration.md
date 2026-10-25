# Infinite Engine universal CSS migration

The editor stylesheets are consolidated into **ui.css**. Shared theme tokens, resets, and reusable `.ie-button`/`.ie-text` classes appear once. Existing editor-specific layout and component rules retain their source order and are isolated by the `data-ie-editor` attribute to prevent conflicts.

## Required webview changes

1. Load the single `ui.css` file in every webview, using VS Code `webview.asWebviewUri(...)` and including its directory in `localResourceRoots`.
2. Add `data-ie-editor="..."` to each editor's `<body>` using the ID corresponding to its previous stylesheet.
3. Remove the old per-editor stylesheet `<link>` to avoid overlapping rules.
4. Test each editor after switching. CSS alone cannot guarantee visual equivalence without the corresponding HTML and JavaScript.

## ID mapping

| Previous CSS | `data-ie-editor` |
|---|---|
| `style(20261024-222016-2).css` | `animation-state` |
| `style(20261024-222016-3).css` | `properties` |
| `style(20261024-222016-1).css` | `graph-preview` |
| `style(8).css` | `animation-timeline` |
| `style(20261024-222016).css` | `graph-basic` |
| `style(9).css` | `geometry` |
| `style(10).css` | `ui-designer` |
| `style(20261024-222018-1).css` | `graph-script` |
| `style(20261024-222018).css` | `asset-preview` |
| `style(20261024-222018-2).css` | `scene-viewport` |
| `style(20261024-222019).css` | `model-preview` |
| `style(20261024-222020).css` | `texture` |
| Legacy skeleton editor stylesheet | `skeleton` |

## Example

```html
<body data-ie-editor="graph-script">
  <!-- existing editor markup -->
</body>
```

The existing DOM IDs and class hooks have been kept. The new `ui.js` button and text helpers can output `.ie-button ie-button-primary` and `.ie-text` directly.

The per-editor stylesheets have been removed. Editor layout, components, and the shared `#toolbar > #actions` pattern are now maintained exclusively in `Shared/ui.css`.
