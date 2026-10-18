// @ts-nocheck
const IEComponent = require('./IEComponent');
const { IEColor } = require('../Types/BasicValueTypes');

class IESkyComponent extends IEComponent {
    constructor() {
        super('sky');

        this.topColor = new IEColor('#5fa9ff');
        this.horizonColor = new IEColor('#b9dcff');
        this.bottomColor = new IEColor('#eaf4ff');
    }

    getProperties() {
        return {
            ...super.getProperties(),
            topColor: {
                type: 'color',
                exposed: true
            },
            horizonColor: {
                type: 'color',
                exposed: true
            },
            bottomColor: {
                type: 'color',
                exposed: true
            }
        };
    }

    toJSON() {
        return {
            ...super.toJSON(),
            topColor: this.topColor.getValue(),
            horizonColor: this.horizonColor.getValue(),
            bottomColor: this.bottomColor.getValue()
        };
    }

    static fromJSON(data) {
        const component = new IESkyComponent();

		component.id = data.id ?? component.id;
		component.name = data.name ?? component.name;
        component.enabled = data.enabled ?? true;
        component.topColor.setValue(data.topColor ?? '#5fa9ff');
        component.horizonColor.setValue(data.horizonColor ?? '#b9dcff');
        component.bottomColor.setValue(data.bottomColor ?? '#eaf4ff');

        return component;
    }
}

module.exports = IESkyComponent;
