// @ts-nocheck

import { nodeRegistry } from '../IENodeRegistry.mjs';

nodeRegistry.register('math.multiply', {
    name: 'Multiply',
    category: 'Math',
    inputs: [
        { name: 'a', type: 'number', default: 0 },
        { name: 'b', type: 'number', default: 1 }
    ],
    outputs: [
        { name: 'result', type: 'number' }
    ],
    evaluate({ output, readInput }) {
        if (output !== 'result') {
            throw new Error(`Unknown output: ${output}`);
        }

        return Number(readInput('a')) *
            Number(readInput('b'));
    }
});

nodeRegistry.register('math.add', {
    name: 'Add',
    category: 'Math',
    inputs: [
        { name: 'a', type: 'number', default: 0 },
        { name: 'b', type: 'number', default: 0 }
    ],
    outputs: [
        { name: 'result', type: 'number' }
    ],
    evaluate({ output, readInput }) {
        if (output !== 'result') {
            throw new Error(`Unknown output: ${output}`);
        }

        return Number(readInput('a')) +
            Number(readInput('b'));
    }
});

nodeRegistry.register('math.subtract', {
    name: 'Subtract',
    category: 'Math',
    inputs: [
        { name: 'a', type: 'number', default: 0 },
        { name: 'b', type: 'number', default: 0 }
    ],
    outputs: [
        { name: 'result', type: 'number' }
    ],
    evaluate({ output, readInput }) {
        if (output !== 'result') {
            throw new Error(`Unknown output: ${output}`);
        }

        return Number(readInput('a')) -
            Number(readInput('b'));
    }
});

nodeRegistry.register('math.divide', {
    name: 'Divide',
    category: 'Math',
    inputs: [
        { name: 'a', type: 'number', default: 0 },
        { name: 'b', type: 'number', default: 1 }
    ],
    outputs: [
        { name: 'result', type: 'number' }
    ],
    evaluate({ output, readInput }) {
        if (output !== 'result') {
            throw new Error(`Unknown output: ${output}`);
        }

        const b = Number(readInput('b'));
        if (b === 0) throw new Error('Division by zero');

        return Number(readInput('a')) / b;
    }
});



nodeRegistry.register('math.absolute', {
    name: 'Absolute',
    category: 'Math',
    inputs: [
        { name: 'value', type: 'number', default: 0 }
    ],
    outputs: [
        { name: 'result', type: 'number' }
    ],
    evaluate({ readInput }) {
        return Math.abs(Number(readInput('value')));
    }
});

nodeRegistry.register('math.min', {
    name: 'Min',
    category: 'Math',
    inputs: [
        { name: 'a', type: 'number', default: 0 },
        { name: 'b', type: 'number', default: 0 }
    ],
    outputs: [
        { name: 'result', type: 'number' }
    ],
    evaluate({ readInput }) {
        return Math.min(
            Number(readInput('a')),
            Number(readInput('b'))
        );
    }
});

nodeRegistry.register('math.max', {
    name: 'Max',
    category: 'Math',
    inputs: [
        { name: 'a', type: 'number', default: 0 },
        { name: 'b', type: 'number', default: 0 }
    ],
    outputs: [
        { name: 'result', type: 'number' }
    ],
    evaluate({ readInput }) {
        return Math.max(
            Number(readInput('a')),
            Number(readInput('b'))
        );
    }
});

nodeRegistry.register('math.clamp', {
    name: 'Clamp',
    category: 'Math',
    inputs: [
        { name: 'value', type: 'number', default: 0 },
        { name: 'min', type: 'number', default: 0 },
        { name: 'max', type: 'number', default: 1 }
    ],
    outputs: [
        { name: 'result', type: 'number' }
    ],
    evaluate({ readInput }) {
        const value = Number(readInput('value'));
        const min = Number(readInput('min'));
        const max = Number(readInput('max'));

        return Math.min(Math.max(value, min), max);
    }
});

nodeRegistry.register('math.sin', {
    name: 'Sine',
    category: 'Math',
    inputs: [
        { name: 'degrees', type: 'number', default: 0 }
    ],
    outputs: [
        { name: 'result', type: 'number' }
    ],
    evaluate({ readInput }) {
        const degrees = Number(readInput('degrees'));
        return Math.sin(degrees * Math.PI / 180);
    }
});

nodeRegistry.register('math.randomRange', {
    name: 'Random Range',
    category: 'Math',
    inputs: [
        { name: 'min', type: 'number', default: 0 },
        { name: 'max', type: 'number', default: 1 }
    ],
    outputs: [
        { name: 'result', type: 'number' }
    ],
    evaluate({ readInput }) {
        const min = Number(readInput('min'));
        const max = Number(readInput('max'));

        return min + Math.random() * (max - min);
    }
});
