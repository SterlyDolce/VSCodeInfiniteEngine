// @ts-nocheck

const vscode = acquireVsCodeApi();
console.log('[IEProperties] Script initialized');

import * as THREE from 'three';

const properties = document.getElementById('properties');

if (!properties) {
	throw new Error('Properties element not found');
}

let currentActor = null;
let assetMode = false;
let actorSchema = {};
let componentSchemas = {};
let resolvedAssets = {};
let availableAssets = [];
let selectedComponentId = null;
let componentSearch = '';

let geometryRenderer;
let materialRenderer;
let geometryScene;
let materialScene;
let geometryCamera;
let materialCamera;
let geometryPreviewMesh;
let materialPreviewMesh;
let geometryPreviewContainer;
let materialPreviewContainer;
let previewAnimationFrame;

function postPropertyUpdate(target, id, property, value, details = {}) {
	vscode.postMessage({
		type: 'onPropertyUpdate',
		data: {
			target,
			id,
			property,
			value,
			...details
		}
	});
}

const postOutlineUpdate = (action, payload = {}) => vscode.postMessage({
	type: 'onOutlineUpdate',
	action,
	...payload
});

const postAssetsUpdate = (action, payload = {}) => vscode.postMessage({
	type: 'onAssetsUpdate',
	action,
	...payload
});



let currentGraphSelection = null;


let currentAnimationStateSelection = null;
let currentSkeletonSelection = null;

function renderSkeletonProperties() {
	disposePreviews();
	currentActor = null;
	const selection = currentSkeletonSelection;
	const node = selection?.node;

	if (!node) {
		properties.innerHTML = '<div class="empty">Select a skeleton node</div>';
		return;
	}

	const displayNumber = value => {
		const number = Number(value);
		if (!Number.isFinite(number)) return '0';
		if (Math.abs(number) < 0.000001) return '0';
		return String(Number(number.toFixed(6)));
	};

	const vector = (property, labels) => `
		<div class="property-row">
			<div class="property-label">${property[0].toUpperCase() + property.slice(1)}</div>
			<div class="vector">
				${labels.slice(0, 3).map((label, index) => `
					<input type="number" step="any" title="${label}"
						data-skeleton-vector="${property}" data-axis="${index}"
						class="number-input-${label.toLowerCase()}"
						value="${escapeHtml(displayNumber(node[property][index]))}">
				`).join('')}
			</div>
		</div>
		${labels.length === 4 ? `
			<div class="property-row">
				<div class="property-label">Quaternion W</div>
				<input type="number" step="any"
					data-skeleton-vector="${property}" data-axis="3"
					value="${escapeHtml(displayNumber(node[property][3]))}">
			</div>` : ''}`;

	const matrix = selection.inverse
		? `<div class="matrix-grid">${selection.inverse.map(value =>
			`<span>${escapeHtml(displayNumber(value))}</span>`
		).join('')}</div>`
		: '<div class="property-value muted">Not a skin bone</div>';

	properties.innerHTML = `
		<div class="actor-name">${escapeHtml(node.name || 'Unnamed')}</div>
		<div class="section">
			<div class="section-title">Skeleton Node</div>
			<div class="property-row"><div class="property-label">Name</div>
				<input type="text" data-skeleton-property="name" value="${escapeHtml(node.name ?? '')}"></div>
			<div class="property-row"><div class="property-label">Type</div>
				<div class="property-value">${node.isBone ? 'Bone' : 'Transform'}</div></div>
			<div class="property-row"><div class="property-label">Bone Index</div>
				<div class="property-value">${selection.boneIndex < 0 ? '—' : selection.boneIndex}</div></div>
			${vector('position', ['X', 'Y', 'Z'])}
			${vector('quaternion', ['X', 'Y', 'Z', 'W'])}
			${vector('scale', ['X', 'Y', 'Z'])}
		</div>
		<div class="section"><div class="section-title">Inverse Bind Matrix</div>
			${matrix}</div>`;

	properties.querySelector('[data-skeleton-property="name"]')
		?.addEventListener('change', event => {
			postPropertyUpdate('skeletonNode', selection.nodeId, 'name', event.target.value);
		});

	for (const input of properties.querySelectorAll('[data-skeleton-vector]')) {
		input.addEventListener('change', () => {
			const value = input.valueAsNumber;
			if (!Number.isFinite(value)) return;
			const property = input.dataset.skeletonVector;
			const next = [...node[property]];
			next[Number(input.dataset.axis)] = value;
			node[property] = next;
			postPropertyUpdate('skeletonNode', selection.nodeId, property, next);
		});
	}
}

window.addEventListener('message', event => {
	if (event.data.type !== 'setSkeletonSelection') return;
	currentSkeletonSelection = event.data.selection;
	renderSkeletonProperties();
});

window.addEventListener('message', event => {
	const message = event.data;

	if (message.type !== 'setAnimationStateSelection') return;

	currentAnimationStateSelection = message.selection;
	renderAnimationStateProperties();
});


function renderBlendSpaceProperties(selection) {
	const node = selection.value;
	const blend = node.blendSpace ?? {};
	const axes = node.kind === 'blend1d'
		? ['x']
		: ['x', 'y'];

	const numericParameters = (selection.parameters ?? [])
		.filter(param => param.type === 'number');

	const animations = selection.animations ?? [];
	const escape = value => escapeHtml(value ?? '');

	const options = (items, selected, emptyLabel) => `
        <option value="">${emptyLabel}</option>
        ${items.map(item => `
            <option value="${escape(item.name ?? item.id)}"
                ${(item.name ?? item.id) === selected
			? 'selected' : ''}>
                ${escape(item.label ?? item.name)}
            </option>
        `).join('')}
    `;

	const parameterOptions = (selected) =>
		options(numericParameters, selected, 'None');

	const animationOptions = (selected) => `
        <option value="">None</option>
        ${animations.map(item => `
            <option value="${escape(item.id)}"
                ${item.id === selected ? 'selected' : ''}>
                ${escape(item.name)}
            </option>
        `).join('')}
        ${selected && !animations.some(item => item.id === selected)
			? `<option value="${escape(selected)}" selected>
                Missing Animation
              </option>`
			: ''}
    `;

	const row = (label, control) => `
        <div class="property-row">
            <div class="property-label">${label}</div>
            ${control}
        </div>
    `;

	const number = (property, value, attrs = '') => `
        <input type="number"
            data-blend-property="${property}"
            step="any"
            value="${escape(value)}"
            ${attrs}>
    `;

	const axisRows = axes.map(axis => {
		const range = blend.range?.[axis] ?? [0, 1];

		return `
            <div class="section">
                <div class="section-title">
                    ${axis.toUpperCase()} Axis
                </div>

                ${row('Parameter', `
                    <select
                        data-blend-property="axisParameter"
                        data-axis="${axis}">
                        ${parameterOptions(
			blend.parameters?.[axis] ?? null
		)}
                    </select>
                `)}

                ${row('Minimum', number(
			'rangeMin',
			range[0],
			`data-axis="${axis}"`
		))}

                ${row('Maximum', number(
			'rangeMax',
			range[1],
			`data-axis="${axis}"`
		))}
            </div>
        `;
	}).join('');

	const sampleRows = (blend.samples ?? []).map(sample => `
        <div class="section" data-sample-id="${escape(sample.id)}">
            <div class="section-title">
                ${escape(sample.name || 'Sample')}
            </div>

            ${row('Name', `
                <input type="text"
                    data-blend-property="sampleName"
                    value="${escape(sample.name ?? '')}">
            `)}

            ${row('Animation', `
                <select data-blend-property="sampleAnimation">
                    ${animationOptions(sample.animation)}
                </select>
            `)}

            ${row('X Position', number('sampleX', sample.x))}

            ${axes.includes('y')
			? row('Y Position', number('sampleY', sample.y))
			: ''}

            <button type="button"
                data-blend-action="removeSample"
                class="danger">
                Remove Sample
            </button>
        </div>
    `).join('');

	properties.innerHTML = `
        <div class="actor-name">${escape(node.name)}</div>

        <div class="section">
            <div class="section-title">
                ${axes.length}D Blend Space
            </div>

            ${row('Name', `
                <input type="text"
                    data-state-property="name"
                    value="${escape(node.name)}">
            `)}
        </div>

        ${axisRows}

        <div class="section">
            <div class="section-title">
                Animation Samples (${blend.samples?.length ?? 0})
            </div>

            <button type="button"
                data-blend-action="addSample">
                + Add Sample
            </button>
        </div>

        ${sampleRows}
    `;

	const send = (blendProperty, value = null, element = null) => {
		postPropertyUpdate(
			currentAnimationStateSelection?.kind,
			currentAnimationStateSelection?.id,
			'blendSpace',
			value,
			{
				blendProperty,
				axis: element?.dataset.axis ?? null,
				sampleId: element?.closest('[data-sample-id]')
					?.dataset.sampleId ?? null
			}
		);
	};

	for (const input of properties.querySelectorAll(
		'[data-blend-property]'
	)) {
		input.addEventListener('change', () => {
			if (input.type === 'number' && input.value === '') return;

			const value = input.type === 'number'
				? input.valueAsNumber
				: input.value;

			if (
				input.type === 'number' &&
				!Number.isFinite(value)
			) return;

			send(input.dataset.blendProperty, value, input);
		});
	}

	for (const button of properties.querySelectorAll(
		'[data-blend-action]'
	)) {
		button.addEventListener('click', () => {
			send(button.dataset.blendAction, null, button);
		});
	}

	properties.querySelector(
		'[data-state-property="name"]'
	)?.addEventListener('change', event => {
		postPropertyUpdate(
			currentAnimationStateSelection?.kind,
			currentAnimationStateSelection?.id,
			'name',
			event.target.value
		);
	});
}



