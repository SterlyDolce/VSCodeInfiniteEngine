// @ts-nocheck

const crypto = require('crypto');

const IEMeshComponent = require('./IEMeshComponent');
const IEScriptComponent = require('./IEScriptComponent');
const IEPointLightComponent = require('./IEPointLightComponent');
const IECameraComponent = require('./IECameraComponent');
const IERigidBodyComponent = require('./IERigidBodyComponent');
const IEColliderComponent = require('./IEColliderComponent');
const IESpringArmComponent = require('./IESpringArmComponent');
const IETerrainComponent = require('./IETerrainComponent');

const COMPONENT_TYPES = [
    { type: 'mesh', label: 'Mesh', icon: 'symbol-color' },
    { type: 'script', label: 'Script', icon: 'symbol-method' },
    { type: 'pointLight', label: 'Point Light', icon: 'lightbulb' },
    { type: 'camera', label: 'Camera', icon: 'device-camera' },
    { type: 'springArm', label: 'Spring Arm', icon: 'arrow-both' },
    { type: 'rigidBody', label: 'Rigid Body', icon: 'symbol-structure' },
    { type: 'collider', label: 'Collider', icon: 'symbol-ruler' }
    ,{ type: 'terrain', label: 'Terrain', icon: 'map' }
];

const factories = {
    mesh: () => new IEMeshComponent(),
    script: () => new IEScriptComponent(),
    pointLight: () => new IEPointLightComponent(),
    camera: () => new IECameraComponent(),
    springArm: () => new IESpringArmComponent(),
    rigidBody: () => new IERigidBodyComponent(),
    collider: () => new IEColliderComponent(),
    terrain: () => new IETerrainComponent()
};

function getComponentTypes() {
    return COMPONENT_TYPES;
}

function createComponent(type, existing = []) {
    const factory = factories[type];

    if (!factory) {
        throw new Error(`Unsupported component type: ${type}`);
    }

    const component = factory().toJSON();
    const label = COMPONENT_TYPES.find(item => item.type === type).label;

    const usedNames = new Set(existing.map(item => item.name));
    let name = label;
    let number = 2;

    while (usedNames.has(name)) {
        name = `${label} ${number++}`;
    }

    return {
        ...component,
        id: crypto.randomUUID(),
        name,
        type,
        enabled: true,
        parent: null
    };
}

module.exports = {
    getComponentTypes,
    createComponent
};
