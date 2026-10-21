// @ts-nocheck
import * as THREE from 'three';

function createDataTexture(data, colorSpace = THREE.NoColorSpace) {
	if (!data?.data || !data.width || !data.height) return null;
	const type = data.data instanceof Uint16Array
		? THREE.UnsignedShortType
		: THREE.UnsignedByteType;
	const texture = new THREE.DataTexture(
		data.data,
		data.width,
		data.height,
		THREE.RGBAFormat,
		type
	);
	// Numeric textures (height/mask data) must remain linear. Marking a blend
	// mask as sRGB makes the renderer gamma-decode it, turning a 50% mask into
	// roughly 21% and visually collapsing most of the blend into Material A.
	texture.colorSpace = colorSpace;
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.needsUpdate = true;
	return texture;
}

function createAssetTexture(asset, colorSpace = THREE.NoColorSpace, scale = [1, 1], offset = [0, 0]) {
	const data = asset?.data ?? asset;
	if (typeof data?.image !== 'string' || !data.image) return null;
	const texture = new THREE.TextureLoader().load(data.image);
	texture.colorSpace = colorSpace;
	texture.wrapS = data.wrapS ?? THREE.RepeatWrapping;
	texture.wrapT = data.wrapT ?? THREE.RepeatWrapping;
	texture.magFilter = data.magFilter ?? THREE.LinearFilter;
	texture.minFilter = data.minFilter ?? THREE.LinearMipmapLinearFilter;
	texture.flipY = data.flipY ?? true;
	texture.offset.fromArray(data.offset ?? [0, 0]).add(
		new THREE.Vector2().fromArray(offset)
	);
	texture.repeat.fromArray(data.repeat ?? [1, 1]).multiply(
		new THREE.Vector2().fromArray(scale)
	);
	texture.center.fromArray(data.center ?? [0, 0]);
	texture.rotation = data.rotation ?? 0;
	texture.needsUpdate = true;
	return texture;
}

function createMaterialTexture(data, field, colorSpace, scale = [1, 1], offset = [0, 0]) {
	if (field === 'map' && data?.texture) {
		const texture = createDataTexture(data.texture, colorSpace);
		if (texture) {
			texture.repeat.fromArray(scale);
			texture.offset.fromArray(offset);
		}
		return texture;
	}
	const resolved = data?.[`resolved${field[0].toUpperCase()}${field.slice(1)}`];
	return createAssetTexture(resolved, colorSpace, scale, offset);
}

function createMaskTexture(signal) {
	const source = signal?.texture;
	if (!source?.data || !source.width || !source.height) return null;
	const maximum = Number(source.maxValue) ||
		(source.data instanceof Uint16Array ? 65535 : 255);
	const pixels = source.width * source.height;
	const rgba = new Uint8Array(pixels * 4);
	for (let pixel = 0; pixel < pixels; pixel++) {
		const offset = pixel * 4;
		const red = Number(source.data[offset]) / maximum;
		const green = Number(source.data[offset + 1]) / maximum;
		const blue = Number(source.data[offset + 2]) / maximum;
		const alpha = Number(source.data[offset + 3]) / maximum;
		const value = signal.channel === 'Red' ? red
			: signal.channel === 'Green' ? green
				: signal.channel === 'Blue' ? blue
					: signal.channel === 'Alpha' ? alpha
						: red * 0.2126 + green * 0.7152 + blue * 0.0722;
		const byte = Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
		rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = byte;
		rgba[offset + 3] = 255;
	}
	const texture = createDataTexture({ width: source.width, height: source.height, data: rgba });
	texture.userData.sourceTextureId = source.id;
	return texture;
}

function averageProperty(data, name, fallback) {
	if (data?.type !== 'blend') return data?.[name] ?? fallback;
	return (averageProperty(data.a, name, fallback) +
		averageProperty(data.b, name, fallback)) / 2;
}

