// @ts-nocheck

import { nodeRegistry } from '../IENodeRegistry.mjs';

nodeRegistry.register('logic.branch', {
    name: 'Branch',
    category: 'Logic',
    inputs: [
        { name: 'exec', type: 'execution' },
        { name: 'condition', type: 'boolean', default: false }
    ],
    outputs: [
        { name: 'true', type: 'execution' },
        { name: 'false', type: 'execution' }
    ],
    execute({ readInput }) {
        return readInput('condition') === true ? 'true' : 'false';
    }
});

nodeRegistry.register('logic.equal', {
    name: 'Equal',
    category: 'Logic',
    inputs: [
        { name: 'a', type: 'number', default: 0 },
        { name: 'b', type: 'number', default: 0 }
    ],
    outputs: [
        { name: 'result', type: 'boolean' }
    ],
    evaluate({ readInput }) {
        return Number(readInput('a')) === Number(readInput('b'));
    }
});

nodeRegistry.register('logic.notEqual', {
    name: 'Not Equal',
    category: 'Logic',
    inputs: [
        { name: 'a', type: 'number', default: 0 },
        { name: 'b', type: 'number', default: 0 }
    ],
    outputs: [
        { name: 'result', type: 'boolean' }
    ],
    evaluate({ readInput }) {
        return Number(readInput('a')) !== Number(readInput('b'));
    }
});

nodeRegistry.register('logic.greater', {
    name: 'Greater Than',
    category: 'Logic',
    inputs: [
        { name: 'a', type: 'number', default: 0 },
        { name: 'b', type: 'number', default: 0 }
    ],
    outputs: [
        { name: 'result', type: 'boolean' }
    ],
    evaluate({ readInput }) {
        return Number(readInput('a')) > Number(readInput('b'));
    }
});

nodeRegistry.register('logic.less', {
    name: 'Less Than',
    category: 'Logic',
    inputs: [
        { name: 'a', type: 'number', default: 0 },
        { name: 'b', type: 'number', default: 0 }
    ],
    outputs: [
        { name: 'result', type: 'boolean' }
    ],
    evaluate({ readInput }) {
        return Number(readInput('a')) < Number(readInput('b'));
    }
});

nodeRegistry.register('logic.and', {
    name: 'AND',
    category: 'Logic',
    inputs: [
        { name: 'a', type: 'boolean', default: false },
        { name: 'b', type: 'boolean', default: false }
    ],
    outputs: [
        { name: 'result', type: 'boolean' }
    ],
    evaluate({ readInput }) {
        return readInput('a') === true &&
            readInput('b') === true;
    }
});

nodeRegistry.register('logic.or', {
    name: 'OR',
    category: 'Logic',
    inputs: [
        { name: 'a', type: 'boolean', default: false },
        { name: 'b', type: 'boolean', default: false }
    ],
    outputs: [
        { name: 'result', type: 'boolean' }
    ],
    evaluate({ readInput }) {
        return readInput('a') === true ||
            readInput('b') === true;
    }
});

nodeRegistry.register('logic.not', {
    name: 'NOT',
    category: 'Logic',
    inputs: [
        { name: 'value', type: 'boolean', default: false }
    ],
    outputs: [
        { name: 'result', type: 'boolean' }
    ],
    evaluate({ readInput }) {
        return readInput('value') !== true;
    }
});



nodeRegistry.register('logic.switch', {
    name: 'Switch',
    category: 'Logic',

    inputs: [
        { name: 'Execute', type: 'execution' },
        { name: 'Value', type: 'any', default: null }
    ],

    outputs: [
        { name: 'Case 1', type: 'execution' },
        { name: 'Default', type: 'execution' }
    ],

    onConnect({ node, input, output }) {
        if (input.name !== 'Value') return;

        node.valueType = output.type;
    },

    onDisconnect({ node, input }) {
        if (input.name !== 'Value') return;

        node.valueType = 'any';
    },

    execute({ node, readInput }) {
        const value = readInput('Value');

        for (const item of node.cases ?? []) {
            if (value === item.value) {
                return item.name;
            }
        }

        return 'Default';
    }
});




nodeRegistry.register('logic.for', {
    name: 'For Loop',
    category: 'Logic',

    inputs: [
        { name: 'Execute', type: 'execution' },
        { name: 'First Index', type: 'number', default: 0 },
        { name: 'Last Index', type: 'number', default: 0 }
    ],

    outputs: [
        { name: 'Loop Body', type: 'execution' },
        { name: 'Current Index', type: 'number' },
        { name: 'Completed', type: 'execution' }
    ],

    execute({ readInput, setOutputValue, runOutput, consumeExecutionStep, isStopped }) {
        const first = Math.trunc(Number(readInput('First Index')));
        const last = Math.trunc(Number(readInput('Last Index')));

        if (!Number.isFinite(first) || !Number.isFinite(last)) {
            throw new TypeError('Invalid loop indices');
        }



        // The range is inclusive, matching the node's First/Last Index labels.
        // Running the body synchronously keeps Current Index scoped to each pass.
        for (let index = first; index <= last; index++) {
            if (isStopped()) return null;

            consumeExecutionStep();
            setOutputValue('Current Index', index);
            runOutput('Loop Body');
        }

        return 'Completed';
    },

    evaluate({ output, getOutputValue }) {
        if (output !== 'Current Index') {
            throw new Error(`Unknown output: ${output}`);
        }

        return getOutputValue('Current Index');
    }
});
