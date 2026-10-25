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
