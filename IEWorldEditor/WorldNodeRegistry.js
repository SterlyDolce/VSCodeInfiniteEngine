// @ts-nocheck
const crypto = require('crypto');

const TYPES = new Set(['heightmap', 'geometry', 'terrain', 'number', 'vector2', 'texture']);

class WorldNodeRegistry {
    constructor() { this.nodes = new Map(); }

    register(type, definition) {
        if (this.nodes.has(type)) throw new Error(`World node already registered: ${type}`);
        for (const pin of [...(definition.inputs ?? []), ...(definition.outputs ?? [])]) {
            if (!TYPES.has(pin.type)) throw new Error(`Unsupported world pin type: ${pin.type}`);
        }
        this.nodes.set(type, { type, category: 'World', ...definition });
        return this;
    }

    get(type) { return this.nodes.get(type); }
    getAll() { return [...this.nodes.values()]; }
    getDefinitions() {
        return this.getAll().map(({ evaluate: _evaluate, ...definition }) => structuredClone(definition));
    }

    create(type, position = [0, 0]) {
        const definition = this.get(type);
        if (!definition) throw new Error(`Unknown world node: ${type}`);
        const pins = [];
        for (const pin of definition.inputs ?? []) pins.push({
            id: crypto.randomUUID(), direction: 'input', ...structuredClone(pin)
        });
        for (const pin of definition.outputs ?? []) pins.push({
            id: crypto.randomUUID(), direction: 'output', ...structuredClone(pin)
        });
        return { id: crypto.randomUUID(), type, position: [...position], pins };
    }
}

function noise2(x, y, seed) {
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed | 0, 1442695041);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295 * 2 - 1;
}
const smooth = t => t * t * (3 - 2 * t);
function valueNoise(x, y, seed) {
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = smooth(x - x0), ty = smooth(y - y0);
    const a = noise2(x0, y0, seed), b = noise2(x0 + 1, y0, seed);
    const c = noise2(x0, y0 + 1, seed), d = noise2(x0 + 1, y0 + 1, seed);
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
}

