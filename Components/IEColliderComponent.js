// @ts-nocheck
const IEComponent = require('./IEComponent');
const IEVector3 = require('../Types/IEVector3');
const { IENumber, IEBool } = require('../Types/BasicValueTypes');

class IEColliderComponent extends IEComponent {
    constructor() {
        super('collider');
        this.shape = 'box';
        this.size = new IEVector3([1, 1, 1], false);
        this.radius = new IENumber(0.5);
        this.height = new IENumber(1);
        this.offset = new IEVector3([0, 0, 0], false);
        this.friction = new IENumber(0.5);
        this.restitution = new IENumber(0);
        this.density = new IENumber(1);
        this.sensor = new IEBool(false);
        this.collisionEvents = new IEBool(true);
    }

    getProperties() {
        return {
            ...super.getProperties(),
            shape: {
                type: 'enum',
                options: ['box', 'sphere', 'capsule'],
                exposed: true
            }
        };
    }

    toJSON() {
        return {
            ...super.toJSON(),
            shape: this.shape,
            size: this.size.getValue(),
            radius: this.radius.getValue(),
            height: this.height.getValue(),
            offset: this.offset.getValue(),
            friction: this.friction.getValue(),
            restitution: this.restitution.getValue(),
            density: this.density.getValue(),
            sensor: this.sensor.getValue(),
            collisionEvents: this.collisionEvents.getValue()
        };
    }

    static fromJSON(data) {
        const component = new this();
        component.id = data.id ?? component.id;
        component.name = data.name ?? component.name;
        component.enabled = data.enabled ?? true;
        const shape = String(data.shape ?? 'box').trim().toLowerCase();
        component.shape = ['box', 'sphere', 'capsule'].includes(shape)
            ? shape : 'box';
        component.size.setValue(data.size ?? [1, 1, 1]);
        component.offset.setValue(data.offset ?? [0, 0, 0]);

        for (const name of ['radius', 'height', 'friction', 'restitution', 'density']) {
            component[name].setValue(data[name] ?? component[name].getValue());
        }
        for (const name of ['sensor', 'collisionEvents']) {
            component[name].setValue(data[name] ?? component[name].getValue());
        }
        return component;
    }
}

module.exports = IEColliderComponent;
