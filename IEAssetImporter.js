// @ts-nocheck

const vscode = require('vscode');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const IEAssetManager = require('./IEAssetManager');

const IMAGE_LIMIT = 64 * 1024 * 1024;
const MODEL_LIMIT = 256 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeName(value, fallback = 'Imported Asset') {
    return String(value ?? '').replace(/[^a-zA-Z0-9 _.-]/g, '_')
        .replace(/^\.+$/, '').trim() || fallback;
}

function replaceIds(value, ids) {
    if (typeof value === 'string') return ids.get(value) ?? value;
    if (Array.isArray(value)) return value.map(item => replaceIds(item, ids));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceIds(item, ids)]));
}

class IEAssetImporter {
    static pendingModelImports = new Set();

    constructor(projectPath, options = {}) {
        if (!path.isAbsolute(projectPath)) throw new Error('The project path must be absolute.');
        this.projectPath = path.resolve(projectPath);
        this.assetManager = options.assetManager ?? new IEAssetManager(this.projectPath);
        this.handlers = new Map();
        this.registerHandler(new IEImageImportHandler());
        this.registerHandler(new IEModelImportHandler());
    }

    registerHandler(handler) {
        if (!handler?.extensions?.length || typeof handler.import !== 'function') {
            throw new Error('Invalid asset import handler.');
        }
        for (const extension of handler.extensions) {
            this.handlers.set(extension.toLowerCase().replace(/^\./, ''), handler);
        }
        return this;
    }

    getSupportedExtensions() {
        return [...this.handlers.keys()].sort();
    }

    async getHandler(filePath) {
        const extension = path.extname(filePath).slice(1).toLowerCase();
        const handler = this.handlers.get(extension);
        if (!handler) throw new Error(`Unsupported asset format: .${extension || '(none)'}`);
        if (handler.detect && !(await handler.detect(filePath))) {
            throw new Error(`File contents do not match the .${extension} format.`);
        }
        return handler;
    }

    async importFiles(files, options = {}) {
        const unique = [...new Set(files.map(file => path.resolve(file)))];
        const results = [];
        for (const filePath of unique) {
            try {
                const handler = await this.getHandler(filePath);
                const result = await handler.import(filePath, this, options);
                results.push({ source: filePath, success: true, ...result });
            } catch (error) {
                results.push({ source: filePath, success: false, error: error instanceof Error ? error.message : String(error) });
            }
        }
        return results;
    }

    async saveAssets(sourcePath, handlerName, assets, options = {}) {
        if (!Array.isArray(assets) || !assets.length) throw new Error('The importer did not create any assets.');
        await this.assetManager.scan();
        const source = path.resolve(sourcePath);
        const existing = [];
        for (const [id, entry] of this.assetManager.index) {
            const asset = await this.assetManager.getAsset(id);
            if (asset?.import?.source === source) existing.push({ asset, entry });
        }

        const existingByKey = new Map(existing.map(item => [item.asset.import.key, item]));
        const occurrences = new Map();
        const ids = new Map();
        const prepared = assets.map(asset => {
            this.validateAsset(asset);
            const signature = `${asset.type}:${asset.name}`;
            const count = occurrences.get(signature) ?? 0;
            occurrences.set(signature, count + 1);
            const key = asset.import?.key ?? `${signature}:${count}`;
            const previous = existingByKey.get(key)?.asset;
            const nextId = previous?.id ?? asset.id ?? crypto.randomUUID();
            if (asset.id) ids.set(asset.id, nextId);
            return {
                ...asset,
                id: nextId,
                name: previous?.name ?? asset.name,
                import: { source, handler: handlerName, key }
            };
        });
        const rewritten = prepared.map(asset => replaceIds(asset, ids));
        const destination = options.bundle
            ? await this.writeBundle(options.bundle, rewritten, existing)
            : await this.writeSingle(rewritten[0], existing[0]);
        await this.assetManager.scan();
        return { directory: destination, assetCount: rewritten.length, assets: rewritten, reimported: existing.length > 0 };
    }

    validateAsset(asset) {
        if (!asset || typeof asset !== 'object' || (asset.id && !UUID.test(asset.id)) ||
            typeof asset.type !== 'string' || !asset.type || typeof asset.name !== 'string' ||
            !asset.name.trim() || !asset.data || typeof asset.data !== 'object') {
            throw new Error('Importer produced an invalid IEAsset.');
        }
        if (Buffer.byteLength(JSON.stringify(asset), 'utf8') > MODEL_LIMIT) {
            throw new Error(`Imported asset is too large: ${asset.name}`);
        }
    }

