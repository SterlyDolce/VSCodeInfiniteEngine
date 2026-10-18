// @ts-nocheck

const crypto = require('crypto');

const MATERIAL_FIELDS = [
    ['color', 'color', '#ffffff'],
    ['metalness', 'number', 0],
    ['roughness', 'number', 1],
    ['wireframe', 'boolean', false],

    ['map', 'asset', null],
    ['normalMap', 'asset', null],
    ['normalScale', 'vector2', [1, 1]],
    ['roughnessMap', 'asset', null],
    ['metalnessMap', 'asset', null],
    ['aoMap', 'asset', null],
    ['aoMapIntensity', 'number', 1],

    ['emissive', 'color', '#000000'],
    ['emissiveIntensity', 'number', 1],
    ['emissiveMap', 'asset', null],

    ['bumpMap', 'asset', null],
    ['bumpScale', 'number', 1],
    ['displacementMap', 'asset', null],
    ['displacementScale', 'number', 1],
    ['displacementBias', 'number', 0],

    ['alphaMap', 'asset', null],
    ['lightMap', 'asset', null],
    ['lightMapIntensity', 'number', 1],

    ['side', 'number', 2],
    ['transparent', 'boolean', false],
    ['opacity', 'number', 1],
    ['alphaTest', 'number', 0]
];

const TEXTURE_FIELDS = new Set([
    'map', 'normalMap', 'roughnessMap', 'metalnessMap',
    'aoMap', 'emissiveMap', 'bumpMap',
    'displacementMap', 'alphaMap', 'lightMap'
]);

const clone = value =>
    value === undefined ? undefined : structuredClone(value);

function initializeMaterialGraph(asset) {
    if (asset.type !== 'material') {
        throw new Error('Expected a material asset');
    }

    if (!Array.isArray(asset.nodes)) asset.nodes = [];
    if (!Array.isArray(asset.links)) asset.links = [];

    if (asset.nodes.length) return asset;

    asset.nodes.push({
        id: crypto.randomUUID(),
        type: 'material.output',
        position: [600, 200],
        pins: MATERIAL_FIELDS.map(([name, type, fallback]) => ({
            id: crypto.randomUUID(),
            name,
            type,
            direction: 'input',
            value: clone(asset.data?.[name] ?? fallback),
            ...(TEXTURE_FIELDS.has(name)
                ? { assetType: 'texture' }
                : {})
        }))
    });

    return asset;
}

function validateField(name, type, value) {
    if (TEXTURE_FIELDS.has(name)) {
        if (
            value !== null &&
            (
                typeof value !== 'object' ||
                value.type !== 'texture' ||
                typeof value.id !== 'string'
            )
        ) {
            throw new Error(`${name} must reference a texture asset`);
        }
        return;
    }

    if (type === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(`${name} must be a finite number`);
        }
    }

    if (type === 'boolean' && typeof value !== 'boolean') {
        throw new Error(`${name} must be boolean`);
    }

    if (type === 'color' &&
        (typeof value !== 'string' ||
            !/^#[0-9a-fA-F]{6}$/.test(value))) {
        throw new Error(`${name} must be a hex color`);
    }

    if (type === 'vector2' &&
        (!Array.isArray(value) ||
            value.length !== 2 ||
            !value.every(v => typeof v === 'number' && Number.isFinite(v)))) {
        throw new Error(`${name} must be a Vector2`);
    }
}

function compileMaterial(asset, materialNodeRegistry) {
    const nodes = asset.nodes ?? [];
    const links = asset.links ?? [];

    const outputs = nodes.filter(n => n.type === 'material.output');

    if (outputs.length !== 1) {
        throw new Error('Material requires exactly one Output node');
    }

    const output = outputs[0];

    const pinIndex = new Map();

    for (const node of nodes) {
        for (const pin of node.pins ?? []) {
            if (pinIndex.has(pin.id)) {
                throw new Error(`Duplicate pin: ${pin.id}`);
            }
            pinIndex.set(pin.id, { node, pin });
        }
    }

    const incoming = new Map();

    for (const link of links) {
        const source = pinIndex.get(link.from);
        const target = pinIndex.get(link.to);

        if (!source || !target) {
            throw new Error('Material graph contains a broken connection');
        }

        if (source.pin.direction !== 'output' ||
            target.pin.direction !== 'input') {
            throw new Error('Invalid material connection direction');
        }

        if (incoming.has(link.to)) {
            throw new Error(`Multiple links to input ${link.to}`);
        }

        incoming.set(link.to, link.from);
    }

    function evaluatePin(pin, stack = new Set()) {
        if (!incoming.has(pin.id)) return clone(pin.value);

        if (stack.has(pin.id)) {
            throw new Error('Circular dependency in material graph');
        }

        const source = pinIndex.get(incoming.get(pin.id));
        const nextStack = new Set(stack);
        nextStack.add(pin.id);

        const node = source.node;

        // First graph milestone: constant-value nodes.
        // More material node evaluators will be registered later.
        // Support existing Material Value nodes.
        if (node.type === 'material.value') {
            return clone(source.pin.value);
        }

        // Compile through the Material Node Registry.
        return materialNodeRegistry.compile(node.type, {
            node,
            output: source.pin.name,

            readInput(name) {
                const input = node.pins.find(
                    pin =>
                        pin.direction === 'input' &&
                        pin.name === name
                );

                if (!input) {
                    throw new Error(`Missing material input: ${name}`);
                }

                return evaluatePin(input, nextStack);
            }
        });

    }

    const result = {
        ...clone(asset.data ?? {}),
        type: asset.data?.type ?? 'standard'
    };

    if (result.type !== 'standard') {
        throw new Error('Only standard materials are supported currently');
    }

    for (const [name, type, fallback] of MATERIAL_FIELDS) {
        const pin = output.pins.find(
            p => p.direction === 'input' && p.name === name
        );

        if (!pin) {
            throw new Error(`Missing Material Output pin: ${name}`);
        }

        const value = evaluatePin(pin);

        result[name] = value === undefined
            ? clone(fallback)
            : value;

        validateField(name, type, result[name]);
    }

    if (result.roughness < 0 || result.roughness > 1 ||
        result.metalness < 0 || result.metalness > 1 ||
        result.opacity < 0 || result.opacity > 1 ||
        result.near !== undefined && result.near < 0) {
        throw new Error('Material values are outside their valid ranges');
    }

    return result;
}

module.exports = {
    MATERIAL_FIELDS,
    initializeMaterialGraph,
    compileMaterial
};
