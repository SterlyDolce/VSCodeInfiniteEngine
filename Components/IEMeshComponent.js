// @ts-nocheck

const IETransformableComponent = require('./IETransformableComponent');
const IEGeometry = require('../Types/IEGeometry');
const IEMaterial = require('../Types/IEMaterial');
// const IEArray = require('../Types/IEArray');

class IEMeshComponent extends IETransformableComponent {
    constructor(geometry = null, materials = []) {
        super('mesh');

        this.geometry = new IEGeometry(geometry);
        this.materials = new IEMaterial(materials, true);

        console.log(this.materials)
    }

    toJSON() {
        return {
            ...super.toJSON(),
            geometry: this.geometry.getValue(),
            materials: this.materials.getValue()
        };
    }

    static fromJSON(data) {
        const component = super.fromJSON(data);

        component.geometry.setValue(data.geometry ?? null);
        component.materials.setValue(data.materials ?? []);

        return component;
    }
}

module.exports = IEMeshComponent;
