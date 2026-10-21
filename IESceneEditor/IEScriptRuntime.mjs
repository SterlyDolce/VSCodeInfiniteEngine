// @ts-nocheck

import { nodeRegistry } from './Nodes/index.mjs';

const normalizeKey = value => {
    const key = String(value ?? '').trim();
    if (key.toLowerCase() === 'space') return 'Space';
    if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
    return key;
};

const normalizeMouseButton = value => {
    const button = String(value ?? 'Left').trim().toLowerCase();

    return {
        0: 'Left',
        left: 'Left',
        1: 'Middle',
        middle: 'Middle',
        2: 'Right',
        right: 'Right',
        3: 'Button 1',
        'button 1': 'Button 1',
        button1: 'Button 1',
        4: 'Button 2',
        'button 2': 'Button 2',
        button2: 'Button 2'
    }[button] ?? 'Left';
};


function canConnectTypes(outputType, inputType) {
    if (outputType === 'execution' || inputType === 'execution') {
        return outputType === inputType;
    }

    if (inputType === 'transformable') {
        return ['actor', 'component', 'transformable'].includes(outputType);
    }

    return (
        outputType === inputType ||
        outputType === 'any' ||
        inputType === 'any'
    );
}

function copyRuntimeValue(value) {
    if (value === null || value === undefined) {
        return value;
    }

    if (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (
            value.type === 'actor' ||
            value.type === 'component' ||
            value.type === 'mesh'
        )
    ) {
        return value;
    }

    return structuredClone(value);
}

export class IEScriptRuntime {
    constructor(graph, actor, engine, options = {}) {
        this.actor = actor;
        this.engine = engine;
        this.nodes = new Map();
        this.pins = new Map();
        this.incoming = new Map();
        this.outgoing = new Map();
        this.stopped = false;
        this.diagnostics = options.diagnostics ?? {};

        this.variables = options.variables ?? new Map();
        this.functions = options.functions ?? new Map(
            (graph.functions ?? []).map(fn => [fn.id, fn])
        );
        this.keyboard = options.keyboard ?? new Set();
        this.mouse = options.mouse ?? {
            position: [0, 0],
            delta: [0, 0],
            wheel: 0,
            buttons: new Set()
        };

        if (!options.variables) {
            for (const variable of graph.variables ?? []) {
                this.variables.set(variable.id, structuredClone(variable.value));
            }
        }

        for (const node of graph.nodes ?? []) {
            if (this.nodes.has(node.id)) {
                throw new Error(`Duplicate node ID: ${node.id}`);
            }

            nodeRegistry.get(node.type);
            this.nodes.set(node.id, node);

            for (const pin of node.pins ?? []) {
                if (this.pins.has(pin.id)) {
                    throw new Error(`Duplicate pin ID: ${pin.id}`);
                }

                this.pins.set(pin.id, { node, pin });
            }
        }

        for (const link of graph.links ?? []) {
            const source = this.pins.get(link.from);
            const target = this.pins.get(link.to);

            if (!source || !target) {
                throw new Error(`Invalid link: ${link.from} -> ${link.to}`);
            }

            if (
                source.pin.direction !== 'output' ||
                target.pin.direction !== 'input' ||
                !canConnectTypes(source.pin.type, target.pin.type)
            ) {
                throw new Error(
                    `Incompatible link: ${link.from} -> ${link.to}`
                );
            }

            if (
                target.pin.type !== 'execution' &&
                this.incoming.has(link.to)
            ) {
                throw new Error(`Multiple inputs connected to ${link.to}`);
            }

            if (target.pin.type !== 'execution') {
                this.incoming.set(link.to, link.from);
            }

            const connections = this.outgoing.get(link.from) ?? [];
            connections.push(link.to);
            this.outgoing.set(link.from, connections);
        }
    }

    stop() {
    this.stopped = true;
    this.clearKeyboard();
}

    getPin(node, name, direction) {
        return node.pins?.find(pin =>
            pin.name === name && pin.direction === direction
        );
    }

    getParameterPin(node, parameterId, direction) {
        return node.pins?.find(pin =>
            pin.parameterId === parameterId &&
            pin.direction === direction
        );
    }

    variableScope(frame) {
        if (!frame.locals) return this.variables;

        const globals = this.variables;
        const locals = frame.locals;

        return {
            get(id) {
                return locals.has(id) ? locals.get(id) : globals.get(id);
            },
            set(id, value) {
                if (locals.has(id)) {
                    locals.set(id, value);
                } else if (globals.has(id)) {
                    globals.set(id, value);
                } else {
                    throw new Error(`Unknown variable: ${id}`);
                }
                return this;
            },
            has(id) {
                return locals.has(id) || globals.has(id);
            }
        };
    }