function renderAnimationNodeProperties(selection) {
	disposePreviews();
	currentActor = null;
	const node = selection.value;

	if (['blend', 'blend1d', 'blend2d'].includes(node.kind)) {
		renderBlendSpaceProperties(selection);
		return;
	}



	if (!node) {
		properties.innerHTML =
			'<div class="empty">Select an animation state</div>';
		return;
	}

	const escape = value => escapeHtml(value ?? '');

	const animations = selection.animations ?? [];

	const animationOptions = [
		'<option value="">None</option>',
		...animations.map(animation => `
            <option
                value="${escape(animation.id)}"
                ${animation.id === node.animation ? 'selected' : ''}
            >
                ${escape(animation.name)}
            </option>
        `)
	].join('');

	properties.innerHTML = `
        <div class="actor-name">
            ${escape(node.name)}
        </div>

        <div class="section">
            <div class="section-title">
                Animation State
            </div>

            <div class="property-row">
                <div class="property-label">Name</div>
                <input
                    type="text"
                    data-state-property="name"
                    value="${escape(node.name)}"
                >
            </div>

            ${node.kind === 'state' ? `
                <div class="property-row">
                    <div class="property-label">Animation</div>
                    <select data-state-property="animation">
                        ${animationOptions}
                    </select>
                </div>

                <div class="property-row">
                    <div class="property-label">Loop</div>
                    <input
                        type="checkbox"
                        data-state-property="loop"
                        ${node.loop !== false ? 'checked' : ''}
                    >
                </div>

                <div class="property-row">
                    <div class="property-label">Playback Speed</div>
                    <input
                        type="number"
                        data-state-property="speed"
                        min="0.01"
                        max="10"
                        step="0.1"
                        value="${escape(node.speed ?? 1)}"
                    >
                </div>
            ` : `
                <div class="property-row">
                    <div class="property-label">Type</div>
                    <div class="property-value">
                        ${escape(node.kind)}
                    </div>
                </div>
            `}
        </div>
    `;

	for (const input of properties.querySelectorAll(
		'[data-state-property]'
	)) {
		input.addEventListener('change', () => {
			const property = input.dataset.stateProperty;

			const value = input.type === 'checkbox'
				? input.checked
				: input.type === 'number'
					? input.valueAsNumber
					: input.value;

			postPropertyUpdate(
				currentAnimationStateSelection?.kind,
				currentAnimationStateSelection?.id,
				property,
				value
			);
		});
	}
}

function renderAnimationTransitionProperties(selection) {
	disposePreviews();
	currentActor = null;

	const transition = selection.value;
	if (!transition) {
		properties.innerHTML = '<div class="empty">Select a transition</div>';
		return;
	}

	const escape = value => escapeHtml(value ?? '');
	const mode = ['end', 'conditions', 'immediate'].includes(transition.mode)
		? transition.mode
		: transition.conditions?.length ? 'conditions' : 'end';
	const parameters = selection.parameters ?? [];
	const conditions = transition.conditions ?? [];
	const parameter = name => parameters.find(item => item.name === name);
	const option = (value, label, selected) => `
		<option value="${escape(value)}" ${value === selected ? 'selected' : ''}>
			${escape(label)}
		</option>`;
	const operators = type => type === 'trigger'
		? [['trigger', 'Triggered']]
		: type === 'boolean'
			? [['==', 'Equals'], ['!=', 'Not Equals']]
			: [['==', 'Equals'], ['!=', 'Not Equals'], ['>', 'Greater Than'],
			['>=', 'Greater or Equal'], ['<', 'Less Than'], ['<=', 'Less or Equal']];

	properties.innerHTML = `
		<div class="actor-name">Transition</div>
		<div class="section">
			<div class="section-title">
				${escape(selection.fromName)} → ${escape(selection.toName)}
			</div>
			<div class="property-row">
				<div class="property-label">Transition Mode</div>
				<select data-transition-property="mode">
					${option('end', 'On End', mode)}
					${option('conditions', 'Conditions', mode)}
					${option('immediate', 'Immediate', mode)}
				</select>
			</div>
			${mode === 'end' ? `
			<div class="property-row">
				<div class="property-label">Exit Time (0–1)</div>
				<input type="number" min="0" max="1" step="0.01"
					data-transition-property="exitTime"
					value="${escape(transition.exitTime ?? 1)}">
			</div>` : ''}
			<div class="property-row">
				<div class="property-label">Crossfade Duration</div>
				<input type="number" min="0" max="10" step="0.01"
					data-transition-property="blendDuration"
					value="${escape(transition.blendDuration ?? 0.2)}">
			</div>
		</div>
		${mode === 'conditions' ? `
		<div class="section">
			<div class="section-title">Conditions (${conditions.length})</div>
			${conditions.length > 1 ? `
			<div class="property-row">
				<div class="property-label">Condition Logic</div>
				<select data-transition-property="conditionMode">
					${option('all', 'AND — All must pass', transition.conditionMode ?? 'all')}
					${option('any', 'OR — Any may pass', transition.conditionMode ?? 'all')}
				</select>
			</div>` : ''}
			<button type="button" data-transition-action="add">+ Add Condition</button>
		</div>
		${conditions.map((condition, index) => {
		const param = parameter(condition.parameter);
		return `
			<div class="section" data-condition-id="${escape(condition.id)}">
				<div class="transition-condition-title">Condition ${index + 1}</div>
				<div class="property-row">
					<div class="property-label">Parameter</div>
					<select data-condition-property="parameter">
						${parameters.map(item => option(
			item.name, `${item.name} (${item.type})`, condition.parameter
		)).join('')}
					</select>
				</div>
				<div class="property-row">
					<div class="property-label">Comparison</div>
					<select data-condition-property="operator">
						${operators(param?.type ?? 'number').map(item =>
			option(item[0], item[1], condition.operator)
		).join('')}
					</select>
				</div>
				${param?.type === 'number' ? `
				<div class="property-row">
					<div class="property-label">Value</div>
					<input type="number" step="any" data-condition-property="value"
						value="${escape(condition.value ?? 0)}">
				</div>` : ''}
				${param?.type === 'boolean' ? `
				<div class="property-row">
					<div class="property-label">Value</div>
					<select data-condition-property="value">
						${option('true', 'True', String(condition.value))}
						${option('false', 'False', String(condition.value))}
					</select>
				</div>` : ''}
				<button type="button" class="danger" data-transition-action="removeCondition">
					Remove Condition
				</button>
			</div>`;
	}).join('')}` : ''}
		<div class="section">
			<button type="button" class="danger" data-transition-action="delete">
				Delete Transition
			</button>
		</div>`;

	const send = (property, value, details = {}) => postPropertyUpdate(
		'animationTransition', selection.id, property, value, details
	);

	for (const input of properties.querySelectorAll('[data-transition-property]')) {
		input.addEventListener('change', () => {
			const value = input.type === 'number' ? input.valueAsNumber : input.value;
			if (input.type === 'number' && !Number.isFinite(value)) return;
			send(input.dataset.transitionProperty, value);
		});
	}

	for (const input of properties.querySelectorAll('[data-condition-property]')) {
		input.addEventListener('change', () => {
			let value = input.type === 'number' ? input.valueAsNumber : input.value;
			if (input.type === 'number' && !Number.isFinite(value)) return;
			if (input.dataset.conditionProperty === 'value' && input.tagName === 'SELECT') {
				value = value === 'true';
			}
			send(input.dataset.conditionProperty, value, {
				operation: 'updateCondition',
				conditionId: input.closest('[data-condition-id]').dataset.conditionId
			});
		});
	}

	for (const button of properties.querySelectorAll('[data-transition-action]')) {
		button.addEventListener('click', () => {
			const action = button.dataset.transitionAction;
			send('transition', null, {
				operation: action,
				conditionId: button.closest('[data-condition-id]')?.dataset.conditionId
			});
		});
	}
}


