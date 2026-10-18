// @ts-nocheck

const IETransformableActor = require('../IETransformableActor');
const IEPointLightComponent = require('../Components/IEPointLightComponent');

class PointLightActor extends IETransformableActor {
    constructor(name = 'Light Actor', parent = undefined, id = undefined) {
        super(name, 'PointLight', parent, id);

        this.addComponent(new IEPointLightComponent());
    }

    static fromJSON(data) {
        const actor = super.fromJSON(data);

        actor.components = actor.components.filter(
            component => component.type !== 'pointLight'
        );

        for (const component of data.components ?? []) {
            if (component.type === 'pointLight') {
                actor.addComponent(
                    IEPointLightComponent.fromJSON(component)
                );
            }
        }

        return actor;
    }
}

module.exports = PointLightActor;
