const assert = require('node:assert/strict');
const { test } = require('node:test');
const IEEngine = require('../IEEngine');

const output = { appendLine() {} };
const emptyScene = () => ({ getActors: () => [] });

test('engine rolls back its running state when game startup fails', () => {
	const engine = new IEEngine({}, output);
	engine.loadScene(emptyScene());
	engine.setGame({
		onBegin() { throw new Error('startup failed'); },
		onEnd() {}
	});

	assert.throws(
		() => engine.start(),
		error => error.message === 'startup failed' &&
			error.runtimeContext?.phase === 'Game.onBegin'
	);
	assert.equal(engine.running, false);
	assert.equal(engine.paused, false);
	assert.equal(engine._loopHandle, undefined);
});

test('engine runtime errors identify the failing actor and component', () => {
	const engine = new IEEngine({}, output);
	engine.loadScene({
		getActors: () => [{
			id: 'actor-id',
			name: 'Player',
			components: [{
				id: 'component-id',
				name: 'Movement',
				type: 'script',
				enabled: true,
				update() { throw new Error('movement failed'); }
			}]
		}]
	});
	engine.setGame({ onUpdate() {} });

	assert.throws(
		() => engine.update(1 / 60),
		error => error.message === 'movement failed' &&
			error.runtimeContext?.phase === 'Component.update' &&
			error.runtimeContext?.actor === 'Player' &&
			error.runtimeContext?.component === 'Movement'
	);
});

test('engine always clears its loop when game teardown fails', () => {
	const engine = new IEEngine({}, output);
	engine.loadScene(emptyScene());
	engine.setGame({
		onBegin() {},
		onUpdate() {},
		onEnd() { throw new Error('teardown failed'); }
	});

	engine.start();
	assert.throws(
		() => engine.stop(),
		error => error.message === 'teardown failed' &&
			error.runtimeContext?.phase === 'Game.onEnd'
	);
	assert.equal(engine.running, false);
	assert.equal(engine.paused, false);
	assert.equal(engine._loopHandle, undefined);
});