function renderAnimationStateProperties() {
	disposePreviews();
	currentActor = null;

	const selection = currentAnimationStateSelection;

	if (!selection) {
		properties.innerHTML =
			'<div class="empty">Select a layer or parameter</div>';
		return;
	}

	if (selection.kind === 'animationNode') {
		renderAnimationNodeProperties(selection);
		return;
	}

	if (selection.kind === 'animationTransition') {
		renderAnimationTransitionProperties(selection);
		return;
	}

	const item = selection.value;
	const isLayer = selection.kind === 'animationLayer';

	const escape = value => escapeHtml(value ?? '');

	const row = (label, property, control) => `
        <div class="property-row"
             data-animation-property="${property}">
            <div class="property-label">${label}</div>
            ${control}
        </div>
    `;

	const textInput = (property, value) => row(
		property === 'name' ? 'Name' : property,
		property,
		`<input type="text" value="${escape(value)}">`
	);

	const numberInput = (property, value, min, max, step) => row(
		property === 'default' ? 'Default' : 'Weight',
		property,
		`<input type="number"
            value="${escape(value)}"
            ${min !== null ? `min="${min}"` : ''}
            ${max !== null ? `max="${max}"` : ''}
            step="${step}">`
	);

	const checkboxInput = (label, property, value) => row(
		label,
		property,
		`<input type="checkbox" ${value ? 'checked' : ''}>`
	);

	let rows = '';

	if (isLayer) {
		const mode = String(item.mode ?? 'override').toLowerCase();

		const maskNames =
			typeof item.mask === 'object'
				? (item.mask.include ?? []).join(', ')
				: '';

		rows += textInput('name', item.name);

		rows += row('Mode', 'mode', `
            <select>
                <option value="override"
                    ${mode === 'override' ? 'selected' : ''}>
                    Override
                </option>
                <option value="additive"
                    ${mode === 'additive' ? 'selected' : ''}>
                    Additive
                </option>
            </select>
        `);

		rows += numberInput(
			'weight',
			item.weight ?? 1,
			0, 1, 0.05
		);

		rows += checkboxInput(
			'Enabled',
			'enabled',
			item.enabled !== false
		);

		rows += textInput('mask', maskNames);

		rows += checkboxInput(
			'Include Descendants',
			'includeDescendants',
			item.mask?.includeDescendants === true
		);
	} else {
		rows += textInput('name', item.name);

		rows += row('Type', 'type', `
            <select>
                ${['number', 'boolean', 'trigger'].map(type => `
                    <option value="${type}"
                        ${item.type === type ? 'selected' : ''}>
                        ${type[0].toUpperCase() + type.slice(1)}
                    </option>
                `).join('')}
            </select>
        `);



		if (item.type === 'number') {
			rows += numberInput(
				'default',
				item.default ?? 0,
				null, null, 'any'
			);

			rows += row(
				'Transition Duration',
				'transitionDuration',
				`<input
        type="number"
        min="0"
        max="10"
        step="0.05"
        value="${escape(item.transitionDuration ?? 0.2)}"
    >`
			);
		}
		else if (item.type === 'boolean') {
			rows += checkboxInput(
				'Default',
				'default',
				item.default === true
			);
		} else {
			rows += row(
				'Default',
				'default',
				'<div class="property-value">Event trigger</div>'
			);
		}
	}

	properties.innerHTML = `
        <div class="actor-name">
            ${escape(item.name)}
        </div>
        <div class="section">
            <div class="section-title">
                ${isLayer ? 'Layer Properties' : 'Parameter Properties'}
            </div>
            ${rows}
        </div>
    `;

	for (
		const element of properties.querySelectorAll(
			'[data-animation-property]'
		)
	) {
		const input = element.querySelector('input, select');
		if (!input) continue;

		input.addEventListener('change', () => {
			const property = element.dataset.animationProperty;

			const value = input.type === 'checkbox'
				? input.checked
				: input.type === 'number'
					? input.valueAsNumber
					: input.value;

			postPropertyUpdate(
				currentAnimationStateSelection?.kind,
				currentAnimationStateSelection?.id,
				property,
				value
			);
		});
	}
}



let dataTypes = [];

function getDataTypes() {
	return dataTypes;
}

function renderTypeOptions(selectedType) {
	const types = [...getDataTypes()];

	if (
		selectedType &&
		!types.some(item => item.type === selectedType)
	) {
		types.push({
			type: selectedType,
			name: `Unknown (${selectedType})`
		});
	}

	return types.map(({ type, name }) => `
        <option
            value="${escapeHtml(type)}"
            ${type === selectedType ? 'selected' : ''}
        >
            ${escapeHtml(name)}
        </option>
    `).join('');
}


window.addEventListener('message', event => {
	const message = event.data;
	if (message.type !== 'setGraphSelection') return;

	currentGraphSelection = message.selection;
	availableAssets = Array.isArray(message.assets)
		? message.assets
		: [];

	renderGraphProperties();
});


window.addEventListener('message', event => {
	const message = event.data;

	if (message.type !== 'dataTypes') return;

	dataTypes = Array.isArray(message.types)
		? message.types
		: [];

	if (currentGraphSelection) {
		renderGraphProperties();
	}
});


