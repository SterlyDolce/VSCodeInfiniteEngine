// @ts-nocheck

const IEComponent = require('./IEComponent');
const IEVector3 = require('../Types/IEVector3');

class IETransformableComponent extends IEComponent {
    constructor(type = 'transformable') {
        super(type);

        this.position = new IEVector3([0, 0, 0], false);
        this.rotation = new IEVector3([0, 0, 0], false);
        this.scale = new IEVector3([1, 1, 1], false);
    }

    setPosition(x, y, z) {
        this.position.set(x, y, z);
        return this;
    }

    setRotation(x, y, z) {
        this.rotation.set(x, y, z);
        return this;
    }

    setScale(x, y, z) {
        this.scale.set(x, y, z);
        return this;
    }

    getProperties() {
        return {
            ...super.getProperties(),
            position: {
                type: 'vector3',
                exposed: true
            },
            rotation: {
                type: 'vector3',
                exposed: true
            },
            scale: {
                type: 'vector3',
                exposed: true
            }
        };
    }

    toJSON() {
        return {
            ...super.toJSON(),
            position: this.position.getValue(),
            rotation: this.rotation.getValue(),
            scale: this.scale.getValue()
        };
    }

    static fromJSON(data) {
        const component = new this();

        component.type = data.type
        component.name = data.name
        component.id = data.id ?? component.id;
        component.enabled = data.enabled ?? true;
        component.parent = data.parent ?? null;

        component.position.setValue(data.position ?? [0, 0, 0]);
        component.rotation.setValue(data.rotation ?? [0, 0, 0]);
        component.scale.setValue(data.scale ?? [1, 1, 1]);

        return component;
    }
}

module.exports = IETransformableComponent;
