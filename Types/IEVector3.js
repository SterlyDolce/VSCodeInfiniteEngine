// @ts-nocheck

const IEType = require('./IEType');

class IEVector3 extends IEType {
    constructor(value = [0, 0, 0], exposed = true) {
        super('vector3', [0, 0, 0], exposed);
        this.setValue(value);
    }

    setValue(value) {
        if (
            !Array.isArray(value) ||
            value.length !== 3 ||
            !value.every(v => typeof v === 'number' && Number.isFinite(v))
        ) {
            throw new TypeError('Expected an array of 3 numbers');
        }

        return super.setValue([...value]);
    }

    set(x, y, z) {
        return this.setValue([x, y, z]);
    }

    setAxis(axis, value) {
        if (!Number.isInteger(axis) || axis < 0 || axis > 2) {
            throw new RangeError('Invalid vector axis');
        }

        const next = this.getValue();
        next[axis] = value;

        return this.setValue(next);
    }
}

module.exports = IEVector3;
