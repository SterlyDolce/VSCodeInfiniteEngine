// @ts-nocheck
const vscode = acquireVsCodeApi();

const postSceneUpdate = (action, payload = {}) => vscode.postMessage({
	type: 'onSceneUpdate',
	action,
	...payload
});

const postOutlineUpdate = (action, payload = {}) => vscode.postMessage({
	type: 'onOutlineUpdate',
	action,
	...payload
});

import * as THREE from 'three';
import { InfiniteGridHelper } from './InfiniteGridHelper.mjs';
import { IEScriptRuntime } from './IEScriptRuntime.mjs';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import IEEnvironmentRenderer from './IEEnvironmentRenderer.js';
import { registeranimationStateAssets } from './Nodes/IEAnimationStateNodes.mjs';
import { nodeRegistry } from './IENodeRegistry.mjs';
import { IEAnimationRuntime } from './IEAnimationRuntime.mjs';
import { IEPhysicsRuntime } from './IEPhysicsRuntime.mjs';

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();

function createMeshTexture(asset) {
	if (!asset) return null;

	if (textureCache.has(asset.id)) {
		return textureCache.get(asset.id);
	}

	const data = asset.data;

	if (!data?.image) {
		console.warn('Texture asset has no image:', asset.id);
		return null;
	}

	const texture = textureLoader.load(data.image, undefined, undefined, (error) =>
		console.error('Texture loading failed:', error)
	);

	texture.colorSpace = data.colorSpace ?? THREE.SRGBColorSpace;
	texture.flipY = data.flipY ?? false;
	texture.wrapS = data.wrapS ?? THREE.RepeatWrapping;
	texture.wrapT = data.wrapT ?? THREE.RepeatWrapping;
	texture.magFilter = data.magFilter ?? THREE.LinearFilter;
	texture.minFilter = data.minFilter ?? THREE.LinearMipmapLinearFilter;

	texture.offset.fromArray(data.offset ?? [0, 0]);
	texture.repeat.fromArray(data.repeat ?? [1, 1]);
	texture.center.fromArray(data.center ?? [0, 0]);
	texture.rotation = data.rotation ?? 0;

	texture.needsUpdate = true;
	textureCache.set(asset.id, texture);

	return texture;
}

const WORLD_LAYER = 0;
const EDITOR_LAYER = 1;

const CAMERA_HELPER_SCALE = 0.35;
const ORTHOGRAPHIC_SIZE = 10;

// Viewports

const viewport = document.getElementById('viewport');

const previewViewport = document.getElementById('preview-viewport');

const viewGizmoViewport = document.getElementById('view-gizmo');

if (!viewport) {
	throw new Error('Viewport element not found');
}

if (!previewViewport) {
	throw new Error('Preview viewport element not found');
}

if (!viewGizmoViewport) {
	throw new Error('View gizmo viewport not found');
}

// Assets

const gltfLoader = new GLTFLoader();

const cameraModelUri =

	window.INFINITE_ASSETS.cameraModel;

const viewGizmoModelUri =

	window.INFINITE_ASSETS.viewGizmoModel;

let cameraHelperTemplate;

let viewGizmo;

async function loadEditorAssets() {
	await loadCameraHelper();

	if (viewGizmoModelUri) {
		await loadViewGizmo();
	}
}

async function loadCameraHelper() {
	const gltf = await gltfLoader.loadAsync(cameraModelUri);

	cameraHelperTemplate = gltf.scene;

	if (!cameraHelperTemplate) {
		throw new Error('Failed to load camera helper model.');
	}

	cameraHelperTemplate.traverse((object) => {
		object.scale.setScalar(0.7);

		object.layers.set(EDITOR_LAYER);

		object.userData.editorHelper = true;

		if (!(object instanceof THREE.Mesh)) {
			return;
		}

		const replaceMaterial =
		
			(material) => {
				switch (material.name) {
					case 'Cam_Base':
						return new THREE.MeshMatcapMaterial({
							color: 0xa4bbfb,
						});

					case 'Cam_Accent':
						return new THREE.MeshMatcapMaterial({
							color: 0x7687b5,
						});

					case 'Cam_Rec_Button':
						return new THREE.MeshBasicMaterial({
							color: 0xe5484d,
						});

					case 'Cam_Light':
						return new THREE.MeshBasicMaterial({
							color: 0xe8ecf5,
						});

					default:
						return material;
				}
			};

		if (Array.isArray(object.material)) {
			object.material = object.material.map(replaceMaterial);
		} else {
			object.material = replaceMaterial(object.material);
		}
	});
}

async function loadViewGizmo() {
	const gltf = await gltfLoader.loadAsync(viewGizmoModelUri);

	viewGizmo = gltf.scene;


	viewGizmo.name = 'ViewGizmo';


	viewGizmo.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) {
			return;
		}

		object.material = new THREE.MeshBasicMaterial({
			color: object.material?.color ?? 0xffffff,

			vertexColors: Boolean(object.geometry?.getAttribute('color')),
		});
	});

	normalizeViewGizmo(
	
		viewGizmo
	);

	viewGizmoScene.add(
	
		viewGizmo
	);
}

function normalizeViewGizmo(object) {
	const box = new THREE.Box3().setFromObject(object);

	const center = box.getCenter(new THREE.Vector3());

	const size = box.getSize(new THREE.Vector3());

	const maxSize = Math.max(size.x, size.y, size.z);

	object.position.sub(center);

	if (maxSize > 0) {
		object.scale.setScalar(2 / maxSize);
	}
}

// Scenes
let editorMode = 'scene';

const editorScene = new THREE.Scene();
const editorEnvironment = new IEEnvironmentRenderer(editorScene);

const assetPreviewLights = new THREE.Group();

const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444466, 2);

const directionalLight = new THREE.DirectionalLight(0xffffff, 3);

directionalLight.position.set(5, 10, 7);

assetPreviewLights.add(ambientLight, directionalLight);
assetPreviewLights.visible = false;

editorScene.add(assetPreviewLights);

const gameplayScene = new THREE.Scene();
const gameplayEnvironment = new IEEnvironmentRenderer(gameplayScene);

editorScene.background = new THREE.Color(0x000000);

gameplayScene.background = new THREE.Color(0x000000);

let activeScene = editorScene;

// Main Renderer

const renderer = new THREE.WebGLRenderer({
	antialias: true,
});

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

viewport.appendChild(renderer.domElement);

// Camera Preview Renderer

const previewRenderer = new THREE.WebGLRenderer({
	antialias: true,
	alpha: false,
});

previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

previewViewport.appendChild(previewRenderer.domElement);

// View Gizmo Renderer

const viewGizmoRenderer = new THREE.WebGLRenderer({
	antialias: true,
	alpha: true,
});

viewGizmoRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

viewGizmoRenderer.setClearColor(0x000000, 0);

viewGizmoViewport.appendChild(viewGizmoRenderer.domElement);

// View Gizmo Scene

const viewGizmoScene = new THREE.Scene();

const viewGizmoCamera = new THREE.OrthographicCamera(-1.4, 1.4, 1.4, -1.4, 0.1, 100);

viewGizmoCamera.position.set(0, 0, 10);

viewGizmoCamera.lookAt(0, 0, 0);

// Editor Cameras

const editorCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

editorCamera.position.set(5, 4, 5);

editorCamera.layers.enable(WORLD_LAYER);

editorCamera.layers.enable(EDITOR_LAYER);

function createOrthographicEditorCamera() {
	const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.01, 1000);

	camera.userData.orthoSize = ORTHOGRAPHIC_SIZE;

	camera.layers.enable(WORLD_LAYER);

	camera.layers.enable(EDITOR_LAYER);

	return camera;
}

const topCamera = createOrthographicEditorCamera();

const bottomCamera = createOrthographicEditorCamera();

const leftCamera = createOrthographicEditorCamera();

const rightCamera = createOrthographicEditorCamera();

const frontCamera = createOrthographicEditorCamera();

const backCamera = createOrthographicEditorCamera();

let activeEditorCamera = editorCamera;

// Gameplay Camera

let gameplayCamera;

let activeCamera = activeEditorCamera;

// Post Processing

const composer = new EffectComposer(renderer);

const renderPass = new RenderPass(activeScene, activeCamera);

composer.addPass(renderPass);

const outlinePass = new OutlinePass(new THREE.Vector2(1, 1), activeScene, activeCamera);

outlinePass.edgeStrength = 4;
outlinePass.edgeGlow = 0;
outlinePass.edgeThickness = 1;
outlinePass.pulsePeriod = 0;

outlinePass.visibleEdgeColor.set(0xffffff);

outlinePass.hiddenEdgeColor.set(0x555555);

composer.addPass(outlinePass);

// Runtime Script

let scriptRuntimes = [];
let editorScriptRuntimes = [];
let physicsRuntime = null;
let lastFrameTime = performance.now();

const runtimeMeshAssets = new Map();

function registerMeshAsset(reference, type, data) {
	const id = typeof reference === 'string' ? reference : reference?.id;

	if (!id || !data) return;

	runtimeMeshAssets.set(id, {
		id,
		type,
		data,
	});
}

/**
 * Register project Animation Script assets before
 * creating any IEScriptRuntime instances.
 */

function prepareanimationStateNodes(sceneData) {
	animationStateAssets.clear();

	const catalog = sceneData.runtimeAssets ?? [];

	const assets = Array.isArray(catalog) ? catalog : Object.values(catalog);

	const scripts = assets.filter(
		(asset) => asset?.type === 'animationState' && typeof asset.id === 'string' && asset.data
	);

	for (const asset of scripts) {
		animationStateAssets.set(asset.id, asset);
	}

	const registered = registeranimationStateAssets(scripts, nodeRegistry);

	console.log('[IE] Registered Animation Script nodes:', registered);

	return registered;
}

