// @ts-nocheck

const ActorRegistry = require('../ActorRegistry');

const IEActor = require('../IEActor');
const WorldActor = require('./WorldActor');
const MeshActor = require('./MeshActor');
const CameraActor = require('./CameraActor');
const PointLightActor = require('./PointLightActor');
const DirectionalLightActor = require('./DirectionalLightActor');
const SpotLightActor = require('./SpotLightActor');
const IEEnvironmentActor = require('./IEEnvironmentActor')

function registerActors() {
    const builtins = {
        Actor: IEActor,
        World: WorldActor,
        Mesh: MeshActor,
        Camera: CameraActor,
        PointLight: PointLightActor,
        DirectionalLight: DirectionalLightActor,
        SpotLight: SpotLightActor,
        Environment: IEEnvironmentActor
    };

    for (const [type, ActorClass] of Object.entries(builtins)) {
        if (!ActorRegistry.get(type)) {
            ActorRegistry.register(type, ActorClass);
        }
    }

    return ActorRegistry;
}

module.exports = registerActors;
