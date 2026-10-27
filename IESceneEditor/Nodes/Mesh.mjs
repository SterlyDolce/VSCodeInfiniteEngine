// @ts-nocheck

import { nodeRegistry } from '../IENodeRegistry.mjs';

nodeRegistry.register('mesh.set', {
    name: 'Set Mesh',
    category: 'Mesh',

    inputs: [
        { name: 'Execute', type: 'execution' },
        { name: 'Component', type: 'component' },

        {
            name: 'Geometry',
            type: 'asset',
            assetType: 'geometry',
            default: null
        },

        {
            name: 'Materials',
            type: 'asset',
            assetType: 'material',
            isArray: true,
            default: []
        }
    ],

    outputs: [
        { name: 'Then', type: 'execution' }
    ],

    execute({ readInput, engine }) {
        const component = readInput('Component');
        const geometryId = readInput('Geometry');
        const materials = readInput('Materials');
        const materialIds = Array.isArray(materials)
            ? materials
            : (materials ? [materials] : []);

        if (!component?.isMesh) {
            return 'Then';
        }

        engine.setMesh(
            component,
            geometryId,
            materialIds
        );

        return 'Then';
    }
});



nodeRegistry.register('mesh.get', {
    name: 'Get Mesh',
    category: 'Mesh',

    inputs: [
        { name: 'Component', type: 'component' }
    ],

    outputs: [
        { name: 'Mesh', type: 'mesh' }
    ],

    evaluate({ readInput, engine }) {
        const component = readInput('Component');

        return engine.getMesh(component);
    }
});
