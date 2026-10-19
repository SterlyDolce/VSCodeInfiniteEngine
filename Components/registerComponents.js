// @ts-nocheck

const ComponentRegistry = require('../ComponentRegistry');

const IEScriptComponent = require('./IEScriptComponent');
const IEMeshComponent = require('./IEMeshComponent');
const IECameraComponent = require('./IECameraComponent');
const IEPointLightComponent = require('./IEPointLightComponent');
const IEDirectionalLightComponent = require('./IEDirectionalLightComponent');
const IESpotLightComponent = require('./IESpotLightComponent');
const IESky = require('./IESkyComponent');
const IEFogComponent = require('./IEFogComponent');
const IEAmbientLightComponent = require('./IEAmbientLightComponent');
const IEVolumetricCloudComponent = require('./IEVolumetricCloudComponent');
const IERigidBodyComponent = require('./IERigidBodyComponent');
const IEColliderComponent = require('./IEColliderComponent');
const IESpringArmComponent = require('./IESpringArmComponent');
const IETerrainComponent = require('./IETerrainComponent');

function registerComponents() {
    const builtins = {
        script: IEScriptComponent,
        mesh: IEMeshComponent,
        camera: IECameraComponent,
        springArm: IESpringArmComponent,
        pointLight: IEPointLightComponent,
        directionalLight: IEDirectionalLightComponent,
        spotLight: IESpotLightComponent,
        sky: IESky,
        fog: IEFogComponent,
        ambientLight: IEAmbientLightComponent,
        volumetricCloud: IEVolumetricCloudComponent,
        rigidBody: IERigidBodyComponent,
        collider: IEColliderComponent,
        terrain: IETerrainComponent
    };

    for (const [type, ComponentClass] of Object.entries(builtins)) {
        if (!ComponentRegistry.has(type)) {
            ComponentRegistry.register(type, ComponentClass);
        }
    }

    return ComponentRegistry;
}

module.exports = registerComponents;