function renderGraphProperties() {
	disposePreviews();
	currentActor = null;

	const selection = currentGraphSelection;

	if (!selection) {
		properties.innerHTML =
			'<div class="empty">Select a node, variable, or function</div>';
		return;
	}

	const value = selection.value;
	const rows = [];

	if (selection.type === 'variable') {
		rows.push(createInput(null, 'name', value.name, 'string'));

		rows.push(`
            <div class="property-row" data-graph-property="type"
                 data-type="string">
                <div class="property-label">Type</div>
                <select class="graph-type-select">
                    ${renderTypeOptions(value.type)}
                </select>
            </div>
        `);

		rows.push(createInput(
			null, 'value', value.value, { type: value.type }
		));
	}


	if (selection.type === 'node') {
		const node = value;

		const connectedPinIds = new Set(
			selection.connectedPinIds ?? []
		);

		for (const pin of node.pins ?? []) {
			const isMaterial = selection.assetType === 'material';

			if (
				(
					pin.direction !== 'input' &&
					!(isMaterial && pin.direction === 'output')
				) ||
				pin.type === 'execution' ||
				!Object.hasOwn(pin, 'value')
			) continue;

			if (connectedPinIds.has(pin.id)) {
				rows.push(`
                <div class="property-row">
                    <div class="property-label">
                        ${escapeHtml(pin.name)}
                    </div>
                    <div class="property-value">
                        Connected
                    </div>
                </div>
            `);
				continue;
			}

			const pinSchema = selection.pinSchemas?.[pin.id] ?? {};

			const html = createInput(
				null,
				pin.name,
				pin.value ?? null,
				{
					...pinSchema,
					type: pinSchema.type ?? pin.type,
					itemType: pin.itemType ?? pinSchema.itemType,
					assetType: pin.assetType ?? pinSchema.assetType
				}
			);

			if (!html) continue;

			rows.push(html.replace(
				'class="property-row"',
				`class="property-row" data-graph-pin-id="${escapeHtml(pin.id)}"`
			));
		}
	}

	if (
		selection.type === 'node' &&
		value.type === 'logic.switch'
	) {
		const cases = value.cases ?? [
			{ name: 'Case 1', value: null }
		];

		const type = value.valueType ?? 'any';

		rows.push(`
        <div class="switch-case-editor">
            <div class="section-title">
                Cases (${escapeHtml(type)})
            </div>

            ${cases.map((item, index) => `
                <div class="switch-case-row"
                     data-case-name="${escapeHtml(item.name)}">

                    <span>${escapeHtml(item.name)}</span>

                    <input
    class="switch-case-value"
    type="${type === 'number' ? 'number' :
				type === 'boolean' ? 'checkbox' :
					'text'
			}"
    ${type === 'boolean' && item.value === true ? 'checked' : ''}
    ${type !== 'boolean'
				? `value="${escapeHtml(item.value ?? '')}"`
				: ''}
    ${type === 'any' ? 'disabled' : ''}
>

                    <button
                        type="button"
                        class="switch-case-remove"
                        ${cases.length <= 1 ? 'disabled' : ''}
                    >×</button>
                </div>
            `).join('')}

            <button type="button" class="switch-case-add">
                + Add Case
            </button>
        </div>
    `);
	}



	if (selection.type === 'function') {
		rows.push(createInput(null, 'name', value.name, 'string'));

		rows.push(renderFunctionParameters(value.inputs ?? [], 'inputs'));
		rows.push(renderFunctionParameters(value.outputs ?? [], 'outputs'));
	}


	const heading = {
		node: 'Node Properties',
		variable: 'Variable Properties',
		function: 'Function Properties'
	}[selection.type] ?? 'Properties';

	properties.innerHTML = `
        <div class="actor-name">
            ${escapeHtml(selection.name)}
        </div>
        <div class="section">
            <div class="section-title">${heading}</div>
            ${rows.filter(Boolean).join('') ||
		'<div class="empty">No editable fields</div>'}
        </div>
    `;

	bindGraphPropertyInputs();
	bindFunctionParameterInputs();
	bindSwitchCaseInputs();
}


function bindSwitchCaseInputs() {
	const selection = currentGraphSelection;

	if (
		selection?.type !== 'node' ||
		selection.value?.type !== 'logic.switch'
	) return;

	const send = (operation, caseName = null, value = null) => {
		postPropertyUpdate(
			'node',
			selection.id,
			'switchCase',
			value,
			{
				functionId: selection.functionId ?? null,
				operation,
				caseName
			}
		);
	};

	const addButton = properties.querySelector('.switch-case-add');

	addButton?.addEventListener('click', () => {
		send('add');
	});

	for (const row of properties.querySelectorAll('.switch-case-row')) {
		const caseName = row.dataset.caseName;

		const removeButton = row.querySelector('.switch-case-remove');

		removeButton?.addEventListener('click', () => {
			send('remove', caseName);
		});

		const input = row.querySelector('.switch-case-value');

		input?.addEventListener('change', () => {
			const type = selection.value.valueType ?? 'any';

			let value;

			if (type === 'number') {
				if (input.value.trim() === '') return;

				value = Number(input.value);

				if (!Number.isFinite(value)) return;
			} else if (type === 'boolean') {
				value = input.checked;
			} else {
				value = input.value;
			}

			send('update', caseName, value);
		});
	}
}


function renderFunctionParameters(parameters, direction) {
	const title = direction === 'inputs' ? 'Inputs' : 'Outputs';

	return `
        <div class="function-parameters" data-direction="${direction}">
            <div class="section-title">
                ${title}
                <button type="button" class="parameter-add"
                    data-add-parameter="${direction}" title="Add ${title}">
                    +
                </button>
            </div>

            ${parameters.map(parameter => `
                <div class="property-row function-parameter"
                    data-parameter-id="${escapeHtml(parameter.id)}">

                    <input type="text" class="parameter-name"
                        value="${escapeHtml(parameter.name)}"
                        aria-label="Parameter name">

                    <select class="parameter-type"
                        aria-label="Parameter type">
                        ${renderTypeOptions(parameter.type)}
                    </select>

                    <button type="button" class="parameter-delete"
                        title="Remove parameter">×</button>
                </div>
            `).join('')}
        </div>
    `;
}

function bindFunctionParameterInputs() {
	const selection = currentGraphSelection;
	if (selection?.type !== 'function') return;

	const send = (operation, direction, parameterId = null, changes = {}) => {
		postPropertyUpdate(
			'functionParameter',
			selection.id,
			direction,
			{
				operation,
				parameterId,
				changes
			},
			{ functionId: selection.id }
		);
	};

	for (const group of properties.querySelectorAll('.function-parameters')) {
		const direction = group.dataset.direction;

		group.querySelector('.parameter-add')?.addEventListener('click', () => {
			send('add', direction);
		});

		for (const row of group.querySelectorAll('.function-parameter')) {
			const id = row.dataset.parameterId;

			row.querySelector('.parameter-name')
				.addEventListener('change', event => {
					send('update', direction, id, {
						name: event.target.value.trim()
					});
				});

			row.querySelector('.parameter-type')
				.addEventListener('change', event => {
					send('update', direction, id, {
						type: event.target.value
					});
				});

			row.querySelector('.parameter-delete')
				.addEventListener('click', () => {
					send('delete', direction, id);
				});
		}
	}
}



