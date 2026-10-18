// @ts-nocheck

export const materialNodeDefinitions = [
    {
        type: 'material.output',
        name: 'Material Output',
        category: 'Material',
        inputs: [
            { name: 'color', type: 'color', default: '#ffffff' },
            { name: 'metalness', type: 'number', default: 0 },
            { name: 'roughness', type: 'number', default: 1 },
            { name: 'wireframe', type: 'boolean', default: false },
            ...[
                'map', 'normalMap', 'roughnessMap',
                'metalnessMap', 'aoMap', 'emissiveMap',
                'bumpMap', 'displacementMap',
                'alphaMap', 'lightMap'
            ].map(name => ({
                name,
                type: 'asset',
                assetType: 'texture',
                default: null
            })),
            { name: 'normalScale', type: 'vector2', default: [1, 1] },
            { name: 'aoMapIntensity', type: 'number', default: 1 },
            { name: 'emissive', type: 'color', default: '#000000' },
            { name: 'emissiveIntensity', type: 'number', default: 1 },
            { name: 'bumpScale', type: 'number', default: 1 },
            { name: 'displacementScale', type: 'number', default: 1 },
            { name: 'displacementBias', type: 'number', default: 0 },
            { name: 'lightMapIntensity', type: 'number', default: 1 },
            { name: 'side', type: 'number', default: 2 },
            { name: 'transparent', type: 'boolean', default: false },
            { name: 'opacity', type: 'number', default: 1 },
            { name: 'alphaTest', type: 'number', default: 0 }
        ],
        outputs: []
    },
    {
        type: 'material.value',
        name: 'Value',
        category: 'Material',
        inputs: [],
        outputs: [
            { name: 'Value', type: 'any', default: 0 }
        ]
    }
];
