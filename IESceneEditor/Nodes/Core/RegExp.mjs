// @ts-nocheck
import { nodeRegistry } from '../../IENodeRegistry.mjs';

function expression(readInput, global = false) {
    let flags = String(readInput('Flags') ?? '');
    if (global && !flags.includes('g')) flags += 'g';
    return new RegExp(String(readInput('Pattern') ?? ''), flags);
}

nodeRegistry.register('regexp.test', {
    name: 'Regex Test', category: 'Regular Expression',
    inputs: [
        { name: 'Text', type: 'string', default: '' },
        { name: 'Pattern', type: 'string', default: '' },
        { name: 'Flags', type: 'string', default: '' }
    ],
    outputs: [{ name: 'Matches', type: 'boolean' }, { name: 'Valid', type: 'boolean' }],
    evaluate({ output, readInput }) {
        try {
            const result = expression(readInput).test(String(readInput('Text') ?? ''));
            if (output === 'Matches') return result;
            if (output === 'Valid') return true;
        } catch {
            if (output === 'Matches' || output === 'Valid') return false;
        }
        throw new Error(`Unknown output: ${output}`);
    }
});

nodeRegistry.register('regexp.matchAll', {
    name: 'Regex Match All', category: 'Regular Expression',
    inputs: [
        { name: 'Text', type: 'string', default: '' },
        { name: 'Pattern', type: 'string', default: '' },
        { name: 'Flags', type: 'string', default: '' }
    ],
    outputs: [{ name: 'Matches', type: 'array' }, { name: 'Valid', type: 'boolean' }],
    evaluate({ output, readInput }) {
        try {
            const matches = [...String(readInput('Text') ?? '').matchAll(expression(readInput, true))]
                .map(match => match[0]);
            if (output === 'Matches') return matches;
            if (output === 'Valid') return true;
        } catch {
            if (output === 'Matches') return [];
            if (output === 'Valid') return false;
        }
        throw new Error(`Unknown output: ${output}`);
    }
});

nodeRegistry.register('regexp.replace', {
    name: 'Regex Replace', category: 'Regular Expression',
    inputs: [
        { name: 'Text', type: 'string', default: '' },
        { name: 'Pattern', type: 'string', default: '' },
        { name: 'Replacement', type: 'string', default: '' },
        { name: 'Flags', type: 'string', default: 'g' }
    ],
    outputs: [{ name: 'Text', type: 'string' }, { name: 'Valid', type: 'boolean' }],
    evaluate({ output, readInput }) {
        try {
            const result = String(readInput('Text') ?? '').replace(
                expression(readInput),
                String(readInput('Replacement') ?? '')
            );
            if (output === 'Text') return result;
            if (output === 'Valid') return true;
        } catch {
            if (output === 'Text') return String(readInput('Text') ?? '');
            if (output === 'Valid') return false;
        }
        throw new Error(`Unknown output: ${output}`);
    }
});
