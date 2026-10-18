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

    return {
        id: uuid(),
        name,
        type,
        data: template.create(name)
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
// 3. GEOMETRY
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
