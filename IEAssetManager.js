// @ts-nocheck

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

class IEAssetManager {
    constructor(projectPath) {
        this.assetsPath = path.join(
            projectPath,
            'Assets'
        );

        this.index = new Map();
        this.cache = new Map();
    }

    async scan() {
        this.index.clear();
        this.cache.clear();

        await this.scanDirectory(this.assetsPath);

        return this;
    }

    async scanDirectory(directory) {
        let entries;

        try {
            entries = await fs.readdir(directory, {
                withFileTypes: true
            });
        } catch (error) {
            if (error.code === 'ENOENT') return;
            throw error;
        }

        for (const entry of entries) {
            const filePath = path.join(
                directory,
                entry.name
            );

            if (entry.isDirectory()) {
                await this.scanDirectory(filePath);
                continue;
            }

            if (
                !entry.isFile() ||
                !entry.name.endsWith('.ieasset')
            ) {
                continue;
            }

            const asset = JSON.parse(
                await fs.readFile(filePath, 'utf8')
            );

            if (!asset.id || !asset.type) {
                throw new Error(
                    `Invalid asset: ${filePath}`
                );
            }

            if (this.index.has(asset.id)) {
                throw new Error(
                    `Duplicate asset ID: ${asset.id}`
                );
            }

            this.index.set(asset.id, {
                path: filePath,
                type: asset.type,
                name: asset.name ?? entry.name
            });
        }
    }

    async getAsset(id) {
        if (this.cache.has(id)) {
            return this.cache.get(id);
        }

        const entry = this.index.get(id);

        if (!entry) return null;

        const asset = JSON.parse(
            await fs.readFile(
                entry.path,
                'utf8'
            )
        );

        if (
            asset.id !== id ||
            asset.type !== entry.type
        ) {
            throw new Error(
                `Asset identity mismatch: ${id}`
            );
        }

        this.cache.set(id, asset);

        return asset;
    }

    getAssets(type = null) {
        return [...this.index.entries()]
            .filter(([, asset]) =>
                !type || asset.type === type
            )
            .map(([id, asset]) => ({
                id,
                type: asset.type,
                name: asset.name
            }))
            .sort((a, b) =>
                a.name.localeCompare(b.name)
            );
    }

    async saveConvertedAssets(modelName, assets) {
        if (
            typeof modelName !== 'string' ||
            !/^[a-zA-Z0-9][a-zA-Z0-9 _.-]*$/.test(modelName) ||
            modelName === '.' ||
            modelName === '..'
        ) {
            throw new Error(
                'Invalid model name'
            );
        }

        if (
            !Array.isArray(assets) ||
            !assets.length
        ) {
            throw new Error(
                'No assets to save'
            );
        }

        const folders = {
            actor: '',
            geometry: 'Geometry',
            material: 'Materials',
            texture: 'Textures',
            skeleton: 'Skeletons',
            animation: 'Animations'
        };

        const ids = new Set();

        for (const asset of assets) {
            if (
                !asset ||
                typeof asset.id !== 'string' ||
                !/^[0-9a-f-]{36}$/i.test(asset.id) ||
                typeof asset.name !== 'string' ||
                !asset.name.trim() ||
                !asset.data ||
                typeof asset.data !== 'object' ||
                !Object.hasOwn(folders, asset.type)
            ) {
                throw new Error(
                    'Invalid converted asset'
                );
            }

            if (
                ids.has(asset.id) ||
                this.index.has(asset.id)
            ) {
                throw new Error(
                    `Duplicate asset ID: ${asset.id}`
                );
            }

            ids.add(asset.id);
        }

        await fs.mkdir(
            this.assetsPath,
            { recursive: true }
        );

        const destination = path.join(
            this.assetsPath,
            modelName
        );

        const temporary = path.join(
            this.assetsPath,
            `.ieimport-${crypto.randomUUID()}`
        );

        try {
            try {
                await fs.access(destination);

                throw new Error(
                    `Asset folder already exists: ${modelName}`
                );
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            }

            await fs.mkdir(temporary);

            // Track used filenames separately per folder.
            const usedNames = new Map();

            for (const asset of assets) {
                const relativeFolder =
                    folders[asset.type];

                const folder = path.join(
                    temporary,
                    relativeFolder
                );

                await fs.mkdir(folder, {
                    recursive: true
                });

                const safeName = asset.name
                    .replace(
                        /[^a-zA-Z0-9 _.-]/g,
                        '_'
                    )
                    .trim() || asset.type;

                if (!usedNames.has(relativeFolder)) {
                    usedNames.set(
                        relativeFolder,
                        new Set()
                    );
                }

                const names =
                    usedNames.get(relativeFolder);

                let filename =
                    `${safeName}.ieasset`;

                let suffix = 2;

                while (names.has(filename.toLowerCase())) {
                    filename =
                        `${safeName}_${suffix++}.ieasset`;
                }

                names.add(filename.toLowerCase());

                await fs.writeFile(
                    path.join(
                        folder,
                        filename
                    ),
                    JSON.stringify(
                        asset,
                        null,
                        4
                    ),
                    {
                        encoding: 'utf8',
                        flag: 'wx'
                    }
                );
            }

            await fs.rename(
                temporary,
                destination
            );

            await this.scan();

            return {
                directory: destination,
                assetCount: assets.length
            };
        } finally {
            await fs.rm(temporary, {
                recursive: true,
                force: true
            });
        }
    }

    async resolveMaterialForScene(
        materialReference
    ) {
        const asset = await this.resolve(
            materialReference
        );

        if (!asset) return null;

        if (asset.type !== 'material') {
            throw new Error(
                `Expected material asset, got: ${asset.type}`
            );
        }

        const data = {
            ...asset.data
        };

        const textureFields = [
            'map',
            'normalMap',
            'roughnessMap',
            'metalnessMap',
            'aoMap',
            'emissiveMap',
            'bumpMap',
            'displacementMap',
            'alphaMap',
            'lightMap'
        ];

        await Promise.all(
            textureFields.map(async field => {
                const reference = data[field];

                if (!reference) return;

                const texture =
                    await this.resolve(reference);

                if (
                    !texture ||
                    texture.type !== 'texture'
                ) {
                    throw new Error(
                        `Texture asset not found: ${field} ` +
                        `(${reference.id ?? reference})`
                    );
                }

                const resolvedField =
                    'resolved' +
                    field[0].toUpperCase() +
                    field.slice(1);

                data[resolvedField] = texture;
            })
        );

        return data;
    }

    async resolve(reference) {
        if (
            !reference?.id ||
            !reference?.type
        ) {
            return null;
        }

        const asset = await this.getAsset(
            reference.id
        );

        if (
            !asset ||
            asset.type !== reference.type
        ) {
            return null;
        }

        return asset;
    }
}

module.exports = IEAssetManager;
