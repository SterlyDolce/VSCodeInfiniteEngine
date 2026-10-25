// @ts-nocheck
import { nodeRegistry } from '../../IENodeRegistry.mjs';

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const key = value => String(value ?? '');

nodeRegistry.register('object.create', {
    name: 'Create Object', category: 'Object',
    inputs: [
        { name: 'Key A', type: 'string', default: 'key' }, { name: 'Value A', type: 'any', default: null },
        { name: 'Key B', type: 'string', default: '' }, { name: 'Value B', type: 'any', default: null }
    ],
    outputs: [{ name: 'Object', type: 'object' }],
    evaluate({ readInput }) {
        const result = {};
        for (const suffix of ['A', 'B']) {
            const property = key(readInput(`Key ${suffix}`));
            if (property) result[property] = structuredClone(readInput(`Value ${suffix}`));
        }
        return result;
    }
});

nodeRegistry.register('object.get', {
    name: 'Get Property', category: 'Object',
    inputs: [{ name: 'Object', type: 'object', default: {} }, { name: 'Key', type: 'string', default: '' }],
    outputs: [{ name: 'Value', type: 'any' }, { name: 'Exists', type: 'boolean' }],
    evaluate({ output, readInput }) {
        const source = object(readInput('Object'));
        const property = key(readInput('Key'));
        if (output === 'Exists') return Object.hasOwn(source, property);
        if (output === 'Value') return structuredClone(source[property] ?? null);
        throw new Error(`Unknown output: ${output}`);
    }
});

nodeRegistry.register('object.set', {
    name: 'Set Property', category: 'Object',
    inputs: [{ name: 'Object', type: 'object', default: {} }, { name: 'Key', type: 'string', default: '' }, { name: 'Value', type: 'any', default: null }],
    outputs: [{ name: 'Object', type: 'object' }],
    evaluate({ readInput }) {
        const result = structuredClone(object(readInput('Object')));
        result[key(readInput('Key'))] = structuredClone(readInput('Value'));
        return result;
    }
});

nodeRegistry.register('object.delete', {
    name: 'Delete Property', category: 'Object',
    inputs: [{ name: 'Object', type: 'object', default: {} }, { name: 'Key', type: 'string', default: '' }],
    outputs: [{ name: 'Object', type: 'object' }],
    evaluate({ readInput }) { const result = structuredClone(object(readInput('Object'))); delete result[key(readInput('Key'))]; return result; }
});

for (const [type, name, operation] of [
    ['object.keys', 'Object Keys', Object.keys],
    ['object.values', 'Object Values', Object.values],
    ['object.entries', 'Object Entries', Object.entries]
]) {
    nodeRegistry.register(type, {
        name, category: 'Object', inputs: [{ name: 'Object', type: 'object', default: {} }], outputs: [{ name: 'Array', type: 'array' }],
        evaluate({ readInput }) { return structuredClone(operation(object(readInput('Object')))); }
    });
}

nodeRegistry.register('object.merge', {
    name: 'Merge Objects', category: 'Object',
    inputs: [{ name: 'A', type: 'object', default: {} }, { name: 'B', type: 'object', default: {} }],
    outputs: [{ name: 'Object', type: 'object' }],
    evaluate({ readInput }) { return structuredClone({ ...object(readInput('A')), ...object(readInput('B')) }); }
});
