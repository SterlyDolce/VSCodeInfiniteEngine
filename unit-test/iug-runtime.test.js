const test = require('node:test');
const assert = require('node:assert/strict');

function createCanvas() {
    const context = {
        setTransform() {},
        clearRect() {},
        save() {},
        restore() {},
        translate() {},
        scale() {},
        beginPath() {},
        roundRect() {},
        rect() {},
        clip() {},
        fill() {},
        fillText() {},
        strokeRect() {},
        setLineDash() {}
    };

    return {
        width: 1280,
        height: 720,
        style: {},
        getContext: () => context,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
        addEventListener() {}
    };
}

test('input mode controls whether visible UI accepts mouse input', async () => {
    const { IUGRuntime } = await import('../IESceneEditor/IUGRuntime.mjs');
    const canvas = createCanvas();
    const runtime = new IUGRuntime(canvas);

    runtime.load([
        {
            id: 'hud',
            type: 'ui',
            data: { canvas: { type: 'hud', width: 1280, height: 720 }, elements: [] }
        },
        {
            id: 'menu',
            type: 'ui',
            data: { canvas: { type: 'menu', width: 1280, height: 720 }, elements: [] }
        }
    ]);

    assert.equal(runtime.show('hud'), true);
    assert.equal(canvas.style.pointerEvents, 'none');

    runtime.setInputEnabled(true);
    assert.equal(canvas.style.pointerEvents, 'auto');

    assert.equal(runtime.show('menu'), true);
    assert.equal(canvas.style.pointerEvents, 'auto');

    runtime.hide('menu');
    assert.equal(canvas.style.pointerEvents, 'auto');

    runtime.setInputEnabled(false);
    assert.equal(canvas.style.pointerEvents, 'none');
});

test('legacy UI assets default to menu mouse behavior', async () => {
    const { IUGRuntime } = await import('../IESceneEditor/IUGRuntime.mjs');
    const canvas = createCanvas();
    const runtime = new IUGRuntime(canvas);

    runtime.load([{
        id: 'legacy',
        type: 'ui',
        data: { canvas: { width: 1280, height: 720 }, elements: [] }
    }]);

    runtime.show('legacy');
    runtime.setInputEnabled(true);

    assert.equal(runtime.requiresMouse('legacy'), true);
    assert.equal(canvas.style.pointerEvents, 'auto');
});

test('Set Input Mode exposes all routing modes and forwards the selection', async () => {
    const { nodeRegistry } = await import('../IESceneEditor/Nodes/index.mjs');
    const definition = nodeRegistry.get('input.setMode');
    const modeInput = definition.inputs.find(input => input.name === 'mode');
    let selectedMode;

    assert.deepEqual(
        modeInput.editor.options,
        ['UI Only', 'Game and UI', 'Game Only']
    );
    assert.equal(definition.execute({
        readInput: name => name === 'mode' ? 'Game and UI' : undefined,
        engine: { setInputMode: mode => { selectedMode = mode; } }
    }), 'exec');
    assert.equal(selectedMode, 'Game and UI');
});

test('Show Mouse uses its boolean input to show or hide the cursor', async () => {
    const { nodeRegistry } = await import('../IESceneEditor/Nodes/index.mjs');
    const definition = nodeRegistry.get('input.showMouse');
    const calls = [];
    const engine = {
        showMouse: () => calls.push('show'),
        hideMouse: () => calls.push('hide')
    };

    definition.execute({ readInput: () => true, engine });
    definition.execute({ readInput: () => false, engine });

    assert.deepEqual(calls, ['show', 'hide']);
});

test('bound values update supported widget properties', async () => {
    const { IUGRuntime } = await import('../IESceneEditor/IUGRuntime.mjs');
    const runtime = new IUGRuntime(createCanvas());
    runtime.load([{
        id: 'status-ui',
        type: 'ui',
        data: {
            canvas: { width: 1280, height: 720 },
            elements: [{
                id: 'label', name: 'Health Label', type: 'text',
                x: 0, y: 0, width: 200, height: 40, text: '', opacity: 1
            }]
        }
    }]);
    runtime.show('status-ui');

    assert.equal(runtime.setValue('status-ui', 'Health Label', 'Text', 75), true);
    assert.equal(runtime.visible.get('status-ui').elements[0].text, '75');
    assert.equal(runtime.setValue('status-ui', 'label', 'Opacity', 2), true);
    assert.equal(runtime.visible.get('status-ui').elements[0].opacity, 1);
    assert.equal(runtime.setValue('status-ui', 'label', 'Position', { x: 24, y: 48 }), true);
    assert.equal(runtime.visible.get('status-ui').elements[0].x, 24);
    assert.equal(runtime.visible.get('status-ui').elements[0].y, 48);
});

test('legacy image placeholder backgrounds load as transparent', async () => {
    const { IUGRuntime } = await import('../IESceneEditor/IUGRuntime.mjs');
    const runtime = new IUGRuntime(createCanvas());
    runtime.load([{
        id: 'cursor-ui',
        type: 'ui',
        data: {
            canvas: { width: 1280, height: 720 },
            elements: [{
                id: 'cursor', type: 'image', x: 0, y: 0,
                width: 32, height: 32, background: '#292c34', source: ''
            }]
        }
    }]);

    runtime.show('cursor-ui');

    assert.equal(
        runtime.visible.get('cursor-ui').elements[0].background,
        'transparent'
    );
});

test('panel display modes arrange and hide parented widgets', async () => {
    const { IUGRuntime } = await import('../IESceneEditor/IUGRuntime.mjs');
    const runtime = new IUGRuntime(createCanvas());
    runtime.load([{
        id: 'menu',
        type: 'ui',
        data: {
            canvas: { width: 1280, height: 720 },
            elements: [
                { id: 'panel', name: 'Menu', type: 'panel', x: 100, y: 200, width: 400, height: 200, display: 'block' },
                { id: 'first', type: 'button', parent: 'panel', x: 0, y: 0, width: 80, height: 30 },
                { id: 'second', type: 'button', parent: 'panel', x: 0, y: 0, width: 80, height: 30 }
            ]
        }
    }]);
    runtime.show('menu');

    assert.equal(runtime.setValue('menu', 'Menu', 'Display', 'row'), true);
    const document = runtime.visible.get('menu');
    assert.deepEqual([document.elements[1].x, document.elements[1].y], [112, 212]);
    assert.deepEqual([document.elements[2].x, document.elements[2].y], [200, 212]);

    runtime.setValue('menu', 'Menu', 'Display', 'column');
    assert.deepEqual([document.elements[1].x, document.elements[1].y], [112, 212]);
    assert.deepEqual([document.elements[2].x, document.elements[2].y], [112, 250]);

    runtime.setValue('menu', 'Menu', 'Display', 'none');
    assert.equal(runtime.isDisplayed(document, document.elements[2]), false);
});

test('disabled buttons use state styles and reject interaction', async () => {
    const { IUGRuntime } = await import('../IESceneEditor/IUGRuntime.mjs');
    const runtime = new IUGRuntime(createCanvas());
    runtime.load([{
        id: 'menu',
        type: 'ui',
        data: {
            canvas: { width: 1280, height: 720 },
            elements: [{
                id: 'play', type: 'button', x: 0, y: 0, width: 160, height: 44,
                color: '#ffffff', background: '#6857ff', enabled: false
            }]
        }
    }]);
    runtime.show('menu');

    const button = runtime.visible.get('menu').elements[0];
    assert.equal(button.disabledBackground, '#3f4148');
    assert.equal(runtime.hitTest({ clientX: 20, clientY: 20 }), null);
});