    async writeSingle(asset, previous) {
        const folder = path.join(this.assetManager.assetsPath, 'Textures');
        await fs.mkdir(folder, { recursive: true });
        let destination = previous?.entry.path;
        if (!destination) {
            const base = safeName(asset.name, 'Texture');
            destination = path.join(folder, `${base}.ieasset`);
            for (let suffix = 2; await exists(destination); suffix++) {
                destination = path.join(folder, `${base}_${suffix}.ieasset`);
            }
        }
        await atomicWrite(destination, JSON.stringify(asset, null, 4) + '\n');
        return destination;
    }

    async writeBundle(bundleName, assets, existing) {
        const folders = { actor: '', geometry: 'Geometry', material: 'Materials', texture: 'Textures', skeleton: 'Skeletons', animation: 'Animations' };
        for (const asset of assets) {
            if (!Object.hasOwn(folders, asset.type)) throw new Error(`Unsupported converted asset type: ${asset.type}`);
        }
        await fs.mkdir(this.assetManager.assetsPath, { recursive: true });
        let destination;
        if (existing.length) {
            const relative = path.relative(this.assetManager.assetsPath, existing[0].entry.path);
            destination = path.join(this.assetManager.assetsPath, relative.split(path.sep)[0]);
        } else {
            const base = safeName(bundleName, 'Imported Model');
            destination = path.join(this.assetManager.assetsPath, base);
            for (let suffix = 2; await exists(destination); suffix++) {
                destination = path.join(this.assetManager.assetsPath, `${base}_${suffix}`);
            }
        }

        const temporary = path.join(this.assetManager.assetsPath, `.ieimport-${crypto.randomUUID()}`);
        const backup = path.join(this.assetManager.assetsPath, `.iebackup-${crypto.randomUUID()}`);
        await fs.mkdir(temporary);
        try {
            const names = new Map();
            for (const asset of assets) {
                const relativeFolder = folders[asset.type];
                const folder = path.join(temporary, relativeFolder);
                await fs.mkdir(folder, { recursive: true });
                const used = names.get(relativeFolder) ?? new Set();
                names.set(relativeFolder, used);
                const base = safeName(asset.name, asset.type);
                let filename = `${base}.ieasset`;
                for (let suffix = 2; used.has(filename.toLowerCase()); suffix++) filename = `${base}_${suffix}.ieasset`;
                used.add(filename.toLowerCase());
                await fs.writeFile(path.join(folder, filename), JSON.stringify(asset, null, 4) + '\n', { flag: 'wx' });
            }
            if (await exists(destination)) await fs.rename(destination, backup);
            try {
                await fs.rename(temporary, destination);
            } catch (error) {
                if (await exists(backup)) await fs.rename(backup, destination);
                throw error;
            }
            await fs.rm(backup, { recursive: true, force: true });
            return destination;
        } finally {
            await fs.rm(temporary, { recursive: true, force: true });
        }
    }

    static queueModelImport(uri) { this.pendingModelImports.add(uri.toString()); }
    static consumeModelImport(uri) {
        const key = uri.toString();
        const pending = this.pendingModelImports.has(key);
        this.pendingModelImports.delete(key);
        return pending;
    }
}

class IEImageImportHandler {
    constructor() { this.name = 'image'; this.extensions = ['png', 'jpg', 'jpeg', 'webp']; }
    async detect(filePath) {
        const bytes = await readHeader(filePath, 12, IMAGE_LIMIT);
        return detectImage(bytes, path.extname(filePath).slice(1).toLowerCase()) !== null;
    }
    async import(filePath, importer) {
        const stats = await validateFile(filePath, IMAGE_LIMIT);
        const bytes = await fs.readFile(filePath);
        if (bytes.length !== stats.size) throw new Error('Source image changed during import.');
        const format = detectImage(bytes.subarray(0, 12));
        if (!format) throw new Error('Unsupported or malformed image file.');
        const name = path.basename(filePath, path.extname(filePath));
        const asset = {
            id: crypto.randomUUID(), type: 'texture', name,
            data: {
                mimeType: format.mime, image: `data:${format.mime};base64,${bytes.toString('base64')}`,
                colorSpace: 'srgb', flipY: false, wrapS: 1000, wrapT: 1000,
                magFilter: 1006, minFilter: 1008, offset: [0, 0], repeat: [1, 1], center: [0, 0], rotation: 0
            },
            import: { key: 'texture:source:0' }
        };
        return importer.saveAssets(filePath, this.name, [asset]);
    }
}

