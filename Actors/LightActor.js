// @ts-nocheck

const IETransformableActor = require('../IETransformableActor');
const IELightComponent = require('../Components/IELightComponent');

class LightActor extends IETransformableActor {
    constructor(name = 'Light Actor', parent = undefined, id = undefined) {
        super(name, 'PointLight', parent, id);

        this.addComponent(new IELightComponent());
    }

    static fromJSON(data) {
        const actor = super.fromJSON(data);

        actor.components = actor.components.filter(
            component => component.type !== 'light'
        );

        for (const component of data.components ?? []) {
            if (component.type === 'light') {
                actor.addComponent(
                    IELightComponent.fromJSON(component)
                );
            }
        }

        return actor;
    }
}

module.exports = LightActor;
