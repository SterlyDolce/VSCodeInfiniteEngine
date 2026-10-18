// @ts-nocheck

const IEType = require('./IEType');

class IEScript extends IEType {
    constructor(value = null) {
        super('script', null);
        this.setValue(value);
    }

    setValue(value) {
        if (value === null) {
            return super.setValue(null);
        }

        if (
            typeof value !== 'object' ||
            Array.isArray(value) ||
            value.type !== 'script' ||
            typeof value.id !== 'string' ||
            !value.id
        ) {
            throw new TypeError('Expected a script reference');
        }

        return super.setValue({
            type: value.type,
            id: value.id
        });
    }
}

module.exports = IEScript;
