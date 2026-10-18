// @ts-nocheck

const IEActor = require('./IEActor');

class ActorRegistry {
    static actors = new Map();

    static register(type, ActorClass) {
        if (typeof type !== 'string' || !type.trim()) {
            throw new Error('Invalid actor type.');
        }

        if (
            typeof ActorClass !== 'function' ||
            !(ActorClass === IEActor || ActorClass.prototype instanceof IEActor)
        ) {
            throw new Error(`Invalid Actor class: ${type}`);
        }

        if (this.actors.has(type)) {
            throw new Error(`Actor type already registered: ${type}`);
        }

        this.actors.set(type, ActorClass);
        return ActorClass;
    }

    static get(type) {
        return this.actors.get(type) ?? null;
    }

    static create(type, ...args) {
        const ActorClass = this.get(type);

        if (!ActorClass) {
            throw new Error(`Unknown Actor type: ${type}`);
        }

        return new ActorClass(...args);
    }

    static fromJSON(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid Actor data.');
        }

        const ActorClass = this.get(data.type);

        if (!ActorClass) {
            throw new Error(`Unregistered Actor type: ${data.type}`);
        }

        return ActorClass.fromJSON(data);
    }

    static getTypes() {
        return [...this.actors.keys()];
    }

    static unregister(type) {
        return this.actors.delete(type);
    }
}

module.exports = ActorRegistry;
