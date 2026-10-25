// @ts-nocheck

const vscode = require('vscode');
const path = require('path');

class IEOutlinerProvider {
    constructor() {
        this.mode = 'scene';
        this.actors = [];
        this.script = null;
        this.actorAsset = null;
        this.animationState = null;
        this.skeleton = null;
        this.uiAsset = null;
        this.treeView = undefined;

        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;

        this.dragMimeTypes = [
            'application/vnd.infinite.component',
			'application/vnd.infinite.actor',
			'application/vnd.infinite.script-item',
			'text/plain'
        ];

        this.dropMimeTypes = [
            'application/vnd.infinite.component',
            'application/vnd.infinite.actor'
        ];

        this.reparentSceneActor = null;
		this.scriptDrag = null;
		this.scriptDragHandler = null;
    }


    setReparentHandler(handler) {
        this.reparentComponent = handler;
    }
    setSceneReparentHandler(handler) {
        this.reparentSceneActor = handler;
    }
	setScriptDragHandler(handler) {
		this.scriptDragHandler = handler;
	}

    async handleDrag(sources, dataTransfer) {
		if (this.mode === 'script' && this.script) {
			const items = sources.filter(item =>
				['variable', 'function'].includes(item?.kind) &&
				typeof item.id === 'string'
			);

			if (items.length !== 1) return;

			const item = items[0];
			const payload = JSON.stringify({
				uri: this.script.uri,
				kind: item.kind,
				id: item.id
			});

			this.scriptDrag = {
				item: JSON.parse(payload),
				startedAt: Date.now()
			};

			console.log('[IE Script DnD] Outliner drag started', {
				item: this.scriptDrag.item,
				dragMimeTypes: this.dragMimeTypes
			});

			await this.scriptDragHandler?.(structuredClone(this.scriptDrag.item));

			vscode.window.setStatusBarMessage(
				'Drop onto the Visual Script graph',
				5000
			);

			dataTransfer.set(
				'application/vnd.infinite.script-item',
				new vscode.DataTransferItem(payload)
			);

			dataTransfer.set(
				'text/plain',
				new vscode.DataTransferItem(`infinite-script-item:${payload}`)
			);

			return;
		}


        if (this.mode === 'scene') {
            const actors = sources.filter(item =>
                item?.id &&
                item.type !== 'World' &&
                this.actors.some(actor => actor.id === item.id)
            );

            if (actors.length !== 1) return;

            dataTransfer.set(
                'application/vnd.infinite.actor',
                new vscode.DataTransferItem(
                    JSON.stringify({
                        actorId: actors[0].id
                    })
                )
            );

            return;
        }


        if (this.mode !== 'actor' || !this.actorAsset) return;

        const components = sources.filter(
            item => item.kind === 'assetComponent'
        );

        if (components.length !== 1) return;

        const component = components[0];

        dataTransfer.set(
            'application/vnd.infinite.component',
            new vscode.DataTransferItem(JSON.stringify({
                uri: this.actorAsset.uri,
                componentId: component.id
            }))
        );
    }

	getActiveScriptDrag(uri) {
		const drag = this.scriptDrag;
		const age = drag ? Date.now() - drag.startedAt : null;

		console.log('[IE Script DnD] Resolving host drag fallback', {
			requestedUri: uri,
			drag,
			age
		});

		if (
			!drag ||
			age > 30000 ||
			drag.item.uri !== uri
		) {
			console.warn('[IE Script DnD] Host drag fallback rejected');
			return null;
		}

		console.log('[IE Script DnD] Host drag fallback matched', drag.item);
		return structuredClone(drag.item);
	}

