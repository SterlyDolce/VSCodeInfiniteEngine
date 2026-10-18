// @ts-nocheck

const IETransformableActor = require('../IETransformableActor');
const IEMeshComponent = require('../Components/IEMeshComponent');

class MeshActor extends IETransformableActor {
    constructor(name = 'Mesh Actor', parent = undefined, id = undefined) {
        super(name, 'Mesh', parent, id);

        this.addComponent(new IEMeshComponent());
    }

    static fromJSON(data) {
        const actor = super.fromJSON(data);

        const meshes = (data.components ?? [])
            .filter(component => component.type === 'mesh');

        actor.components = actor.components.filter(
            component => component.type !== 'mesh'
        );

        for (const mesh of meshes) {
            actor.addComponent(IEMeshComponent.fromJSON(mesh));
        }

        return actor;
    }
}

module.exports = MeshActor;
