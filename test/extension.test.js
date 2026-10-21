// @ts-nocheck
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = require('vscode');
const IETransformableActor = require('../IETransformableActor');
const IEDirectionalLightComponent = require('../Components/IEDirectionalLightComponent');
const IEFogComponent = require('../Components/IEFogComponent');
const IESkyComponent = require('../Components/IESkyComponent');
const IERigidBodyComponent = require('../Components/IERigidBodyComponent');
const IEColliderComponent = require('../Components/IEColliderComponent');
const IEMeshComponent = require('../Components/IEMeshComponent');
const IETerrainComponent = require('../Components/IETerrainComponent');
const IEPointLightComponent = require('../Components/IEPointLightComponent');
const ComponentRegistry = require('../ComponentRegistry');
const ActorRegistry = require('../ActorRegistry');
const registerComponents = require('../Components/registerComponents');
const registerActors = require('../Actors/registerActors');
const IEAssetImporter = require('../IEAssetImporter');
const IEScene = require('../IEScene');
const IESceneEditor = require('../IESceneEditor/IESceneEditor');
const {
	createTemplate,
	getTemplates
} = require('../IEActorAssetEditor/IEAssetTemplates');
const { worldNodeRegistry } = require('../IEWorldEditor/WorldNodeRegistry');
const IETerrainGraphEvaluator = require('../IEWorldEditor/IETerrainGraphEvaluator');
// const myExtension = require('../extension');

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('scene template creates a loadable scene document', () => {
		const template = getTemplates().find(item => item.type === 'scene');
		const document = createTemplate('scene', 'Arena');
		const scene = IEScene.fromJSON(document);

		assert.strictEqual(template.extension, '.iescene');
		assert.strictEqual(document.name, 'Arena');
		assert.strictEqual(scene.world.name, 'World');
		assert(scene.world.getComponent('terrain'));
	});

	test('terrain plane resolution controls generated mesh detail', () => {
		const plane = worldNodeRegistry.get('world.plane');
		const values = {
			Width: 100,
			Depth: 100,
			'Resolution X': 32,
			'Resolution Y': 32,
			Heightmap: {
				width: 257,
				height: 129,
				data: new Float32Array(257 * 129)
			}
		};
		const { Geometry: geometry } = plane.evaluate({
			read: name => values[name],
			maxResolution: 512
		});

		assert.strictEqual(geometry.resolutionX, 32);
		assert.strictEqual(geometry.resolutionY, 32);
		assert.strictEqual(geometry.positions.length, 33 * 33 * 3);
	});

	test('terrain heightmap detail respects the evaluator quality cap', () => {
		const plane = worldNodeRegistry.get('world.plane');
		const values = {
			Width: 100,
			Depth: 100,
			'Resolution X': 512,
			'Resolution Y': 512,
			Heightmap: {
				width: 1025,
				height: 1025,
				data: new Float32Array(1025 * 1025)
			}
		};
		const { Geometry: geometry } = plane.evaluate({
			read: name => values[name],
			maxResolution: 256
		});

		assert.strictEqual(geometry.resolutionX, 256);
		assert.strictEqual(geometry.resolutionY, 256);
	});

	test('terrain output evaluates a connected terrain material', () => {
		const plane = worldNodeRegistry.create('world.plane');
		const material = worldNodeRegistry.create('world.terrainMaterial');
		const output = worldNodeRegistry.create('world.terrainOutput');
		const pin = (node, name, direction) => node.pins.find(item =>
			item.name === name && item.direction === direction
		);
		pin(material, 'Base Color', 'input').value = '#446633';
		pin(material, 'Texture Scale', 'input').value = [8, 12];
		pin(material, 'Roughness', 'input').value = 0.75;
		const graph = {
			nodes: [plane, material, output],
			links: [
				{ id: crypto.randomUUID(), from: pin(plane, 'Geometry', 'output').id, to: pin(output, 'Geometry', 'input').id },
				{ id: crypto.randomUUID(), from: pin(material, 'Material', 'output').id, to: pin(output, 'Material', 'input').id }
			]
		};
		const result = new IETerrainGraphEvaluator(worldNodeRegistry, {
			maxResolution: 8
		}).evaluate(graph);

		assert.strictEqual(result.terrain.material.color, '#446633');
		assert.deepStrictEqual(result.terrain.material.textureScale, [8, 12]);
		assert.strictEqual(result.terrain.material.roughness, 0.75);
	});

	test('terrain output resolves a selected material asset', () => {
		const plane = worldNodeRegistry.create('world.plane');
		const scale = worldNodeRegistry.create('world.vector2');
		const output = worldNodeRegistry.create('world.terrainOutput');
		const pin = (node, name, direction) => node.pins.find(item =>
			item.name === name && item.direction === direction
		);
		const materialId = crypto.randomUUID();
		const material = {
			type: 'standard',
			color: '#ffffff',
			resolvedMap: { data: { image: 'data:image/png;base64,AAAA' } }
		};
		pin(output, 'Material', 'input').value = materialId;
		pin(scale, 'X', 'input').value = 8;
		pin(scale, 'Y', 'input').value = 12;
		pin(output, 'UV Offset', 'input').value = [0.25, 0.5];
		const graph = {
			nodes: [plane, scale, output],
			links: [
				{
					id: crypto.randomUUID(),
					from: pin(plane, 'Geometry', 'output').id,
					to: pin(output, 'Geometry', 'input').id
				},
				{
					id: crypto.randomUUID(),
					from: pin(scale, 'Vector', 'output').id,
					to: pin(output, 'UV Scale', 'input').id
				}
			]
		};
		const result = new IETerrainGraphEvaluator(worldNodeRegistry, {
			maxResolution: 8,
			materials: new Map([[materialId, material]])
		}).evaluate(graph);

		assert.deepStrictEqual(result.terrain.material, {
			...material,
			terrainUvScale: [8, 12],
			terrainUvOffset: [0.25, 0.5]
		});
	});

	test('legacy terrain output remains valid without a material pin', () => {
		const output = worldNodeRegistry.get('world.terrainOutput');
		const geometry = { positions: new Float32Array(0) };
		const result = output.evaluate({
			node: { pins: [{ name: 'Geometry', direction: 'input' }] },
			read: name => name === 'Geometry' ? geometry : null
		});

		assert.strictEqual(result.Terrain.geometry, geometry);
		assert.strictEqual(result.Terrain.material, null);
	});

	test('terrain materials support constant and slope blends', () => {
		const grass = { type: 'standard', color: '#668844', roughness: 0.9 };
		const rock = { type: 'standard', color: '#777777', roughness: 0.75 };
		const constant = worldNodeRegistry.get('world.materialBlend').evaluate({
			read: name => ({
				'Material A': grass,
				'Material B': rock,
				Blend: 0.35
			})[name]
		}).Material;
		const slope = worldNodeRegistry.get('world.slopeMaterialBlend').evaluate({
			read: name => ({
				'Flat Material': constant,
				'Steep Material': rock,
				'Start Angle': 20,
				'End Angle': 50
			})[name]
		}).Material;

		assert.strictEqual(constant.mode, 'constant');
		assert.strictEqual(constant.amount, 0.35);
		assert.strictEqual(slope.mode, 'slope');
		assert.strictEqual(slope.a, constant);
		assert.strictEqual(slope.startAngle, 20);
		assert.strictEqual(slope.endAngle, 50);
	});

	test('texture to number creates a UV-driven numeric texture signal', () => {
		const texture = {
			width: 2,
			height: 1,
			maxValue: 255,
			data: new Uint8Array([255, 0, 0, 255, 0, 128, 255, 64])
		};
		const definition = worldNodeRegistry.get('world.textureToNumber');
		const signal = definition.evaluate({
			read: name => ({ Texture: texture, U: 2, V: 3, Channel: 'Blue' })[name]
		}).Number;

		assert.strictEqual(signal.type, 'textureNumber');
		assert.strictEqual(signal.texture, texture);
		assert.deepStrictEqual(signal.scale, [2, 3]);
		assert.strictEqual(signal.channel, 'Blue');

		const material = worldNodeRegistry.get('world.materialBlend').evaluate({
			read: name => ({
				'Material A': { type: 'standard', color: '#000000' },
				'Material B': { type: 'standard', color: '#ffffff' },
				Blend: signal
			})[name]
		}).Material;
		assert.strictEqual(material.amount, signal);
	});

	test('terrain numeric blend masks stay in linear color space', async () => {
		const THREE = await import('three');
		const { createTerrainGraphMaterial, disposeTerrainGraphMaterial } = await import(
			'../IESceneEditor/TerrainMaterial.mjs'
		);
		const texture = {
			width: 1,
			height: 1,
			data: new Uint8Array([128, 128, 128, 255])
		};
		const material = createTerrainGraphMaterial({
			type: 'blend',
			mode: 'constant',
			a: { type: 'standard', color: '#000000', texture },
			b: { type: 'standard', color: '#ffffff' },
			amount: {
				type: 'textureNumber',
				texture,
				scale: [1, 1],
				channel: 'Luminance'
			}
		}, {}, false, () => null);
		const [colorTexture, maskTexture] = material.userData.terrainTextures;

		assert.strictEqual(colorTexture.colorSpace, THREE.SRGBColorSpace);
		assert.strictEqual(maskTexture.colorSpace, THREE.NoColorSpace);
		assert.deepStrictEqual(
			Array.from(maskTexture.image.data),
			[128, 128, 128, 255]
		);
		disposeTerrainGraphMaterial(material);
	});

	test('terrain blend masks extract and normalize the selected channel', async () => {
		const { createTerrainGraphMaterial, disposeTerrainGraphMaterial } = await import(
			'../IESceneEditor/TerrainMaterial.mjs'
		);
		const texture = {
			width: 1,
			height: 1,
			maxValue: 65535,
			data: new Uint16Array([65535, 32768, 0, 65535])
		};
		const material = createTerrainGraphMaterial({
			type: 'blend',
			a: { type: 'standard', color: '#000000' },
			b: { type: 'standard', color: '#ffffff' },
			amount: { type: 'textureNumber', texture, scale: [1, 1], channel: 'Green' }
		}, {}, false, () => null);
		const [mask] = material.userData.terrainTextures;

		assert.deepStrictEqual(Array.from(mask.image.data), [128, 128, 128, 255]);
		disposeTerrainGraphMaterial(material);
	});

	test('image import creates a texture and reimport preserves its ID', async () => {
		const project = await fs.mkdtemp(path.join(os.tmpdir(), 'ie-import-test-'));
		try {
			await fs.writeFile(path.join(project, 'Infinite.ieproject'), '{}');
			const source = path.join(project, 'height.png');
			const png = Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3n0AAAAASUVORK5CYII=',
				'base64'
			);
			await fs.writeFile(source, png);
			const importer = new IEAssetImporter(project);
			const first = await importer.importFiles([source]);
			assert.strictEqual(first[0].success, true);
			assert.strictEqual(first[0].assets[0].type, 'texture');
			assert.match(first[0].assets[0].data.image, /^data:image\/png;base64,/);

			const id = first[0].assets[0].id;
			const second = await importer.importFiles([source]);
			assert.strictEqual(second[0].success, true);
			assert.strictEqual(second[0].reimported, true);
			assert.strictEqual(second[0].assets[0].id, id);
		} finally {
			await fs.rm(project, { recursive: true, force: true });
		}
	});

	test('image imports avoid filename collisions', async () => {
		const project = await fs.mkdtemp(path.join(os.tmpdir(), 'ie-import-collision-'));
		try {
			const one = path.join(project, 'one');
			const two = path.join(project, 'two');
			await fs.mkdir(one);
			await fs.mkdir(two);
			const png = Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3n0AAAAASUVORK5CYII=',
				'base64'
			);
			await fs.writeFile(path.join(one, 'same.png'), png);
			await fs.writeFile(path.join(two, 'same.png'), png);
			const results = await new IEAssetImporter(project).importFiles([
				path.join(one, 'same.png'), path.join(two, 'same.png')
			]);
			assert(results.every(result => result.success));
			assert.notStrictEqual(results[0].directory, results[1].directory);
		} finally {
			await fs.rm(project, { recursive: true, force: true });
		}
	});

	test('model reimport preserves asset IDs and rewrites references', async () => {
		const project = await fs.mkdtemp(path.join(os.tmpdir(), 'ie-model-import-'));
		try {
			const source = path.join(project, 'model.glb');
			await fs.writeFile(source, 'test source');
			const createAssets = () => {
				const geometryId = require('crypto').randomUUID();
				return [{
					id: geometryId,
					type: 'geometry',
					name: 'Body_Geometry',
					data: { positions: [0, 0, 0] }
				}, {
					id: require('crypto').randomUUID(),
					type: 'actor',
					name: 'Body',
					data: {
						components: [{
							geometry: { type: 'geometry', id: geometryId }
						}]
					}
				}];
			};

			const importer = new IEAssetImporter(project);
			const first = await importer.saveAssets(
				source, 'gltf', createAssets(), { bundle: 'Body' }
			);
			const second = await importer.saveAssets(
				source, 'gltf', createAssets(), { bundle: 'Body' }
			);
			assert.strictEqual(second.reimported, true);
			assert.strictEqual(second.assets[0].id, first.assets[0].id);
			assert.strictEqual(second.assets[1].id, first.assets[1].id);
			assert.strictEqual(
				second.assets[1].data.components[0].geometry.id,
				second.assets[0].id
			);
		} finally {
			await fs.rm(project, { recursive: true, force: true });
		}
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

	test('renderable components expose and serialize shadow properties', () => {
		const mesh = new IEMeshComponent();
		mesh.setProperty('castShadow', false);
		mesh.setProperty('receiveShadow', false);
		assert.strictEqual(mesh.toJSON().castShadow, false);
		assert.strictEqual(mesh.toJSON().receiveShadow, false);

		const terrain = new IETerrainComponent();
		terrain.setProperty('castShadow', true);
		terrain.setProperty('receiveShadow', false);
		assert.strictEqual(terrain.toJSON().castShadow, true);
		assert.strictEqual(terrain.toJSON().receiveShadow, false);

		const pointLight = new IEPointLightComponent();
		pointLight.setProperty('castShadow', true);
		assert.strictEqual(pointLight.toJSON().castShadow, true);
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

	test('scene editor state is excluded from gameplay serialization', () => {
		const scene = new IEScene();
		scene.editorState = {
			camera: {
				view: 'perspective',
				position: [12, 6, -4],
				quaternion: [0, 0, 0, 1],
				target: [2, 1, 0],
				flySpeed: 16
			},
			transform: {
				mode: 'rotate',
				space: 'local',
				translationSnap: 1,
				rotationSnap: 15
			}
		};

		assert.strictEqual(scene.toJSON().editorState, undefined);
		const restored = IEScene.fromJSON({
			...scene.toJSON(),
			editorState: scene.editorState
		});
		assert.deepStrictEqual(restored.editorState, scene.editorState);
	});

	test('scene transform edits participate in VS Code undo and redo', async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ie-history-'));
		const scenePath = path.join(directory, 'History.iescene');
		const sceneUri = vscode.Uri.file(scenePath);
		const scene = new IEScene(sceneUri);
		const actor = ActorRegistry.create('Mesh');
		scene.addActor(actor);
		await fs.writeFile(
			scenePath,
			`${JSON.stringify(scene.toJSON(), null, 4)}\n`,
			'utf8'
		);

		const editor = new IESceneEditor({});
		const document = await vscode.workspace.openTextDocument(sceneUri);
		await vscode.window.showTextDocument(document, { preview: false });

		await editor.updateActorTransform(sceneUri, {
			actorId: actor.id,
			position: [12, 3, -7],
			rotation: [0.1, 0.2, 0.3],
			scale: [2, 2, 2]
		});

		const readPosition = () => IEScene
			.fromJSON(JSON.parse(document.getText()))
			.getActor(actor.id)
			.position.getValue();

		assert.deepStrictEqual(readPosition(), [12, 3, -7]);

		await vscode.commands.executeCommand('undo');
		assert.deepStrictEqual(readPosition(), [0, 0, 0]);

		await vscode.commands.executeCommand('redo');
		assert.deepStrictEqual(readPosition(), [12, 3, -7]);

		await fs.rm(directory, { recursive: true, force: true });
	});

	test('scene structural edits participate in VS Code undo and redo', async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ie-structure-'));
		const scenePath = path.join(directory, 'Structure.iescene');
		const sceneUri = vscode.Uri.file(scenePath);
		const scene = new IEScene(sceneUri);
		await fs.writeFile(
			scenePath,
			`${JSON.stringify(scene.toJSON(), null, 4)}\n`,
			'utf8'
		);

		const editor = new IESceneEditor({});
		const document = await vscode.workspace.openTextDocument(sceneUri);
		await vscode.window.showTextDocument(document, { preview: false });
		const snapshot = await editor.getSceneSnapshot(sceneUri);
		const actor = ActorRegistry.create('Mesh');
		snapshot.scene.addActor(actor);

		await editor.commitSceneSnapshot(snapshot, {
			selectedActorId: actor.id
		});

		const hasActor = () => Boolean(IEScene
			.fromJSON(JSON.parse(document.getText()))
			.getActor(actor.id));

		assert.strictEqual(hasActor(), true);
		await vscode.commands.executeCommand('undo');
		assert.strictEqual(hasActor(), false);
		await vscode.commands.executeCommand('redo');
		assert.strictEqual(hasActor(), true);

		await fs.rm(directory, { recursive: true, force: true });
	});

	test('scene structural edits remain independent from editor state', async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ie-rebase-'));
		const scenePath = path.join(directory, 'Rebase.iescene');
		const sceneUri = vscode.Uri.file(scenePath);
		const scene = new IEScene(sceneUri);
		await fs.writeFile(
			scenePath,
			`${JSON.stringify(scene.toJSON(), null, 4)}\n`,
			'utf8'
		);

		const storedState = new Map();
		const editor = new IESceneEditor({
			workspaceState: {
				get: key => storedState.get(key),
				update: async (key, value) => storedState.set(key, value)
			}
		});
		const document = await vscode.workspace.openTextDocument(sceneUri);
		await vscode.window.showTextDocument(document, { preview: false });
		const snapshot = await editor.getSceneSnapshot(sceneUri);
		const actor = ActorRegistry.create('Mesh');
		snapshot.scene.addActor(actor);

		const editorState = {
			camera: {
				view: 'perspective',
				position: [4, 5, 6],
				quaternion: [0, 0, 0, 1],
				target: [0, 0, 0],
				flySpeed: 8
			}
		};
		await editor.saveEditorState(sceneUri, editorState);
		await editor.commitSceneSnapshot(snapshot, {
			selectedActorId: actor.id
		});

		const result = IEScene.fromJSON(JSON.parse(document.getText()));
		assert(result.getActor(actor.id));
		assert.strictEqual(result.editorState, undefined);
		assert.deepStrictEqual(
			await editor.getEditorState(sceneUri),
			editorState
		);

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		await fs.rm(directory, { recursive: true, force: true });
	});

	test('scene edit queue serializes viewport and transform writes', async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ie-queue-'));
		const scenePath = path.join(directory, 'Queue.iescene');
		const sceneUri = vscode.Uri.file(scenePath);
		const scene = new IEScene(sceneUri);
		const actor = ActorRegistry.create('Mesh');
		scene.addActor(actor);
		await fs.writeFile(
			scenePath,
			`${JSON.stringify(scene.toJSON(), null, 4)}\n`,
			'utf8'
		);

		const storedState = new Map();
		const editor = new IESceneEditor({
			workspaceState: {
				get: key => storedState.get(key),
				update: async (key, value) => storedState.set(key, value)
			}
		});
		const document = await vscode.workspace.openTextDocument(sceneUri);
		await vscode.window.showTextDocument(document, { preview: false });
		const editorState = {
			camera: {
				view: 'perspective',
				position: [10, 8, 6],
				quaternion: [0, 0, 0, 1],
				target: [0, 0, 0],
				flySpeed: 16
			}
		};

		await Promise.all([
			editor.saveEditorState(sceneUri, editorState),
			editor.updateActorTransform(sceneUri, {
				actorId: actor.id,
				position: [3, 2, 1],
				rotation: [0, 0, 0],
				scale: [1, 1, 1]
			})
		]);

		const result = IEScene.fromJSON(JSON.parse(document.getText()));
		assert.strictEqual(result.editorState, undefined);
		assert.deepStrictEqual(
			await editor.getEditorState(sceneUri),
			editorState
		);
		assert.deepStrictEqual(result.getActor(actor.id).position.getValue(), [3, 2, 1]);

		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		await fs.rm(directory, { recursive: true, force: true });
	});

	test('scene play lifecycle waits for viewport startup and guards transitions', async () => {
		const editor = new IESceneEditor({});
		const sceneUri = vscode.Uri.file(path.join(os.tmpdir(), 'Lifecycle.iescene'));
		const messages = [];
		const panel = {
			webview: {
				postMessage: async message => {
					messages.push(message.type);
					if (message.type === 'beginPlay') {
						queueMicrotask(() => editor.finishPlayStart({
							type: 'playStarted',
							requestId: message.requestId
						}));
					}
					return true;
				}
			}
		};
		const key = sceneUri.toString();
		editor.panels.set(key, panel);
		editor.sceneLifecycles.set(key, 'editing');
		editor.resolveSceneAssets = async (_uri, data) => data;

		await editor.beginPlay(sceneUri, new IEScene().toJSON());
		assert.strictEqual(editor.sceneLifecycles.get(key), 'playing');
		await editor.pausePlay(sceneUri);
		assert.strictEqual(editor.sceneLifecycles.get(key), 'paused');
		await editor.continuePlay(sceneUri);
		assert.strictEqual(editor.sceneLifecycles.get(key), 'playing');
		await editor.stopPlay(sceneUri);
		assert.strictEqual(editor.sceneLifecycles.get(key), 'editing');
		assert.deepStrictEqual(messages, [
			'beginPlay',
			'pausePlay',
			'continuePlay',
			'stopPlay'
		]);
	});

	test('play snapshots are isolated and gameplay blocks scene edits', async () => {
		const editor = new IESceneEditor({});
		const sceneUri = vscode.Uri.file(path.join(os.tmpdir(), 'Isolation.iescene'));
		const key = sceneUri.toString();
		const source = new IEScene().toJSON();
		const sourceCopy = structuredClone(source);
		let runtimeScene;
		const panel = {
			webview: {
				postMessage: async message => {
					if (message.type === 'beginPlay') {
						runtimeScene = message.scene;
						runtimeScene.actors.push({ id: 'runtime-only' });
						queueMicrotask(() => editor.finishPlayStart({
							type: 'playStarted',
							requestId: message.requestId
						}));
					}
					return true;
				}
			}
		};
		editor.panels.set(key, panel);
		editor.sceneLifecycles.set(key, 'editing');
		editor.resolveSceneAssets = async (_uri, data) => {
			data.runtimeMarker = true;
			return data;
		};

		await editor.beginPlay(sceneUri, source);
		assert.deepStrictEqual(source, sourceCopy);
		assert.strictEqual(runtimeScene.runtimeMarker, true);
		assert.throws(
			() => editor.assertSceneEditable(sceneUri),
			/editing is disabled/
		);
		await editor.stopPlay(sceneUri);
		assert.doesNotThrow(() => editor.assertSceneEditable(sceneUri));
	});

	test('scene selection owns actor and component state together', () => {
		const editor = new IESceneEditor({});
		const sceneUri = vscode.Uri.file(path.join(os.tmpdir(), 'Selection.iescene'));
		const firstActorId = crypto.randomUUID();
		const secondActorId = crypto.randomUUID();
		const componentId = crypto.randomUUID();

		editor.selectActor(sceneUri, firstActorId);
		assert.strictEqual(
			editor.selectComponent(sceneUri, firstActorId, componentId),
			true
		);
		assert.deepStrictEqual(editor.getSelection(sceneUri), {
			actorId: firstActorId,
			componentId
		});

		editor.selectActor(sceneUri, secondActorId);
		assert.deepStrictEqual(editor.getSelection(sceneUri), {
			actorId: secondActorId,
			componentId: null
		});
		assert.strictEqual(
			editor.selectComponent(sceneUri, firstActorId, componentId),
			false
		);

		editor.clearSelection(sceneUri);
		assert.strictEqual(editor.getSelection(sceneUri), null);
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
			setEnabledRotations: () => {},
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

	test('multiple named foot nodes queue independent IK constraints', async () => {
		const THREE = await import('three');
		const { nodeRegistry } = await import('../IESceneEditor/Nodes/index.mjs');
		const footDefinition = nodeRegistry.get('control.playerFoot');
		const controllerDefinition = nodeRegistry.get('control.player');
		const controller = nodeRegistry.create('control.player');
		assert.strictEqual(
			controller.pins.some(pin => pin.name === 'Feet Bone Name'),
			false
		);

		const actor = new THREE.Group();
		actor.position.set(4, 2, -3);
		for (const [name, x] of [['LeftFoot', -0.5], ['RightFoot', 0.5]]) {
			const bone = new THREE.Bone();
			bone.name = name;
			bone.position.set(x, -1.5, 0.25);
			actor.add(bone);
		}
		const constraints = [];
		const body = {
			isDynamic: () => true,
			linvel: () => ({ x: 0, y: 0, z: 0 }),
			setLinvel: () => {},
			setEnabledRotations: () => {},
			rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
			setRotation: () => {},
			setAngvel: () => {}
		};
		const engine = {
			getPhysicsBody: () => body,
			isGrounded: () => true,
			queueFootIK: constraint => constraints.push(constraint)
		};

		for (const boneName of ['LeftFoot', 'RightFoot']) {
			const foot = nodeRegistry.create('control.playerFoot');
			const bonePin = foot.pins.find(pin => pin.name === 'Bone Name');
			assert.strictEqual(bonePin.type, 'string');
			bonePin.value = boneName;
			const values = new Map(foot.pins
				.filter(pin => pin.direction === 'input')
				.map(pin => [pin.name, pin.value]));
			footDefinition.execute({
				node: foot,
				actor,
				engine,
				readInput: name => values.get(name)
			});
		}

		const controllerValues = new Map(controller.pins
			.filter(pin => pin.direction === 'input')
			.map(pin => [pin.name, pin.value]));
		controllerDefinition.execute({
			node: controller,
			actor,
			engine,
			readInput: name => controllerValues.get(name)
		});

		assert.deepStrictEqual(
			constraints.map(constraint => constraint.bone.name),
			['LeftFoot', 'RightFoot']
		);
		assert(constraints.every(constraint =>
			constraint.positionWeight === 1 &&
			constraint.rotationWeight === 1
		));
		assert.strictEqual(
			controllerDefinition.evaluate({
				node: controller,
				output: 'isGrounded'
			}),
			true
		);
	});

	test('car controller drives a dynamic physics body', async () => {
		const THREE = await import('three');
		const { nodeRegistry } = await import('../IESceneEditor/Nodes/index.mjs');
		const { IEScriptRuntime } = await import(
			'../IESceneEditor/IEScriptRuntime.mjs'
		);
		const event = nodeRegistry.create('event.update');
		const controller = nodeRegistry.create('control.vehicle');
		controller.pins.find(pin => pin.name === 'forward').value = 1;
		controller.pins.find(pin => pin.name === 'right').value = 1;

		const source = event.pins.find(pin =>
			pin.name === 'exec' && pin.direction === 'output'
		);
		const target = controller.pins.find(pin =>
			pin.name === 'exec' && pin.direction === 'input'
		);
		let linearVelocity;
		let angularVelocity;
		const body = {
			isDynamic: () => true,
			rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
			linvel: () => ({ x: 0, y: -2, z: 0 }),
			angvel: () => ({ x: 0.1, y: 0, z: 0.2 }),
			setLinvel: velocity => { linearVelocity = velocity; },
			setAngvel: velocity => { angularVelocity = velocity; }
		};
		const actor = new THREE.Group();
		const runtime = new IEScriptRuntime({
			nodes: [event, controller],
			links: [{ from: source.id, to: target.id }]
		}, actor, {
			getPhysicsBody: () => body
		});

		runtime.update(1 / 60);
		const wheelDelta = runtime.evaluate(controller, 'wheelDelta', {
			deltaTime: 1 / 60,
			results: new Map(),
			referenceResults: new Map(),
			budget: { steps: 0 }
		});

		assert(linearVelocity.z < 0);
		assert(wheelDelta < 0);
		assert.strictEqual(linearVelocity.y, -2);
		assert(angularVelocity.y < 0);
		assert.strictEqual(angularVelocity.x, 0.1);
		assert.strictEqual(angularVelocity.z, 0.2);
		assert.deepStrictEqual(actor.position.toArray(), [0, 0, 0]);
	});

	test('car controller cannot drive while airborne or overturned', async () => {
		const THREE = await import('three');
		const { nodeRegistry } = await import('../IESceneEditor/Nodes/index.mjs');
		const definition = nodeRegistry.get('control.vehicle');
		const actor = new THREE.Group();
		const makeBody = rotation => {
			let controlled = false;
			return {
				body: {
					isDynamic: () => true,
					rotation: () => rotation,
					linvel: () => ({ x: 0, y: -1, z: 0 }),
					setLinvel: () => { controlled = true; },
					setAngvel: () => { controlled = true; }
				},
				wasControlled: () => controlled
			};
		};
		const execute = (entry, grounded) => {
			const node = nodeRegistry.create('control.vehicle');
			const values = new Map(node.pins
				.filter(pin => pin.direction === 'input')
				.map(pin => [pin.name, pin.value]));
			values.set('forward', 1);
			definition.execute({
				node,
				actor,
				engine: {
					getPhysicsBody: () => entry.body,
					isGrounded: () => grounded
				},
				readInput: name => values.get(name)
			});
		};

		const airborne = makeBody({ x: 0, y: 0, z: 0, w: 1 });
		execute(airborne, false);
		assert.strictEqual(airborne.wasControlled(), false);

		const upsideDown = makeBody({ x: 0, y: 0, z: 1, w: 0 });
		execute(upsideDown, true);
		assert.strictEqual(upsideDown.wasControlled(), false);
	});
});
