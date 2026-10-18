// @ts-nocheck

const IEComponent = require('./IEComponent');
const { IEColor } = require('../Types/BasicValueTypes');

class IESkyComponent extends IEComponent {
    constructor() {
        super('sky');

        this.color = new IEColor('#87CEEB');
    }

    getProperties() {
        return {
            ...super.getProperties(),
            color: {
                type: 'color',
                exposed: true
            }
        };
    }

    toJSON() {
        return {
            ...super.toJSON(),
            color: this.color.getValue()
        };
    }

    static fromJSON(data) {
        const component = super.fromJSON(data);

        component.color.setValue(
            data.color ?? '#87CEEB'
        );

        return component;
    }
}

module.exports = IESkyComponent;
