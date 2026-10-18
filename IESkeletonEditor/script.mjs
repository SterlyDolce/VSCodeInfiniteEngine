import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);
let asset = null;
let selectedId = null;
let dirty = false;
let gridVisible = true;
const objects = new Map();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x181818);
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10000);
camera.position.set(4, 3, 6);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
$('viewport').append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const grid = new THREE.GridHelper(20, 20, 0x555555, 0x333333);
scene.add(grid);
const rig = new THREE.Group();
scene.add(rig);
const lineGeometry = new THREE.BufferGeometry();
const lines = new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({ color: 0xeb9191 })
);
scene.add(lines);
const jointGeometry = new THREE.BufferGeometry();
const joints = new THREE.Points(
    jointGeometry,
    new THREE.PointsMaterial({
        size: 7,
        sizeAttenuation: false,
        vertexColors: true
    })
);
scene.add(joints);

function status(message, error = false) {
    $('status').textContent = message;
    $('status').style.color = error ? 'var(--vscode-errorForeground)' : '';
}

function markDirty() {
    dirty = true;
    $('save').disabled = false;
    status('Unsaved changes');
}

function rebuildRig() {
    rig.clear();
    objects.clear();
    for (const node of asset.data.nodes) {
        const object = node.isBone ? new THREE.Bone() : new THREE.Object3D();
        object.name = node.name || node.id;
        object.position.fromArray(node.position);
        object.quaternion.fromArray(node.quaternion);
        object.scale.fromArray(node.scale);
        objects.set(node.id, object);
    }
    for (const node of asset.data.nodes) {
        const object = objects.get(node.id);
        const parent = objects.get(node.parentId);
        (parent ?? rig).add(object);
    }
    rig.updateMatrixWorld(true);
    updateLines();
}

function updateLines() {
    rig.updateMatrixWorld(true);
    const points = [];
    const jointPositions = [];
    const jointColors = [];
    for (const node of asset?.data.nodes ?? []) {
        const object = objects.get(node.id);
        if (object) {
            jointPositions.push(...object.getWorldPosition(new THREE.Vector3()).toArray());
            const color = new THREE.Color(
                node.id === selectedId ? 0x78b7ff : 0xeb9191
            );
            jointColors.push(color.r, color.g, color.b);
        }

        if (!node.parentId) continue;
        const parent = objects.get(node.parentId);
        if (!object || !parent) continue;
        points.push(
            parent.getWorldPosition(new THREE.Vector3()),
            object.getWorldPosition(new THREE.Vector3())
        );
    }
    lineGeometry.setFromPoints(points);
    jointGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(jointPositions, 3)
    );
    jointGeometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(jointColors, 3)
    );
}

function childrenOf(id) {
    return asset.data.nodes.filter(node => (node.parentId ?? null) === id);
}

function renderHierarchy() {
    const container = $('hierarchy');
    container.replaceChildren();
    const renderNode = (node, depth) => {
        const button = document.createElement('button');
        button.className = 'node-row' + (node.id === selectedId ? ' selected' : '');
        button.style.paddingLeft = `${7 + depth * 14}px`;
        const kind = document.createElement('span');
        kind.className = 'kind';
        kind.textContent = node.isBone ? '◆' : '◇';
        const name = document.createElement('span');
        name.textContent = node.name || 'Unnamed';
        button.append(kind, name);
        button.addEventListener('click', () => selectNode(node.id));
        container.append(button);
        for (const child of childrenOf(node.id)) renderNode(child, depth + 1);
    };
    const roots = childrenOf(null);
    for (const root of roots) renderNode(root, 0);
    const shown = new Set();
    const collect = node => {
        if (shown.has(node.id)) return;
        shown.add(node.id);
        childrenOf(node.id).forEach(collect);
    };
    roots.forEach(collect);
    for (const orphan of asset.data.nodes.filter(node => !shown.has(node.id))) {
        renderNode(orphan, 0);
    }
}

function vectorFields(containerId, property, labels) {
    const container = $(containerId);
    container.replaceChildren();
    const node = asset.data.nodes.find(item => item.id === selectedId);
    labels.forEach((label, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'axis';
        const caption = document.createElement('span');
        caption.textContent = label;
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.value = node[property][index];
        input.addEventListener('change', () => {
            const value = Number(input.value);
            if (!Number.isFinite(value)) return;
            node[property][index] = value;
            rebuildRig();
            markDirty();
        });
        wrapper.append(caption, input);
        container.append(wrapper);
    });
}

