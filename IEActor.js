// @ts-nocheck

const crypto = require('crypto');
const IEScriptComponent = require('./Components/IEScriptComponent');
const ComponentRegistry = require('./ComponentRegistry');

class IEActor {
    constructor(name = 'Actor', type = 'Actor', parent = undefined, id = crypto.randomUUID()) {
        this.id = id || crypto.randomUUID();
        this.name = name;
        this.type = type;
        this.parent = parent;
        this.components = [new IEScriptComponent()];
        this.source = null;
        this.overrides = {};
    }

    addComponent(component) {
        if (component.type === 'script') {
            throw new Error('Every actor already has a Script Component.');
        }

        this.components.push(component);
        return component;
    }

    getComponent(type) {
        return this.components.find(component => component.type === type);
    }

    getComponentById(id) {
        return this.components.find(component => component.id === id);
    }

    removeComponent(type) {
        if (type === 'script') return false;

        const index = this.components.findIndex(component => component.type === type);
        if (index === -1) return false;

        this.components.splice(index, 1);
        return true;
    }

    getProperties() {
        return {
            name: {
                type: 'string',
                exposed: true
            }
        };
    }

    setProperty(name, value) {
        const schema = this.getProperties()[name];

        if (
            !schema ||
            name === 'id' ||
            name === 'type' ||
            !Object.prototype.hasOwnProperty.call(this, name)
        ) {
            throw new Error(`Actor property is not editable: ${name}`);
        }

        const property = this[name];

        if (property?.setValue instanceof Function) {
            if (
                value &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                Number.isInteger(value.axis)
            ) {
                const update = value;
                const current = property.getValue();

                if (
                    !Array.isArray(current) ||
                    current.length !== 3 ||
                    update.axis < 0 ||
                    update.axis > 2 ||
                    !Number.isFinite(update.value)
                ) {
                    throw new TypeError(`Invalid vector update for actor property: ${name}`);
                }

                value = [...current];
                value[update.axis] = update.value;
            }

            property.setValue(value);
            return property.getValue();
        }

        if (schema.type === 'string' && typeof value === 'string') {
            this[name] = value;
            return value;
        }

        if (schema.type === 'boolean' && typeof value === 'boolean') {
            this[name] = value;
            return value;
        }

        if (schema.type === 'number' && Number.isFinite(value)) {
            this[name] = value;
            return value;
        }

        if (schema.type === 'enum' && schema.options?.includes(value)) {
            this[name] = value;
            return value;
        }

        throw new TypeError(`Invalid value for actor property: ${name}`);
    }

    updateProperty(name, value) {
        return this.setProperty(name, value);
    }

    isInstance() {
        return this.source?.type === 'actor' && typeof this.source.id === 'string';
    }

    toJSON() {
        const data = {
            id: this.id,
            name: this.name,
            type: this.type,
            parent: this.parent
        };

        if (this.isInstance()) {
            return {
                ...data,
                source: structuredClone(this.source),
                overrides: structuredClone(this.overrides ?? {})
            };
        }

        return {
            ...data,
            components: this.components.map(component => component.toJSON())
        };
    }

    toResolvedJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            parent: this.parent,
            source: this.source ? structuredClone(this.source) : null,
            overrides: structuredClone(this.overrides ?? {}),
            components: this.components.map(component => component.toJSON())
        };
    }


    static fromJSON(data) {
        const actor = new this();

        actor.id = data.id;
        actor.name = data.name;
        actor.type = data.type;
        actor.parent = data.parent;

        actor.source = data.source
            ? structuredClone(data.source)
            : undefined;

        actor.overrides = data.overrides
            ? structuredClone(data.overrides)
            : {};

        if (Array.isArray(data.components)) {
            actor.components = data.components.map(
                component => ComponentRegistry.fromJSON(component)
            );
        } else {
            actor.components = [];
        }

        for (const property of ['position', 'rotation', 'scale']) {
            if (actor[property]?.setValue && data[property] !== undefined) {
                actor[property].setValue(data[property]);
            }
        }

        return actor;
    }

}

module.exports = IEActor;
