// @ts-nocheck
import { nodeRegistry } from '../../IENodeRegistry.mjs';

nodeRegistry.register('flow.sequence', {
    name: 'Sequence', category: 'Flow',
    inputs: [{ name: 'Execute', type: 'execution' }],
    outputs: [
        { name: 'Then 0', type: 'execution' },
        { name: 'Then 1', type: 'execution' },
        { name: 'Then 2', type: 'execution' }
    ],
    execute({ runOutput }) {
        runOutput('Then 0');
        runOutput('Then 1');
        runOutput('Then 2');
        return null;
    }
});

nodeRegistry.register('flow.forEach', {
    name: 'For Each', category: 'Flow',
    inputs: [
        { name: 'Execute', type: 'execution' },
        { name: 'Array', type: 'array', default: [] }
    ],
    outputs: [
        { name: 'Loop Body', type: 'execution' },
        { name: 'Value', type: 'any' },
        { name: 'Index', type: 'number' },
        { name: 'Completed', type: 'execution' }
    ],
    execute({ readInput, setOutputValue, runOutput, consumeExecutionStep, isStopped }) {
        const values = readInput('Array');
        if (!Array.isArray(values)) return 'Completed';
        for (let index = 0; index < values.length; index++) {
            if (isStopped()) return null;
            consumeExecutionStep();
            setOutputValue('Value', structuredClone(values[index]));
            setOutputValue('Index', index);
            runOutput('Loop Body');
        }
        return 'Completed';
    },
    evaluate({ output, getOutputValue }) {
        if (!['Value', 'Index'].includes(output)) throw new Error(`Unknown output: ${output}`);
        return getOutputValue(output);
    }
});

nodeRegistry.register('flow.doOnce', {
    name: 'Do Once', category: 'Flow',
    inputs: [
        { name: 'Execute', type: 'execution' },
        { name: 'Reset', type: 'boolean', default: false }
    ],
    outputs: [{ name: 'Then', type: 'execution' }],
    execute({ readInput, state }) {
        if (readInput('Reset') === true) state.complete = false;
        if (state.complete) return null;
        state.complete = true;
        return 'Then';
    }
});

nodeRegistry.register('flow.flipFlop', {
    name: 'Flip Flop', category: 'Flow',
    inputs: [{ name: 'Execute', type: 'execution' }],
    outputs: [
        { name: 'A', type: 'execution' },
        { name: 'B', type: 'execution' },
        { name: 'Is A', type: 'boolean' }
    ],
    execute({ state, setOutputValue }) {
        const isA = state.next !== false;
        state.next = !isA;
        setOutputValue('Is A', isA);
        return isA ? 'A' : 'B';
    },
    evaluate({ output, getOutputValue }) {
        if (output !== 'Is A') throw new Error(`Unknown output: ${output}`);
        return getOutputValue('Is A');
    }
});

nodeRegistry.register('flow.delay', {
    name: 'Delay', category: 'Flow',
    inputs: [
        { name: 'Execute', type: 'execution' },
        { name: 'Seconds', type: 'number', default: 1 }
    ],
    outputs: [{ name: 'Completed', type: 'execution' }],
    execute({ readInput, fireOutput, isStopped }) {
        const milliseconds = Math.max(0, Number(readInput('Seconds')) * 1000);
        setTimeout(() => {
            if (!isStopped()) fireOutput('Completed');
        }, milliseconds);
        return null;
    }
});
