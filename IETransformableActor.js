// @ts-nocheck

const crypto = require('crypto');
const IEActor = require('./IEActor');
const IEVector3 = require('./Types/IEVector3');

class IETransformableActor extends IEActor {
    constructor(name = 'Actor', type = 'Actor', parent = undefined, id = crypto.randomUUID()) {
        super(name, type, parent, id);

        this.position = new IEVector3([0, 0, 0]);
        this.rotation = new IEVector3([0, 0, 0]);
        this.scale = new IEVector3([1, 1, 1]);
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
        const data = super.toJSON();

        if (this.isInstance()) return data;

        return {
            ...data,
            position: this.position.getValue(),
            rotation: this.rotation.getValue(),
            scale: this.scale.getValue()
        };
    }

    toResolvedJSON() {
        return {
            ...super.toResolvedJSON(),
            position: this.position.getValue(),
            rotation: this.rotation.getValue(),
            scale: this.scale.getValue()
        };
    }


    static fromJSON(data) {
        const actor = super.fromJSON(data);

        actor.position.setValue(data.position ?? [0, 0, 0]);
        actor.rotation.setValue(data.rotation ?? [0, 0, 0]);
        actor.scale.setValue(data.scale ?? [1, 1, 1]);

        return actor;
    }
}

module.exports = IETransformableActor;
