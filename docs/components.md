# Components

All components share this base shape:

```json
{
  "id": "UUID",
  "type": "script",
  "name": "script",
  "enabled": true,
  "parent": null
}
```

Missing base values default to a generated ID, the component type/name,
`enabled: true`, and `parent: null`, although a few specialized loaders do not
restore every optional base field. Serialize the complete base shape.

## Registered schemas

The table lists additional fields and loader defaults. Vectors contain finite
numbers; colors are six-digit hex strings; rotations and spotlight angles are
radians.

| Type | Additional fields and defaults |
| --- | --- |
| `script` | `script: null`; accepts a string or `{type:"script",id}`. |
| `mesh` | transform fields; `geometry: null`, `materials: []`, `castShadow: true`, `receiveShadow: true`. |
| `camera` | `projection: "perspective"`, `fov: 75`, `near: 0.1`, `far: 1000`, `orthographicSize: 10`, `priority: 0`, `active: true`. |
| `springArm` | transform fields; `armLength: 4`, `socketOffset: [0,0,0]`, `followActorRotation: false`, `collisionTest: true`. |
| `pointLight` | transform fields; `color: "#ffffff"`, `intensity: 1`, `distance: 0`, `decay: 2`, `castShadow: false`. |
| `directionalLight` | transform fields; `color: "#ffffff"`, `intensity: 1`, `castShadow: false`. |
| `spotLight` | transform fields; point-light fields plus `angle: π/6`, `penumbra: 0`. |
| `sky` | `topColor: "#5fa9ff"`, `horizonColor: "#b9dcff"`, `bottomColor: "#eaf4ff"`. |
| `fog` | `enabled: false`, `mode: "linear"`, `color: "#aabbd0"`, `near: 10`, `far: 150`, `density: 0.01`. Mode is `linear` or `exponential`. |
| `ambientLight` | `skyColor: "#ffffff"`, `groundColor: "#444444"`, `intensity: 1`. |
| `volumetricCloud` | `coverage: .48`, `density: .8`, `scale: .012`, `height: 120`, `thickness: 60`, `windX: .8`, `windZ: .25`, `color: "#ffffff"`, `shadowColor: "#78869b"`. |
| `rigidBody` | `bodyType: "dynamic"`, `gravityScale: 1`, damping `0`, `canSleep: true`, `ccd: false`, all position/rotation locks `false`. |
| `collider` | `shape: "box"`, `size: [1,1,1]`, `radius: .5`, `height: 1`, `offset: [0,0,0]`, `friction: .5`, `restitution: 0`, `density: 1`, `sensor: false`, `collisionEvents: true`. |
| `terrain` | `terrain: null`, `physics: true`, `friction: .8`, `restitution: 0`, `castShadow: false`, `receiveShadow: true`. |

`rigidBody.bodyType` accepts `dynamic`, `fixed`, `kinematicPosition`, and
`kinematicVelocity`. `collider.shape` accepts `box`, `sphere`, and `capsule`.

## References

Geometry accepts a legacy string or `{type, id}`; material entries accept a
legacy string or `{type:"material",id}`. Terrain and script follow the same
pattern with their respective types. Prefer typed objects.

## Actor defaults

- Every actor constructor includes one `script` component.
- World also includes `terrain`.
- Mesh, Camera, and light actors add their matching component.
- Environment adds `sky`, `directionalLight`, `ambientLight`, `fog`, and
  `volumetricCloud`.

## Source references

- `Components/registerComponents.js` and every file in `Components/`
- `Types/BasicValueTypes.js`, `Types/IEVector3.js`, and asset-reference types