function prepareRuntimeMeshAssets(sceneData) {
	runtimeMeshAssets.clear();

	// Assets already resolved for scene components.
	for (const actor of sceneData.actors ?? []) {
		for (const component of actor.components ?? []) {
			if (component.type !== 'mesh') continue;

			registerMeshAsset(component.geometry, 'geometry', component.resolvedGeometry);

			for (const [index, reference] of (component.materials ?? []).entries()) {
				registerMeshAsset(reference, 'material', component.resolvedMaterials?.[index]);
			}
		}
	}

	// Optional complete project catalog supplied by host.
	const assets = Array.isArray(sceneData.runtimeAssets)
		? sceneData.runtimeAssets
		: Object.values(sceneData.runtimeAssets ?? {});

	for (const asset of assets) {
		if (
			asset?.type === 'geometry' ||
			asset?.type === 'material' ||
			asset?.type === 'skeleton' ||
			asset?.type === 'animation'
		) {
			runtimeMeshAssets.set(asset.id, asset);
		}
	}

	console.log('[IE] Runtime mesh assets:', runtimeMeshAssets.size);
}

function resolveRuntimeMeshAsset(value, type) {
	const id = typeof value === 'string' ? value : value?.id;

	if (!id) {
		throw new Error(`Missing ${type} asset`);
	}

	const asset = runtimeMeshAssets.get(id);

	if (!asset) {
		throw new Error(`${type} asset not loaded: ${id}`);
	}

	if (asset.type !== type) {
		throw new Error(`Expected ${type}, got ${asset.type}`);
	}

	return asset.data;
}

function formatPrintValue(value) {
	if (value === null) return 'null';
	if (value === undefined) return 'undefined';

	if (value?.isObject3D === true) {
		const type = value.userData?.isActorRoot ? 'Actor' : value.type;

		const id = value.userData?.actorId ?? value.userData?.componentId ?? value.uuid;

		return `${type}(${value.name || 'Unnamed'}, ${id})`;
	}

	if (typeof value === 'string') return value;

	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value);
	}

	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

const animationMixers = new Map();

/* =========================================================
   ANIMATION STATE RUNTIME
   ========================================================= */

// Animation Script assets received from the extension host.
const animationStateAssets = new Map();

// Mesh animation roots -> active state machine.
const animationStateRuntimes = new Map();

// Cache converted Three.js animation clips.
const animationClipCache = new Map();

function getAnimationClip(animationId) {
	if (!animationId) return null;

	const id = typeof animationId === 'string' ? animationId : animationId.id;

	if (!id) return null;

	if (!animationClipCache.has(id)) {
		animationClipCache.set(id, createRuntimeAnimationClip(id));
	}

	return animationClipCache.get(id);
}

function disposeAnimationStates() {
	for (const entry of animationStateRuntimes.values()) {
		entry.runtime.dispose();
	}

	animationStateRuntimes.clear();
	animationStateAssets.clear();
	animationClipCache.clear();
}

function createRuntimeAnimationClip(reference) {
	const data = resolveRuntimeMeshAsset(reference, 'animation');

	const trackTypes = {
		NumberKeyframeTrack: THREE.NumberKeyframeTrack,
		VectorKeyframeTrack: THREE.VectorKeyframeTrack,
		QuaternionKeyframeTrack: THREE.QuaternionKeyframeTrack,
		ColorKeyframeTrack: THREE.ColorKeyframeTrack,
		BooleanKeyframeTrack: THREE.BooleanKeyframeTrack,
		StringKeyframeTrack: THREE.StringKeyframeTrack,
	};

	const tracks = data.tracks.map((track) => {
		const Constructor = trackTypes[track.type];

		if (!Constructor) {
			throw new Error(`Unsupported track type: ${track.type}`);
		}

		const result = new Constructor(track.name, track.times, track.values);

		result.setInterpolation(track.interpolation);

		return result;
	});

	return new THREE.AnimationClip(
		typeof reference === 'string' ? reference : reference.id,
		data.duration,
		tracks,
		data.blendMode ?? THREE.NormalAnimationBlendMode
	);
}
const animationEndListeners = new Map();

const engine = {
	getPhysicsBody(actor) {
		return physicsRuntime?.getBody(actor) ?? null;
	},

	isGrounded(actor, tolerance) {
		return physicsRuntime?.isGrounded(actor, tolerance) ?? false;
	},

	print(...values) {
		postSceneUpdate('scriptPrint', {
			values: values.map(formatPrintValue),
		});
	},

	getMesh(component) {
		if (!component?.isMesh) {
			return null;
		}

		// The component is already the THREE.Mesh
		// created by createActor().
		if (!component.userData?.componentId) {
			return null;
		}

		if (!component.userData?.actorObject) {
			return null;
		}

		// Script runtimes operate on both the editor preview hierarchy and the
		// separate gameplay hierarchy.
		let current = component;

		while (current) {
			if (current === gameplayActorRoot || current === editorActorRoot) {
				return component;
			}

			current = current.parent;
		}

		return null;
	},

	setMesh(component, geometryRef, materialRefs = []) {
		if (!component?.isMesh) {
			throw new Error('Set Mesh requires a THREE.Mesh component');
		}

		if (!Array.isArray(materialRefs)) {
			throw new Error('Materials must be an array');
		}

		const geometryData = resolveRuntimeMeshAsset(geometryRef, 'geometry');

		const materialsData = materialRefs.map((ref) => resolveRuntimeMeshAsset(ref, 'material'));

		// Reuse the same factory as normal Mesh Components.
		const replacement = createMeshActor({
			type: 'mesh',
			enabled: true,
			resolvedGeometry: geometryData,
			resolvedMaterials: materialsData,
		});

		if (!replacement.isMesh) {
			throw new Error('Failed to create replacement mesh geometry');
		}

		const oldGeometry = component.geometry;
		const oldMaterial = component.material;

		component.geometry = replacement.geometry;
		component.material = replacement.material;

		// Preserve component identity and its scene hierarchy.
		component.userData.geometryAssetId =
			typeof geometryRef === 'string' ? geometryRef : geometryRef?.id;

		component.userData.materialAssetIds = materialRefs.map((ref) =>
			typeof ref === 'string' ? ref : ref?.id
		);

		component.geometry.computeBoundingSphere();

		console.log('[IE Set Mesh]', {
			component: component.name,
			geometry: component.userData.geometryAssetId,
			materials: component.userData.materialAssetIds,
		});

		// Do not dispose old resources here.
		// They may be shared with other scene meshes.
		void oldGeometry;
		void oldMaterial;

		return true;
	},

	playAnimation(mesh, animationReference, options = {}) {
		if (!mesh?.isSkinnedMesh) {
			throw new Error('Play Animation requires a SkinnedMesh');
		}

		const root = mesh.userData.animationRoot;

		if (!root?.isObject3D) {
			throw new Error('Animation hierarchy has not been initialized');
		}

		const clip = createRuntimeAnimationClip(animationReference, root);

		let mixer = animationMixers.get(root);

		if (!mixer) {
			mixer = new THREE.AnimationMixer(root);
			animationMixers.set(root, mixer);
		}

		const previousListener = animationEndListeners.get(root);

		if (previousListener) {
			mixer.removeEventListener('finished', previousListener);

			animationEndListeners.delete(root);
		}

		// Stop all previously active animations on this rig.
		mixer.stopAllAction();

		const action = mixer.clipAction(clip);

		// Reset animation state completely.
		action.reset();
		action.enabled = true;
		action.paused = false;
		action.setEffectiveWeight(1);

		action.setLoop(options.loop ? THREE.LoopRepeat : THREE.LoopOnce, options.loop ? Infinity : 1);

		action.clampWhenFinished = !options.loop;

		const speed = Number(options.speed ?? 1);

		if (!Number.isFinite(speed) || speed <= 0) {
			throw new Error('Animation speed must be positive');
		}

		action.setEffectiveTimeScale(speed);
		action.play();

		if (!options.loop && typeof options.onEnd === 'function') {
			const onFinished = (event) => {
				if (event.action !== action) return;

				mixer.removeEventListener('finished', onFinished);
				animationEndListeners.delete(root);

				options.onEnd();
			};

			mixer.addEventListener('finished', onFinished);
			animationEndListeners.set(root, onFinished);
		}

		return action;
	},

	playAnimationState(mesh, animationState) {
		if (!mesh?.isSkinnedMesh) {
			throw new Error('Play Animation State requires a SkinnedMesh');
		}

		if (animationState?.type !== 'animationstate' || typeof animationState.assetId !== 'string') {
			throw new Error('Invalid Animation State reference');
		}

		const root = mesh.userData.animationRoot;

		if (!root?.isObject3D) {
			throw new Error('Animation hierarchy has not been initialized');
		}

		const asset = animationStateAssets.get(animationState.assetId);

		if (!asset) {
			throw new Error('Animation Script asset not loaded: ' + animationState.assetId);
		}

		let entry = animationStateRuntimes.get(root);

		// A rig can run one Animation Script at a time
		// in this first implementation.
		if (entry && entry.assetId !== animationState.assetId) {
			entry.runtime.dispose();
			animationStateRuntimes.delete(root);
			entry = null;
		}

		if (!entry) {
			// If this rig was playing an individual clip,
			// release its existing playback before starting
			// the Animation Script.
			const clipMixer = animationMixers.get(root);

			if (clipMixer) {
				const listener = animationEndListeners.get(root);

				if (listener) {
					clipMixer.removeEventListener('finished', listener);

					animationEndListeners.delete(root);
				}

				clipMixer.stopAllAction();
				animationMixers.delete(root);
			}

			const runtime = new IEAnimationRuntime({
				root,
				asset,
				resolveClip: getAnimationClip,
			});

			entry = {
				assetId: asset.id,
				runtime,
				previousTriggers: new Map(),
			};

			animationStateRuntimes.set(root, entry);

			console.log('[IE] Animation State started:', asset.name, mesh.name);
		}

		// The asset node provides live input values.
		const values = animationState.parameters ?? {};

		for (const parameter of asset.data.parameters ?? []) {
			const name = parameter.name;

			if (!Object.hasOwn(values, name)) {
				continue;
			}

			const value = values[name];

			if (parameter.type === 'trigger') {
				// Fire on a false -> true edge only.
				const active = value === true;
				const previous = entry.previousTriggers.get(name) ?? false;

				if (active && !previous) {
					entry.runtime.fireTrigger(name);
				}

				entry.previousTriggers.set(name, active);
				continue;
			}

			entry.runtime.setParameter(name, value);
		}

		return entry.runtime;
	},
};

