// @ts-nocheck

// Infinite Engine — Animation Script Editor
// State Machines, 1D Blend Space, 2D Blend Space

const vscode = acquireVsCodeApi();

const postGraphUpdate = (action, payload = {}) => vscode.postMessage({
    type: 'onGraphUpdate',
    action,
    ...payload
});

const canvas = document.getElementById('graph');
const ctx = canvas.getContext('2d');
const area = document.getElementById('graph-area');
const statusEl = document.getElementById('status');
const graphTitleEl = document.getElementById('graph-title');
const zoomLabelEl = document.getElementById('zoom-label');
const backMachineButton = document.getElementById('back-machine');

let asset = null;
let data = null;
let animations = [];
let dirty = false;
let saving = false;
let revision = 0;
let savedRevision = 0;
let savingRevision = 0;
let saveTimer = null;

let width = 1;
let height = 1;
let dpr = 1;

let activeLayer = null;
let selected = null;
let editingBlendNode = null;
let subview = 'machine';
let drag = null;
let hover = null;
let contextMenu = null;

const view = { x: 48, y: 55, z: 0.85 };
const zoomBounds = [0.2, 3];

const sizes = {
    entry: [86, 42],
    state: [190, 86],
    blend: [210, 92],
    blend1d: [210, 92],
    blend2d: [210, 92]
};

const colors = {
    bg: '#1e1e1e',
    grid: '#42444a',
    fg: '#d4d4d4',
    muted: '#9ba3b2',
    node: '#292c32',
    stroke: '#566070',
    selected: '#87bfff',
    base: '#28785e',
    combat: '#8a574f',
    additive: '#6854a2',
    other: '#375c81',
    line: '#aeb8c7',
    gold: '#edc37a'
};

const preview = {};
const uuid = () => crypto.randomUUID();

function getThemeColor(name, fallback) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue('--vscode-' + name).trim() || fallback;
}

function getCanvasTheme() {
    return {
        foreground: getThemeColor('editor-foreground', colors.fg),
        muted: getThemeColor('descriptionForeground', colors.muted),
        node: getThemeColor('editorWidget-background', colors.node),
        header: getThemeColor('button-background', colors.other),
        headerForeground: getThemeColor('button-foreground', '#ffffff'),
        secondary: getThemeColor('button-secondaryBackground', colors.node),
        secondaryForeground: getThemeColor(
            'button-secondaryForeground',
            colors.fg
        ),
        border: getThemeColor('panel-border', colors.stroke),
        selected: getThemeColor('focusBorder', colors.selected),
        line: getThemeColor('descriptionForeground', colors.line)
    };
}

function updateChrome() {
    if (graphTitleEl) {
        graphTitleEl.textContent = subview === 'blend' && editingBlendNode
            ? `${editingBlendNode.name} / Blend Space`
            : `${activeLayer ?? 'Animation State'} / State Machine`;
    }

    if (zoomLabelEl) {
        zoomLabelEl.textContent = `${Math.round(view.z * 100)}%`;
    }

    if (backMachineButton) {
        backMachineButton.hidden = subview !== 'blend';
    }
}

function status(message) {
    if (statusEl) statusEl.textContent = message;
}

function markDirty() {
    dirty = true;
	revision++;
	clearTimeout(saveTimer);
	saveTimer = setTimeout(save, 200);
	status('Animation Script modified · Saving...');
}

function save() {
	clearTimeout(saveTimer);
    if (!data) return;

	if (saving) {
		saveTimer = setTimeout(save, 100);
		return;
	}

    saving = true;
	savingRevision = revision;
    status('Saving Animation Script...');

    data.editor ??= {};
    data.editor.activeLayer = activeLayer;
    data.editor.view = { ...view };

    postGraphUpdate('save', {
		revision: savingRevision,
        data: structuredClone(data)
    });
}

function parameters() {
    return data?.parameters ?? [];
}

function numericParameters() {
    return parameters().filter(
        param => param.type === 'number'
    );
}

function getParam(name) {
    return preview[name] ?? 0;
}

function setParam(name, value) {
    preview[name] = value;
    draw();
}

function layer() {
    return data?.layers.find(
        item => item.name === activeLayer
    );
}

function byId(id) {
    return layer()?.nodes.find(
        node => node.id === id
    );
}


let lastPropertiesSelection = null;

function syncStatePropertiesSelection() {
    const node = selected?.kind === 'node'
        ? byId(selected.id)
        : null;
	const link = selected?.kind === 'link'
		? layer()?.links.find(item => item.id === selected.id)
		: null;

	const selectionKey = node
		? `node:${layer()?.id}:${node.id}`
		: link
			? `link:${layer()?.id}:${link.id}`
			: null;

    if (lastPropertiesSelection === selectionKey) return;
    lastPropertiesSelection = selectionKey;

    postGraphUpdate('stateSelection', {
        layerId: layer()?.id ?? null,
        node: node ? structuredClone(node) : null,
		transition: link ? structuredClone(link) : null,
		fromName: link ? byId(link.from)?.name ?? 'Unknown' : null,
		toName: link ? byId(link.to)?.name ?? 'Unknown' : null,
        parameters: parameters().map(param => ({
            name: param.name,
            type: param.type
        })),
        animations: animations.map(animation => ({
            id: animation.id,
            name: animation.name
        }))
    });
}


function nodeSize(node) {
    return sizes[node.kind] || sizes.state;
}

function nodeBox(node) {
    const [w, h] = nodeSize(node);

    return {
        x: node.position[0],
        y: node.position[1],
        w, h
    };
}