function bindGraphPropertyInputs() {
	const selection = currentGraphSelection;
	if (!selection) return;

	const rows = properties.querySelectorAll('.property-row');

	for (const row of rows) {
		const property = row.dataset.graphProperty ??
			row.dataset.property;

		if (!property) continue;

		const type = row.dataset.type;
		const pinId = row.dataset.graphPinId ?? null;

		const send = value => {
			postPropertyUpdate(
				selection.type,
				selection.id,
				pinId ? 'pinValue' : property,
				value,
				{
					functionId: selection.functionId ?? null,
					pinId
				}
			);
		};

		if (type === 'array' && pinId) {
			const container = row.querySelector('.asset-array');

			if (!container) continue;

			const itemType = container.dataset.itemType;

			const readValues = () => [
				...container.querySelectorAll('.asset-select')
			]
				.map(select => select.value || null)
				.filter(Boolean);

			container.addEventListener('change', event => {
				if (event.target.matches('.asset-select')) {
					send(readValues());
				}
			});

			container.addEventListener('click', event => {
				const removeButton = event.target.closest(
					'[data-remove-index]'
				);

				if (removeButton) {
					const values = readValues();

					values.splice(
						Number(removeButton.dataset.removeIndex),
						1
					);

					send(values);
					return;
				}

				if (event.target.closest('.asset-add')) {
					const firstAsset = availableAssets.find(
						asset => asset.type === itemType
					);

					if (!firstAsset) return;

					send([
						...readValues(),
						firstAsset.id
					]);
				}
			});

			continue;
		}


		const assetSelect = row.querySelector('.asset-select');

		if (assetSelect) {
			assetSelect.addEventListener('change', () => {
				// Pin values store asset UUIDs, not asset objects.
				send(assetSelect.value || null);
			});

			continue;
		}


		const typeSelect = row.querySelector('.graph-type-select');

		if (typeSelect) {
			typeSelect.addEventListener('change', () => {
				send(typeSelect.value);
			});
			continue;
		}

		const enumSelect = row.querySelector('.enum-select');

		if (enumSelect) {
			enumSelect.addEventListener('change', () => {
				send(enumSelect.value);
			});
			continue;
		}

		const inputs = [...row.querySelectorAll('input')];

		for (const input of inputs) {
			input.addEventListener('change', () => {
				let value;

				if (type === 'vector3') {
					value = inputs.map(field => Number(field.value));

					if (
						value.length !== 3 ||
						inputs.some(field => field.value.trim() === '') ||
						!value.every(Number.isFinite)
					) return;
				} else if (type === 'number') {
					if (input.value.trim() === '') return;

					value = Number(input.value);
					if (!Number.isFinite(value)) return;
				} else if (type === 'boolean') {
					value = input.checked;
				} else {
					value = input.value;
				}

				send(value);
			});
		}
	}
}



window.addEventListener('message', event => {
	const message = event.data;
	if (message.type !== 'setActor') return;

	const previousActorId = currentActor?.id;

	console.log('[IEProperties] Received actor:', message.actor?.name);



	currentActor = message.actor;
	assetMode = message.assetMode === true;
	actorSchema = message.schema ?? {};
	componentSchemas = message.componentSchemas ?? {};
	availableAssets = message.assets ?? [];
	resolvedAssets = message.resolvedAssets ?? {};

	if (previousActorId !== currentActor?.id) {
		resolvedAssets = {};
	}

	if (!currentActor) {
		selectedComponentId = null;
		componentSearch = '';
		disposePreviews();
		properties.innerHTML = '<div class="empty">No actor selected</div>';
		return;
	}

	if (previousActorId !== currentActor.id) {
		selectedComponentId = null;
		componentSearch = '';
	}

	if (
		selectedComponentId &&
		!currentActor.components?.some(
			component => component.id === selectedComponentId
		)
	) {
		selectedComponentId = null;
	}

	if (assetMode) {
		selectedComponentId = message.selectedComponentId ?? null;
	}

	renderActor();
});


window.addEventListener('message', event => {
	const message = event.data;

	if (message.type !== 'componentAssetsResolved') return;
	if (message.actorId !== currentActor?.id) return;
	if (message.componentId !== selectedComponentId) return;

	resolvedAssets = message.resolvedAssets ?? {};

	renderActor();
});


function renderActor() {
	if (!currentActor) return;

	disposePreviews();

	const actor = currentActor;
	const components = actor.components ?? [];

	const selectedComponent = components.find(
		component => component.id === selectedComponentId
	);


	properties.innerHTML = `
    <div class="actor-name">
        ${escapeHtml(
		assetMode && selectedComponent
			? selectedComponent.name ?? selectedComponent.type
			: actor.name ?? 'Actor'
	)}
    </div>

    ${!assetMode ? `
        <div class="section">
            <div class="section-title">
                Components (${components.length})
            </div>
            <input
                id="component-search"
                class="component-search"
                type="search"
                placeholder="Search components..."
                value="${escapeHtml(componentSearch)}"
            >
            <div id="component-list" class="component-list"></div>
        </div>
    ` : ''}

    ${(!assetMode || !selectedComponent) ? `
        <div class="section">
            <div class="section-title">Actor Properties</div>
            ${renderProperties(actor, actorSchema, false)}
        </div>
    ` : ''}

    ${selectedComponent ? `
        <div class="section">
            <div class="section-title">
                ${escapeHtml(formatName(
		selectedComponent.name ?? selectedComponent.type
	))}
            </div>
            ${renderProperties(
		selectedComponent,
		componentSchemas[selectedComponent.id] ?? {},
		true
	)}
        </div>
    ` : ''}
`;


	if (!assetMode) {
		bindComponentList(components);
	}

	bindPropertyInputs();

	if (selectedComponent?.type === 'mesh') {
		createGeometryPreview(selectedComponent);
		createMaterialPreview(selectedComponent);

		if (geometryRenderer || materialRenderer) {
			startPreviewLoop();
		}
	}
}

function renderProperties(object, schema, isComponent) {
	console.log("renderProperties: ", object, schema)

	const inputs = Object.entries(schema)
		.filter(([name, definition]) => {
			if (name === 'id' || name === 'type') return false;
			if (definition?.exposed === false) return false;
			return Object.prototype.hasOwnProperty.call(object, name);
		})
		.map(([name, definition]) => {
			return createInput(
				isComponent ? object : null,
				name,
				object[name],
				definition
			);
		})
		.filter(Boolean)
		.join('');

	return inputs || '<div class="empty">No editable properties</div>';
}

function bindComponentList(components) {
	const search = document.getElementById('component-search');
	const list = document.getElementById('component-list');

	if (!search || !list) return;

	const updateList = () => {
		const query = componentSearch.trim().toLowerCase();

		const filtered = components.filter(component => {
			const name = String(
				component.name ?? component.type ?? ''
			).toLowerCase();

			const type = String(component.type ?? '').toLowerCase();

			return name.includes(query) || type.includes(query);
		});

		list.replaceChildren();

		if (!filtered.length) {
			const empty = document.createElement('div');
			empty.className = 'empty';
			empty.textContent = 'No matching components';
			list.appendChild(empty);
			return;
		}

		const fragment = document.createDocumentFragment();

		for (const component of filtered) {
			const item = document.createElement('button');

			item.type = 'button';
			item.className = 'component-item';

			item.classList.toggle(
				'selected',
				component.id === selectedComponentId
			);

			item.textContent = formatName(
				component.name ?? component.type
			);

			item.title = `${component.type} — ${component.id}`;

			item.addEventListener('click', () => {
				selectedComponentId =
					selectedComponentId === component.id
						? null
						: component.id;

				renderActor();
				if (assetMode) {
					postOutlineUpdate('selectAssetComponent', {
						componentId: selectedComponentId
					});
				}
				if (selectedComponentId) {
					const selected = currentActor.components.find(
						component => component.id === selectedComponentId
					);

					if (selected?.type === 'mesh') {
						postAssetsUpdate('resolveComponentAssets', {
							actorId: currentActor.id,
							componentId: selected.id
						});
					}
				}
			});

			fragment.appendChild(item);
		}

		list.appendChild(fragment);
	};

	search.addEventListener('input', () => {
		componentSearch = search.value;
		updateList();
	});

	updateList();
}

