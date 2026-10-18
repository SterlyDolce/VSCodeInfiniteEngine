// @ts-nocheck

const IETransformableComponent = require('./IETransformableComponent');
const {IEColor, IENumber} = require('../Types/BasicValueTypes');

class IESpotLightComponent extends IETransformableComponent {
    constructor() {
        super('spotLight');

        this.color = new IEColor('#ffffff');
        this.intensity = new IENumber(1);
        this.distance = new IENumber(0);
        this.angle = new IENumber(Math.PI / 6);
        this.penumbra = new IENumber(0);
        this.decay = new IENumber(2);
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
            distance: {
                type: 'number',
                exposed: true
            },
            angle: {
                type: 'number',
                exposed: true
            },
            penumbra: {
                type: 'number',
                exposed: true
            },
            decay: {
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
            distance: this.distance.getValue(),
            angle: this.angle.getValue(),
            penumbra: this.penumbra.getValue(),
            decay: this.decay.getValue(),
            castShadow: this.castShadow
        };
    }

    static fromJSON(data) {
        const component = super.fromJSON(data);

        component.color.setValue(data.color ?? '#ffffff');
        component.intensity.setValue(data.intensity ?? 1);
        component.distance.setValue(data.distance ?? 0);
        component.angle.setValue(data.angle ?? Math.PI / 6);
        component.penumbra.setValue(data.penumbra ?? 0);
        component.decay.setValue(data.decay ?? 2);
        component.castShadow = data.castShadow ?? false;

        return component;
    }
}

module.exports = IESpotLightComponent;