function selectNode(id) {
    selectedId = id;
    const node = asset.data.nodes.find(item => item.id === id);
    updateLines();
    renderHierarchy();
    $('empty').hidden = Boolean(node);
    $('fields').hidden = !node;
    if (!node) return;
    $('node-name').value = node.name || '';
    $('node-type').textContent = node.isBone ? 'Bone' : 'Transform';
    const index = asset.data.bones.indexOf(node.id);
    $('bone-index').textContent = index < 0 ? '—' : String(index);
    vectorFields('position', 'position', ['X', 'Y', 'Z']);
    vectorFields('quaternion', 'quaternion', ['X', 'Y', 'Z', 'W']);
    vectorFields('scale', 'scale', ['X', 'Y', 'Z']);
    $('inverse').textContent = index < 0
        ? 'Not a skin bone'
        : asset.data.boneInverses[index]
            .map((value, i) => `${Number(value).toFixed(4)}${i % 4 === 3 ? '\n' : '  '}`)
            .join('');
}

function fit() {
    const box = new THREE.Box3();
    for (const object of objects.values()) {
        box.expandByPoint(object.getWorldPosition(new THREE.Vector3()));
    }
    if (box.isEmpty()) {
        controls.target.set(0, 0, 0);
        camera.position.set(4, 3, 6);
    } else {
        const center = box.getCenter(new THREE.Vector3());
        const size = Math.max(box.getSize(new THREE.Vector3()).length(), 1);
        controls.target.copy(center);
        camera.position.copy(center).add(new THREE.Vector3(size, size * .7, size * 1.4));
    }
    controls.update();
}

function load(next) {
    asset = structuredClone(next);
    asset.data.nodes ??= [];
    selectedId = null;
    dirty = false;
    $('save').disabled = true;
    $('asset-name').textContent = asset.name || 'Skeleton';
    $('summary').textContent = `${asset.data.bones.length} bones · ${asset.data.nodes.length} hierarchy nodes`;
    rebuildRig();
    renderHierarchy();
    selectNode(asset.data.nodes[0]?.id ?? null);
    fit();
    status('Skeleton loaded');
}

$('node-name').addEventListener('input', event => {
    const node = asset?.data.nodes.find(item => item.id === selectedId);
    if (!node) return;
    node.name = event.target.value;
    objects.get(node.id).name = node.name;
    renderHierarchy();
    markDirty();
});
$('fit').addEventListener('click', fit);
$('grid').addEventListener('click', () => {
    gridVisible = !gridVisible;
    grid.visible = gridVisible;
});
$('reload').addEventListener('click', () => {
    if (!dirty || confirm('Discard unsaved skeleton changes?')) {
        vscode.postMessage({ type: 'reload' });
    }
});
$('save').addEventListener('click', () => {
    vscode.postMessage({ type: 'save', data: asset.data });
});

window.addEventListener('message', event => {
    if (event.data.type === 'load') load(event.data.asset);
    if (event.data.type === 'selectNode') selectNode(event.data.nodeId);
    if (event.data.type === 'updateSkeletonProperty') {
        const node = asset?.data.nodes.find(
            item => item.id === event.data.nodeId
        );
        if (!node) return;

        const { property, value } = event.data;
        if (property === 'name') {
            const name = String(value ?? '').trim();
            if (!name) return;
            node.name = name;
        } else if (
            ['position', 'quaternion', 'scale'].includes(property) &&
            Array.isArray(value) &&
            value.length === (property === 'quaternion' ? 4 : 3) &&
            value.every(Number.isFinite)
        ) {
            node[property] = [...value];
        } else {
            return;
        }

        rebuildRig();
        selectNode(node.id);
        markDirty();
        vscode.postMessage({
            type: 'skeletonChanged',
            nodeId: node.id,
            data: asset.data
        });
    }
    if (event.data.type === 'saved') {
        dirty = false;
        $('save').disabled = true;
        status('Skeleton saved');
    }
    if (event.data.type === 'error') status(event.data.message, true);
});
window.addEventListener('beforeunload', event => {
    if (dirty) event.preventDefault();
});

function animate() {
    requestAnimationFrame(animate);
    const width = $('viewport').clientWidth;
    const height = $('viewport').clientHeight;
    if (renderer.domElement.width !== Math.floor(width * renderer.getPixelRatio()) ||
        renderer.domElement.height !== Math.floor(height * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false);
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
    }
    controls.update();
    updateLines();
    renderer.render(scene, camera);
}
animate();
vscode.postMessage({ type: 'ready' });