function createScriptRuntimes(sceneData, actorRoot) {
	const runtimes = [];
	const objects = new Map();

	actorRoot.traverse((object) => {
		if (!object.userData.isActorRoot) return;

		const id = object.userData.actorId;

		if (id) {
			objects.set(id, object);
		}
	});

	for (const actorData of sceneData.actors ?? []) {
		const actor = objects.get(actorData.id);

		if (!actor) {
			console.warn('Script actor not found:', actorData.name);
			continue;
		}

		for (const component of actorData.components ?? []) {
			if (component.type !== 'script') continue;

			if (component.enabled === false) continue;
			if (!component.script) continue;

			if (!component.resolvedScript) {
				console.error('Script asset was not resolved:', component.script);
				continue;
			}

			try {
				const runtime = new IEScriptRuntime(
					component.resolvedScript,
					actor,
					engine,
					{ mouse: gameplayMouse }
				);

				runtimes.push(runtime);
			} catch (error) {
				console.error('Script initialization failed:', error);
			}
		}
	}

	return runtimes;
}

function initializeScriptRuntimes(sceneData) {
	scriptRuntimes = createScriptRuntimes(sceneData, gameplayActorRoot);

	console.log(`Initialized ${scriptRuntimes.length} gameplay script runtimes`);

	for (const runtime of scriptRuntimes) {
		try {
			runtime.begin();
		} catch (error) {
			console.error('IEScript On Begin error:', error);
		}
	}
}

function initializeEditorScriptRuntimes(sceneData) {
	for (const runtime of editorScriptRuntimes) runtime.stop();

	editorScriptRuntimes = createScriptRuntimes(sceneData, editorActorRoot);

	console.log(`Initialized ${editorScriptRuntimes.length} editor script runtimes`);

	for (const runtime of editorScriptRuntimes) {
		try {
			runtime.preConstruct();
		} catch (error) {
			console.error('IEScript Pre Construct error:', error);
		}
	}
}

// Runtime State

let isPlaying = false;
let isPaused = false;

const gameplayMouse = {
	position: [0, 0],
	delta: [0, 0],
	wheel: 0,
	buttons: new Set()
};

const mouseButtonNames = [
	'Left',
	'Middle',
	'Right',
	'Button 1',
	'Button 2'
];

function clearGameplayInput() {
	gameplayMouse.buttons.clear();
	gameplayMouse.delta[0] = 0;
	gameplayMouse.delta[1] = 0;
	gameplayMouse.wheel = 0;

	for (const runtime of scriptRuntimes) {
		runtime.clearKeyboard();
	}
}

renderer.domElement.addEventListener('pointermove', event => {
	if (!isPlaying || isPaused) return;

	const rect = renderer.domElement.getBoundingClientRect();
	gameplayMouse.position[0] = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	gameplayMouse.position[1] = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	gameplayMouse.delta[0] += event.movementX;
	gameplayMouse.delta[1] += event.movementY;
});

renderer.domElement.addEventListener('pointerdown', event => {
	if (!isPlaying || isPaused) return;
	const name = mouseButtonNames[event.button];
	if (!name || gameplayMouse.buttons.has(name)) return;

	gameplayMouse.buttons.add(name);
	for (const runtime of scriptRuntimes) runtime.mouseDown(name);
});

window.addEventListener('pointerup', event => {
	const name = mouseButtonNames[event.button];
	if (!name || !gameplayMouse.buttons.has(name)) return;

	gameplayMouse.buttons.delete(name);
	for (const runtime of scriptRuntimes) runtime.mouseUp(name);
});

renderer.domElement.addEventListener('wheel', event => {
	if (!isPlaying || isPaused) return;
	gameplayMouse.wheel += event.deltaY;
}, { passive: true });

window.addEventListener('keydown', (event) => {
	if (!isPlaying || isPaused || event.repeat) return;

	if (
		event.target instanceof HTMLElement &&
		(event.target.matches('input, textarea, select') || event.target.isContentEditable)
	)
		return;

	if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
		event.preventDefault();
	}

	for (const runtime of scriptRuntimes) {
		try {
			runtime.keyDown(event.code);
		} catch (error) {
			console.error('Keyboard Down error:', error);
		}
	}
});

window.addEventListener('keyup', (event) => {
	if (!isPlaying || isPaused) return;

	for (const runtime of scriptRuntimes) {
		try {
			runtime.keyUp(event.code);
		} catch (error) {
			console.error('Keyboard Up error:', error);
		}
	}
});

window.addEventListener('blur', () => {
	clearGameplayInput();
});

// Orbit Controls

const controls = new OrbitControls(activeEditorCamera, renderer.domElement);

controls.enableDamping = true;
controls.dampingFactor = 0.05;

controls.screenSpacePanning = false;

controls.minDistance = 0.5;
controls.maxDistance = 500;

controls.maxPolarAngle = Math.PI / 2;

controls.target.set(0, 0, 0);

controls.addEventListener('start', () => {
	if (activeEditorCamera === editorCamera) {
		return;
	}

	switchBackToPerspective();
});

function switchBackToPerspective() {
	const target = controls.target.clone();

	const distance = activeEditorCamera.position.distanceTo(target);

	editorCamera.position.copy(activeEditorCamera.position);

	editorCamera.quaternion.copy(activeEditorCamera.quaternion);

	editorCamera.layers.enable(WORLD_LAYER);

	editorCamera.layers.enable(EDITOR_LAYER);

	setActiveEditorCamera(editorCamera);

	controls.target.copy(target);

	if (Number.isFinite(distance) && distance > 0) {
		const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(editorCamera.quaternion);

		editorCamera.position.copy(target);

		editorCamera.position.addScaledVector(direction, distance);
	}

	editorCamera.updateProjectionMatrix();

	controls.update();
}

// Transform Controls

const transformControls = new TransformControls(activeEditorCamera, renderer.domElement);

transformControls.setMode('translate');

transformControls.setSize(0.8);

transformControls.enabled = true;

const transformHelper = transformControls.getHelper();

transformHelper.visible = false;

transformHelper.layers.set(EDITOR_LAYER);

transformHelper.traverse(

	(object) => {
		object.layers.set(EDITOR_LAYER);

		object.userData.editorHelper = true;
	}
);

editorScene.add(transformHelper);

transformControls.getRaycaster().layers.set(EDITOR_LAYER);

let selectedActorObject = null;

let selectedActorId = null;

let isTransformDragging = false;

let didTransformDrag = false;

transformControls.addEventListener(
	'dragging-changed',

	(event) => {
		isTransformDragging = event.value === true;

		if (event.value) {
			didTransformDrag = true;

			controls.enabled = false;

			return;
		}

		controls.enabled = !isPlaying;

		if (selectedActorObject) {
			saveSelectedActorTransform(selectedActorObject);
		}
	}
);

// Infinite Grid

const grid = new InfiniteGridHelper(1, 10, new THREE.Color(0x999999), 100);

grid.layers.set(EDITOR_LAYER);

editorScene.add(grid);

// Editor Helpers

const editorHelperRoot = new THREE.Group();

editorHelperRoot.name = 'EditorHelpers';

editorHelperRoot.layers.set(EDITOR_LAYER);

editorScene.add(editorHelperRoot);

// Actor Roots

const editorActorRoot = new THREE.Group();

editorActorRoot.name = 'EditorActors';

const gameplayActorRoot = new THREE.Group();

gameplayActorRoot.name = 'GameplayActors';

editorScene.add(editorActorRoot);

gameplayScene.add(gameplayActorRoot);

// Selection State

const raycaster = new THREE.Raycaster();

const pointer = new THREE.Vector2();

let selectedActor;

let selectedCamera;

let pointerDownX = 0;
let pointerDownY = 0;

raycaster.params.Line.threshold = 0.15;

raycaster.layers.enable(WORLD_LAYER);

raycaster.layers.enable(EDITOR_LAYER);

// View Gizmo Selection

const viewGizmoRaycaster = new THREE.Raycaster();

const viewGizmoPointer = new THREE.Vector2();

let viewGizmoPointerDownX = 0;
let viewGizmoPointerDownY = 0;

// Messages

window.addEventListener('message', (event) => {
	const message = event.data;

	switch (message.type) {
		case 'loadScene':
			loadEditorScene(message.scene);
			break;

		case 'loadActorAsset':
			editorMode = 'actor';
			assetPreviewLights.visible = true;

			loadEditorScene({
				actors: [message.actor],
			});
			break;

		case 'selectComponent':
			if (editorMode === 'actor') {
				editorActorRoot.traverse((object) => {
					if (object.userData.componentId === message.componentId) {
						selectComponent(object, false);
					}
				});
			}
			break;

		case 'selectActor':
			selectActorById(message.actorId);
			break;

		case 'onUpdateProperty':
			updateProperty(message.data);
			break;

		//PLAY AN PAUSE
		case 'beginPlay':
			beginPlay(message.scene);
			break;

		case 'pausePlay':
			pausePlay();
			break;

		case 'continuePlay':
			continuePlay();
			break;

		case 'stopPlay':
			stopPlay();
			break;
	}
});


function selectActorById(actorId) {
	let actor;

	editorActorRoot.traverse((object) => {
		if (object.userData.isActorRoot && object.userData.actorId === actorId) {
			actor = object;
		}
	});

	if (actor) {
		selectActor(actor, false);
	}
}

function getActorById(actorId) {
	let actor;

	editorActorRoot.traverse((object) => {
		if (object.userData.isActorRoot && object.userData.actorId === actorId) {
			actor = object;
		}
	});

	return actor;
}

