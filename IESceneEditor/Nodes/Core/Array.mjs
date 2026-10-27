// @ts-nocheck
import { nodeRegistry } from '../../IENodeRegistry.mjs';
import { copyRuntimeArray, copyRuntimeValue } from '../RuntimeValue.mjs';

const array = value => Array.isArray(value) ? value : [];
const clone = copyRuntimeValue;

nodeRegistry.register('array.create', {
    name: 'Create Array', category: 'Array',
    inputs: [0, 1, 2, 3].map(index => ({ name: `Item ${index}`, type: 'any', default: null })),
    outputs: [{ name: 'Array', type: 'array' }],
    evaluate({ readInput }) { return [0, 1, 2, 3].map(index => clone(readInput(`Item ${index}`))); }
});

nodeRegistry.register('array.length', {
    name: 'Array Length', category: 'Array',
    inputs: [{ name: 'Array', type: 'array', default: [] }],
    outputs: [{ name: 'Length', type: 'number' }],
    evaluate({ readInput }) { return array(readInput('Array')).length; }
});

nodeRegistry.register('array.get', {
    name: 'Get Array Item', category: 'Array',
    inputs: [{ name: 'Array', type: 'array', default: [] }, { name: 'Index', type: 'number', default: 0 }],
    outputs: [{ name: 'Value', type: 'any' }, { name: 'Valid', type: 'boolean' }],
	onConnect({ node, input, output }) {
		if (input?.name !== 'Array' || output?.type !== 'array') return;
		const itemType = output.itemType ?? 'any';
		const valuePin = node.pins?.find(pin =>
			pin.direction === 'output' && pin.name === 'Value'
		);
		if (valuePin) {
			valuePin.type = itemType;
			valuePin.itemType = itemType;
		}
	},
	onDisconnect({ node, input }) {
		if (input?.name !== 'Array') return;
		const valuePin = node.pins?.find(pin =>
			pin.direction === 'output' && pin.name === 'Value'
		);
		if (valuePin) {
			valuePin.type = 'any';
			delete valuePin.itemType;
		}
	},
    evaluate({ output, readInput }) {
        const source = array(readInput('Array'));
        const index = Math.trunc(Number(readInput('Index')));
        if (output === 'Valid') return index >= 0 && index < source.length;
        if (output === 'Value') return clone(source[index]);
        throw new Error(`Unknown output: ${output}`);
    }
});

nodeRegistry.register('array.set', {
    name: 'Set Array Item', category: 'Array',
    inputs: [{ name: 'Array', type: 'array', default: [] }, { name: 'Index', type: 'number', default: 0 }, { name: 'Value', type: 'any', default: null }],
    outputs: [{ name: 'Array', type: 'array' }],
    evaluate({ readInput }) {
        const result = copyRuntimeArray(readInput('Array'));
        const index = Math.trunc(Number(readInput('Index')));
        if (index >= 0) result[index] = clone(readInput('Value'));
        return result;
    }
});

for (const [type, name, atStart] of [
    ['array.push', 'Append Array Item', false],
    ['array.unshift', 'Prepend Array Item', true]
]) {
    nodeRegistry.register(type, {
        name, category: 'Array',
        inputs: [{ name: 'Array', type: 'array', default: [] }, { name: 'Value', type: 'any', default: null }],
        outputs: [{ name: 'Array', type: 'array' }],
        evaluate({ readInput }) {
            const result = copyRuntimeArray(readInput('Array'));
            result[atStart ? 'unshift' : 'push'](clone(readInput('Value')));
            return result;
        }
    });
}

for (const [type, name, atStart] of [
    ['array.pop', 'Pop Array Item', false],
    ['array.shift', 'Shift Array Item', true]
]) {
    nodeRegistry.register(type, {
        name, category: 'Array',
        inputs: [{ name: 'Array', type: 'array', default: [] }],
        outputs: [{ name: 'Array', type: 'array' }, { name: 'Value', type: 'any' }],
        evaluate({ output, readInput }) {
            const result = copyRuntimeArray(readInput('Array'));
            const value = result[atStart ? 'shift' : 'pop']();
            if (output === 'Array') return result;
            if (output === 'Value') return clone(value);
            throw new Error(`Unknown output: ${output}`);
        }
    });
}

nodeRegistry.register('array.concat', {
    name: 'Concat Arrays', category: 'Array',
    inputs: [{ name: 'A', type: 'array', default: [] }, { name: 'B', type: 'array', default: [] }],
    outputs: [{ name: 'Array', type: 'array' }],
    evaluate({ readInput }) { return copyRuntimeArray([...array(readInput('A')), ...array(readInput('B'))]); }
});

nodeRegistry.register('array.slice', {
    name: 'Slice Array', category: 'Array',
    inputs: [{ name: 'Array', type: 'array', default: [] }, { name: 'Start', type: 'number', default: 0 }, { name: 'End', type: 'number', default: 1 }],
    outputs: [{ name: 'Array', type: 'array' }],
    evaluate({ readInput }) { return copyRuntimeArray(array(readInput('Array')).slice(Math.trunc(Number(readInput('Start'))), Math.trunc(Number(readInput('End'))))); }
});

for (const [type, name, outputName, operation] of [
    ['array.includes', 'Array Includes', 'Result', (source, value) => source.includes(value)],
    ['array.indexOf', 'Find Array Item', 'Index', (source, value) => source.indexOf(value)]
]) {
    nodeRegistry.register(type, {
        name, category: 'Array',
        inputs: [{ name: 'Array', type: 'array', default: [] }, { name: 'Value', type: 'any', default: null }],
        outputs: [{ name: outputName, type: type.endsWith('includes') ? 'boolean' : 'number' }],
        evaluate({ readInput }) { return operation(array(readInput('Array')), readInput('Value')); }
    });
}

nodeRegistry.register('array.join', {
    name: 'Join Array', category: 'Array',
    inputs: [{ name: 'Array', type: 'array', default: [] }, { name: 'Separator', type: 'string', default: ',' }],
    outputs: [{ name: 'Text', type: 'string' }],
    evaluate({ readInput }) { return array(readInput('Array')).join(String(readInput('Separator') ?? '')); }
});

for (const [type, name, operation] of [
    ['array.reverse', 'Reverse Array', source => source.reverse()],
    ['array.unique', 'Unique Array', source => [...new Set(source)]]
]) {
    nodeRegistry.register(type, {
        name, category: 'Array', inputs: [{ name: 'Array', type: 'array', default: [] }], outputs: [{ name: 'Array', type: 'array' }],
        evaluate({ readInput }) { return operation(copyRuntimeArray(readInput('Array'))); }
    });
}

nodeRegistry.register('array.sortNumbers', {
    name: 'Sort Numbers', category: 'Array',
    inputs: [{ name: 'Array', type: 'array', default: [] }, { name: 'Descending', type: 'boolean', default: false }],
    outputs: [{ name: 'Array', type: 'array' }],
    evaluate({ readInput }) {
        const direction = readInput('Descending') === true ? -1 : 1;
        return copyRuntimeArray(readInput('Array')).sort((a, b) => (Number(a) - Number(b)) * direction);
    }
});
