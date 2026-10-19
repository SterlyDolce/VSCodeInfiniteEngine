// @ts-nocheck
const zlib = require('zlib');

function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(dataUri) {
    const match = /^data:image\/png;base64,(.+)$/s.exec(dataUri ?? '');
    if (!match) throw new Error('Texture to Heightmap currently requires a PNG texture');
    const bytes = Buffer.from(match[1], 'base64');
    const signature = '89504e470d0a1a0a';
    if (bytes.subarray(0, 8).toString('hex') !== signature) {
        throw new Error('Invalid PNG texture data');
    }

    let width, height, bitDepth, colorType, interlace;
    const compressed = [];
    for (let offset = 8; offset + 12 <= bytes.length;) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        if (offset + 12 + length > bytes.length) throw new Error('Truncated PNG texture');
        const data = bytes.subarray(offset + 8, offset + 8 + length);
        offset += length + 12;
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === 'IDAT') compressed.push(data);
        else if (type === 'IEND') break;
    }

    const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
    if (!width || !height || ![8, 16].includes(bitDepth) || !channels || interlace !== 0) {
        throw new Error('Unsupported PNG format; use a non-interlaced 8-bit or 16-bit PNG');
    }

    const source = zlib.inflateSync(Buffer.concat(compressed));
    if (width * height > 16_777_216) throw new Error('Heightmap texture exceeds 16 million pixels');
    const bytesPerChannel = bitDepth / 8;
    const pixelBytes = channels * bytesPerChannel;
    const stride = width * pixelBytes;
    if (source.length !== (stride + 1) * height) throw new Error('Malformed PNG scanline data');
    const decoded = Buffer.alloc(stride * height);
    let sourceOffset = 0;
    for (let y = 0; y < height; y++) {
        const filter = source[sourceOffset++];
        const rowOffset = y * stride;
        for (let x = 0; x < stride; x++) {
            const raw = source[sourceOffset++];
            const left = x >= pixelBytes ? decoded[rowOffset + x - pixelBytes] : 0;
            const up = y > 0 ? decoded[rowOffset + x - stride] : 0;
            const upperLeft = y > 0 && x >= pixelBytes
                ? decoded[rowOffset + x - stride - pixelBytes]
                : 0;
            const value = filter === 0 ? raw
                : filter === 1 ? raw + left
                    : filter === 2 ? raw + up
                        : filter === 3 ? raw + Math.floor((left + up) / 2)
                            : filter === 4 ? raw + paeth(left, up, upperLeft)
                                : NaN;
            if (!Number.isFinite(value)) throw new Error(`Unsupported PNG filter: ${filter}`);
            decoded[rowOffset + x] = value & 255;
        }
    }

    const rgba = bitDepth === 16 ? new Uint16Array(width * height * 4) : new Uint8Array(width * height * 4);
    const maximum = bitDepth === 16 ? 65535 : 255;
    const readChannel = (pixel, channel) => {
        const byteOffset = pixel * pixelBytes + channel * bytesPerChannel;
        return bitDepth === 16 ? decoded.readUInt16BE(byteOffset) : decoded[byteOffset];
    };
    for (let pixel = 0; pixel < width * height; pixel++) {
        const target = pixel * 4;
        if (colorType === 0 || colorType === 4) {
            rgba[target] = rgba[target + 1] = rgba[target + 2] = readChannel(pixel, 0);
            rgba[target + 3] = colorType === 4 ? readChannel(pixel, 1) : maximum;
        } else {
            rgba[target] = readChannel(pixel, 0);
            rgba[target + 1] = readChannel(pixel, 1);
            rgba[target + 2] = readChannel(pixel, 2);
            rgba[target + 3] = colorType === 6 ? readChannel(pixel, 3) : maximum;
        }
    }
    return { width, height, data: rgba, maxValue: maximum };
}

async function resolveTerrainTextures(graph, assetManager) {
    const textures = new Map();
    const requiredPins = new Set((graph?.links ?? []).filter(link =>
        (graph?.nodes ?? []).some(node => node.type === 'world.textureToHeightmap' &&
            node.pins?.some(pin => pin.direction === 'input' && pin.name === 'Texture' && pin.id === link.to))
    ).map(link => link.from));
    for (const node of graph?.nodes ?? []) {
        if (node.type !== 'world.textureAsset') continue;
        const outputPin = node.pins?.find(pin => pin.direction === 'output' && pin.name === 'Texture');
        if (!requiredPins.has(outputPin?.id)) continue;
        const value = outputPin?.value;
        const id = typeof value === 'string' ? value.trim() : value?.id;
        if (!id) throw new Error('Texture Asset requires a selected texture');
        if (textures.has(id)) continue;
        // IEAssetManager historically resolves typed references, while node pins store UUID strings.
        const asset = await assetManager.resolve({ type: 'texture', id });
        if (!asset || asset.type !== 'texture') throw new Error(`Texture asset not found: ${id}`);
        textures.set(id, { id, name: asset.name, ...decodePng(asset.data?.image) });
    }
    return textures;
}

module.exports = { decodePng, resolveTerrainTextures };
