// @ts-nocheck
const assert = require('assert');

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = require('vscode');
const IETransformableActor = require('../IETransformableActor');
const IEDirectionalLightComponent = require('../Components/IEDirectionalLightComponent');
const IEFogComponent = require('../Components/IEFogComponent');
const IESkyComponent = require('../Components/IESkyComponent');
const IERigidBodyComponent = require('../Components/IERigidBodyComponent');
const IEColliderComponent = require('../Components/IEColliderComponent');
const ComponentRegistry = require('../ComponentRegistry');
const ActorRegistry = require('../ActorRegistry');
const registerComponents = require('../Components/registerComponents');
const registerActors = require('../Actors/registerActors');
// const myExtension = require('../extension');

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('actor properties support partial vector updates', () => {
		const actor = new IETransformableActor();

		actor.setProperty('position', { axis: 0, value: 10 });
		actor.setProperty('position', { axis: 2, value: -4 });

		assert.deepStrictEqual(
			actor.toJSON().position,
			[10, 0, -4]
		);
	});

	test('component properties update typed and regular values', () => {
		const light = new IEDirectionalLightComponent();

		light.setProperty('intensity', 5);
		light.setProperty('color', '#ff0000');
		light.setProperty('castShadow', true);
		light.setProperty('position', { axis: 1, value: 12 });

		const data = light.toJSON();

		assert.strictEqual(data.color, '#ff0000');
		assert.strictEqual(data.intensity, 5);
		assert.strictEqual(data.castShadow, true);
		assert.deepStrictEqual(data.position, [0, 12, 0]);
	});

	test('component enum properties are validated', () => {
		const fog = new IEFogComponent();

		fog.setProperty('mode', 'exponential');
		assert.strictEqual(fog.toJSON().mode, 'exponential');

		assert.throws(
			() => fog.setProperty('mode', 'invalid'),
			/Invalid value/
		);
	});

	test('sky component preserves its UUID and updated colors', () => {
		const original = new IESkyComponent();
		const restored = IESkyComponent.fromJSON(original.toJSON());

		assert.strictEqual(restored.id, original.id);

		restored.setProperty('topColor', '#ff0000');
		restored.setProperty('horizonColor', '#00ff00');
		restored.setProperty('bottomColor', '#0000ff');

		assert.strictEqual(restored.toJSON().topColor, '#ff0000');
		assert.strictEqual(restored.toJSON().horizonColor, '#00ff00');
		assert.strictEqual(restored.toJSON().bottomColor, '#0000ff');
	});

	test('physics components validate and serialize properties', () => {
		const body = new IERigidBodyComponent();
		body.setProperty('bodyType', 'kinematicPosition');
		body.setProperty('gravityScale', 0.5);
		body.setProperty('ccd', true);

		const collider = new IEColliderComponent();
		collider.setProperty('shape', 'capsule');
		collider.setProperty('size', { axis: 1, value: 3 });
		collider.setProperty('sensor', true);

		assert.strictEqual(body.toJSON().bodyType, 'kinematicPosition');
		assert.strictEqual(body.toJSON().gravityScale, 0.5);
		assert.strictEqual(body.toJSON().ccd, true);
		assert.strictEqual(collider.toJSON().shape, 'capsule');
		assert.deepStrictEqual(collider.toJSON().size, [1, 3, 1]);
		assert.strictEqual(collider.toJSON().sensor, true);

		assert.throws(
			() => collider.setProperty('shape', 'mesh'),
			/Invalid value/
		);
	});

	test('legacy physics enum capitalization is normalized', () => {
		assert.strictEqual(
			IERigidBodyComponent.fromJSON({ bodyType: 'Fixed' }).bodyType,
			'fixed'
		);
		assert.strictEqual(
			IEColliderComponent.fromJSON({ shape: 'Capsule' }).shape,
			'capsule'
		);
	});

	test('registered actors and components survive JSON round trips', () => {
		registerComponents();
		registerComponents();
		registerActors();
		registerActors();

		for (const type of ComponentRegistry.getTypes()) {
			const original = ComponentRegistry.create(type).toJSON();
			const restored = ComponentRegistry.fromJSON(original).toJSON();

			assert.strictEqual(restored.type, type);
			assert.strictEqual(restored.id, original.id);
		}

		for (const type of ActorRegistry.getTypes()) {
			const original = ActorRegistry.create(type).toJSON();
			const restored = ActorRegistry.fromJSON(original).toJSON();

			assert.strictEqual(restored.type, type);
			assert.strictEqual(restored.id, original.id);
		}
	});

	test('player controller returns execution flow and exposes data outputs', async () => {
		const THREE = await import('three');
		const { nodeRegistry } = await import('../IESceneEditor/Nodes/index.mjs');
		const { IEScriptRuntime } = await import(
			'../IESceneEditor/IEScriptRuntime.mjs'
		);
		const event = nodeRegistry.create('event.update');
		const controller = nodeRegistry.create('control.player');

		controller.pins.find(pin =>
			pin.name === 'forward' && pin.direction === 'input'
		).value = -1;

		const source = event.pins.find(pin =>
			pin.name === 'exec' && pin.direction === 'output'
		);
		const target = controller.pins.find(pin =>
			pin.name === 'exec' && pin.direction === 'input'
		);
		let appliedRotation;
		let appliedAngularVelocity;
		const tippedRotation = new THREE.Quaternion()
			.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 3);
		const physicsBody = {
			isDynamic: () => true,
			linvel: () => ({ x: 0, y: -2, z: 0 }),
			setLinvel: () => {},
			rotation: () => tippedRotation,
			setRotation: rotation => { appliedRotation = rotation; },
			setAngvel: velocity => { appliedAngularVelocity = velocity; }
		};
		const runtime = new IEScriptRuntime({
			nodes: [event, controller],
			links: [{ from: source.id, to: target.id }]
		}, new THREE.Group(), {
			getPhysicsBody: () => physicsBody
		});

		runtime.update(1 / 60);

		const speed = runtime.evaluate(controller, 'speed', {
			deltaTime: 1 / 60,
			results: new Map(),
			referenceResults: new Map(),
			budget: { steps: 0 }
		});

		assert(speed > 0);
		assert(Math.abs(appliedRotation.x) < 1e-8);
		assert(Math.abs(appliedRotation.z) < 1e-8);
		assert.deepStrictEqual(appliedAngularVelocity, { x: 0, y: 0, z: 0 });
	});
});
