// @ts-nocheck
import { nodeRegistry } from '../../IENodeRegistry.mjs';

function valueType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

nodeRegistry.register('type.of', {
    name: 'Type Of', category: 'Type',
    inputs: [{ name: 'Value', type: 'any', default: null }],
    outputs: [{ name: 'Type', type: 'string' }],
    evaluate({ readInput }) { return valueType(readInput('Value')); }
});

for (const [type, name, predicate] of [
    ['type.isNull', 'Is Null', value => value === null],
    ['type.isArray', 'Is Array', Array.isArray],
    ['type.isObject', 'Is Object', value => value !== null && typeof value === 'object' && !Array.isArray(value)],
    ['type.isNumber', 'Is Number', value => typeof value === 'number' && Number.isFinite(value)],
    ['type.isString', 'Is String', value => typeof value === 'string'],
    ['type.isBoolean', 'Is Boolean', value => typeof value === 'boolean']
]) {
    nodeRegistry.register(type, {
        name, category: 'Type', inputs: [{ name: 'Value', type: 'any', default: null }], outputs: [{ name: 'Result', type: 'boolean' }],
        evaluate({ readInput }) { return predicate(readInput('Value')); }
    });
}

nodeRegistry.register('conversion.toBoolean', {
    name: 'To Boolean', category: 'Conversion',
    inputs: [{ name: 'Value', type: 'any', default: null }],
    outputs: [{ name: 'Boolean', type: 'boolean' }],
    evaluate({ readInput }) { return Boolean(readInput('Value')); }
});

nodeRegistry.register('conversion.toText', {
    name: 'Value to Text', category: 'Conversion',
    inputs: [{ name: 'Value', type: 'any', default: null }],
    outputs: [{ name: 'Text', type: 'string' }],
    evaluate({ readInput }) {
        const value = readInput('Value');
        if (typeof value === 'string') return value;
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') {
            try { return JSON.stringify(value); } catch { return String(value); }
        }
        return String(value);
    }
});
