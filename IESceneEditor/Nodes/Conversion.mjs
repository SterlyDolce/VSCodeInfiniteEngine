// @ts-nocheck
import { nodeRegistry } from '../IENodeRegistry.mjs';

nodeRegistry.register('conversion.numberToText', {
    name: 'Number to Text',
    category: 'Conversion',
    inputs: [
        { name: 'Number', type: 'number', default: 0 }
    ],
    outputs: [
        { name: 'Text', type: 'string' }
    ],
    evaluate({ output, readInput }) {
        if (output !== 'Text') {
            throw new Error(`Unknown output: ${output}`);
        }

        const value = Number(readInput('Number'));
        return Number.isFinite(value) ? String(value) : '';
    }
});
