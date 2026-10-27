# Infinite Engine documentation

This documentation describes the formats and APIs implemented by the current
Infinite Engine source tree. Treat source and tests as authoritative when a
document becomes stale.

Published documentation for agents working outside the extension repository:

`https://github.com/SterlyDolce/VSCodeInfiniteEngine/tree/main/docs`

Prefer documentation from the branch or release matching the installed
extension version.

## Reading order

1. [Project format](project-format.md)
2. [Scene format](scene-format.md)
3. [Components](components.md)
4. [Assets](assets.md)
5. [Runtime API](runtime-api.md)
6. [Input and gameplay](input-and-gameplay.md)
7. [Visual scripting](visual-scripting.md)
8. [Native UI](ui.md)
9. [Validation](validation.md)

The [native example](examples/native-game/README.md) is a minimal project with
a World, Environment, Camera, and an On Begin visual script. It is intended as
a schema fixture, not as a showcase game.

## Important boundaries

- `.iescene` files are standalone scene documents, not `.ieasset` envelopes.
- `.ieasset` references normally use `{ "type": "...", "id": "UUID" }`.
- `@infinite/Runtime` currently exports only `Game`.
- Input, transforms, UI, scene changes, and most gameplay operations are
  currently implemented by visual-script nodes and their runtime bridge.
- A native IE game must not replace the scene with a DOM or Canvas renderer.

## Evidence

These guides were derived from `IEProject.js`, `IEScene.js`, `IEActor.js`,
`IETransformableActor.js`, `Actors/`, `Components/`, `Types/`,
`IEActorAssetEditor/IEAssetTemplates.js`, `IEAssetManager.js`, `Runtime/`, and
`IESceneEditor/`.
