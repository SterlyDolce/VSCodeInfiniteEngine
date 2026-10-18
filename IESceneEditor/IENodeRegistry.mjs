// @ts-nocheck

export class IENodeRegistry {
    constructor() {
        this.nodes = new Map();
    }

    register(type, definition) {
        if (this.nodes.has(type)) {
            throw new Error(`Node already registered: ${type}`);
        }

        this.nodes.set(type, {
            ...definition,
            type,
            inputs: definition.inputs ?? [],
            outputs: definition.outputs ?? []
        });

        return this;
    }

    get(type) {
        const node = this.nodes.get(type);

        if (!node) {
            throw new Error(`Unknown node type: ${type}`);
        }

        return node;
    }

    has(type) {
        return this.nodes.has(type);
    }

    getAll() {
        return [...this.nodes.values()];
    }


    create(type, position = [0, 0], options = {}, variables = []) {
        const definition = this.get(type);

        const isVariableNode =
            type === 'variable.get' ||
            type === 'variable.set';

        const variable = isVariableNode
            ? variables.find(item => item.id === options.variableId)
            : null;

        if (isVariableNode && !variable) {
            throw new Error('A valid variable is required');
        }

        if (type === 'variable.get' && !variable) {
            throw new Error('A valid variable is required');
        }


        const createPin = (pin, direction) => ({
            id: crypto.randomUUID(),
            name: pin.name,

            type: variable && (
                pin.name === 'value' ||
                (type === 'variable.set' && pin.name === 'return')
            )
                ? variable.type
                : pin.type,

            direction,

            ...(Object.hasOwn(pin, 'default')
                ? { value: structuredClone(pin.default) }
                : {}),

            ...(pin.editor
                ? { editor: structuredClone(pin.editor) }
                : {}),

            ...(pin.assetType ? { assetType: pin.assetType } : {}),
            ...(pin.itemType ? { itemType: pin.itemType } : {}),
        });


        return {
            id: crypto.randomUUID(),
            type,
            position: [...position],
            ...options,
            pins: [
                ...definition.inputs.map(pin => createPin(pin, 'input')),
                ...definition.outputs.map(pin => createPin(pin, 'output'))
            ]
        };
    }


    onConnect(type, context) {
        const definition = this.get(type);

        if (typeof definition.onConnect === 'function') {
            definition.onConnect(context);
        }
    }

    onDisconnect(type, context) {
        const definition = this.get(type);

        if (typeof definition.onDisconnect === 'function') {
            definition.onDisconnect(context);
        }
    }


    getDefinitions() {
        return this.getAll().map(node => ({
            type: node.type,
            name: node.name,
            category: node.category,
            inputs: node.inputs,
            outputs: node.outputs
        }));
    }

    dispatch(type, event, context) {
        const definition = this.get(type);

        if (![
            'onConnect',
            'onDisconnect'
        ].includes(event)) {
            return context.node;
        }

        const handler = definition[event];

        if (typeof handler === 'function') {
            handler(context);
        }

        return context.node;
    }

}

export const nodeRegistry = new IENodeRegistry();