function mouse(event) {
    const rect = canvas.getBoundingClientRect();

    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function toWorld(point) {
    return {
        x: (point.x - view.x) / view.z,
        y: (point.y - view.y) / view.z
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function roundRect(x, y, w, h, radius, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);

    if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
    }

    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
}

function text(
    value, x, y,
    color = colors.fg,
    size = 12,
    align = 'left'
) {
    ctx.font = `${size}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(String(value), x, y);
}

function shorten(value, maxWidth) {
    ctx.font = '12px system-ui, sans-serif';

    value = String(value);

    if (ctx.measureText(value).width <= maxWidth) {
        return value;
    }

    while (
        value.length &&
        ctx.measureText(value + '…').width > maxWidth
    ) {
        value = value.slice(0, -1);
    }

    return value + '…';
}

// -----------------------------------------------------
// Asset normalization
// -----------------------------------------------------

function normalizeAsset(incoming) {
    const copy = structuredClone(incoming);
    copy.data ??= {};

    // Convert legacy animation state data to a layer.
    // Existing state IDs and transition IDs are preserved.
    if (!Array.isArray(copy.data.layers)) {
        const old = copy.data;

        copy.data = {
            ...old,
            parameters: (old.variables ?? []).map(param => ({
                name: param.name,
                type: param.type === 'float'
                    ? 'number'
                    : param.type,
                default: param.default ?? (
                    param.type === 'boolean' ? false : 0
                )
            })),
            layers: [{
                id: uuid(),
                name: 'Base',
                mask: 'Full Body',
                mode: 'Override',
                weight: 1,
                nodes: [
                    {
                        id: 'legacy-entry-' + uuid(),
                        kind: 'entry',
                        name: 'Entry',
                        position: [60, 220]
                    },
                    ...old.states.map(state => ({
                        ...state,
                        kind: state.kind ?? 'state',
                        position: state.position ?? [350, 180]
                    }))
                ],
                links: old.transitions.map(link => ({
                    ...link,
                    id: link.id ?? uuid(),
                    label: link.label ?? 'On End'
                }))
            }]
        };

        const base = copy.data.layers[0];
        base.links.unshift({
            id: uuid(),
            from: base.nodes[0].id,
            to: old.entry,
            label: ''
        });
    }

    copy.data.parameters ??= [];
    copy.data.editor ??= {};

    for (const item of copy.data.layers) {
        item.nodes ??= [];
        item.links ??= [];
        item.mode ??= 'Override';
        item.mask ??= 'Full Body';

        for (const node of item.nodes) {
            if (node.kind === 'blend2d') {
                node.kind = 'blend';
            }

            if (
                node.kind === 'blend' ||
                node.kind === 'blend1d'
            ) {
                ensureBlendSpace(node);
            }
        }
    }

    return copy;
}

function ensureBlendSpace(node) {
    const is1D = node.kind === 'blend1d';
    const dimensions = is1D ? 1 : 2;

    node.blendSpace ??= {
        dimensions,
        parameters: is1D
            ? { x: null }
            : { x: null, y: null },
        range: is1D
            ? { x: [0, 1] }
            : {
                x: [-1, 1],
                y: [-1, 1]
            },
        samples: []
    };

    const blend = node.blendSpace;
    blend.dimensions = dimensions;
    blend.parameters ??= {};
    blend.range ??= {};
    blend.samples ??= [];

    blend.range.x ??= is1D ? [0, 1] : [-1, 1];

    if (!is1D) {
        blend.range.y ??= [-1, 1];
    }

    return blend;
}


function deleteAnimationLayer(layerId) {
    if (!data || !layerId) return;

    if (data.layers.length <= 1) {
        status('Cannot delete the last animation layer');
        return;
    }

    const index = data.layers.findIndex(
        item => item.id === layerId
    );

    if (index === -1) return;

    const removed = data.layers[index];
    data.layers.splice(index, 1);

    if (activeLayer === removed.name) {
        activeLayer = data.layers[0].name;
        subview = 'machine';
        editingBlendNode = null;
        selected = null;
        drag = null;
    }

    lastPropertiesSelection = null;

    markDirty();
    fitGraph();
}

function deleteAnimationParameter(name) {
    if (!data || !name) return;

    const index = data.parameters.findIndex(
        item => item.name === name
    );

    if (index === -1) return;

    // Protect parameters referenced by transitions.
    const usedByTransition = data.layers.some(layer =>
        layer.links.some(link =>
            (link.conditions ?? []).some(
                condition => condition.parameter === name
            )
        )
    );

    // Protect parameters referenced by Blend Spaces.
    const usedByBlendSpace = data.layers.some(layer =>
        layer.nodes.some(node =>
            Object.values(
                node.blendSpace?.parameters ?? {}
            ).includes(name)
        )
    );

    if (usedByTransition || usedByBlendSpace) {
        status(
            `Cannot delete "${name}": parameter is in use`
        );
        return;
    }

    data.parameters.splice(index, 1);
    delete preview[name];

    lastPropertiesSelection = null;

    markDirty();
    draw();
}



function addAnimationLayer() {
    if (!data) return;

    let number = data.layers.length + 1;
    let name = `Layer ${number}`;

    while (data.layers.some(layer => layer.name === name)) {
        name = `Layer ${++number}`;
    }

    const newLayer = {
        id: uuid(),
        name,
        mode: 'override',
        mask: 'Full Body',
        weight: 1,
        enabled: true,
        nodes: [{
            id: uuid(),
            kind: 'entry',
            name: 'Entry',
            position: [100, 200]
        }],
        links: []
    };

    data.layers.push(newLayer);

    // Switch to the new layer.
    activeLayer = name;
    subview = 'machine';
    selected = null;
    editingBlendNode = null;

    lastPropertiesSelection = null;

    markDirty();
    fitGraph();

    return newLayer;
}

function addAnimationParameter() {
    if (!data) return;

    let number = data.parameters.length + 1;
    let name = `Parameter ${number}`;

    while (data.parameters.some(param => param.name === name)) {
        name = `Parameter ${++number}`;
    }

    const parameter = {
        name,
        type: 'number',
        default: 0
    };

    data.parameters.push(parameter);
    preview[name] = 0;

    // Refresh the selected Blend Space or node properties.
    lastPropertiesSelection = null;

    markDirty();
    draw();

    return parameter;
}


function updateBlendSpaceProperty(message) {
    const targetLayer = data?.layers.find(
        item => item.id === message.layerId
    );

    const node = targetLayer?.nodes.find(
        item => item.id === message.nodeId
    );

    if (
        !node ||
        !['blend', 'blend1d', 'blend2d'].includes(node.kind)
    ) return;

    const blend = ensureBlendSpace(node);
    const { property, value, axis, sampleId } = message;

    const axes = node.kind === 'blend1d'
        ? ['x']
        : ['x', 'y'];

    const validAxis = axes.includes(axis);
    const numeric = Number(value);
    const finite = value !== '' && value !== null &&
        Number.isFinite(numeric);

    let changed = false;

    switch (property) {
        case 'axisParameter': {
            if (!validAxis) return;

            const name = value || null;
            const numericParams = numericParameters();

            if (
                name &&
                !numericParams.some(param => param.name === name)
            ) return;

            if (
                name &&
                axes.some(other =>
                    other !== axis &&
                    blend.parameters[other] === name
                )
            ) return;

            blend.parameters[axis] = name;
            changed = true;
            break;
        }

        case 'rangeMin':
        case 'rangeMax': {
            if (!validAxis || !finite) return;

            const range = blend.range[axis];
            if (!Array.isArray(range)) return;

            if (property === 'rangeMin') {
                if (numeric >= range[1]) return;
                range[0] = numeric;
            } else {
                if (numeric <= range[0]) return;
                range[1] = numeric;
            }

            // Keep existing samples inside the range.
            for (const sample of blend.samples) {
                sample[axis] = clamp(
                    sample[axis],
                    range[0],
                    range[1]
                );
            }

            changed = true;
            break;
        }

        case 'addSample': {
            const sample = {
                id: uuid(),
                name: `Sample ${blend.samples.length + 1}`,
                animation: null,
                x: (
                    blend.range.x[0] + blend.range.x[1]
                ) / 2
            };

            if (axes.includes('y')) {
                sample.y = (
                    blend.range.y[0] + blend.range.y[1]
                ) / 2;
            }

            blend.samples.push(sample);
            changed = true;
            break;
        }

        case 'removeSample': {
            const index = blend.samples.findIndex(
                sample => sample.id === sampleId
            );

            if (index < 0) return;

            blend.samples.splice(index, 1);
            changed = true;
            break;
        }

        case 'sampleName':
        case 'sampleAnimation':
        case 'sampleX':
        case 'sampleY': {
            const sample = blend.samples.find(
                item => item.id === sampleId
            );

            if (!sample) return;

            if (property === 'sampleName') {
                const name = String(value).trim();
                if (!name) return;
                sample.name = name;
            }

            if (property === 'sampleAnimation') {
                if (
                    value &&
                    !animations.some(item => item.id === value)
                ) return;

                sample.animation = value || null;
            }

            if (
                property === 'sampleX' ||
                property === 'sampleY'
            ) {
                const coordinate = property === 'sampleX'
                    ? 'x'
                    : 'y';

                if (!axes.includes(coordinate) || !finite) return;

                const [min, max] = blend.range[coordinate];

                sample[coordinate] = clamp(
                    numeric,
                    min,
                    max
                );
            }

            changed = true;
            break;
        }

        default:
            return;
    }

    if (!changed) return;

    markDirty();
    draw();

    // Force Properties to receive the updated graph data.
    lastPropertiesSelection = null;
    syncStatePropertiesSelection();
}

function updateAnimationStateItemProperty(message) {
    if (!data) return;

    const { kind, itemId, property, value } = message;
    let item;

    if (kind === 'animationLayer') {
        item = data.layers.find(layer => layer.id === itemId);
    } else if (kind === 'animationParameter') {
        item = data.parameters.find(param => param.name === itemId);
    }

    if (!item) return;

    if (kind === 'animationLayer') {
        if (property === 'name') {
            const name = String(value).trim();
            if (!name || data.layers.some(
                layer => layer !== item && layer.name === name
            )) return;

            if (activeLayer === item.name) activeLayer = name;
            item.name = name;
        } else if (property === 'mode') {
            if (!['override', 'additive'].includes(value)) return;
            item.mode = value;
        } else if (property === 'weight') {
            const weight = Number(value);
            if (!Number.isFinite(weight) || weight < 0 || weight > 1) return;
            item.weight = weight;
        } else if (property === 'enabled') {
            item.enabled = value === true;
        } else if (property === 'mask') {
            const names = String(value).split(',')
                .map(name => name.trim()).filter(Boolean);
            item.mask = names.length ? {
                include: [...new Set(names)],
                includeDescendants: item.mask?.includeDescendants ?? true
            } : 'Full Body';
        } else if (
            property === 'includeDescendants' &&
            item.mask && typeof item.mask === 'object'
        ) {
            item.mask.includeDescendants = value === true;
        } else {
            return;
        }
    } else if (kind === 'animationParameter') {
        if (property === 'name') {
            const name = String(value).trim();
            const oldName = item.name;
            if (!name || data.parameters.some(
                param => param !== item && param.name === name
            )) return;

            item.name = name;
            preview[name] = preview[oldName];
            delete preview[oldName];

            for (const currentLayer of data.layers) {
                for (const link of currentLayer.links) {
                    for (const condition of link.conditions ?? []) {
                        if (condition.parameter === oldName) {
                            condition.parameter = name;
                        }
                    }
                }

                for (const node of currentLayer.nodes) {
                    for (const axis of ['x', 'y']) {
                        if (node.blendSpace?.parameters?.[axis] === oldName) {
                            node.blendSpace.parameters[axis] = name;
                        }
                    }
                }
            }
        } else if (property === 'type') {
            if (!['number', 'boolean', 'trigger'].includes(value)) return;

            const referenced = data.layers.some(currentLayer =>
                currentLayer.links.some(link =>
                    (link.conditions ?? []).some(
                        condition => condition.parameter === item.name
                    )
                ) || currentLayer.nodes.some(node =>
                    Object.values(node.blendSpace?.parameters ?? {})
                        .includes(item.name)
                )
            );
            if (value !== item.type && referenced) return;

            item.type = value;
            item.default = value === 'boolean' ? false : 0;
            preview[item.name] = item.default;
            if (value === 'number') item.transitionDuration ??= 0.2;
            else {
                delete item.transitionDuration;
                delete item.smoothing;
            }
        } else if (property === 'default') {
            if (item.type === 'trigger') return;
            if (item.type === 'boolean') item.default = value === true;
            else {
                const number = Number(value);
                if (!Number.isFinite(number)) return;
                item.default = number;
            }
            preview[item.name] = item.default;
        } else if (property === 'transitionDuration') {
            const duration = Number(value);
            if (
                item.type !== 'number' || !Number.isFinite(duration) ||
                duration < 0 || duration > 10
            ) return;
            item.transitionDuration = duration;
        } else {
            return;
        }
    } else {
        return;
    }

    markDirty();
    updateChrome();
    draw();
}

function updateTransitionProperty(message) {
	const currentLayer = data?.layers.find(item => item.id === message.layerId);
	const link = currentLayer?.links.find(item => item.id === message.transitionId);
	if (!currentLayer || !link) return;

	link.mode ??= getTransitionMode(link);
	link.conditions ??= [];
	link.conditionMode ??= 'all';
	link.blendDuration ??= 0.2;
	link.exitTime ??= 1;

	if (message.operation === 'delete') {
		currentLayer.links = currentLayer.links.filter(item => item.id !== link.id);
		selected = null;
	} else if (message.operation === 'add') {
		const first = parameters()[0];
		if (!first) {
			status('Create an animation parameter first');
			return;
		}
		link.conditions.push(newTransitionCondition(first));
	} else if (message.operation === 'removeCondition') {
		link.conditions = link.conditions.filter(
			item => item.id !== message.conditionId
		);
	} else if (message.operation === 'updateCondition') {
		const condition = link.conditions.find(item => item.id === message.conditionId);
		if (!condition) return;

		if (message.property === 'parameter') {
			const next = parameters().find(item => item.name === message.value);
			if (!next) return;
			condition.parameter = next.name;
			condition.operator = transitionOperators(next.type)[0].value;
			condition.value = next.type === 'boolean' ? true : 0;
		} else if (message.property === 'operator') {
			const type = parameters().find(
				item => item.name === condition.parameter
			)?.type ?? 'number';
			if (!transitionOperators(type).some(item => item.value === message.value)) return;
			condition.operator = message.value;
		} else if (message.property === 'value') {
			const type = parameters().find(
				item => item.name === condition.parameter
			)?.type;
			if (type === 'number') {
				const number = Number(message.value);
				if (!Number.isFinite(number)) return;
				condition.value = number;
			} else if (type === 'boolean') {
				condition.value = message.value === true;
			}
		} else return;
	} else if (message.property === 'mode') {
		if (!['end', 'conditions', 'immediate'].includes(message.value)) return;
		link.mode = message.value;
	} else if (message.property === 'conditionMode') {
		if (!['all', 'any'].includes(message.value)) return;
		link.conditionMode = message.value;
	} else if (message.property === 'blendDuration') {
		const value = Number(message.value);
		if (!Number.isFinite(value) || value < 0 || value > 10) return;
		link.blendDuration = value;
	} else if (message.property === 'exitTime') {
		const value = Number(message.value);
		if (!Number.isFinite(value) || value < 0 || value > 1) return;
		link.exitTime = value;
	} else {
		return;
	}

	if (selected) updateTransitionLabel(link);
	markDirty();
	draw();
	lastPropertiesSelection = null;
	syncStatePropertiesSelection();
}


function loadAsset(incoming, availableAnimations = []) {
    asset = normalizeAsset(incoming);
    data = asset.data;
    animations = availableAnimations;

    for (const param of parameters()) {
        preview[param.name] = param.default ?? (
            param.type === 'boolean' ? false : 0
        );
    }

    activeLayer =
        data.editor?.activeLayer &&
            data.layers.some(
                item => item.name === data.editor.activeLayer
            )
            ? data.editor.activeLayer
            : data.layers[0]?.name ?? null;

    selected = null;
    lastPropertiesSelection = null;
    editingBlendNode = null;
    subview = 'machine';
    dirty = false;
    saving = false;
	clearTimeout(saveTimer);
	revision = 0;
	savedRevision = 0;
	savingRevision = 0;

    fitGraph();
    status(`${asset.name} loaded`);
}

// -----------------------------------------------------
// Graph drawing
// -----------------------------------------------------

function drawGrid() {
    ctx.fillStyle = getThemeColor('editor-background', colors.bg);
    ctx.fillRect(0, 0, width, height);

    const step = 26 * view.z;

    if (step < 8) return;

    const ox = ((view.x % step) + step) % step;
    const oy = ((view.y % step) + step) % step;

    ctx.fillStyle = getThemeColor(
        'editorIndentGuide-background1',
        colors.grid
    );

    for (let x = ox; x < width; x += step) {
        for (let y = oy; y < height; y += step) {
            ctx.fillRect(x, y, 1.5, 1.5);
        }
    }
}

function edgePoint(node, targetX, targetY) {
    const b = nodeBox(node);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;

    const dx = targetX - cx;
    const dy = targetY - cy;

    if (Math.abs(dx) + Math.abs(dy) < 0.00001) {
        return { x: cx + b.w / 2, y: cy };
    }

    const t = Math.min(
        Math.abs(dx) > 0.00001
            ? (b.w / 2) / Math.abs(dx)
            : Infinity,
        Math.abs(dy) > 0.00001
            ? (b.h / 2) / Math.abs(dy)
            : Infinity
    );

    return {
        x: cx + dx * t,
        y: cy + dy * t
    };
}

function connectionGeometry(link) {
    const from = byId(link.from);
    const to = byId(link.to);

    if (!from || !to) return null;

    const a = nodeBox(from);
    const b = nodeBox(to);

    const ax = a.x + a.w / 2;
    const ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2;
    const by = b.y + b.h / 2;

    const dx = bx - ax;
    const dy = by - ay;
    const distance = Math.hypot(dx, dy) || 1;

    const normal = {
        x: -dy / distance,
        y: dx / distance
    };

    const reverse = layer().links.some(
        item =>
            item.from === link.to &&
            item.to === link.from
    );

    const offset = reverse ? 42 : 13;

    const start = edgePoint(
        from,
        bx + normal.x * offset,
        by + normal.y * offset
    );

    const end = edgePoint(
        to,
        ax + normal.x * offset,
        ay + normal.y * offset
    );

    const control = {
        x: (start.x + end.x) / 2 + normal.x * offset * 2,
        y: (start.y + end.y) / 2 + normal.y * offset * 2
    };

    return { start, end, control };
}

function pointOn(g, t) {
    const k = 1 - t;

    return {
        x:
            k * k * g.start.x +
            2 * k * t * g.control.x +
            t * t * g.end.x,
        y:
            k * k * g.start.y +
            2 * k * t * g.control.y +
            t * t * g.end.y
    };
}

function drawLink(link) {
    const g = connectionGeometry(link);
    if (!g) return;
	const theme = getCanvasTheme();

    const active =
        selected?.kind === 'link' &&
        selected.id === link.id;

    const color = active
		? theme.selected
		: theme.line;

    ctx.beginPath();
    ctx.moveTo(g.start.x, g.start.y);
    ctx.quadraticCurveTo(
        g.control.x,
        g.control.y,
        g.end.x,
        g.end.y
    );

    ctx.lineWidth = active ? 3.4 : 2.2;
    ctx.strokeStyle = color;
    ctx.stroke();

    const p = pointOn(g, 0.82);
    const prev = pointOn(g, 0.79);
    const angle = Math.atan2(
        p.y - prev.y,
        p.x - prev.x
    );

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-6, -5);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    ctx.restore();

    if (link.label) {
        const middle = pointOn(g, 0.5);
        ctx.font = '11px system-ui, sans-serif';

        const labelWidth =
            ctx.measureText(link.label).width + 18;

        roundRect(
            middle.x - labelWidth / 2,
            middle.y - 13,
            labelWidth,
            25,
            6,
			theme.node,
			active ? theme.selected : theme.border
        );

        text(
            link.label,
            middle.x,
            middle.y + 4,
			theme.foreground,
            11,
            'center'
        );
    }
}

function drawNode(node) {
    const b = nodeBox(node);
	const theme = getCanvasTheme();

    const active =
        selected?.kind === 'node' &&
        selected.id === node.id;

    const border = active
		? theme.selected
		: theme.border;

    if (node.kind === 'entry') {
        roundRect(
            b.x, b.y, b.w, b.h,
            22,
			theme.secondary,
			active ? theme.selected : theme.border
        );

        text(
            'Entry',
            b.x + b.w / 2,
            b.y + 26,
			theme.secondaryForeground,
            12,
            'center'
        );

        return;
    }

    roundRect(
        b.x, b.y, b.w, b.h,
        8,
		theme.node,
        border
    );

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 8);
    ctx.clip();

	const header = theme.header;

    ctx.fillStyle = header;
    ctx.fillRect(b.x, b.y, b.w, 32);

    ctx.restore();

    text(
        shorten(node.name, b.w - 20),
        b.x + 11,
        b.y + 21,
		theme.headerForeground
    );

    let detail = node.detail ?? 'Animation State';

    if (node.kind === 'blend1d') {
        detail = '1D · ' +
            (node.blendSpace?.parameters?.x || 'Select X');
    }

    if (node.kind === 'blend') {
        const x =
            node.blendSpace?.parameters?.x || 'Select X';
        const y =
            node.blendSpace?.parameters?.y || 'Select Y';

        detail = `2D · ${x} / ${y}`;
    }

    text(
        shorten(detail, b.w - 20),
        b.x + 11,
        b.y + 53,
		theme.foreground,
        10
    );

    const footer =
        ['blend', 'blend1d'].includes(node.kind)
            ? 'DOUBLE CLICK TO EDIT'
            : node.loop === false
                ? 'ONCE'
                : 'LOOP';

    text(
        footer,
        b.x + 11,
        b.y + b.h - 12,
		theme.muted,
        9
    );

    if (
        hover?.id === node.id &&
        hover.kind === 'node-edge'
    ) {
        ctx.save();
		ctx.strokeStyle = theme.selected;
        ctx.lineWidth = 2;
        ctx.strokeRect(
            b.x + 2,
            b.y + 2,
            b.w - 4,
            b.h - 4
        );
        ctx.restore();
    }
}

function drawTransitionPreview() {
    if (drag?.kind !== 'transition') return;
	const theme = getCanvasTheme();

    const from = drag.fromNode;
    const start = edgePoint(
        from,
        drag.point.x,
        drag.point.y
    );

    const target = layer().nodes.find(node => {
        if (
            node.id === from.id ||
            node.kind === 'entry'
        ) return false;

        const b = nodeBox(node);

        return (
            drag.point.x >= b.x &&
            drag.point.x <= b.x + b.w &&
            drag.point.y >= b.y &&
            drag.point.y <= b.y + b.h
        );
    });

    const end = target
        ? edgePoint(target, start.x, start.y)
        : drag.point;

    const bend = Math.max(
        40,
        Math.abs(end.x - start.x) * 0.45
    );

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);

    ctx.bezierCurveTo(
        start.x + bend,
        start.y,
        end.x - bend,
        end.y,
        end.x,
        end.y
    );

    ctx.setLineDash([6, 5]);
	ctx.strokeStyle = theme.selected;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.setLineDash([]);
}


// -----------------------------------------------------
// Blend Spaces
// -----------------------------------------------------

function isBlend1D(node) {
    return node?.kind === 'blend1d';
}

function blendAxes() {
    if (!editingBlendNode) return [];

    return isBlend1D(editingBlendNode)
        ? ['x']
        : ['x', 'y'];
}

function blendRect() {
    const is1D = isBlend1D(editingBlendNode);

    if (is1D) {
        const w = Math.min(
            600,
            Math.max(120, width - 190)
        );

        return {
            x: (width - w) / 2 + 50,
            y: Math.max(155, height / 2),
            w, h: 56
        };
    }

    const side = Math.min(
        Math.max(120, width - 190),
        Math.max(120, height - 200),
        400
    );

    return {
        x: (width - side) / 2 + 55,
        y: (height - side) / 2 + 28,
        w: side,
        h: side
    };
}

function axisValue(axis) {
    const blend = editingBlendNode.blendSpace;
    const name = blend.parameters[axis];

    return Number(getParam(name)) || 0;
}

function axisRange(axis) {
    return editingBlendNode.blendSpace.range[axis];
}

function axisFraction(axis) {
    const [min, max] = axisRange(axis);

    return clamp(
        (axisValue(axis) - min) / (max - min || 1),
        0, 1
    );
}

function drawBlendSpace() {
    if (!editingBlendNode) return;

    const node = editingBlendNode;
    const blend = ensureBlendSpace(node);
    const oneD = isBlend1D(node);
    const r = blendRect();
	const theme = {
		background: getThemeColor('editorWidget-background', colors.node),
		border: getThemeColor('panel-border', colors.stroke),
		grid: getThemeColor('editorIndentGuide-background1', colors.grid),
		foreground: getThemeColor('editor-foreground', colors.fg),
		sample: getThemeColor('button-secondaryBackground', colors.other),
		sampleBorder: getThemeColor('button-secondaryForeground', colors.fg),
		active: getThemeColor('focusBorder', colors.selected)
	};

    roundRect(
        r.x, r.y, r.w, r.h,
		6, theme.background, theme.border
    );

	ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;

    if (oneD) {
        const centerY = r.y + r.h / 2;

        ctx.beginPath();
        ctx.moveTo(r.x + 8, centerY);
        ctx.lineTo(r.x + r.w - 8, centerY);
        ctx.stroke();

        const [min, max] = blend.range.x;

        for (const sample of blend.samples) {
            const fraction = clamp(
                (sample.x - min) / (max - min || 1),
                0, 1
            );

            const x = r.x + fraction * r.w;

            ctx.beginPath();
            ctx.arc(x, centerY, 7, 0, Math.PI * 2);
			ctx.fillStyle = theme.sample;
            ctx.fill();
			ctx.strokeStyle = theme.sampleBorder;
            ctx.stroke();

            text(
                sample.name || 'Sample',
                x, centerY - 15,
				theme.foreground, 10, 'center'
            );
        }

        const px = r.x + axisFraction('x') * r.w;

        ctx.beginPath();
        ctx.arc(px, centerY, 10, 0, Math.PI * 2);
		ctx.fillStyle = theme.active;
        ctx.fill();

        text(
            `${blend.parameters.x || 'X'}: ` +
            axisValue('x').toFixed(2),
            r.x + r.w / 2,
            r.y + r.h + 38,
			theme.active, 12, 'center'
        );

    } else {
        for (let i = 1; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(r.x + r.w * i / 4, r.y);
            ctx.lineTo(r.x + r.w * i / 4, r.y + r.h);
            ctx.moveTo(r.x, r.y + r.h * i / 4);
            ctx.lineTo(r.x + r.w, r.y + r.h * i / 4);
            ctx.stroke();
        }

        const [xmin, xmax] = blend.range.x;
        const [ymin, ymax] = blend.range.y;

        for (const sample of blend.samples) {
            const sx = r.x + clamp(
                (sample.x - xmin) / (xmax - xmin || 1),
                0, 1
            ) * r.w;

            const sy = r.y + (
                1 - clamp(
                    (sample.y - ymin) /
                    (ymax - ymin || 1),
                    0, 1
                )
            ) * r.h;

            ctx.beginPath();
            ctx.arc(sx, sy, 7, 0, Math.PI * 2);
			ctx.fillStyle = theme.sample;
            ctx.fill();
			ctx.strokeStyle = theme.sampleBorder;
            ctx.stroke();

            text(
                sample.name || 'Sample',
                sx, sy - 13,
				theme.foreground, 10, 'center'
            );
        }

        const px = r.x + axisFraction('x') * r.w;
        const py = r.y +
            (1 - axisFraction('y')) * r.h;

        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
		ctx.fillStyle = theme.active;
        ctx.fill();

        text(
            `${blend.parameters.x || 'X'}: ` +
            axisValue('x').toFixed(2) +
            '    ' +
            `${blend.parameters.y || 'Y'}: ` +
            axisValue('y').toFixed(2),
            r.x + r.w / 2,
            r.y + r.h + 30,
			theme.active, 12, 'center'
        );
    }
}

function applyBlendPoint(point) {
    if (!editingBlendNode) return;

    const blend = editingBlendNode.blendSpace;
    const r = blendRect();

    const xName = blend.parameters.x;

    if (xName) {
        const [min, max] = blend.range.x;
        const t = clamp(
            (point.x - r.x) / r.w,
            0, 1
        );

        setParam(xName, min + t * (max - min));
    }

    if (!isBlend1D(editingBlendNode)) {
        const yName = blend.parameters.y;

        if (yName) {
            const [min, max] = blend.range.y;
            const t = clamp(
                1 - (point.y - r.y) / r.h,
                0, 1
            );

            setParam(
                yName,
                min + t * (max - min)
            );
        }
    }
}

// -----------------------------------------------------
// Blend parameter selectors
// -----------------------------------------------------



/* =========================================================
   ANIMATION ASSIGNMENT — STATE INSPECTOR
   ========================================================= */




function syncAnimationInspector() {
	// Animation-state properties are rendered by the shared Properties panel.
}




/* =========================================================
   BLEND SPACE — ANIMATION SAMPLES
   ========================================================= */



/* =========================================================
   TRANSITION PROPERTIES
   ========================================================= */

function getTransitionMode(link) {
    if (['end', 'conditions', 'immediate'].includes(link.mode)) {
        return link.mode;
    }

    if (Array.isArray(link.conditions) && link.conditions.length) {
        return 'conditions';
    }

    return 'end';
}

function transitionOperators(type) {
    if (type === 'trigger') {
        return [
            { value: 'trigger', label: 'Triggered' }
        ];
    }

    if (type === 'boolean') {
        return [
            { value: '==', label: 'Equals' },
            { value: '!=', label: 'Not Equals' }
        ];
    }

    return [
        { value: '==', label: 'Equals' },
        { value: '!=', label: 'Not Equals' },
        { value: '>', label: 'Greater Than' },
        { value: '>=', label: 'Greater or Equal' },
        { value: '<', label: 'Less Than' },
        { value: '<=', label: 'Less or Equal' }
    ];
}

function newTransitionCondition(parameter) {
    return {
        id: uuid(),
        parameter: parameter.name,
        operator: parameter.type === 'trigger'
            ? 'trigger'
            : '==',
        value: parameter.type === 'boolean'
            ? true
            : 0
    };
}

function transitionConditionText(condition) {
    const name = condition.parameter;
    const type = parameters().find(
        p => p.name === name
    )?.type;

    if (type === 'trigger') {
        return `${name} triggered`;
    }

    return `${name} ${condition.operator} ${condition.value}`;
}

function updateTransitionLabel(link) {
    const mode = getTransitionMode(link);

    if (mode === 'end') {
        link.label = 'On End';
    } else if (mode === 'immediate') {
        link.label = 'Immediate';
    } else if (!link.conditions?.length) {
        link.label = 'No Conditions';
    } else {
        const joiner = link.conditionMode === 'any'
            ? ' OR '
            : ' AND ';

        link.label = link.conditions
            .map(transitionConditionText)
            .join(joiner);
    }
}

// -----------------------------------------------------
// Main renderer
// -----------------------------------------------------

function draw() {
    updateChrome();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawGrid();

    if (!data || !activeLayer) return;

    if (subview === 'blend') {
        drawBlendSpace();
    } else {
        ctx.save();
        ctx.translate(view.x, view.y);
        ctx.scale(view.z, view.z);

        layer().links.forEach(drawLink);
        layer().nodes.forEach(drawNode);

        drawTransitionPreview();

        ctx.restore();

    }

    syncAnimationInspector();
    syncStatePropertiesSelection();
}

// -----------------------------------------------------
// Hit testing
// -----------------------------------------------------

function hitNodeEdge(node, point) {
    const b = nodeBox(node);
    const margin = 14;

    const inside =
        point.x >= b.x &&
        point.x <= b.x + b.w &&
        point.y >= b.y &&
        point.y <= b.y + b.h;

    if (!inside) return false;

    return (
        point.x - b.x <= margin ||
        b.x + b.w - point.x <= margin ||
        point.y - b.y <= margin ||
        b.y + b.h - point.y <= margin
    );
}

function hit(point) {
    if (subview === 'blend') {
        return { kind: 'blend' };
    }

    const p = toWorld(point);

    for (const node of [...layer().nodes].reverse()) {
        const b = nodeBox(node);

        if (
            p.x >= b.x &&
            p.x <= b.x + b.w &&
            p.y >= b.y &&
            p.y <= b.y + b.h
        ) {
            return {
                kind: hitNodeEdge(node, p)
                    ? 'node-edge'
                    : 'node',
                id: node.id,
                node
            };
        }
    }

    let closest = null;
    let best = Infinity;

    for (const link of layer().links) {
        const geometry = connectionGeometry(link);
        if (!geometry) continue;

        for (let i = 0; i <= 42; i++) {
            const q = pointOn(geometry, i / 42);

            const distance = Math.hypot(
                p.x - q.x,
                p.y - q.y
            );

            if (distance < best) {
                best = distance;
                closest = link;
            }
        }
    }

    return closest && best < 11 / view.z
        ? { kind: 'link', id: closest.id, link: closest }
        : { kind: 'background' };
}

// -----------------------------------------------------
// Nodes and transitions
// -----------------------------------------------------

function createNode(kind, position) {
    if (!['state', 'blend', 'blend1d'].includes(kind)) {
        return null;
    }

    const nodes = layer().nodes;

    const count = nodes.filter(
        node => node.kind === kind
    ).length + 1;

    const name = kind === 'state'
        ? `State ${count}`
        : kind === 'blend1d'
            ? `Blend Space 1D ${count}`
            : `Blend Space 2D ${count}`;

    const node = {
        id: uuid(),
        kind,
        name,
        detail: kind === 'state'
            ? 'No animation'
            : kind === 'blend1d'
                ? '1D Blend Space'
                : '2D Blend Space',
        position: [
            Math.round(position.x),
            Math.round(position.y)
        ]
    };

    if (kind === 'state') {
        node.animation = null;
        node.loop = true;
        node.speed = 1;
    } else {
        ensureBlendSpace(node);
    }

    nodes.push(node);

    selected = {
        kind: 'node',
        id: node.id
    };

    markDirty();
    draw();

    return node;
}

function createTransition(fromNode, toNode) {
    if (!fromNode || !toNode) return;

    if (fromNode.id === toNode.id) {
        status('Cannot connect a state to itself');
        return;
    }

    if (toNode.kind === 'entry') {
        status('Cannot connect into Entry');
        return;
    }

    const links = layer().links;

    if (fromNode.kind === 'entry') {
        layer().links = links.filter(
            link => link.from !== fromNode.id
        );
    } else {
        const exists = links.some(
            link =>
                link.from === fromNode.id &&
                link.to === toNode.id
        );

        if (exists) {
            status('Transition already exists');
            return;
        }
    }


    const link = {
        id: uuid(),
        from: fromNode.id,
        to: toNode.id,

        mode: fromNode.kind === 'entry'
            ? 'immediate'
            : 'end',
        exitTime: 1,
        blendDuration: 0.2,
        conditionMode: 'all',
        conditions: [],

        label: fromNode.kind === 'entry'
            ? ''
            : 'On End'
    };


    layer().links.push(link);

    selected = {
        kind: 'link',
        id: link.id
    };

    markDirty();
    draw();
}

function deleteSelected() {
    if (!selected || !layer()) return;

    if (selected.kind === 'node') {
        const node = byId(selected.id);

        if (!node || node.kind === 'entry') {
            status('Entry cannot be deleted');
            return;
        }

        layer().nodes = layer().nodes.filter(
            item => item.id !== node.id
        );

        layer().links = layer().links.filter(
            link =>
                link.from !== node.id &&
                link.to !== node.id
        );
    }

    if (selected.kind === 'link') {
        layer().links = layer().links.filter(
            link => link.id !== selected.id
        );
    }

    selected = null;
    markDirty();
    draw();
}

// -----------------------------------------------------
// Context menu
// -----------------------------------------------------

function closeContextMenu() {
    contextMenu?.remove();
    contextMenu = null;
}

function openContextMenu(point, items) {
    closeContextMenu();

    const menu = document.createElement('div');

    menu.className = 'graph-context-menu';
    menu.style.position = 'fixed';

    contextMenu = menu;

    const title = document.createElement('div');
    title.className = 'graph-menu-title';
    title.textContent = 'ANIMATION SCRIPT';

    menu.appendChild(title);

    for (const item of items) {
        if (item.separator) {
            const line = document.createElement('div');
            line.className = 'graph-menu-separator';
            menu.appendChild(line);
            continue;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'graph-menu-item';
        button.textContent = item.label;

        button.addEventListener('click', () => {
            closeContextMenu();
            item.action();
        });

        menu.appendChild(button);
    }

    document.body.appendChild(menu);

    const rect = canvas.getBoundingClientRect();
    const bounds = menu.getBoundingClientRect();

    const x = clamp(
        rect.left + point.x,
        4,
        Math.max(4, window.innerWidth - bounds.width - 4)
    );

    const y = clamp(
        rect.top + point.y,
        4,
        Math.max(4, window.innerHeight - bounds.height - 4)
    );

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}

canvas.addEventListener('contextmenu', event => {
    event.preventDefault();

    if (!data || subview !== 'machine') return;

    const point = mouse(event);
    const target = hit(point);

    if (target.kind === 'background') {
        const world = toWorld(point);

        openContextMenu(point, [
            {
                label: 'Animation State',
                action: () => createNode('state', world)
            },
            {
                label: '1D Blend Space',
                action: () => createNode('blend1d', world)
            },
            {
                label: '2D Blend Space',
                action: () => createNode('blend', world)
            },
            { separator: true },
            {
                label: 'Fit Graph',
                action: fitGraph
            }
        ]);

        return;
    }

    if (
        target.kind === 'node' ||
        target.kind === 'node-edge'
    ) {
        selected = {
            kind: 'node',
            id: target.id
        };

        const node = target.node;
        const items = [];

        if (['blend', 'blend1d'].includes(node.kind)) {
            items.push({
                label: 'Edit Blend Space',
                action: () => openBlend(node)
            });
        }

        if (node.kind !== 'entry') {
            items.push({
                label: 'Rename Node',
                action: () => {
                    const name = prompt(
                        'Node name',
                        node.name
                    );

                    if (!name?.trim()) return;

                    node.name = name.trim();
                    markDirty();
                    draw();
                }
            });

            items.push({
                label: 'Delete Node',
                action: deleteSelected
            });
        }

        if (items.length) {
            openContextMenu(point, items);
        }

        return;
    }

    if (target.kind === 'link') {
        selected = {
            kind: 'link',
            id: target.id
        };

        openContextMenu(point, [{
            label: 'Delete Transition',
            action: deleteSelected
        }]);
    }
});

document.addEventListener('pointerdown', event => {
    if (
        contextMenu &&
        !contextMenu.contains(event.target)
    ) {
        closeContextMenu();
    }
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        closeContextMenu();

        if (subview === 'blend') {
            closeBlend();
        }
    }

    if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 's'
    ) {
        event.preventDefault();
        save();
    }

    if (
        document.activeElement === canvas &&
        ['Delete', 'Backspace'].includes(event.key)
    ) {
        event.preventDefault();
        deleteSelected();
    }

    if (
        document.activeElement === canvas &&
        event.key.toLowerCase() === 'f'
    ) {
        fitGraph();
    }
});

// -----------------------------------------------------
// Navigation
// -----------------------------------------------------

function openLayer(name) {
    if (!data.layers.some(item => item.name === name)) {
        return;
    }

    closeContextMenu();

    activeLayer = name;
    subview = 'machine';
    editingBlendNode = null;
    selected = null;
    drag = null;

    fitGraph();
    status(`${name} layer`);
}

function openBlend(node) {
    editingBlendNode = node;
    ensureBlendSpace(node);

    selected = {
        kind: 'node',
        id: node.id
    };

    subview = 'blend';
    closeContextMenu();

    lastPropertiesSelection = null;
    draw();
}

function closeBlend() {
    subview = 'machine';
    editingBlendNode = null;
    draw();
}

function zoomAtCenter(factor) {
    if (!data || subview !== 'machine') return;

    const center = { x: width / 2, y: height / 2 };
    const before = toWorld(center);
    view.z = clamp(view.z * factor, zoomBounds[0], zoomBounds[1]);
    view.x = center.x - before.x * view.z;
    view.y = center.y - before.y * view.z;
    draw();
}

backMachineButton?.addEventListener('click', closeBlend);
document.getElementById('fit')?.addEventListener('click', fitGraph);
document.getElementById('zoom-out')?.addEventListener(
    'click',
    () => zoomAtCenter(0.9)
);
document.getElementById('zoom-in')?.addEventListener(
    'click',
    () => zoomAtCenter(1.1)
);


function fitGraph() {
    const nodes = layer()?.nodes ?? [];

    if (!nodes.length) {
        draw();
        return;
    }

    const boxes = nodes.map(nodeBox);

    const minX = Math.min(...boxes.map(b => b.x));
    const minY = Math.min(...boxes.map(b => b.y));
    const maxX = Math.max(...boxes.map(b => b.x + b.w));
    const maxY = Math.max(...boxes.map(b => b.y + b.h));

    const availableW = Math.max(150, width - 80);
    const availableH = Math.max(120, height - 115);

    view.z = clamp(
        Math.min(
            1.1,
            availableW / (maxX - minX + 70),
            availableH / (maxY - minY + 100)
        ),
        zoomBounds[0],
        zoomBounds[1]
    );

    view.x =
        40 +
        (availableW - (maxX - minX) * view.z) / 2 -
        minX * view.z;

    view.y =
        45 +
        (availableH - (maxY - minY) * view.z) / 2 -
        minY * view.z;

    draw();
}

// -----------------------------------------------------
// Pointer interactions
// -----------------------------------------------------

canvas.addEventListener('pointerdown', event => {
    if (
        event.button !== 0 &&
        event.button !== 1
    ) return;

    if (!data) return;

    event.preventDefault();
    canvas.focus();

    const point = mouse(event);
    const target = hit(point);

    if (event.button === 0) {
        if (target.kind === 'layer') {
            openLayer(target.name);
            return;
        }
    }

    if (
        event.button === 0 &&
        subview === 'blend'
    ) {
        const r = blendRect();

        if (
            point.x >= r.x &&
            point.x <= r.x + r.w &&
            point.y >= r.y &&
            point.y <= r.y + r.h
        ) {
            drag = {
                kind: 'blend',
                pointerId: event.pointerId
            };

            applyBlendPoint(point);
            canvas.setPointerCapture(event.pointerId);
        }

        return;
    }

    if (
        event.button === 0 &&
        target.kind === 'node-edge' &&
        subview === 'machine'
    ) {
        drag = {
            kind: 'transition',
            pointerId: event.pointerId,
            fromNode: target.node,
            point: toWorld(point)
        };

        canvas.setPointerCapture(event.pointerId);
        draw();
        return;
    }

    if (
        event.button === 0 &&
        target.kind === 'node'
    ) {
        selected = {
            kind: 'node',
            id: target.id
        };

        drag = {
            kind: 'node',
            pointerId: event.pointerId,
            node: target.node,
            start: toWorld(point),
            original: [...target.node.position],
            moved: false
        };
    } else if (
        event.button === 0 &&
        target.kind === 'link'
    ) {
        selected = {
            kind: 'link',
            id: target.id
        };

        drag = null;
    } else {
        if (event.button === 0) {
            selected = null;
        }

        drag = {
            kind: 'pan',
            pointerId: event.pointerId,
            start: point,
            x: view.x,
            y: view.y
        };
    }

    if (drag) {
        canvas.setPointerCapture(event.pointerId);
    }

    draw();
});

canvas.addEventListener('pointermove', event => {
    if (!data) return;

    const point = mouse(event);

    if (
        drag &&
        drag.pointerId === event.pointerId
    ) {
        if (drag.kind === 'pan') {
            view.x =
                drag.x + point.x - drag.start.x;

            view.y =
                drag.y + point.y - drag.start.y;

        } else if (drag.kind === 'node') {
            const current = toWorld(point);

            const newX = Math.round(
                drag.original[0] +
                current.x -
                drag.start.x
            );

            const newY = Math.round(
                drag.original[1] +
                current.y -
                drag.start.y
            );

            if (
                newX !== drag.original[0] ||
                newY !== drag.original[1]
            ) {
                drag.moved = true;
            }

            drag.node.position = [newX, newY];

        } else if (drag.kind === 'transition') {
            drag.point = toWorld(point);

        } else if (drag.kind === 'blend') {
            applyBlendPoint(point);
        }

        canvas.style.cursor =
            drag.kind === 'transition'
                ? 'crosshair'
                : 'grabbing';

        draw();
        return;
    }

    hover = hit(point);

    canvas.style.cursor =
        hover.kind === 'node-edge'
            ? 'crosshair'
            : hover.kind === 'node'
                ? 'move'
                : hover.kind === 'link'
                    ? 'pointer'
                    : 'grab';

    draw();
});

function finishPointer(event, cancelled = false) {
    if (
        !drag ||
        drag.pointerId !== event.pointerId
    ) return;

    const finished = drag;
    drag = null;

    if (
        !cancelled &&
        finished.kind === 'transition'
    ) {
        const target = hit(mouse(event));

        if (
            target.kind === 'node' ||
            target.kind === 'node-edge'
        ) {
            createTransition(
                finished.fromNode,
                target.node
            );
        }
    }

    if (
        !cancelled &&
        finished.kind === 'node' &&
        finished.moved
    ) {
        markDirty();
    }

    if (
        canvas.hasPointerCapture(event.pointerId)
    ) {
        canvas.releasePointerCapture(event.pointerId);
    }

    canvas.style.cursor = 'grab';
    draw();
}

canvas.addEventListener('pointerup', event => {
    finishPointer(event);
});

canvas.addEventListener('pointercancel', event => {
    finishPointer(event, true);
});

canvas.addEventListener('wheel', event => {
    if (!data || subview !== 'machine') return;

    event.preventDefault();

    const point = mouse(event);
    const before = toWorld(point);

    const factor = Math.exp(-event.deltaY * 0.001);

    view.z = clamp(
        view.z * factor,
        zoomBounds[0],
        zoomBounds[1]
    );

    view.x = point.x - before.x * view.z;
    view.y = point.y - before.y * view.z;

    draw();
}, { passive: false });

canvas.addEventListener('dblclick', event => {
    if (!data || subview !== 'machine') return;

    const target = hit(mouse(event));

    if (
        (
            target.kind === 'node' ||
            target.kind === 'node-edge'
        ) &&
        ['blend', 'blend1d'].includes(target.node.kind)
    ) {
        openBlend(target.node);
    }
});

// -----------------------------------------------------
// Resize
// -----------------------------------------------------

function resize() {
    const rect = area.getBoundingClientRect();

    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    draw();
}

new ResizeObserver(resize).observe(area);

canvas.tabIndex = 0;
resize();

// -----------------------------------------------------
// VS Code messages
// -----------------------------------------------------

window.addEventListener('message', event => {
    const message = event.data;

    switch (message.type) {

        case 'deleteAnimationLayer':
            deleteAnimationLayer(message.layerId);
            break;

        case 'deleteAnimationParameter':
            deleteAnimationParameter(message.name);
            break;

        case 'addAnimationLayer':
            addAnimationLayer();
            break;

        case 'addAnimationParameter':
            addAnimationParameter();
            break;

        case 'updateBlendSpaceProperty':
            updateBlendSpaceProperty(message);
            break;

        case 'updateAnimationStateItemProperty':
            updateAnimationStateItemProperty(message);
            break;

		case 'updateTransitionProperty':
			updateTransitionProperty(message);
			break;

        case 'updateStateNodeProperty': {
            const targetLayer = data?.layers.find(
                item => item.id === message.layerId
            );

            const node = targetLayer?.nodes.find(
                item => item.id === message.nodeId
            );

            if (!node) break;

            const { property, value } = message;
            let changed = false;

            switch (property) {
                case 'name': {
                    const name = String(value).trim();
                    if (!name) break;
                    node.name = name;
                    changed = true;
                    break;
                }

                case 'animation':
                    if (node.kind !== 'state') break;
                    if (
                        value &&
                        !animations.some(animation => animation.id === value)
                    ) break;

                    node.animation = value || null;
                    node.detail = animations.find(
                        animation => animation.id === node.animation
                    )?.name ?? 'No animation';
                    changed = true;
                    break;

                case 'loop':
                    if (node.kind !== 'state') break;
                    node.loop = value === true;
                    changed = true;
                    break;

                case 'speed':
                    if (
                        node.kind !== 'state' ||
                        !Number.isFinite(value) ||
                        value < 0.01 ||
                        value > 10
                    ) break;

                    node.speed = value;
                    changed = true;
                    break;
            }

            if (changed) {
                markDirty();
                lastPropertiesSelection = null;
                draw();
            }

            break;
        }

        case 'load':
            loadAsset(
                message.asset,
                message.animations ?? []
            );
            break;

        case 'animations':
            animations = message.animations ?? [];



            draw();
            status('Animation assets refreshed');
            break;

        case 'saved':
			clearTimeout(saveTimer);
			if (
				Number.isInteger(message.revision) &&
				message.revision !== savingRevision
			) break;

            saving = false;
			savedRevision = Math.max(savedRevision, savingRevision);
			dirty = revision > savedRevision;

			if (dirty) {
				saveTimer = setTimeout(save, 0);
			} else {
				status('Animation Script saved');
			}
            break;

        case 'error':
            saving = false;
            status(`Error: ${message.message}`);
            break;

        case 'externalChange':
            if (dirty) {
                status(
                    'File changed externally. Save carefully.'
                );
            } else {
                postGraphUpdate('ready');
            }
            break;
    }
});

postGraphUpdate('ready');
