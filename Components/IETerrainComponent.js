// @ts-nocheck
const IEComponent = require('./IEComponent');
const IETerrain = require('../Types/IETerrain');
const { IEBool, IENumber } = require('../Types/BasicValueTypes');

class IETerrainComponent extends IEComponent {
    constructor(terrain = null) {
        super('terrain');
        this.terrain = new IETerrain(terrain, false);
        this.physics = new IEBool(true);
        this.friction = new IENumber(0.8);
        this.restitution = new IENumber(0);
    }
    toJSON() { return { ...super.toJSON(), terrain: this.terrain.getValue(), physics: this.physics.getValue(), friction: this.friction.getValue(), restitution: this.restitution.getValue() }; }
    static fromJSON(data) { const component = new this(); component.id=data.id??component.id; component.name=data.name??component.name; component.enabled=data.enabled??true; component.parent=data.parent??null; component.terrain.setValue(data.terrain??null); component.physics.setValue(data.physics??true); component.friction.setValue(data.friction??.8); component.restitution.setValue(data.restitution??0); return component; }
}
module.exports = IETerrainComponent;
