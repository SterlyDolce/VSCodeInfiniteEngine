// @ts-nocheck

const {
    IENumber,
    IEString,
    IEBool,
    IEColor
} = require('./BasicValueTypes');

const IEVector3 = require('./IEVector3');
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
    IEMeshRef
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
IETypeRegistry.register(IEVector3, 'Vector3', [0, 0, 0]);
IETypeRegistry.register(IEAny, 'Any', null);
IETypeRegistry.register(IEDynamicArray, 'Array', []);
IETypeRegistry.register(IEObject, 'Object', {});

IETypeRegistry.register(IEActorRef, 'Actor', null);
IETypeRegistry.register(IEMeshRef, 'Mesh', null);

IETypeRegistry.register(IEGeometry, 'Geometry', null);
IETypeRegistry.register(IEMaterial, 'Material', null);
IETypeRegistry.register(IEScript, 'Script', null);
IETypeRegistry.register(IETerrain, 'Terrain', null);

module.exports = IETypeRegistry;
