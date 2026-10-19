// @ts-nocheck

const IEActor = require('../IEActor');
const IETerrainComponent = require('../Components/IETerrainComponent');

class WorldActor extends IEActor {
    constructor(name = 'World', id = undefined) {
        super(name, 'World', undefined, id);
        this.addComponent(new IETerrainComponent());
    }

    static fromJSON(data) {
        const actor = super.fromJSON(data);
        actor.parent = undefined;
        if (!actor.getComponent('terrain')) {
            const terrain = new IETerrainComponent();

            // Legacy scenes do not have a serialized Terrain Component yet.
            // Use a stable migration ID so the Properties panel and the
            // subsequent scene reload address the same component.
            terrain.id = `terrain-${actor.id}`;
            actor.addComponent(terrain);
        }
        return actor;
    }
}

module.exports = WorldActor;
