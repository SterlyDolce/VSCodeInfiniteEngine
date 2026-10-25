// @ts-nocheck
const test = require('node:test');
const assert = require('node:assert/strict');
const IETypeRegistry = require('../Types/IETypeRegistry');

const registry = import('../IESceneEditor/Nodes/index.mjs')
    .then(module => module.nodeRegistry);

function evaluate(definition, inputs, output = 'Result') {
    return definition.evaluate({
        output,
        readInput: name => inputs[name]
    });
}

test('core collection types are registered and clone their values', () => {
    for (const type of ['any', 'array', 'object']) {
        assert.ok(IETypeRegistry.get(type));
    }

    const source = [{ score: 1 }];
    const value = IETypeRegistry.create('array', source);
    source[0].score = 2;
    assert.deepEqual(value.getValue(), [{ score: 1 }]);
});

test('array and object nodes return immutable results', async () => {
    const nodes = await registry;
    const source = [1, 2];
    const appended = evaluate(nodes.get('array.push'), {
        Array: source,
        Value: 3
    }, 'Array');

    assert.deepEqual(source, [1, 2]);
    assert.deepEqual(appended, [1, 2, 3]);

    const object = { score: 4 };
    const updated = evaluate(nodes.get('object.set'), {
        Object: object,
        Key: 'score',
        Value: 10
    }, 'Object');

    assert.deepEqual(object, { score: 4 });
    assert.deepEqual(updated, { score: 10 });
});

test('JSON, string, number, type, and regular expression nodes evaluate', async () => {
    const nodes = await registry;

    assert.equal(evaluate(nodes.get('string.split'), {
        Text: 'a,b,c', Separator: ','
    }, 'Array').length, 3);

    assert.equal(evaluate(nodes.get('number.mapRange'), {
        Value: 0.5,
        'Input Min': 0,
        'Input Max': 1,
        'Output Min': 0,
        'Output Max': 100
    }), 50);

    assert.deepEqual(evaluate(nodes.get('json.parse'), {
        Text: '{"ready":true}'
    }, 'Value'), { ready: true });

    assert.equal(evaluate(nodes.get('type.of'), {
        Value: [1, 2]
    }, 'Type'), 'array');

    assert.equal(evaluate(nodes.get('regexp.test'), {
        Text: 'Player42',
        Pattern: '^Player\\d+$',
        Flags: ''
    }, 'Matches'), true);
});
