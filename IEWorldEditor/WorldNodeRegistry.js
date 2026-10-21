// @ts-nocheck
const crypto = require('crypto');

const TYPES = new Set(['heightmap', 'geometry', 'terrain', 'material', 'number', 'string', 'vector2', 'color', 'texture']);

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

function applySculptStrokes(heightmap, strokes) {
    if (!heightmap?.data || !Array.isArray(strokes) || !strokes.length) return heightmap;
    const { width, height } = heightmap;
    const data = heightmap.data;
    for (const stroke of strokes) {
        const radius = Math.max(0.0001, Number(stroke.radius) || 0.05);
        const falloff = Math.max(0, Math.min(1, Number(stroke.falloff) || 0));
        const strength = Number(stroke.strength) || 0;
        const minX = Math.max(0, Math.floor((stroke.u - radius) * (width - 1)));
        const maxX = Math.min(width - 1, Math.ceil((stroke.u + radius) * (width - 1)));
        const minY = Math.max(0, Math.floor((stroke.v - radius) * (height - 1)));
        const maxY = Math.min(height - 1, Math.ceil((stroke.v + radius) * (height - 1)));
        const source = stroke.mode === 'smooth' ? new Float32Array(data) : null;
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
            const distance = Math.hypot(x / (width - 1) - stroke.u, y / (height - 1) - stroke.v) / radius;
            if (distance > 1) continue;
            const edge = falloff > 0 ? Math.min(1, (1 - distance) / falloff) : 1;
            const weight = smooth(edge);
            const index = y * width + x;
            if (source) {
                let total = 0, count = 0;
                for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
                    const sx = Math.max(0, Math.min(width - 1, x + ox));
                    const sy = Math.max(0, Math.min(height - 1, y + oy));
                    total += source[sy * width + sx]; count++;
                }
                data[index] += (total / count - data[index]) * Math.min(1, Math.abs(strength)) * weight;
            } else data[index] += strength * weight;
        }
    }
    return heightmap;
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
worldNodeRegistry.register('world.textureToNumber', {
    name: 'Texture to Number',
    category: 'Converters',
    inputs: [
        { name: 'Texture', type: 'texture', value: null },
        { name: 'U', type: 'number', value: 1, min: 0.001 },
        { name: 'V', type: 'number', value: 1, min: 0.001 },
        { name: 'Channel', type: 'string', value: 'Luminance', editor: { type: 'enum', options: ['Luminance', 'Red', 'Green', 'Blue', 'Alpha'] } }
    ],
    outputs: [{ name: 'Number', type: 'number' }],
    evaluate({ read }) {
        const texture = read('Texture');
        if (!texture?.data || !texture.width || !texture.height) {
            throw new Error('Texture to Number requires a Texture Asset');
        }
        const u = Math.max(0.001, Math.abs(Number(read('U'))));
        const v = Math.max(0.001, Math.abs(Number(read('V'))));
        const channel = read('Channel');
        if (![u, v].every(Number.isFinite) || !['Luminance', 'Red', 'Green', 'Blue', 'Alpha'].includes(channel)) throw new Error('Texture to Number has invalid sampling inputs');
        return { Number: { type: 'textureNumber', texture, scale: [u, v], channel } };
    }
});
worldNodeRegistry.register('world.color', {
    name: 'Color',
    category: 'Material',
    inputs: [{ name: 'Color', type: 'color', value: '#6f8f45' }],
    outputs: [{ name: 'Color', type: 'color' }],
    evaluate({ read }) {
        const color = read('Color');
        if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
            throw new Error('Color requires a six-digit hex color');
        }
        return { Color: color };
    }
});
worldNodeRegistry.register('world.vector2', {
    name: 'Vector2',
    category: 'Values',
    inputs: [
        { name: 'X', type: 'number', value: 1 },
        { name: 'Y', type: 'number', value: 1 }
    ],
    outputs: [{ name: 'Vector', type: 'vector2' }],
    evaluate({ read }) {
        const x = Number(read('X'));
        const y = Number(read('Y'));
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            throw new Error('Vector2 requires numeric X and Y values');
        }
        return { Vector: [x, y] };
    }
});
worldNodeRegistry.register('world.terrainMaterial', {
    name: 'Terrain Material',
    category: 'Material',
    inputs: [
        { name: 'Base Color', type: 'color', value: '#6f8f45' },
        { name: 'Texture', type: 'texture', value: null },
        { name: 'Texture Scale', type: 'vector2', value: [16, 16] },
        { name: 'Roughness', type: 'number', value: 0.9, min: 0, max: 1 },
        { name: 'Metalness', type: 'number', value: 0, min: 0, max: 1 }
    ],
    outputs: [{ name: 'Material', type: 'material' }],
    evaluate({ read }) {
        const color = read('Base Color');
        const texture = read('Texture');
        const scale = read('Texture Scale');
        const roughness = Math.max(0, Math.min(1, Number(read('Roughness'))));
        const metalness = Math.max(0, Math.min(1, Number(read('Metalness'))));
        if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Terrain Material requires a valid Base Color');
        if (!Array.isArray(scale) || scale.length !== 2 || !scale.every(Number.isFinite)) throw new Error('Terrain Material requires a two-number Texture Scale');
        if (!Number.isFinite(roughness) || !Number.isFinite(metalness)) throw new Error('Terrain Material roughness and metalness must be numbers');
        return { Material: { type: 'standard', color, texture: texture ?? null, textureScale: [Math.max(0.001, Math.abs(scale[0])), Math.max(0.001, Math.abs(scale[1]))], roughness, metalness } };
    }
});
worldNodeRegistry.register('world.materialBlend', {
    name: 'Material Blend',
    category: 'Material',
    inputs: [
        { name: 'Material A', type: 'material', value: null },
        { name: 'Material B', type: 'material', value: null },
        { name: 'Blend', type: 'number', value: 0.5, min: 0, max: 1 }
    ],
    outputs: [{ name: 'Material', type: 'material' }],
    evaluate({ read }) {
        const a = read('Material A'), b = read('Material B');
        const blend = read('Blend');
        const amount = blend?.type === 'textureNumber'
            ? blend
            : Math.max(0, Math.min(1, Number(blend)));
        if (!a || !b) throw new Error('Material Blend requires Material A and Material B');
        if (amount?.type !== 'textureNumber' && !Number.isFinite(amount)) throw new Error('Material Blend requires a numeric Blend value');
        return { Material: { type: 'blend', mode: 'constant', a, b, amount } };
    }
});
worldNodeRegistry.register('world.slopeMaterialBlend', {
    name: 'Slope Material Blend',
    category: 'Material',
    inputs: [
        { name: 'Flat Material', type: 'material', value: null },
        { name: 'Steep Material', type: 'material', value: null },
        { name: 'Start Angle', type: 'number', value: 25, min: 0, max: 89 },
        { name: 'End Angle', type: 'number', value: 55, min: 1, max: 90 }
    ],
    outputs: [{ name: 'Material', type: 'material' }],
    evaluate({ read }) {
        const a = read('Flat Material'), b = read('Steep Material');
        const startAngle = Math.max(0, Math.min(89, Number(read('Start Angle'))));
        const endAngle = Math.max(startAngle + 0.01, Math.min(90, Number(read('End Angle'))));
        if (!a || !b) throw new Error('Slope Material Blend requires Flat Material and Steep Material');
        if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) throw new Error('Slope Material Blend angles must be numbers');
        return { Material: { type: 'blend', mode: 'slope', a, b, startAngle, endAngle } };
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
    evaluate({ read, node }) {
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
            Heightmap: applySculptStrokes({
                width: texture.width,
                height: texture.height,
                data
            }, node.sculptStrokes)
        };
    }
});
worldNodeRegistry.register('world.heightMap', {
    name: 'Height Map', category: 'Generators', inputs: [
        { name: 'Width', type: 'number', value: 129, min: 2, max: 513, integer: true },
        { name: 'Height', type: 'number', value: 129, min: 2, max: 513, integer: true },
        { name: 'Seed', type: 'number', value: 1, integer: true },
        { name: 'Scale', type: 'number', value: 4, min: 0.001 },
        { name: 'Amplitude', type: 'number', value: 0 },
        { name: 'Octaves', type: 'number', value: 5, min: 1, max: 12, integer: true },
        { name: 'Persistence', type: 'number', value: 0.5, min: 0, max: 1 },
        { name: 'Lacunarity', type: 'number', value: 2, min: 1 }
    ], outputs: [{ name: 'Heightmap', type: 'heightmap' }],
    evaluate({ read, node }) {
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
        return { Heightmap: applySculptStrokes({ width, height, data }, node.sculptStrokes) };
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
    inputs: [
        { name: 'Geometry', type: 'geometry', value: null },
        { name: 'Material', type: 'material', value: null },
        { name: 'UV Scale', type: 'vector2', value: [1, 1] },
        { name: 'UV Offset', type: 'vector2', value: [0, 0] }
    ],
    outputs: [{ name: 'Terrain', type: 'terrain' }],
    evaluate({ read, node }) {
        const geometry = read('Geometry');
        if (!geometry) throw new Error('Terrain Output requires Geometry');
        const hasPin = name => node.pins?.some(pin => pin.direction === 'input' && pin.name === name);
        const material = hasPin('Material') ? read('Material') : null;
        const uvScale = hasPin('UV Scale') ? read('UV Scale') : [1, 1];
        const uvOffset = hasPin('UV Offset') ? read('UV Offset') : [0, 0];
        if (!Array.isArray(uvScale) || uvScale.length !== 2 || !uvScale.every(Number.isFinite) || uvScale.some(value => value === 0)) throw new Error('Terrain Output requires a non-zero two-number UV Scale');
        if (!Array.isArray(uvOffset) || uvOffset.length !== 2 || !uvOffset.every(Number.isFinite)) throw new Error('Terrain Output requires a two-number UV Offset');
        return {
            Terrain: {
                geometry,
                material: material ? {
                    ...material,
                    terrainUvScale: [...uvScale],
                    terrainUvOffset: [...uvOffset]
                } : null
            }
        };
    }
});

module.exports = { WorldNodeRegistry, worldNodeRegistry, WORLD_DATA_TYPES: [...TYPES] };
