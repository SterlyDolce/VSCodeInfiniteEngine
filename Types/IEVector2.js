// @ts-nocheck

const IEType = require('./IEType');

class IEVector2 extends IEType {
    constructor(value = [0, 0]) {
        super('vector2', [0, 0]);
        this.setValue(value);
    }

    setValue(value) {
        if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) {
            throw new TypeError('Expected an array of 2 numbers');
        }
        return super.setValue([...value]);
    }
}

module.exports = IEVector2;
