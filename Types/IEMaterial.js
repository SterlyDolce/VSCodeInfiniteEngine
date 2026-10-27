// @ts-nocheck
const IEType = require('./IEType');

class IEMaterial extends IEType {
    constructor(value = null, isArray = false) {
        super('material', null, isArray);
        this.setValue(value);
    }

    setValue(value) {
        const validate = material => {
            if (material === null) return null;
            if (typeof material === 'string') return material;

            if (
                typeof material !== 'object' ||
                Array.isArray(material) ||
                material.type !== 'material' ||
                typeof material.id !== 'string'
            ) {
                throw new TypeError('Expected a material reference');
            }

            return {
                type: material.type,
                id: material.id
            };
        };

        if (this.isArray) {
            const materials = value ?? [];

            if (!Array.isArray(materials)) {
                throw new TypeError(
                    'Expected an array of material references'
                );
            }

            return super.setValue(materials.map(validate));
        }

        return super.setValue(validate(value));
    }
}

module.exports = IEMaterial;
