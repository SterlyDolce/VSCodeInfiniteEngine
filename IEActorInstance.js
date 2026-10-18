// @ts-nocheck

const crypto = require('crypto');
const ActorRegistry = require('./ActorRegistry');
const registerActors = require('./Actors/registerActors');

registerActors();

class IEActorInstance {
    static create(asset, parentId = undefined) {
        if (asset?.type !== 'actor' || !asset.id || !asset.data) {
            throw new Error('Invalid Actor Asset');
        }

        const type = asset.data.type ?? 'Actor';
        const actor = ActorRegistry.create(type);

        actor.id = crypto.randomUUID();
        actor.name = asset.data.name ?? asset.name ?? actor.name;
        actor.parent = parentId;

        actor.source = {
            type: 'actor',
            id: asset.id
        };

        actor.overrides = {
            components: {}
        };

        return actor;
    }

    static async resolve(instance, assetManager) {
        if (instance.source?.type !== 'actor') {
            return structuredClone(instance);
        }

        const asset = await assetManager.resolve(instance.source);

        if (!asset || asset.type !== 'actor') {
            throw new Error(
                `Actor Asset not found: ${instance.source.id}`
            );
        }

        const definition = structuredClone(asset.data);
        const overrides = instance.overrides ?? {};

        const components = (definition.components ?? []).map(component => {
            const componentOverride = overrides.components?.[component.id] ?? {};

            return {
                ...component,
                ...structuredClone(componentOverride),
                id: component.id,
                type: component.type
            };
        });

        const legacyTransform = components.find(
            component => component.type === 'transform'
        );

        const transformOverrides = overrides.transform ?? {};

        const position = structuredClone(
            transformOverrides.position ??
            definition.position ??
            legacyTransform?.position ??
            [0, 0, 0]
        );

        const rotation = structuredClone(
            transformOverrides.rotation ??
            definition.rotation ??
            legacyTransform?.rotation ??
            [0, 0, 0]
        );

        const scale = structuredClone(
            transformOverrides.scale ??
            definition.scale ??
            legacyTransform?.scale ??
            [1, 1, 1]
        );

        return {
            id: instance.id,
            name: instance.name ?? definition.name,
            type: definition.type ?? instance.type,
            parent: instance.parent,
            source: structuredClone(instance.source),
            overrides: structuredClone(overrides),
            position,
            rotation,
            scale,
            components: components.filter(
                component => component.type !== 'transform'
            )
        };
    }
}

module.exports = IEActorInstance;
