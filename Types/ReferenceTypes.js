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

const createReferenceType = type => class extends IEReference {
    constructor(id = null) {
        super(type, typeof id === 'object' && id !== null ? id.id : id);
    }
};

const IEComponentRef = createReferenceType('component');
const IETransformableRef = createReferenceType('transformable');
const IETextureRef = createReferenceType('texture');
const IEAnimationRef = createReferenceType('animation');
const IEAnimationStateRef = createReferenceType('animationState');
const IEAnimationStateValueRef = createReferenceType('animationstate');
const IEUIRef = createReferenceType('ui');

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
    IEComponentRef,
    IETransformableRef,
    IETextureRef,
    IEAnimationRef,
    IEAnimationStateRef,
    IEAnimationStateValueRef,
    IEUIRef,
    IEMaterialRef,
    IEScriptRef
};