function createInput(component, name, value, schema) {
	const type = typeof schema === 'string'
		? schema
		: schema?.type;

	const isArray = schema?.isArray === true;

	let input;

	if (isArray) {
		input = createTypedArray(
			Array.isArray(value) ? value : [],
			type,
			schema
		);
	} else {
		switch (type) {
			case 'color':
				input = `
                    <input type="color"
                        value="${escapeHtml(value ?? '#ffffff')}">
                `;
				break;

			case 'number':
				input = `
                    <input type="number"
                        step="any"
                        value="${escapeHtml(value ?? 0)}">
                `;
				break;

			case 'boolean':
				input = `
                    <input type="checkbox"
                        ${value === true ? 'checked' : ''}>
                `;
				break;

			case 'string':
				input = `
                    <input type="text"
                        value="${escapeHtml(value ?? '')}">
                `;
				break;

			case 'enum': {
				const selectedValue =
					String(value ?? '').toLowerCase();

				input = `
                    <select class="enum-select">
                        ${(schema?.options ?? []).map(option => `
                            <option
                                value="${escapeHtml(option)}"
                                ${String(option).toLowerCase() === selectedValue
						? 'selected'
						: ''}>
                                ${escapeHtml(formatName(option))}
                            </option>
                        `).join('')}
                    </select>
                `;
				break;
			}

			case 'vector3': {
				const values = Array.isArray(value)
					? value
					: [0, 0, 0];

				input = `
                    <div class="vector">
                        ${[0, 1, 2].map(axis => `
                            <input
                                type="number"
                                step="any"
                                value="${escapeHtml(values[axis] ?? 0)}"
                                data-axis="${axis}"
                                class="number-input-${['x', 'y', 'z'][axis]}">
                        `).join('')}
                    </div>
                `;
				break;
			}

			case 'asset': {
				const assetType = schema?.assetType;

				input = assetType
					? createAssetSelect(value, assetType)
					: '<span>Asset type not specified</span>';
				break;
			}

			case 'geometry':
				input = createAssetSelect(
					value, 'geometry', 'geometry-preview'
				);
				break;

			case 'material':
				input = createAssetSelect(
					value, 'material', 'material-preview'
				);
				break;

			case 'actor':
			case 'mesh':
			case 'script':
			case 'texture':
				input = createAssetSelect(value, type);
				break;

			// Compatibility with existing graph nodes.
			case 'array': {
				const itemType = schema?.itemType === 'asset'
					? schema.assetType
					: schema?.itemType;

				input = createAssetArray(
					Array.isArray(value) ? value : [],
					itemType
				);
				break;
			}

			default:
				return '';
		}
	}

	return `
        <div
            class="property-row"
            data-target="${component ? 'component' : 'actor'}"
            ${component
			? `data-component-id="${escapeHtml(component.id)}"`
			: ''}
            data-property="${escapeHtml(name)}"
            data-type="${escapeHtml(type)}"
            data-is-array="${isArray}">

            <div class="property-label">
                ${escapeHtml(formatName(name))}
            </div>

            ${input}
        </div>
    `;
}

function createTypedArray(values, type, schema = {}) {
	const assetTypes = [
		'geometry',
		'material',
		'texture',
		'actor',
		'mesh',
		'script'
	];

	const itemType = type === 'asset'
		? schema.assetType
		: type;

	function createItemControl(value) {
		if (assetTypes.includes(itemType)) {
			return createAssetSelect(value, itemType);
		}

		switch (itemType) {
			case 'number':
				return `
                    <input type="number"
                        step="any"
                        value="${escapeHtml(value ?? 0)}">
                `;

			case 'string':
				return `
                    <input type="text"
                        value="${escapeHtml(value ?? '')}">
                `;

			case 'boolean':
				return `
                    <input type="checkbox"
                        ${value === true ? 'checked' : ''}>
                `;

			case 'color':
				return `
                    <input type="color"
                        value="${escapeHtml(value ?? '#ffffff')}">
                `;

			case 'enum':
				return `
                    <select class="enum-select">
                        ${(schema.options ?? []).map(option => `
                            <option
                                value="${escapeHtml(option)}"
                                ${option === value ? 'selected' : ''}>
                                ${escapeHtml(formatName(option))}
                            </option>
                        `).join('')}
                    </select>
                `;

			case 'vector3': {
				const vector = Array.isArray(value)
					? value
					: [0, 0, 0];

				return `
                    <div class="vector">
                        ${vector.map((number, axis) => `
                            <input
                                type="number"
                                step="any"
                                data-axis="${axis}"
                                value="${escapeHtml(number)}">
                        `).join('')}
                    </div>
                `;
			}

			default:
				return `
                    <span class="empty">
                        Unsupported element type:
                        ${escapeHtml(itemType)}
                    </span>
                `;
		}
	}

	return `
        <div class="typed-array"
            data-item-type="${escapeHtml(itemType)}">

            ${values.map((value, index) => `
                <div class="typed-array-item"
                    data-array-index="${index}">

                    ${createItemControl(value)}

                    <button
                        type="button"
                        class="asset-remove"
                        data-remove-index="${index}"
                        title="Remove">
                        ×
                    </button>
                </div>
            `).join('')}

            <button
                type="button"
                class="asset-add"
                data-array-action="add">
                + Add ${escapeHtml(formatName(itemType))}
            </button>
        </div>
    `;
}

function getDefaultArrayValue(type, schema = {}) {
	switch (type) {
		case 'number':
			return 0;

		case 'boolean':
			return false;

		case 'string':
			return '';

		case 'color':
			return '#ffffff';

		case 'vector3':
			return [0, 0, 0];

		case 'enum':
			return schema.options?.[0] ?? '';

		case 'geometry':
		case 'material':
		case 'texture':
		case 'actor':
		case 'mesh':
		case 'script':
			return null;

		default:
			return null;
	}
}

function readTypedArray(container) {
	const type = container.dataset.itemType;

	return [...container.querySelectorAll('.typed-array-item')]
		.map(item => {
			if ([
				'geometry',
				'material',
				'texture',
				'actor',
				'mesh',
				'script'
			].includes(type)) {
				const select = item.querySelector('.asset-select');

				if (!select?.value) return null;

				return {
					type,
					id: select.value
				};
			}

			if (type === 'vector3') {
				const inputs = [
					...item.querySelectorAll('input[type="number"]')
				];

				if (
					inputs.length !== 3 ||
					inputs.some(input => input.value.trim() === '')
				) {
					return undefined;
				}

				const values = inputs.map(input => Number(input.value));

				return values.every(Number.isFinite)
					? values
					: undefined;
			}

			const input = item.querySelector('input, select');

			if (!input) return undefined;

			switch (type) {
				case 'number': {
					if (input.value.trim() === '') return undefined;

					const number = Number(input.value);

					return Number.isFinite(number)
						? number
						: undefined;
				}

				case 'boolean':
					return input.checked;

				default:
					return input.value;
			}
		});
}


function createAssetSelect(value, type, previewId = null) {
	const assets = availableAssets.filter(asset => asset.type === type);
	const selectedId = typeof value === 'string'
		? value
		: value?.id ?? '';
	const selectedAsset = assets.find(asset => asset.id === selectedId);
	const name = selectedAsset?.name ?? (selectedId ? 'Unknown Asset' : 'None');

	return `
        <div class="asset-picker">
            <div class="asset-picker-preview">
                ${previewId ? `<div id="${previewId}" class="asset-preview-canvas"></div>` : ''}
                ${!previewId ? `<span class="asset-picker-icon">${type === 'geometry' ? '◇' : '◉'}</span>` : ''}
            </div>
            <div class="asset-picker-info">
                <span class="asset-picker-name">${escapeHtml(name)}</span>
                <span class="asset-picker-hint">Select ${escapeHtml(type)}</span>
            </div>
            <span class="asset-picker-arrow">⌄</span>
            <select class="asset-select" data-asset-type="${escapeHtml(type)}" aria-label="Select ${escapeHtml(type)}">
                <option value="">None</option>
                ${assets.map(asset => `
                    <option value="${escapeHtml(asset.id)}" ${asset.id === selectedId ? 'selected' : ''}>
                        ${escapeHtml(asset.name)}
                    </option>
                `).join('')}
            </select>
        </div>
    `;
}



