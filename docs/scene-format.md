# Scene format

A `.iescene` file is a standalone JSON document:

```json
{
  "name": "Main",
  "version": 1,
  "actors": [
    {
      "id": "10000000-0000-4000-8000-000000000001",
      "name": "World",
      "type": "World",
      "components": []
    }
  ]
}
```

`name` defaults to the filename on disk or `Scene` in memory. `version`
defaults to `1`. `actors` defaults to an empty array, but loading then fails if
no `World` actor exists. `toJSON()` writes only `name`, `version`, and `actors`;
legacy `editorState` is read but stored separately by the editor.

## Actor fields

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Must be unique in the scene; use a UUID. |
| `name` | string | Editable display name. |
| `type` | string | Registry key; see below. |
| `parent` | string or omitted | Parent actor ID. World has no parent. |
| `components` | array | Inline components for ordinary actors. |
| `position` | `[x,y,z]` | Transformable actors only; default `[0,0,0]`. |
| `rotation` | `[x,y,z]` | Euler radians; default `[0,0,0]`. |
| `scale` | `[x,y,z]` | Default `[1,1,1]`. |
| `source` | typed actor reference | Actor-asset instance only. |
| `overrides` | object | Instance transform/component overrides. |

Registered actor types are `Actor`, `World`, `Mesh`, `Camera`, `PointLight`,
`DirectionalLight`, `SpotLight`, and `Environment`. `Mesh`, `Camera`, and light
actors are transformable. `Environment` is unique per scene. `IEScene.addActor`
assigns the World ID when a non-World actor has no parent.

Actor-asset instances serialize `source` and `overrides` instead of inline
components. Their source has the form:

```json
{ "type": "actor", "id": "20000000-0000-4000-8000-000000000001" }
```

## Component hierarchy

Every component has its own `id`, `type`, `name`, `enabled`, and `parent`.
Component `parent` refers to another component and is independent from actor
parenting. Component IDs should be unique across a scene so selection and
runtime references remain unambiguous.

## World rules

A loaded scene must contain a `World`. Authoring should use exactly one.
`WorldActor.fromJSON` adds a missing terrain component for legacy scenes using
the stable ID `terrain-<world actor id>`. New scenes should serialize the
terrain component explicitly.

## Source references

- `IEScene.js`, `IEActor.js`, `IETransformableActor.js`
- `ActorRegistry.js`, `Actors/registerActors.js`, `Actors/WorldActor.js`
