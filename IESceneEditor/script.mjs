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
import { createTerrainGraphMaterial } from './TerrainMaterial.mjs';
import { IEScriptRuntime } from './IEScriptRuntime.mjs';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import IEEnvironmentRenderer from './IEEnvironmentRenderer.js';
import { registeranimationStateAssets } from './Nodes/IEAnimationStateNodes.mjs';
import { registerUIEventAssets } from './Nodes/IEUIEventNodes.mjs';
import { nodeRegistry } from './IENodeRegistry.mjs';
import { IEAnimationRuntime } from './IEAnimationRuntime.mjs';
import { IEPhysicsRuntime } from './IEPhysicsRuntime.mjs';
import { IUGRuntime } from './IUGRuntime.mjs';

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
const viewportToolbar = document.getElementById('toolbar');
const viewportView = document.getElementById('viewport-view');
const transformSpaceButton = document.getElementById('transform-space');
const translationSnapButton = document.getElementById('translation-snap');
const translationSnapValue = document.getElementById('translation-snap-value');
const rotationSnapButton = document.getElementById('rotation-snap');
const rotationSnapValue = document.getElementById('rotation-snap-value');
const cameraSpeed = document.getElementById('camera-speed');

if (!viewport) {
	throw new Error('Viewport element not found');
}

if (!previewViewport) {
	throw new Error('Preview viewport element not found');
}

if (!viewGizmoViewport) {
	throw new Error('View gizmo viewport not found');
}

if (!viewportToolbar) {
	throw new Error('Viewport toolbar not found');
}

// Assets

const gltfLoader = new GLTFLoader();

const cameraModelUri =

	window.INFINITE_ASSETS.cameraModel;

const viewGizmoModelUri =

	window.INFINITE_ASSETS.viewGizmoModel;

let cameraHelperTemplate;

let viewGizmo;
const loadedCustomNodeModules = new Set();

async function loadCustomNodeModules(moduleUrls = []) {
	for (const moduleUrl of moduleUrls) {
		if (loadedCustomNodeModules.has(moduleUrl)) continue;

		try {
			const module = await import(moduleUrl);
			const register = module.registerNodes ?? module.default;
			if (typeof register !== 'function') {
				throw new TypeError(
					'Custom node module must export default or registerNodes()'
				);
			}
			await register(nodeRegistry, { THREE });
			loadedCustomNodeModules.add(moduleUrl);
		} catch (error) {
			console.error(`[IE] Failed to load custom node module ${moduleUrl}:`, error);
		}
	}
}

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

const ambientLight = new THREE.HemisphereLight(0xffffff, 0x66708a, 3.5);

const directionalLight = new THREE.DirectionalLight(0xffffff, 5);

directionalLight.position.set(5, 10, 7);

const fillLight = new THREE.DirectionalLight(0xdde8ff, 3);

fillLight.position.set(-7, 5, -6);

const rimLight = new THREE.DirectionalLight(0xffffff, 2);

rimLight.position.set(0, 8, -10);

assetPreviewLights.add(
	ambientLight,
	directionalLight,
	fillLight,
	rimLight
);
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
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

viewport.appendChild(renderer.domElement);

// VS Code webviews can invalidate a pointer between pointerdown dispatch and
// Three.js requesting capture. TransformControls does not guard that browser
// API call, so make capture best-effort on the shared viewport canvas.
function makePointerCaptureSafe(element) {
	const setPointerCapture = element.setPointerCapture?.bind(element);
	const releasePointerCapture = element.releasePointerCapture?.bind(element);

	if (setPointerCapture) {
		element.setPointerCapture = (pointerId) => {
			try {
				setPointerCapture(pointerId);
			} catch (error) {
				if (error?.name !== 'InvalidStateError') {
					throw error;
				}
			}
		};
	}

	if (releasePointerCapture) {
		element.releasePointerCapture = (pointerId) => {
			try {
				if (element.hasPointerCapture?.(pointerId) === false) {
					return;
				}

				releasePointerCapture(pointerId);
			} catch (error) {
				if (error?.name !== 'InvalidStateError' && error?.name !== 'NotFoundError') {
					throw error;
				}
			}
		};
	}
}

makePointerCaptureSafe(renderer.domElement);

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
let pendingFootIK = [];
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