function getComponentById(componentId) {
	let component;

	editorActorRoot.traverse((object) => {
		if (object.userData.componentId === componentId) {
			component = object;
		}
	});

	return component;
}

function updateProperty({ actor: actorData }) {
	if (!actorData?.id) return;

	const actor = getActorById(actorData.id);
	if (!actor) return;

	actor.name = actorData.name ?? actor.name;
	applyTransform(actor, actorData);
	actor.updateMatrixWorld(true);

	if (actorData.type === 'Environment') {
		editorEnvironment.environment = actorData;
		editorEnvironment.update();
		return;
	}

	for (const componentData of actorData.components ?? []) {
		synchronizeComponent(actor, componentData);
	}
	synchronizeComponentHierarchy(actor, actorData.components ?? []);

	refreshActorHelpers(actor);

	if (selectedActorId === actorData.id) {
		transformControls.attach(actor);
		outlinePass.selectedObjects = [actor];
		selectedCamera = actor.getObjectByProperty('isCamera', true);
		previewViewport.classList.toggle('visible', Boolean(selectedCamera));
	}
}

function synchronizeComponent(actor, data) {
	let object = getComponentById(data.id);

	if (data.enabled === false) {
		if (object?.parent === actor) actor.remove(object);
		return;
	}

	if (!object) {
		object = createRenderedComponent(data);
		if (!object) return;
		initializeRenderedComponent(object, actor, data);
		attachComponentObject(actor, object, data);
		attachSkinnedComponentRoots(actor, object);
	}

	const needsReplacement =
		(data.type === 'camera' &&
			(data.projection === 'orthographic') !== (object instanceof THREE.OrthographicCamera)) ||
		data.type === 'mesh' ||
		data.type === 'collider';

	if (needsReplacement) {
		const replacement = createRenderedComponent(data);
		if (!replacement) return;
		initializeRenderedComponent(replacement, actor, data);
		const oldRigGroup = object.userData.rigGroup;
		object.removeFromParent();
		if (
			oldRigGroup &&
			!oldRigGroup.children.some(child => child.isSkinnedMesh)
		) {
			oldRigGroup.removeFromParent();
		}
		attachComponentObject(actor, replacement, data);
		attachSkinnedComponentRoots(actor, replacement);
		object = replacement;
	}

	object.name = data.name ?? data.type;
	applyTransform(object, data);
	if (data.type === 'springArm') configureSpringArm(object, data);
	if (data.type === 'collider') applyColliderHelperTransform(object, data);

	if (object.isLight) {
		object.color.set(data.color ?? '#ffffff');
		object.intensity = data.intensity ?? 1;
		object.castShadow = data.castShadow ?? false;
	}

	if (object instanceof THREE.PointLight || object instanceof THREE.SpotLight) {
		object.distance = data.distance ?? 0;
		object.decay = data.decay ?? 2;
	}

	if (object instanceof THREE.SpotLight) {
		object.angle = data.angle ?? Math.PI / 6;
		object.penumbra = data.penumbra ?? 0;
	}

	if (object instanceof THREE.PerspectiveCamera) {
		object.fov = data.fov ?? 75;
		object.near = data.near ?? 0.1;
		object.far = data.far ?? 1000;
		object.userData.activeCamera = data.active ?? true;
		object.userData.cameraPriority = data.priority ?? 0;
		object.updateProjectionMatrix();
	}

	if (object instanceof THREE.OrthographicCamera) {
		const size = data.orthographicSize ?? 10;
		const halfHeight = size / 2;
		const halfWidth = halfHeight * getViewportAspect();
		object.left = -halfWidth;
		object.right = halfWidth;
		object.top = halfHeight;
		object.bottom = -halfHeight;
		object.near = data.near ?? 0.1;
		object.far = data.far ?? 1000;
		object.userData.orthoSize = size;
		object.userData.activeCamera = data.active ?? true;
		object.userData.cameraPriority = data.priority ?? 0;
		object.updateProjectionMatrix();
	}

	object.updateMatrixWorld(true);
}

function createRenderedComponent(data) {
	switch (data.type) {
		case 'mesh':
			return createMeshActor(data, new Map());
		case 'camera':
			return createCameraActor(data);
		case 'springArm':
			return createSpringArm(data);
		case 'collider':
			return createColliderHelper(data);
		case 'pointLight':
		case 'directionalLight':
		case 'spotLight':
			return createLightComponent(data);
		default:
			return null;
	}
}

function initializeRenderedComponent(object, actor, data) {
	object.name = data.name ?? data.type;
	object.userData.componentId = data.id;
	object.userData.componentType = data.type;
	object.userData.actorObject = actor;
	applyTransform(object, data);
	if (data.type === 'springArm') configureSpringArm(object, data);
	if (data.type === 'collider') applyColliderHelperTransform(object, data);
}

function createSpringArm(data) {
	const arm = new THREE.Group();
	configureSpringArm(arm, data);
	return arm;
}

function updateSpringArms(root) {
	root.updateMatrixWorld(true);

	root.traverse((arm) => {
		if (!arm.userData.springArm) return;

		const position = new THREE.Vector3().fromArray(
			arm.userData.springArmPosition ?? [0, 0, 0]
		);
		const rotation = arm.userData.springArmRotation ?? [0, 0, 0];
		const quaternion = new THREE.Quaternion().setFromEuler(
			new THREE.Euler(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0)
		);

		if (arm.userData.followActorRotation) {
			arm.position.copy(position);
			arm.quaternion.copy(quaternion);
		} else {
			const actor = arm.userData.actorObject;
			const parent = arm.parent;

			if (actor && parent) {
				const worldPosition = actor.getWorldPosition(new THREE.Vector3())
					.add(position);
				arm.position.copy(parent.worldToLocal(worldPosition));

				const parentRotation = parent.getWorldQuaternion(
					new THREE.Quaternion()
				);
				arm.quaternion.copy(parentRotation.invert().multiply(quaternion));
			}
		}

		const socket = new THREE.Vector3().fromArray(
			arm.userData.socketOffset ?? [0, 0, 0]
		);
		socket.z += arm.userData.armLength ?? 0;

		for (const child of arm.children) {
			if (child.isCamera) child.position.copy(socket);
		}
	});

	root.updateMatrixWorld(true);
}

function configureSpringArm(arm, data) {
	arm.userData.springArm = true;
	arm.userData.armLength = Math.max(0, Number(data.armLength) || 0);
	arm.userData.socketOffset = [...(data.socketOffset ?? [0, 0, 0])];
	arm.userData.followActorRotation = data.followActorRotation === true;
	arm.userData.springArmPosition = [...(data.position ?? [0, 0, 0])];
	arm.userData.springArmRotation = [...(data.rotation ?? [0, 0, 0])];
}

function attachComponentObject(actor, object, data) {
	let parent = null;

	if (data.parent) {
		actor.traverse((candidate) => {
			if (candidate.userData.componentId === data.parent) {
				parent = candidate;
			}
		});
	}

	(parent && parent !== object ? parent : actor).add(object);
}

function synchronizeComponentHierarchy(actor, components) {
	const objects = new Map();

	actor.traverse((object) => {
		if (object.userData.componentId) {
			objects.set(object.userData.componentId, object);
		}
	});

	for (const component of components) {
		const object = objects.get(component.id);
		if (!object) continue;

		const parent = objects.get(component.parent) ?? actor;
		const transformObject = object.userData.rigGroup ?? object;
		if (parent !== transformObject && transformObject.parent !== parent) {
			parent.add(transformObject);
		}
	}
}

function createColliderHelper(data) {
	let geometry;

	if (data.shape === 'sphere') {
		geometry = new THREE.SphereGeometry(
			Math.max(0.001, data.radius ?? 0.5),
			20,
			14
		);
	} else if (data.shape === 'capsule') {
		geometry = new THREE.CapsuleGeometry(
			Math.max(0.001, data.radius ?? 0.5),
			Math.max(0.001, data.height ?? 1),
			8,
			16
		);
	} else {
		const size = data.size ?? [1, 1, 1];
		geometry = new THREE.BoxGeometry(
			Math.max(0.001, size[0] ?? 1),
			Math.max(0.001, size[1] ?? 1),
			Math.max(0.001, size[2] ?? 1)
		);
	}

	const material = new THREE.MeshBasicMaterial({
		color: data.sensor ? 0xffb347 : 0x59c7ff,
		wireframe: true,
		transparent: true,
		opacity: 0.75,
		depthTest: false,
		depthWrite: false,
		toneMapped: false
	});
	const helper = new THREE.Mesh(geometry, material);
	helper.userData.colliderHelper = true;
	helper.renderOrder = 1000;
	helper.layers.set(EDITOR_LAYER);
	return helper;
}

function applyColliderHelperTransform(object, data) {
	object.position.fromArray(data.offset ?? [0, 0, 0]);
	object.rotation.set(0, 0, 0);
	object.scale.set(1, 1, 1);
}

function attachSkinnedComponentRoots(actor, object) {
	if (!object.isSkinnedMesh) return;

	const rigGroup = object.userData.rigGroup;

	if (rigGroup) {
		// A skinned component and its bones must have the same world transform
		// when using AttachedBindMode. Move both beneath a shared rig group and
		// promote the component transform to that group.
		rigGroup.position.copy(object.position);
		rigGroup.quaternion.copy(object.quaternion);
		rigGroup.scale.copy(object.scale);
		actor.add(rigGroup);
		rigGroup.add(object);
		object.position.set(0, 0, 0);
		object.quaternion.identity();
		object.scale.set(1, 1, 1);
	} else {
		for (const root of object.userData.skeletonRoots ?? []) {
			actor.add(root);
		}
	}

	object.userData.animationRoot = actor;
	actor.updateMatrixWorld(true);
	object.bindMatrixInverse.copy(object.bindMatrix).invert();
}

