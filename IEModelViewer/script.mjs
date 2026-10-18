// @ts-nocheck

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { convertModel } from '../IEAssetConverter.mjs';

const vscode = acquireVsCodeApi();
const postAssetsUpdate = (action, payload = {}) => vscode.postMessage({
    type: 'onAssetsUpdate', action, ...payload
});

const viewport = document.getElementById('viewport');
const modelName = document.getElementById('model-name');
const status = document.getElementById('status');
const createButton = document.getElementById('create-assets');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#181818');

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10000);
camera.position.set(3, 2, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));

const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(5, 10, 7);
scene.add(light);

const grid = new THREE.GridHelper(100, 100, 0x444444, 0x303030);
scene.add(grid);


const loader = new GLTFLoader();

let currentModel = null;
let currentAnimations = [];

let animationMixer = null;
let activeAction = null;
let activeClip = null;
let animationPlaying = false;

const animationClock = new THREE.Clock();

const animationSelect =
    document.getElementById('animation-select');

const animationPlay =
    document.getElementById('animation-play');

const animationStop =
    document.getElementById('animation-stop');

const animationTimeline =
    document.getElementById('animation-timeline');

const animationCurrentTime =
    document.getElementById('animation-current-time');

const animationDuration =
    document.getElementById('animation-duration');


