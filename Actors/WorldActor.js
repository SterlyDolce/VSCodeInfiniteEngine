// @ts-nocheck

const IEActor = require('../IEActor');

class WorldActor extends IEActor {
    constructor(name = 'World', id = undefined) {
        super(name, 'World', undefined, id);
    }

    static fromJSON(data) {
        const actor = super.fromJSON(data);
        actor.parent = undefined;
        return actor;
    }
}

module.exports = WorldActor;
