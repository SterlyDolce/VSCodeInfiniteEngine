// @ts-nocheck
import { nodeRegistry } from '../IENodeRegistry.mjs';

nodeRegistry.register('debug.print', {
    name: 'Print',
    category: 'Debug',
    inputs: [
        { name: 'exec', type: 'execution' },
        { name: 'value', type: 'any', default: null }
    ],
    outputs: [
        { name: 'exec', type: 'execution' }
    ],
    execute({ engine, readInput }) {
        if (!engine || typeof engine.print !== 'function') {
            throw new Error('IEEngine.print() is unavailable');
        }

        engine.print(readInput('value'));
    }
});
