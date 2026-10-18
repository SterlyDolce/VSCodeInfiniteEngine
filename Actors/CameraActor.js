// @ts-nocheck

const IETransformableActor = require('../IETransformableActor');
const IECameraComponent = require('../Components/IECameraComponent');

class CameraActor extends IETransformableActor {
    constructor(name = 'Camera', parent = undefined, id = undefined) {
        super(name, 'Camera', parent, id);

        this.addComponent(new IECameraComponent());
    }

    static fromJSON(data) {
        const actor = super.fromJSON(data);

        actor.components = actor.components.filter(
            component => component.type !== 'camera'
        );

        for (const component of data.components ?? []) {
            if (component.type === 'camera') {
                actor.addComponent(
                    IECameraComponent.fromJSON(component)
                );
            }
        }

        return actor;
    }
}

module.exports = CameraActor;
