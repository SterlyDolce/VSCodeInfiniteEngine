// @ts-nocheck

const IEType = require('./IEType');

class IETerrain extends IEType {
    constructor(value = null, isArray = false) {
        super('terrain', null, isArray);
        this.setValue(value);
    }

    setValue(value) {
        const validate = terrain => {
            if (terrain === null) return null;

            if (
                typeof terrain !== 'object' ||
                Array.isArray(terrain) ||
                terrain.type !== 'terrain' ||
                typeof terrain.id !== 'string'
            ) {
                throw new TypeError(
                    'Expected a terrain reference'
                );
            }

            return {
                type: terrain.type,
                id: terrain.id
            };
        };

        if (this.isArray) {
            const terrains = value ?? [];

            if (!Array.isArray(terrains)) {
                throw new TypeError(
                    'Expected an array of terrain references'
                );
            }

            return super.setValue(
                terrains.map(validate)
            );
        }

        return super.setValue(validate(value));
    }
}

module.exports = IETerrain;
