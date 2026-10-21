# Custom visual-script nodes

Infinite Engine can load project-owned visual-script nodes without modifying
the extension. One custom node module supplies both the graph-editor metadata
and runtime behavior.

## Location and loading

Place ES modules ending in `.ienode.mjs` anywhere below `Scripts/Nodes`:

```text
MyGame/
└── Scripts/
    └── Nodes/
        ├── Gameplay.ienode.mjs
        └── Vehicles/
            └── Nitro.ienode.mjs
```

The discovery pattern is `Scripts/Nodes/**/*.ienode.mjs`.

- Modules load only in trusted VS Code workspaces.
- The visual-script editor watches the directory and refreshes its node menu.
- Scene editors load the same modules for script execution.
- Reload an open scene editor after changing runtime code. A node type cannot
  be registered twice in the same running viewport.
- A broken module is skipped and reported as a warning; other modules continue
  loading.

## Module entry point

Export either a named `registerNodes` function or a default function:

```js
export function registerNodes(registry, api) {
    // Register one or more nodes here.
}
```

```js
export default function registerNodes(registry, api) {
    // Equivalent default-export form.
}
```

`api.THREE` is the engine's Three.js module. Prefer it over importing another
copy of Three.js:

```js
export function registerNodes(registry, { THREE }) {
    const forward = new THREE.Vector3(0, 0, -1);
    // Definitions can close over THREE and forward.
}
```

The registration function may be asynchronous. Avoid expensive registration
work because the graph editor invokes it while refreshing the catalog.

## Node definition

Call `registry.register(type, definition)` for each node:

```js
registry.register('studio.scaleNumber', {
    name: 'Scale Number',
    category: 'Studio',
    inputs: [],
    outputs: [],
    evaluate(context) {},
    execute(context) {}
});
```

| Field | Required | Description |
| --- | --- | --- |
| `type` argument | Yes | Stable, globally unique serialized ID. Use a namespace such as `studio.nodeName`. |
| `name` | Yes | Human-readable node title. |
| `category` | Yes | Add-menu category. Equal category names are grouped. |
| `inputs` | No | Input pin definitions; defaults to `[]`. |
| `outputs` | No | Output pin definitions; defaults to `[]`. |
| `evaluate(context)` | Data nodes | Returns the requested data output. |
| `execute(context)` | Execution nodes | Performs work and chooses the next execution output. |
| `onConnect(context)` | No | Editor-side connection lifecycle hook. |
| `onDisconnect(context)` | No | Editor-side disconnection lifecycle hook. |

Do not rename a released node `type`; graph assets serialize it. The displayed
`name` may change. Types must not collide with built-in or custom node types.

## Pin definitions

Only `name` and `type` are required:

```js
{
    name: 'amount',
    type: 'number',
    default: 1,
    editor: { type: 'enum', options: ['Low', 'Medium', 'High'] },
    assetType: 'material',
    itemType: 'number'
}
```

`default` is used for an unconnected input. It must be structured-cloneable:
use primitives, arrays, plain objects, or `null`, not Three.js objects or
functions.

| Pin type | Runtime value |
| --- | --- |
| `execution` | Flow connection; not ordinary data. |
| `number` | JavaScript number. |
| `string` | JavaScript string. |
| `boolean` | JavaScript boolean. |
| `vector2` | Two-number array. |
| `vector3` | Three-number array. |
| `actor` | Runtime actor object. |
| `component` | Runtime component/Three.js object. |
| `transformable` | Actor or component accepted by transform nodes. |
| `mesh` | Runtime Three.js mesh reference. |
| `asset` | Asset reference or ID; set `assetType`. |
| `animationstate` | Animation-state runtime reference. |
| `any` | Any non-execution data type. |

`transformable` accepts `actor`, `component`, or `transformable` outputs.
`any` accepts any ordinary data type. Execution connects only to execution.

### Enum inputs

```js
{
    name: 'operation',
    type: 'string',
    default: 'Add',
    editor: {
        type: 'enum',
        options: ['Add', 'Subtract', 'Multiply']
    }
}
```

### Asset inputs

Use `type: 'asset'` with an `assetType` picker filter:

```js
{
    name: 'Material',
    type: 'asset',
    assetType: 'material',
    default: null
}
```

Known asset types include `actor`, `geometry`, `material`, and `animation`.

## Data nodes

Data nodes are evaluated lazily when another node reads an output:

```js
export function registerNodes(registry) {
    registry.register('studio.scaleNumber', {
        name: 'Scale Number',
        category: 'Studio',
        inputs: [
            { name: 'value', type: 'number', default: 0 },
            { name: 'scale', type: 'number', default: 2 }
        ],
        outputs: [{ name: 'result', type: 'number' }],
        evaluate({ readInput }) {
            return Number(readInput('value')) * Number(readInput('scale'));
        }
    });
}
```

For multiple outputs, inspect `context.output`:

```js
registry.register('studio.splitRange', {
    name: 'Split Range',
    category: 'Studio',
    inputs: [{ name: 'value', type: 'number', default: 0 }],
    outputs: [
        { name: 'absolute', type: 'number' },
        { name: 'negative', type: 'boolean' }
    ],
    evaluate({ output, readInput }) {
        const value = Number(readInput('value'));
        if (output === 'absolute') return Math.abs(value);
        if (output === 'negative') return value < 0;
        throw new Error(`Unknown output: ${output}`);
    }
});
```

