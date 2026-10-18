// @ts-nocheck

const IEComponent = require('./IEComponent');
const { IENumber, IEColor } = require('../Types/BasicValueTypes');

class IEAmbientLightComponent extends IEComponent {
    constructor() {
        super('ambientLight');

        this.skyColor = new IEColor('#FFFFFF');
        this.groundColor = new IEColor('#444444');
        this.intensity = new IENumber(1);
    }

    getProperties() {
        return {
            ...super.getProperties(),
            skyColor: {
                type: 'color',
                exposed: true
            },
            groundColor: {
                type: 'color',
                exposed: true
            },
            intensity: {
                type: 'number',
                exposed: true
            }
        };
    }

    toJSON() {
        return {
            ...super.toJSON(),
            skyColor: this.skyColor.getValue(),
            groundColor: this.groundColor.getValue(),
            intensity: this.intensity.getValue()
        };
    }

    static fromJSON(data) {
        const component = super.fromJSON(data);

        component.skyColor.setValue(
            data.skyColor ?? '#FFFFFF'
        );

        component.groundColor.setValue(
            data.groundColor ?? '#444444'
        );

        component.intensity.setValue(
            data.intensity ?? 1
        );

        return component;
    }
}

module.exports = IEAmbientLightComponent;