export function createTerrainGraphMaterial(data, source, wireframe, fallback) {
	if (!data) return fallback(source, wireframe);
	if (data.type !== 'blend') {
		const scale = (data.textureScale ?? [1, 1]).map((value, index) => value * (data.terrainUvScale?.[index] ?? 1));
		const offset = data.terrainUvOffset ?? [0, 0];
		const map = createMaterialTexture(data, 'map', THREE.SRGBColorSpace, scale, offset);
		const normalMap = createMaterialTexture(data, 'normalMap', THREE.NoColorSpace, scale, offset);
		const roughnessMap = createMaterialTexture(data, 'roughnessMap', THREE.NoColorSpace, scale, offset);
		const metalnessMap = createMaterialTexture(data, 'metalnessMap', THREE.NoColorSpace, scale, offset);
		const aoMap = createMaterialTexture(data, 'aoMap', THREE.NoColorSpace, scale, offset);
		const emissiveMap = createMaterialTexture(data, 'emissiveMap', THREE.SRGBColorSpace, scale, offset);
		const bumpMap = createMaterialTexture(data, 'bumpMap', THREE.NoColorSpace, scale, offset);
		const displacementMap = createMaterialTexture(data, 'displacementMap', THREE.NoColorSpace, scale, offset);
		const alphaMap = createMaterialTexture(data, 'alphaMap', THREE.NoColorSpace, scale, offset);
		const lightMap = createMaterialTexture(data, 'lightMap', THREE.SRGBColorSpace, scale, offset);
		const material = new THREE.MeshStandardMaterial({
			color: data.color ?? '#ffffff',
			map,
			normalMap,
			normalScale: new THREE.Vector2().fromArray(data.normalScale ?? [1, 1]),
			roughness: data.roughness ?? 0.9,
			roughnessMap,
			metalness: data.metalness ?? 0,
			metalnessMap,
			aoMap,
			aoMapIntensity: data.aoMapIntensity ?? 1,
			emissive: data.emissive ?? '#000000',
			emissiveMap,
			emissiveIntensity: data.emissiveIntensity ?? 1,
			bumpMap,
			bumpScale: data.bumpScale ?? 1,
			displacementMap,
			displacementScale: data.displacementScale ?? 1,
			displacementBias: data.displacementBias ?? 0,
			alphaMap,
			lightMap,
			lightMapIntensity: data.lightMapIntensity ?? 1,
			transparent: data.transparent ?? false,
			opacity: data.opacity ?? 1,
			alphaTest: data.alphaTest ?? 0,
			side: data.side ?? THREE.DoubleSide,
			wireframe
		});
		material.userData.terrainTextures = [
			map, normalMap, roughnessMap, metalnessMap, aoMap, emissiveMap,
			bumpMap, displacementMap, alphaMap, lightMap
		].filter(Boolean);
		return material;
	}

	const material = new THREE.MeshStandardMaterial({
		color: 0xffffff,
		roughness: averageProperty(data, 'roughness', 0.9),
		metalness: averageProperty(data, 'metalness', 0),
		wireframe
	});
	const uniforms = {};
	const declarations = [];
	const functions = [];
	const textures = [];
	let layerIndex = 0;

	const compile = node => {
		if (node?.type === 'blend') {
			const a = compile(node.a);
			const b = compile(node.b);
			if (node.mode === 'slope') {
				const start = THREE.MathUtils.degToRad(node.startAngle ?? 25);
				const end = THREE.MathUtils.degToRad(node.endAngle ?? 55);
				const low = Math.sin(start);
				const high = Math.max(low + 0.0001, Math.sin(end));
				return `mix(${a}, ${b}, smoothstep(${low.toFixed(8)}, ${high.toFixed(8)}, 1.0 - abs(normalize(vTerrainNormal).y)))`;
			}
			if (node.amount?.type === 'textureNumber') {
				const index = layerIndex++;
				const textureName = `terrainMask${index}`;
				const scaleName = `terrainMaskScale${index}`;
				const texture = createMaskTexture(node.amount);
				if (!texture) return a;
				textures.push(texture);
				uniforms[textureName] = { value: texture };
				uniforms[scaleName] = { value: new THREE.Vector2().fromArray(node.amount.scale ?? [1, 1]) };
				declarations.push(`uniform sampler2D ${textureName};`, `uniform vec2 ${scaleName};`);
				const sample = `texture2D(${textureName}, vTerrainUv * ${scaleName}).r`;
				return `mix(${a}, ${b}, clamp(${sample}, 0.0, 1.0))`;
			}
			const amount = Math.max(0, Math.min(1, Number(node.amount) || 0));
			return `mix(${a}, ${b}, ${amount.toFixed(8)})`;
		}

		const index = layerIndex++;
		const colorName = `terrainColor${index}`;
		const textureName = `terrainMap${index}`;
		const scaleName = `terrainScale${index}`;
		const offsetName = `terrainOffset${index}`;
		const outputScale = data.terrainUvScale ?? [1, 1];
		const scale = (node?.textureScale ?? [1, 1]).map((value, axis) => value * outputScale[axis]);
		const texture = createMaterialTexture(node, 'map', THREE.SRGBColorSpace, scale, data.terrainUvOffset ?? [0, 0]);
		uniforms[colorName] = { value: new THREE.Color(node?.color ?? '#ffffff') };
		declarations.push(`uniform vec3 ${colorName};`);
		if (!texture) return `vec4(${colorName}, 1.0)`;
		textures.push(texture);
		uniforms[textureName] = { value: texture };
		const assetData = node?.resolvedMap?.data ?? node?.resolvedMap;
		const shaderScale = node?.texture
			? scale
			: scale.map((value, axis) => value * (assetData?.repeat?.[axis] ?? 1));
		const shaderOffset = (assetData?.offset ?? [0, 0]).map(
			(value, axis) => value + (data.terrainUvOffset?.[axis] ?? 0)
		);
		uniforms[scaleName] = { value: new THREE.Vector2().fromArray(shaderScale) };
		uniforms[offsetName] = { value: new THREE.Vector2().fromArray(shaderOffset) };
		declarations.push(`uniform sampler2D ${textureName};`, `uniform vec2 ${scaleName};`, `uniform vec2 ${offsetName};`);
		functions.push(`vec4 terrainLayer${index}(vec2 uv) { return vec4(${colorName}, 1.0) * texture2D(${textureName}, uv * ${scaleName} + ${offsetName}); }`);
		return `terrainLayer${index}(vTerrainUv)`;
	};

	const expression = compile(data);
	material.onBeforeCompile = shader => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = `varying vec2 vTerrainUv;\nvarying vec3 vTerrainNormal;\n${shader.vertexShader}`
			.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvTerrainUv = uv;\n\tvTerrainNormal = normal;');
		shader.fragmentShader = `varying vec2 vTerrainUv;\nvarying vec3 vTerrainNormal;\n${declarations.join('\n')}\n${functions.join('\n')}\n${shader.fragmentShader}`
			.replace('#include <map_fragment>', `diffuseColor *= ${expression};`);
	};
	material.customProgramCacheKey = () => `terrain-blend:${declarations.length}:${functions.length}:${expression}`;
	material.userData.terrainTextures = textures;
	return material;
}

export function disposeTerrainGraphMaterial(material) {
	const textures = new Set(material?.userData?.terrainTextures ?? []);
	for (const field of [
		'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
		'emissiveMap', 'bumpMap', 'displacementMap', 'alphaMap', 'lightMap'
	]) {
		if (material?.[field]) textures.add(material[field]);
	}
	for (const texture of textures) texture.dispose();
	material?.dispose();
}
