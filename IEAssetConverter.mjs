// @ts-nocheck

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function convertGLB(
    arrayBuffer,
    modelName = 'Imported Model'
) {
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(arrayBuffer, '');

    return convertModel(
        gltf.scene,
        modelName,
        gltf.animations ?? []
    );
}

export async function convertModel(
    scene,
    modelName = 'Imported Model',
    animations = []
) {
    const assets = [];
    const components = [];

    const geometryCache = new Map();
    const materialCache = new Map();
    const textureCache = new Map();
    const skeletonCache = new Map();

    const uuid = () => crypto.randomUUID();

    const createAsset = (type, name, data) => {
        const asset = {
            id: uuid(),
            type,
            name,
            data
        };

        assets.push(asset);

        return {
            type,
            id: asset.id
        };
    };

    // Extract attributes even if Three.js uses
    // interleaved buffer attributes.
    const readAttribute = attribute => {
        if (!attribute) return [];

        const values = [];

        for (let i = 0; i < attribute.count; i++) {
            values.push(attribute.getX(i));

            if (attribute.itemSize > 1)
                values.push(attribute.getY(i));

            if (attribute.itemSize > 2)
                values.push(attribute.getZ(i));

            if (attribute.itemSize > 3)
                values.push(attribute.getW(i));
        }

        return values;
    };

    // -----------------------------------------
    // Texture
    // -----------------------------------------

    const getTexture = async (texture, name) => {
        if (textureCache.has(texture)) {
            return textureCache.get(texture);
        }

        const image = await serializeTextureImage(texture);

        const reference = createAsset('texture', name, {
            mimeType: 'image/png',
            image,

            colorSpace: texture.colorSpace,
            flipY: texture.flipY,

            wrapS: texture.wrapS,
            wrapT: texture.wrapT,

            magFilter: texture.magFilter,
            minFilter: texture.minFilter,

            offset: texture.offset.toArray(),
            repeat: texture.repeat.toArray(),
            rotation: texture.rotation,
            center: texture.center.toArray()
        });

        textureCache.set(texture, reference);
        return reference;
    };

    // -----------------------------------------
    // Geometry
    // -----------------------------------------

    const getGeometry = (geometry, name) => {
        if (geometryCache.has(geometry)) {
            return geometryCache.get(geometry);
        }

        const position = geometry.getAttribute('position');

        if (!position || position.itemSize !== 3) {
            throw new Error(`Invalid geometry: ${name}`);
        }

        if (geometry.morphAttributes.position?.length) {
            throw new Error(
                `Morph targets are not supported: ${name}`
            );
        }

        if (geometry.getAttribute('color')) {
            throw new Error(
                `Vertex colors are not supported yet: ${name}`
            );
        }

        const normal = geometry.getAttribute('normal');
        const uv = geometry.getAttribute('uv');

        const skinIndex = geometry.getAttribute('skinIndex');
        const skinWeight = geometry.getAttribute('skinWeight');

        if (Boolean(skinIndex) !== Boolean(skinWeight)) {
            throw new Error(
                `Incomplete skin attributes: ${name}`
            );
        }

        if (skinIndex) {
            if (
                skinIndex.itemSize !== 4 ||
                skinWeight.itemSize !== 4 ||
                skinIndex.count !== position.count ||
                skinWeight.count !== position.count
            ) {
                throw new Error(
                    `Invalid skin attributes: ${name}`
                );
            }
        }

        const data = {
            type: 'buffer',

            positions: readAttribute(position),
            normals: readAttribute(normal),
            uvs: readAttribute(uv),

            indices: geometry.index
                ? Array.from(geometry.index.array)
                : []
        };

        if (skinIndex) {
            data.skinIndices = readAttribute(skinIndex);
            data.skinWeights = readAttribute(skinWeight);
        }

        // Preserve existing geometry material groups.
        if (geometry.groups.length) {
            data.groups = geometry.groups.map(group => ({
                start: group.start,
                count: group.count,
                materialIndex: group.materialIndex
            }));
        }

        const reference = createAsset(
            'geometry',
            name,
            data
        );

        geometryCache.set(geometry, reference);

        return reference;
    };

    // -----------------------------------------
    // Material
    // -----------------------------------------

    const getMaterial = async (material, name) => {
        if (materialCache.has(material)) {
            return materialCache.get(material);
        }


        const uniformValue = key =>
            material.uniforms?.[key]?.value;

        const colorValue = (key, fallback) => {
            const value = material[key] ?? uniformValue(key);

            return value?.isColor
                ? `#${value.getHexString()}`
                : fallback;
        };

        const numberValue = (key, fallback) => {
            const value = material[key] ?? uniformValue(key);
            return Number.isFinite(value) ? value : fallback;
        };

        const vector2Value = (key, fallback) => {
            const value = material[key] ?? uniformValue(key);

            return value?.isVector2
                ? [value.x, value.y]
                : fallback;
        };

        const getMap = async (key, suffix) => {
            const texture =
                material[key] ?? uniformValue(key);

            return texture?.isTexture
                ? getTexture(texture, `${name}_${suffix}`)
                : null;
        };

        const [
            map,
            normalMap,
            roughnessMap,
            metalnessMap,
            aoMap,
            emissiveMap,
            bumpMap,
            displacementMap,
            alphaMap,
            lightMap
        ] = await Promise.all([
            getMap('map', 'BaseColor'),
            getMap('normalMap', 'Normal'),
            getMap('roughnessMap', 'Roughness'),
            getMap('metalnessMap', 'Metalness'),
            getMap('aoMap', 'AO'),
            getMap('emissiveMap', 'Emissive'),
            getMap('bumpMap', 'Bump'),
            getMap('displacementMap', 'Displacement'),
            getMap('alphaMap', 'Alpha'),
            getMap('lightMap', 'Light')
        ]);

        const reference = createAsset('material', name, {
            type: material.isMeshBasicMaterial
                ? 'basic'
                : material.isMeshPhongMaterial
                    ? 'phong'
                    : 'standard',

            color: colorValue('color', '#ffffff'),
            metalness: numberValue('metalness', 0),
            roughness: numberValue('roughness', 1),
            shininess: numberValue('shininess', 30),
            wireframe: material.wireframe ?? false,

            map,
            normalMap,
            normalScale: vector2Value('normalScale', [1, 1]),

            roughnessMap,
            metalnessMap,

            aoMap,
            aoMapIntensity: numberValue('aoMapIntensity', 1),

            emissive: colorValue('emissive', '#000000'),
            emissiveIntensity:
                numberValue('emissiveIntensity', 1),
            emissiveMap,

            bumpMap,
            bumpScale: numberValue('bumpScale', 1),

            displacementMap,
            displacementScale:
                numberValue('displacementScale', 1),
            displacementBias:
                numberValue('displacementBias', 0),

            alphaMap,

            lightMap,
            lightMapIntensity:
                numberValue('lightMapIntensity', 1),

            side: material.side ?? THREE.DoubleSide,
            transparent: material.transparent ?? false,
            opacity: numberValue('opacity', 1),
            alphaTest: numberValue('alphaTest', 0)
        });

        materialCache.set(material, reference);

        return reference;
    };

    // -----------------------------------------
    // Skeleton
    // -----------------------------------------

    scene.updateMatrixWorld(true);

    const getSkeleton = (skeleton, name) => {
        if (skeletonCache.has(skeleton)) {
            return skeletonCache.get(skeleton);
        }

        const hierarchy = new Set();

        // Include bone ancestors, including intermediary
        // regular Object3D nodes.
        for (const bone of skeleton.bones) {
            let node = bone;

            while (node && node !== scene) {
                hierarchy.add(node);
                node = node.parent;
            }
        }

        const nodes = [];
        const nodeIds = new Map();

        scene.traverse(node => {
            if (!hierarchy.has(node)) return;

            const id = uuid();
            nodeIds.set(node, id);

            nodes.push({
                id,
                sourceUUID: node.uuid,
                name: node.name,
                isBone: Boolean(node.isBone),

                parentId: null,

                position: node.position.toArray(),
                quaternion: node.quaternion.toArray(),
                scale: node.scale.toArray()
            });
        });

        if (
            skeleton.bones.some(
                bone => !nodeIds.has(bone)
            )
        ) {
            throw new Error(
                `Skeleton has bones outside the scene: ${name}`
            );
        }

        for (const node of hierarchy) {
            const id = nodeIds.get(node);
            const entry = nodes.find(n => n.id === id);

            if (entry) {
                entry.parentId =
                    nodeIds.get(node.parent) ?? null;
            }
        }

        const data = {
            nodes,

            // Order is important:
            // skinIndices refer to these entries.
            bones: skeleton.bones.map(
                bone => nodeIds.get(bone)
            ),

            boneInverses: skeleton.boneInverses.map(
                matrix => matrix.toArray()
            )
        };

        const reference = createAsset(
            'skeleton',
            name,
            data
        );

        skeletonCache.set(skeleton, reference);

        return reference;
    };

    // -----------------------------------------
    // Animations
    // -----------------------------------------

    const getAnimation = (clip, index) => {
        const name = clip.name || `Animation_${index + 1}`;

        return createAsset('animation', name, {
            duration: clip.duration,
            blendMode: clip.blendMode,

            tracks: clip.tracks.map(track => ({
                name: track.name,
                type: track.constructor.name,
                interpolation: track.getInterpolation(),

                times: Array.from(track.times),
                values: Array.from(track.values)
            }))
        });
    };

    const animationReferences = animations.map(
        (clip, index) => getAnimation(clip, index)
    );

    // -----------------------------------------
    // Mesh components
    // -----------------------------------------

    const inverseRoot =
        scene.matrixWorld.clone().invert();

    const meshComponents = [];
    const meshes = [];

    scene.traverse(object => {
        if (object.isMesh) {
            meshes.push(object);
        }
    });

    let meshIndex = 0;

    for (const object of meshes) {
        const index = meshIndex++;
        const name = object.name || `Mesh ${index}`;

        const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];

        if (materials.length > 1) {
            throw new Error(
                `Multiple materials per mesh are not supported yet: ${name}`
            );
        }

        const localMatrix = inverseRoot
            .clone()
            .multiply(object.matrixWorld);

        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const scale = new THREE.Vector3();

        localMatrix.decompose(
            position,
            rotation,
            scale
        );

        const recomposed = new THREE.Matrix4().compose(
            position,
            rotation,
            scale
        );

        if (
            localMatrix.elements.some(
                (value, i) =>
                    Math.abs(
                        value - recomposed.elements[i]
                    ) > 0.0001
            )
        ) {
            throw new Error(
                `Mesh transform contains unsupported shear: ${name}`
            );
        }

        const euler = new THREE.Euler()
            .setFromQuaternion(rotation, 'XYZ');

        const geometry = getGeometry(
            object.geometry,
            `${name}_Geometry`
        );

        const materialReferences = [];

        for (
            const [i, material] of materials.entries()
        ) {
            if (!material) continue;

            materialReferences.push(
                await getMaterial(
                    material,
                    material.name || `${name}_Material_${i}`
                )
            );
        }

        const component = {
            id: uuid(),
            name,
            type: 'mesh',
            enabled: object.visible,

            position: position.toArray(),
            rotation: [
                euler.x,
                euler.y,
                euler.z
            ],
            scale: scale.toArray(),

            geometry,
            materials: materialReferences
        };

        if (object.isSkinnedMesh) {
            component.skinned = true;

            component.skeleton = getSkeleton(
                object.skeleton,
                `${name}_Skeleton`
            );

            component.bindMatrix =
                object.bindMatrix.toArray();

            component.bindMode =
                object.bindMode;
        }

        meshComponents.push(component);
    }

    if (!meshComponents.length) {
        throw new Error(
            'Model does not contain any meshes'
        );
    }

    // -----------------------------------------
    // Actor asset
    // -----------------------------------------

    const rootPosition = new THREE.Vector3();
    const rootRotation = new THREE.Quaternion();
    const rootScale = new THREE.Vector3();

    scene.matrixWorld.decompose(
        rootPosition,
        rootRotation,
        rootScale
    );

    const rootEuler = new THREE.Euler()
        .setFromQuaternion(rootRotation, 'XYZ');

    components.push({
        id: uuid(),
        type: 'transform',
        enabled: true,

        position: rootPosition.toArray(),

        rotation: [
            rootEuler.x,
            rootEuler.y,
            rootEuler.z
        ],

        scale: rootScale.toArray()
    });

    components.push(...meshComponents);

    components.push({
        id: uuid(),
        type: 'script',
        enabled: true,
        script: null
    });

    const actor = {
        name: modelName,
        type: 'Mesh',
        components,

        // References to imported animation assets.
        animations: animationReferences
    };

    const actorAsset = createAsset(
        'actor',
        modelName,
        actor
    );

    return {
        actorAsset,
        assets,
        meshCount: meshComponents.length,
        animationCount: animationReferences.length
    };
}

async function serializeTextureImage(texture) {
    const image = texture.image;

    if (!image) {
        throw new Error(
            `Texture has no image: ${texture.name}`
        );
    }

    const width = image.width || image.videoWidth;
    const height = image.height || image.videoHeight;

    if (!width || !height) {
        throw new Error(
            `Invalid texture dimensions: ${texture.name}`
        );
    }

    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (!context) {
        throw new Error(
            'Unable to create texture canvas'
        );
    }

    context.drawImage(
        image,
        0,
        0,
        width,
        height
    );

    return canvas.toDataURL('image/png');
}
