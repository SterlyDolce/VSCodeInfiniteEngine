// @ts-nocheck

import { nodeRegistry } from '../IENodeRegistry.mjs';


function getActorAssetId(actor) {
    return (
        actor?.userData?.sourceAssetId ??
        actor?.sourceAssetId ??
        actor?.source?.id ??
        actor?.assetId ??
        null
    );
}


function findComponent(actor, id) {
    if (!actor || !id) return null;

    const components = actor.components;

    if (Array.isArray(components)) {
        return components.find(component => component.id === id) ?? null;
    }

    if (components instanceof Map) {
        return components.get(id) ??
            [...components.values()].find(component => component.id === id) ??
            null;
    }

    return null;
}


// GET THE ACTOR THAT OWNS THIS SCRIPT RUNTIME
nodeRegistry.register('reference.selfActor', {
    name: 'Get Actor',
    category: 'References',

    inputs: [],

    outputs: [
        { name: 'Actor', type: 'actor' }
    ],

    evaluate({ actor, output }) {
        if (output !== 'Actor') {
            throw new Error(`Unknown output: ${output}`);
        }

        return actor ?? null;
    }
});

// GET ACTOR REFERENCE
nodeRegistry.register('reference.actor', {
    name: 'Get Actor Reference',
    category: 'References',

    inputs: [
        { name: 'Execute', type: 'execution' },
        {
            name: 'Actor',
            type: 'asset',
            assetType: 'actor',
            default: null
        }
    ],

    outputs: [
        { name: 'Success', type: 'execution' },
        { name: 'Failed', type: 'execution' },
        { name: 'Actor', type: 'actor' }
    ],

    execute({
        actor,
        node,
        readInput,
        setReferenceResult
    }) {
        const assetId = readInput('Actor');

        const matches =
            actor != null &&
            assetId != null &&
            assetId === getActorAssetId(actor);

        setReferenceResult(
            node.id,
            matches ? actor : null
        );

        return matches ? 'Success' : 'Failed';
    },

    evaluate({ node, getReferenceResult }) {
        return getReferenceResult(node.id);
    }
});


// GET COMPONENT


nodeRegistry.register('reference.component', {
    name: 'Get Component',
    category: 'References',

    inputs: [
        { name: 'Actor', type: 'actor' },
        {
            name: 'Component Name',
            type: 'string',
            default: '',
        }
    ],

    outputs: [
        { name: 'Component', type: 'component' }
    ],

    evaluate({ node, readInput }) {
        const actor = readInput('Actor');
        const usesLegacyId = node.pins?.some(pin =>
            pin.name === 'Component ID' && pin.direction === 'input'
        );
        const inputName = usesLegacyId ? 'Component ID' : 'Component Name';
        const componentName = String(readInput(inputName) ?? '').trim();

        if (!actor || !componentName) return null;

        let result = null;

        actor.traverse?.(object => {
            if (result || object === actor) return;

            if (
                usesLegacyId
                    ? object.userData?.componentId === componentName
                    : object.name === componentName
            ) {
                result = object;
            }
        });

        return result;
    }
});



// IS ACTOR VALID
nodeRegistry.register('reference.isActorValid', {
    name: 'Is Actor Valid',
    category: 'References',

    inputs: [
        { name: 'Actor', type: 'actor' }
    ],

    outputs: [
        { name: 'Valid', type: 'boolean' }
    ],

    evaluate({ readInput }) {
        const actor = readInput('Actor');

        return actor != null && actor.destroyed !== true;
    }
});

// IS COMPONENT VALID
nodeRegistry.register('reference.isComponentValid', {
    name: 'Is Component Valid',
    category: 'References',

    inputs: [
        { name: 'Component', type: 'component' }
    ],

    outputs: [
        { name: 'Valid', type: 'boolean' }
    ],

    evaluate({ readInput }) {
        return readInput('Component') != null;
    }
});