const worldNodeRegistry = new WorldNodeRegistry();
worldNodeRegistry.register('world.textureAsset', {
    name: 'Texture Asset',
    category: 'Assets',
    inputs: [],
    outputs: [{
        name: 'Texture',
        type: 'texture',
        assetType: 'texture',
        value: null
    }],
    evaluate({ node, resolveTexture }) {
        const pin = node.pins?.find(pin =>
            pin.direction === 'output' && pin.name === 'Texture'
        );
        const id = typeof pin?.value === 'string' ? pin.value.trim() : pin?.value?.id;
        if (!id) throw new Error('Texture Asset requires a selected texture');
        return { Texture: resolveTexture(id) };
    }
});
worldNodeRegistry.register('world.textureToHeightmap', {
    name: 'Texture to Heightmap',
    category: 'Generators',
    inputs: [
        { name: 'Texture', type: 'texture', value: null },
        { name: 'Amplitude', type: 'number', value: 10 },
        { name: 'Offset', type: 'number', value: 0 },
        { name: 'Invert', type: 'number', value: 0, min: 0, max: 1, integer: true }
    ],
    outputs: [{ name: 'Heightmap', type: 'heightmap' }],
    evaluate({ read }) {
        const texture = read('Texture');
        if (!texture?.data || !texture.width || !texture.height) {
            throw new Error('Texture to Heightmap requires a Texture Asset');
        }
        const amplitude = Number(read('Amplitude'));
        const offset = Number(read('Offset'));
        const invert = Number(read('Invert')) >= 0.5;
        if (!Number.isFinite(amplitude) || !Number.isFinite(offset)) throw new Error('Invalid heightmap amplitude or offset');
        const data = new Float32Array(texture.width * texture.height);
        const maxValue = texture.maxValue ?? 255;
        for (let index = 0; index < data.length; index++) {
            const source = index * 4;
            let luminance = (
                texture.data[source] * 0.2126 +
                texture.data[source + 1] * 0.7152 +
                texture.data[source + 2] * 0.0722
            ) / maxValue;
            if (invert) luminance = 1 - luminance;
            data[index] = offset + luminance * amplitude;
        }
        return {
            Heightmap: {
                width: texture.width,
                height: texture.height,
                data
            }
        };
    }
});
worldNodeRegistry.register('world.heightMap', {
    name: 'Height Map', category: 'Generators', inputs: [
        { name: 'Width', type: 'number', value: 129, min: 2, max: 513, integer: true },
        { name: 'Height', type: 'number', value: 129, min: 2, max: 513, integer: true },
        { name: 'Seed', type: 'number', value: 1, integer: true },
        { name: 'Scale', type: 'number', value: 4, min: 0.001 },
        { name: 'Amplitude', type: 'number', value: 8 },
        { name: 'Octaves', type: 'number', value: 5, min: 1, max: 12, integer: true },
        { name: 'Persistence', type: 'number', value: 0.5, min: 0, max: 1 },
        { name: 'Lacunarity', type: 'number', value: 2, min: 1 }
    ], outputs: [{ name: 'Heightmap', type: 'heightmap' }],
    evaluate({ read }) {
        const width = Math.max(2, Math.min(513, Math.round(read('Width'))));
        const height = Math.max(2, Math.min(513, Math.round(read('Height'))));
        const seed = Math.round(read('Seed')), scale = Math.max(.001, read('Scale'));
        const amplitude = read('Amplitude'), octaves = Math.max(1, Math.min(12, Math.round(read('Octaves'))));
        const persistence = read('Persistence'), lacunarity = Math.max(1, read('Lacunarity'));
        const data = new Float32Array(width * height);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            let total = 0, frequency = 1, strength = 1, sum = 0;
            for (let octave = 0; octave < octaves; octave++) {
                total += valueNoise(x / (width - 1) * scale * frequency, y / (height - 1) * scale * frequency, seed + octave * 1013) * strength;
                sum += strength; strength *= persistence; frequency *= lacunarity;
            }
            data[y * width + x] = (sum ? total / sum : 0) * amplitude;
        }
        return { Heightmap: { width, height, data } };
    }
});
worldNodeRegistry.register('world.plane', {
    name: 'Plane', category: 'Geometry', inputs: [
        { name: 'Width', type: 'number', value: 100, min: .001 }, { name: 'Depth', type: 'number', value: 100, min: .001 },
        { name: 'Resolution X', type: 'number', value: 128, min: 1, max: 512, integer: true },
        { name: 'Resolution Y', type: 'number', value: 128, min: 1, max: 512, integer: true },
        { name: 'Heightmap', type: 'heightmap', value: null }
    ], outputs: [{ name: 'Geometry', type: 'geometry' }],
    evaluate({ read, maxResolution = 256 }) {
        const width = Math.max(.001, read('Width')), depth = Math.max(.001, read('Depth'));
        const rx = Math.max(1, Math.min(maxResolution, Math.round(read('Resolution X'))));
        const ry = Math.max(1, Math.min(maxResolution, Math.round(read('Resolution Y'))));
        const map = read('Heightmap');
        const positions = new Float32Array((rx + 1) * (ry + 1) * 3), uvs = new Float32Array((rx + 1) * (ry + 1) * 2);
        const sample = (u, v) => {
            if (!map?.data) return 0;
            const x = u * (map.width - 1), y = v * (map.height - 1), x0 = Math.floor(x), y0 = Math.floor(y);
            const x1 = Math.min(x0 + 1, map.width - 1), y1 = Math.min(y0 + 1, map.height - 1), tx = x - x0, ty = y - y0;
            const a = map.data[y0 * map.width + x0] * (1 - tx) + map.data[y0 * map.width + x1] * tx;
            const b = map.data[y1 * map.width + x0] * (1 - tx) + map.data[y1 * map.width + x1] * tx;
            return a * (1 - ty) + b * ty;
        };
        for (let y = 0; y <= ry; y++) for (let x = 0; x <= rx; x++) {
            const u = x / rx, v = y / ry, i = y * (rx + 1) + x;
            positions.set([(u - .5) * width, sample(u, v), (v - .5) * depth], i * 3); uvs.set([u, v], i * 2);
        }
        const Index = positions.length / 3 > 65535 ? Uint32Array : Uint16Array;
        const indices = new Index(rx * ry * 6); let n = 0;
        for (let y = 0; y < ry; y++) for (let x = 0; x < rx; x++) {
            const a = y * (rx + 1) + x, b = a + 1, c = a + rx + 1, d = c + 1;
            indices.set([a, c, b, b, c, d], n); n += 6;
        }
        const normals = new Float32Array(positions.length);
        for (let i = 0; i < indices.length; i += 3) {
            const ai = indices[i] * 3, bi = indices[i + 1] * 3, ci = indices[i + 2] * 3;
            const abx = positions[bi] - positions[ai], aby = positions[bi + 1] - positions[ai + 1], abz = positions[bi + 2] - positions[ai + 2];
            const acx = positions[ci] - positions[ai], acy = positions[ci + 1] - positions[ai + 1], acz = positions[ci + 2] - positions[ai + 2];
            const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
            for (const index of [ai, bi, ci]) { normals[index] += nx; normals[index + 1] += ny; normals[index + 2] += nz; }
        }
        for (let i = 0; i < normals.length; i += 3) { const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1; normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length; }
        return { Geometry: { width, depth, resolutionX: rx, resolutionY: ry, positions, normals, uvs, indices, heights: map?.data ?? null, heightmapWidth: map?.width ?? 0, heightmapHeight: map?.height ?? 0 } };
    }
});
worldNodeRegistry.register('world.terrainOutput', {
    name: 'Terrain Output', category: 'Output', unique: true,
    inputs: [{ name: 'Geometry', type: 'geometry', value: null }], outputs: [{ name: 'Terrain', type: 'terrain' }],
    evaluate({ read }) { const geometry = read('Geometry'); if (!geometry) throw new Error('Terrain Output requires Geometry'); return { Terrain: { geometry } }; }
});

module.exports = { WorldNodeRegistry, worldNodeRegistry, WORLD_DATA_TYPES: [...TYPES] };
