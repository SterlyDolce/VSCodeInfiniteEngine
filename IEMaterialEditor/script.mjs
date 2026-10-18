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
    const container = $('graph-container');
    const status = $('status');

    const NODE_WIDTH = 240;
    const HEADER_HEIGHT = 34;
    const PIN_HEIGHT = 27;
    const NODE_PADDING = 12;

    let definitions = new Map();

    let asset = null;
    let nodes = [];
    let links = [];
    let selectedNodeId = null;
    let selectedLinkId = null;
    let menuPosition = null;
    let draggingNode = null;
    let draggingCanvas = false;
    let connectingPin = null;

    let mouse = { x: 0, y: 0 };
    let lastMouse = { x: 0, y: 0 };
    let pan = { x: 60, y: 60 };
    let zoom = 1;

    let revision = 0;
    let savedRevision = 0;
    let saveTimer = null;
    let saving = false;
    let saveAgain = false;
    let compileRequested = false;
    let compiled = false;

    const uuid = () => crypto.randomUUID();
    const clone = value => structuredClone(value);
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    const setStatus = message => {
        status.textContent = message;
        status.dataset.state =
            /^Error|failed/i.test(message) ? 'error' :
                /Uncompiled|Not compiled/i.test(message) ? 'dirty' :
                    /compiled successfully/i.test(message) ? 'success' : '';
    };

    const cssColor = (name, fallback) =>
        getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-' + name)
            .trim() || fallback;

    function theme() {
        return {
            background: cssColor('editor-background', '#1e1e1e'),
            text: cssColor('editor-foreground', '#cccccc'),
            node: cssColor('editorWidget-background', '#252526'),
            header: cssColor('sideBar-background', '#181818'),
            border: cssColor('panel-border', '#454545'),
            selection: cssColor('focusBorder', '#007fd4'),
            muted: cssColor('descriptionForeground', '#888888')
        };
    }

    function nodeHeight(node) {
        const inputs = node.pins?.filter(
            p => p.direction === 'input'
        ).length ?? 0;

        const outputs = node.pins?.filter(
            p => p.direction === 'output'
        ).length ?? 0;

        return HEADER_HEIGHT +
            Math.max(inputs, outputs, 1) * PIN_HEIGHT +
            NODE_PADDING;
    }

    function nodeTitle(node) {
        if (node.type === 'material.output') return 'Material Output';
        if (node.type === 'material.value') return node.name || 'Value';
        return node.name || node.type;
    }

    function getNode(id) {
        return nodes.find(node => node.id === id);
    }

    function getPin(id) {
        for (const node of nodes) {
            const pin = node.pins?.find(pin => pin.id === id);
            if (pin) return { node, pin };
        }
        return null;
    }

    function screenToWorld(x, y) {
        return {
            x: (x - pan.x) / zoom,
            y: (y - pan.y) / zoom
        };
    }

    function getPointer(event) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    function pinPosition(node, pin) {
        const direction = pin.direction;
        const pins = node.pins.filter(p => p.direction === direction);
        const index = pins.indexOf(pin);

        return {
            x: node.position[0] +
                (direction === 'input' ? 0 : NODE_WIDTH),
            y: node.position[1] +
                HEADER_HEIGHT +
                PIN_HEIGHT * (index + 0.5)
        };
    }

    function findPin(point) {
        for (const node of [...nodes].reverse()) {
            for (const pin of node.pins ?? []) {
                const p = pinPosition(node, pin);

                if (
                    Math.hypot(
                        point.x - p.x,
                        point.y - p.y
                    ) < 11 / zoom
                ) {
                    return { node, pin };
                }
            }
        }
        return null;
    }

    function findNode(point) {
        for (const node of [...nodes].reverse()) {
            const [x, y] = node.position;

            if (
                point.x >= x &&
                point.x <= x + NODE_WIDTH &&
                point.y >= y &&
                point.y <= y + nodeHeight(node)
            ) {
                return node;
            }
        }
        return null;
    }

    function drawRoundedRect(x, y, w, h, radius) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, radius);
    }

    function drawGrid(width, height) {
        const step = 25 * zoom;
        if (step < 6) return;

        const offsetX = ((pan.x % step) + step) % step;
        const offsetY = ((pan.y % step) + step) % step;

        ctx.fillStyle = cssColor(
            'editorIndentGuide-background1',
            '#3a3a3a'
        );
        ctx.globalAlpha = 0.4;

        for (let x = offsetX; x < width; x += step) {
            for (let y = offsetY; y < height; y += step) {
                ctx.beginPath();
                ctx.arc(x, y, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1;
    }

    function pinColor(pin) {
        switch (pin.type) {
            case 'number': return '#a9d7a0';
            case 'boolean': return '#d88080';
            case 'color': return '#e7cb75';
            case 'asset': return '#75bde7';
            case 'vector2': return '#c69ee9';
            default: return '#bcbcbc';
        }
    }

    function formatValue(value) {
        if (value === null || value === undefined) return 'None';

        if (typeof value === 'object') {
            if (value.type === 'texture') {
                return 'Texture: ' + value.id.slice(0, 8);
            }
            return JSON.stringify(value);
        }

        return String(value);
    }

    function drawNode(node, colors) {
        const [x, y] = node.position;
        const height = nodeHeight(node);

        ctx.fillStyle = colors.node;
        ctx.strokeStyle =
            selectedNodeId === node.id
                ? colors.selection
                : colors.border;

        ctx.lineWidth = selectedNodeId === node.id ? 2.5 : 1;

        drawRoundedRect(x, y, NODE_WIDTH, height, 7);
        ctx.fill();
        ctx.stroke();

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(
            x, y, NODE_WIDTH, HEADER_HEIGHT, [7, 7, 0, 0]
        );
        ctx.clip();

        ctx.fillStyle =
            node.type === 'material.output'
                ? '#af7541'
                : '#467b9b';

        ctx.fillRect(x, y, NODE_WIDTH, HEADER_HEIGHT);
        ctx.restore();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(nodeTitle(node), x + 12, y + 22);

        ctx.font = '11px sans-serif';

        for (const pin of node.pins ?? []) {
            const position = pinPosition(node, pin);
            const input = pin.direction === 'input';

            ctx.fillStyle = pinColor(pin);
            ctx.beginPath();
            ctx.arc(
                position.x,
                position.y,
                5.5,
                0,
                Math.PI * 2
            );
            ctx.fill();

            ctx.fillStyle = colors.text;
            ctx.textAlign = input ? 'left' : 'right';

            ctx.fillText(
                pin.name,
                position.x + (input ? 13 : -13),
                position.y + 4
            );

            const linked = links.some(link => link.to === pin.id);

            const showValue =
                (!input || !linked) &&
                pin.value !== undefined;

            if (showValue) {
                const text = formatValue(pin.value);

                ctx.fillStyle = colors.muted;
                ctx.font = '10px sans-serif';
                ctx.textAlign = input ? 'right' : 'left';

                const available = NODE_WIDTH * 0.43;
                let display = text;

                while (
                    display.length > 3 &&
                    ctx.measureText(display).width > available
                ) {
                    display = display.slice(0, -2) + '…';
                }

                ctx.fillText(
                    display,
                    input ? x + NODE_WIDTH - 10 : x + 10,
                    position.y + 4
                );

                ctx.font = '11px sans-serif';
            }
        }
    }

    function drawWire(a, b, color) {
        const distance = Math.max(
            45,
            Math.abs(b.x - a.x) * 0.55
        );

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.bezierCurveTo(
            a.x + distance,
            a.y,
            b.x - distance,
            b.y,
            b.x,
            b.y
        );

        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }

    function drawLinks() {
        for (const link of links) {
            const from = getPin(link.from);
            const to = getPin(link.to);
            if (!from || !to) continue;

            drawWire(
                pinPosition(from.node, from.pin),
                pinPosition(to.node, to.pin),
                selectedLinkId === link.id
                    ? theme().selection
                    : pinColor(from.pin)
            );
        }

        if (connectingPin) {
            const from = pinPosition(
                connectingPin.node,
                connectingPin.pin
            );
            const pointer = screenToWorld(mouse.x, mouse.y);

            if (connectingPin.pin.direction === 'output') {
                drawWire(from, pointer, pinColor(connectingPin.pin));
            } else {
                drawWire(pointer, from, pinColor(connectingPin.pin));
            }
        }
    }

    function draw() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const dpr = window.devicePixelRatio || 1;

        if (
            canvas.width !== Math.round(width * dpr) ||
            canvas.height !== Math.round(height * dpr)
        ) {
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const colors = theme();
        ctx.fillStyle = colors.background;
        ctx.fillRect(0, 0, width, height);

        drawGrid(width, height);

        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.scale(zoom, zoom);

        drawLinks();

        for (const node of nodes) {
            drawNode(node, colors);
        }

        ctx.restore();
        requestAnimationFrame(draw);
    }

    // =========================================
    // Graph saving and compilation
    // =========================================

    function graphChanged() {
        revision++;
        compiled = false;

        setStatus('Uncompiled changes');

        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveGraph, 180);
    }

    function saveGraph() {
        clearTimeout(saveTimer);

        if (!asset || saving) {
            if (saving) saveAgain = true;
            return;
        }

        if (savedRevision === revision) {
            if (compileRequested) {
                compileRequested = false;
                postGraphUpdate('compile');
            }
            return;
        }

        saving = true;

        postGraphUpdate('saveGraph', {
            revision,
            nodes: clone(nodes),
            links: clone(links)
        });
    }

    function requestCompile() {
        if (!asset) return;

        compileRequested = true;
        saveGraph();
    }

    function handleGraphSaved(message) {
        saving = false;

        if (typeof message.revision === 'number') {
            savedRevision = Math.max(
                savedRevision,
                message.revision
            );
        }

        if (saveAgain || savedRevision < revision) {
            saveAgain = false;
            saveGraph();
            return;
        }

        setStatus(
            compiled
                ? 'Material compiled'
                : 'Graph saved · Not compiled'
        );

        if (compileRequested) {
            compileRequested = false;
            postGraphUpdate('compile');
        }
    }

    // =========================================
    // Node creation and editing
    // =========================================


    function createNode(type, position) {
        const definition = definitions.get(type);

        if (!definition) {
            setStatus(`Unknown Material Node: ${type}`);
            return;
        }

        if (
            definition.unique &&
            nodes.some(node => node.type === type)
        ) {
            setStatus(`${definition.name} already exists`);
            return;
        }

        const createPin = (pin, direction) => ({
            id: uuid(),
            name: pin.name,
            type: pin.type,
            direction,

            ...(Object.hasOwn(pin, 'default')
                ? { value: clone(pin.default) }
                : {}),

            ...(pin.assetType
                ? { assetType: pin.assetType }
                : {})
        });

        const node = {
            id: uuid(),
            type,
            name: definition.name,
            position: [position.x, position.y],
            pins: [
                ...definition.inputs.map(pin =>
                    createPin(pin, 'input')
                ),
                ...definition.outputs.map(pin =>
                    createPin(pin, 'output')
                )
            ]
        };

        nodes.push(node);

        selectedNodeId = node.id;
        selectedLinkId = null;

        graphChanged();
        renderInspector();

        return node;
    }


    function parsePinValue(pin, text) {
        if (pin.type === 'number') {
            if (!text.trim()) throw new Error('Enter a number');

            const number = Number(text);
            if (!Number.isFinite(number)) {
                throw new Error('Invalid number');
            }
            return number;
        }

        if (pin.type === 'boolean') {
            const value = text.trim().toLowerCase();

            if (value !== 'true' && value !== 'false') {
                throw new Error('Enter true or false');
            }

            return value === 'true';
        }

        if (pin.type === 'vector2') {
            const parsed = JSON.parse(text);

            if (
                !Array.isArray(parsed) ||
                parsed.length !== 2 ||
                !parsed.every(Number.isFinite)
            ) {
                throw new Error('Expected [x, y]');
            }

            return parsed;
        }

        if (pin.type === 'color') {
            if (!/^#[0-9a-fA-F]{6}$/.test(text.trim())) {
                throw new Error('Expected #RRGGBB');
            }
            return text.trim();
        }

        if (pin.type === 'asset') {
            const id = text.trim();

            return id
                ? { type: 'texture', id }
                : null;
        }

        return text;
    }

    // =========================================
    // Searchable node menu
    // =========================================

    const nodeMenu = document.createElement('div');
    nodeMenu.id = 'node-menu';
    nodeMenu.className = 'popup';
    nodeMenu.hidden = true;
    nodeMenu.innerHTML = `
        <input id="menu-search"
               placeholder="Search material nodes..."
               autocomplete="off">
        <div id="menu-items"></div>
    `;

    $('workspace').appendChild(nodeMenu);

    const menuSearch = nodeMenu.querySelector('#menu-search');
    const menuItems = nodeMenu.querySelector('#menu-items');

    const valueNodeTypes = [
        { type: 'number', label: 'Number', category: 'Values' },
        { type: 'color', label: 'Color', category: 'Values' },
        { type: 'boolean', label: 'Boolean', category: 'Values' },
        { type: 'vector2', label: 'Vector2', category: 'Values' },
        { type: 'asset', label: 'Texture', category: 'Assets' }
    ];

    function closeMenu() {
        nodeMenu.hidden = true;
        menuPosition = null;
    }


    function renderNodeMenu() {
        menuItems.replaceChildren();

        const query = menuSearch.value
            .trim()
            .toLowerCase();

        const matches = [...definitions.values()]
            .filter(definition => {
                if (definition.type === 'material.output') {
                    return false;
                }

                return (
                    definition.name.toLowerCase().includes(query) ||
                    definition.category.toLowerCase().includes(query)
                );
            })
            .sort((a, b) =>
                a.category.localeCompare(b.category) ||
                a.name.localeCompare(b.name)
            );

        const groups = new Map();

        for (const definition of matches) {
            if (!groups.has(definition.category)) {
                groups.set(definition.category, []);
            }

            groups.get(definition.category).push(definition);
        }

        for (const [categoryName, items] of groups) {
            const category = document.createElement('div');
            category.className = 'menu-category';
            category.textContent = categoryName;

            menuItems.append(category);

            for (const definition of items) {
                const button = document.createElement('button');

                button.type = 'button';
                button.className = 'menu-item';
                button.textContent = definition.name;

                button.addEventListener('click', () => {
                    if (menuPosition) {
                        createNode(
                            definition.type,
                            menuPosition
                        );
                    }

                    closeMenu();
                });

                menuItems.append(button);
            }
        }
    }


    function addNodeMenu(point, screen) {
        const workspaceRect =
            $('workspace').getBoundingClientRect();

        const canvasRect =
            canvas.getBoundingClientRect();

        menuPosition = point;
        menuSearch.value = '';

        renderNodeMenu();
        nodeMenu.hidden = false;

        const x =
            screen.x + canvasRect.left - workspaceRect.left;

        const y =
            screen.y + canvasRect.top - workspaceRect.top;

        nodeMenu.style.left =
            Math.max(6, Math.min(x, workspaceRect.width - 244)) + 'px';

        nodeMenu.style.top =
            Math.max(6, Math.min(y, workspaceRect.height - 325)) + 'px';

        menuSearch.focus();
    }

    menuSearch.addEventListener('input', renderNodeMenu);

    menuSearch.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeMenu();

        if (event.key === 'Enter') {
            event.preventDefault();
            menuItems.querySelector('.menu-item')?.click();
        }
    });

    document.addEventListener('pointerdown', event => {
        if (
            !nodeMenu.hidden &&
            !nodeMenu.contains(event.target)
        ) {
            closeMenu();
        }
    }, true);

    // =========================================
    // Material node inspector
    // =========================================


    function renderInspector() {
        const node = getNode(selectedNodeId);

        if (!node) {
            postGraphUpdate('graphSelection', {
                selection: null
            });
            return;
        }

        const connectedPinIds = links
            .filter(link => link.to)
            .map(link => link.to);

        postGraphUpdate('graphSelection', {
            selection: {
                type: 'node',
                assetType: 'material',
                id: node.id,
                name: nodeTitle(node),
                functionId: null,
                value: clone(node),
                connectedPinIds
            }
        });
    }


    function updateGraphProperty(message) {
        const {
            selectionType,
            id,
            property,
            pinId,
            value
        } = message;

        if (selectionType !== 'node') return;

        const node = getNode(id);
        if (!node) return;

        if (property === 'pinValue') {
            const pin = node.pins?.find(
                item => item.id === pinId
            );

            if (!pin) return;

            // Connected input values are driven by the graph.
            if (
                pin.direction === 'input' &&
                links.some(link => link.to === pin.id)
            ) return;

            if (!Object.hasOwn(pin, 'value')) return;

            try {
                let nextValue = clone(value);

                if (pin.type === 'number') {
                    nextValue = Number(value);

                    if (!Number.isFinite(nextValue)) {
                        throw new Error('Invalid number');
                    }
                }

                if (pin.type === 'boolean') {
                    if (typeof value !== 'boolean') {
                        throw new Error('Invalid boolean');
                    }
                }

                if (pin.type === 'color') {
                    if (
                        typeof value !== 'string' ||
                        !/^#[0-9a-fA-F]{6}$/.test(value)
                    ) {
                        throw new Error('Invalid color');
                    }
                }

                if (pin.type === 'vector2') {
                    if (
                        !Array.isArray(value) ||
                        value.length !== 2 ||
                        !value.every(Number.isFinite)
                    ) {
                        throw new Error('Invalid Vector2');
                    }
                }


                if (pin.type === 'asset') {
                    const assetType = pin.assetType ?? 'texture';

                    if (
                        nextValue === null ||
                        nextValue === undefined ||
                        nextValue === ''
                    ) {
                        nextValue = null;
                    }
                    else if (typeof nextValue === 'string') {
                        // Properties selector returned the asset ID.
                        nextValue = {
                            type: assetType,
                            id: nextValue
                        };
                    }
                    else if (
                        typeof nextValue === 'object' &&
                        typeof nextValue.id === 'string' &&
                        nextValue.id.length > 0 &&
                        (
                            nextValue.type === assetType ||
                            nextValue.type === undefined
                        )
                    ) {
                        nextValue = {
                            type: assetType,
                            id: nextValue.id
                        };
                    }
                    else {
                        throw new Error(
                            `Expected a ${assetType} reference`
                        );
                    }
                }


                pin.value = nextValue;

                graphChanged();
                renderInspector();

            } catch (error) {
                setStatus('Error: ' + error.message);
            }

            return;
        }

        if (
            property === 'name' &&
            node.type !== 'material.output'
        ) {
            const name = String(value).trim();

            if (!name) return;

            node.name = name;

            graphChanged();
            renderInspector();
        }
    }



    // =========================================
    // Connections
    // =========================================

    function connectPins(a, b) {
        if (!a || !b) return;

        let from = a;
        let to = b;

        if (from.pin.direction === 'input') {
            [from, to] = [to, from];
        }

        if (
            from.pin.direction !== 'output' ||
            to.pin.direction !== 'input' ||
            from.node.id === to.node.id ||
            (
                from.pin.type !== to.pin.type &&
                from.pin.type !== 'any' &&
                to.pin.type !== 'any'
            )
        ) {
            return;
        }

        links = links.filter(link => link.to !== to.pin.id);

        links.push({
            id: uuid(),
            from: from.pin.id,
            to: to.pin.id
        });

        graphChanged();
        renderInspector();
    }

    function findLink(point) {
        for (const link of [...links].reverse()) {
            const from = getPin(link.from);
            const to = getPin(link.to);

            if (!from || !to) continue;

            const a = pinPosition(from.node, from.pin);
            const b = pinPosition(to.node, to.pin);

            const bend = Math.max(
                45,
                Math.abs(b.x - a.x) * 0.55
            );

            for (let i = 0; i <= 40; i++) {
                const t = i / 40;
                const u = 1 - t;

                const x =
                    u ** 3 * a.x +
                    3 * u * u * t * (a.x + bend) +
                    3 * u * t * t * (b.x - bend) +
                    t ** 3 * b.x;

                const y =
                    u ** 3 * a.y +
                    3 * u * u * t * a.y +
                    3 * u * t * t * b.y +
                    t ** 3 * b.y;

                if (
                    Math.hypot(
                        point.x - x,
                        point.y - y
                    ) < 9 / zoom
                ) {
                    return link;
                }
            }
        }

        return null;
    }

    function deleteSelection() {
        if (selectedLinkId) {
            links = links.filter(
                link => link.id !== selectedLinkId
            );

            selectedLinkId = null;
            graphChanged();
            renderInspector();
            return;
        }

        const node = getNode(selectedNodeId);
        if (!node) return;

        // Material Output cannot be deleted.
        if (node.type === 'material.output') return;

        const removedPins = new Set(
            node.pins.map(pin => pin.id)
        );

        nodes = nodes.filter(n => n.id !== node.id);

        links = links.filter(link =>
            !removedPins.has(link.from) &&
            !removedPins.has(link.to)
        );

        selectedNodeId = null;

        graphChanged();
        renderInspector();
    }

    // =========================================
    // View
    // =========================================

    function fitGraph() {
        if (!nodes.length) return;

        const minX = Math.min(
            ...nodes.map(n => n.position[0])
        );
        const minY = Math.min(
            ...nodes.map(n => n.position[1])
        );
        const maxX = Math.max(
            ...nodes.map(n => n.position[0] + NODE_WIDTH)
        );
        const maxY = Math.max(
            ...nodes.map(n => n.position[1] + nodeHeight(n))
        );

        const graphWidth = Math.max(1, maxX - minX);
        const graphHeight = Math.max(1, maxY - minY);

        zoom = clamp(
            Math.min(
                (canvas.clientWidth - 100) / graphWidth,
                (canvas.clientHeight - 100) / graphHeight
            ),
            0.25,
            2
        );

        pan.x =
            canvas.clientWidth / 2 -
            (minX + graphWidth / 2) * zoom;

        pan.y =
            canvas.clientHeight / 2 -
            (minY + graphHeight / 2) * zoom;
    }

    function changeZoom(factor, point = null) {
        point ??= {
            x: canvas.clientWidth / 2,
            y: canvas.clientHeight / 2
        };

        const before = screenToWorld(point.x, point.y);

        zoom = clamp(zoom * factor, 0.2, 3);

        pan.x = point.x - before.x * zoom;
        pan.y = point.y - before.y * zoom;
    }

    // =========================================
    // Mouse interactions
    // =========================================

    canvas.addEventListener('mousedown', event => {
        const screen = getPointer(event);
        const point = screenToWorld(screen.x, screen.y);

        mouse = screen;
        lastMouse = screen;

        if (event.button === 1) {
            draggingCanvas = true;
            return;
        }

        if (event.button !== 0) return;

        const pin = findPin(point);

        if (pin) {
            connectingPin = pin;
            return;
        }

        const node = findNode(point);

        selectedNodeId = node?.id ?? null;
        selectedLinkId = null;

        if (!node) {
            const found = findLink(point);

            if (found) {
                selectedLinkId = found.id;
                draggingCanvas = false;
                renderInspector();
                return;
            }
        }

        renderInspector();

        if (node) {
            nodes = nodes.filter(n => n.id !== node.id);
            nodes.push(node);

            const headerBottom =
                node.position[1] + HEADER_HEIGHT;

            if (point.y <= headerBottom) {
                draggingNode = node;
            }
        } else {
            draggingCanvas = true;
        }
    });

    window.addEventListener('mousemove', event => {
        const screen = getPointer(event);

        mouse = screen;

        const dx = screen.x - lastMouse.x;
        const dy = screen.y - lastMouse.y;

        if (draggingNode) {
            draggingNode.position[0] += dx / zoom;
            draggingNode.position[1] += dy / zoom;
        } else if (draggingCanvas) {
            pan.x += dx;
            pan.y += dy;
        }

        lastMouse = screen;
    });

    window.addEventListener('mouseup', event => {
        if (connectingPin && event.button === 0) {
            const screen = getPointer(event);
            const point = screenToWorld(screen.x, screen.y);
            const target = findPin(point);

            if (target) {
                connectPins(connectingPin, target);
            } else if (
                connectingPin.pin.direction === 'input'
            ) {
                const length = links.length;

                links = links.filter(
                    link => link.to !== connectingPin.pin.id
                );

                if (links.length !== length) {
                    graphChanged();
                }
            }

            connectingPin = null;
            renderInspector();
        }

        if (draggingNode) {
            graphChanged();
        }

        draggingNode = null;
        draggingCanvas = false;
    });

    canvas.addEventListener('dblclick', event => {
        const screen = getPointer(event);
        const point = screenToWorld(screen.x, screen.y);
        const pin = findPin(point);

        if (pin) {
            selectedNodeId = pin.node.id;
            selectedLinkId = null;
            renderInspector();
        }
    });

    canvas.addEventListener('contextmenu', event => {
        event.preventDefault();

        const screen = getPointer(event);
        const point = screenToWorld(screen.x, screen.y);
        const pin = findPin(point);

        if (pin) {
            selectedNodeId = pin.node.id;
            selectedLinkId = null;
            renderInspector();
            return;
        }

        if (findNode(point)) return;

        addNodeMenu(point, screen);
    });

    canvas.addEventListener('wheel', event => {
        event.preventDefault();

        const point = getPointer(event);

        changeZoom(
            event.deltaY < 0 ? 1.1 : 1 / 1.1,
            point
        );
    }, { passive: false });

    // =========================================
    // Keyboard shortcuts
    // =========================================

    window.addEventListener('keydown', event => {
        const target = event.target;

        const isInput =
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement;

        if (event.key === 'Escape') {
            closeMenu();
            connectingPin = null;
            selectedNodeId = null;
            selectedLinkId = null;
            renderInspector();
        }

        if (
            !isInput &&
            !nodeMenu.contains(target) &&
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 'd'
        ) {
            event.preventDefault();

            const node = getNode(selectedNodeId);

            if (
                node &&
                node.type !== 'material.output'
            ) {
                const duplicate = clone(node);

                duplicate.id = uuid();
                duplicate.position = [
                    node.position[0] + 35,
                    node.position[1] + 35
                ];

                duplicate.pins.forEach(pin => {
                    pin.id = uuid();
                });

                nodes.push(duplicate);
                selectedNodeId = duplicate.id;

                graphChanged();
                renderInspector();
            }
        }

        if (
            (event.key === 'Delete' ||
                event.key === 'Backspace') &&
            !isInput
        ) {
            deleteSelection();
        }

        if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 's'
        ) {
            event.preventDefault();
            saveGraph();
        }
    });

    // =========================================
    // Toolbar
    // =========================================

    $('compile').addEventListener('click', requestCompile);
    $('fit').addEventListener('click', fitGraph);

    $('zoom-in').addEventListener(
        'click',
        () => changeZoom(1.2)
    );

    $('zoom-out').addEventListener(
        'click',
        () => changeZoom(1 / 1.2)
    );

    // =========================================
    // Host messages
    // =========================================

    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {

            case 'updateGraphProperty':
                updateGraphProperty(message);
                break;
            case 'definitions':
                definitions = new Map(
                    message.definitions.map(
                        definition => [definition.type, definition]
                    )
                );
                break;

            case 'load': {
                // Don't overwrite unsaved local graph changes.
                if (saving || savedRevision < revision) {
                    return;
                }

                asset = message.asset;
                nodes = clone(asset.nodes ?? []);
                links = clone(asset.links ?? []);

                selectedNodeId = null;
                selectedLinkId = null;
                renderInspector();

                revision = 0;
                savedRevision = 0;
                compiled = false;
                compileRequested = false;

                $('material-name').textContent =
                    asset.name ?? 'Material';

                setStatus('Material loaded');
                fitGraph();
                break;
            }

            case 'graphSaved':
                handleGraphSaved(message);
                break;

            case 'compiled':
                if (asset) {
                    asset.data = clone(message.data);
                }

                compiled = true;
                setStatus('Material compiled successfully');
                break;

            case 'invalid':
                setStatus(message.error);
                break;

            case 'error':
                if (message.operation === 'saveGraph') {
                    saving = false;
                    compileRequested = false;
                }

                if (message.operation === 'compile') {
                    compileRequested = false;
                }

                setStatus('Error: ' + message.error);
                break;
        }
    });

    new ResizeObserver(() => {
        // Canvas dimensions are updated by draw().
    }).observe(container);

    requestAnimationFrame(draw);

    postGraphUpdate('ready');
})();
