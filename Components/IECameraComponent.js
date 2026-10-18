// @ts-nocheck

const IEComponent = require('./IEComponent');
const {IENumber, IEBool} = require('../Types/BasicValueTypes');

class IECameraComponent extends IEComponent {
    constructor() {
        super('camera');

        this.projection = 'perspective';
        this.fov = new IENumber(75);
        this.near = new IENumber(0.1);
        this.far = new IENumber(1000);
        this.orthographicSize = new IENumber(10);
        this.priority = new IENumber(0);
        this.active = new IEBool(true);
    }

    getProperties() {
        return {
            ...super.getProperties(),
            projection: {
                type: 'string',
                exposed: true
            },
            fov: {
                type: 'number',
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
            orthographicSize: {
                type: 'number',
                exposed: true
            },
            priority: {
                type: 'number',
                exposed: true
            },
            active: {
                type: 'boolean',
                exposed: true
            }
        };
    }

    toJSON() {
        return {
            ...super.toJSON(),
            projection: this.projection,
            fov: this.fov.getValue(),
            near: this.near.getValue(),
            far: this.far.getValue(),
            orthographicSize: this.orthographicSize.getValue(),
            priority: this.priority.getValue(),
            active: this.active.getValue()
        };
    }

    static fromJSON(data) {
        const component = new IECameraComponent();

        component.id = data.id ?? component.id;
        component.name = data.name ?? component.name;
        component.enabled = data.enabled ?? true;
        component.projection = data.projection ?? 'perspective';
        component.fov.setValue(data.fov ?? 75);
        component.near.setValue(data.near ?? 0.1);
        component.far.setValue(data.far ?? 1000);
        component.orthographicSize.setValue(data.orthographicSize ?? 10);
        component.priority.setValue(data.priority ?? 0);
        component.active.setValue(data.active ?? true);

        return component;
    }
}

module.exports = IECameraComponent;
