# Infinite Engine Documentation Agent Guide

Use this file when the task is to create, repair, or audit documentation for
Infinite Engine. Read the repository-root `AGENTS.md` first. That file defines
engine and project rules; this file defines how to produce authoritative
documentation from the implementation.

## Objective

Create enough accurate documentation that a coding agent can build a native,
playable Infinite Engine project without reverse-engineering the engine during
the game task.

Documentation must explain both the serialized authoring formats and the public
runtime behavior. It must enable an agent to create a project that opens in the
editors and runs in IE play mode without using DOM, Canvas 2D, SVG, a separate
renderer, or other browser-game substitutes.

## Source of truth

The current implementation is authoritative. Do not infer a schema from class
names, UI labels, abbreviated examples, or old documentation.

For every documented feature, inspect all relevant paths:

- Registration: `Actors/registerActors.js`, `Components/registerComponents.js`,
  `ActorRegistry.js`, and component factories.
- Serialization: `IEScene.js`, `IEActor.js`, component `fromJSON`/`toJSON`
  methods, `IEProject.js`, and asset loaders.
- Asset creation and resolution: `IEAssetManager.js`, `IEAssetCreator/`, and
  `IEActorAssetEditor/IEAssetTemplates.js`.
- Editing: `IESceneEditor/`, `IEProperties/`, and the feature-specific editor.
- Runtime behavior: `Runtime/`, `IESceneEditor/IEScriptRuntime.mjs`, physics,
  animation, UI, and visual-script runtimes.
- Visual scripting: `IESceneEditor/Nodes/`, node registration, the Visual
  Script Editor, and runtime execution.
- Expected behavior: unit tests, integration tests, fixtures, and valid sample
  projects checked into the repository.

Search for every constructor, registry key, serializer, deserializer, default,
and consumer of a field before describing it. If implementation paths disagree,
document the observed behavior and record the discrepancy as an issue instead
of silently choosing one.

## Required documentation set

Place durable documentation under `docs/`. Prefer multiple focused documents
with a small index over one oversized reference.

At minimum, create and maintain:

```text
docs/
├── README.md                  # Documentation index and recommended reading order
├── project-format.md          # Infinite.ieproject and project layout
├── scene-format.md            # .iescene envelope, actors, hierarchy, and IDs
├── components.md              # Exact schema and behavior of every component
├── assets.md                  # Every .ieasset type and reference format
├── runtime-api.md             # Supported @infinite/Runtime API
├── input-and-gameplay.md      # Input, lookup, transforms, lifecycle, and teardown
├── visual-scripting.md        # Graph schema, pins, links, and execution rules
├── ui.md                      # Native UI assets, events, layout, and runtime use
├── validation.md              # Validation and play-mode verification workflow
└── examples/
    └── native-game/           # Small complete project or link to its fixture
```

If a topic is unsupported, incomplete, or cannot be driven through project
files or the public runtime, say so prominently. Never fill a documentation gap
with a speculative API.

## Schema documentation standard

For each project document, scene actor, component, asset type, visual-script
node, and public runtime object, document:

- Its canonical serialized `type` or registry identifier.
- Whether it is required, optional, editor-only, or runtime-only.
- Its complete JSON shape with a valid example.
- Each field's data type, default, valid range or enum values, and units.
- Whether absent fields receive backward-compatible defaults.
- ID uniqueness rules and hierarchy semantics.
- Whether references use UUIDs, typed reference objects, scene URIs, or paths.
- Loader behavior for missing, invalid, or unresolved values.
- Relevant editor behavior and runtime effects.
- The implementation files and tests used to verify the description.

Examples must contain valid UUIDs and internally consistent references. Do not
use placeholders inside examples described as runnable.

When a format is versioned, describe the current version, older accepted forms,
and migration or compatibility behavior.

## Runtime API standard

Document only APIs that project code can actually access through
`@infinite/Runtime` or another explicitly public alias. Do not present internal
editor modules as public runtime APIs.

For every public class, method, property, callback, and event, include:

- Import syntax and availability during edit mode and play mode.
- Parameters, return value, error behavior, and lifecycle constraints.
- A minimal working usage example.
- Ownership and cleanup requirements for listeners or external resources.
- Performance constraints for per-frame work.

Cover `Game` lifecycle behavior, input, actor and component lookup, transforms,
scene changes, spawning and removal if supported, physics, animation, UI,
printing or diagnostics, and teardown. Explicitly identify capabilities that
are present in the editor but absent from the public runtime.

## Native example project

Provide at least one compact, complete example that proves the documentation.
It must include:

- A valid `Infinite.ieproject` with project-relative `entry` and `startScene`.
- A playable `.iescene` containing exactly one usable World actor.
- A native camera, lighting, visible geometry, materials, and player actor.
- At least one gameplay interaction implemented through supported IE systems.
- Any referenced `.ieasset` files with valid, unique UUIDs.
- A `main.js` that imports `@infinite/Runtime` and coordinates behavior without
  rendering the game itself.
- Clear run instructions and an expected-result checklist.

The example must not create DOM elements, browser overlays, Canvas 2D content,
SVG content, or its own renderer. Everything visible must come from native IE
scenes, actors, components, assets, and UI systems.

Prefer making the example an automated fixture used by tests. If repository
structure makes that inappropriate, store it in the documented examples area
and add a test that loads and validates its serialized files.

## Validation

Documentation changes are incomplete until their examples and claims are
checked against the implementation.

Add or use automated validation that checks, where applicable:

- Project configuration and referenced file existence.
- Scene shape and exactly one usable World actor.
- Unique actor, component, node, pin, and asset UUIDs.
- Actor and component hierarchy references.
- Registered actor, component, asset, and node type identifiers.
- Field types, required values, defaults, and reference kinds.
- Asset UUID and scene URI resolution.
- Visual-script pin direction, type compatibility, and link cardinality.

Run:

```sh
npm run lint
npm run test:unit
```

Run `npm test` when the local VS Code integration host is available. Verify the
native example in the Infinite Engine editors and play mode. Report integration
environment failures separately from schema, unit-test, or documentation
failures.

## Documentation workflow

1. Inventory registered actors, components, assets, nodes, and public runtime
   exports. Record the inventory before writing prose.
2. Trace each item through construction, defaults, serialization, editor use,
   and runtime consumption.
3. Build or update machine-valid examples from those findings.
4. Write focused reference pages and link them from `docs/README.md`.
5. Add tests or validation for examples and schema-sensitive claims.
6. Run static checks, unit tests, and available integration verification.
7. Perform a final coverage audit against the inventory. List remaining gaps,
   unsupported capabilities, and implementation inconsistencies explicitly.

Work in small, reviewable sections. Preserve unrelated documentation and code
changes already present in the worktree.

## Writing rules

- Use direct, implementation-specific language.
- Distinguish requirements from recommendations.
- Label internal APIs as internal and unstable.
- State units such as seconds, radians, pixels, or world units.
- Use tables when documenting repeated fields or exact type mappings.
- Keep examples minimal, but never omit fields required for validity.
- Link related concepts instead of duplicating conflicting definitions.
- Include repository-relative source references that future maintainers can
  recheck.
- Do not claim a feature works merely because an editor control exists.
- Do not describe planned behavior as current behavior.

## Completion criteria

A documentation task is complete only when another coding agent can use the
published guides and example to create a native project without guessing
serialized shapes or bypassing Infinite Engine. The final report must state:

- Documents and examples added or changed.
- Source areas and tests used as evidence.
- Validation commands and play-mode checks performed.
- Known gaps, unsupported operations, and source inconsistencies that remain.