    async handleDrop(target, dataTransfer) {

        if (this.mode === 'scene') {
            const item = dataTransfer.get(
                'application/vnd.infinite.actor'
            );

            if (!item) return;

            let dragged;

            try {
                dragged = JSON.parse(await item.asString());
            } catch {
                return;
            }

            const child = this.actors.find(
                actor => actor.id === dragged.actorId
            );

            const world = this.actors.find(
                actor => actor.type === 'World'
            );

            if (!child || child.type === 'World' || !world) return;

            // Dropping onto empty space reparents to World.
            const parentId = target?.id ?? world.id;

            const parent = this.actors.find(
                actor => actor.id === parentId
            );

            if (!parent || parent.id === child.id) return;

            // Reject cycles.
            const visited = new Set([child.id]);
            let current = parent;

            while (current) {
                if (visited.has(current.id)) return;

                visited.add(current.id);

                current = this.actors.find(
                    actor => actor.id === current.parent
                );
            }

            if (child.parent === parent.id) return;

            if (typeof this.reparentSceneActor !== 'function') {
                return;
            }

            await this.reparentSceneActor(
                child.id,
                parent.id
            );

            return;
        }


        if (this.mode !== 'actor' || !this.actorAsset) return;

        const item = dataTransfer.get(
            'application/vnd.infinite.component'
        );

        if (!item) return;

        let dragged;

        try {
            dragged = JSON.parse(await item.asString());
        } catch {
            return;
        }

        if (dragged.uri !== this.actorAsset.uri) return;

        const components = this.actorAsset.components;
        const child = components.find(
            item => item.id === dragged.componentId
        );

        if (!child) return;

        // Drop onto Actor root or empty space to unparent.
        const parentId =
            !target || target.kind === 'assetRoot'
                ? null
                : target.kind === 'assetComponent'
                    ? target.id
                    : undefined;

        if (parentId === undefined) return;
        if (parentId === child.id) return;

        if (parentId) {
            const parent = components.find(
                item => item.id === parentId
            );

            // Only components represented by Three.js objects
            // can own spatial children in this first version.
            const spatialTypes = new Set([
                'mesh',
                'camera',
                'springArm',
                'pointLight',
                'directionalLight',
                'spotLight'
            ]);

            if (!parent || !spatialTypes.has(parent.type)) return;
        }

        // Prevent circular parenting.
        const visited = new Set([child.id]);
        let currentId = parentId;

        while (currentId) {
            if (visited.has(currentId)) return;

            visited.add(currentId);

            const current = components.find(
                item => item.id === currentId
            );

            if (!current) return;
            currentId = current.parent ?? null;
        }

        if (typeof this.reparentComponent !== 'function') return;

        await this.reparentComponent(
            this.actorAsset.uri,
            child.id,
            parentId
        );
    }


    setTreeView(treeView) {
        this.treeView = treeView;
    }

    setActors(actors) {
        this.mode = 'scene';
        this.actors = actors ?? [];
        this.script = null;
        this.actorAsset = null;
        this.skeleton = null;
        this.refresh();
    }

    setScript(asset, uri) {
        this.mode = 'script';
        this.actors = [];
        this.actorAsset = null;
        this.skeleton = null;
        this.script = {
            uri: uri.toString(),
            assetId: asset.id,
            variables: asset.data?.variables ?? [],
            functions: asset.data?.functions ?? []
        };
        this.refresh();
    }


    setAnimationState(asset, uri) {
        this.mode = 'animationState';
        this.actors = [];
        this.script = null;
        this.actorAsset = null;
        this.skeleton = null;

        this.animationState = {
            uri: uri.toString(),
            assetId: asset.id,
            layers: asset.data?.layers ?? [],
            parameters: asset.data?.parameters ?? []
        };

        this.refresh();
    }


    setActorAsset(asset, uri) {
        const previous = this.actorAsset;

        this.mode = 'actor';
        this.actors = [];
        this.script = null;
        this.skeleton = null;
        this.actorAsset = {
            uri: uri.toString(),
            assetId: asset.id,
            name: asset.data?.name ?? asset.name ?? 'Actor',
            components: asset.data?.components ?? [],
            selectedComponentId:
                previous?.uri === uri.toString()
                    ? previous.selectedComponentId
                    : null
        };

        this.refresh();
    }

    setSkeleton(asset, uri) {
        this.mode = 'skeleton';
        this.actors = [];
        this.script = null;
        this.actorAsset = null;
        this.animationState = null;
        this.skeleton = {
            uri: uri.toString(),
            assetId: asset.id,
            name: asset.name ?? 'Skeleton',
            nodes: asset.data?.nodes ?? [],
            bones: asset.data?.bones ?? []
        };
        this.refresh();
    }

    setUIAsset(asset, uri, selectedElementId = null) {
        this.mode = 'ui';
        this.actors = [];
        this.script = null;
        this.actorAsset = null;
        this.animationState = null;
        this.skeleton = null;
        this.uiAsset = {
            uri: uri.toString(),
            assetId: asset.id,
            name: asset.name ?? 'User Interface',
            elements: asset.data?.elements ?? [],
            selectedElementId,
            root: {
                __uiRoot: true,
                id: 'canvas',
                name: asset.name ?? 'User Interface'
            }
        };
        this.refresh();
    }

