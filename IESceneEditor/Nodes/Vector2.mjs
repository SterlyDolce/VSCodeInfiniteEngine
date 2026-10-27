// @ts-nocheck

import { nodeRegistry } from '../IENodeRegistry.mjs';

function readFiniteNumber(readInput, name) {
    const value = Number(readInput(name));
    if (!Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
    }
    return value;
}

function readVector2(readInput, name) {
    const value = readInput(name);
    const vector = Array.isArray(value)
        ? value
        : [value?.x, value?.y];

    if (vector.length !== 2 || !vector.every(Number.isFinite)) {
        throw new TypeError(`${name} must be a two-number vector`);
    }
    return vector;
}

nodeRegistry.register('vector2.compact', {
    name: 'Compact Vector 2',
    category: 'Vector 2',
    inputs: [
        { name: 'x', type: 'number', default: 0 },
        { name: 'y', type: 'number', default: 0 }
    ],
    outputs: [{ name: 'vector', type: 'vector2' }],
    evaluate({ readInput }) {
        return [
            readFiniteNumber(readInput, 'x'),
            readFiniteNumber(readInput, 'y')
        ];
    }
});

nodeRegistry.register('vector2.spread', {
    name: 'Spread Vector 2',
    category: 'Vector 2',
    inputs: [{ name: 'vector', type: 'vector2', default: [0, 0] }],
    outputs: [
        { name: 'x', type: 'number' },
        { name: 'y', type: 'number' }
    ],
    evaluate({ readInput, output }) {
        const [x, y] = readVector2(readInput, 'vector');
        return output === 'x' ? x : output === 'y' ? y : 0;
    }
});

nodeRegistry.register('vector2.normalize', {
    name: 'Normalize Vector 2',
    category: 'Vector 2',
    inputs: [{ name: 'value', type: 'vector2', default: [0, 0] }],
    outputs: [{ name: 'result', type: 'vector2' }],
    evaluate({ readInput }) {
        const [x, y] = readVector2(readInput, 'value');
        const length = Math.hypot(x, y);
        return length === 0 ? [0, 0] : [x / length, y / length];
    }
});

nodeRegistry.register('vector2.scale', {
    name: 'Scale Vector 2',
    category: 'Vector 2',
    inputs: [
        { name: 'vector', type: 'vector2', default: [0, 0] },
        { name: 'scalar', type: 'number', default: 1 }
    ],
    outputs: [{ name: 'result', type: 'vector2' }],
    evaluate({ readInput }) {
        const [x, y] = readVector2(readInput, 'vector');
        const scalar = readFiniteNumber(readInput, 'scalar');
        return [x * scalar, y * scalar];
    }
});

for (const operation of [
    ['add', 'Add Vector 2', (a, b) => [a[0] + b[0], a[1] + b[1]]],
    ['subtract', 'Subtract Vector 2', (a, b) => [a[0] - b[0], a[1] - b[1]]]
]) {
    const [id, name, calculate] = operation;
    nodeRegistry.register(`vector2.${id}`, {
        name,
        category: 'Vector 2',
        inputs: [
            { name: 'a', type: 'vector2', default: [0, 0] },
            { name: 'b', type: 'vector2', default: [0, 0] }
        ],
        outputs: [{ name: 'result', type: 'vector2' }],
        evaluate({ readInput }) {
            return calculate(
                readVector2(readInput, 'a'),
                readVector2(readInput, 'b')
            );
        }
    });
}