    createContext(node, frame, stack = new Set(), output = null) {
        return {
            node,
            output,
            actor: this.actor,
            engine: this.engine,
            variables: this.variableScope(frame),
            keyboard: this.keyboard,
            mouse: this.mouse,
            deltaTime: frame.deltaTime,
            getReferenceResult: nodeId =>
                frame.referenceResults?.get(nodeId) ?? null,

            setReferenceResult: (nodeId, reference) => {
                frame.referenceResults ??= new Map();
                frame.referenceResults.set(nodeId, reference);
            },
            readInput: name => this.readInput(node, name, frame, stack),

            getOutputValue: name =>
                frame.outputValues?.get(node.id)?.get(name),

            setOutputValue: (name, value) => {
                frame.outputValues ??= new Map();
                const values = frame.outputValues.get(node.id) ?? new Map();
                values.set(name, value);
                frame.outputValues.set(node.id, values);
            },

            runOutput: name => {
                const queue = [];
                this.enqueue(node, name, queue);
                return this.runQueue(queue, frame);
            },

            consumeExecutionStep: () => {
                if (++frame.budget.steps > 1000) {
                    throw new Error('Script execution limit exceeded');
                }
            },

            isStopped: () => this.stopped,

            fireOutput: name => this.fireNodeOutput(node, name, frame)
        };
    }

    readInput(node, name, frame, stack = new Set()) {
        const pin = this.getPin(node, name, 'input');

        if (!pin) {
            throw new Error(`Missing input: ${node.type}.${name}`);
        }

        return this.readPinInput(pin, frame, stack);
    }

    readPinInput(pin, frame, stack = new Set()) {
        const sourceId = this.incoming.get(pin.id);

        if (!sourceId) return pin.value;

        const source = this.pins.get(sourceId);

        if (!source) {
            throw new Error(`Missing source pin: ${sourceId}`);
        }

        return this.evaluate(
            source.node,
            source.pin.name,
            frame,
            stack,
            source.pin
        );
    }

    evaluate(node, output, frame, stack = new Set(), outputPin = null) {
        if (stack.has(node.id) || stack.size >= 64) {
            throw new Error(`Circular script dependency: ${node.id}`);
        }

        if (node.type === 'function.entry') {
            const pin = outputPin ??
                this.getPin(node, output, 'output');

            return frame.parameters?.get(pin?.parameterId);
        }

        if (node.type === 'function.call') {
            const pin = outputPin ??
                this.getPin(node, output, 'output');

            if (!frame.results?.has(node.id)) {
                throw new Error(
                    `Function result is not available yet: ${node.functionId}`
                );
            }

            return frame.results.get(node.id).get(pin?.parameterId);
        }

        const definition = nodeRegistry.get(node.type);

        if (typeof definition.evaluate !== 'function') {
            throw new Error(`Node has no data output: ${node.type}`);
        }

        stack.add(node.id);

        try {
            return definition.evaluate(
                this.createContext(node, frame, stack, output)
            );
        } catch (error) {
            throw this.annotateError(error, node, 'evaluate');
        } finally {
            stack.delete(node.id);
        }
    }

    execute(node, frame) {
        if (node.type === 'function.call') {
            const fn = this.functions.get(node.functionId);

            if (!fn) {
                throw new Error(`Function not found: ${node.functionId}`);
            }

            const outputs = this.callFunction(fn, node, frame);

            frame.results ??= new Map();
            frame.results.set(node.id, outputs);

            return 'then';
        }

        const definition = nodeRegistry.get(node.type);

        if (typeof definition.execute !== 'function') {
            throw new Error(`Node is not executable: ${node.type}`);
        }

        try {
            return definition.execute(this.createContext(node, frame));
        } catch (error) {
            throw this.annotateError(error, node, 'execute');
        }
    }

    annotateError(error, node, operation) {
        const runtimeError = error instanceof Error ? error : new Error(String(error));
        runtimeError.ieRuntimeContext ??= {
            ...this.diagnostics,
            phase: `VisualScript.${operation}`,
            node: node.name ?? node.type,
            nodeType: node.type,
            nodeId: node.id
        };
        return runtimeError;
    }

    enqueue(node, name, queue) {
        const pin = this.getPin(node, name, 'output');

        if (!pin) {
            const hasExecutionOutputs = node.pins?.some(p =>
                p.direction === 'output' &&
                p.type === 'execution'
            );

            if (name === 'exec' && !hasExecutionOutputs) return;

            throw new Error(
                `Missing execution output: ${node.type}.${name}`
            );
        }

        if (pin.type !== 'execution') {
            throw new Error(
                `Invalid execution output: ${node.type}.${name}`
            );
        }

        queue.push(...(this.outgoing.get(pin.id) ?? []));
    }

    runQueue(queue, frame) {
        while (queue.length) {
            if (++frame.budget.steps > 1000) {
                throw new Error('Script execution limit exceeded');
            }

            const targetId = queue.shift();
            const target = this.pins.get(targetId);

            if (
                !target ||
                target.pin.direction !== 'input' ||
                target.pin.type !== 'execution'
            ) {
                throw new Error(`Invalid execution target: ${targetId}`);
            }

            const node = target.node;

            if (node.type === 'function.return') {
                const fn = frame.functionDefinition;

                if (!fn) {
                    throw new Error('Return node outside a function');
                }

                const values = new Map();

                for (const parameter of fn.outputs ?? []) {
                    const pin = this.getParameterPin(
                        node,
                        parameter.id,
                        'input'
                    );

                    values.set(
                        parameter.id,
                        pin
                            ? this.readPinInput(pin, frame)
                            : structuredClone(parameter.default ?? null)
                    );
                }

                return values;
            }

            const result = this.execute(node, frame);
            const nextOutput = result === undefined ? 'exec' : result;

            if (nextOutput === null) continue;

            if (typeof nextOutput !== 'string') {
                throw new Error(
                    `Invalid execution result: ${node.type}`
                );
            }

            this.enqueue(node, nextOutput, queue);
        }

        return null;
    }