function createAssetArray(values, itemType) {
	if (!itemType) return '<div class="empty">Unsupported array type</div>';

	return `
        <div class="asset-array" data-item-type="${escapeHtml(itemType)}">
            ${values.map((value, index) => `
                <div class="asset-array-item">
                    ${createAssetSelect(
		value,
		itemType,
		itemType === 'material' && index === 0
			? 'material-preview'
			: null
	)}
                    <button type="button" class="asset-remove" data-remove-index="${index}" title="Remove">×</button>
                </div>
            `).join('')}
            <button type="button" class="asset-add">+ Add ${escapeHtml(formatName(itemType))}</button>
        </div>
    `;
}


function bindPropertyInputs() {
	const rows = properties.querySelectorAll(
		'.property-row[data-target][data-property]'
	);


	for (const row of rows) {
		const type = row.dataset.type;
		const property = row.dataset.property;
		const target = row.dataset.target;
		const id = target === 'actor'
			? currentActor?.id
			: row.dataset.componentId;


		const sendUpdate = postPropertyUpdate;

		const isArray = row.dataset.isArray === 'true';

		if (isArray) {
			const container = row.querySelector('.typed-array');

			if (!container) continue;

			const itemType = container.dataset.itemType;

			const sendArray = values => {
				if (values.some(value => value === undefined)) {
					return;
				}

				sendUpdate(
					target,
					id,
					property,
					values
				);
			};

			container.addEventListener('change', event => {
				if (
					event.target.matches('input') ||
					event.target.matches('select')
				) {
					sendArray(readTypedArray(container));
				}
			});

			container.addEventListener('click', event => {
				const removeButton = event.target.closest(
					'[data-remove-index]'
				);

				if (removeButton) {
					const values = readTypedArray(container);

					if (values.some(value => value === undefined)) return;

					const index = Number(
						removeButton.dataset.removeIndex
					);

					if (
						!Number.isInteger(index) ||
						index < 0 ||
						index >= values.length
					) return;

					values.splice(index, 1);

					sendArray(values);
					return;
				}

				const addButton = event.target.closest(
					'[data-array-action="add"]'
				);

				if (addButton) {
					const values = readTypedArray(container);

					if (values.some(value => value === undefined)) return;

					const schema = target === 'component'
						? componentSchemas[id]?.[property] ?? {}
						: actorSchema[property] ?? {};

					const newValue = getDefaultArrayValue(
						itemType,
						schema
					);

					sendArray([
						...values,
						newValue
					]);
				}
			});

			continue;
		}


		if (type === 'array') {
			const container = row.querySelector('.asset-array');

			if (!container) continue;

			const itemType = container.dataset.itemType;

			const readValues = () => {
				return [
					...container.querySelectorAll('.asset-select')
				]
					.map(select => select.value
						? { type: itemType, id: select.value }
						: null
					)
					.filter(Boolean);
			};

			container.addEventListener('change', event => {
				if (event.target.matches('.asset-select')) {
					sendUpdate(target, id, property, readValues());
				}
			});

			container.addEventListener('click', event => {
				const remove = event.target.closest(
					'[data-remove-index]'
				);

				if (remove) {
					const values = readValues();

					values.splice(
						Number(remove.dataset.removeIndex),
						1
					);

					sendUpdate(target, id, property, values);
					return;
				}

				if (event.target.closest('.asset-add')) {
					const firstAsset = availableAssets.find(
						asset => asset.type === itemType
					);

					if (!firstAsset) return;

					sendUpdate(target, id, property, [
						...readValues(),
						{
							type: itemType,
							id: firstAsset.id
						}
					]);
				}
			});

			continue;
		}

		if (type === 'asset') {
			const select = row.querySelector('.asset-select');

			if (!select) continue;

			select.addEventListener('change', () => {
				const assetType = select.dataset.assetType;

				sendUpdate(
					target,
					id,
					property,
					select.value
						? { type: assetType, id: select.value }
						: null
				);
			});

			continue;
		}


		if ([
			'geometry',
			'material',
			'script',
			'actor',
			'mesh',
			'texture'
		].includes(type)) {
			const select = row.querySelector('.asset-select');

			if (!select) continue;

			select.addEventListener('change', () => {
				sendUpdate(target, id, property, select.value
					? { type, id: select.value }
					: null
				);
			});

			continue;
		}

		if (type === 'enum') {
			const select = row.querySelector('.enum-select');
			if (!select) continue;

			select.addEventListener('change', () => {
				sendUpdate(target, id, property, select.value);
			});

			continue;
		}

		const inputs = [...row.querySelectorAll('input')];

		for (const input of inputs) {
			input.addEventListener('change', () => {
				let value;


				if (type === 'vector3') {
					if (input.value.trim() === '') return;

					const axis = Number(input.dataset.axis);
					const numericValue = Number(input.value);

					if (
						!Number.isInteger(axis) ||
						axis < 0 ||
						axis > 2 ||
						!Number.isFinite(numericValue)
					) return;

					if (['position', 'rotation', 'scale'].includes(property)) {
						sendUpdate(target, id, property, { axis, value: numericValue });
						return;
					}

					value = inputs.map(field => Number(field.value));

					if (
						inputs.some(field => field.value.trim() === '') ||
						!value.every(Number.isFinite)
					) return;
				} else if (type === 'number') {
					if (input.value.trim() === '') return;

					value = Number(input.value);

					if (!Number.isFinite(value)) return;
				}
				else if (type === 'boolean') {
					value = input.checked;
				}
				else {
					value = input.value;
				}

				sendUpdate(target, id, property, value);
			});
		}
	}
}

function createGeometryPreview(mesh) {
	geometryPreviewContainer = document.getElementById(
		'geometry-preview'
	);

	if (!geometryPreviewContainer) return;

	const geometry = createPreviewGeometry(mesh);

	if (!geometry.getAttribute('position')) {
		geometry.dispose();
		geometryPreviewContainer.style.display = 'none';
		return;
	}

	geometryRenderer = new THREE.WebGLRenderer({
		antialias: true,
		alpha: true
	});

	geometryRenderer.setPixelRatio(
		Math.min(window.devicePixelRatio, 2)
	);

	geometryRenderer.setClearColor(0x000000, 0);

	geometryPreviewContainer.appendChild(
		geometryRenderer.domElement
	);

	geometryScene = new THREE.Scene();

	geometryCamera = new THREE.PerspectiveCamera(
		35, 1, 0.1, 100
	);

	geometryCamera.position.set(2.4, 1.8, 3);
	geometryCamera.lookAt(0, 0, 0);

	geometryPreviewMesh = new THREE.Mesh(
		geometry,
		new THREE.MeshStandardMaterial({
			color: 0xb8b8b8,
			roughness: 0.7,
			metalness: 0.05,
			side: THREE.DoubleSide
		})
	);

	centerPreviewObject(geometryPreviewMesh);
	geometryScene.add(geometryPreviewMesh);

	addPreviewLighting(geometryScene);

	resizePreviewRenderer(
		geometryRenderer,
		geometryPreviewContainer,
		geometryCamera
	);
}

function createMaterialPreview(mesh) {
	materialPreviewContainer = document.getElementById(
		'material-preview'
	);

	if (!materialPreviewContainer) return;

	materialRenderer = new THREE.WebGLRenderer({
		antialias: true,
		alpha: true
	});

	materialRenderer.setPixelRatio(
		Math.min(window.devicePixelRatio, 2)
	);

	materialRenderer.setClearColor(0x000000, 0);

	materialPreviewContainer.appendChild(
		materialRenderer.domElement
	);

	materialScene = new THREE.Scene();

	materialCamera = new THREE.PerspectiveCamera(
		30, 1, 0.1, 100
	);

	materialCamera.position.set(0, 0, 4);
	materialCamera.lookAt(0, 0, 0);

	materialPreviewMesh = new THREE.Mesh(
		new THREE.SphereGeometry(0.8, 48, 32),
		createPreviewMaterial(mesh)
	);

	materialScene.add(materialPreviewMesh);

	addPreviewLighting(materialScene);

	resizePreviewRenderer(
		materialRenderer,
		materialPreviewContainer,
		materialCamera
	);
}