Keep `evaluate` deterministic and free of side effects. It may run repeatedly,
and circular data dependencies are rejected.

## Execution nodes

Return the execution output pin name that should run next:

```js
registry.register('studio.setVisible', {
    name: 'Set Visible',
    category: 'Studio',
    inputs: [
        { name: 'exec', type: 'execution' },
        { name: 'Target', type: 'transformable', default: null },
        { name: 'visible', type: 'boolean', default: true }
    ],
    outputs: [{ name: 'exec', type: 'execution' }],
    execute({ readInput }) {
        const target = readInput('Target');
        if (target) target.visible = Boolean(readInput('visible'));
        return 'exec';
    }
});
```

Branching nodes return different output names:

```js
registry.register('studio.isAbove', {
    name: 'Is Above',
    category: 'Studio',
    inputs: [
        { name: 'exec', type: 'execution' },
        { name: 'value', type: 'number', default: 0 },
        { name: 'threshold', type: 'number', default: 10 }
    ],
    outputs: [
        { name: 'yes', type: 'execution' },
        { name: 'no', type: 'execution' }
    ],
    execute({ readInput }) {
        return Number(readInput('value')) > Number(readInput('threshold'))
            ? 'yes'
            : 'no';
    }
});
```

`execute` must return synchronously. Do not return a promise; the execution
queue needs the output pin name immediately. For deferred browser callbacks,
capture `fireOutput` and call it later after checking `isStopped()`.

## Runtime context

`evaluate` and `execute` receive this context:

| Field | Description |
| --- | --- |
| `node` | Serialized node instance, including stable ID and pins. |
| `output` | Data output currently being evaluated. |
| `actor` | Actor that owns the running visual script. |
| `engine` | Runtime services described below. |
| `deltaTime` | Current frame delta in seconds. |
| `keyboard` | `Set` of pressed keyboard codes. Prefer built-in input nodes for ordinary input. |
| `mouse` | Mouse position, delta, wheel, and button state. |
| `variables` | Scope with `get(id)`, `set(id, value)`, and `has(id)`. |
| `readInput(name)` | Reads the connected value or pin default. |
| `setOutputValue(name, value)` | Stores execution-produced data in the current frame. |
| `getOutputValue(name)` | Reads data stored by this node in the current frame. |
| `runOutput(name)` | Immediately runs an execution output; useful for controlled loops. |
| `fireOutput(name)` | Fires an output with a fresh frame; useful for deferred callbacks. |
| `consumeExecutionStep()` | Charges a step against the execution limit. Call it inside custom loops. |
| `isStopped()` | Whether this script runtime has stopped. |

The runtime limits an execution frame to 1,000 steps and data evaluation to a
dependency depth of 64.

### Engine services

The current `engine` object exposes:

- `print(...values)` — writes to the Infinite Engine output channel.
- `lockMouse()` and `showMouse()` — controls gameplay pointer lock.
- `getPhysicsBody(actor)` — returns the actor's Rapier body or `null`.
- `isGrounded(actor, tolerance)` — checks grounding/contact.
- `getMesh(component)` — validates and returns a runtime mesh component.
- `setMesh(component, geometry, materials)` — replaces runtime mesh assets.
- Animation services used by the built-in animation nodes.

Treat undocumented engine properties as internal. Check that optional services
exist if a node can run in an editor preview.

## Per-node runtime state

Keep mutable state in a module-level `WeakMap` keyed by the node instance:

```js
const states = new WeakMap();

export function registerNodes(registry) {
    registry.register('studio.accumulator', {
        name: 'Accumulator',
        category: 'Studio',
        inputs: [
            { name: 'exec', type: 'execution' },
            { name: 'amount', type: 'number', default: 1 }
        ],
        outputs: [
            { name: 'exec', type: 'execution' },
            { name: 'total', type: 'number' }
        ],
        execute({ node, readInput, setOutputValue }) {
            const total = (states.get(node) ?? 0) + Number(readInput('amount'));
            states.set(node, total);
            setOutputValue('total', total);
            return 'exec';
        },
        evaluate({ node }) {
            return states.get(node) ?? 0;
        }
    });
}
```

`WeakMap` state is released when its graph/runtime is discarded. Do not store
runtime state on the serialized node or in pin defaults.

## Validation and errors

Validate external values early and throw descriptive errors:

```js
const speed = Number(readInput('speed'));
if (!Number.isFinite(speed) || speed < 0) {
    throw new RangeError('Move Actor requires a non-negative speed');
}
```

Recommended rules:

- Coerce numbers with `Number(...)`, then check `Number.isFinite`.
- Verify actor/component capabilities before mutating them.
- Return a valid execution output name from every execution path.
- Do not use filesystem, Node.js, or VS Code APIs; runtime modules execute in a
  browser webview.
- Avoid global timers. For deferred callbacks, check `isStopped()` before
  firing outputs.
- Keep top-level module code limited to constants and state containers.

## Compatibility checklist

1. Give every node type a stable namespace.
2. Keep pin names and types stable after graphs start using the node.
3. Provide a structured-cloneable default for every optional input.
4. Test connected and unconnected inputs.
5. Test editor preview and Play mode when mutating scene objects.
6. Reload scene editors after changing runtime implementation code.
7. Check Infinite Engine output and VS Code warnings for loading errors.