function refreshActorHelpers(actor) {
	for (const helper of [...editorHelperRoot.children]) {
		if (helper.userData.actorId === actor.userData.actorId) {
			editorHelperRoot.remove(helper);
		}
	}

	createEditorHelper(actor);
}

function buildActorHierarchy(sceneData, root, withHelpers = false) {
	if (!Array.isArray(sceneData?.actors)) return;

	const objects = new Map();
	const actorDataMap = new Map();

	for (const actorData of sceneData.actors) {
		if (!actorData?.id || objects.has(actorData.id)) {
			console.warn('Missing or duplicate actor ID:', actorData?.id);
			continue;
		}

		const object = createActor(actorData);

		objects.set(actorData.id, object);
		actorDataMap.set(actorData.id, actorData);
	}

	for (const [id, object] of objects) {
		const actorData = actorDataMap.get(id);
		const parent = objects.get(actorData.parent);

		let parentId = actorData.parent;
		const visited = new Set([id]);
		let cyclic = false;

		while (parentId && actorDataMap.has(parentId)) {
			if (visited.has(parentId)) {
				cyclic = true;
				break;
			}

			visited.add(parentId);
			parentId = actorDataMap.get(parentId).parent;
		}

		if (parent && !cyclic && actorData.type !== 'World') {
			parent.add(object);
		} else {
			root.add(object);

			if (cyclic) {
				console.warn('Cyclic actor parenting:', id);
			}
		}
	}

	if (withHelpers) {
		for (const object of objects.values()) {
			createEditorHelper(object);
		}
	}
}

function loadEditorScene(sceneData) {
	clearSelection();
	for (const runtime of editorScriptRuntimes) runtime.stop();
	editorScriptRuntimes = [];

	// Remove the previous environment first.
	editorEnvironment.setEnvironment(null);

	clearRoot(editorActorRoot);
	clearRoot(editorHelperRoot);

	prepareRuntimeMeshAssets(sceneData);
	prepareanimationStateNodes(sceneData);

	// Rebuild actors and components.
	buildActorHierarchy(sceneData, editorActorRoot, true);
	initializeEditorScriptRuntimes(sceneData);

	// Locate the Environment Actor.
	const environment = sceneData.actors?.find((actor) => actor.type === 'Environment');

	// Apply sky, sun, ambient light and fog.
	editorEnvironment.setEnvironment(environment ?? null);
}

function selectActor(actor, notifyExtension = true) {
	selectedActor = actor;
	selectedActorObject = actor;
	selectedActorId = actor.userData.actorId ?? null;

	if (actor.userData.actorType !== 'World') {
		transformControls.attach(actor);
		transformHelper.visible = true;
		outlinePass.selectedObjects = [actor];
	} else {
		transformControls.detach();
		transformHelper.visible = false;
		outlinePass.selectedObjects = [];
	}

	selectedCamera = undefined;

	selectedCamera = actor.getObjectByProperty('isCamera', true);

	if (selectedCamera) {
		previewViewport.classList.add('visible');
		resizePreview();
	} else {
		previewViewport.classList.remove('visible');
	}

	if (notifyExtension && selectedActorId && editorMode === 'scene') {
		postOutlineUpdate('selectActor', {
			actorId: selectedActorId,
		});
	}
}

// Editor Helpers

function findActorFromObject(object) {
	let current = object;

	while (current && current !== editorActorRoot) {
		if (current.userData.editorHelper) {
			return current.userData.actorObject;
		}

		if (current.userData.isActorRoot) {
			return current;
		}

		if (current.userData.actorObject) {
			return current.userData.actorObject;
		}

		current = current.parent;
	}

	return undefined;
}

function createEditorHelper(actor) {
	const components = [];

	actor.traverse((object) => {
		if (object.userData.componentId) {
			components.push(object);
		}
	});

	for (const object of components) {
		if (object instanceof THREE.Camera) {
			createCameraEditorHelper(object);
			continue;
		}

		let helper;

		if (object instanceof THREE.PointLight) {
			helper = new THREE.PointLightHelper(object, 0.25);
		} else if (object instanceof THREE.DirectionalLight) {
			helper = new THREE.DirectionalLightHelper(object, 0.75);
		} else if (object instanceof THREE.SpotLight) {
			helper = new THREE.SpotLightHelper(object);
		}

		if (!helper) continue;

		helper.userData.actorId = actor.userData.actorId;
		helper.userData.actorObject = actor;
		helper.userData.editorHelper = true;

		helper.traverse((child) => {
			child.layers.set(EDITOR_LAYER);
			child.userData.actorId = actor.userData.actorId;
			child.userData.actorObject = actor;
			child.userData.editorHelper = true;
		});

		editorHelperRoot.add(helper);
	}
}

function createCameraEditorHelper(camera) {
	if (!cameraHelperTemplate) {
		return;
	}

	const helper = cameraHelperTemplate.clone(true);

	helper.name = 'CameraHelper';

	helper.scale.setScalar(CAMERA_HELPER_SCALE);

	helper.userData.actorId = camera.userData.actorObject?.userData.actorId;

	helper.userData.actorObject = camera.userData.actorObject;

	helper.userData.editorHelper = true;

	helper.layers.set(EDITOR_LAYER);

	helper.traverse((child) => {
		child.layers.set(EDITOR_LAYER);

		child.userData.actorId = camera.userData.actorObject?.userData.actorId;

		child.userData.actorObject = camera.userData.actorObject;

		child.userData.editorHelper = true;
	});

	camera.add(helper);
}

function updateEditorHelpers() {
	editorActorRoot.traverse((object) => {
		if (!(object instanceof THREE.Camera)) {
			return;
		}

		const helper = object.children.find((child) => child.name === 'CameraHelper');

		if (!helper) {
			return;
		}

		helper.scale.set(
			CAMERA_HELPER_SCALE / safeScale(object.scale.x),

			CAMERA_HELPER_SCALE / safeScale(object.scale.y),

			CAMERA_HELPER_SCALE / safeScale(object.scale.z)
		);
	});
}

function safeScale(

	value
) {
	if (Math.abs(value) < 0.00001) {
		return 1;
	}

	return value;
}

// Main Viewport Selection

renderer.domElement.addEventListener('pointerdown', (event) => {
	if (isPlaying || isTransformDragging) {
		return;
	}

	pointerDownX = event.clientX;

	pointerDownY = event.clientY;
});

renderer.domElement.addEventListener('pointerup', (event) => {
	if (isPlaying) {
		return;
	}

	if (didTransformDrag) {
		didTransformDrag = false;

		return;
	}

	const moved = Math.hypot(
		event.clientX - pointerDownX,

		event.clientY - pointerDownY
	);

	if (moved > 4) {
		return;
	}

	selectFromViewport(event);
});

// function findComponentFromObject(object) {
// 	let current = object;

// 	while (current && current !== editorActorRoot) {
// 		if (current.userData.componentId) {
// 			return current;
// 		}

// 		current = current.parent;
// 	}

// 	return null;
// }

function findComponentFromObject(object) {
	let current = object;

	while (current && current !== editorActorRoot) {
		if (current.userData.componentId) {
			return current;
		}

		current = current.parent;
	}

	return null;
}

function selectComponent(component, notifyExtension = true) {
	selectedActor = component;
	selectedActorObject = component;
	selectedActorId = component.userData.actorObject?.userData.actorId ?? null;

	transformControls.attach(component.userData.rigGroup ?? component);
	transformHelper.visible = true;
	outlinePass.selectedObjects = [component];

	selectedCamera = undefined;
	previewViewport.classList.remove('visible');

	if (notifyExtension) {
		postOutlineUpdate('selectComponent', {
			actorId: selectedActorId,
			componentId: component.userData.componentId,
		});
	}
}

function selectFromViewport(event) {
	const rect = renderer.domElement.getBoundingClientRect();

	pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

	raycaster.setFromCamera(pointer, activeEditorCamera);

	const actorHits = raycaster.intersectObjects(editorActorRoot.children, true);

	const helperHits = raycaster.intersectObjects(editorHelperRoot.children, true);

	const hits = [...actorHits, ...helperHits].sort((a, b) => a.distance - b.distance);

	if (!hits.length) {
		clearSelection();
		return;
	}

	if (editorMode === 'actor') {
		for (const hit of hits) {
			const component = findComponentFromObject(hit.object);

			// Camera geometry is an editor helper nested beneath the camera
			// component. It should select that component in the Actor Editor,
			// just like clicking renderable component geometry does.
			if (component) {
				selectComponent(component);
				return;
			}
		}
	}

	const actor = findActorFromObject(hits[0].object);

	if (!actor) {
		clearSelection();
		return;
	}

	selectActor(actor);
}

function clearSelection() {
	selectedActor = undefined;

	selectedCamera = undefined;

	selectedActorObject = null;

	selectedActorId = null;

	transformControls.detach();

	transformHelper.visible = false;

	outlinePass.selectedObjects = [];


	previewViewport.classList.remove('visible');
}

// View Gizmo Input

viewGizmoRenderer.domElement.addEventListener('pointerdown', (event) => {
	if (isPlaying) {
		return;
	}

	viewGizmoPointerDownX = event.clientX;

	viewGizmoPointerDownY = event.clientY;
});

viewGizmoRenderer.domElement.addEventListener('pointerup', (event) => {
	if (isPlaying || !viewGizmo) {
		return;
	}

	const moved = Math.hypot(
		event.clientX - viewGizmoPointerDownX,

		event.clientY - viewGizmoPointerDownY
	);

	if (moved > 4) {
		return;
	}

	selectViewFromGizmo(event);
});

