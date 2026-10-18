// @ts-nocheck

import { nodeRegistry } from '../IENodeRegistry.mjs';

nodeRegistry.register('vector3.compact', {
    name: 'Compact Vector3',
    category: 'Vector3',

    inputs: [
        { name: 'x', type: 'number', default: 0 },
        { name: 'y', type: 'number', default: 0 },
        { name: 'z', type: 'number', default: 0 }
    ],

    outputs: [
        { name: 'vector', type: 'vector3' }
    ],

    evaluate({ readInput }) {
        return [
            Number(readInput('x')),
            Number(readInput('y')),
            Number(readInput('z'))
        ];
    }
});

nodeRegistry.register('vector3.spread', {
    name: 'Spread Vector3',
    category: 'Vector3',

    inputs: [
        {
            name: 'vector',
            type: 'vector3',
            default: [0, 0, 0]
        }
    ],

    outputs: [
        { name: 'x', type: 'number' },
        { name: 'y', type: 'number' },
        { name: 'z', type: 'number' }
    ],

    evaluate({ readInput, output }) {
        const vector = readInput('vector') ?? [0, 0, 0];

        const values = Array.isArray(vector)
            ? vector
            : [vector.x ?? 0, vector.y ?? 0, vector.z ?? 0];

        switch (output) {
            case 'x': return Number(values[0]);
            case 'y': return Number(values[1]);
            case 'z': return Number(values[2]);
            default: return 0;
        }
    }
});
