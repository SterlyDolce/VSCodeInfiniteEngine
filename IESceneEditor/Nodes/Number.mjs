// @ts-nocheck
import { nodeRegistry } from '../IENodeRegistry.mjs';

function unary(type, name, operation) {
    nodeRegistry.register(type, {
        name,
        category: 'Number',
        inputs: [{ name: 'Value', type: 'number', default: 0 }],
        outputs: [{ name: 'Result', type: 'number' }],
        evaluate({ readInput }) {
            return operation(Number(readInput('Value')));
        }
    });
}

unary('number.round', 'Round', Math.round);
unary('number.floor', 'Floor', Math.floor);
unary('number.ceil', 'Ceiling', Math.ceil);
unary('number.truncate', 'Truncate', Math.trunc);
unary('number.squareRoot', 'Square Root', value => Math.sqrt(value));
unary('number.sign', 'Sign', Math.sign);
unary('number.fraction', 'Fraction', value => value - Math.trunc(value));
unary('number.cosine', 'Cosine', value => Math.cos(value));
unary('number.sine', 'Sine (Radians)', value => Math.sin(value));
unary('number.tangent', 'Tangent', value => Math.tan(value));
unary('number.arcSine', 'Arc Sine', value => Math.asin(value));
unary('number.arcCosine', 'Arc Cosine', value => Math.acos(value));
unary('number.arcTangent', 'Arc Tangent', value => Math.atan(value));
unary('number.naturalLog', 'Natural Log', value => Math.log(value));
unary('number.log10', 'Log Base 10', value => Math.log10(value));
unary('number.log2', 'Log Base 2', value => Math.log2(value));
unary('number.exponential', 'Exponential', value => Math.exp(value));
unary('number.cubeRoot', 'Cube Root', value => Math.cbrt(value));
unary('number.degreesToRadians', 'Degrees to Radians', value => value * Math.PI / 180);
unary('number.radiansToDegrees', 'Radians to Degrees', value => value * 180 / Math.PI);

nodeRegistry.register('number.modulo', {
    name: 'Modulo',
    category: 'Number',
    inputs: [
        { name: 'Value', type: 'number', default: 0 },
        { name: 'Divisor', type: 'number', default: 1 }
    ],
    outputs: [{ name: 'Result', type: 'number' }],
    evaluate({ readInput }) {
        const divisor = Number(readInput('Divisor'));
        if (divisor === 0) throw new Error('Modulo by zero');
        return Number(readInput('Value')) % divisor;
    }
});

nodeRegistry.register('number.power', {
    name: 'Power',
    category: 'Number',
    inputs: [
        { name: 'Base', type: 'number', default: 0 },
        { name: 'Exponent', type: 'number', default: 2 }
    ],
    outputs: [{ name: 'Result', type: 'number' }],
    evaluate({ readInput }) {
        return Math.pow(
            Number(readInput('Base')),
            Number(readInput('Exponent'))
        );
    }
});

nodeRegistry.register('number.lerp', {
    name: 'Lerp',
    category: 'Number',
    inputs: [
        { name: 'A', type: 'number', default: 0 },
        { name: 'B', type: 'number', default: 1 },
        { name: 'Alpha', type: 'number', default: 0.5 }
    ],
    outputs: [{ name: 'Result', type: 'number' }],
    evaluate({ readInput }) {
        const a = Number(readInput('A'));
        return a + (Number(readInput('B')) - a) * Number(readInput('Alpha'));
    }
});

nodeRegistry.register('number.inverseLerp', {
    name: 'Inverse Lerp',
    category: 'Number',
    inputs: [
        { name: 'A', type: 'number', default: 0 },
        { name: 'B', type: 'number', default: 1 },
        { name: 'Value', type: 'number', default: 0.5 }
    ],
    outputs: [{ name: 'Alpha', type: 'number' }],
    evaluate({ readInput }) {
        const a = Number(readInput('A'));
        const range = Number(readInput('B')) - a;
        return range === 0 ? 0 : (Number(readInput('Value')) - a) / range;
    }
});

nodeRegistry.register('number.mapRange', {
    name: 'Map Range',
    category: 'Number',
    inputs: [
        { name: 'Value', type: 'number', default: 0 },
        { name: 'Input Min', type: 'number', default: 0 },
        { name: 'Input Max', type: 'number', default: 1 },
        { name: 'Output Min', type: 'number', default: 0 },
        { name: 'Output Max', type: 'number', default: 100 }
    ],
    outputs: [{ name: 'Result', type: 'number' }],
    evaluate({ readInput }) {
        const inputMin = Number(readInput('Input Min'));
        const inputRange = Number(readInput('Input Max')) - inputMin;
        if (inputRange === 0) return Number(readInput('Output Min'));
        const alpha = (Number(readInput('Value')) - inputMin) / inputRange;
        const outputMin = Number(readInput('Output Min'));
        return outputMin + alpha * (Number(readInput('Output Max')) - outputMin);
    }
});

nodeRegistry.register('number.approximatelyEqual', {
    name: 'Approximately Equal',
    category: 'Number',
    inputs: [
        { name: 'A', type: 'number', default: 0 },
        { name: 'B', type: 'number', default: 0 },
        { name: 'Tolerance', type: 'number', default: 0.0001 }
    ],
    outputs: [{ name: 'Result', type: 'boolean' }],
    evaluate({ readInput }) {
        return Math.abs(Number(readInput('A')) - Number(readInput('B'))) <=
            Math.abs(Number(readInput('Tolerance')));
    }
});

nodeRegistry.register('number.isFinite', {
    name: 'Is Finite Number',
    category: 'Number',
    inputs: [{ name: 'Value', type: 'number', default: 0 }],
    outputs: [{ name: 'Result', type: 'boolean' }],
    evaluate({ readInput }) {
        return Number.isFinite(Number(readInput('Value')));
    }
});

nodeRegistry.register('number.atan2', {
    name: 'Arc Tangent 2', category: 'Number',
    inputs: [{ name: 'Y', type: 'number', default: 0 }, { name: 'X', type: 'number', default: 1 }],
    outputs: [{ name: 'Radians', type: 'number' }],
    evaluate({ readInput }) { return Math.atan2(Number(readInput('Y')), Number(readInput('X'))); }
});

nodeRegistry.register('number.randomInteger', {
    name: 'Random Integer', category: 'Number',
    inputs: [{ name: 'Min', type: 'number', default: 0 }, { name: 'Max', type: 'number', default: 10 }],
    outputs: [{ name: 'Result', type: 'number' }],
    evaluate({ readInput }) {
        const min = Math.ceil(Number(readInput('Min')));
        const max = Math.floor(Number(readInput('Max')));
        return max < min ? min : Math.floor(Math.random() * (max - min + 1)) + min;
    }
});

nodeRegistry.register('number.toFixed', {
    name: 'Number to Fixed Text', category: 'Conversion',
    inputs: [{ name: 'Number', type: 'number', default: 0 }, { name: 'Decimals', type: 'number', default: 2 }],
    outputs: [{ name: 'Text', type: 'string' }],
    evaluate({ readInput }) {
        const decimals = Math.max(0, Math.min(100, Math.trunc(Number(readInput('Decimals')))));
        return Number(readInput('Number')).toFixed(decimals);
    }
});

for (const [type, name, value] of [
    ['number.pi', 'PI', Math.PI], ['number.euler', 'Euler Number', Math.E],
    ['number.infinity', 'Infinity', Infinity]
]) {
    nodeRegistry.register(type, {
        name, category: 'Number', outputs: [{ name: 'Value', type: 'number' }], evaluate() { return value; }
    });
}
