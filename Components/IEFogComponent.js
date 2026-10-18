// @ts-nocheck

const IEComponent = require('./IEComponent');
const { IENumber, IEColor } = require('../Types/BasicValueTypes');

class IEFogComponent extends IEComponent {
    constructor() {
        super('fog');

        this.enabled = false;

        // "linear" or "exponential"
        this.mode = 'linear';

        this.color = new IEColor('#AABBD0');

        // Linear fog settings
        this.near = new IENumber(10);
        this.far = new IENumber(150);

        // Exponential fog settings
        this.density = new IENumber(0.01);
    }

    getProperties() {
        return {
            ...super.getProperties(),

            enabled: {
                type: 'boolean',
                exposed: true
            },

            mode: {
                type: 'enum',
                options: ['linear', 'exponential'],
                exposed: true
            },

            color: {
                type: 'color',
                exposed: true
            },

            near: {
                type: 'number',
                exposed: true
            },

            far: {
                type: 'number',
                exposed: true
            },

            density: {
                type: 'number',
                exposed: true
            }
        };
    }

    toJSON() {
        return {
            ...super.toJSON(),
            enabled: this.enabled,
            mode: this.mode,
            color: this.color.getValue(),
            near: this.near.getValue(),
            far: this.far.getValue(),
            density: this.density.getValue()
        };
    }

    static fromJSON(data) {
        const component = super.fromJSON(data);

        component.enabled = data.enabled ?? false;

        component.mode =
            ['linear', 'exponential'].includes(data.mode)
                ? data.mode
                : 'linear';

        component.color.setValue(
            data.color ?? '#AABBD0'
        );

        component.near.setValue(
            data.near ?? 10
        );

        component.far.setValue(
            data.far ?? 150
        );

        component.density.setValue(
            data.density ?? 0.01
        );

        return component;
    }
}

module.exports = IEFogComponent;
