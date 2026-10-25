// @ts-nocheck

import * as THREE from 'three';
import { OrbitControls } from
    'three/addons/controls/OrbitControls.js';

const vscode = acquireVsCodeApi();
const postGraphUpdate = (action, payload = {}) => vscode.postMessage({
    type: 'onGraphUpdate', action, ...payload
});
const $ = id => document.getElementById(id);

const viewport = $('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#17191d');

const camera = new THREE.PerspectiveCamera(
    50, 1, 0.01, 1000
);
camera.position.set(2, 2, 4);

const renderer = new THREE.WebGLRenderer({
    antialias: true
});

renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, 2)
);
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(
    camera,
    renderer.domElement
);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(
    0xffffff, 0x555577, 2
));

const light = new THREE.DirectionalLight(
    0xffffff, 3
);
light.position.set(5, 8, 6);
scene.add(light);

scene.add(new THREE.GridHelper(
    20, 20, 0x353942, 0x262a30
));

let asset = null;
let tracks = [];
let actorRoot = null;
let mixer = null;
let action = null;
let clip = null;

let currentTime = 0;
let playing = false;
let dirty = false;
let selectedKey = null;
let saving = false;

const clock = new THREE.Clock();

function setStatus(message) {
    $('status').textContent = message;
}

function duration() {
    return Math.max(0, Number(asset?.data?.duration) || 0);
}

function setDirty(value) {
    dirty = value;
    $('save').disabled = !dirty || saving;
}

function formatTime(value) {
    return `${Number(value).toFixed(2)}s`;
}

function updatePlaybackUI() {
    const playIcon = $('play').querySelector('ion-icon');
    if (playIcon) playIcon.name = playing ? 'pause' : 'play';
    $('time-label').textContent =
        `${formatTime(currentTime)} / ${formatTime(duration())}`;

    $('scrubber').max = String(Math.max(duration(), 0.001));
    $('scrubber').value = String(currentTime);
}

function createSkeleton(data) {
    const objects = new Map();
    const roots = [];

    for (const node of data.nodes ?? []) {
        const object = node.isBone
            ? new THREE.Bone()
            : new THREE.Object3D();

        object.name = node.name || node.id;
        object.userData.sourceUUID = node.sourceUUID;

        object.position.fromArray(
            node.position ?? [0, 0, 0]
        );
        object.quaternion.fromArray(
            node.quaternion ?? [0, 0, 0, 1]
        );
        object.scale.fromArray(
            node.scale ?? [1, 1, 1]
        );

        objects.set(node.id, object);
    }

    for (const node of data.nodes ?? []) {
        const object = objects.get(node.id);

        if (node.parentId) {
            const parent = objects.get(node.parentId);

            if (!parent) {
                throw new Error('Missing skeleton parent');
            }

            parent.add(object);
        } else {
            roots.push(object);
        }
    }

    const bones = data.bones.map(id => objects.get(id));

    if (bones.some(bone => !bone?.isBone)) {
        throw new Error('Invalid skeleton bone reference');
    }

    const inverses = data.boneInverses.map(
        values => new THREE.Matrix4().fromArray(values)
    );

    return {
        roots,
        skeleton: new THREE.Skeleton(bones, inverses)
    };
}

function createPreviewMesh(component) {
    const data = component.resolvedGeometry;

    if (!data || data.type !== 'buffer') return null;

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(data.positions, 3)
    );

    if (data.normals?.length) {
        geometry.setAttribute(
            'normal',
            new THREE.Float32BufferAttribute(data.normals, 3)
        );
    } else {
        geometry.computeVertexNormals();
    }

    if (data.indices?.length) {
        geometry.setIndex(data.indices);
    }

    if (data.skinIndices?.length && data.skinWeights?.length) {
        geometry.setAttribute(
            'skinIndex',
            new THREE.Uint16BufferAttribute(
                data.skinIndices, 4
            )
        );

        geometry.setAttribute(
            'skinWeight',
            new THREE.Float32BufferAttribute(
                data.skinWeights, 4
            )
        );
    }

    // Neutral material in v1.
    // The preview is intended for inspecting deformation.
    const material = new THREE.MeshStandardMaterial({
        color: 0xb4bed4,
        roughness: 0.75,
        metalness: 0,
        side: THREE.DoubleSide,
        skinning: undefined
    });

    let mesh;

    if (component.skinned && component.resolvedSkeleton) {
        const rig = createSkeleton(component.resolvedSkeleton);

        mesh = new THREE.SkinnedMesh(
            geometry, material
        );

        for (const root of rig.roots) {
            actorRoot.add(root);
        }

        const bindMatrix = new THREE.Matrix4();

        if (component.bindMatrix?.length === 16) {
            bindMatrix.fromArray(component.bindMatrix);
        }

        mesh.bindMode = component.bindMode ?? 'attached';
        mesh.bind(rig.skeleton, bindMatrix);
        mesh.normalizeSkinWeights();
    } else {
        mesh = new THREE.Mesh(geometry, material);
    }

    const transform = component.transform ?? component;

    mesh.position.fromArray(
        transform.position ?? [0, 0, 0]
    );

    if (Array.isArray(transform.quaternion)) {
        mesh.quaternion.fromArray(transform.quaternion);
    } else {
        const rotation = transform.rotation ?? [0, 0, 0];
        mesh.rotation.set(...rotation);
    }

    mesh.scale.fromArray(
        transform.scale ?? [1, 1, 1]
    );

    mesh.name = component.name ?? 'Mesh';

    return mesh;
}