    callFunction(fn, callNode, callerFrame) {
        if ((callerFrame.depth ?? 0) >= 32) {
            throw new Error(
                `Function recursion limit exceeded: ${fn.name}`
            );
        }

        const parameters = new Map();

        for (const parameter of fn.inputs ?? []) {
            const pin = this.getParameterPin(
                callNode,
                parameter.id,
                'input'
            );

            const value = pin
                ? this.readPinInput(pin, callerFrame)
                : parameter.default;

            parameters.set(
                parameter.id,
                copyRuntimeValue(value ?? parameter.default ?? null)
            );
        }

        const locals = new Map();

        for (const variable of fn.variables ?? []) {
            locals.set(
                variable.id,
                structuredClone(variable.value)
            );
        }

        const runtime = new IEScriptRuntime(
            {
                nodes: fn.nodes ?? [],
                links: fn.links ?? []
            },
            this.actor,
            this.engine,
            {
                variables: this.variables,
                functions: this.functions,
                keyboard: this.keyboard,
                mouse: this.mouse
            }
        );

        const frame = {
            deltaTime: callerFrame.deltaTime,
            parameters,
            locals,
            results: new Map(),
            referenceResults: new Map(),
            outputValues: new Map(),
            functionDefinition: fn,
            depth: (callerFrame.depth ?? 0) + 1,
            budget: callerFrame.budget
        };

        const entry = [...runtime.nodes.values()].find(
            node => node.type === 'function.entry'
        );

        if (!entry) {
            throw new Error(`Missing Function Entry: ${fn.name}`);
        }

        const queue = [];
        runtime.enqueue(entry, 'exec', queue);

        const returned = runtime.runQueue(queue, frame);

        if (returned) return returned;

        const defaults = new Map();

        for (const parameter of fn.outputs ?? []) {
            defaults.set(
                parameter.id,
                structuredClone(parameter.default ?? null)
            );
        }

        return defaults;
    }


    fireNodeOutput(node, outputName, sourceFrame) {
        if (this.stopped) return;

        const frame = {
            ...sourceFrame,
            results: new Map(),
            referenceResults: new Map(),
            outputValues: new Map(),
            budget: { steps: 0 }
        };

        const queue = [];

        this.enqueue(node, outputName, queue);
        this.runQueue(queue, frame);
    }


    fireEvent(type, frame, outputName = 'exec', key = null) {
        if (this.stopped) return;

        frame.results = new Map();
        frame.referenceResults = new Map();
        frame.outputValues = new Map();
        frame.depth = 0;
        frame.budget = { steps: 0 };

        for (const eventNode of this.nodes.values()) {
            if (eventNode.type !== type) continue;

            const definition = nodeRegistry.get(eventNode.type);
            if (!definition.event) continue;

            if (type === 'event.keyboard') {
				const configuredKey = normalizeKey(
					this.readInput(eventNode, 'key', frame, new Set())
				);

                if (configuredKey !== key) continue;
            }

            if (type === 'event.mouseButton') {
                const configuredButton = normalizeMouseButton(
                    this.readInput(eventNode, 'button', frame, new Set())
                );

                if (configuredButton !== normalizeMouseButton(key)) continue;
            }

            const queue = [];
            this.enqueue(eventNode, outputName, queue);
            this.runQueue(queue, frame);
        }
    }

    preConstruct() {
        this.fireEvent('event.preconstruct', {
            deltaTime: 0
        });
    }

    begin() {
        this.preConstruct();

        if (this.stopped) return;

        this.fireEvent('event.onbegin', {
            deltaTime: 0
        });
    }

    update(deltaTime) {
        this.fireEvent('event.update', { deltaTime });
    }

    keyDown(key) {
        if (this.keyboard.has(key)) return;

        this.keyboard.add(key);

        this.fireEvent(
            'event.keyboard',
            { deltaTime: 0 },
            'onKeyDown',
            key
        );
    }

    keyUp(key) {
        if (!this.keyboard.has(key)) return;

        this.keyboard.delete(key);

        this.fireEvent(
            'event.keyboard',
            { deltaTime: 0 },
            'onKeyUp',
            key
        );
    }

    mouseDown(button) {
        this.fireEvent(
            'event.mouseButton',
            { deltaTime: 0 },
            'onClicked',
            button
        );
    }

    mouseUp(button) {
        this.fireEvent(
            'event.mouseButton',
            { deltaTime: 0 },
            'onReleased',
            button
        );
    }

    clearKeyboard() {
        this.keyboard.clear();
    }
}
