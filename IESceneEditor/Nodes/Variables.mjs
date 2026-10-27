// @ts-nocheck

import { nodeRegistry } from '../IENodeRegistry.mjs';
import { copyRuntimeValue } from './RuntimeValue.mjs';


// GET VARIABLE
nodeRegistry.register('variable.get', {
    name: 'Get Variable',
    category: 'Variables',

    inputs: [],

    outputs: [
        { name: 'value', type: 'number' }
    ],

    evaluate({ node, output, variables }) {
        if (output !== 'value') {
            throw new Error(`Unknown output: ${output}`);
        }

        if (!variables.has(node.variableId)) {
            throw new Error(
                `Unknown variable: ${node.variableId}`
            );
        }

        return copyRuntimeValue(
            variables.get(node.variableId)
        );
    }
});


// SET VARIABLE
nodeRegistry.register('variable.set', {
    name: 'Set Variable',
    category: 'Variables',

    inputs: [
        { name: 'exec', type: 'execution' },
        { name: 'value', type: 'number', default: 0 }
    ],

    outputs: [
        { name: 'exec', type: 'execution' },
        { name: 'return', type: 'any' }
    ],

    execute({ node, variables, readInput, setOutputValue }) {
        if (!variables.has(node.variableId)) {
            throw new Error(
                `Unknown variable: ${node.variableId}`
            );
        }

        // Read the actual connected input
        const value = readInput('value');

        // Store it safely
        const storedValue = copyRuntimeValue(value);
        variables.set(node.variableId, storedValue);
        setOutputValue('return', storedValue);

        return 'exec';
    },

    evaluate({ node, output, variables, getOutputValue }) {
        if (output !== 'return') {
            throw new Error(`Unknown output: ${output}`);
        }

        if (!variables.has(node.variableId)) {
            throw new Error(
                `Unknown variable: ${node.variableId}`
            );
        }

        const writtenValue = getOutputValue('return');

        return copyRuntimeValue(
            writtenValue === undefined
                ? variables.get(node.variableId)
                : writtenValue
        );
    }
});