function disposeActor() {
    if (mixer) {
        mixer.stopAllAction();

        if (actorRoot) {
            mixer.uncacheRoot(actorRoot);
        }
    }

    mixer = null;
    action = null;
    clip = null;
    playing = false;

    if (actorRoot) {
        scene.remove(actorRoot);

        actorRoot.traverse(object => {
            if (object.isMesh) {
                object.geometry.dispose();

                if (Array.isArray(object.material)) {
                    object.material.forEach(m => m.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
    }

    actorRoot = null;
}

function loadPreviewActor(actor) {
    disposeActor();

    actorRoot = new THREE.Group();
    actorRoot.name = actor.name ?? 'Preview Actor';

    const transform = actor.components?.find(
        component => component.type === 'transform'
    );

    if (transform) {
        actorRoot.position.fromArray(
            transform.position ?? [0, 0, 0]
        );
        actorRoot.scale.fromArray(
            transform.scale ?? [1, 1, 1]
        );

        const rotation = transform.rotation ?? [0, 0, 0];
        actorRoot.rotation.set(...rotation);
    }

    for (const component of actor.components ?? []) {
        if (component.type !== 'mesh') continue;

        const mesh = createPreviewMesh(component);

        if (mesh) actorRoot.add(mesh);
    }

    scene.add(actorRoot);
    actorRoot.updateMatrixWorld(true);

    $('actor-name').textContent = actorRoot.name;

    const bounds = new THREE.Box3().setFromObject(actorRoot);

    if (!bounds.isEmpty()) {
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());

        const distance = Math.max(
            size.length() * 1.25, 1.5
        );

        controls.target.copy(center);

        camera.position.copy(center).add(
            new THREE.Vector3(1, 0.6, 1)
                .normalize()
                .multiplyScalar(distance)
        );

        camera.near = Math.max(distance / 1000, 0.001);
        camera.far = Math.max(distance * 100, 1000);
        camera.updateProjectionMatrix();
        controls.update();
    }

    rebuildClip();
    setStatus(`Preview Actor: ${actorRoot.name}`);
}

function mapTrackTarget(trackName) {
    const dot = trackName.indexOf('.');

    if (dot < 0 || !actorRoot) return trackName;

    const target = trackName.slice(0, dot);
    const property = trackName.slice(dot);

    let found = null;

    actorRoot.traverse(object => {
        if (
            object.userData.sourceUUID === target ||
            object.name === target
        ) {
            found ??= object;
        }
    });

    return found
        ? found.uuid + property
        : trackName;
}

function createTrack(data) {
    const classes = {
        NumberKeyframeTrack: THREE.NumberKeyframeTrack,
        VectorKeyframeTrack: THREE.VectorKeyframeTrack,
        QuaternionKeyframeTrack:
            THREE.QuaternionKeyframeTrack,
        ColorKeyframeTrack: THREE.ColorKeyframeTrack,
        BooleanKeyframeTrack: THREE.BooleanKeyframeTrack,
        StringKeyframeTrack: THREE.StringKeyframeTrack
    };

    const Track = classes[data.type];

    if (!Track) {
        throw new Error(`Unsupported track: ${data.type}`);
    }

    const track = new Track(
        mapTrackTarget(data.name),
        data.times,
        data.values
    );

    if (data.interpolation !== undefined) {
        track.setInterpolation(data.interpolation);
    }

    return track;
}

function rebuildClip() {
    if (mixer) {
        mixer.stopAllAction();

        if (actorRoot) mixer.uncacheRoot(actorRoot);
    }

    mixer = null;
    action = null;
    clip = null;

    if (!asset || !actorRoot) {
        updatePlaybackUI();
        return;
    }

    const animationTracks = tracks.map(createTrack);

    clip = new THREE.AnimationClip(
        asset.name || 'Animation',
        duration(),
        animationTracks,
        asset.data.blendMode ?? THREE.NormalAnimationBlendMode
    );

    mixer = new THREE.AnimationMixer(actorRoot);

    action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();

    seek(currentTime);
}

function seek(time) {
    currentTime = THREE.MathUtils.clamp(
        Number(time) || 0,
        0,
        duration()
    );

    if (mixer) {
        mixer.setTime(currentTime);
    }

    updatePlaybackUI();
}

function drawTracks() {
    const container = $('tracks');
    container.replaceChildren();

    tracks.forEach((track, trackIndex) => {
        const row = document.createElement('div');
        row.className = 'track-row';

        const name = document.createElement('div');
        name.className = 'track-name';
        name.textContent = track.name;

        const lane = document.createElement('div');
        lane.className = 'track-lane';

        track.times.forEach((time, keyIndex) => {
            const key = document.createElement('button');
            key.className = 'keyframe';
            key.title = `${track.name} @ ${formatTime(time)}`;

            const fraction = duration() > 0
                ? time / duration()
                : 0;

            key.style.left =
                `${Math.max(0, Math.min(100, fraction * 100))}%`;

            if (
                selectedKey?.trackIndex === trackIndex &&
                selectedKey?.keyIndex === keyIndex
            ) {
                key.classList.add('selected');
            }

            key.addEventListener('click', () => {
                selectedKey = { trackIndex, keyIndex };

                playing = false;
                seek(time);
                drawTracks();
                drawInspector();
            });

            lane.appendChild(key);
        });

        row.append(name, lane);
        container.appendChild(row);
    });
}

function drawInspector() {
    const container = $('keyframe-fields');
    container.replaceChildren();

    if (!selectedKey) {
        $('selection-info').textContent =
            'Select a keyframe on the timeline.';
        return;
    }

    const { trackIndex, keyIndex } = selectedKey;
    const track = tracks[trackIndex];

    if (!track) return;

    const count = track.times.length;
    const stride = count
        ? track.values.length / count
        : 0;

    if (!Number.isInteger(stride) || stride < 1) {
        $('selection-info').textContent =
            'Unsupported keyframe value layout.';
        return;
    }

    $('selection-info').textContent =
        `${track.name} — ${formatTime(track.times[keyIndex])}`;

    const offset = keyIndex * stride;

    for (let i = 0; i < stride; i++) {
        const label = document.createElement('label');
        label.className = 'value-field';

        const caption = document.createElement('span');

        caption.textContent =
            ['X', 'Y', 'Z', 'W'][i] ?? `Value ${i + 1}`;

        const input = document.createElement('input');
        input.type = 'number';
        input.step = 'any';
        input.value = String(track.values[offset + i]);

        input.addEventListener('change', () => {
            const value = Number(input.value);

            if (!Number.isFinite(value)) return;

            track.values[offset + i] = value;

            // Quaternion tracks must remain normalized.
            if (track.type === 'QuaternionKeyframeTrack') {
                const length = Math.hypot(
                    ...track.values.slice(offset, offset + 4)
                );

                if (length > 0) {
                    for (let j = 0; j < 4; j++) {
                        track.values[offset + j] /= length;
                    }
                }
            }

            setDirty(true);
            rebuildClip();
            drawInspector();
        });

        label.append(caption, input);
        container.appendChild(label);
    }
}

function loadAnimation(incoming) {
    asset = structuredClone(incoming);
    tracks = structuredClone(asset.data.tracks);

    selectedKey = null;
    playing = false;
    currentTime = 0;

    $('animation-name').textContent =
        asset.name || 'Animation';

    $('animation-info').textContent =
        `${tracks.length} tracks · ${formatTime(duration())}`;

    drawTracks();
    drawInspector();
    rebuildClip();
    setDirty(false);
    setStatus('Animation loaded');
}

$('choose-actor').addEventListener('click', () => {
    postGraphUpdate('choosePreviewActor');
});

$('play').addEventListener('click', () => {
    if (!action) {
        setStatus('Choose a preview Actor first');
        return;
    }

    playing = !playing;
    updatePlaybackUI();
});

$('stop').addEventListener('click', () => {
    playing = false;
    seek(0);
});

$('scrubber').addEventListener('input', event => {
    playing = false;
    seek(event.target.value);
});

$('save').addEventListener('click', () => {
    if (!asset || !dirty || saving) return;

    saving = true;
    $('save').disabled = true;

    postGraphUpdate('saveTracks', {
        tracks
    });

    setStatus('Saving animation...');
});

window.addEventListener('message', event => {
    const message = event.data;

    switch (message.type) {
        case 'loadAnimation':
            loadAnimation(message.asset);
            break;

        case 'loadPreviewActor':
            loadPreviewActor(message.actor);
            break;

        case 'saved':
            saving = false;
            setDirty(false);
            setStatus('Animation saved');
            break;

        case 'error':
            saving = false;
            setDirty(dirty);
            setStatus(`Error: ${message.message}`);
            console.error(message.message);
            break;
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

new ResizeObserver(resize).observe(viewport);

renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);

    if (playing && mixer && action) {
        const speed = Math.max(
            0.1,
            Number($('speed').value) || 1
        );

        currentTime += dt * speed;

        if (currentTime >= duration()) {
            if ($('loop').checked && duration() > 0) {
                currentTime %= duration();
            } else {
                currentTime = duration();
                playing = false;
            }
        }

        seek(currentTime);
    }

    controls.update();
    renderer.render(scene, camera);
});

resize();
postGraphUpdate('ready');
