// @ts-nocheck

const IEType = require('./IEType');

class IEReference extends IEType {
    constructor(type, id = null) {
        super(type, id);
    }

    setValue(id) {
        if (id !== null && typeof id !== 'string') {
            throw new TypeError('Reference ID must be a string or null');
        }

        return super.setValue(id);
    }

    toJSON() {
        return {
            type: this.type,
            id: this.value
        };
    }
}

class IEActorRef extends IEReference {
    constructor(id = null) {
        super('actor', id);
    }
} 

class IEMeshRef extends IEReference {
    constructor(id = null) {
        super('mesh', id);
    }
}

class IEMaterialRef extends IEReference {
    constructor(id = null) {
        super('material', id);
    }
}

class IEScriptRef extends IEReference {
    constructor(id = null) {
        super('script', id);
    }
}

module.exports = {
    IEReference,
    IEActorRef,
    IEMeshRef,
    IEMaterialRef,
    IEScriptRef
};
