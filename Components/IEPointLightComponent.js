// @ts-nocheck

const IETransformableComponent = require('./IETransformableComponent');
const {IEColor, IENumber} = require('../Types/BasicValueTypes');

class IEPointLightComponent extends IETransformableComponent {
    constructor() {
        super('pointLight');

        this.color = new IEColor('#ffffff');
        this.intensity = new IENumber(1);
        this.distance = new IENumber(0);
        this.decay = new IENumber(2);
    }

    getProperties() {
        return {
            ...super.getProperties(),
            color: {
                type: 'color',
                exposed: true
            },
            intensity: {
                type: 'number',
                exposed: true
            },
            distance: {
                type: 'number',
                exposed: true
            },
            decay: {
                type: 'number',
                exposed: true
            }
        };
    }

    toJSON() {
        return {
            ...super.toJSON(),
            color: this.color.getValue(),
            intensity: this.intensity.getValue(),
            distance: this.distance.getValue(),
            decay: this.decay.getValue()
        };
    }

    static fromJSON(data) {
        const component = super.fromJSON(data);

        component.color.setValue(data.color ?? '#ffffff');
        component.intensity.setValue(data.intensity ?? 1);
        component.distance.setValue(data.distance ?? 0);
        component.decay.setValue(data.decay ?? 2);

        return component;
    }
}

module.exports = IEPointLightComponent;
