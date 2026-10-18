// @ts-nocheck

const IEType = require('./IEType');

class IEGeometry extends IEType {
    constructor(value = null) {
        super('geometry', null);
        this.setValue(value);
    }

    setValue(value) {
        if (
            value !== null &&
            (
                typeof value !== 'object' ||
                typeof value.type !== 'string' ||
                typeof value.id !== 'string'
            )
        ) {
            throw new TypeError('Expected a geometry reference');
        }

        return super.setValue(
            value === null ? null : {
                type: value.type,
                id: value.id
            }
        );
    }
}

module.exports = IEGeometry;
