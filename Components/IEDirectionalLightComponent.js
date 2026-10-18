// @ts-nocheck

const IETransformableComponent = require('./IETransformableComponent');
const {IENumber, IEColor} = require('../Types/BasicValueTypes');

class IEDirectionalLightComponent extends IETransformableComponent {
    constructor() {
        super('directionalLight');

        this.color = new IEColor('#ffffff');
        this.intensity = new IENumber(1);
        this.castShadow = false;
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
            castShadow: {
                type: 'boolean',
                exposed: true
            }
        };
    }

    toJSON() {
        return {
            ...super.toJSON(),
            color: this.color.getValue(),
            intensity: this.intensity.getValue(),
            castShadow: this.castShadow
        };
    }

    static fromJSON(data) {
        const component = super.fromJSON(data);

        component.color.setValue(data.color ?? '#ffffff');
        component.intensity.setValue(data.intensity ?? 1);
        component.castShadow = data.castShadow ?? false;

        return component;
    }
}

module.exports = IEDirectionalLightComponent;
