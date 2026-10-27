// @ts-nocheck
const test = require('node:test');
const assert = require('node:assert/strict');

test('visual script runtime reports execution traces and breakpoints', async () => {
    const { IEScriptRuntime } = await import('../IESceneEditor/IEScriptRuntime.mjs');
    const traces = [];
    const printed = [];
    const runtime = new IEScriptRuntime({
        variables: [],
        functions: [],
        nodes: [
            {
                id: 'begin',
                type: 'event.onbegin',
                pins: [{ id: 'begin-exec', name: 'exec', type: 'execution', direction: 'output' }]
            },
            {
                id: 'print',
                type: 'debug.print',
                breakpoint: true,
                pins: [
                    { id: 'print-in', name: 'exec', type: 'execution', direction: 'input' },
                    { id: 'print-value', name: 'value', type: 'any', direction: 'input', value: 'hello' },
                    { id: 'print-out', name: 'exec', type: 'execution', direction: 'output' }
                ]
            }
        ],
        links: [{ id: 'link', from: 'begin-exec', to: 'print-in' }]
    }, {}, {
        print: value => printed.push(value),
        traceScript: trace => traces.push(trace)
    }, {
        diagnostics: { scriptId: 'script-id' }
    });

    runtime.begin();

    assert.deepEqual(printed, ['hello']);
    assert.equal(traces.length, 1);
    assert.equal(traces[0].scriptId, 'script-id');
    assert.equal(traces[0].nodeId, 'print');
    assert.equal(traces[0].breakpoint, true);
});

test('stateful flow nodes keep state isolated per runtime', async () => {
    const { IEScriptRuntime } = await import('../IESceneEditor/IEScriptRuntime.mjs');
    const graph = { variables: [], functions: [], nodes: [], links: [] };
    const first = new IEScriptRuntime(graph, {}, {});
    const second = new IEScriptRuntime(graph, {}, {});

    first.state.set('node', { complete: true });
    assert.equal(second.state.has('node'), false);
});

test('Open Scene routes success and failure through the engine API', async () => {
    const { nodeRegistry } = await import('../IESceneEditor/Nodes/index.mjs');
    const definition = nodeRegistry.get('scene.open');
    const scene = 'file:///project/Scenes/Menu.iescene';

    assert.equal(definition.inputs[1].assetType, 'scene');
    assert.equal(definition.execute({
        engine: { openScene: value => value === scene },
        readInput: name => name === 'Scene' ? scene : undefined
    }), 'Then');
    assert.equal(definition.execute({
        engine: { openScene: () => false },
        readInput: () => null
    }), 'Failed');
});

test('UI value bindings continue reading their connected variable', async () => {
    const { IEScriptRuntime } = await import('../IESceneEditor/IEScriptRuntime.mjs');
    const updates = [];
    const runtime = new IEScriptRuntime({
        variables: [{ id: 'health', name: 'Health', type: 'number', value: 100 }],
        functions: [],
        nodes: [
            {
                id: 'begin', type: 'event.onbegin',
                pins: [{ id: 'begin-exec', name: 'exec', type: 'execution', direction: 'output' }]
            },
            {
                id: 'health-get', type: 'variable.get', variableId: 'health',
                pins: [{ id: 'health-value', name: 'value', type: 'number', direction: 'output' }]
            },
            {
                id: 'binding', type: 'ui.bindValue',
                pins: [
                    { id: 'bind-exec', name: 'Execute', type: 'execution', direction: 'input' },
                    { id: 'bind-ui', name: 'UI', type: 'asset', direction: 'input', value: 'hud' },
                    { id: 'bind-widget', name: 'Widget', type: 'string', direction: 'input', value: 'Health' },
                    { id: 'bind-property', name: 'Property', type: 'string', direction: 'input', value: 'Text' },
                    { id: 'bind-value', name: 'Value', type: 'any', direction: 'input', value: null },
                    { id: 'bind-then', name: 'Then', type: 'execution', direction: 'output' },
                    { id: 'bind-failed', name: 'Not Found', type: 'execution', direction: 'output' }
                ]
            }
        ],
        links: [
            { id: 'execute-binding', from: 'begin-exec', to: 'bind-exec' },
            { id: 'bind-health', from: 'health-value', to: 'bind-value' }
        ]
    }, {}, {
        setUIValue: (...args) => { updates.push(args); return true; }
    });

    runtime.begin();
    runtime.variables.set('health', 75);
    runtime.update(1 / 60);

    assert.deepEqual(updates.at(-1), ['hud', 'Health', 'Text', 75]);

    runtime.widgetInteraction({
        type: 'changed',
        ui: 'hud',
        widget: 'health-input',
        widgetName: 'Health',
        value: '42',
        checked: false
    });

    assert.equal(runtime.variables.get('health'), 42);
});

test('named IUG listeners create event nodes and fire for their widget', async () => {
    const { nodeRegistry } = await import('../IESceneEditor/Nodes/index.mjs');
    const { registerUIEventAssets } = await import('../IESceneEditor/Nodes/IEUIEventNodes.mjs');
    registerUIEventAssets([{
        id: 'menu-ui',
        type: 'ui',
        data: {
            elements: [{
                id: 'play-button',
                events: [{ id: 'play-clicked', name: 'On Play', type: 'clicked' }]
            }]
        }
    }], nodeRegistry);

    const type = 'ui.event:menu-ui:play-clicked';
    const printed = [];
    const runtime = new (await import('../IESceneEditor/IEScriptRuntime.mjs')).IEScriptRuntime({
        variables: [], functions: [],
        nodes: [
            {
                id: 'event', type,
                pins: [{ id: 'event-exec', name: 'Clicked', type: 'execution', direction: 'output' }]
            },
            {
                id: 'print', type: 'debug.print',
                pins: [
                    { id: 'print-in', name: 'exec', type: 'execution', direction: 'input' },
                    { id: 'print-value', name: 'value', type: 'any', direction: 'input', value: 'played' },
                    { id: 'print-out', name: 'exec', type: 'execution', direction: 'output' }
                ]
            }
        ],
        links: [{ id: 'event-to-print', from: 'event-exec', to: 'print-in' }]
    }, {}, { print: value => printed.push(value) });

    runtime.widgetInteraction({
        type: 'clicked', ui: 'menu-ui', widget: 'play-button', widgetName: 'Play'
    });
    runtime.widgetInteraction({
        type: 'clicked', ui: 'menu-ui', widget: 'other-button', widgetName: 'Other'
    });

    assert.deepEqual(printed, ['played']);
    assert.deepEqual(
        nodeRegistry.get(type).outputs.map(output => [output.name, output.type]),
        [['Clicked', 'execution']]
    );
});
