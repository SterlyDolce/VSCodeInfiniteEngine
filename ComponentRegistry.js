// @ts-nocheck

class ComponentRegistry {
    static components = new Map();

    static register(type, ComponentClass) {
        if (typeof type !== 'string' || !type.trim()) {
            throw new Error('Component type must be a non-empty string.');
        }

        if (typeof ComponentClass !== 'function') {
            throw new Error(`Invalid Component class: ${type}`);
        }

        this.components.set(type, ComponentClass);
        return ComponentClass;
    }

    static has(type) {
        return this.components.has(type);
    }

    static get(type) {
        return this.components.get(type);
    }

    static create(type) {
        const ComponentClass = this.get(type);

        if (!ComponentClass) {
            throw new Error(`Unknown Component type: ${type}`);
        }

        return new ComponentClass();
    }

    static fromJSON(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid Component data.');
        }

        const ComponentClass = this.get(data.type);

        if (!ComponentClass) {
            throw new Error(`Unknown Component type: ${data.type}`);
        }

        if (typeof ComponentClass.fromJSON === 'function') {
            const component = ComponentClass.fromJSON(data);
            component.parent = data.parent ?? null;
            return component;
        }

        const component = new ComponentClass();

        for (const [key, value] of Object.entries(data)) {
            if (key === 'type') continue;

            const property = component[key];

            if (property?.setValue) {
                property.setValue(value);
            } else if (
                Object.prototype.hasOwnProperty.call(component, key) &&
                key !== 'id'
            ) {
                component[key] = structuredClone(value);
            }
        }

        if (data.id) {
            component.id = data.id;
        }

        return component;
    }

    static getTypes() {
        return [...this.components.keys()];
    }
}

module.exports = ComponentRegistry;
