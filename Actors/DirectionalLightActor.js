// @ts-nocheck

const IETransformableActor = require('../IETransformableActor');
const IEDirectionalLightComponent = require('../Components/IEDirectionalLightComponent');

class DirectionalLightActor extends IETransformableActor {
    constructor(name = 'Directional Light', parent = undefined, id = undefined) {
        super(name, 'DirectionalLight', parent, id);

        this.addComponent(new IEDirectionalLightComponent());
    }

    static fromJSON(data) {
        const actor = super.fromJSON(data);

        actor.components = actor.components.filter(
            component => component.type !== 'directionalLight'
        );

        for (const component of data.components ?? []) {
            if (component.type === 'directionalLight') {
                actor.addComponent(
                    IEDirectionalLightComponent.fromJSON(component)
                );
            }
        }

        return actor;
    }
}

module.exports = DirectionalLightActor;
