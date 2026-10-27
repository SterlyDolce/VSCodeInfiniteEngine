// @ts-nocheck

export function copyRuntimeValue(value, seen = new WeakMap()) {
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object') return value;

    // Engine references are live runtime objects. Cloning a Three.js object
    // both breaks its identity and fails because it contains function values.
    if (
        value.isObject3D === true ||
        value.type === 'actor' ||
        value.type === 'component' ||
        value.type === 'mesh'
    ) {
        return value;
    }

    if (seen.has(value)) return seen.get(value);

    if (Array.isArray(value)) {
        const result = [];
        seen.set(value, result);
        result.push(...value.map(item => copyRuntimeValue(item, seen)));
        return result;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
        const result = {};
        seen.set(value, result);
        for (const [key, item] of Object.entries(value)) {
            result[key] = copyRuntimeValue(item, seen);
        }
        return result;
    }

    try {
        return structuredClone(value);
    } catch {
        return value;
    }
}

export const copyRuntimeArray = value =>
    (Array.isArray(value) ? value : []).map(item => copyRuntimeValue(item));