function selectViewFromGizmo(event) {
	if (!viewGizmo) {
		return;
	}

	const rect = viewGizmoRenderer.domElement.getBoundingClientRect();

	viewGizmoPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;

	viewGizmoPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

	viewGizmoRaycaster.setFromCamera(viewGizmoPointer, viewGizmoCamera);

	const hits = viewGizmoRaycaster.intersectObject(viewGizmo, true);

	if (hits.length === 0) {
		return;
	}

	const hit = hits[0];

	const localPoint = viewGizmo.worldToLocal(hit.point.clone());

	const absX = Math.abs(localPoint.x);

	const absY = Math.abs(localPoint.y);

	const absZ = Math.abs(localPoint.z);

	if (absY >= absX && absY >= absZ) {
		if (localPoint.y >= 0) {
			switchToTopView();
		} else {
			switchToBottomView();
		}

		return;
	}

	if (absX >= absY && absX >= absZ) {
		if (localPoint.x >= 0) {
			switchToRightView();
		} else {
			switchToLeftView();
		}

		return;
	}

	if (localPoint.z >= 0) {
		switchToFrontView();
	} else {
		switchToBackView();
	}
}

// View Switching

function getViewDistance() {
	const distance = activeEditorCamera.position.distanceTo(controls.target);

	if (Number.isFinite(distance) && distance > 0.01) {
		return distance;
	}

	return 10;
}

function switchToTopView() {
	const distance = getViewDistance();

	topCamera.position.copy(controls.target);

	topCamera.position.y += distance;

	topCamera.up.set(0, 0, -1);

	topCamera.lookAt(controls.target);

	setActiveEditorCamera(topCamera);
}

function switchToBottomView() {
	const distance = getViewDistance();

	bottomCamera.position.copy(controls.target);

	bottomCamera.position.y -= distance;

	bottomCamera.up.set(0, 0, 1);

	bottomCamera.lookAt(controls.target);

	setActiveEditorCamera(bottomCamera);
}

function switchToLeftView() {
	const distance = getViewDistance();

	leftCamera.position.copy(controls.target);

	leftCamera.position.x -= distance;

	leftCamera.up.set(0, 1, 0);

	leftCamera.lookAt(controls.target);

	setActiveEditorCamera(leftCamera);
}

function switchToRightView() {
	const distance = getViewDistance();

	rightCamera.position.copy(controls.target);

	rightCamera.position.x += distance;

	rightCamera.up.set(0, 1, 0);

	rightCamera.lookAt(controls.target);

	setActiveEditorCamera(rightCamera);
}

function switchToFrontView() {
	const distance = getViewDistance();

	frontCamera.position.copy(controls.target);

	frontCamera.position.z += distance;

	frontCamera.up.set(0, 1, 0);

	frontCamera.lookAt(controls.target);

	setActiveEditorCamera(frontCamera);
}

function switchToBackView() {
	const distance = getViewDistance();

	backCamera.position.copy(controls.target);

	backCamera.position.z -= distance;

	backCamera.up.set(0, 1, 0);

	backCamera.lookAt(controls.target);

	setActiveEditorCamera(backCamera);
}

function setActiveEditorCamera(camera) {

	activeEditorCamera = camera;

	if (!isPlaying) {
		activeCamera = camera;
	}

	controls.object = camera;

	transformControls.camera = camera;

	camera.layers.enable(WORLD_LAYER);

	camera.layers.enable(EDITOR_LAYER);

	resize();
}

// View Gizmo Orientation

function updateViewGizmo() {
	if (!viewGizmo) {
		return;
	}

	viewGizmo.quaternion.copy(activeEditorCamera.quaternion).invert();
}

// Play Mode

async function beginPlay(sceneData) {
	transformControls.detach();
	transformHelper.visible = false;
	disposeAnimationStates();

	for (const [root, listener] of animationEndListeners) {
		const mixer = animationMixers.get(root);

		mixer?.removeEventListener('finished', listener);
	}

	animationEndListeners.clear();

	animationMixers.clear();

	prepareRuntimeMeshAssets(sceneData);

	// Register generated nodes before the scripts
	// are instantiated or evaluated.
	prepareanimationStateNodes(sceneData);

	gameplayEnvironment.setEnvironment(null);

	clearRoot(gameplayActorRoot);
	buildActorHierarchy(sceneData, gameplayActorRoot);

	physicsRuntime?.dispose();
	physicsRuntime = new IEPhysicsRuntime(gameplayActorRoot);
	try {
		await physicsRuntime.initialize();
		console.log('[IE Physics] Rapier world initialized');
	} catch (error) {
		console.error('[IE Physics] Initialization failed:', error);
		physicsRuntime?.dispose();
		physicsRuntime = null;
	}

	const environment = sceneData.actors?.find((actor) => actor.type === 'Environment');

	gameplayEnvironment.setEnvironment(environment ?? null);

	lastFrameTime = performance.now();
	isPlaying = true;
	isPaused = false;

	previewViewport.classList.remove('visible');
	viewGizmoViewport.style.display = 'none';

	gameplayCamera = findActiveGameplayCamera();

	if (!gameplayCamera) {
		console.warn('No active gameplay camera found.');
		// Use a world-only copy. Reusing the editor camera also renders the
		// editor layer, causing collider wireframes and other helpers to leak
		// into Play mode.
		gameplayCamera = cloneEditorCamera(activeEditorCamera);
	}

	activeScene = gameplayScene;
	activeCamera = gameplayCamera;

	controls.enabled = false;
	outlinePass.selectedObjects = [];

	resize();

	initializeScriptRuntimes(sceneData);
}

function pausePlay() {
	if (!isPlaying) {
		return;
	}

	isPaused = true;
	clearGameplayInput();
}

function continuePlay() {
	if (!isPlaying) {
		return;
	}

	isPaused = false;
}

function stopPlay() {
	if (!isPlaying) {
		return;
	}

	disposeAnimationStates();

	for (const mixer of animationMixers.values()) {
		mixer.stopAllAction();
	}

	for (const [root, listener] of animationEndListeners) {
		const mixer = animationMixers.get(root);

		mixer?.removeEventListener('finished', listener);
	}

	animationEndListeners.clear();

	animationMixers.clear();
	clearGameplayInput();
	for (const runtime of scriptRuntimes) {
		runtime.stop();
	}
	scriptRuntimes = [];
	physicsRuntime?.dispose();
	physicsRuntime = null;

	gameplayEnvironment.setEnvironment(null);

	clearRoot(gameplayActorRoot);
	runtimeMeshAssets.clear();

	gameplayCamera = undefined;

	activeScene = editorScene;

	activeCamera = activeEditorCamera;

	controls.enabled = true;

	isPlaying = false;

	isPaused = false;


	viewGizmoViewport.style.display = '';

	if (selectedActorObject) {
		transformControls.attach(
			selectedActorObject.userData.rigGroup ?? selectedActorObject
		);

		transformHelper.visible = true;

		outlinePass.selectedObjects = [selectedActorObject];
	}

	if (selectedCamera) {
	
		previewViewport.classList.add('visible');
	}

	resize();
}

// Gameplay Camera

function findActiveGameplayCamera() {
	let selected;
	let highestPriority = -Infinity;

	gameplayActorRoot.traverse((object) => {
		if (!(object instanceof THREE.Camera)) return;
		if (object.userData.activeCamera !== true) return;

		let current = object;

		while (current && current !== gameplayActorRoot) {
			if (!current.visible) return;
			current = current.parent;
		}

		const priority = Number(object.userData.cameraPriority ?? 0);

		if (priority > highestPriority) {
			highestPriority = priority;
			selected = object;
		}
	});

	return selected;
}

function cloneEditorCamera(source) {
	let camera;

	if (source instanceof THREE.PerspectiveCamera) {
		camera = new THREE.PerspectiveCamera(source.fov, source.aspect, source.near, source.far);

		camera.zoom = source.zoom;
	} else if (source instanceof THREE.OrthographicCamera) {
		camera = new THREE.OrthographicCamera(
			source.left,
			source.right,
			source.top,
			source.bottom,
			source.near,
			source.far
		);

		camera.zoom = source.zoom;
	} else {
		throw new Error('Unsupported editor camera type.');
	}

	camera.position.copy(source.position);

	camera.quaternion.copy(source.quaternion);

	camera.scale.copy(source.scale);

	camera.layers.set(WORLD_LAYER);

	camera.updateProjectionMatrix();

	camera.name = 'Fallback Gameplay Camera';

	return camera;
}


function createActor(actorData) {
	const actor = new THREE.Group();
	const skeletonCache = new Map();
	const componentObjects = new Map();

	actor.name = actorData.name ?? 'Actor';

	actor.userData.actorId = actorData.id;
	actor.userData.actorType = actorData.type;
	actor.userData.isActorRoot = true;
	actor.userData.components = structuredClone(actorData.components ?? []);

	// Preserve the original Actor Asset reference
	actor.userData.sourceAssetId =
		actorData.source?.id ?? actorData.sourceAssetId ?? actorData.assetId ?? null;

	for (const component of actorData.components ?? []) {
		if (component.enabled === false) continue;

		// Environment sunlight is managed separately.
		if (actorData.type === 'Environment' && component.type === 'directionalLight') {
			continue;
		}

		let object;

		switch (component.type) {
			case 'mesh':
				object = createMeshActor(component, skeletonCache);
				break;

			case 'camera':
				object = createCameraActor(component);
				object.userData.activeCamera = component.active ?? true;
				object.userData.cameraPriority = component.priority ?? 0;
				break;

			case 'springArm':
				object = createSpringArm(component);
				break;

			case 'collider':
				object = createColliderHelper(component);
				break;

			case 'pointLight':
			case 'directionalLight':
			case 'spotLight':
				object = createLightComponent(component);
				break;

			default:
				continue;
		}

		if (!object) continue;

		object.name = component.name ?? component.type;
		object.userData.componentId = component.id;
		object.userData.componentType = component.type;
		object.userData.actorObject = actor;

		applyTransform(object, component);
		if (component.type === 'springArm') {
			configureSpringArm(object, component);
		}
		if (component.type === 'collider') {
			applyColliderHelperTransform(object, component);
		}

		actor.add(object);
		componentObjects.set(component.id, object);

		if (object.isSkinnedMesh) {
			attachSkinnedComponentRoots(actor, object);
		}
	}

	for (const component of actorData.components ?? []) {
		const object = componentObjects.get(component.id);
		const parent = componentObjects.get(component.parent);

		if (object && parent && object !== parent) {
			parent.add(object.userData.rigGroup ?? object);
		}
	}

	applyTransform(actor, actorData);

	return actor;
}

