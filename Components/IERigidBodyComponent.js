// @ts-nocheck
const IEComponent = require('./IEComponent');
const { IENumber, IEBool } = require('../Types/BasicValueTypes');

class IERigidBodyComponent extends IEComponent {
    constructor() {
        super('rigidBody');
        this.bodyType = 'dynamic';
        this.gravityScale = new IENumber(1);
        this.linearDamping = new IENumber(0);
        this.angularDamping = new IENumber(0);
        this.canSleep = new IEBool(true);
        this.ccd = new IEBool(false);
        this.lockPositionX = new IEBool(false);
        this.lockPositionY = new IEBool(false);
        this.lockPositionZ = new IEBool(false);
        this.lockRotationX = new IEBool(false);
        this.lockRotationY = new IEBool(false);
        this.lockRotationZ = new IEBool(false);
    }

    getProperties() {
        return {
            ...super.getProperties(),
            bodyType: {
                type: 'enum',
                options: ['dynamic', 'fixed', 'kinematicPosition', 'kinematicVelocity'],
                exposed: true
            }
        };
    }

    toJSON() {
        return {
            ...super.toJSON(),
            bodyType: this.bodyType,
            gravityScale: this.gravityScale.getValue(),
            linearDamping: this.linearDamping.getValue(),
            angularDamping: this.angularDamping.getValue(),
            canSleep: this.canSleep.getValue(),
            ccd: this.ccd.getValue(),
            lockPositionX: this.lockPositionX.getValue(),
            lockPositionY: this.lockPositionY.getValue(),
            lockPositionZ: this.lockPositionZ.getValue(),
            lockRotationX: this.lockRotationX.getValue(),
            lockRotationY: this.lockRotationY.getValue(),
            lockRotationZ: this.lockRotationZ.getValue()
        };
    }

    static fromJSON(data) {
        const component = new this();
        component.id = data.id ?? component.id;
        component.name = data.name ?? component.name;
        component.enabled = data.enabled ?? true;
        const bodyTypes = {
            dynamic: 'dynamic',
            fixed: 'fixed',
            kinematicposition: 'kinematicPosition',
            kinematicvelocity: 'kinematicVelocity'
        };
        component.bodyType = bodyTypes[
            String(data.bodyType ?? 'dynamic').trim().toLowerCase()
        ] ?? 'dynamic';

        for (const name of ['gravityScale', 'linearDamping', 'angularDamping']) {
            component[name].setValue(data[name] ?? component[name].getValue());
        }
        for (const name of [
            'canSleep', 'ccd',
            'lockPositionX', 'lockPositionY', 'lockPositionZ',
            'lockRotationX', 'lockRotationY', 'lockRotationZ'
        ]) {
            component[name].setValue(data[name] ?? component[name].getValue());
        }
        return component;
    }
}

module.exports = IERigidBodyComponent;
