// @ts-nocheck
const IETransformableComponent = require('./IETransformableComponent');
const IEVector3 = require('../Types/IEVector3');
const { IENumber, IEBool } = require('../Types/BasicValueTypes');

class IESpringArmComponent extends IETransformableComponent {
    constructor() {
        super('springArm');

        this.armLength = new IENumber(4);
        this.socketOffset = new IEVector3([0, 0, 0], false);
        this.followActorRotation = new IEBool(false);
        this.collisionTest = new IEBool(true);
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
            },
            armLength: {
                type: 'number',
                exposed: true
            },
            socketOffset: {
                type: 'vector3',
                exposed: true
            },
            followActorRotation: {
                type: 'boolean',
                exposed: true
            },
            collisionTest: {
                type: 'boolean',
                exposed: true
            }
        };
    }

    toJSON() {
        return {
            ...super.toJSON(),
            armLength: this.armLength.getValue(),
            socketOffset: this.socketOffset.getValue(),
            followActorRotation: this.followActorRotation.getValue(),
            collisionTest: this.collisionTest.getValue()
        };
    }

    static fromJSON(data) {
        const component = new IESpringArmComponent();

        component.id = data.id ?? component.id;
        component.name = data.name ?? component.name;
        component.enabled = data.enabled ?? true;
        component.parent = data.parent ?? null;
        component.position.setValue(data.position ?? [0, 0, 0]);
        component.rotation.setValue(data.rotation ?? [0, 0, 0]);
        component.scale.setValue(data.scale ?? [1, 1, 1]);
        component.armLength.setValue(data.armLength ?? 4);
        component.socketOffset.setValue(data.socketOffset ?? [0, 0, 0]);
        component.followActorRotation.setValue(
            data.followActorRotation ?? false
        );
        component.collisionTest.setValue(data.collisionTest ?? true);

        return component;
    }
}

module.exports = IESpringArmComponent;
