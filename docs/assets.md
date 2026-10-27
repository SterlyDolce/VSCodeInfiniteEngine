# Assets

Reusable assets are `.ieasset` JSON files under `Assets/`:

```json
{
  "id": "UUID",
  "name": "Asset Name",
  "type": "script",
  "data": {}
}
```

`IEAssetManager.scan()` recursively indexes `.ieasset` files, rejects missing
IDs/types and duplicate IDs, and ignores other extensions. Resolution requires
both the expected type and ID:

```json
{ "type": "material", "id": "UUID" }
```

The built-in templates are:

| Type | Initial `data` shape |
| --- | --- |
| `script` | `{nodes:[], links:[], variables:[], functions:[]}` |
| `actor` | Serialized actor object. |
| `geometry` | Buffer-geometry payload: attributes, index, groups, morph data, bounds. |
| `material` | Material graph `{nodes:[],links:[]}`; imported materials may use compiled fields. |
| `terrain` | Versioned procedural graph; current template emits version `2`. |
| `texture` | Image plus color space, wrapping, filtering, offset/repeat/center/rotation. |
| `skeleton` | `{nodes:[],bones:[],boneInverses:[]}` |
| `animation` | `{duration:0,tracks:[],blendMode:2500}` |
| `animationState` | Skeleton reference, parameters, and state-machine layers. |
| `ui` | `{version:1,canvas:{...},elements:[]}` |

Scenes are deliberately different: the `scene` template writes a bare
`.iescene` document and does not add an asset envelope or UUID.

## Actor assets

An actor asset's outer ID identifies the reusable asset. `data` is a serialized
actor with its own actor/component IDs. A scene instance uses a typed `source`
reference and stores changes under `overrides`.

## Materials and textures

Material resolution recognizes texture fields including `map`, `normalMap`,
`roughnessMap`, `metalnessMap`, `aoMap`, `emissiveMap`, `bumpMap`,
`displacementMap`, `alphaMap`, and `lightMap`. Each non-null field must resolve
to a texture asset.

## Source references

- `IEActorAssetEditor/IEAssetTemplates.js`
- `IEAssetManager.js`, `IEActorInstance.js`
