// @ts-nocheck

const IETransformableActor = require('../IETransformableActor');
const IESpotLightComponent = require('../Components/IESpotLightComponent');

class SpotLightActor extends IETransformableActor {
    constructor(name = 'Spot Light', parent = undefined, id = undefined) {
        super(name, 'SpotLight', parent, id);

        this.addComponent(new IESpotLightComponent());
    }

    static fromJSON(data) {
        const actor = super.fromJSON(data);

        actor.components = actor.components.filter(
            component => component.type !== 'spotLight'
        );

        for (const component of data.components ?? []) {
            if (component.type === 'spotLight') {
                actor.addComponent(
                    IESpotLightComponent.fromJSON(component)
                );
            }
        }

        return actor;
    }
}

module.exports = SpotLightActor;
