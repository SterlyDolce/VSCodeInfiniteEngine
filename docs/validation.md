# Validation

## Project checks

- `Infinite.ieproject` parses and has `name`, version `1`, project-relative
  `entry`, and project-relative `.iescene` `startScene`.
- Referenced files exist inside the project.
- The entry module exports a `Game` subclass and uses `@infinite/Runtime`.

## Scene checks

- JSON parses and contains exactly one usable `World` actor.
- Actor and component IDs are unique and non-empty.
- Actor parents resolve; non-World actors normally descend from World.
- Component parents are null or resolve within their component hierarchy.
- Actor/component type keys are registered.
- Transform vectors have three finite numbers; rotations are radians.
- Asset references use the expected type and resolve by UUID.

## Asset checks

- Every `.ieasset` has unique `id`, non-empty `type`, and an object `data`.
- Typed references resolve to an asset of the same type.
- Visual-script node/pin/link IDs are unique.
- Links are output-to-input, type-compatible, and ordinary input pins have no
  more than one incoming link.

## Commands

Run extension checks from the engine repository:

```sh
npm run lint
npm run test:unit
npm test
```

`npm test` includes the VS Code integration host. Report download/display/GUI
host failures separately from unit or schema failures.

Finally open each example/project in the Extension Development Host, open its
start scene in the Scene Editor, enter play mode, inspect the Infinite Engine
output channel, and exercise the documented input and completion path.

## Current validation gap

The repository does not yet expose one comprehensive project-schema CLI. The
loaders and registries enforce parts of the contract. Until a validator is
added, combine JSON/reference checks with loader tests and play-mode testing.
