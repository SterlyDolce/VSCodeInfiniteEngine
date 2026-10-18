// @ts-nocheck
const IEComponent = require('./IEComponent');
const { IENumber, IEColor } = require('../Types/BasicValueTypes');

class IEVolumetricCloudComponent extends IEComponent {
    constructor() {
        super('volumetricCloud');

        this.coverage = new IENumber(0.48);
        this.density = new IENumber(0.8);
        this.scale = new IENumber(0.012);
        this.height = new IENumber(120);
        this.thickness = new IENumber(60);
        this.windX = new IENumber(0.8);
        this.windZ = new IENumber(0.25);
        this.color = new IEColor('#ffffff');
        this.shadowColor = new IEColor('#78869b');
    }

    getProperties() {
        return {
            ...super.getProperties(),
            ...Object.fromEntries(
                ['coverage', 'density', 'scale', 'height', 'thickness', 'windX', 'windZ']
                    .map(name => [name, { type: 'number', exposed: true }])
            ),
            color: { type: 'color', exposed: true },
            shadowColor: { type: 'color', exposed: true }
        };
    }

    toJSON() {
        return {
            ...super.toJSON(),
            coverage: this.coverage.getValue(),
            density: this.density.getValue(),
            scale: this.scale.getValue(),
            height: this.height.getValue(),
            thickness: this.thickness.getValue(),
            windX: this.windX.getValue(),
            windZ: this.windZ.getValue(),
            color: this.color.getValue(),
            shadowColor: this.shadowColor.getValue()
        };
    }

    static fromJSON(data) {
        const component = super.fromJSON(data);
        for (const name of [
            'coverage', 'density', 'scale', 'height', 'thickness',
            'windX', 'windZ', 'color', 'shadowColor'
        ]) {
            if (data[name] !== undefined && data[name] !== null) {
                component[name].setValue(data[name]);
            }
        }
        return component;
    }
}

module.exports = IEVolumetricCloudComponent;
