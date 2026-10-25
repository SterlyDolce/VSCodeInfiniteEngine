// @ts-nocheck
import { nodeRegistry } from '../IENodeRegistry.mjs';

const text = value => String(value ?? '');

function unary(type, name, outputType, operation) {
    nodeRegistry.register(type, {
        name,
        category: 'String',
        inputs: [{ name: 'Text', type: 'string', default: '' }],
        outputs: [{ name: 'Result', type: outputType }],
        evaluate({ readInput }) {
            return operation(text(readInput('Text')));
        }
    });
}

unary('string.length', 'String Length', 'number', value => value.length);
unary('string.uppercase', 'To Uppercase', 'string', value => value.toUpperCase());
unary('string.lowercase', 'To Lowercase', 'string', value => value.toLowerCase());
unary('string.trim', 'Trim', 'string', value => value.trim());
unary('string.isEmpty', 'Is String Empty', 'boolean', value => value.length === 0);
unary('string.reverse', 'Reverse String', 'string', value => [...value].reverse().join(''));

nodeRegistry.register('string.append', {
    name: 'Append Strings',
    category: 'String',
    inputs: [
        { name: 'A', type: 'string', default: '' },
        { name: 'B', type: 'string', default: '' }
    ],
    outputs: [{ name: 'Result', type: 'string' }],
    evaluate({ readInput }) {
        return text(readInput('A')) + text(readInput('B'));
    }
});

nodeRegistry.register('string.contains', {
    name: 'String Contains',
    category: 'String',
    inputs: [
        { name: 'Text', type: 'string', default: '' },
        { name: 'Search', type: 'string', default: '' },
        { name: 'Case Sensitive', type: 'boolean', default: true }
    ],
    outputs: [{ name: 'Result', type: 'boolean' }],
    evaluate({ readInput }) {
        let source = text(readInput('Text'));
        let search = text(readInput('Search'));
        if (readInput('Case Sensitive') !== true) {
            source = source.toLowerCase();
            search = search.toLowerCase();
        }
        return source.includes(search);
    }
});

for (const [type, name, method] of [
    ['string.startsWith', 'Starts With', 'startsWith'],
    ['string.endsWith', 'Ends With', 'endsWith']
]) {
    nodeRegistry.register(type, {
        name,
        category: 'String',
        inputs: [
            { name: 'Text', type: 'string', default: '' },
            { name: 'Search', type: 'string', default: '' }
        ],
        outputs: [{ name: 'Result', type: 'boolean' }],
        evaluate({ readInput }) {
            return text(readInput('Text'))[method](text(readInput('Search')));
        }
    });
}

nodeRegistry.register('string.substring', {
    name: 'Substring',
    category: 'String',
    inputs: [
        { name: 'Text', type: 'string', default: '' },
        { name: 'Start', type: 'number', default: 0 },
        { name: 'Length', type: 'number', default: 1 }
    ],
    outputs: [{ name: 'Result', type: 'string' }],
    evaluate({ readInput }) {
        const start = Math.max(0, Math.trunc(Number(readInput('Start'))));
        const length = Math.max(0, Math.trunc(Number(readInput('Length'))));
        return text(readInput('Text')).slice(start, start + length);
    }
});

nodeRegistry.register('string.replace', {
    name: 'Replace String',
    category: 'String',
    inputs: [
        { name: 'Text', type: 'string', default: '' },
        { name: 'Search', type: 'string', default: '' },
        { name: 'Replacement', type: 'string', default: '' },
        { name: 'Replace All', type: 'boolean', default: true }
    ],
    outputs: [{ name: 'Result', type: 'string' }],
    evaluate({ readInput }) {
        const source = text(readInput('Text'));
        const search = text(readInput('Search'));
        const replacement = text(readInput('Replacement'));
        if (!search) return source;
        return readInput('Replace All') === true
            ? source.replaceAll(search, replacement)
            : source.replace(search, replacement);
    }
});

nodeRegistry.register('string.indexOf', {
    name: 'Find String',
    category: 'String',
    inputs: [
        { name: 'Text', type: 'string', default: '' },
        { name: 'Search', type: 'string', default: '' }
    ],
    outputs: [{ name: 'Index', type: 'number' }],
    evaluate({ readInput }) {
        return text(readInput('Text')).indexOf(text(readInput('Search')));
    }
});

nodeRegistry.register('string.equals', {
    name: 'Strings Equal',
    category: 'String',
    inputs: [
        { name: 'A', type: 'string', default: '' },
        { name: 'B', type: 'string', default: '' },
        { name: 'Case Sensitive', type: 'boolean', default: true }
    ],
    outputs: [{ name: 'Result', type: 'boolean' }],
    evaluate({ readInput }) {
        let a = text(readInput('A'));
        let b = text(readInput('B'));
        if (readInput('Case Sensitive') !== true) {
            a = a.toLowerCase();
            b = b.toLowerCase();
        }
        return a === b;
    }
});

nodeRegistry.register('string.toNumber', {
    name: 'Text to Number',
    category: 'Conversion',
    inputs: [{ name: 'Text', type: 'string', default: '0' }],
    outputs: [
        { name: 'Number', type: 'number' },
        { name: 'Valid', type: 'boolean' }
    ],
    evaluate({ output, readInput }) {
        const source = text(readInput('Text')).trim();
        const value = Number(source);
        if (output === 'Valid') return source !== '' && Number.isFinite(value);
        if (output === 'Number') return source !== '' && Number.isFinite(value) ? value : 0;
        throw new Error(`Unknown output: ${output}`);
    }
});

nodeRegistry.register('string.characterAt', {
    name: 'Character At', category: 'String',
    inputs: [{ name: 'Text', type: 'string', default: '' }, { name: 'Index', type: 'number', default: 0 }],
    outputs: [{ name: 'Character', type: 'string' }],
    evaluate({ readInput }) { return [...text(readInput('Text'))][Math.trunc(Number(readInput('Index')))] ?? ''; }
});

nodeRegistry.register('string.split', {
    name: 'Split String', category: 'String',
    inputs: [{ name: 'Text', type: 'string', default: '' }, { name: 'Separator', type: 'string', default: ',' }],
    outputs: [{ name: 'Array', type: 'array' }],
    evaluate({ readInput }) { return text(readInput('Text')).split(text(readInput('Separator'))); }
});

nodeRegistry.register('string.repeat', {
    name: 'Repeat String', category: 'String',
    inputs: [{ name: 'Text', type: 'string', default: '' }, { name: 'Count', type: 'number', default: 1 }],
    outputs: [{ name: 'Result', type: 'string' }],
    evaluate({ readInput }) { return text(readInput('Text')).repeat(Math.max(0, Math.min(10000, Math.trunc(Number(readInput('Count')))))); }
});

for (const [type, name, method] of [
    ['string.padStart', 'Pad String Start', 'padStart'],
    ['string.padEnd', 'Pad String End', 'padEnd']
]) {
    nodeRegistry.register(type, {
        name, category: 'String',
        inputs: [{ name: 'Text', type: 'string', default: '' }, { name: 'Length', type: 'number', default: 1 }, { name: 'Fill', type: 'string', default: ' ' }],
        outputs: [{ name: 'Result', type: 'string' }],
        evaluate({ readInput }) { return text(readInput('Text'))[method](Math.max(0, Math.trunc(Number(readInput('Length')))), text(readInput('Fill')) || ' '); }
    });
}
