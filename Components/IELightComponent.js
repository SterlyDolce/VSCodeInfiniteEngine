// @ts-nocheck

const IEComponent = require('./IEComponent');
const {IEString, IENumber, IEColor} = require('../Types/BasicValueTypes');

class IELightComponent extends IEComponent {
    constructor(
        lightType = 'point',
        color = '#ffffff',
        intensity = 1,
        distance = 0,
        decay = 2
    ) {
        super('light');

        this.lightType = new IEString(lightType);
        this.color = new IEColor(color);
        this.intensity = new IENumber(intensity);
        this.distance = new IENumber(distance);
        this.decay = new IENumber(decay);
    }

    toJSON() {
        return {
            ...super.toJSON(),
            lightType: this.lightType.getValue(),
            color: this.color.getValue(),
            intensity: this.intensity.getValue(),
            distance: this.distance.getValue(),
            decay: this.decay.getValue()
        };
    }

    static fromJSON(data) {
        const component = new IELightComponent(
            data.lightType ?? 'point',
            data.color ?? '#ffffff',
            data.intensity ?? 1,
            data.distance ?? 0,
            data.decay ?? 2
        );

        component.id = data.id ?? component.id;
        component.enabled = data.enabled ?? true;

        return component;
    }

    static point() {
        return new IELightComponent('point', '#ffffff', 1, 0, 2);
    }

    static directional() {
        return new IELightComponent('directional', '#ffffff', 1);
    }
}

module.exports = IELightComponent;
