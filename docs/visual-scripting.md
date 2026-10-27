# Visual scripting

A visual script is a `script` asset with this graph shape:

```json
{
  "nodes": [],
  "links": [],
  "variables": [],
  "functions": []
}
```

## Nodes and pins

```json
{
  "id": "UUID",
  "type": "event.onbegin",
  "position": [40, 80],
  "pins": [
    {"id":"UUID","name":"exec","type":"execution","direction":"output"}
  ]
}
```

Node `type` is a registry compatibility key and must not be renamed. Each pin
has a unique ID, exact registered name/type, and `input` or `output` direction.
Unconnected input pins may store `value`. Asset inputs use `type: "asset"` plus
an `assetType` filter in their node definition; scene pickers use
`assetType: "scene"`.

## Links

```json
{ "id": "UUID", "from": "OUTPUT_PIN_UUID", "to": "INPUT_PIN_UUID" }
```

The runtime requires output-to-input direction. Execution connects only to
execution. A `transformable` input accepts actor, component, or transformable
outputs. Exact types and `any` are otherwise compatible. Non-execution inputs
allow at most one incoming link. Duplicate node or pin IDs and missing link
endpoints are errors.

## Execution

Event nodes start flows. Execution nodes return the exact output name to run
next. Pure data nodes use `evaluate`; flow nodes use `execute`. Runtime flow has
a 1,000-step execution budget to stop runaway graphs. Variables are keyed by
ID; functions may add local scope.

## Built-in categories

The registry includes Events/Input, References, Actor, Transform, Mesh,
Animation, Scene, UI, Vehicle/player control, Variables/Functions, Debug,
Number/Math, Logic, String, Vector2/Vector3, Conversion, Array, Object, JSON,
Date, RegExp, Flow, Graph, and type utilities.

Use the Visual Script Editor to create pins from current definitions. When
generating JSON, inspect the specific registration in `IESceneEditor/Nodes/`
and reproduce its pin names and types exactly.

## Custom nodes

Project custom nodes live under `Scripts/Nodes/**/*.ienode.mjs`. See
[Custom nodes](custom-nodes.md) for the registration API.

## Source references

- `IESceneEditor/IENodeRegistry.mjs`, `IEScriptRuntime.mjs`
- `IESceneEditor/Nodes/index.mjs` and category modules
- `IEVisualScriptEditor/`
