# Input and gameplay

The documented native input path is visual scripting. Project JavaScript does
not currently receive a public input service from `@infinite/Runtime`.

## Keyboard

Input uses `KeyboardEvent.code`-style values such as `KeyW`, `Digit1`,
`ArrowUp`, `Space`, and `ShiftLeft`. The Keyboard event exposes key-down,
key-up, and pressed state. `Keyboard 2D` defaults to WASD and returns normalized
`axis`, `x`, `y`, and `isMoving`. `Keyboard 1D` returns -1, 0, or 1.

## Mouse

Mouse nodes expose position, delta, wheel, and buttons. Input-control nodes can
lock/show the mouse and choose editor/game input mode. Visual scripts should
release or restore pointer state during teardown where their design requires
it.

## Gameplay operations

Built-in nodes provide:

- Actor/component references and validity checks.
- Position, scale, translation, rotation, forward/right directions, and spring
  arm orbit/directions.
- Mesh replacement and lookup.
- Animation and animation-state playback.
- Player, foot, vehicle, and vehicle-wheel controls.
- Scene opening and UI show/hide/text/value binding.
- Collision/physics support through rigid-body and collider components.

References are runtime values, not filenames. Visual-script `selfActor` resolves
to the actor owning the script component.

## Cleanup

`IEScriptRuntime.stop()` marks the graph stopped, clears UI bindings, and clears
keyboard state. `Game.onEnd()` remains responsible for resources created by
project JavaScript.

## Source references

- `IESceneEditor/Nodes/Events.mjs`, `Transform.mjs`, `References.mjs`
- `Vehicle.mjs`, `Mesh.mjs`, `Animation.mjs`, `Scene.mjs`, `UI.mjs`
- `IESceneEditor/IEScriptRuntime.mjs`, `IEPhysicsRuntime.mjs`
