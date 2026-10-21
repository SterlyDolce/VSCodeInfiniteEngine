// @ts-nocheck

const crypto = require('crypto');

const templates = new Map();

function uuid() {
    return crypto.randomUUID();
}

function registerTemplate(type, options) {
    if (!type || typeof options.create !== 'function') {
        throw new Error('Invalid asset template');
    }

    templates.set(type, {
        type,
        label: options.label,
        description: options.description ?? '',
        icon: options.icon ?? 'file',
        extension: options.extension ?? '.ieasset',
        wrap: options.wrap !== false,
        create: options.create
    });
}

function getTemplates() {
    return [...templates.values()];
}

function createTemplate(type, name) {
    const template = templates.get(type);

    if (!template) {
        throw new Error(`Unknown asset type: ${type}`);
    }

    const data = template.create(name);

    if (!template.wrap) return data;

    return {
        id: uuid(),
        name,
        type,
        data
    };
}

// =====================================================
// 1. VISUAL SCRIPT
// =====================================================

registerTemplate('script', {
    label: 'Visual Script',
    description: 'Create a node-based visual script',
    icon: 'symbol-method',

    create: () => ({
        nodes: [],
        links: [],
        variables: [],
        functions: []
    })
});

// =====================================================
// 2. ACTOR
// =====================================================

registerTemplate('actor', {
    label: 'Actor',
    description: 'Create a reusable Actor with components',
    icon: 'symbol-class',

    create: name => ({
        id: uuid(),
        name,
        type: 'Actor',
        parent: null,
        components: []
    })
});

// =====================================================
// 3. SCENE
// =====================================================

registerTemplate('scene', {
    label: 'Scene',
    description: 'Create a playable scene with a World root',
    icon: 'globe',
    extension: '.iescene',
    wrap: false,

    create: name => ({
        name,
        version: 1,
        actors: [{
            id: uuid(),
            name: 'World',
            type: 'World',
            components: [{
                id: uuid(),
                type: 'terrain',
                name: 'terrain',
                enabled: true,
                parent: null,
                terrain: null,
                physics: true,
                friction: 0.8,
                restitution: 0,
                castShadow: false,
                receiveShadow: true
            }]
        }]
    })
});

// =====================================================
// 4. GEOMETRY
// =====================================================

registerTemplate('geometry', {
    label: 'Geometry',
    description: 'Create a 3D geometry asset',
    icon: 'symbol-color',

    create: () => ({
        attributes: {},
        index: null,
        groups: [],
        morphAttributes: {},
        morphTargetsRelative: false,
        boundingBox: null,
        boundingSphere: null
    })
});

// =====================================================
// 4. MATERIAL
// =====================================================

registerTemplate('material', {
    label: 'Material',
    description: 'Create a material asset',
    icon: 'symbol-color',

    create: () => ({
        nodes: [],
        links: []
    })
});

registerTemplate('terrain', {
    label: 'Terrain',
    description: 'Create a procedural terrain graph',
    icon: 'map',
    create: () => {
        const height = { id: uuid(), type: 'world.heightMap', position: [30, 120], pins: [] };
        const plane = { id: uuid(), type: 'world.plane', position: [330, 120], pins: [] };
        const material = { id: uuid(), type: 'world.terrainMaterial', position: [330, 390], pins: [] };
        const output = { id: uuid(), type: 'world.terrainOutput', position: [650, 120], pins: [] };
        const input = (node, name, type, value) => { const pin = { id: uuid(), name, type, direction: 'input', value }; node.pins.push(pin); return pin; };
        const out = (node, name, type) => { const pin = { id: uuid(), name, type, direction: 'output' }; node.pins.push(pin); return pin; };
        input(height, 'Width', 'number', 129); input(height, 'Height', 'number', 129); input(height, 'Seed', 'number', 1); input(height, 'Scale', 'number', 4); input(height, 'Amplitude', 'number', 0); input(height, 'Octaves', 'number', 5); input(height, 'Persistence', 'number', .5); input(height, 'Lacunarity', 'number', 2);
        const heightOut = out(height, 'Heightmap', 'heightmap');
        input(plane, 'Width', 'number', 100); input(plane, 'Depth', 'number', 100); input(plane, 'Resolution X', 'number', 128); input(plane, 'Resolution Y', 'number', 128); const heightIn = input(plane, 'Heightmap', 'heightmap', null); const geometryOut = out(plane, 'Geometry', 'geometry');
        input(material, 'Base Color', 'color', '#6f8f45'); input(material, 'Texture', 'texture', null); input(material, 'Texture Scale', 'vector2', [16, 16]); input(material, 'Roughness', 'number', .9); input(material, 'Metalness', 'number', 0); const materialOut = out(material, 'Material', 'material');
        const geometryIn = input(output, 'Geometry', 'geometry', null); const materialIn = input(output, 'Material', 'material', null); out(output, 'Terrain', 'terrain');
        return { version: 2, nodes: [height, plane, material, output], links: [{ id: uuid(), from: heightOut.id, to: heightIn.id }, { id: uuid(), from: geometryOut.id, to: geometryIn.id }, { id: uuid(), from: materialOut.id, to: materialIn.id }] };
    }
});

// =====================================================
// 5. TEXTURE
// =====================================================

registerTemplate('texture', {
    label: 'Texture',
    description: 'Create an image texture asset',
    icon: 'file-media',

    create: () => ({
        image: null,
        colorSpace: 'srgb',
        flipY: false,
        wrapS: 1000,
        wrapT: 1000,
        magFilter: 1006,
        minFilter: 1008,
        offset: [0, 0],
        repeat: [1, 1],
        center: [0, 0],
        rotation: 0
    })
});

// =====================================================
// 6. SKELETON
// =====================================================

registerTemplate('skeleton', {
    label: 'Skeleton',
    description: 'Create a skeletal rig asset',
    icon: 'type-hierarchy',

    create: () => ({
        nodes: [],
        bones: [],
        boneInverses: []
    })
});

// =====================================================
// 7. ANIMATION
// =====================================================

registerTemplate('animation', {
    label: 'Animation',
    description: 'Create an animation clip',
    icon: 'play-circle',

    create: () => ({
        duration: 0,
        tracks: [],
        blendMode: 2500
    })
});

// =====================================================
// 8. ANIMATION STATE
// =====================================================

registerTemplate('animationState', {
    label: 'Animation State',
    description: 'Create a state machine with Blend Spaces',
    icon: 'type-hierarchy-sub',

    create: () => ({
        skeleton: null,
        parameters: [],
        layers: [
            {
                id: uuid(),
                name: 'Base',
                mode: 'override',
                mask: 'Full Body',
                weight: 1,
                enabled: true,

                nodes: [
                    {
                        id: uuid(),
                        kind: 'entry',
                        name: 'Entry',
                        position: [-182, 62]
                    }
                ],

                links: []
            }
        ]
    })
});

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    registerTemplate,
    getTemplates,
    createTemplate
};