    clear() {
        this.mode = 'none';
        this.actors = [];
        this.script = null;
        this.actorAsset = null;
        this.skeleton = null;
        this.uiAsset = null;
        this.refresh();
    }

    async revealActor(actorId) {
        if (!this.treeView || this.mode !== 'scene') return;

        const actor = this.actors.find(actor => actor.id === actorId);
        if (!actor) return;

        try {
            await this.treeView.reveal(actor, {
                select: true,
                focus: false,
                expand: true
            });
        } catch (error) {
            console.error('Failed to reveal actor:', error);
        }
    }

    async revealComponent(uri, componentId) {
        if (
            !this.treeView ||
            this.mode !== 'actor' ||
            this.actorAsset?.uri !== uri.toString()
        ) return;

        this.actorAsset.selectedComponentId = componentId;

        if (!componentId) {
            this.refresh();
            return;
        }

        const component = this.actorAsset.components.find(
            item => item.id === componentId
        );

        if (!component) return;

        this.refresh();

        try {
            await this.treeView.reveal({
                ...component,
                kind: 'assetComponent'
            }, {
                select: true,
                focus: false,
                expand: false
            });
        } catch (error) {
            console.error('Failed to reveal component:', error);
        }
    }

    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }


    getAnimationStateTreeItem(element) {
        const state = this.animationState;

        if (element.kind === 'animationGroup') {
            const item = new vscode.TreeItem(
                element.label,
                vscode.TreeItemCollapsibleState.Expanded
            );

            item.id =
                `animationState:${state.uri}:${element.group}`;

            item.iconPath = new vscode.ThemeIcon(
                element.group === 'layers'
                    ? 'layers'
                    : 'symbol-variable'
            );

            item.contextValue = element.group === 'layers'
                ? 'animationLayers'
                : 'animationParameters';

            return item;
        }

        const item = new vscode.TreeItem(
            element.name,
            vscode.TreeItemCollapsibleState.None
        );

        item.id = [
            'animationState',
            state.uri,
            element.kind,
            element.id
        ].join(':');

        if (element.kind === 'animationLayer') {
            item.iconPath = new vscode.ThemeIcon('layers');

            item.description =
                element.mode ?? 'override';
        } else {
            item.iconPath = new vscode.ThemeIcon(
                element.type === 'trigger'
                    ? 'zap'
                    : element.type === 'boolean'
                        ? 'symbol-boolean'
                        : 'symbol-number'
            );

            item.description = element.type;
        }

        item.contextValue =
            element.kind === 'animationLayer'
                ? 'animationLayerItem'
                : 'animationParameterItem';

        item.command = {
            command: 'infinite.selectAnimationStateItem',
            title: 'Select Animation State Item',
            arguments: [{
                uri: state.uri,
                kind: element.kind,
                id: element.id
            }]
        };



        return item;
    }


    getTreeItem(element) {

        if (this.mode === 'ui') {
            if (element.__uiRoot) {
                const item = new vscode.TreeItem(
                    element.name,
                    vscode.TreeItemCollapsibleState.Expanded
                );
                item.id = `ui:${this.uiAsset.uri}:canvas`;
                item.description = 'Canvas';
                item.iconPath = new vscode.ThemeIcon('layout');
                item.contextValue = 'infiniteUICanvas';
                item.command = {
                    command: 'infinite.selectUIElement',
                    title: 'Select UI Canvas',
                    arguments: [{ uri: this.uiAsset.uri, elementId: null }]
                };
                return item;
            }

            const item = new vscode.TreeItem(
                element.name || 'Unnamed Widget',
                vscode.TreeItemCollapsibleState.None
            );
            item.id = `ui:${this.uiAsset.uri}:${element.id}`;
            item.description = element.type;
            item.iconPath = new vscode.ThemeIcon({
                text: 'symbol-string',
                button: 'symbol-event',
                image: 'file-media',
                input: 'edit',
                panel: 'layout-panel',
                checkbox: 'checklist'
            }[element.type] ?? 'symbol-misc');
            item.contextValue = 'infiniteUIElement';
            item.command = {
                command: 'infinite.selectUIElement',
                title: 'Select UI Element',
                arguments: [{ uri: this.uiAsset.uri, elementId: element.id }]
            };
            return item;
        }

        if (this.mode === 'animationState') {
            return this.getAnimationStateTreeItem(element);
        }

        if (this.mode === 'script') {
            return this.getScriptTreeItem(element);
        }

        if (this.mode === 'actor') {
            return this.getActorAssetTreeItem(element);
        }

        if (this.mode === 'skeleton') {
            const item = new vscode.TreeItem(
                element.name || 'Unnamed',
                this.skeleton.nodes.some(node => node.parentId === element.id)
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.None
            );
            item.id = `skeleton:${this.skeleton.uri}:${element.id}`;
            item.iconPath = new vscode.ThemeIcon(
                element.isBone ? 'symbol-structure' : 'symbol-object'
            );
            item.contextValue = 'infiniteSkeletonNode';
            item.description = element.isBone
                ? `Bone ${this.skeleton.bones.indexOf(element.id)}`
                : 'Transform';
            item.command = {
                command: 'infinite.selectSkeletonNode',
                title: 'Select Skeleton Node',
                arguments: [{
                    uri: this.skeleton.uri,
                    nodeId: element.id
                }]
            };
            return item;
        }

        const hasChildren = this.actors.some(
            child => child.parent === element.id
        );

        const item = new vscode.TreeItem(
            element.name ?? 'Actor',
            hasChildren
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None
        );

        item.id = element.id;
        item.command = {
            command: 'infinite.selectActor',
            title: 'Select Actor',
            arguments: [element.id]
        };

        item.contextValue = element.type === 'World'
            ? 'infiniteWorldActor'
            : 'infiniteActor';

        return item;
    }

    getActorAssetTreeItem(element) {
        const uri = this.actorAsset.uri;

        if (element.kind === 'assetRoot') {
            const item = new vscode.TreeItem(
                this.actorAsset.name,
                vscode.TreeItemCollapsibleState.Expanded
            );

            item.id = `actorAsset:${uri}:root`;
            item.iconPath = new vscode.ThemeIcon('symbol-class');
            item.contextValue = 'infiniteActorAsset';

            item.command = {
                command: 'infinite.selectActorAssetComponent',
                title: 'Select Actor Asset',
                arguments: [{
                    uri,
                    componentId: null
                }]
            };

            return item;
        }

        const hasChildren = this.actorAsset.components.some(
            component => component.parent === element.id
        );

        const item = new vscode.TreeItem(
            element.name ?? element.type ?? 'Component',
            hasChildren
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None
        );

        item.id = `actorAsset:${uri}:component:${element.id}`;
        item.iconPath = new vscode.ThemeIcon(
            element.type === 'mesh'
                ? 'symbol-color'
                : element.type === 'camera'
                    ? 'device-camera'
                    : element.type === 'script'
                        ? 'symbol-method'
                        : 'symbol-property'
        );

        item.contextValue = 'infiniteActorAssetComponent';

        item.command = {
            command: 'infinite.selectActorAssetComponent',
            title: 'Select Component',
            arguments: [{
                uri,
                componentId: element.id
            }]
        };

        return item;
    }

    getScriptTreeItem(element) {
        if (element.kind === 'group') {
            const item = new vscode.TreeItem(
                element.label,
                vscode.TreeItemCollapsibleState.Expanded
            );

            item.id = `script:${this.script.uri}:${element.group}`;
            item.iconPath = new vscode.ThemeIcon(
                element.group === 'variables'
                    ? 'symbol-variable'
                    : 'symbol-method'
            );

            item.contextValue = element.group === 'variables'
                ? 'infiniteVariables'
                : 'infiniteFunctions';

            return item;
        }

        const item = new vscode.TreeItem(
            element.name,
            vscode.TreeItemCollapsibleState.None
        );

        item.id = `script:${this.script.uri}:${element.kind}:${element.id}`;
        item.iconPath =
            element.kind === 'variable' && element.type === 'boolean'
                ? vscode.Uri.file(
                    path.join(__dirname, 'images', 'switch.svg')
                ).with({ query: 'color=eb9191-v2' })
                : new vscode.ThemeIcon(
                    element.kind === 'variable'
                        ? 'symbol-variable'
                        : 'symbol-method'
                );

        item.contextValue = element.kind === 'variable'
            ? 'infiniteVariable'
            : 'infiniteFunction';

        item.command = {
            command: 'infinite.selectScriptItem',
            title: 'Select Script Item',
            arguments: [{
                uri: this.script.uri,
                kind: element.kind,
                id: element.id
            }]
        };

        return item;
    }

    getChildren(element) {

        if (this.mode === 'ui') {
            if (!this.uiAsset) return [];
            if (!element) return [this.uiAsset.root];
            if (element.__uiRoot) return [...this.uiAsset.elements].reverse();
            return [];
        }

        if (this.mode === 'skeleton') {
            if (!this.skeleton) return [];
            const parentId = element?.id ?? null;
            return this.skeleton.nodes.filter(node =>
                (node.parentId ?? null) === parentId
            );
        }


        if (this.mode === 'animationState') {
            const state = this.animationState;
            if (!state) return [];

            if (!element) {
                return [
                    {
                        kind: 'animationGroup',
                        group: 'layers',
                        label: 'Layers'
                    },
                    {
                        kind: 'animationGroup',
                        group: 'parameters',
                        label: 'Parameters'
                    }
                ];
            }

            if (element.kind === 'animationGroup') {
                if (element.group === 'layers') {
                    return state.layers.map(layer => ({
                        ...layer,
                        kind: 'animationLayer'
                    }));
                }

                return state.parameters.map(parameter => ({
                    ...parameter,
                    id: parameter.name,
                    kind: 'animationParameter'
                }));
            }

            return [];
        }


        if (this.mode === 'actor') {
            if (!this.actorAsset) return [];

            if (!element) {
                return [{ kind: 'assetRoot' }];
            }

            if (
                element.kind !== 'assetRoot' &&
                element.kind !== 'assetComponent'
            ) return [];

            const components = this.actorAsset.components;

            const parentId = element.kind === 'assetRoot'
                ? null
                : element.id;

            return components
                .filter(component => {
                    const parentExists = components.some(
                        item => item.id === component.parent
                    );

                    const actualParentId = parentExists
                        ? component.parent
                        : null;

                    return actualParentId === parentId;
                })
                .map(component => ({
                    ...component,
                    kind: 'assetComponent'
                }));
        }


        if (this.mode === 'script') {
            if (!this.script) return [];

            if (!element) {
                return [
                    {
                        kind: 'group',
                        group: 'variables',
                        label: 'Variables'
                    },
                    {
                        kind: 'group',
                        group: 'functions',
                        label: 'Functions'
                    }
                ];
            }

            if (element.kind === 'group') {
                const items = element.group === 'variables'
                    ? this.script.variables
                    : this.script.functions;

                const kind = element.group === 'variables'
                    ? 'variable'
                    : 'function';

                return items.map(item => ({
                    ...item,
                    kind,
                    name: item.name ?? 'Untitled'
                }));
            }

            return [];
        }

        if (this.mode !== 'scene') return [];

        if (!element) {
            return this.actors.filter(actor =>
                actor.type === 'World' ||
                !actor.parent ||
                !this.actors.some(parent => parent.id === actor.parent)
            );
        }

        return this.actors.filter(
            actor => actor.parent === element.id &&
                actor.id !== element.id
        );
    }

    getParent(element) {

        if (this.mode === 'ui') {
            if (element.__uiRoot) return undefined;
            return this.uiAsset?.root;
        }

        if (this.mode === 'skeleton') {
            if (!element.parentId) return undefined;
            return this.skeleton?.nodes.find(node =>
                node.id === element.parentId
            );
        }

        if (this.mode === 'animationState') {
            if (element.kind === 'animationGroup') {
                return undefined;
            }

            const isLayer = element.kind === 'animationLayer';

            return {
                kind: 'animationGroup',
                group: isLayer ? 'layers' : 'parameters',
                label: isLayer ? 'Layers' : 'Parameters'
            };
        }
        if (this.mode === 'actor') {
            if (element.kind === 'assetRoot') {
                return undefined;
            }

            const parent = this.actorAsset?.components.find(
                component => component.id === element.parent
            );

            return parent
                ? { ...parent, kind: 'assetComponent' }
                : { kind: 'assetRoot' };
        }

        if (this.mode === 'script') {
            if (element.kind === 'group') return undefined;

            if (element.kind === 'variable') {
                return {
                    kind: 'group',
                    group: 'variables',
                    label: 'Variables'
                };
            }

            if (element.kind === 'function') {
                return {
                    kind: 'group',
                    group: 'functions',
                    label: 'Functions'
                };
            }

            return undefined;
        }

        if (element.type === 'World' || !element.parent) {
            return undefined;
        }

        return this.actors.find(
            actor => actor.id === element.parent
        );
    }

    dispose() {
        this._onDidChangeTreeData.dispose();
    }
}

module.exports = IEOutlinerProvider;