function createLightComponent(component) {
	switch (component.type) {
		case 'pointLight':
			return createPointLightActor(component);

		case 'directionalLight':
			return createDirectionalLightActor(component);

		case 'spotLight':
			return createSpotLightActor(component);

		default:
			return new THREE.Object3D();
	}
}

function createPointLightActor(component) {
	const light = new THREE.PointLight(
		component.color ?? '#ffffff',
		component.intensity ?? 1,
		component.distance ?? 0,
		component.decay ?? 2
	);

	light.castShadow = component.castShadow ?? false;
	light.layers.set(WORLD_LAYER);

	return light;
}

function createDirectionalLightActor(component) {
	const light = new THREE.DirectionalLight(component.color ?? '#ffffff', component.intensity ?? 1);

	light.castShadow = component.castShadow ?? false;

	light.shadow.mapSize.set(4096, 4096);

	light.shadow.camera.left = -20;
	light.shadow.camera.right = 20;
	light.shadow.camera.top = 20;
	light.shadow.camera.bottom = -20;

	light.shadow.camera.near = 0.1;
	light.shadow.camera.far = 500;

	light.shadow.bias = -0.0001;
	light.shadow.normalBias = 0.02;
	light.shadow.radius = 2;

	light.shadow.radius = 25;
	light.shadow.blurSamples = 25;

	light.shadow.camera.updateProjectionMatrix();
	light.layers.set(WORLD_LAYER);

	light.target.position.set(0, 0, -1);
	light.add(light.target);

	return light;
}

function createSpotLightActor(component) {
	const light = new THREE.SpotLight(
		component.color ?? '#ffffff',
		component.intensity ?? 1,
		component.distance ?? 0,
		component.angle ?? Math.PI / 6,
		component.penumbra ?? 0,
		component.decay ?? 2
	);

	light.castShadow = component.castShadow ?? false;
	light.layers.set(WORLD_LAYER);

	light.target.position.set(0, 0, -1);
	light.add(light.target);

	return light;
}


function createCameraActor(component) {
	const aspect = getViewportAspect();
	const near = component.near ?? 0.1;
	const far = component.far ?? 1000;

	let camera;

	if (component.projection === 'orthographic') {
		const size = component.orthographicSize ?? 10;
		const halfHeight = size / 2;
		const halfWidth = halfHeight * aspect;

		camera = new THREE.OrthographicCamera(
			-halfWidth,
			halfWidth,
			halfHeight,
			-halfHeight,
			near,
			far
		);

		camera.userData.orthoSize = size;
	} else {
		camera = new THREE.PerspectiveCamera(component.fov ?? 75, aspect, near, far);
	}

	camera.layers.set(WORLD_LAYER);
	camera.zoom = component.zoom ?? 1;
	camera.updateProjectionMatrix();

	return camera;
}

function createTemporaryActor(actorData) {
	const object = new THREE.Object3D();

	object.name = actorData.name;
	object.userData.actorId = actorData.id;
	object.userData.actorType = actorData.type;

	return object;
}

function createMeshSkeleton(data) {
	if (
		!data ||
		!Array.isArray(data.nodes) ||
		!Array.isArray(data.bones) ||
		!Array.isArray(data.boneInverses)
	) {
		throw new Error('Invalid Skeleton asset');
	}

	const objects = new Map();

	// Construct all nodes first, including any
	// intermediary non-bone nodes.
	for (const node of data.nodes) {
		const object = node.isBone ? new THREE.Bone() : new THREE.Object3D();

		object.name = node.name || node.id;

		object.userData.sourceUUID = node.sourceUUID;
		object.userData.skeletonNodeId = node.id;

		object.position.fromArray(node.position ?? [0, 0, 0]);

		object.quaternion.fromArray(node.quaternion ?? [0, 0, 0, 1]);

		object.scale.fromArray(node.scale ?? [1, 1, 1]);

		objects.set(node.id, object);
	}

	// Reconstruct parent-child relationships.
	const roots = [];

	for (const node of data.nodes) {
		const object = objects.get(node.id);

		if (node.parentId) {
			const parent = objects.get(node.parentId);

			if (!parent) {
				throw new Error(`Missing skeleton parent: ${node.parentId}`);
			}

			parent.add(object);
		} else {
			roots.push(object);
		}
	}

	// Preserve bone order: skin indices refer
	// directly to this array.
	const bones = data.bones.map((id) => {
		const bone = objects.get(id);

		if (!bone?.isBone) {
			throw new Error(`Invalid skeleton bone: ${id}`);
		}

		return bone;
	});

	if (data.boneInverses.length !== bones.length) {
		throw new Error('Bone inverse matrix count mismatch');
	}

	const inverses = data.boneInverses.map((values) => {
		if (!Array.isArray(values) || values.length !== 16) {
			throw new Error('Invalid bone inverse matrix');
		}

		return new THREE.Matrix4().fromArray(values);
	});

	const skeleton = new THREE.Skeleton(bones, inverses);
	const rootGroup = new THREE.Group();
	rootGroup.name = 'Skeleton Rig';

	for (const root of roots) {
		rootGroup.add(root);
	}

	return {
		skeleton,
		roots,
		rootGroup,
		nodes: objects,
	};
}


function createMeshActor(component, skeletonCache = null) {
	const geometryData = component.resolvedGeometry;

	if (!geometryData) {
		return new THREE.Object3D();
	}

	if (geometryData.type !== 'buffer') {
		return new THREE.Object3D();
	}

	const geometry = new THREE.BufferGeometry();

	if (geometryData.positions?.length) {
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(geometryData.positions, 3));
	}

	if (geometryData.normals?.length) {
		geometry.setAttribute('normal', new THREE.Float32BufferAttribute(geometryData.normals, 3));
	}

	if (geometryData.uvs?.length) {
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute(geometryData.uvs, 2));
	}

	if (geometryData.indices?.length) {
		geometry.setIndex(geometryData.indices);
	}

	if (geometryData.skinIndices?.length && geometryData.skinWeights?.length) {
		geometry.setAttribute(
			'skinIndex',
			new THREE.Uint16BufferAttribute(geometryData.skinIndices, 4)
		);

		geometry.setAttribute(
			'skinWeight',
			new THREE.Float32BufferAttribute(geometryData.skinWeights, 4)
		);
	}

	if (!geometry.getAttribute('normal') && geometry.getAttribute('position')) {
		geometry.computeVertexNormals();
	}

	if (Array.isArray(geometryData.groups)) {
		for (const group of geometryData.groups) {
			geometry.addGroup(group.start, group.count, group.materialIndex ?? 0);
		}
	}

	const materialData = component.resolvedMaterials?.[0] ?? {};

	const material = createMeshMaterial(materialData);

	let mesh;

	if (component.skinned === true) {
		if (!geometry.hasAttribute('skinIndex') || !geometry.hasAttribute('skinWeight')) {
			throw new Error('Skinned mesh is missing skin attributes');
		}

		const skeletonData =
			component.resolvedSkeleton ??
			(component.skeleton?.data?.nodes ? component.skeleton.data : null);

		if (!skeletonData) {
			throw new Error(`Skeleton asset has not been resolved: ` + `${component.name ?? 'Mesh'}`);
		}

		const skeletonReference = component.skeleton;

		const skeletonId =
			typeof skeletonReference === 'string' ? skeletonReference : (skeletonReference?.id ?? null);

		let rig = skeletonId && skeletonCache ? skeletonCache.get(skeletonId) : null;

		const isNewRig = !rig;

		if (!rig) {
			rig = createMeshSkeleton(skeletonData);

			if (skeletonId && skeletonCache) {
				skeletonCache.set(skeletonId, rig);
			}
		}

		mesh = new THREE.SkinnedMesh(geometry, material);

		mesh.bindMode = component.bindMode ?? 'attached';

		const bindMatrix = new THREE.Matrix4();

		if (component.bindMatrix?.length === 16) {
			bindMatrix.fromArray(component.bindMatrix);
		}

		mesh.userData.skeletonRoots = isNewRig ? rig.roots : [];
		mesh.userData.rigGroup = rig.rootGroup;

		mesh.userData.skeletonNodes = rig.nodes;
		mesh.userData.skeletonAssetId = skeletonId;

		mesh.bind(rig.skeleton, bindMatrix);
		mesh.normalizeSkinWeights();
	} else {
		mesh = new THREE.Mesh(geometry, material);
	}

	mesh.castShadow = true;
	mesh.receiveShadow = true;

	mesh.layers.set(WORLD_LAYER);
	mesh.visible = component.enabled ?? true;

	return mesh;
}

