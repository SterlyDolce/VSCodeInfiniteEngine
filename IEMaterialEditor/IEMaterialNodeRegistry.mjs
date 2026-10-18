// @ts-nocheck

class IEMaterialNodeRegistry {
    constructor() {
        this.nodes = new Map();
    }

    register(type, definition) {
        if (typeof type !== 'string' || !type.trim()) {
            throw new Error('Material node type is required.');
        }

        if (this.nodes.has(type)) {
            throw new Error(
                `Material node already registered: ${type}`
            );
        }

        if (!definition || typeof definition !== 'object') {
            throw new Error(`Invalid material node: ${type}`);
        }

        const node = {
            type,
            name: definition.name ?? type,
            category: definition.category ?? 'Material',
            inputs: definition.inputs ?? [],
            outputs: definition.outputs ?? [],
            compile: definition.compile ?? null,
            unique: definition.unique ?? false
        };

        this.nodes.set(type, node);
        return node;
    }

    has(type) {
        return this.nodes.has(type);
    }

    get(type) {
        return this.nodes.get(type);
    }

    getDefinitions() {
        return [...this.nodes.values()].map(node => ({
            type: node.type,
            name: node.name,
            category: node.category,
            inputs: structuredClone(node.inputs),
            outputs: structuredClone(node.outputs),
            unique: node.unique
        }));
    }

    compile(type, context) {
        const node = this.get(type);

        if (!node) {
            throw new Error(`Unknown material node: ${type}`);
        }

        if (typeof node.compile !== 'function') {
            throw new Error(
                `Material node cannot be compiled: ${type}`
            );
        }

        return node.compile(context);
    }
}

export const materialNodeRegistry =
    new IEMaterialNodeRegistry();