class IEModelImportHandler {
    constructor() { this.name = 'gltf'; this.extensions = ['glb', 'gltf']; }
    async detect(filePath) {
        const extension = path.extname(filePath).toLowerCase();
        if (extension === '.glb') {
            const stats = await validateFile(filePath, MODEL_LIMIT);
            const header = await readHeader(filePath, 12, MODEL_LIMIT);
            return header.length === 12 && header.toString('ascii', 0, 4) === 'glTF' &&
                header.readUInt32LE(4) === 2 && header.readUInt32LE(8) === stats.size;
        }
        try {
            await validateFile(filePath, 32 * 1024 * 1024);
            const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
            return data?.asset?.version?.startsWith('2.');
        } catch { return false; }
    }
    async import(filePath) {
        await validateFile(filePath, MODEL_LIMIT);
        if (path.extname(filePath).toLowerCase() === '.gltf') await validateGltfDependencies(filePath);
        const uri = vscode.Uri.file(filePath);
        IEAssetImporter.queueModelImport(uri);
        await vscode.commands.executeCommand('vscode.openWith', uri, 'infinite.modelViewer');
        await vscode.commands.executeCommand('infinite.importModelAsset', uri);
        return { pending: true, assetCount: 0, message: 'Model opened for conversion.' };
    }
}

async function validateFile(filePath, limit) {
    if (!path.isAbsolute(filePath)) throw new Error('Source path must be absolute.');
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) throw new Error('Source is not a file.');
    if (!stats.size) throw new Error('Source file is empty.');
    if (stats.size > limit) throw new Error(`Source exceeds the ${Math.floor(limit / 1024 / 1024)} MB import limit.`);
    return stats;
}

async function readHeader(filePath, length, limit) {
    await validateFile(filePath, limit);
    const handle = await fs.open(filePath, 'r');
    try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, 0);
        return buffer.subarray(0, bytesRead);
    } finally { await handle.close(); }
}

function detectImage(bytes, expected) {
    let format = null;
    if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') format = { extension: 'png', mime: 'image/png' };
    else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) format = { extension: 'jpeg', mime: 'image/jpeg' };
    else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') format = { extension: 'webp', mime: 'image/webp' };
    if (!expected || !format) return format;
    return format.extension === (expected === 'jpg' ? 'jpeg' : expected) ? format : null;
}

async function validateGltfDependencies(filePath) {
    const document = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const dependencies = [...(document.buffers ?? []), ...(document.images ?? [])]
        .map(item => item.uri).filter(Boolean).filter(uri => !uri.startsWith('data:'));
    for (const uri of dependencies) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) throw new Error(`Remote GLTF dependency is not supported: ${uri}`);
        const dependency = path.resolve(path.dirname(filePath), decodeURIComponent(uri.split(/[?#]/, 1)[0]));
        const stats = await fs.stat(dependency).catch(() => null);
        if (!stats?.isFile()) throw new Error(`Missing GLTF dependency: ${uri}`);
        if (stats.size > MODEL_LIMIT) throw new Error(`GLTF dependency exceeds 256 MB: ${uri}`);
    }
}

async function exists(filePath) {
    try { await fs.access(filePath); return true; } catch { return false; }
}

async function atomicWrite(destination, content) {
    const temporary = `${destination}.tmp-${crypto.randomUUID()}`;
    const backup = `${destination}.backup-${crypto.randomUUID()}`;
    try {
        await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
        if (await exists(destination)) await fs.rename(destination, backup);
        try {
            await fs.rename(temporary, destination);
        } catch (error) {
            if (await exists(backup)) await fs.rename(backup, destination);
            throw error;
        }
        await fs.rm(backup, { force: true });
    } finally {
        await fs.rm(temporary, { force: true });
    }
}

module.exports = IEAssetImporter;
module.exports.IEImageImportHandler = IEImageImportHandler;
module.exports.IEModelImportHandler = IEModelImportHandler;
module.exports._internals = { detectImage, replaceIds, safeName, validateGltfDependencies };
