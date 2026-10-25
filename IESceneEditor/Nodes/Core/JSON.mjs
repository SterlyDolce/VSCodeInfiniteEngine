// @ts-nocheck
import { nodeRegistry } from '../../IENodeRegistry.mjs';

nodeRegistry.register('json.stringify', {
    name: 'JSON Stringify', category: 'JSON',
    inputs: [{ name: 'Value', type: 'any', default: null }, { name: 'Pretty', type: 'boolean', default: false }],
    outputs: [{ name: 'Text', type: 'string' }, { name: 'Valid', type: 'boolean' }],
    evaluate({ output, readInput }) {
        try {
            const result = JSON.stringify(readInput('Value'), null, readInput('Pretty') === true ? 2 : 0);
            if (output === 'Valid') return result !== undefined;
            if (output === 'Text') return result ?? '';
        } catch {
            if (output === 'Valid') return false;
            if (output === 'Text') return '';
        }
        throw new Error(`Unknown output: ${output}`);
    }
});

nodeRegistry.register('json.parse', {
    name: 'JSON Parse', category: 'JSON',
    inputs: [{ name: 'Text', type: 'string', default: '{}' }],
    outputs: [{ name: 'Value', type: 'any' }, { name: 'Valid', type: 'boolean' }],
    evaluate({ output, readInput }) {
        try {
            const value = JSON.parse(String(readInput('Text') ?? ''));
            if (output === 'Valid') return true;
            if (output === 'Value') return value;
        } catch {
            if (output === 'Valid') return false;
            if (output === 'Value') return null;
        }
        throw new Error(`Unknown output: ${output}`);
    }
});

nodeRegistry.register('json.clone', {
    name: 'Clone Value', category: 'JSON',
    inputs: [{ name: 'Value', type: 'any', default: null }],
    outputs: [{ name: 'Value', type: 'any' }],
    evaluate({ readInput }) { return structuredClone(readInput('Value')); }
});