function createPreviewGeometry(mesh) {
	const asset = resolvedAssets[mesh.geometry?.id];
	const data = asset?.data;

	if (!data) return new THREE.BufferGeometry();

	if (data.type === 'buffer' || data.positions) {
		const geometry = new THREE.BufferGeometry();

		if (data.positions?.length) {
			geometry.setAttribute(
				'position',
				new THREE.Float32BufferAttribute(
					data.positions,
					3
				)
			);
		}

		if (data.normals?.length) {
			geometry.setAttribute(
				'normal',
				new THREE.Float32BufferAttribute(
					data.normals,
					3
				)
			);
		}

		if (data.uvs?.length) {
			geometry.setAttribute(
				'uv',
				new THREE.Float32BufferAttribute(
					data.uvs,
					2
				)
			);
		}

		if (data.indices?.length) {
			geometry.setIndex(data.indices);
		}

		if (
			geometry.getAttribute('position') &&
			!geometry.getAttribute('normal')
		) {
			geometry.computeVertexNormals();
		}

		if (geometry.getAttribute('position')) {
			geometry.computeBoundingSphere();
		}

		return geometry;
	}

	return new THREE.BufferGeometry();
}


function createPreviewMaterial(mesh) {
	const reference = mesh.materials?.[0];
	const asset = resolvedAssets[reference?.id];
	const data = asset?.data ?? {};

	const options = {
		color: data.color ?? '#ffffff',
		wireframe: data.wireframe ?? false
	};

	let material;

	switch (data.type) {
		case 'basic':
			material = new THREE.MeshBasicMaterial(options);
			break;

		case 'phong':
			material = new THREE.MeshPhongMaterial({
				...options,
				shininess: data.shininess ?? 30
			});
			break;

		default:
			material = new THREE.MeshStandardMaterial({
				...options,
				metalness: data.metalness ?? 0,
				roughness: data.roughness ?? 1
			});
			break;
	}

	if (data.map?.id) {
		createPreviewTexture(data.map).then(texture => {
			if (!texture) return;

			if (materialPreviewMesh?.material !== material) {
				texture.dispose();
				return;
			}

			material.map = texture;
			material.needsUpdate = true;
		});
	}

	return material;
}



const previewTextureLoader = new THREE.TextureLoader();

function createPreviewTexture(reference) {
	if (!reference?.id) return Promise.resolve(null);

	const asset = resolvedAssets[reference.id];
	const image = asset?.data?.image;

	if (typeof image !== 'string' || !image.startsWith('data:image/')) {
		console.warn('Texture image unavailable:', reference.id);
		return Promise.resolve(null);
	}

	return new Promise(resolve => {
		previewTextureLoader.load(
			image,
			texture => {
				texture.colorSpace = THREE.SRGBColorSpace;
				texture.flipY = false;
				texture.needsUpdate = true;
				resolve(texture);
			},
			undefined,
			error => {
				console.error('Failed to load preview texture:', error);
				resolve(null);
			}
		);
	});
}




function addPreviewLighting(scene) {
	scene.add(new THREE.HemisphereLight(
		0xffffff,
		0x333333,
		1.5
	));

	const key = new THREE.DirectionalLight(
		0xffffff,
		3
	);

	key.position.set(3, 4, 5);
	scene.add(key);

	const fill = new THREE.DirectionalLight(
		0xffffff,
		1.5
	);

	fill.position.set(-3, 1, 3);
	scene.add(fill);

	const rim = new THREE.DirectionalLight(
		0xffffff,
		1
	);

	rim.position.set(0, 2, -4);
	scene.add(rim);
}

function centerPreviewObject(object) {
	const box = new THREE.Box3().setFromObject(object);

	if (box.isEmpty()) return;

	const center = box.getCenter(new THREE.Vector3());
	const size = box.getSize(new THREE.Vector3());

	const maxDimension = Math.max(
		size.x,
		size.y,
		size.z
	);

	if (maxDimension <= 0) return;

	const scale = 1.25 / maxDimension;

	object.scale.setScalar(scale);
	object.position.copy(center).multiplyScalar(-scale);
}

function startPreviewLoop() {
	if (previewAnimationFrame !== undefined) {
		cancelAnimationFrame(previewAnimationFrame);
	}

	const render = () => {
		previewAnimationFrame = requestAnimationFrame(render);

		if (materialPreviewMesh) {
			materialPreviewMesh.rotation.y += 0.004;
		}

		if (
			geometryRenderer &&
			geometryScene &&
			geometryCamera
		) {
			geometryRenderer.render(
				geometryScene,
				geometryCamera
			);
		}

		if (
			materialRenderer &&
			materialScene &&
			materialCamera
		) {
			materialRenderer.render(
				materialScene,
				materialCamera
			);
		}
	};

	render();
}

function resizePreviewRenderer(renderer, container, camera) {
	const width = container.clientWidth;
	const height = container.clientHeight;

	if (width <= 0 || height <= 0) return;

	renderer.setSize(width, height, false);

	camera.aspect = width / height;
	camera.updateProjectionMatrix();
}

function resizeExistingPreviews() {
	if (
		geometryRenderer &&
		geometryPreviewContainer &&
		geometryCamera
	) {
		resizePreviewRenderer(
			geometryRenderer,
			geometryPreviewContainer,
			geometryCamera
		);
	}

	if (
		materialRenderer &&
		materialPreviewContainer &&
		materialCamera
	) {
		resizePreviewRenderer(
			materialRenderer,
			materialPreviewContainer,
			materialCamera
		);
	}
}

window.addEventListener('resize', resizeExistingPreviews);

function disposePreviews() {
	if (previewAnimationFrame !== undefined) {
		cancelAnimationFrame(previewAnimationFrame);
		previewAnimationFrame = undefined;
	}

	if (geometryPreviewMesh) {
		geometryPreviewMesh.geometry.dispose();
		disposeMaterial(geometryPreviewMesh.material);
		geometryPreviewMesh = undefined;
	}

	if (materialPreviewMesh) {
		materialPreviewMesh.geometry.dispose();
		disposeMaterial(materialPreviewMesh.material);
		materialPreviewMesh = undefined;
	}

	if (geometryRenderer) {
		geometryRenderer.dispose();
		geometryRenderer.domElement.remove();
		geometryRenderer = undefined;
	}

	if (materialRenderer) {
		materialRenderer.dispose();
		materialRenderer.domElement.remove();
		materialRenderer = undefined;
	}

	geometryScene = undefined;
	materialScene = undefined;
	geometryCamera = undefined;
	materialCamera = undefined;
	geometryPreviewContainer = undefined;
	materialPreviewContainer = undefined;
}


function disposeMaterial(material) {
	if (Array.isArray(material)) {
		for (const item of material) {
			disposeMaterial(item);
		}
		return;
	}

	if (!material) return;

	for (const property of [
		'map',
		'normalMap',
		'roughnessMap',
		'metalnessMap',
		'emissiveMap',
		'aoMap',
		'alphaMap'
	]) {
		material[property]?.dispose();
	}

	material.dispose();
}


function formatName(value) {
	if (!value) return '';

	return String(value)
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[-_]/g, ' ')
		.replace(/^./, char => char.toUpperCase());
}

function escapeHtml(value) {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

postAssetsUpdate('webviewReady');
