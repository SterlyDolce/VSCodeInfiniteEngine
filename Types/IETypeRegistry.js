// @ts-nocheck

const {
    IENumber,
    IEString,
    IEBool,
    IEColor
} = require('./BasicValueTypes');

const IEVector3 = require('./IEVector3');
const IEVector2 = require('./IEVector2');
const IEGeometry = require('./IEGeometry');
const IEMaterial = require('./IEMaterial');
const IEScript = require('./IEScript');
const IETerrain = require('./IETerrain');
const {
    IEAny,
    IEDynamicArray,
    IEObject
} = require('./IECollectionTypes');

const {
    IEActorRef,
    IEMeshRef,
    IEComponentRef,
    IETransformableRef,
    IETextureRef,
    IEAnimationRef,
    IEAnimationStateRef,
    IEAnimationStateValueRef,
    IEUIRef
} = require('./ReferenceTypes');

class IETypeRegistry {
    static types = new Map();

    static register(Type, name, defaultValue = null) {
        const instance = new Type();

        this.types.set(instance.type, {
            Type,
            name,
            defaultValue
        });
    }

    static get(type) {
        return this.types.get(type) ?? null;
    }

    static create(type, value) {
        const entry = this.get(type);

        if (!entry) {
            throw new Error(`Unknown IEType: ${type}`);
        }

        return new entry.Type(
            value === undefined
                ? structuredClone(entry.defaultValue)
                : value
        );
    }

    static getDefinitions() {
        return [...this.types.entries()].map(([type, entry]) => ({
            type,
            name: entry.name,
            default: structuredClone(entry.defaultValue)
        }));
    }
}

IETypeRegistry.register(IENumber, 'Number', 0);
IETypeRegistry.register(IEString, 'String', '');
IETypeRegistry.register(IEBool, 'Boolean', false);
IETypeRegistry.register(IEColor, 'Color', '#ffffff');
IETypeRegistry.register(IEVector2, 'Vector2', [0, 0]);
IETypeRegistry.register(IEVector3, 'Vector3', [0, 0, 0]);
IETypeRegistry.register(IEAny, 'Any', null);
IETypeRegistry.register(IEDynamicArray, 'Array', []);
IETypeRegistry.register(IEObject, 'Object', {});

IETypeRegistry.register(IEActorRef, 'Actor', null);
IETypeRegistry.register(IEMeshRef, 'Mesh', null);
IETypeRegistry.register(IEComponentRef, 'Component', null);
IETypeRegistry.register(IETransformableRef, 'Transformable', null);
IETypeRegistry.register(IETextureRef, 'Texture', null);
IETypeRegistry.register(IEAnimationRef, 'Animation', null);
IETypeRegistry.register(IEAnimationStateRef, 'Animation State', null);
IETypeRegistry.register(IEAnimationStateValueRef, 'Animation State Value', null);
IETypeRegistry.register(IEUIRef, 'User Interface', null);

IETypeRegistry.register(IEGeometry, 'Geometry', null);
IETypeRegistry.register(IEMaterial, 'Material', null);
IETypeRegistry.register(IEScript, 'Script', null);
IETypeRegistry.register(IETerrain, 'Terrain', null);

module.exports = IETypeRegistry;
