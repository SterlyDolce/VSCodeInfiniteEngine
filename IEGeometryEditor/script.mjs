// @ts-nocheck

import * as THREE from 'three';
import { OrbitControls } from
    'three/addons/controls/OrbitControls.js';

const vscode = acquireVsCodeApi();
const postAssetsUpdate = (action, payload = {}) => vscode.postMessage({
    type: 'onAssetsUpdate', action, ...payload
});

const $ = id => document.getElementById(id);

const viewport = $('viewport');
const status = $('status');
const statistics = $('statistics');

const scene = new THREE.Scene();
scene.background = new THREE.Color(
    getComputedStyle(document.documentElement)
        .getPropertyValue('--vscode-editor-background')
        .trim() || '#1e1e1e'
);

const camera = new THREE.PerspectiveCamera(
    60,
    1,
    0.01,
    10000
);

camera.position.set(5, 4, 7);

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false
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
controls.dampingFactor = 0.06;
controls.screenSpacePanning = true;

const grid = new THREE.GridHelper(
    10,
    20,
    0x555555,
    0x333333
);

scene.add(grid);

const ambientLight = new THREE.AmbientLight(
    0xffffff,
    1.2
);

scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(
    0xffffff,
    2
);

directionalLight.position.set(5, 10, 8);
scene.add(directionalLight);

const material = new THREE.MeshStandardMaterial({
    color: 0xb2becd,
    roughness: 0.75,
    metalness: 0,
    side: THREE.DoubleSide
});

let mesh = null;
let geometry = null;
let wireframe = false;
let gridVisible = true;

function setStatus(message) {
    status.textContent = message;
}

function createGeometry(data) {
    if (
        !Array.isArray(data.positions) ||
        data.positions.length === 0 ||
        data.positions.length % 3 !== 0
    ) {
        throw new Error('Invalid geometry positions');
    }

    const result = new THREE.BufferGeometry();

    const positions = new Float32Array(
        data.positions
    );

    result.setAttribute(
        'position',
        new THREE.BufferAttribute(
            positions,
            3
        )
    );

    const vertexCount = positions.length / 3;

    if (
        Array.isArray(data.normals) &&
        data.normals.length === positions.length
    ) {
        result.setAttribute(
            'normal',
            new THREE.Float32BufferAttribute(
                data.normals,
                3
            )
        );
    }

    if (
        Array.isArray(data.uvs) &&
        data.uvs.length === vertexCount * 2
    ) {
        result.setAttribute(
            'uv',
            new THREE.Float32BufferAttribute(
                data.uvs,
                2
            )
        );
    }

    if (
        Array.isArray(data.indices) &&
        data.indices.length > 0
    ) {
        if (data.indices.length % 3 !== 0) {
            throw new Error('Index count must be a multiple of 3');
        }

        if (!data.indices.every(index =>
            Number.isInteger(index) &&
            index >= 0 &&
            index < vertexCount
        )) {
            throw new Error('Geometry contains invalid indices');
        }

        result.setIndex(data.indices);
    } else if (vertexCount % 3 !== 0) {
        throw new Error(
            'Non-indexed geometry requires complete triangles'
        );
    }

    if (!result.hasAttribute('normal')) {
        result.computeVertexNormals();
    }

    // Compatible with future material-slot compilation.
    if (Array.isArray(data.groups)) {
        result.clearGroups();

        for (const group of data.groups) {
            result.addGroup(
                group.start,
                group.count,
                group.materialIndex ?? 0
            );
        }
    }

    result.computeBoundingBox();
    result.computeBoundingSphere();

    return result;
}

function disposeGeometry() {
    if (mesh) {
        scene.remove(mesh);
        mesh = null;
    }

    if (geometry) {
        geometry.dispose();
        geometry = null;
    }
}

function fitCamera() {
    if (!geometry || !mesh) return;

    mesh.updateWorldMatrix(true, false);

    const box = new THREE.Box3().setFromObject(mesh);

    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const radius = Math.max(
        size.length() * 0.5,
        0.001
    );

    const direction = camera.position
        .clone()
        .sub(controls.target)
        .normalize();

    if (direction.lengthSq() < 0.001) {
        direction.set(1, 0.65, 1).normalize();
    }

    const verticalFov = THREE.MathUtils.degToRad(
        camera.fov
    );

    const horizontalFov = 2 * Math.atan(
        Math.tan(verticalFov / 2) * camera.aspect
    );

    const distance = Math.max(
        radius / Math.sin(verticalFov / 2),
        radius / Math.sin(horizontalFov / 2)
    ) * 1.35;

    controls.target.copy(center);

    camera.position.copy(
        center.clone().addScaledVector(
            direction,
            distance
        )
    );

    camera.near = Math.max(
        radius / 1000,
        0.0001
    );

    camera.far = Math.max(
        distance + radius * 10,
        100
    );

    camera.updateProjectionMatrix();
    controls.update();

    // Keep the reference grid appropriately sized.
    grid.scale.setScalar(
        Math.max(size.length() / 10, 0.001)
    );

    grid.position.y = box.min.y;
}

function updateStatistics() {
    if (!geometry) {
        statistics.textContent = '';
        return;
    }

    const positions = geometry.getAttribute('position');

    const index = geometry.getIndex();

    const vertices = positions.count;
    const triangles = index
        ? index.count / 3
        : vertices / 3;

    statistics.textContent =
        `Vertices: ${vertices.toLocaleString()}  ·  ` +
        `Triangles: ${triangles.toLocaleString()}  ·  ` +
        `Groups: ${geometry.groups.length}`;
}

function loadAsset(asset) {
    disposeGeometry();

    geometry = createGeometry(asset.data);

    mesh = new THREE.Mesh(
        geometry,
        material
    );

    scene.add(mesh);

    $('geometry-name').textContent =
        asset.name || 'Geometry';

    updateStatistics();
    fitCamera();

    setStatus('Geometry loaded');
}

function resize() {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;

    if (!width || !height) return;

    renderer.setSize(width, height, false);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

const observer = new ResizeObserver(resize);
observer.observe(viewport);

$('wireframe').addEventListener('click', () => {
    wireframe = !wireframe;
    material.wireframe = wireframe;

    $('wireframe').classList.toggle(
        'active',
        wireframe
    );

    material.needsUpdate = true;
});

$('grid').addEventListener('click', () => {
    gridVisible = !gridVisible;
    grid.visible = gridVisible;

    $('grid').classList.toggle(
        'active',
        gridVisible
    );
});

$('fit').addEventListener('click', fitCamera);

window.addEventListener('message', event => {
    const message = event.data;

    switch (message.type) {
        case 'load':
            try {
                loadAsset(message.asset);
            } catch (error) {
                disposeGeometry();
                updateStatistics();
                setStatus('Error: ' + error.message);
            }
            break;

        case 'error':
            setStatus('Error: ' + message.error);
            break;
    }
});

let running = true;

function animate() {
    if (!running) return;

    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

window.addEventListener('pagehide', () => {
    running = false;
    observer.disconnect();
    disposeGeometry();
    material.dispose();
    controls.dispose();
    renderer.dispose();
});

resize();
animate();

postAssetsUpdate('ready');