function formatAnimationTime(seconds) {
    if (!Number.isFinite(seconds)) seconds = 0;

    const total = Math.floor(Math.max(0, seconds));
    const minutes = Math.floor(total / 60);
    const remaining = total % 60;

    return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function updateAnimationControls() {
    const hasClip = Boolean(activeClip);

    animationPlay.disabled = !hasClip;
    animationStop.disabled = !hasClip;
    animationTimeline.disabled = !hasClip;

    animationPlay.textContent =
        animationPlaying ? '❚❚' : '▶';

    animationPlay.title =
        animationPlaying
            ? 'Pause animation'
            : 'Play animation';
}

function updateAnimationTimeline() {
    if (!activeClip || !activeAction) {
        animationTimeline.value = '0';
        animationCurrentTime.textContent = '0:00';
        animationDuration.textContent = '0:00';
        return;
    }

    const duration = Math.max(
        0,
        activeClip.duration
    );

    const current = duration > 0
        ? THREE.MathUtils.euclideanModulo(
            activeAction.time,
            duration
        )
        : 0;

    animationTimeline.max =
        String(Math.max(duration, 0.001));

    animationTimeline.value =
        String(current);

    animationCurrentTime.textContent =
        formatAnimationTime(current);

    animationDuration.textContent =
        formatAnimationTime(duration);
}


function stopAnimation() {
    if (!animationMixer || !activeAction) return;

    animationPlaying = false;

    activeAction.reset();
    activeAction.play();

    animationMixer.setTime(0);

    activeAction.paused = true;

    updateAnimationTimeline();
    updateAnimationControls();
}


function selectAnimation(index) {
    if (!animationMixer) return;

    animationMixer.stopAllAction();

    activeClip =
        currentAnimations[index] ?? null;

    activeAction = null;
    animationPlaying = false;

    if (activeClip) {
        activeAction = animationMixer.clipAction(
            activeClip
        );

        activeAction.reset();
        activeAction.setLoop(
            THREE.LoopRepeat,
            Infinity
        );

        activeAction.clampWhenFinished = false;
        activeAction.play();

        animationMixer.setTime(0);

        activeAction.paused = true;
    }

    updateAnimationTimeline();
    updateAnimationControls();
}

function setupAnimations(animations) {
    currentAnimations = animations ?? [];

    animationSelect.innerHTML = '';

    activeAction = null;
    activeClip = null;
    animationPlaying = false;

    if (animationMixer) {
        animationMixer.stopAllAction();
        animationMixer = null;
    }

    if (!currentAnimations.length) {
        animationSelect.add(
            new Option('No animations', '')
        );

        animationSelect.disabled = true;

        updateAnimationTimeline();
        updateAnimationControls();
        return;
    }

    animationMixer = new THREE.AnimationMixer(
        currentModel
    );

    for (
        let i = 0;
        i < currentAnimations.length;
        i++
    ) {
        const clip = currentAnimations[i];

        animationSelect.add(
            new Option(
                clip.name || `Animation ${i + 1}`,
                String(i)
            )
        );
    }

    animationSelect.disabled = false;
    animationSelect.value = '0';

    selectAnimation(0);
}


animationSelect.addEventListener('change', () => {
    const index = Number(animationSelect.value);

    selectAnimation(index);
});

animationPlay.addEventListener('click', () => {
    if (!activeAction || !activeClip) return;

    animationPlaying = !animationPlaying;

    activeAction.paused = !animationPlaying;

    updateAnimationControls();
});

animationStop.addEventListener('click', () => {
    stopAnimation();
});

animationTimeline.addEventListener('input', () => {
    if (!animationMixer || !activeAction || !activeClip) {
        return;
    }

    const time = Number(animationTimeline.value);

    const wasPaused = activeAction.paused;

    activeAction.paused = false;

    // Evaluate the entire mixer at the selected time.
    animationMixer.setTime(time);

    activeAction.paused = wasPaused;

    updateAnimationTimeline();
});



async function loadModel(uri, name) {
    createButton.disabled = true;
    status.textContent = 'Loading model...';

    try {
        const gltf = await loader.loadAsync(uri);

        gltf.scene.traverse(object => {
            if (!object.isMesh) return;

            const materials = Array.isArray(object.material)
                ? object.material
                : [object.material];

            console.log('Mesh:', object.name, {
                attributes: Object.keys(object.geometry.attributes),
                materials: materials.map(material => ({
                    name: material.name,
                    type: material.type,
                    color: material.color?.getHexString(),
                    vertexColors: material.vertexColors,
                    map: material.map?.name,
                    hasMap: !!material.map,
                    opacity: material.opacity,
                    transparent: material.transparent
                }))
            });
        });

        if (currentModel) {
            scene.remove(currentModel);
        }

        if (animationMixer) {
            animationMixer.stopAllAction();

            if (currentModel) {
                animationMixer.uncacheRoot(currentModel);
            }

            animationMixer = null;
        }

        currentModel = gltf.scene;

        scene.add(currentModel);

        setupAnimations(gltf.animations ?? []);

        console.log(
            '[Infinite Engine] Imported animations:',
            currentAnimations.map(clip => ({
                name: clip.name,
                duration: clip.duration,
                tracks: clip.tracks.length
            }))
        );

        const box = new THREE.Box3().setFromObject(currentModel);

        if (!box.isEmpty()) {
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const radius = Math.max(size.length() * 0.5, 0.1);
            const distance = radius / Math.sin(
                THREE.MathUtils.degToRad(camera.fov / 2)
            ) * 1.2;

            controls.target.copy(center);

            camera.position.copy(center).add(
                new THREE.Vector3(1, 0.7, 1)
                    .normalize()
                    .multiplyScalar(distance)
            );

            camera.near = Math.max(distance / 1000, 0.001);
            camera.far = Math.max(distance * 100, 1000);
            camera.updateProjectionMatrix();
        }

        controls.update();
        modelName.textContent = name;
        status.textContent = '';
        createButton.disabled = false;
    } catch (error) {
        status.textContent = 'Unable to load model';

        postAssetsUpdate('error', {
            message: error.message
        });
    }
}


window.addEventListener('message', event => {
    const message = event.data;

    switch (message.type) {
        case 'loadModel':
            loadModel(message.uri, message.name);
            break;

        case 'conversionComplete':
            converting = false;
            createButton.disabled = false;
            status.textContent = `Created ${message.assetCount} IEAssets`;
            break;

        case 'conversionError':
            converting = false;
            createButton.disabled = false;
            status.textContent = `Conversion failed: ${message.error}`;
            console.error(message.error);
            break;
    }
});



let converting = false;

createButton.addEventListener('click', async () => {
    if (!currentModel || converting) return;

    converting = true;
    createButton.disabled = true;
    status.textContent = 'Converting model...';

    try {
        const name = modelName.textContent
            .replace(/\.(glb|gltf)$/i, '');

        const result = await convertModel(currentModel, name, currentAnimations);

        postAssetsUpdate('saveConvertedAssets', {
            modelName: name,
            assets: result.assets
        });

        status.textContent = 'Saving IEAssets...';
    } catch (error) {
        converting = false;
        createButton.disabled = false;
        status.textContent = `Conversion failed: ${error.message}`;
        console.error(error);
    }
});


function resize() {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;

    if (!width || !height) return;

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(viewport);


renderer.setAnimationLoop(() => {
    const delta = Math.min(
        animationClock.getDelta(),
        0.1
    );

    if (
        animationMixer &&
        activeAction &&
        animationPlaying
    ) {
        animationMixer.update(delta);
        updateAnimationTimeline();
    }

    controls.update();

    renderer.render(scene, camera);
});


resize();

postAssetsUpdate('ready');
