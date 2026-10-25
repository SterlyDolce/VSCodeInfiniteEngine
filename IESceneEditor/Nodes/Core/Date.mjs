// @ts-nocheck
import { nodeRegistry } from '../../IENodeRegistry.mjs';

nodeRegistry.register('date.now', {
    name: 'Current Time', category: 'Date & Time',
    outputs: [{ name: 'Milliseconds', type: 'number' }],
    evaluate() { return Date.now(); }
});

nodeRegistry.register('date.performanceNow', {
    name: 'High Resolution Time', category: 'Date & Time',
    outputs: [{ name: 'Milliseconds', type: 'number' }],
    evaluate() { return performance.now(); }
});

nodeRegistry.register('date.fromParts', {
    name: 'Create Date', category: 'Date & Time',
    inputs: [
        { name: 'Year', type: 'number', default: 2026 }, { name: 'Month', type: 'number', default: 1 },
        { name: 'Day', type: 'number', default: 1 }, { name: 'Hour', type: 'number', default: 0 },
        { name: 'Minute', type: 'number', default: 0 }, { name: 'Second', type: 'number', default: 0 }
    ],
    outputs: [{ name: 'Milliseconds', type: 'number' }],
    evaluate({ readInput }) {
        return new Date(
            Number(readInput('Year')), Number(readInput('Month')) - 1,
            Number(readInput('Day')), Number(readInput('Hour')),
            Number(readInput('Minute')), Number(readInput('Second'))
        ).getTime();
    }
});

nodeRegistry.register('date.toISO', {
    name: 'Date to ISO Text', category: 'Date & Time',
    inputs: [{ name: 'Milliseconds', type: 'number', default: 0 }],
    outputs: [{ name: 'Text', type: 'string' }],
    evaluate({ readInput }) {
        const date = new Date(Number(readInput('Milliseconds')));
        return Number.isFinite(date.getTime()) ? date.toISOString() : '';
    }
});

for (const [type, name, getter] of [
    ['date.year', 'Get Year', 'getFullYear'], ['date.month', 'Get Month', 'getMonth'],
    ['date.day', 'Get Day', 'getDate'], ['date.hour', 'Get Hour', 'getHours'],
    ['date.minute', 'Get Minute', 'getMinutes'], ['date.second', 'Get Second', 'getSeconds']
]) {
    nodeRegistry.register(type, {
        name, category: 'Date & Time', inputs: [{ name: 'Milliseconds', type: 'number', default: 0 }], outputs: [{ name: 'Value', type: 'number' }],
        evaluate({ readInput }) {
            const result = new Date(Number(readInput('Milliseconds')))[getter]();
            return type === 'date.month' ? result + 1 : result;
        }
    });
}
