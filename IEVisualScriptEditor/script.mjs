// @ts-nocheck
(() => {
    'use strict';

    const vscode = acquireVsCodeApi();
    const postGraphUpdate = (action, payload = {}) => vscode.postMessage({
        type: 'onGraphUpdate', action, ...payload
    });
    const $ = id => document.getElementById(id);
    const canvas = $('graph');
    const ctx = canvas.getContext('2d');
    const work = $('workspace');

    function getThemeColor(name, fallback) {
        return getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-' + name).trim() || fallback;
    }

    function getCanvasTheme() {
        return {
            background: getThemeColor('editor-background', '#1e1e1e'),
            foreground: getThemeColor('editor-foreground', '#cccccc'),
            grid: getThemeColor('editorIndentGuide-background1', '#404040'),
            node: getThemeColor('editorWidget-background', '#252526'),
            header: getThemeColor('sideBar-background', '#181818'),
            border: getThemeColor('panel-border', '#454545'),
            selected: getThemeColor('focusBorder', '#007fd4'),
            muted: getThemeColor('descriptionForeground', '#999999'),
            shadow: getThemeColor('widget-shadow', 'rgba(0,0,0,0.25)')
        };
    }

    const colors = {
        execution: '#7c7c7c',
        number: '#e5bc78',
        vector3: '#65c9af',
        boolean: '#eb9191',
        string: '#8abfea',
        Debug: '#8c929e',
        actor: '#b08cff',
        component: '#83d5e0',
        transformable: '#e3a369',
        reference: '#b08cff',
        asset: '#d7a6ff',
        animationstate: '#b59aff',
        any: '#d8d8d8'
    };

    const categoryColors = {
        Events: '#ab81e4',
        Variables: '#5ac5a8',
        Math: '#70a7f1',
        Transform: '#e3a369',
        Logic: '#b94848',
        References: '#6852a2',
    };

    let definitions = {};
    let actorAssets = [];
    let dataTypes = {};

    const uuid = () => crypto.randomUUID();
    const clone = value => structuredClone(value);

    let asset = null;
    let selectedNode = null;
    let selectedVariable = null;
    let selectedLink = null;
    let drag = null;
    let pendingConnection = null;
    let placement = null;
    let lastPointer = null;
    let width = 1;
    let height = 1;
    let view = { x: 55, y: 65, z: 0.85 };
    let saveTimer = null;
    let revision = 0;
    const nodeLifecycleVersions = new Map();
    let menuPosition = { x: 0, y: 0 };
	let droppedVariableId = null;
	let armedScriptItem = null;


    let activeFunctionId = null;

    const functions = () => asset?.data?.functions ?? [];

    const activeFunction = () =>
        functions().find(fn => fn.id === activeFunctionId) ?? null;

    const graph = () => activeFunction() ?? asset?.data;

    const nodes = () => graph()?.nodes ?? [];
    const links = () => graph()?.links ?? [];

    const globalVariables = () => asset?.data?.variables ?? [];
    const localVariables = () => activeFunction()?.variables ?? [];

    const variables = () => [
        ...globalVariables(),
        ...localVariables()
    ];

    const findVariable = id =>
        variables().find(variable => variable.id === id);


    const definition = node => {
        const def = definitions[node.type] ?? {
            name: node.type,
            category: 'Math'
        };

        if (node.type === 'variable.set') {
            return {
                ...def,
                name: 'Set ' + (findVariable(node.variableId)?.name ?? 'Variable')
            };
        }

        if (node.type === 'function.call') {
            const fn = functions().find(fn => fn.id === node.functionId);

            return {
                ...def,
                name: fn ? `Call ${fn.name}` : 'Missing Function'
            };
        }

        if (node.type === 'function.entry') {
            return {
                ...def,
                name: activeFunction()?.name ?? 'Function Entry'
            };
        }

        return def;
    };


    function createFunctionPin(parameter, direction) {
        return {
            id: uuid(),
            parameterId: parameter.id,
            name: parameter.name,
            type: parameter.type,
            direction,
            ...(direction === 'input' && parameter.type !== 'execution'
                ? { value: clone(parameter.default ?? defaultForType(parameter.type)) }
                : {})
        };
    }

    function defaultForType(type) {
        if (!Object.hasOwn(dataTypes, type)) {
            return null;
        }

        return clone(dataTypes[type].default);
    }


    function syncFunctionSignature(fn) {
        const graphs = [asset.data, ...functions()];
        let modified = false;

        for (const owner of graphs) {
            const graphNodes = owner.nodes ?? [];
            const graphLinks = owner.links ?? [];

            for (const node of graphNodes) {
                const isEntryOrReturn =
                    owner === fn &&
                    ['function.entry', 'function.return'].includes(node.type);

                const isCall =
                    node.type === 'function.call' &&
                    node.functionId === fn.id;

                if (!isEntryOrReturn && !isCall) continue;

                const expected = functionPins(fn, node.type);
                const previous = node.pins ?? [];
                const used = new Set();

                const updated = expected.map(pin => {
                    const old = previous.find(existing =>
                        pin.parameterId
                            ? existing.parameterId === pin.parameterId &&
                            existing.direction === pin.direction
                            : !existing.parameterId &&
                            !used.has(existing.id) &&
                            existing.name === pin.name &&
                            existing.direction === pin.direction &&
                            existing.type === 'execution'
                    );

                    if (!old) return pin;

                    used.add(old.id);

                    return {
                        ...old,
                        name: pin.name,
                        type: pin.type,
                        ...(pin.direction === 'input' &&
                            pin.type !== 'execution'
                            ? {
                                value: old.type === pin.type
                                    ? (old.value ?? pin.value)
                                    : pin.value
                            }
                            : {})
                    };
                });

                const oldPinIds = new Set(previous.map(pin => pin.id));
                const newPinIds = new Set(updated.map(pin => pin.id));

                node.pins = updated;

                const pins = new Map(
                    graphNodes.flatMap(item =>
                        (item.pins ?? []).map(pin => [pin.id, pin])
                    )
                );

                owner.links = (owner.links ?? []).filter(link => {
                    if (
                        !oldPinIds.has(link.from) &&
                        !oldPinIds.has(link.to)
                    ) return true;

                    if (
                        (oldPinIds.has(link.from) && !newPinIds.has(link.from)) ||
                        (oldPinIds.has(link.to) && !newPinIds.has(link.to))
                    ) return false;

                    const from = pins.get(link.from);
                    const to = pins.get(link.to);

                    return Boolean(
                        from &&
                        to &&
                        from.direction === 'output' &&
                        to.direction === 'input' &&
                        from.type === to.type
                    );
                });

                modified = true;
            }
        }

        return modified;
    }


    function updateFunctionParameter(message) {
        if (!asset) return;

        const fn = functions().find(
            item => item.id === message.functionId
        );

        if (!fn) return;

        const {
            direction,
            operation,
            parameterId,
            changes = {}
        } = message;

        if (!['inputs', 'outputs'].includes(direction)) return;

        fn[direction] ??= [];
        const parameters = fn[direction];



        if (operation === 'add') {
            let number = parameters.length + 1;
            let name = `Parameter${number}`;

            while (parameters.some(p => p.name === name)) {
                name = `Parameter${++number}`;
            }

            parameters.push({
                id: uuid(),
                name,
                type: 'number',
                default: 0
            });
        } else {
            const index = parameters.findIndex(
                parameter => parameter.id === parameterId
            );

            if (index === -1) return;

            if (operation === 'delete') {
                parameters.splice(index, 1);
            } else if (operation === 'update') {
                const parameter = parameters[index];

                if (Object.hasOwn(changes, 'name')) {
                    const name = String(changes.name).trim();

                    if (!name) {
                        status('Parameter name is required');
                        return;
                    }

                    if (parameters.some(p =>
                        p.id !== parameter.id &&
                        p.name.toLowerCase() === name.toLowerCase()
                    )) {
                        status('Parameter name already exists');
                        return;
                    }

                    parameter.name = name;
                }

                if (Object.hasOwn(changes, 'type')) {
                    const type = changes.type;

                    if (!Object.hasOwn(dataTypes, type)) {
                        return;
                    }

                    if (parameter.type !== type) {
                        parameter.type = type;
                        parameter.default = defaultForType(type);
                    }
                }
            } else {
                return;
            }
        }

        syncFunctionSignature(fn);

        selectedNode = null;
        selectedVariable = null;
        selectedLink = null;

        updateGraphHeader();
        draw();
        scheduleSave();

        postGraphUpdate('graphSelection', {
            selection: {
                type: 'function',
                id: fn.id,
                name: fn.name,
                value: clone(fn)
            }
        });

        status('Function signature updated');
    }


    function functionPins(fn, kind) {
        const execution = (name, direction) => ({
            id: uuid(),
            name,
            type: 'execution',
            direction
        });

        if (kind === 'function.entry') {
            return [
                execution('exec', 'output'),
                ...(fn.inputs ?? []).map(p => createFunctionPin(p, 'output'))
            ];
        }

        if (kind === 'function.return') {
            return [
                execution('exec', 'input'),
                ...(fn.outputs ?? []).map(p => createFunctionPin(p, 'input'))
            ];
        }

        if (kind === 'function.call') {
            return [
                execution('exec', 'input'),
                ...(fn.inputs ?? []).map(p => createFunctionPin(p, 'input')),
                execution('then', 'output'),
                ...(fn.outputs ?? []).map(p => createFunctionPin(p, 'output'))
            ];
        }

        return [];
    }


    function ensureFunctionNodes(fn) {
        fn.nodes ??= [];
        fn.links ??= [];
        fn.variables ??= [];

        let modified = false;

        if (!fn.nodes.some(node => node.type === 'function.entry')) {
            fn.nodes.unshift({
                id: uuid(),
                type: 'function.entry',
                functionId: fn.id,
                position: [80, 180],
                pins: functionPins(fn, 'function.entry')
            });
            modified = true;
        }

        if (!fn.nodes.some(node => node.type === 'function.return')) {
            fn.nodes.push({
                id: uuid(),
                type: 'function.return',
                functionId: fn.id,
                position: [600, 180],
                pins: functionPins(fn, 'function.return')
            });
            modified = true;
        }

        return modified;
    }


    const world = (x, y) => ({
        x: (x - view.x) / view.z,
        y: (y - view.y) / view.z
    });

    const status = message => {
        $('status').textContent = message;
    };

    function findPin(id) {
        for (const node of nodes()) {
            const pin = node.pins?.find(p => p.id === id);
            if (pin) return { node, pin };
        }
        return null;
    }




    function nodeSize(node) {
        if (node.type === 'variable.get') {
            const name = 'Get ' +
                (findVariable(node.variableId)?.name ?? 'Variable');

            ctx.font = '600 12px ' +
                getComputedStyle(document.documentElement).fontFamily;

            return {
                w: Math.max(120, ctx.measureText(name).width + 48),
                h: 40
            };
        }

        const inputs = node.pins.filter(
            pin => pin.direction === 'input'
        ).length;

        const outputs = node.pins.filter(
            pin => pin.direction === 'output'
        ).length;

        return {
            w: 190,
            h: 58 + 27 * Math.max(inputs, outputs, 1)
        };
    }



    function pinPosition(node, pin) {
        const { w, h } = nodeSize(node);

        if (node.type === 'variable.get') {
            return {
                x: node.position[0] + w,
                y: node.position[1] + h / 2
            };
        }

        const group = node.pins.filter(p => p.direction === pin.direction);
        const index = group.indexOf(pin);

        return {
            x: node.position[0] +
                (pin.direction === 'input' ? 0 : w),
            y: node.position[1] + 58 + index * 27
        };
    }

    function scheduleSave() {
        if (!asset) return;

        revision++;
        clearTimeout(saveTimer);

        saveTimer = setTimeout(() => {
            postGraphUpdate('save', {
                revision,
                asset: clone(asset)
            });
        }, 300);
    }

    function changed(message) {
        if (message) status(message);
        draw();
        sendSelection();
        scheduleSave();
    }


    function setDefinitions(items) {
        definitions = Object.fromEntries(
            items.map(node => [
                node.type,
                {
                    name: node.name,
                    category: node.category,

                    inputs: node.inputs.map(pin => [
                        pin.name,
                        pin.type,
                        Object.hasOwn(pin, 'default')
                            ? pin.default
                            : undefined,
                        pin.editor ?? null,
                        pin.assetType ?? null,
                        pin.itemType ?? null
                    ]),

                    outputs: node.outputs.map(pin => [
                        pin.name,
                        pin.type
                    ])
                }
            ])
        );

		if (asset && syncAnimationStateNodes()) {
			changed('Animation State nodes refreshed');
		}
    }

	function syncAnimationStateNodes() {
		if (!asset) return false;

		let modified = false;
		const graphs = [asset.data, ...functions()];

		for (const graph of graphs) {
			for (const node of graph.nodes ?? []) {
				if (!node.type?.startsWith('animationstate.asset:')) continue;

				const def = definitions[node.type];
				if (!def) continue;

				const previous = node.pins ?? [];
				const expected = [
					...def.inputs.map(pin => ({ pin, direction: 'input' })),
					...def.outputs.map(pin => ({ pin, direction: 'output' }))
				];
				const refreshed = expected.map(({ pin, direction }) => {
					const existing = previous.find(candidate =>
						candidate.name === pin[0] &&
						candidate.direction === direction
					);
					const sameType = existing?.type === pin[1];

					return {
						...(existing ?? { id: uuid() }),
						name: pin[0],
						type: pin[1],
						direction,
						...(direction === 'input' && pin[2] !== undefined
							? { value: sameType && existing?.value !== undefined
								? existing.value
								: clone(pin[2]) }
							: {})
					};
				});

				const validPinIds = new Set(refreshed.map(pin => pin.id));
				const oldPinIds = new Set(previous.map(pin => pin.id));
				const nextLinks = (graph.links ?? []).filter(link =>
					!(oldPinIds.has(link.from) && !validPinIds.has(link.from)) &&
					!(oldPinIds.has(link.to) && !validPinIds.has(link.to))
				);

				if (
					JSON.stringify(previous) !== JSON.stringify(refreshed) ||
					nextLinks.length !== (graph.links ?? []).length
				) {
					node.pins = refreshed;
					graph.links = nextLinks;
					modified = true;
				}
			}
		}

		return modified;
	}



    function updatePlacementPosition(point) {
        if (!placement) return;

        const node = placement.node;
        const size = nodeSize(node);
        const position = world(point.x, point.y);

        node.position = [
            Math.round(position.x - size.w / 2),
            Math.round(position.y - size.h / 2)
        ];
    }

    function startDuplicate() {
        if (!asset || !selectedNode || placement) return;

        const original = nodes().find(node => node.id === selectedNode);
        if (!original) return;

        if (original.type === 'function.entry') {
            status('Function Entry cannot be duplicated');
            return;
        }

        const duplicate = clone(original);

        duplicate.id = uuid();
        duplicate.pins = (original.pins ?? []).map(pin => ({
            ...clone(pin),
            id: uuid()
        }));

        placement = { node: duplicate };

        updatePlacementPosition(
            lastPointer ?? { x: width / 2, y: height / 2 }
        );

        closeMenu();
        canvas.style.cursor = 'crosshair';
        status('Click to place duplicate · Esc to cancel');
        draw();
    }

    function placeDuplicate(point) {
        if (!placement) return;

        updatePlacementPosition(point);

        const node = placement.node;
        placement = null;

        nodes().push(node);

        selectedNode = node.id;
        selectedVariable = null;
        selectedLink = null;
        drag = null;

        canvas.style.cursor = 'default';
        changed('Node duplicated');
    }

    function cancelDuplicate() {
        if (!placement) return;

        placement = null;
        canvas.style.cursor = 'default';
        status('Duplication cancelled');
        draw();
    }


    function createNode(type, position, variableId = null) {
        if (!asset) return;

        const def = definitions[type];
        if (!def) return;

        const isVariableNode = type === 'variable.get' || type === 'variable.set';
        const variable = isVariableNode
            ? variables().find(v => v.id === variableId)
            : null;

        if (isVariableNode && !variable) {
            status('Create a variable first');
            return;
        }


        const createPin = (entry, direction) => {
            const variablePin = variable && (
                entry[0] === 'value' ||
                (type === 'variable.set' && entry[0] === 'return')
            );

            const pinType = variablePin ? variable.type : entry[1];

            const defaultValue = variablePin && direction === 'input'
                ? clone(variable.value)
                : entry[2];

            return {
                id: uuid(),
                name: entry[0],
                type: pinType,
                direction,

                ...(defaultValue !== undefined
                    ? { value: clone(defaultValue) }
                    : {}),

                ...(entry[3]
                    ? { editor: clone(entry[3]) }
                    : {}),

                ...(entry[4]
                    ? { assetType: entry[4] }
                    : {}),

                ...(entry[5] ? { itemType: entry[5] } : {}),
            };
        };


        const node = {
            id: uuid(),
            type,
            position: [Math.round(position.x), Math.round(position.y)],
            pins: [
                ...def.inputs.map(p => createPin(p, 'input')),
                ...def.outputs.map(p => createPin(p, 'output'))
            ]
        };

        if (variable) node.variableId = variable.id;

        nodes().push(node);
        selectedNode = node.id;
        selectedVariable = null;
        selectedLink = null;

        changed('Added ' + def.name);
        return node;
    }

    function rounded(x, y, w, h, r, fill, stroke) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);

        if (fill) {
            ctx.fillStyle = fill;
            ctx.fill();
        }

        if (stroke) {
            ctx.lineWidth = 1;
            ctx.strokeStyle = stroke;
            ctx.stroke();
        }
    }

    function bezier(a, b, color, thickness = 2.4) {
        const bend = Math.max(55, Math.abs(b.x - a.x) * 0.48);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.bezierCurveTo(
            a.x + bend, a.y,
            b.x - bend, b.y,
            b.x, b.y
        );

        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        ctx.stroke();
    }

    function draw() {
        if (!width) return;

        const theme = getCanvasTheme();

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = theme.background;
        ctx.fillRect(0, 0, width, height);

        const spacing = 26 * view.z;
        const ox = ((view.x % spacing) + spacing) % spacing;
        const oy = ((view.y % spacing) + spacing) % spacing;

        ctx.fillStyle = theme.grid;

        for (let x = ox; x < width; x += spacing) {
            for (let y = oy; y < height; y += spacing) {
                ctx.beginPath();
                ctx.arc(x, y, 0.85, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        if (!asset) return;

        ctx.save();
        ctx.translate(view.x, view.y);
        ctx.scale(view.z, view.z);

        for (const link of links()) {
            const a = findPin(link.from);
            const b = findPin(link.to);

            if (!a || !b) continue;

            const isExec = a.pin.type === 'execution';

            bezier(
                pinPosition(a.node, a.pin),
                pinPosition(b.node, b.pin),
                isExec ? '#7c7c7c' : (colors[a.pin.type] ?? theme.muted),
                selectedLink === link.id ? 5 : (isExec ? 4 : 2.4)
            );
        }

        if (drag?.kind === 'pin') {
            const point = world(drag.x, drag.y);
            const origin = pinPosition(drag.node, drag.pin);
            const color = colors[drag.pin.type] ?? theme.foreground;

            if (drag.pin.direction === 'output') {
                bezier(origin, point, color);
            } else {
                bezier(point, origin, color);
            }
        }

        for (const node of [
            ...nodes(),
            ...(placement ? [placement.node] : [])
        ]) {
            const { w, h } = nodeSize(node);

            if (node.type === 'variable.get') {
                const variable = findVariable(node.variableId);
                const label = 'Get ' + (variable?.name ?? 'Variable');
                const theme = getCanvasTheme();

                const x = node.position[0];
                const y = node.position[1];

                rounded(
                    x, y, w, h, h / 2,
                    theme.node,
                    selectedNode === node.id ? theme.selected : theme.border
                );

                ctx.font = '600 12px ' +
                    getComputedStyle(document.documentElement).fontFamily;
                ctx.fillStyle = theme.foreground;
                ctx.textAlign = 'left';
                ctx.fillText(label, x + 16, y + h / 2 + 4);

                const pin = node.pins.find(p => p.direction === 'output');

                if (pin) {
                    const p = pinPosition(node, pin);

                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                    ctx.fillStyle = colors[pin.type] ?? theme.muted;
                    ctx.fill();
                    ctx.strokeStyle = theme.node;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }



                continue;
            }
            const { name, category } = definition(node);
            const color = categoryColors[category] ?? theme.selected;
            const x = node.position[0];
            const y = node.position[1];

            const headerHeight = 36;

            ctx.save();
            ctx.shadowColor = theme.shadow;
            ctx.shadowBlur = 16;
            ctx.shadowOffsetY = 6;

            rounded(
                x, y, w, h, 9,
                theme.node,
                selectedNode === node.id ? theme.selected : theme.border
            );

            ctx.restore();

            // Colored header with rounded top corners
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, 9);
            ctx.clip();

            ctx.fillStyle = color;
            ctx.fillRect(x, y, w, headerHeight);

            ctx.restore();

            // Title inside colored header
            ctx.fillStyle = '#ffffff';
            ctx.font = '600 12px ' +
                getComputedStyle(document.documentElement).fontFamily;

            ctx.textAlign = 'left';
            ctx.fillText(name, x + 12, y + headerHeight / 2 + 4);

            // Divider beneath header
            ctx.beginPath();
            ctx.moveTo(x, y + headerHeight);
            ctx.lineTo(x + w, y + headerHeight);
            ctx.strokeStyle = theme.border;
            ctx.lineWidth = 1;
            ctx.stroke();

            if (node.type === 'variable.get') {
                ctx.fillStyle = theme.muted;
                ctx.font = '10px ' +
                    getComputedStyle(document.documentElement).fontFamily;
                ctx.fillText(
                    findVariable(node.variableId)?.name ?? 'Missing variable',
                    x + 12,
                    y + h - 12
                );
            }

            for (const direction of ['input', 'output']) {
                const group = node.pins.filter(p => p.direction === direction);

                for (const pin of group) {
                    const p = pinPosition(node, pin);
                    const output = direction === 'output';

                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 5.7, 0, Math.PI * 2);
                    ctx.fillStyle = colors[pin.type] ?? theme.muted;
                    ctx.fill();

                    ctx.strokeStyle = theme.node;
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    ctx.fillStyle = theme.foreground;
                    ctx.font = '11px ' +
                        getComputedStyle(document.documentElement).fontFamily;
                    ctx.textAlign = output ? 'right' : 'left';
                    ctx.fillText(
                        pin.name,
                        p.x + (output ? -12 : 12),
                        p.y + 4
                    );
                    ctx.textAlign = 'left';
                }
            }

            if (node.type === 'reference.actor') {

            }

        }

        ctx.restore();
    }

    function hit(x, y) {
        const point = world(x, y);

        for (const node of [...nodes()].reverse()) {
            for (const pin of node.pins) {
                const p = pinPosition(node, pin);

                if (Math.hypot(point.x - p.x, point.y - p.y) < 12) {
                    return { kind: 'pin', node, pin };
                }
            }

            const { w, h } = nodeSize(node);

            if (
                point.x >= node.position[0] &&
                point.x <= node.position[0] + w &&
                point.y >= node.position[1] &&
                point.y <= node.position[1] + h
            ) {
                return { kind: 'node', node };
            }
        }

        return { kind: 'background' };
    }

    function distanceToLink(link, x, y) {
        const a = findPin(link.from);
        const b = findPin(link.to);

        if (!a || !b) return Infinity;

        const start = pinPosition(a.node, a.pin);
        const end = pinPosition(b.node, b.pin);
        const bend = Math.max(55, Math.abs(end.x - start.x) * 0.48);
        let best = Infinity;

        for (let i = 0; i <= 30; i++) {
            const t = i / 30;
            const k = 1 - t;

            const px =
                k ** 3 * start.x +
                3 * k ** 2 * t * (start.x + bend) +
                3 * k * t ** 2 * (end.x - bend) +
                t ** 3 * end.x;

            const py =
                k ** 3 * start.y +
                3 * k ** 2 * t * start.y +
                3 * k * t ** 2 * end.y +
                t ** 3 * end.y;

            best = Math.min(best, Math.hypot(px - x, py - y));
        }

        return best;
    }

    function hitLink(x, y) {
        const p = world(x, y);

        return [...links()].reverse().find(link =>
            distanceToLink(link, p.x, p.y) < 8 / view.z
        );
    }



    function dispatchConnectionLifecycle(event, link, owner = graph()) {
        if (!asset || !owner) return;

        const allPins = (owner.nodes ?? []).flatMap(node =>
            (node.pins ?? []).map(pin => ({ node, pin }))
        );

        const source = allPins.find(item =>
            item.pin.id === link.from
        );

        const target = allPins.find(item =>
            item.pin.id === link.to
        );

        if (!source || !target) return;

        const nodeId = target.node.id;

        const sequence =
            (nodeLifecycleVersions.get(nodeId) ?? 0) + 1;

        nodeLifecycleVersions.set(nodeId, sequence);

        postGraphUpdate('nodeLifecycle', {
            event,
            functionId: owner === asset.data ? null : owner.id,
            sequence,

            node: clone(target.node),
            input: clone(target.pin),
            output: clone(source.pin),
            sourceNode: clone(source.node)
        });
    }

    function removeGraphConnection(link, owner = graph()) {
        if (!link || !owner) return;

        owner.links = (owner.links ?? []).filter(
            item => item.id !== link.id
        );

        dispatchConnectionLifecycle(
            'onDisconnect',
            link,
            owner
        );
    }





    function connect(a, b) {
        if (a.pin.direction === b.pin.direction) return;

        const from = a.pin.direction === 'output' ? a : b;
        const to = a.pin.direction === 'input' ? a : b;

        if (!canConnectTypes(from.pin.type, to.pin.type)) {
            status('Pin types do not match');
            return;
        }

        if (from.node.id === to.node.id) return;

        const owner = graph();

        if ((owner.links ?? []).some(link =>
            link.from === from.pin.id &&
            link.to === to.pin.id
        )) return;

        if (to.pin.type !== 'execution') {
            const previousLinks = [...owner.links].filter(
                link => link.to === to.pin.id
            );

            for (const link of previousLinks) {
                removeGraphConnection(link, owner);
            }
        }

        const link = {
            id: uuid(),
            from: from.pin.id,
            to: to.pin.id
        };

        owner.links.push(link);

        dispatchConnectionLifecycle(
            'onConnect',
            link,
            owner
        );

        changed('Pins connected');
    }



    function coords(event) {
        const rect = canvas.getBoundingClientRect();

        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

	const SCRIPT_ITEM_MIME = 'application/vnd.infinite.script-item';

	function readDroppedScriptItem(dataTransfer) {
		let raw = dataTransfer.getData(SCRIPT_ITEM_MIME);

		if (!raw) {
			raw = dataTransfer.getData('text/plain');
			const prefix = 'infinite-script-item:';

			if (!raw.startsWith(prefix)) return null;
			raw = raw.slice(prefix.length);
		}

		try {
			const item = JSON.parse(raw);
			return ['variable', 'function'].includes(item?.kind)
				? item
				: null;
		} catch {
			return null;
		}
	}

	function postScriptItemDrop(item, clientX, clientY) {
		if (!asset || !item) return false;

		const rect = canvas.getBoundingClientRect();
		const position = world(clientX - rect.left, clientY - rect.top);
		postGraphUpdate('scriptItemDrop', {
			item,
			position
		});

		console.log('[IE Script DnD] Posted armed item release to extension host', {
			item,
			position
		});
		return true;
	}

	window.addEventListener('mouseup', event => {
		if (event.button !== 0 || !armedScriptItem) return;

		const item = armedScriptItem;
		armedScriptItem = null;
		postScriptItemDrop(item, event.clientX, event.clientY);
	}, true);

	window.addEventListener('dragenter', event => {
		event.preventDefault();
		event.stopPropagation();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';

		console.log('[IE Script DnD] Webview received dragenter', {
			target: event.target?.id || event.target?.tagName
		});
	}, true);

	window.addEventListener('dragover', event => {
		if (!canvas.dataset.scriptDragActive) {
			canvas.dataset.scriptDragActive = 'true';
			console.log('[IE Script DnD] Webview received dragover', {
				target: event.target?.id || event.target?.tagName
			});
		}

		event.preventDefault();
		event.stopPropagation();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	}, true);

	window.addEventListener('drop', event => {
		event.preventDefault();
		event.stopPropagation();
		delete canvas.dataset.scriptDragActive;

		console.log('[IE Script DnD] Webview received drop', {
			target: event.target?.id || event.target?.tagName,
			hasAsset: Boolean(asset)
		});

		if (!asset) {
			console.warn('[IE Script DnD] Drop ignored because no script is loaded');
			return;
		}

		const item = readDroppedScriptItem(event.dataTransfer) ?? armedScriptItem;
		armedScriptItem = null;
		console.log('[IE Script DnD] Webview drag payload', item);

		const point = coords(event);

		postGraphUpdate('scriptItemDrop', {
			item: item ?? null,
			position: world(point.x, point.y)
		});

		console.log('[IE Script DnD] Posted drop to extension host', {
			item,
			position: world(point.x, point.y)
		});
	}, true);

	window.addEventListener('dragleave', event => {
		if (!event.relatedTarget) {
			delete canvas.dataset.scriptDragActive;
		}
	}, true);

    canvas.addEventListener('pointerdown', event => {
        if (!asset || event.button !== 0) return;

        if (placement) {
            event.preventDefault();
            placeDuplicate(coords(event));
            return;
        }

        closeMenu();

        const p = coords(event);
        const target = hit(p.x, p.y);

        if (target.kind === 'pin') {
            drag = { ...target, x: p.x, y: p.y };
        } else if (target.kind === 'node') {
            selectedNode = target.node.id;
            selectedVariable = null;
            selectedLink = null;

            drag = {
                kind: 'move',
                node: target.node,
                start: world(p.x, p.y),
                origin: [...target.node.position],
                moved: false
            };

            const index = nodes().indexOf(target.node);
            nodes().splice(index, 1);
            nodes().push(target.node);

        } else {
            const link = hitLink(p.x, p.y);

            selectedLink = link?.id ?? null;
            selectedNode = null;
            selectedVariable = null;

            drag = {
                kind: 'pan',
                start: p,
                origin: { x: view.x, y: view.y }
            };

        }

        canvas.setPointerCapture(event.pointerId);
        sendSelection()
        draw();
    });

    canvas.addEventListener('pointermove', event => {
        const p = coords(event);

        lastPointer = p;

        if (placement) {
            updatePlacementPosition(p);
            canvas.style.cursor = 'crosshair';
            draw();
            return;
        }

        if (drag?.kind === 'pin') {
            drag.x = p.x;
            drag.y = p.y;
        } else if (drag?.kind === 'move') {
            const q = world(p.x, p.y);
            const x = Math.round(drag.origin[0] + q.x - drag.start.x);
            const y = Math.round(drag.origin[1] + q.y - drag.start.y);

            if (
                x !== drag.node.position[0] ||
                y !== drag.node.position[1]
            ) drag.moved = true;

            drag.node.position = [x, y];
        } else if (drag?.kind === 'pan') {
            view.x = drag.origin.x + p.x - drag.start.x;
            view.y = drag.origin.y + p.y - drag.start.y;
        }

        canvas.style.cursor =
            drag?.kind === 'move' ? 'grabbing' :
                drag?.kind === 'pin' ? 'crosshair' :
                    hit(p.x, p.y).kind === 'background' ? 'grab' : 'move';

        draw();
    });

    canvas.addEventListener('pointerup', event => {
        if (!drag) return;

        const p = coords(event);


        if (drag.kind === 'pin') {
            const target = hit(p.x, p.y);

            if (
                target.kind === 'pin' &&
                target.pin.id !== drag.pin.id
            ) {
                connect(drag, target);
            } else if (
                target.kind === 'background' &&
                drag.pin.direction === 'output'
            ) {
                const source = {
                    node: drag.node,
                    pin: drag.pin
                };

                drag = null;
                draw();
                openMenu(p.x, p.y, source);
                return;
            }
        }


        if (drag.kind === 'move' && drag.moved) {
            scheduleSave();
        }

        drag = null;
        draw();
    });

    canvas.addEventListener('pointercancel', () => {
        drag = null;
        draw();
    });

    canvas.addEventListener('contextmenu', event => {
        event.preventDefault();

        if (placement) {
            cancelDuplicate();
            return;
        }

        if (!asset) return;

        const p = coords(event);
        const link = hitLink(p.x, p.y);

        if (link) {
            removeGraphConnection(link);

            selectedLink = null;
            changed('Connection removed');
            return;
        }

        if (hit(p.x, p.y).kind === 'background') {
            openMenu(p.x, p.y);
        }
    });

    canvas.addEventListener('dblclick', event => {
        if (!asset) return;

        const p = coords(event);
        const target = hit(p.x, p.y);

        if (target.kind !== 'node') return;

        selectedNode = target.node.id;
        selectedVariable = null;
        selectedLink = null;

        sendSelection();
        draw();
    });

    canvas.addEventListener('wheel', event => {
        event.preventDefault();
        if (!asset) return;

        const p = coords(event);
        const point = world(p.x, p.y);

        const zoomSpeed = 0.03;

        view.z = Math.max(
            0.25,
            Math.min(
                2.3,
                view.z * (event.deltaY < 0 ? 1 + zoomSpeed : 1 - zoomSpeed)
            )
        );

        view.x = p.x - point.x * view.z;
        view.y = p.y - point.y * view.z;

        updateZoom();
        draw();
    }, { passive: false });

    function updateZoom() {
        $('zoom-label').textContent = Math.round(view.z * 100) + '%';
    }

    function zoom(factor) {
        const x = width / 2;
        const y = height / 2;
        const p = world(x, y);

        view.z = Math.max(0.25, Math.min(2.3, view.z * factor));
        view.x = x - p.x * view.z;
        view.y = y - p.y * view.z;

        updateZoom();
        draw();
    }

    function fit() {
        if (!width) return;

        if (!nodes().length) {
            view = { x: 55, y: 65, z: 0.85 };
            updateZoom();
            draw();
            return;
        }

        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;

        for (const node of nodes()) {
            const size = nodeSize(node);

            left = Math.min(left, node.position[0]);
            top = Math.min(top, node.position[1]);
            right = Math.max(right, node.position[0] + size.w);
            bottom = Math.max(bottom, node.position[1] + size.h);
        }

        view.z = Math.max(
            0.25,
            Math.min(
                1.3,
                Math.min(
                    (width - 80) / (right - left),
                    (height - 80) / (bottom - top)
                )
            )
        );

        view.x = (width - (left + right) * view.z) / 2;
        view.y = (height - (top + bottom) * view.z) / 2;

        updateZoom();
        draw();
    }



    function openFunction(id = null) {
        if (!asset) return;

        const fn = id === null
            ? null
            : functions().find(item => item.id === id);



        if (id !== null && !fn) {
            status('Function not found');
            return;
        }

        cancelDuplicate();
        activeFunctionId = id;

        selectedNode = null;
        selectedVariable = null;
        selectedLink = null;
        drag = null;

        if (fn) {
            const created = ensureFunctionNodes(fn);
            const synchronized = syncFunctionSignature(fn);

            if (created || synchronized) {
                scheduleSave();
            }
        }

        updateGraphHeader();
        sendSelection();
        fit();

    }


    function createFunctionCall(fn, position) {
        if (!asset || !fn) return;

        const node = {
            id: uuid(),
            type: 'function.call',
            functionId: fn.id,
            position: [
                Math.round(position.x),
                Math.round(position.y)
            ],
            pins: functionPins(fn, 'function.call')
        };

        graph().nodes.push(node);

        selectedNode = node.id;
        selectedVariable = null;
        selectedLink = null;

        changed('Added Call ' + fn.name);

        return node;
    }


    function updateGraphHeader() {
        const fn = activeFunction();

        $('graph-title').textContent = fn?.name ?? 'Main Graph';
        $('back-main').hidden = !fn;
    }


    function resize() {
        const rect = work.getBoundingClientRect();
        const dpr = Math.min(devicePixelRatio || 1, 2);

        width = rect.width;
        height = rect.height;

        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }


    function syncFunctionNode(node, fn) {
        const expected = functionPins(fn, node.type);
        const existing = node.pins ?? [];
        const used = new Set();

        node.pins = expected.map(pin => {
            const previous = existing.find(old =>
                pin.parameterId
                    ? old.parameterId === pin.parameterId &&
                    old.direction === pin.direction
                    : !old.parameterId &&
                    old.name === pin.name &&
                    old.direction === pin.direction &&
                    old.type === 'execution'
            );

            if (!previous) return pin;

            used.add(previous.id);

            return {
                ...previous,
                name: pin.name,
                type: pin.type,
                ...(Object.hasOwn(pin, 'value') &&
                    !Object.hasOwn(previous, 'value')
                    ? { value: pin.value }
                    : {})
            };
        });

        return used;
    }

    function syncFunctionSignature(fn) {
        if (!asset || !fn) return;

        const targets = [
            ...(fn.nodes ?? []).filter(node =>
                node.type === 'function.entry' ||
                node.type === 'function.return'
            ),
            ...[
                ...asset.data.nodes,
                ...functions().flatMap(item => item.nodes ?? [])
            ].filter(node =>
                node.type === 'function.call' &&
                node.functionId === fn.id
            )
        ];

        for (const node of targets) {
            const validPins = syncFunctionNode(node, fn);
            const owner = functions().find(item =>
                item.nodes?.includes(node)
            );

            const targetGraph = owner ?? asset.data;

            targetGraph.links = (targetGraph.links ?? []).filter(link => {
                if (validPins.has(link.from) || validPins.has(link.to)) {
                    const from = node.pins.find(pin => pin.id === link.from);
                    const to = node.pins.find(pin => pin.id === link.to);
                    const changedPin = from ?? to;

                    if (!changedPin) return true;

                    const otherId = from ? link.to : link.from;
                    const other = targetGraph.nodes
                        .flatMap(n => n.pins ?? [])
                        .find(pin => pin.id === otherId);

                    return other?.type === changedPin.type;
                }

                const currentPinIds = new Set(node.pins.map(pin => pin.id));
                const oldPinIds = new Set([
                    ...validPins,
                    ...node._previousPinIds ?? []
                ]);

                return !(
                    (oldPinIds.has(link.from) && !currentPinIds.has(link.from)) ||
                    (oldPinIds.has(link.to) && !currentPinIds.has(link.to))
                );
            });
        }

        draw();
    }


    function deleteSelection() {
        if (!asset) return;

        if (selectedLink) {
            const link = links().find(
                item => item.id === selectedLink
            );

            if (link) {
                removeGraphConnection(link);
            }

            selectedLink = null;
            changed('Connection removed');
            return;
        }

        if (!selectedNode) return;

        const node = nodes().find(n => n.id === selectedNode);
        if (!node) return;

        if (node.type === 'function.entry') {
            status('Function Entry cannot be deleted');
            return;
        }

        const owner = graph();

        const pinIds = new Set(
            node.pins.map(pin => pin.id)
        );

        const affectedLinks = [...owner.links].filter(
            link =>
                pinIds.has(link.from) ||
                pinIds.has(link.to)
        );

        // Notify connected nodes before removing the node.
        for (const link of affectedLinks) {
            removeGraphConnection(link, owner);
        }

        owner.nodes = owner.nodes.filter(
            item => item.id !== node.id
        );

        selectedNode = null;
        changed('Node removed');
    }

    function createVariable() {
        if (!asset) return;

        const variable = {
            id: uuid(),
            name: 'Variable' + (variables().length + 1),
            type: 'number',
            value: 0
        };

        variables().push(variable);

        selectedVariable = variable.id;
        selectedNode = null;
        selectedLink = null;

        closeMenu();
        changed('Variable created');
    }

    function closeMenu() {
        $('node-menu').hidden = true;
        pendingConnection = null;
		droppedVariableId = null;
		$('menu-search').placeholder = 'Search nodes...';
    }


    function compatibleInput(pins) {
        if (!pendingConnection) return true;

        return pins.some(pin =>
            pin.direction === 'input' &&
            pin.type === pendingConnection.pin.type
        );
    }

    function finishNodeCreation(node) {
        if (!node) {
            closeMenu();
            return;
        }

        const source = pendingConnection;

        if (source) {
            const input = node.pins.find(pin =>
                pin.direction === 'input' &&
                canConnectTypes(source.pin.type, pin.type)
            );

            if (input) {
                connect(source, { node, pin: input });
            }
        }

        closeMenu();
    }

    function definitionCanConnect(def) {
        if (!pendingConnection) return true;

        return def.inputs.some(entry =>
            canConnectTypes(pendingConnection.pin.type, entry[1])
        );
    }


    function renderMenu() {
        const root = $('menu-items');
        root.replaceChildren();

		if (droppedVariableId) {
			const variable = findVariable(droppedVariableId);

			if (!variable) {
				closeMenu();
				return;
			}

			const heading = document.createElement('div');
			heading.className = 'menu-category';
			heading.textContent = variable.name;
			root.appendChild(heading);

			for (const entry of [
				{ label: `Get ${variable.name}`, type: 'variable.get' },
				{ label: `Set ${variable.name}`, type: 'variable.set' }
			]) {
				const button = document.createElement('button');
				button.className = 'menu-item';
				button.textContent = entry.label;
				button.onclick = () => {
					const node = createNode(entry.type, menuPosition, variable.id);
					finishNodeCreation(node);
				};
				root.appendChild(button);
			}

			return;
		}

        if (pendingConnection) {
            const hint = document.createElement('div');
            hint.className = 'menu-category';
            hint.textContent =
                `Connect ${pendingConnection.pin.type} to...`;

            root.appendChild(hint);
        }

        const query = $('menu-search').value.toLowerCase().trim();

        const categories = [
            ...new Set(
                Object.values(definitions).map(node => node.category)
            )
        ];

        for (const category of categories) {
            const hiddenTypes = new Set([
                'variable.get',
                'variable.set',
                'function.entry',
                'function.return',
                'function.call'
            ]);

            const matches = Object.entries(definitions).filter(
                ([type, def]) =>
                    !hiddenTypes.has(type) &&
                    def.category === category &&
                    definitionCanConnect(def) &&
                    (
                        type.toLowerCase().includes(query) ||
                        def.name.toLowerCase().includes(query)
                    )
            );

            if (!matches.length) continue;

            const heading = document.createElement('div');
            heading.className = 'menu-category';
            heading.textContent = category;
            root.appendChild(heading);

            for (const [type, def] of matches) {
                const button = document.createElement('button');
                button.className = 'menu-item';
                button.textContent = def.name;

                button.onclick = () => {
                    const node = createNode(type, menuPosition);
                    finishNodeCreation(node);
                };

                root.appendChild(button);
            }
        }


        const availableVariables = variables();

        const variableEntries = availableVariables.flatMap(variable => [
            {
                label: `Get ${variable.name}`,
                type: 'variable.get',
                variableId: variable.id
            },
            {
                label: `Set ${variable.name}`,
                type: 'variable.set',
                variableId: variable.id
            }
        ]).filter(entry => {
            const variable = findVariable(entry.variableId);

            const matchesSearch = entry.label
                .toLowerCase()
                .includes(query);

            const acceptsConnection =
                !pendingConnection ||
                (
                    entry.type === 'variable.set' &&
                    (
                        pendingConnection.pin.type === 'execution' ||
                        pendingConnection.pin.type === variable?.type
                    )
                );

            return matchesSearch && acceptsConnection;
        });

        if (variableEntries.length) {
            const heading = document.createElement('div');
            heading.className = 'menu-category';
            heading.textContent = 'Variables';
            root.appendChild(heading);

            for (const entry of variableEntries) {
                const button = document.createElement('button');
                button.className = 'menu-item';
                button.textContent = entry.label;

                button.onclick = () => {
                    const node = createNode(
                        entry.type,
                        menuPosition,
                        entry.variableId
                    );

                    finishNodeCreation(node);
                };

                root.appendChild(button);
            }
        }


        const availableFunctions = functions();

        if (availableFunctions.length) {
            const heading = document.createElement('div');
            heading.className = 'menu-category';
            heading.textContent = 'Call Functions';
            root.appendChild(heading);

            for (const fn of availableFunctions) {
                if (fn.id === activeFunctionId) continue;

                const label = `Call ${fn.name}`;

                if (
                    pendingConnection &&
                    !functionPins(fn, 'function.call').some(pin =>
                        pin.direction === 'input' &&
                        pin.type === pendingConnection.pin.type
                    )
                ) continue;

                if (
                    query &&
                    !label.toLowerCase().includes(query)
                ) continue;

                const button = document.createElement('button');
                button.className = 'menu-item';
                button.textContent = label;

                button.onclick = () => {
                    const node = createFunctionCall(fn, menuPosition);
                    finishNodeCreation(node);
                };

                root.appendChild(button);
            }
        }

    }


    function openMenu(x, y, source = null) {
		droppedVariableId = null;
        pendingConnection = source;
        menuPosition = world(x, y);

        const menu = $('node-menu');
        menu.hidden = false;

        menu.style.left = Math.max(
            8,
            Math.min(x, width - 245)
        ) + 'px';

        menu.style.top = Math.max(
            8,
            Math.min(y, height - 310)
        ) + 'px';

        $('menu-search').value = '';
        renderMenu();
        $('menu-search').focus();
    }

	function openDroppedVariableMenu(variableId, position) {
		droppedVariableId = variableId;
		pendingConnection = null;
		menuPosition = position;

		const menu = $('node-menu');
		menu.hidden = false;

		const x = position.x * view.z + view.x;
		const y = position.y * view.z + view.y;
		menu.style.left = Math.max(8, Math.min(x, width - 245)) + 'px';
		menu.style.top = Math.max(8, Math.min(y, height - 310)) + 'px';

		$('menu-search').value = '';
		$('menu-search').placeholder = 'Choose Get or Set';
		renderMenu();
	}



    function graphForFunction(functionId) {
        if (!functionId) return asset?.data;

        return functions().find(fn => fn.id === functionId) ?? null;
    }

    function defaultGraphValue(type) {
        return defaultForType(type);
    }

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

    function updateVariablePins(variable, ownerFunctionId) {
        const graphs = ownerFunctionId
            ? [graphForFunction(ownerFunctionId)]
            : [asset.data, ...functions()];

        for (const targetGraph of graphs) {
            if (!targetGraph) continue;

            const affectedPins = new Set();

            for (const node of targetGraph.nodes ?? []) {
                if (
                    !['variable.get', 'variable.set'].includes(node.type) ||
                    node.variableId !== variable.id
                ) continue;

                for (const pin of node.pins ?? []) {
                    const isVariableValuePin =
                        pin.name === 'value' ||
                        (node.type === 'variable.set' && pin.name === 'return');

                    if (!isVariableValuePin) continue;

                    pin.type = variable.type;
                    affectedPins.add(pin.id);

                    if (pin.direction === 'input') {
                        pin.value = clone(variable.value);
                    }
                }
            }

            const pins = new Map(
                (targetGraph.nodes ?? []).flatMap(node =>
                    (node.pins ?? []).map(pin => [pin.id, pin])
                )
            );

            targetGraph.links = (targetGraph.links ?? []).filter(link => {
                if (
                    !affectedPins.has(link.from) &&
                    !affectedPins.has(link.to)
                ) return true;

                const from = pins.get(link.from);
                const to = pins.get(link.to);

                return from && to && from.type === to.type;
            });
        }
    }

    function updateGraphProperty(message) {
        if (!asset) return;

        const {
            selectionType,
            id,
            functionId,
            property,
            pinId,
            value
        } = message;

        let selection = null;

        if (selectionType === 'variable') {
            const owner = functionId
                ? graphForFunction(functionId)
                : asset.data;

            const variable = owner?.variables?.find(v => v.id === id);
            if (!variable) return;

            if (property === 'name') {
                const name = String(value).trim();
                if (!name) return;

                variable.name = name;
            } else if (property === 'type') {
                if (!Object.hasOwn(dataTypes, value)) return;

                variable.type = value;
                variable.value = defaultGraphValue(value);
                updateVariablePins(variable, functionId);
            } else if (property === 'value') {
                variable.value = clone(value);
            } else {
                return;
            }

            selection = {
                type: 'variable',
                id: variable.id,
                name: variable.name,
                functionId: functionId ?? null,
                value: clone(variable)
            };
        
} else if (selectionType === 'node') {
    const targetGraph = graphForFunction(functionId);
    const node = targetGraph?.nodes?.find(n => n.id === id);

    if (!node) return;

    if (
        node.type === 'logic.switch' &&
        property === 'switchCase'
    ) {
        node.cases ??= [
            { name: 'Case 1', value: null }
        ];

        const { operation, caseName } = message;

        if (operation === 'add') {
            let number = 1;
            let name;

            do {
                name = `Case ${number++}`;
            } while (
                node.cases.some(item => item.name === name) ||
                node.pins.some(pin =>
                    pin.direction === 'output' &&
                    pin.name === name
                )
            );

            const defaultValue = {
                number: 0,
                string: '',
                boolean: false
            }[node.valueType] ?? null;

            node.cases.push({
                name,
                value: defaultValue
            });

            const newPin = {
                id: uuid(),
                name,
                type: 'execution',
                direction: 'output'
            };

            const defaultIndex = node.pins.findIndex(pin =>
                pin.direction === 'output' &&
                pin.name === 'Default'
            );

            node.pins.splice(
                defaultIndex >= 0 ? defaultIndex : node.pins.length,
                0,
                newPin
            );
        } else if (operation === 'remove') {
            if (node.cases.length <= 1) return;

            const index = node.cases.findIndex(
                item => item.name === caseName
            );

            if (index < 0) return;

            node.cases.splice(index, 1);

            const pin = node.pins.find(pin =>
                pin.direction === 'output' &&
                pin.name === caseName
            );

            if (pin) {
                targetGraph.links = targetGraph.links.filter(
                    link => link.from !== pin.id &&
                            link.to !== pin.id
                );

                node.pins = node.pins.filter(
                    item => item.id !== pin.id
                );
            }
        } else if (operation === 'update') {
            const item = node.cases.find(
                item => item.name === caseName
            );

            if (!item) return;

            const type = node.valueType;

            if (
                !['number', 'string', 'boolean'].includes(type) ||
                typeof value !== type ||
                (type === 'number' && !Number.isFinite(value))
            ) return;

            item.value = clone(value);
        } else {
            return;
        }

        changed('Switch case updated');
        return;
    }

    // Existing regular pin editing.
    if (property !== 'pinValue') return;

    const pin = node.pins?.find(p => p.id === pinId);

    if (
        !pin ||
        pin.direction !== 'input' ||
        pin.type === 'execution' ||
        (targetGraph.links ?? []).some(
            link => link.to === pin.id
        )
    ) return;

    pin.value = clone(value);

    selection = {
        type: 'node',
        id: node.id,
        name: definition(node).name,
        functionId: functionId ?? null,
        value: clone(node)
    };
} else if (selectionType === 'function') {
            const fn = functions().find(fn => fn.id === id);
            if (!fn || property !== 'name') return;

            const name = String(value).trim();
            if (!name) return;

            fn.name = name;
            updateGraphHeader();

            selection = {
                type: 'function',
                id: fn.id,
                name: fn.name,
                value: clone(fn)
            };
        }

        if (!selection) return;

        changed('Property updated');

    }


    function sendSelection() {
        let selection = null;

        const node = nodes().find(n => n.id === selectedNode);
        const variable = findVariable(selectedVariable);

        if (variable) {
            selection = {
                type: 'variable',
                functionId: localVariables().some(v => v.id === variable.id)
                    ? activeFunctionId
                    : null,
                id: variable.id,
                name: variable.name,
                value: clone(variable)
            };
        } else if (node) {
            selection = {
                type: 'node',
                functionId: activeFunctionId,
                id: node.id,
                name: definition(node).name,
                value: clone(node),
                pinSchemas: Object.fromEntries(
                    node.pins
                        .filter(pin => pin.direction === 'input')
                        .map(pin => {
                            const input = definitions[node.type]
                                ?.inputs?.find(entry => entry[0] === pin.name);

                            const editor = pin.editor ?? input?.[3];

                            return [
                                pin.id,
                                {
                                    ...(editor && typeof editor === 'object'
                                        ? clone(editor)
                                        : {}),
                                    type: editor?.type ?? pin.type,
                                    itemType: pin.itemType ?? input?.[5] ?? null,
                                    assetType: pin.assetType ?? input?.[4] ?? null
                                }
                            ];
                        })
                ),
                pinAssetTypes: Object.fromEntries(
                    node.pins
                        .filter(pin => pin.direction === 'input')
                        .map(pin => {
                            const definitionInput = definitions[node.type]
                                ?.inputs?.find(entry => entry[0] === pin.name);

                            return [
                                pin.id,
                                pin.assetType ??
                                definitionInput?.[4] ??
                                null
                            ];
                        })
                ),
                connectedPinIds: links()
                    .filter(link => node.pins.some(pin =>
                        pin.id === link.to &&
                        pin.direction === 'input'
                    ))
                    .map(link => link.to)
            };
        } else if (activeFunction()) {
            const fn = activeFunction();

            selection = {
                type: 'function',
                id: fn.id,
                name: fn.name,
                value: clone(fn)
            };
        }

        postGraphUpdate('graphSelection', {
            selection
        });
    }


    $('menu-search').oninput = renderMenu;
    $('back-main').onclick = () => openFunction(null);
    $('fit').onclick = fit;
    $('zoom-in').onclick = () => zoom(1.2);
    $('zoom-out').onclick = () => zoom(1 / 1.2);

    document.addEventListener('pointerdown', event => {
        if (!event.target.closest('#node-menu')) closeMenu();
    });

    window.addEventListener('keydown', event => {
        const focused = document.activeElement;

        if (focused?.matches('input,select,textarea')) {
            if (event.key === 'Escape') focused.blur();
            return;
        }

        if (
            event.code === 'KeyD' &&
            event.shiftKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            !event.repeat
        ) {
            event.preventDefault();
            startDuplicate();
            return;
        }
        if (placement && (event.key === 'Delete' || event.key === 'Backspace')) {
            event.preventDefault();
            return;
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            deleteSelection();
        }

        if (event.key === 'Escape') {
            if (placement) {
                event.preventDefault();
                cancelDuplicate();
                return;
            }
            closeMenu();
            drag = null;
            selectedNode = null;
            selectedVariable = null;
            selectedLink = null;

            sendSelection();
            draw();
        }
    });

    window.addEventListener('message', event => {
        const message = event.data;

		if (message.type === 'armScriptItemDrop') {
			armedScriptItem = message.item;
			console.log('[IE Script DnD] Graph armed host item', armedScriptItem);
			return;
		}

		if (message.type === 'createDroppedScriptNode') {
			console.log('[IE Script DnD] Graph received node creation', message);

			if (!asset || !Number.isFinite(message.position?.x) || !Number.isFinite(message.position?.y)) {
				console.warn('[IE Script DnD] Invalid node creation message');
				return;
			}

			if (message.kind === 'variable') {
				const variable = findVariable(message.id);
				if (!variable) {
					console.warn('[IE Script DnD] Variable node creation rejected', {
						variable
					});
					return;
				}

				openDroppedVariableMenu(variable.id, message.position);
				console.log('[IE Script DnD] Variable Get/Set menu opened', variable.id);
				return;
			}

			if (message.kind === 'function') {
				const fn = functions().find(item => item.id === message.id);

				if (!fn) {
					console.warn('[IE Script DnD] Function node creation rejected; function missing');
					return;
				}
				if (fn.id === activeFunctionId) {
					status('A function cannot call itself');
					return;
				}

				createFunctionCall(fn, message.position);
				console.log('[IE Script DnD] Function call node created', fn.id);
				return;
			}

			return;
		}


        if (message.type === 'nodeUpdated') {
            if (!asset) return;

            const owner = graphForFunction(message.functionId);
            const node = owner?.nodes?.find(
                item => item.id === message.nodeId
            );

            if (!node || !message.node) return;

            // Ignore responses from older connection events.
            if (
                nodeLifecycleVersions.get(node.id) !==
                message.sequence
            ) return;

            // Never let a lifecycle callback change node identity
            // or overwrite the user's latest canvas position.
            const { id, type, position, ...updated } = message.node;

            if (id !== node.id || type !== node.type) return;

            // Apply changed metadata and any updated pin definitions.
            for (const [key, value] of Object.entries(updated)) {
                if (key === 'pins') {
                    const currentPins = new Map(
                        node.pins.map(pin => [pin.id, pin])
                    );

                    node.pins = value.map(pin => {
                        const existing = currentPins.get(pin.id);

                        return existing
                            ? { ...existing, ...pin }
                            : pin;
                    });

                    // Remove connections to pins deleted by the callback.
                    const validPins = new Set(
                        node.pins.map(pin => pin.id)
                    );

                    const previousPins = new Set(
                        currentPins.keys()
                    );

                    owner.links = owner.links.filter(link =>
                        !(
                            previousPins.has(link.from) &&
                            !validPins.has(link.from)
                        ) &&
                        !(
                            previousPins.has(link.to) &&
                            !validPins.has(link.to)
                        )
                    );
                } else {
                    node[key] = clone(value);
                }
            }

            changed('Node updated');
            return;
        }

        if (message.type === 'nodeLifecycleError') {
            status('Node lifecycle error: ' + message.error);
            return;
        }


        if (message.type === 'actorAssets') {
            actorAssets = Array.isArray(message.assets)
                ? message.assets
                : [];


            draw();
            return;
        }

        if (message.type === 'dataTypes') {
            dataTypes = Object.fromEntries(
                message.types.map(item => [
                    item.type,
                    {
                        name: item.name,
                        default: item.default
                    }
                ])
            );
            return;
        }

        if (message.type === 'updateFunctionParameter') {
            updateFunctionParameter(message);
            return;
        }

        if (message.type === 'updateGraphProperty') {
            updateGraphProperty(message);
            return;
        }

        if (message.type === 'openFunction') {
            openFunction(message.id);
            return;
        }

        if (message.type === 'definitions') {
            setDefinitions(message.definitions);
            status(`Loaded ${Object.keys(definitions).length} node definitions`);
            return;
        }



        if (message.type === 'load') {
            const firstLoad = asset === null;
            placement = null;
            clearTimeout(saveTimer);

            asset = message.asset;
			const refreshedAnimationStates = syncAnimationStateNodes();
            if (
                activeFunctionId &&
                !functions().some(fn => fn.id === activeFunctionId)
            ) {
                activeFunctionId = null;
            }

            updateGraphHeader();
            selectedNode = null;
            selectedVariable = null;
            selectedLink = null;
            drag = null;

            sendSelection();
            resize();

            if (firstLoad) fit();
            else draw();

			if (refreshedAnimationStates) {
				scheduleSave();
				status('Animation State nodes refreshed · ' + message.filename);
			} else {
				status('Ready · ' + message.filename);
			}
        }

        if (message.type === 'invalid') {
            clearTimeout(saveTimer);
            asset = null;
            selectedNode = null;
            selectedVariable = null;
            selectedLink = null;
            sendSelection();
            status(message.error);
            draw();
        }

        if (message.type === 'saved') {
            if (message.revision === revision) {
                status('Graph updated · Cmd+S to save');
            }
        }

        if (message.type === 'saveError') {
            status('Save error: ' + message.error);
        }
    });

    const themeObserver = new MutationObserver(() => {
        draw();
    });

    themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'style']
    });

    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style']
    });

    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(resize).observe(work);
    } else {
        window.addEventListener('resize', resize);
    }

    resize();
    postGraphUpdate('ready');
})();
