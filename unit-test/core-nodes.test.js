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

test('visual script variable types cover the current node data types', () => {
    const types = [
        'any', 'array', 'object', 'boolean', 'color', 'number', 'string',
        'vector2', 'vector3', 'actor', 'component', 'transformable', 'mesh',
        'geometry', 'material', 'texture', 'script', 'terrain', 'animation',
        'animationState', 'animationstate', 'ui'
    ];

    for (const type of types) {
        assert.ok(IETypeRegistry.get(type), `Missing variable type: ${type}`);
    }
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

test('array nodes preserve live engine references without cloning them', async () => {
    const nodes = await registry;
    const component = {
        isObject3D: true,
        onRotationChange() {}
    };
    const source = [];
    const result = evaluate(nodes.get('array.push'), {
        Array: source,
        Value: component
    }, 'Array');

    assert.deepEqual(source, []);
    assert.equal(result.length, 1);
    assert.equal(result[0], component);
});

test('Vector 2 nodes construct and transform UI positions', async () => {
    const nodes = await registry;

    assert.deepEqual(evaluate(nodes.get('vector2.compact'), {
        x: 24,
        y: 48
    }, 'vector'), [24, 48]);
    assert.deepEqual(evaluate(nodes.get('vector2.scale'), {
        vector: [10, 20],
        scalar: 2
    }, 'result'), [20, 40]);
    assert.equal(evaluate(nodes.get('vector2.spread'), {
        vector: [12, 30]
    }, 'y'), 30);
    assert.deepEqual(evaluate(nodes.get('vector2.add'), {
        a: [1, 2],
        b: [3, 4]
    }, 'result'), [4, 6]);
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
