# Infinite Engine Node Library

The root `index.mjs` is the only built-in registry entrypoint. It separates nodes into:

- `Core/` — engine-independent JavaScript functionality: values, collections,
  objects, JSON, strings, numbers, type checks, dates, regular expressions, and flow.
- `Engine/` — Infinite Engine APIs: actors, transforms, meshes, animation, input,
  vehicles, debugging, and user interfaces.

Some mature modules remain one directory above these aggregators to preserve stable
imports for project-generated nodes. New general-purpose modules belong in `Core/`;
new gameplay APIs belong in `Engine/`.

The Visual Script library intentionally does not expose `eval`, `Function`, DOM
mutation, filesystem/process access, or unrestricted network APIs. Those operations
would bypass the engine sandbox and cannot be made portable across gameplay targets.
Callback-oriented JavaScript APIs such as `Array.map` are represented by flow nodes
such as `For Each`, allowing the callback body to remain visible in the graph.