function createMeshMaterial(data = {}) {
	const type = data.type ?? 'standard';
	const color = data.color ?? '#cccccc';

	const getMap = (name, colorMap = false) => {
		const key = 'resolved' + name[0].toUpperCase() + name.slice(1);

		const asset = data[key];
		if (!asset) return null;

		const texture = createMeshTexture(asset);

		if (!texture) return null;

		// createMeshTexture may cache and share textures.
		// Clone when the color-space setting differs.
		const desiredColorSpace = colorMap ? THREE.SRGBColorSpace : THREE.NoColorSpace;

		if (texture.colorSpace !== desiredColorSpace) {
			const copy = texture.clone();
			copy.colorSpace = desiredColorSpace;
			copy.needsUpdate = true;
			return copy;
		}

		return texture;
	};

	const common = {
		color,
		wireframe: data.wireframe ?? false,
		side: data.side ?? THREE.DoubleSide,
		transparent: data.transparent ?? false,
		opacity: data.opacity ?? 1,
		alphaTest: data.alphaTest ?? 0,
	};

	switch (type) {
		case 'basic':
			return new THREE.MeshBasicMaterial({
				...common,
				map: getMap('map', true),
			});

		case 'phong':
			return new THREE.MeshPhongMaterial({
				...common,

				shininess: data.shininess ?? 30,

				map: getMap('map', true),
				normalMap: getMap('normalMap'),
				normalScale: new THREE.Vector2(...(data.normalScale ?? [1, 1])),
				bumpMap: getMap('bumpMap'),
				bumpScale: data.bumpScale ?? 1,

				emissive: data.emissive ?? '#000000',
				emissiveMap: getMap('emissiveMap', true),
				emissiveIntensity: data.emissiveIntensity ?? 1,

				displacementMap: getMap('displacementMap'),
				displacementScale: data.displacementScale ?? 1,
				displacementBias: data.displacementBias ?? 0,

				aoMap: getMap('aoMap'),
				aoMapIntensity: data.aoMapIntensity ?? 1,
				lightMap: getMap('lightMap'),
				lightMapIntensity: data.lightMapIntensity ?? 1,

				alphaMap: getMap('alphaMap'),
			});

		case 'standard':
		default:
			return new THREE.MeshStandardMaterial({
				...common,

				metalness: data.metalness ?? 0,
				roughness: data.roughness ?? 1,

				map: getMap('map', true),

				normalMap: getMap('normalMap'),
				normalScale: new THREE.Vector2(...(data.normalScale ?? [1, 1])),

				roughnessMap: getMap('roughnessMap'),
				metalnessMap: getMap('metalnessMap'),

				aoMap: getMap('aoMap'),
				aoMapIntensity: data.aoMapIntensity ?? 1,

				emissive: data.emissive ?? '#000000',
				emissiveIntensity: data.emissiveIntensity ?? 1,
				emissiveMap: getMap('emissiveMap', true),

				bumpMap: getMap('bumpMap'),
				bumpScale: data.bumpScale ?? 1,

				displacementMap: getMap('displacementMap'),
				displacementScale: data.displacementScale ?? 1,
				displacementBias: data.displacementBias ?? 0,

				alphaMap: getMap('alphaMap'),

				lightMap: getMap('lightMap'),
				lightMapIntensity: data.lightMapIntensity ?? 1,
			});
	}
}

// Temporary Camera

function createTemporaryCamera() {
	const camera = new THREE.PerspectiveCamera(75, getViewportAspect(), 0.1, 1000);

	camera.layers.set(WORLD_LAYER);

	camera.userData.activeCamera = false;

	return camera;
}

// Meshes

function createCube() {
	const geometry = new THREE.BoxGeometry(1, 1, 1);

	const material = new THREE.MeshStandardMaterial({
		color: 0xffffff,
	});

	return new THREE.Mesh(geometry, material);
}

function createSphere() {
	const geometry = new THREE.SphereGeometry(0.5, 32, 16);

	const material = new THREE.MeshStandardMaterial({
		color: 0xffffff,
	});

	return new THREE.Mesh(geometry, material);
}

function createPlane() {
	const geometry = new THREE.PlaneGeometry(1, 1);

	const material = new THREE.MeshStandardMaterial({
		color: 0xffffff,
		side: THREE.DoubleSide,
	});

	return new THREE.Mesh(geometry, material);
}

// Lights

function createPointLight() {
	return new THREE.PointLight(0xffffff, 10, 100);
}

function createDirectionalLight() {
	const light = new THREE.DirectionalLight(0xffffff, 3);

	light.target.position.set(0, 0, 0);

	light.add(light.target);

	return light;
}

// Transform

function applyTransform(object, transform) {
	if (!transform) {
		return;
	}

	const position = transform.position ?? [0, 0, 0];

	const rotation = transform.rotation ?? [0, 0, 0];

	const scale = transform.scale ?? [1, 1, 1];

	object.position.fromArray(position);

	object.rotation.set(rotation[0], rotation[1], rotation[2]);

	object.scale.fromArray(scale);
}

function saveSelectedActorTransform(object) {
	if (editorMode === 'actor' && selectedActorObject?.userData.componentId) {
		const component = selectedActorObject;
		const transformObject = component.userData.rigGroup ?? component;

		postSceneUpdate('updateComponentTransform', {
			componentId: component.userData.componentId,
			position: transformObject.position.toArray(),
			rotation: [
				transformObject.rotation.x,
				transformObject.rotation.y,
				transformObject.rotation.z
			],
			scale: transformObject.scale.toArray(),
		});

		return;
	}

	postSceneUpdate('updateActorTransform', {

		actorId: object.userData.actorId,

		position: [object.position.x, object.position.y, object.position.z],

		rotation: [object.rotation.x, object.rotation.y, object.rotation.z],

		scale: [object.scale.x, object.scale.y, object.scale.z],
	});
}

// Cleanup

function clearRoot(root) {
	for (const object of [...root.children]) {
		root.remove(object);

		disposeObject(object);
	}
}

function disposeObject(object) {
	object.traverse((child) => {
		if (child.userData.editorHelper === true) {
			return;
		}

		if (!(child instanceof THREE.Mesh)) {
			return;
		}

		child.geometry?.dispose();

		if (Array.isArray(child.material)) {
			for (const material of child.material) {
				material.dispose();
			}
		} else {
			child.material?.dispose();
		}
	});
}

// Viewport

function getViewportAspect() {
	const width =
	
		viewport.clientWidth;

	const height =
	
		viewport.clientHeight;

	if (width === 0 || height === 0) {
		return 1;
	}

	return width / height;
}

function resizePreview() {
	const width =
	
		previewViewport.clientWidth;

	const height =
	
		previewViewport.clientHeight;

	if (width === 0 || height === 0 || !selectedCamera) {
		return;
	}

	previewRenderer.setSize(width, height, false);

	updateCameraAspect(selectedCamera, width, height);
}

function resizeViewGizmo() {
	const width =
	
		viewGizmoViewport.clientWidth;

	const height =
	
		viewGizmoViewport.clientHeight;

	if (width === 0 || height === 0) {
		return;
	}

	viewGizmoRenderer.setSize(width, height, false);
}

function resize() {
	const width =
	
		viewport.clientWidth;

	const height =
	
		viewport.clientHeight;

	if (width === 0 || height === 0) {
		return;
	}

	renderer.setSize(width, height, false);

	composer.setSize(width, height);

	outlinePass.setSize(width, height);

	updateCameraAspect(activeEditorCamera, width, height);

	if (gameplayCamera) {
		updateCameraAspect(gameplayCamera, width, height);
	}

	if (selectedCamera) {
		resizePreview();
	}

	resizeViewGizmo();
}

function updateCameraAspect(camera, width, height) {
	const aspect = width / height;

	if (camera instanceof THREE.PerspectiveCamera) {
		camera.aspect = aspect;

		camera.updateProjectionMatrix();

		return;
	}

	if (camera instanceof THREE.OrthographicCamera) {
		const size = camera.userData.orthoSize ?? camera.top - camera.bottom;

		const halfHeight = size / 2;

		const halfWidth = halfHeight * aspect;

		camera.left = -halfWidth;

		camera.right = halfWidth;

		camera.top = halfHeight;

		camera.bottom = -halfHeight;

		camera.updateProjectionMatrix();
	}
}

// Keyboard Shortcuts

window.addEventListener('keydown', (event) => {
	if (isPlaying || !selectedActorObject) {
		return;
	}

	const target =
		(event.target);

	if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
		return;
	}

	switch (event.key.toLowerCase()) {
		case 'w':
			transformControls.setMode('translate');
			break;

		case 'e':
			transformControls.setMode('rotate');
			break;

		case 'r':
			transformControls.setMode('scale');
			break;
	}
});

// Render Loop

function animate() {
	requestAnimationFrame(animate);

	const now = performance.now();
	const deltaTime = Math.min((now - lastFrameTime) / 1000, 0.1);
	lastFrameTime = now;

	// Animate clouds in the active scene
	if (isPlaying) {
		if (!isPaused) {
			gameplayEnvironment.clouds.tick(deltaTime);
		}
	} else {
		editorEnvironment.clouds.tick(deltaTime);
	}

	if (isPlaying && !isPaused) {
		// Execute visual script graphs first.
		// They may update Animation State parameters.
		for (const runtime of scriptRuntimes) {
			try {
				runtime.update(deltaTime);
			} catch (error) {
				console.error('[IE] Script runtime error:', error);
			}
		}

		gameplayMouse.delta[0] = 0;
		gameplayMouse.delta[1] = 0;
		gameplayMouse.wheel = 0;

		physicsRuntime?.update(deltaTime);

		// Ordinary animation.play nodes.
		for (const mixer of animationMixers.values()) {
			mixer.update(deltaTime);
		}

		// Animation State machines.
		for (const entry of animationStateRuntimes.values()) {
			try {
				entry.runtime.update(deltaTime);
			} catch (error) {
				console.error('[IE] Animation State runtime error:', error);
			}
		}
	}

	if (!isPlaying && controls.enabled) {
		controls.update();
	}

	updateSpringArms(isPlaying ? gameplayActorRoot : editorActorRoot);

	if (!isPlaying) {
		updateEditorHelpers();
		updateViewGizmo();
	}

	renderPass.scene = activeScene;

	renderPass.camera = activeCamera;

	outlinePass.renderScene = activeScene;

	outlinePass.renderCamera = activeCamera;

	if (isPlaying) {
		outlinePass.selectedObjects = [];
	} else if (selectedActor?.userData.actorType !== 'World' && selectedActor) {
		outlinePass.selectedObjects = [selectedActor];
	}

	composer.render();

	if (!isPlaying && selectedCamera) {
		previewRenderer.render(editorScene, selectedCamera);
	}

	if (!isPlaying && viewGizmo) {
		viewGizmoRenderer.render(viewGizmoScene, viewGizmoCamera);
	}
}

// Window

window.addEventListener('resize', resize);

// Start

await loadEditorAssets();

postSceneUpdate('ready');

resize();
animate();
