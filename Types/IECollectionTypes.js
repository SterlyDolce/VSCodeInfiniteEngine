// @ts-nocheck
const IEType = require('./IEType');

class IEAny extends IEType {
    constructor(value = null) {
        super('any', value);
    }
}

class IEDynamicArray extends IEType {
    constructor(value = []) {
        super('array', []);
        this.setValue(value);
    }

    setValue(value) {
        if (!Array.isArray(value)) throw new TypeError('Expected an array');
        return super.setValue(structuredClone(value));
    }
}

class IEObject extends IEType {
    constructor(value = {}) {
        super('object', {});
        this.setValue(value);
    }

    setValue(value) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            throw new TypeError('Expected an object');
        }
        return super.setValue(structuredClone(value));
    }
}

module.exports = { IEAny, IEDynamicArray, IEObject };