function prepareUIEventNodes(sceneData) {
	const assets = (sceneData.runtimeAssets ?? []).filter(asset =>
		asset?.type === 'ui' && asset.id && asset.data
	);
	return registerUIEventAssets(assets, nodeRegistry);
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
const iugRuntime = new IUGRuntime(document.getElementById('gameplay-ui'));
let gameplayInputMode = 'gameOnly';

function normalizeInputMode(mode) {
	return {
		'uionly': 'uiOnly',
		'gameandui': 'gameAndUI',
		'gameonly': 'gameOnly'
	}[String(mode ?? '').replace(/[^a-z]/gi, '').toLowerCase()] ?? 'gameOnly';
}

function acceptsGameInput() {
	return gameplayInputMode !== 'uiOnly';
}

iugRuntime.setInteractionHandler(event => {
	if (!isPlaying || isPaused) return;
	for (const runtime of scriptRuntimes) {
		try {
			runtime.widgetInteraction(event);
		} catch (error) {
			reportRuntimeError(error, error.ieRuntimeContext ?? {
				phase: 'VisualScript.widgetInteraction'
			});
		}
	}
});

const engine = {
	traceScript(trace) {
		if (!trace.breakpoint) return;
		postSceneUpdate('scriptTrace', {
			trace: { ...trace, timestamp: Date.now() }
		});
		isPaused = true;
		clearGameplayInput();
		this.showMouse();
	},
	lockMouse() {
		if (!isPlaying || document.pointerLockElement === renderer.domElement) {
			return;
		}

		const request = renderer.domElement.requestPointerLock?.();
		request?.catch?.(error => {
			console.warn('[IE Input] Mouse lock request failed:', error);
		});
	},

	showMouse() {
		if (document.pointerLockElement) {
			document.exitPointerLock?.();
		}
		renderer.domElement.style.cursor = '';
		iugRuntime.canvas.style.cursor = '';
	},

	hideMouse() {
		renderer.domElement.style.cursor = 'none';
		iugRuntime.canvas.style.cursor = 'none';
	},

	setInputMode(mode) {
		gameplayInputMode = normalizeInputMode(mode);
		const acceptsUIInput = gameplayInputMode !== 'gameOnly';
		iugRuntime.setInputEnabled(acceptsUIInput);

		if (acceptsUIInput) {
			this.showMouse();
		} else {
			this.hideMouse();
			this.lockMouse();
		}

		if (!acceptsGameInput()) clearGameplayInput();
		return gameplayInputMode;
	},

	getPhysicsBody(actor) {
		return physicsRuntime?.getBody(actor) ?? null;
	},

	isGrounded(actor, tolerance) {
		return physicsRuntime?.isGrounded(actor, tolerance) ?? false;
	},

	queueFootIK(constraint) {
		if (constraint?.actor && constraint?.bone) {
			pendingFootIK.push(constraint);
		}
	},

	print(...values) {
		postSceneUpdate('scriptPrint', {
			values: values.map(formatPrintValue),
		});
	},

	showUI(reference) {
		return iugRuntime.show(reference);
	},

	hideUI(reference) {
		iugRuntime.hide(reference);
	},

	setUIText(reference, widgetName, value) {
		return iugRuntime.setText(reference, String(widgetName ?? ''), value);
	},

	setUIValue(reference, widgetName, property, value) {
		return iugRuntime.setValue(
			reference,
			String(widgetName ?? ''),
			property,
			value
		);
	},

	openScene(reference) {
		const uri = typeof reference === 'string' ? reference : reference?.id;
		if (!uri) return false;
		vscode.postMessage({ type: 'openScene', uri });
		return true;
	},

	addComponent(actor, type) {
		if (!actor?.userData?.isActorRoot) {
			throw new TypeError('Add Component requires an Actor');
		}

		const supported = new Set([
			'mesh', 'camera', 'springArm', 'rigidBody', 'collider',
			'pointLight', 'directionalLight', 'spotLight'
		]);
		if (!supported.has(type)) {
			throw new Error(`Unsupported runtime component type: ${type}`);
		}

		const labels = {
			mesh: 'Mesh',
			camera: 'Camera',
			springArm: 'Spring Arm',
			rigidBody: 'Rigid Body',
			collider: 'Collider',
			pointLight: 'Point Light',
			directionalLight: 'Directional Light',
			spotLight: 'Spot Light'
		};
		const existing = actor.userData.components ?? [];
		const baseName = labels[type];
		const usedNames = new Set(existing.map(component => component.name));
		let name = baseName;
		let suffix = 2;
		while (usedNames.has(name)) name = `${baseName} ${suffix++}`;

		const data = {
			id: crypto.randomUUID(),
			type,
			name,
			enabled: true,
			parent: null,
			position: [0, 0, 0],
			rotation: [0, 0, 0],
			scale: [1, 1, 1],
			color: '#ffffff',
			intensity: 1,
			fov: 75,
			near: 0.1,
			far: 1000
		};
		existing.push(data);
		actor.userData.components = existing;

		let object = type === 'mesh'
			? new THREE.Mesh(
				new THREE.BufferGeometry(),
				new THREE.MeshStandardMaterial()
			)
			: createRenderedComponent(data);
		if (!object) object = new THREE.Group();
		initializeRenderedComponent(object, actor, data);
		actor.add(object);
		object.updateMatrixWorld(true);
		return object;
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

		const geometryId = typeof geometryRef === 'string'
			? geometryRef
			: geometryRef?.id;
		const materialIds = materialRefs.map(ref =>
			typeof ref === 'string' ? ref : ref?.id
		);
		const currentMaterialIds = component.userData.materialAssetIds ?? [];

		if (
			component.userData.geometryAssetId === geometryId &&
			currentMaterialIds.length === materialIds.length &&
			currentMaterialIds.every((id, index) => id === materialIds[index])
		) {
			return false;
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
		component.userData.geometryAssetId = geometryId;
		component.userData.materialAssetIds = materialIds;

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

let runtimeErrorReported = false;

function reportRuntimeError(error, context = {}) {
	if (runtimeErrorReported) return;
	runtimeErrorReported = true;
	isPaused = true;
	clearGameplayInput();
	engine.showMouse();

	const runtimeError = error instanceof Error ? error : new Error(String(error));
	postSceneUpdate('runtimeError', {
		error: {
			message: runtimeError.message,
			stack: runtimeError.stack,
			context: runtimeError.ieRuntimeContext ?? context
		}
	});
}

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
				reportRuntimeError(
					new Error('Script asset could not be resolved.'),
					{
						phase: 'VisualScript.initialize',
						actor: actorData.name,
						actorId: actorData.id,
						component: component.name ?? 'Script',
						componentId: component.id,
						scriptId: typeof component.script === 'string'
							? component.script
							: component.script?.id
					}
				);
				continue;
			}

			try {
				const runtime = new IEScriptRuntime(
					component.resolvedScript,
					actor,
					engine,
					{
						mouse: gameplayMouse,
						diagnostics: {
							actor: actorData.name,
							actorId: actorData.id,
							component: component.name ?? 'Script',
							componentId: component.id,
							scriptId: typeof component.script === 'string'
								? component.script
								: component.script?.id
						}
					}
				);

				runtimes.push(runtime);
			} catch (error) {
				reportRuntimeError(error, {
					phase: 'VisualScript.initialize',
					actor: actorData.name,
					actorId: actorData.id,
					component: component.name ?? 'Script',
					componentId: component.id
				});
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
			reportRuntimeError(error, error.ieRuntimeContext ?? {
				phase: 'VisualScript.onBegin'
			});
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

document.addEventListener('pointerlockchange', () => {
	renderer.domElement.style.cursor =
		document.pointerLockElement === renderer.domElement ||
		(isPlaying && !isPaused && gameplayInputMode === 'gameOnly')
			? 'none'
			: '';
});

const updateGameplayPointer = event => {
	if (!isPlaying || isPaused || !acceptsGameInput()) return;

	const rect = renderer.domElement.getBoundingClientRect();
	gameplayMouse.position[0] = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	gameplayMouse.position[1] = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	gameplayMouse.delta[0] += event.movementX;
	gameplayMouse.delta[1] += event.movementY;
};

const pressGameplayPointer = event => {
	if (!isPlaying || isPaused || !acceptsGameInput()) return;
	if (gameplayInputMode === 'gameOnly') engine.lockMouse();
	const name = mouseButtonNames[event.button];
	if (!name || gameplayMouse.buttons.has(name)) return;

	gameplayMouse.buttons.add(name);
	for (const runtime of scriptRuntimes) runtime.mouseDown(name);
};

const scrollGameplayPointer = event => {
	if (!isPlaying || isPaused || !acceptsGameInput()) return;
	gameplayMouse.wheel += event.deltaY;
};

for (const inputSurface of [renderer.domElement, iugRuntime.canvas]) {
	inputSurface.addEventListener('pointermove', updateGameplayPointer);
	inputSurface.addEventListener('pointerdown', pressGameplayPointer);
	inputSurface.addEventListener('wheel', scrollGameplayPointer, { passive: true });
}

window.addEventListener('pointerup', event => {
	const name = mouseButtonNames[event.button];
	if (!name || !gameplayMouse.buttons.has(name)) return;

	gameplayMouse.buttons.delete(name);
	for (const runtime of scriptRuntimes) runtime.mouseUp(name);
});

window.addEventListener('keydown', (event) => {
	if (!isPlaying || isPaused || !acceptsGameInput() || event.repeat) return;

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
			reportRuntimeError(error, error.ieRuntimeContext ?? {
				phase: 'VisualScript.keyDown'
			});
		}
	}
});

window.addEventListener('keyup', (event) => {
	if (!isPlaying || isPaused || !acceptsGameInput()) return;

	for (const runtime of scriptRuntimes) {
		try {
			runtime.keyUp(event.code);
		} catch (error) {
			reportRuntimeError(error, error.ieRuntimeContext ?? {
				phase: 'VisualScript.keyUp'
			});
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

// Reserve the right mouse button for editor-style fly navigation. Orbit and
// dolly remain available on the other mouse buttons for precise inspection.
controls.mouseButtons.RIGHT = null;

const flyNavigation = {
	active: false,
	keys: new Set(),
	speed: 8,
	lookSensitivity: 0.002
};
let editorStateSaveTimer = null;
let restoringEditorState = false;

const flyEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const flyForward = new THREE.Vector3();
const flyRight = new THREE.Vector3();
const flyMovement = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);

function updateFlyTarget() {
	activeEditorCamera.getWorldDirection(flyForward);
	controls.target.copy(activeEditorCamera.position).add(flyForward);
}

function captureEditorState() {
	return {
		camera: {
			view: editorCameraViewName(activeEditorCamera),
			position: activeEditorCamera.position.toArray(),
			quaternion: activeEditorCamera.quaternion.toArray(),
			target: controls.target.toArray(),
			flySpeed: flyNavigation.speed
		},
		transform: {
			mode: transformControls.mode,
			space: transformControls.space,
			translationSnap: transformControls.translationSnap,
			rotationSnap: transformControls.rotationSnap === null
				? null
				: THREE.MathUtils.radToDeg(transformControls.rotationSnap)
		}
	};
}

function scheduleEditorStateSave() {
	if (editorMode !== 'scene' || isPlaying || restoringEditorState) return;
	clearTimeout(editorStateSaveTimer);
	editorStateSaveTimer = setTimeout(() => {
		postSceneUpdate('saveEditorState', { state: captureEditorState() });
	}, 250);
}

function beginFlyNavigation(event) {
	if (
		event.button !== 2 ||
		isPlaying ||
		isTransformDragging ||
		!controls.enabled
	) return;

	event.preventDefault();
	// TransformControls listens on the same canvas and attempts pointer capture
	// before it checks which mouse button was pressed. Keep RMB fly input away
	// from that handler so the two controls cannot compete for capture.
	event.stopImmediatePropagation();
	if (activeEditorCamera !== editorCamera) {
		switchBackToPerspective();
	}
	flyNavigation.active = true;
	flyNavigation.keys.clear();
	flyEuler.setFromQuaternion(activeEditorCamera.quaternion);
	renderer.domElement.style.cursor = 'grabbing';
}

function endFlyNavigation(event) {
	if (!flyNavigation.active || (event.button !== undefined && event.button !== 2)) {
		return;
	}

	flyNavigation.active = false;
	flyNavigation.keys.clear();
	renderer.domElement.style.cursor = '';
	updateFlyTarget();
	scheduleEditorStateSave();
}

renderer.domElement.addEventListener('contextmenu', event => {
	if (!isPlaying) event.preventDefault();
});

renderer.domElement.addEventListener('pointerdown', beginFlyNavigation, true);
window.addEventListener('pointerup', endFlyNavigation);

window.addEventListener('pointermove', event => {
	if (!flyNavigation.active) return;

	flyEuler.y -= event.movementX * flyNavigation.lookSensitivity;
	flyEuler.x -= event.movementY * flyNavigation.lookSensitivity;
	flyEuler.x = THREE.MathUtils.clamp(
		flyEuler.x,
		-Math.PI / 2 + 0.01,
		Math.PI / 2 - 0.01
	);
	activeEditorCamera.quaternion.setFromEuler(flyEuler);
	updateFlyTarget();
});

renderer.domElement.addEventListener('wheel', event => {
	if (!flyNavigation.active) return;

	event.preventDefault();
	const factor = Math.exp(-Math.sign(event.deltaY) * 0.18);
	flyNavigation.speed = THREE.MathUtils.clamp(
		flyNavigation.speed * factor,
		0.25,
		250
	);
	if (cameraSpeed) {
		const options = [...cameraSpeed.options];
		const nearest = options.reduce((best, option) =>
			Math.abs(Number(option.value) - flyNavigation.speed) <
			Math.abs(Number(best.value) - flyNavigation.speed)
				? option
				: best
		);
		cameraSpeed.value = nearest.value;
		cameraSpeed.title = `Fly camera speed: ${flyNavigation.speed.toFixed(1)}`;
	}
	scheduleEditorStateSave();
}, { passive: false });

window.addEventListener('keydown', event => {
	if (!flyNavigation.active) return;

	if ([
		'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
		'ShiftLeft', 'ShiftRight'
	].includes(event.code)) {
		event.preventDefault();
		flyNavigation.keys.add(event.code);
	}
});

window.addEventListener('keyup', event => {
	flyNavigation.keys.delete(event.code);
});

window.addEventListener('blur', () => {
	if (flyNavigation.active) endFlyNavigation({ button: 2 });
});

function updateFlyNavigation(deltaTime) {
	if (!flyNavigation.active || !controls.enabled || isPlaying) return;

	activeEditorCamera.getWorldDirection(flyForward).normalize();
	flyRight.crossVectors(flyForward, worldUp).normalize();
	flyMovement.set(0, 0, 0);

	if (flyNavigation.keys.has('KeyW')) flyMovement.add(flyForward);
	if (flyNavigation.keys.has('KeyS')) flyMovement.sub(flyForward);
	if (flyNavigation.keys.has('KeyD')) flyMovement.add(flyRight);
	if (flyNavigation.keys.has('KeyA')) flyMovement.sub(flyRight);
	if (flyNavigation.keys.has('KeyE')) flyMovement.add(worldUp);
	if (flyNavigation.keys.has('KeyQ')) flyMovement.sub(worldUp);

	if (flyMovement.lengthSq() > 0) {
		const boost = flyNavigation.keys.has('ShiftLeft') ||
			flyNavigation.keys.has('ShiftRight') ? 4 : 1;
		flyMovement.normalize().multiplyScalar(
			flyNavigation.speed * boost * deltaTime
		);
		activeEditorCamera.position.add(flyMovement);
		updateFlyTarget();
	}
}

controls.addEventListener('start', () => {
	if (activeEditorCamera === editorCamera) {
		return;
	}

	switchBackToPerspective();
});

controls.addEventListener('change', scheduleEditorStateSave);

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

let shiftAtTransformPointerDown = false;

let duplicateTransformDrag = null;

renderer.domElement.addEventListener('pointerdown', (event) => {
	shiftAtTransformPointerDown = event.shiftKey;
}, true);

transformControls.addEventListener(
	'dragging-changed',

	(event) => {
		isTransformDragging = event.value === true;

		if (event.value) {
			didTransformDrag = true;

			if (
				shiftAtTransformPointerDown &&
				selectedActorObject &&
				selectedActorObject.userData.actorType !== 'World'
			) {
				const target = transformControls.object;
				duplicateTransformDrag = target ? {
					target,
					position: target.position.clone(),
					quaternion: target.quaternion.clone(),
					scale: target.scale.clone()
				} : null;
			}

			controls.enabled = false;

			return;
		}

		controls.enabled = !isPlaying;

		if (duplicateTransformDrag) {
			const { target, position, quaternion, scale } = duplicateTransformDrag;
			const duplicatedTransform = {
				position: target.position.toArray(),
				rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
				scale: target.scale.toArray()
			};
			target.position.copy(position);
			target.quaternion.copy(quaternion);
			target.scale.copy(scale);
			target.updateMatrixWorld(true);

			if (editorMode === 'actor' && selectedActorObject.userData.componentId) {
				postSceneUpdate('duplicateComponentTransform', {
					componentId: selectedActorObject.userData.componentId,
					...duplicatedTransform
				});
			} else if (selectedActorId) {
				postSceneUpdate('duplicateActorTransform', {
					actorId: selectedActorId,
					...duplicatedTransform
				});
			}

			duplicateTransformDrag = null;
			shiftAtTransformPointerDown = false;
			return;
		}

		shiftAtTransformPointerDown = false;

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

let armedAssetDrop = null;
let assetDropPreview = null;
let assetDropPreviewActor = null;
let assetDragInside = false;

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

window.addEventListener('message', async (event) => {
	const message = event.data;

	switch (message.type) {
		case 'armAssetDrop':
			armedAssetDrop = message.item ?? null;
			if (message.actor) {
				assetDropPreviewActor = message.actor;
				if (assetDropPreview?.userData.assetDropMarker) {
					const position = assetDropPreview.position.clone();
					clearAssetDropPreview();
					createAssetDropPreview();
					assetDropPreview?.position.copy(position);
				}
			}
			if (assetDragInside) createAssetDropPreview();
			break;

		case 'loadScene':
			await loadCustomNodeModules(message.customNodeModules);
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
			try {
				await beginPlay(message.scene);
				vscode.postMessage({
					type: 'playStarted',
					requestId: message.requestId
				});
			} catch (error) {
				reportRuntimeError(error, { phase: 'Scene.beginPlay' });
				vscode.postMessage({
					type: 'playStartFailed',
					requestId: message.requestId,
					message: error instanceof Error ? error.message : String(error)
				});
			}
			break;

		case 'openRuntimeScene':
			try {
				await beginPlay(message.scene);
			} catch (error) {
				reportRuntimeError(error, { phase: 'Scene.open' });
			}
			break;

		case 'pausePlay':
			pausePlay();
			break;

		case 'continuePlay':
			continuePlay();
			break;

		case 'stepPlay':
			stepPlay();
			break;

		case 'stopPlay':
			stopPlay();
			break;
	}
});


function selectActorById(actorId) {
	if (!actorId) {
		clearSelection();
		return;
	}
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
	actor.userData.components = structuredClone(actorData.components ?? []);
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
		data.type === 'collider' ||
		(data.type === 'terrain' && object.userData.terrainRevision !== data.terrainRevision);

	if (needsReplacement) {
		const replacement = createRenderedComponent(data);
		if (!replacement) return;
		initializeRenderedComponent(replacement, actor, data);
		const oldRigGroup = object.userData.rigGroup;
		object.removeFromParent();
		if (data.type === 'terrain') disposeObject(object);
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
		configureLightShadow(object, data);
	}

	if (object.isMesh && ['mesh', 'terrain'].includes(data.type)) {
		object.castShadow = data.castShadow ?? data.type === 'mesh';
		object.receiveShadow = data.receiveShadow ?? true;
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
		case 'terrain':
			return createTerrainMesh(data);
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
	object.userData.terrainRevision = data.terrainRevision;
	applyTransform(object, data);
	if (data.type === 'springArm') configureSpringArm(object, data);
	if (data.type === 'collider') applyColliderHelperTransform(object, data);
}

function createSpringArm(data) {
	const arm = new THREE.Group();
	configureSpringArm(arm, data);
	return arm;
}

function createTerrainMesh(data) {
	const source = data.resolvedTerrain?.geometry;
	if (!source?.positions || !source?.indices) {
		const empty = new THREE.Group();
		empty.userData.terrainError = data.terrainError ?? 'Terrain asset is not generated';
		return empty;
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(source.positions, 3));
	if (source.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(source.normals, 3));
	if (source.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(source.uvs, 2));
	geometry.setIndex(new THREE.BufferAttribute(source.indices, 1));
	if (!source.normals) geometry.computeVertexNormals();
	geometry.computeBoundingSphere();
	const mesh = new THREE.Mesh(
		geometry,
		createTerrainGraphMaterial(
			data.resolvedTerrain?.material,
			source,
			false,
			createTerrainFallbackMaterial
		)
	);
	mesh.castShadow = data.castShadow ?? false;
	mesh.receiveShadow = data.receiveShadow ?? true;
	mesh.userData.terrainData = source;
	return mesh;
}

function createTerrainFallbackMaterial(source, wireframe = false) {
	const checker = textureLoader.load(window.INFINITE_ASSETS.checkerTexture);
	checker.colorSpace = THREE.SRGBColorSpace;
	checker.wrapS = THREE.RepeatWrapping;
	checker.wrapT = THREE.RepeatWrapping;
	checker.userData.terrainFallback = true;
	checker.repeat.set(
		Math.max(1, (source.width ?? 100) / 6.4),
		Math.max(1, (source.depth ?? 100) / 6.4)
	);
	checker.needsUpdate = true;

	return new THREE.MeshStandardMaterial({
		map: checker,
		roughness: 0.9,
		wireframe
	});
}

function updateSpringArms(root, deltaTime = 1 / 60) {
	root.updateMatrixWorld(true);

	root.traverse((arm) => {
		if (!arm.userData.springArm) return;

		const position = new THREE.Vector3().fromArray(
			arm.userData.springArmPosition ?? [0, 0, 0]
		);
		const rotation = arm.userData.springArmRotation ?? [0, 0, 0];
		const quaternion = new THREE.Quaternion().setFromEuler(
			new THREE.Euler(
				rotation[0] ?? 0,
				rotation[1] ?? 0,
				rotation[2] ?? 0,
				'YXZ'
			)
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
		const fullDistance = socket.length();
		let targetDistance = fullDistance;

		if (
			arm.userData.springArmCollisionTest !== false &&
			physicsRuntime?.ready
		) {
			arm.updateWorldMatrix(true, false);
			const origin = arm.getWorldPosition(new THREE.Vector3());
			const target = arm.localToWorld(socket.clone());
			const hitDistance = physicsRuntime.castSpringArm(
				origin,
				target,
				0.25,
				arm.userData.actorObject
			);

			if (hitDistance !== null) {
				targetDistance = Math.max(0, hitDistance - 0.05);
			}

			const current = Number.isFinite(arm.userData.springArmCurrentDistance)
				? arm.userData.springArmCurrentDistance
				: fullDistance;
			// Retract quickly to avoid clipping, but extend more gently so small
			// changes in terrain contacts do not make the camera pop or vibrate.
			const response = targetDistance < current ? 30 : 8;
			const alpha = 1 - Math.exp(
				-response * Math.min(Math.max(deltaTime, 0), 0.1)
			);
			arm.userData.springArmCurrentDistance = THREE.MathUtils.lerp(
				current,
				targetDistance,
				alpha
			);

			if (fullDistance > 1e-6) {
				socket.multiplyScalar(
					arm.userData.springArmCurrentDistance / fullDistance
				);
			}
		} else {
			arm.userData.springArmCurrentDistance = fullDistance;
		}

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
	arm.userData.springArmCollisionTest = data.collisionTest !== false;
	arm.userData.springArmCurrentDistance = undefined;
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

function restoreEditorState(state) {
	if (!state?.camera) return;
	restoringEditorState = true;

	try {
		const views = {
			perspective: switchBackToPerspective,
			top: switchToTopView,
			bottom: switchToBottomView,
			front: switchToFrontView,
			back: switchToBackView,
			left: switchToLeftView,
			right: switchToRightView
		};
		(views[state.camera.view] ?? views.perspective)();

		if (state.camera.position?.length === 3) {
			activeEditorCamera.position.fromArray(state.camera.position);
		}
		if (state.camera.quaternion?.length === 4) {
			activeEditorCamera.quaternion.fromArray(state.camera.quaternion);
		}
		if (state.camera.target?.length === 3) {
			controls.target.fromArray(state.camera.target);
		}
		if (Number.isFinite(state.camera.flySpeed)) {
			flyNavigation.speed = THREE.MathUtils.clamp(
				state.camera.flySpeed,
				0.25,
				250
			);
			if (cameraSpeed) {
				const matching = [...cameraSpeed.options].find(option =>
					Number(option.value) === flyNavigation.speed
				);
				if (matching) cameraSpeed.value = matching.value;
			}
		}

		const transform = state.transform ?? {};
		if (['translate', 'rotate', 'scale'].includes(transform.mode)) {
			setTransformMode(transform.mode);
		}
		if (['world', 'local'].includes(transform.space)) {
			transformControls.setSpace(transform.space);
			updateTransformSpaceButton(transform.space);
		}

		const translationSnap = Number(transform.translationSnap);
		const hasTranslationSnap = Number.isFinite(translationSnap) &&
			translationSnap > 0;
		translationSnapButton.classList.toggle('active', hasTranslationSnap);
		if (hasTranslationSnap) translationSnapValue.value = String(translationSnap);
		updateTranslationSnap();

		const rotationSnap = Number(transform.rotationSnap);
		const hasRotationSnap = Number.isFinite(rotationSnap) && rotationSnap > 0;
		rotationSnapButton.classList.toggle('active', hasRotationSnap);
		if (hasRotationSnap) rotationSnapValue.value = String(rotationSnap);
		updateRotationSnap();

		activeEditorCamera.updateProjectionMatrix();
		controls.update();
	} finally {
		restoringEditorState = false;
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
	prepareUIEventNodes(sceneData);

	// Rebuild actors and components.
	buildActorHierarchy(sceneData, editorActorRoot, true);
	initializeEditorScriptRuntimes(sceneData);

	// Locate the Environment Actor.
	const environment = sceneData.actors?.find((actor) => actor.type === 'Environment');

	// Apply sky, sun, ambient light and fog.
	editorEnvironment.setEnvironment(environment ?? null);

	if (editorMode === 'scene') restoreEditorState(sceneData.editorState);
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
	if (event.button !== 0 || isPlaying || isTransformDragging) {
		return;
	}

	pointerDownX = event.clientX;

	pointerDownY = event.clientY;
});

renderer.domElement.addEventListener('pointerup', (event) => {
	if (event.button !== 0 || isPlaying) {
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

const ASSET_DROP_MIME = 'application/vnd.infinite.asset';

function readDroppedAsset(dataTransfer) {
	let raw = dataTransfer?.getData(ASSET_DROP_MIME) ?? '';
	if (!raw) {
		raw = dataTransfer?.getData('text/plain') ?? '';
		const prefix = 'infinite-asset:';
		if (!raw.startsWith(prefix)) return null;
		raw = raw.slice(prefix.length);
	}
	try {
		const item = JSON.parse(raw);
		return item?.kind === 'asset' && item.type === 'actor' ? item : null;
	} catch {
		return null;
	}
}

function sceneDropPosition(clientX, clientY) {
	const rect = renderer.domElement.getBoundingClientRect();
	pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
	pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
	raycaster.setFromCamera(pointer, activeEditorCamera);

	const hit = raycaster.intersectObjects(editorActorRoot.children, true)
		.find(entry => entry.object.visible);
	if (hit) return hit.point.toArray();

	const point = new THREE.Vector3();
	return raycaster.ray.intersectPlane(
		new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
		point
	)?.toArray() ?? controls.target.toArray();
}

function postAssetDrop(item, clientX, clientY) {
	if (!item || isPlaying || editorMode !== 'scene') return;
	postSceneUpdate('assetDrop', {
		item,
		position: sceneDropPosition(clientX, clientY)
	});
}

function clearAssetDropPreview() {
	if (!assetDropPreview) return;
	assetDropPreview.removeFromParent();
	disposeObject(assetDropPreview);
	assetDropPreview = null;
}

function createAssetDropPreview() {
	if (assetDropPreview || isPlaying || editorMode !== 'scene') return;
	if (!assetDropPreviewActor) {
		const material = new THREE.MeshBasicMaterial({
			color: 0x35d7ff,
			transparent: true,
			opacity: 0.9,
			side: THREE.DoubleSide,
			depthTest: false
		});
		assetDropPreview = new THREE.Group();
		assetDropPreview.userData.assetDropMarker = true;
		const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 48), material);
		ring.rotation.x = -Math.PI / 2;
		ring.renderOrder = 10000;
		const stem = new THREE.Mesh(
			new THREE.CylinderGeometry(0.035, 0.035, 2, 10),
			material.clone()
		);
		stem.position.y = 1;
		stem.renderOrder = 10000;
		assetDropPreview.add(ring, stem);
		editorScene.add(assetDropPreview);
		return;
	}
	assetDropPreview = createActor(assetDropPreviewActor);
	assetDropPreview.name = 'Actor Placement Preview';
	assetDropPreview.traverse(object => {
		object.raycast = () => {};
		if (!object.material) return;
		const materials = Array.isArray(object.material)
			? object.material
			: [object.material];
		object.material = materials.map(material => {
			const preview = material.clone();
			preview.transparent = true;
			preview.opacity = 0.45;
			preview.depthWrite = false;
			return preview;
		});
		if (object.material.length === 1) object.material = object.material[0];
	});
	editorScene.add(assetDropPreview);
}

function updateAssetDropPreview(clientX, clientY) {
	if (!assetDropPreview) return;
	assetDropPreview.position.fromArray(sceneDropPosition(clientX, clientY));
	assetDropPreview.updateMatrixWorld(true);
}

window.addEventListener('dragover', event => {
	const acceptsAsset = armedAssetDrop ||
		[...(event.dataTransfer?.types ?? [])].includes(ASSET_DROP_MIME);
	if (!acceptsAsset) return;
	event.preventDefault();
	if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	assetDragInside = true;
	createAssetDropPreview();
	updateAssetDropPreview(event.clientX, event.clientY);
}, true);

window.addEventListener('drop', event => {
	const item = readDroppedAsset(event.dataTransfer) ?? armedAssetDrop;
	if (!item) return;
	event.preventDefault();
	event.stopPropagation();
	armedAssetDrop = null;
	assetDragInside = false;
	assetDropPreviewActor = null;
	clearAssetDropPreview();
	postAssetDrop(item, event.clientX, event.clientY);
}, true);

window.addEventListener('dragleave', event => {
	if (event.relatedTarget) return;
	assetDragInside = false;
	clearAssetDropPreview();
}, true);

// VS Code may terminate a tree drag at the webview boundary without exposing
// its DataTransfer. Match the Visual Script editor's armed-drag fallback.
window.addEventListener('mouseup', event => {
	if (event.button !== 0 || !armedAssetDrop) return;
	const item = armedAssetDrop;
	armedAssetDrop = null;
	assetDragInside = false;
	assetDropPreviewActor = null;
	clearAssetDropPreview();
	postAssetDrop(item, event.clientX, event.clientY);
}, true);

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

function editorCameraViewName(camera) {
	if (camera === topCamera) return 'top';
	if (camera === bottomCamera) return 'bottom';
	if (camera === leftCamera) return 'left';
	if (camera === rightCamera) return 'right';
	if (camera === frontCamera) return 'front';
	if (camera === backCamera) return 'back';
	return 'perspective';
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

	if (viewportView) viewportView.value = editorCameraViewName(camera);

	resize();
	scheduleEditorStateSave();
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
	disposeGameplayRuntime();
	runtimeErrorReported = false;
	transformControls.detach();
	transformHelper.visible = false;
	try {
	disposeAnimationStates();

	for (const [root, listener] of animationEndListeners) {
		const mixer = animationMixers.get(root);

		mixer?.removeEventListener('finished', listener);
	}

	animationEndListeners.clear();

	animationMixers.clear();

	prepareRuntimeMeshAssets(sceneData);
	iugRuntime.load(sceneData.runtimeAssets);

	// Register generated nodes before the scripts
	// are instantiated or evaluated.
	prepareanimationStateNodes(sceneData);
	prepareUIEventNodes(sceneData);

	gameplayEnvironment.setEnvironment(null);

	clearRoot(gameplayActorRoot);
	buildActorHierarchy(sceneData, gameplayActorRoot);

	physicsRuntime?.dispose();
	physicsRuntime = new IEPhysicsRuntime(gameplayActorRoot);
	await physicsRuntime.initialize();
	console.log('[IE Physics] Rapier world initialized');

	const environment = sceneData.actors?.find((actor) => actor.type === 'Environment');

	gameplayEnvironment.setEnvironment(environment ?? null);

	lastFrameTime = performance.now();
	isPlaying = true;
	isPaused = false;
	engine.setInputMode('Game Only');

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
	} catch (error) {
		disposeGameplayRuntime();
		throw error;
	}
}

function pausePlay() {
	if (!isPlaying) {
		return;
	}

	isPaused = true;
	clearGameplayInput();
	engine.showMouse();
}

function continuePlay() {
	if (!isPlaying) {
		return;
	}

	isPaused = false;
	engine.setInputMode(gameplayInputMode);
}

function stepPlay() {
	if (!isPlaying || !isPaused) return;
	for (const runtime of scriptRuntimes) {
		try {
			runtime.update(1 / 60);
		} catch (error) {
			reportRuntimeError(error, error.ieRuntimeContext ?? { phase: 'VisualScript.step' });
			break;
		}
	}
}

function stopPlay() {
	disposeGameplayRuntime();
}

function disposeGameplayRuntime() {

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
	engine.showMouse();
	gameplayInputMode = 'gameOnly';
	iugRuntime.setInputEnabled(false);
	for (const runtime of scriptRuntimes) {
		runtime.stop();
	}
	scriptRuntimes = [];
	physicsRuntime?.dispose();
	physicsRuntime = null;

	gameplayEnvironment.setEnvironment(null);

	clearRoot(gameplayActorRoot);
	runtimeMeshAssets.clear();
	iugRuntime.clear();

	gameplayCamera = undefined;

	activeScene = editorScene;

	activeCamera = activeEditorCamera;

	controls.enabled = true;

	isPlaying = false;

	isPaused = false;
	runtimeErrorReported = false;


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

			case 'terrain':
				object = createTerrainMesh(component);
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

function configureLightShadow(light, component) {
	light.castShadow = component.castShadow ?? false;
	if (!light.shadow) return light;

	const shadowMapSize = light.isDirectionalLight ? 4096 : 2048;
	light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
	light.shadow.bias = -0.0002;
	light.shadow.normalBias = 0.02;
	light.shadow.radius = 2;

	if (light.shadow.camera) {
		light.shadow.camera.near = 0.1;
		const distance = Number(component.distance);
		light.shadow.camera.far = Number.isFinite(distance) && distance > 0
			? Math.max(10, distance)
			: 500;
		light.shadow.camera.updateProjectionMatrix();
	}

	return light;
}

function createPointLightActor(component) {
	const light = new THREE.PointLight(
		component.color ?? '#ffffff',
		component.intensity ?? 1,
		component.distance ?? 0,
		component.decay ?? 2
	);

	configureLightShadow(light, component);
	light.layers.set(WORLD_LAYER);

	return light;
}

function createDirectionalLightActor(component) {
	const light = new THREE.DirectionalLight(component.color ?? '#ffffff', component.intensity ?? 1);

	configureLightShadow(light, component);

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

	light.shadow.radius = 2;

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

	configureLightShadow(light, component);
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

	mesh.castShadow = component.castShadow ?? true;
	mesh.receiveShadow = component.receiveShadow ?? true;

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
				if (material.map?.userData.terrainFallback) material.map.dispose();
				material.dispose();
			}
		} else {
			if (child.material?.map?.userData.terrainFallback) child.material.map.dispose();
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
	iugRuntime.resize(width, height);

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

function setTransformMode(mode) {
	transformControls.setMode(mode);
	for (const button of viewportToolbar.querySelectorAll('.transform-mode')) {
		button.classList.toggle('active', button.dataset.mode === mode);
	}
	scheduleEditorStateSave();
}

viewportToolbar.addEventListener('pointerdown', event => {
	event.stopPropagation();
});

viewportView?.addEventListener('change', () => {
	const views = {
		perspective: switchBackToPerspective,
		top: switchToTopView,
		bottom: switchToBottomView,
		front: switchToFrontView,
		back: switchToBackView,
		left: switchToLeftView,
		right: switchToRightView
	};
	views[viewportView.value]?.();
	scheduleEditorStateSave();
});

for (const button of viewportToolbar.querySelectorAll('.transform-mode')) {
	button.addEventListener('click', () => setTransformMode(button.dataset.mode));
}

transformSpaceButton?.addEventListener('click', () => {
	const space = transformControls.space === 'world' ? 'local' : 'world';
	transformControls.setSpace(space);
	updateTransformSpaceButton(space);
	scheduleEditorStateSave();
});

function updateTransformSpaceButton(space) {
	const label = space === 'world' ? 'World' : 'Local';
	const icon = transformSpaceButton.querySelector('ion-icon');
	if (icon) icon.name = space === 'world' ? 'globe-outline' : 'cube-outline';
	transformSpaceButton.title = `Transform space: ${label}`;
	transformSpaceButton.setAttribute('aria-label', `Transform space: ${label}`);
	transformSpaceButton.classList.toggle('active', space === 'local');
}

function updateTranslationSnap() {
	const enabled = translationSnapButton.classList.contains('active');
	transformControls.setTranslationSnap(
		enabled ? Number(translationSnapValue.value) : null
	);
	scheduleEditorStateSave();
}

translationSnapButton?.addEventListener('click', () => {
	translationSnapButton.classList.toggle('active');
	updateTranslationSnap();
});

translationSnapValue?.addEventListener('change', updateTranslationSnap);

function updateRotationSnap() {
	const enabled = rotationSnapButton.classList.contains('active');
	transformControls.setRotationSnap(
		enabled ? THREE.MathUtils.degToRad(Number(rotationSnapValue.value)) : null
	);
	scheduleEditorStateSave();
}

rotationSnapButton?.addEventListener('click', () => {
	rotationSnapButton.classList.toggle('active');
	updateRotationSnap();
});

rotationSnapValue?.addEventListener('change', updateRotationSnap);

cameraSpeed?.addEventListener('change', () => {
	flyNavigation.speed = Number(cameraSpeed.value);
	cameraSpeed.title = `Fly camera speed: ${flyNavigation.speed}`;
	scheduleEditorStateSave();
});

window.addEventListener('keydown', (event) => {
	if (isPlaying || flyNavigation.active || !selectedActorObject) {
		return;
	}

	const target =
		(event.target);

	if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
		return;
	}

	switch (event.key.toLowerCase()) {
		case 'w':
			setTransformMode('translate');
			break;

		case 'e':
			setTransformMode('rotate');
			break;

		case 'r':
			setTransformMode('scale');
			break;
	}
});

function applyFootIK(deltaTime) {
	for (const constraint of pendingFootIK) {
		const { actor, bone, state } = constraint;
		const lowerLeg = bone?.parent;
		const upperLeg = lowerLeg?.parent;
		if (
			!actor?.isObject3D ||
			!bone?.isBone ||
			!lowerLeg?.isBone ||
			!upperLeg?.isBone
		) continue;

		actor.updateWorldMatrix(true, true);
		const animatedPosition = bone.getWorldPosition(new THREE.Vector3());
		const animatedRotation = bone.getWorldQuaternion(new THREE.Quaternion());
		const origin = animatedPosition.clone();
		origin.y += constraint.traceHeight;
		const contact = physicsRuntime?.getGroundContact(
			actor,
			origin,
			constraint.traceHeight + constraint.traceDistance
		);

		state.isGrounded = Boolean(contact);
		if (!contact) {
			state.position = null;
			state.normal.set(0, 1, 0);
			continue;
		}

		const targetPosition = new THREE.Vector3(
			contact.point.x,
			contact.point.y,
			contact.point.z
		);
		const targetNormal = new THREE.Vector3(
			contact.normal.x,
			contact.normal.y,
			contact.normal.z
		).normalize();
		targetPosition.addScaledVector(targetNormal, constraint.footOffset);

		const response = constraint.smoothing > 0
			? 1 - Math.exp(-constraint.smoothing * deltaTime)
			: 1;
		state.position ??= animatedPosition.clone();
		state.position.lerp(targetPosition, response);
		state.normal.lerp(targetNormal, response).normalize();

		// Reach the contact by rotating the upper and lower leg. Translating the
		// foot bone itself breaks the skeleton chain and visibly detaches the foot.
		const hipPosition = upperLeg.getWorldPosition(new THREE.Vector3());
		const kneePosition = lowerLeg.getWorldPosition(new THREE.Vector3());
		const anklePosition = animatedPosition.clone();
		const upperLength = hipPosition.distanceTo(kneePosition);
		const lowerLength = kneePosition.distanceTo(anklePosition);
		if (upperLength < 1e-5 || lowerLength < 1e-5) continue;

		const positionWeight = THREE.MathUtils.clamp(
			constraint.positionWeight,
			0,
			1
		);
		const requestedAnkle = anklePosition.clone().lerp(
			state.position,
			positionWeight
		);
		const hipToTarget = requestedAnkle.clone().sub(hipPosition);
		const requestedDistance = hipToTarget.length();
		if (requestedDistance < 1e-5) continue;

		const targetDirection = hipToTarget.multiplyScalar(1 / requestedDistance);
		const minimumReach = Math.abs(upperLength - lowerLength) + 1e-4;
		const maximumReach = upperLength + lowerLength - 1e-4;
		const reach = THREE.MathUtils.clamp(
			requestedDistance,
			minimumReach,
			maximumReach
		);
		const solvedAnkle = hipPosition.clone().addScaledVector(
			targetDirection,
			reach
		);

		// Keep the knee on the animation's current bend side so the leg cannot
		// suddenly flip when the target crosses the chain's straight line.
		const hipToKnee = kneePosition.clone().sub(hipPosition);
		const bendDirection = hipToKnee.clone().addScaledVector(
			targetDirection,
			-hipToKnee.dot(targetDirection)
		);
		if (bendDirection.lengthSq() < 1e-8) {
			const fallbackAxis = Math.abs(targetDirection.y) < 0.9
				? new THREE.Vector3(0, 1, 0)
				: new THREE.Vector3(1, 0, 0);
			bendDirection.crossVectors(targetDirection, fallbackAxis);
		}
		bendDirection.normalize();

		const kneeAlong = (
			reach * reach +
			upperLength * upperLength -
			lowerLength * lowerLength
		) / (2 * reach);
		const kneeAway = Math.sqrt(Math.max(
			0,
			upperLength * upperLength - kneeAlong * kneeAlong
		));
		const solvedKnee = hipPosition.clone()
			.addScaledVector(targetDirection, kneeAlong)
			.addScaledVector(bendDirection, kneeAway);

		const rotateBoneToward = (joint, from, to) => {
			const currentDirection = from.clone().normalize();
			const desiredDirection = to.clone().normalize();
			const worldRotation = joint.getWorldQuaternion(new THREE.Quaternion());
			const rotationDelta = new THREE.Quaternion().setFromUnitVectors(
				currentDirection,
				desiredDirection
			);
			const desiredWorldRotation = rotationDelta.multiply(worldRotation);
			const parentWorldRotation = joint.parent.getWorldQuaternion(
				new THREE.Quaternion()
			);
			joint.quaternion.copy(
				parentWorldRotation.invert().multiply(desiredWorldRotation)
			);
			joint.updateWorldMatrix(false, true);
		};

		rotateBoneToward(
			upperLeg,
			kneePosition.clone().sub(hipPosition),
			solvedKnee.clone().sub(hipPosition)
		);
		const rotatedKnee = lowerLeg.getWorldPosition(new THREE.Vector3());
		const rotatedAnkle = bone.getWorldPosition(new THREE.Vector3());
		rotateBoneToward(
			lowerLeg,
			rotatedAnkle.sub(rotatedKnee),
			solvedAnkle.sub(rotatedKnee)
		);

		bone.parent.updateWorldMatrix(true, false);
		// Apply only the terrain slope delta to the animated pose. Skeletons
		// such as Mixamo do not use a foot bone's local Y axis as the sole
		// normal, so aligning that local axis directly causes severe twisting.
		const alignment = new THREE.Quaternion().setFromUnitVectors(
			new THREE.Vector3(0, 1, 0),
			state.normal
		);
		const targetWorldRotation = alignment.multiply(animatedRotation);
		const parentWorldRotation = bone.parent.getWorldQuaternion(
			new THREE.Quaternion()
		);
		const targetLocalRotation = parentWorldRotation
			.invert()
			.multiply(targetWorldRotation);
		bone.quaternion.slerp(
			targetLocalRotation,
			THREE.MathUtils.clamp(constraint.rotationWeight, 0, 1)
		);
		bone.updateWorldMatrix(false, true);
	}
}

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
		pendingFootIK = [];
		// Execute visual script graphs first.
		// They may update Animation State parameters.
		for (const runtime of scriptRuntimes) {
			try {
				runtime.update(deltaTime);
			} catch (error) {
				reportRuntimeError(error, error.ieRuntimeContext ?? {
					phase: 'VisualScript.update'
				});
				break;
			}
		}

		gameplayMouse.delta[0] = 0;
		gameplayMouse.delta[1] = 0;
		gameplayMouse.wheel = 0;

		try {
			physicsRuntime?.update(deltaTime);
		} catch (error) {
			reportRuntimeError(error, { phase: 'Physics.update' });
		}

		// Ordinary animation.play nodes.
		for (const mixer of animationMixers.values()) {
			mixer.update(deltaTime);
		}

		// Animation State machines.
		for (const entry of animationStateRuntimes.values()) {
			try {
				entry.runtime.update(deltaTime);
			} catch (error) {
				reportRuntimeError(error, {
					phase: 'AnimationState.update',
					actor: entry.actor?.name,
					actorId: entry.actor?.userData?.actorId
				});
				break;
			}
		}

		applyFootIK(deltaTime);
	}

	if (!isPlaying && controls.enabled) {
		updateFlyNavigation(deltaTime);
		controls.update();
	}

	updateSpringArms(
		isPlaying ? gameplayActorRoot : editorActorRoot,
		deltaTime
	);

	if (!isPlaying) {
		updateEditorHelpers();
		updateViewGizmo();
	}

	// Keep the environment sun's finite shadow volume centered on the active
	// editor or gameplay camera instead of leaving it behind at world origin.
	(isPlaying ? gameplayEnvironment : editorEnvironment).followCamera(
		activeCamera
	);

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
