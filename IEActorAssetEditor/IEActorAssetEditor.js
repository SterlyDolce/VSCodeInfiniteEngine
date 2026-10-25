// @ts-nocheck

const vscode = require('vscode');
const fs = require('fs');
const crypto = require('crypto');
const IEAssetManager = require('../IEAssetManager');
const { createComponent } = require('../Components/createComponent');


class IEActorAssetEditor {
    static panels = new Map();
    static selections = new Map();
    static outlinerProvider = null;

    constructor(context, propertiesProvider) {
        this.context = context;
        this.propertiesProvider = propertiesProvider;
    }

    async resolveCustomTextEditor(document, panel) {
        const key = document.uri.toString();
        IEActorAssetEditor.panels.set(key, panel);

        const editor = vscode.Uri.joinPath(
            this.context.extensionUri,
            'IESceneEditor'
        );

        const models = vscode.Uri.joinPath(
            this.context.extensionUri,
            'Models'
        );

        const modules = vscode.Uri.joinPath(
            this.context.extensionUri,
            'node_modules'
        );

        const images = vscode.Uri.joinPath(
            this.context.extensionUri,
            'images'
        );

        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                editor,
                models,
                modules,
                images,
                vscode.Uri.joinPath(this.context.extensionUri, 'Shared')
            ]
        };

        const resource = (...parts) =>
            panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this.context.extensionUri, ...parts)
            ).toString();

        let html = fs.readFileSync(
            vscode.Uri.joinPath(editor, 'index.html').fsPath,
            'utf8'
        );

        const replacements = {
            '{{SHARED_STYLE_URI}}': resource('Shared', 'ui.css'),
            '{{SHARED_UI_URI}}': resource('Shared', 'ui.js'),
            '{{SCRIPT_URI}}': resource('IESceneEditor', 'script.mjs'),
            '{{THREE_URI}}': resource(
                'node_modules', 'three', 'build', 'three.module.js'
            ),
            '{{THREE_ADDONS_URI}}': resource(
                'node_modules', 'three', 'examples', 'jsm'
            ) + '/',
            '{{CAMERA_MODEL_URI}}': resource('Models', 'Camera.glb'),
            '{{VIEW_GIZMO_MODEL_URI}}': resource('Models', 'ViewGizmo.glb'),
            '{{CHECKER_TEXTURE_URI}}': resource('images', 'checkers.png'),
            '{{RAPIER_URI}}': resource(
                'node_modules',
                '@dimforge',
                'rapier3d-compat',
                'dist',
                'rapier.mjs'
            ),
            '{{CSP_SOURCE}}': panel.webview.cspSource,
            '{{NONCE}}': crypto.randomBytes(16).toString('base64')
        };

        for (const [token, value] of Object.entries(replacements)) {
            html = html.replaceAll(token, value);
        }
        html = html.replace(
            '<span id="viewport-title">Viewport</span>',
            '<span id="viewport-title">Actor Preview</span>'
        );
        panel.webview.html = html;

        let isReady = false;
        let disposed = false;
        let lastSubmitted = null;
        let writing = Promise.resolve();
        let selectedComponentId = null;
        const outliner = IEActorAssetEditor.outlinerProvider;

        const readAsset = () => {
            const asset = JSON.parse(document.getText());

            if (
                asset.type !== 'actor' ||
                !asset.data ||
                !Array.isArray(asset.data.components)
            ) {
                throw new Error(
                    'Invalid Actor Asset: expected data.components'
                );
            }

            return asset;
        };

        const resolveActor = async asset => {
            const actor = structuredClone(asset.data);

            actor.id ??= asset.id;
            actor.name ??= asset.name ?? 'Actor';
            actor.type ??= 'Actor';

            const transform = actor.components.find(
                component => component.type === 'transform'
            );

            if (transform) {
                for (const name of ['position', 'rotation', 'scale']) {
                    if (Array.isArray(transform[name])) {
                        actor[name] = [...transform[name]];
                    }
                }
            }

            const workspace = vscode.workspace.getWorkspaceFolder(
                document.uri
            );

            if (!workspace) return actor;

            const manager = new IEAssetManager(
                workspace.uri.fsPath
            );

            await manager.scan();

            for (const component of actor.components) {
                if (component.type !== 'mesh') continue;

                const geometry = await manager.resolve(
                    component.geometry
                );

                component.resolvedGeometry =
                    geometry?.type === 'geometry'
                        ? geometry.data
                        : null;

                component.resolvedMaterials = await Promise.all(
                    (component.materials ?? []).map(
                        reference =>
                            manager.resolveMaterialForScene(reference)
                    )
                );


                if (component.skinned) {
                    const skeleton = await manager.resolve(
                        component.skeleton
                    );

                    if (!skeleton || skeleton.type !== 'skeleton') {
                        throw new Error(
                            `Skeleton not found: ${component.name}`
                        );
                    }

                    component.resolvedSkeleton = skeleton.data;
                }

            }

            return actor;
        };


        const refreshProperties = async () => {
            if (disposed) return;

            const asset = readAsset();
            const actor = structuredClone(asset.data);

            actor.id ??= asset.id;
            actor.name ??= asset.name ?? 'Actor';
            actor.type ??= 'Actor';

            await this.propertiesProvider.syncActiveEditor();

            this.propertiesProvider.setActorAssetSelection(
                key,
                actor,
                selectedComponentId,
                {
                    updateProperty,
                    selectComponent: async componentId => {
                        await select(componentId);
                    }
                }
            );
        };


        const select = async componentId => {
            const asset = readAsset();

            if (
                componentId !== null &&
                !asset.data.components.some(item => item.id === componentId)
            ) return;

            selectedComponentId = componentId;

            if (componentId) {
                await panel.webview.postMessage({
                    type: 'selectComponent',
                    componentId
                });
            } else {
                await panel.webview.postMessage({
                    type: 'selectActor',
                    actorId: asset.data.id ?? asset.id
                });
            }

            await refreshProperties();

            if (
                outliner &&
                this.propertiesProvider.activeEditor?.uri === key
            ) {
                await outliner.revealComponent(key, componentId);
            }
        };




        const load = async () => {
            if (!isReady || disposed) return;
            await this.propertiesProvider.syncActiveEditor();
            try {
                const asset = readAsset();
                if (outliner) {
                    outliner.setActorAsset(asset, document.uri);
                }
                const actor = await resolveActor(asset);

                if (disposed) return;

                await panel.webview.postMessage({
                    type: 'loadActorAsset',
                    actor
                });

                if (selectedComponentId) {
                    await panel.webview.postMessage({
                        type: 'selectComponent',
                        componentId: selectedComponentId
                    });
                }
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Actor Asset load failed: ${error.message}`
                );
            }
            if (!disposed) {
                await refreshProperties();
            }
        };

        const validateTransform = message => {
            const values = {};

            for (const name of ['position', 'rotation', 'scale']) {
                const value = message[name];

                if (
                    !Array.isArray(value) ||
                    value.length !== 3 ||
                    !value.every(
                        item =>
                            typeof item === 'number' &&
                            Number.isFinite(item)
                    )
                ) {
                    throw new Error(`Invalid ${name}`);
                }

                values[name] = [...value];
            }

            return values;
        };

        const writeAsset = async mutate => {
            const task = writing.catch(() => { }).then(async () => {
                const asset = readAsset();
                const changed = mutate(asset);

                if (changed === false) return;

                const serialized =
                    JSON.stringify(asset, null, 4) + '\n';

                if (serialized === document.getText()) return;

                const edit = new vscode.WorkspaceEdit();

                edit.replace(
                    document.uri,
                    new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(
                            document.getText().length
                        )
                    ),
                    serialized
                );

                lastSubmitted = serialized;

                if (!await vscode.workspace.applyEdit(edit)) {
                    lastSubmitted = null;
                    throw new Error('Unable to update Actor Asset');
                }
            });

            writing = task.catch(() => { });

            try {
                await task;
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Actor Asset update failed: ${error.message}`
                );

                await load();
            }
        };

        const addComponent = async (type, parentId = null) => {
            let created = null;

            await writeAsset(asset => {
                const components = asset.data.components;

                if (parentId !== null) {
                    const parent = components.find(item => item.id === parentId);

                    if (!parent || ![
                        'mesh',
                        'camera',
                        'springArm',
                        'pointLight',
                        'directionalLight',
                        'spotLight'
                    ].includes(parent.type)) {
                        return false;
                    }
                }

                created = createComponent(type, components);
                created.parent = parentId;

                components.push(created);
            });

            if (!created) return null;

            selectedComponentId = created.id;

            await load();

            if (outliner) {
                await outliner.revealComponent(key, created.id);
            }

            return created;
        };


        const deleteComponent = async componentId => {
            if (disposed || !componentId) return;

            const asset = readAsset();
            const components = asset.data.components;

            const component = components.find(
                item => item.id === componentId
            );

            if (!component) return;

            // The Actor's root transform should not be removed.
            if (component.type === 'transform') {
                vscode.window.showWarningMessage(
                    'The root Transform component cannot be deleted.'
                );
                return;
            }

            const children = components.filter(
                item => item.parent === componentId
            );

            const choice = await vscode.window.showWarningMessage(
                children.length
                    ? `Delete "${component.name}"? Its ${children.length} direct child component(s) will be moved to its parent.`
                    : `Delete "${component.name}"?`,
                { modal: true },
                'Delete'
            );

            if (choice !== 'Delete' || disposed) return;

            let deleted = false;

            await writeAsset(asset => {
                const components = asset.data.components;
                const index = components.findIndex(
                    item => item.id === componentId
                );

                if (index < 0) return false;

                const target = components[index];

                // Preserve children by promoting them one level.
                for (const child of components) {
                    if (child.parent === componentId) {
                        child.parent = target.parent ?? null;
                    }
                }

                components.splice(index, 1);
                deleted = true;
            });

            if (!deleted) return;

            if (selectedComponentId === componentId) {
                selectedComponentId = null;
            }

            await load();

            if (outliner) {
                await outliner.revealComponent(
                    key,
                    selectedComponentId
                );
            }
        };



        const reparentComponent = async (uri, componentId, parentId) => {
            if (uri !== key || disposed) return;

            let updated = false;

            await writeAsset(asset => {
                const components = asset.data.components;

                const child = components.find(
                    component => component.id === componentId
                );

                if (!child) return false;

                if (parentId !== null) {
                    const parent = components.find(
                        component => component.id === parentId
                    );

                    const spatialTypes = new Set([
                        'mesh',
                        'camera',
                        'springArm',
                        'pointLight',
                        'directionalLight',
                        'spotLight'
                    ]);

                    if (
                        !parent ||
                        !spatialTypes.has(parent.type) ||
                        parent.id === child.id
                    ) return false;

                    // Prevent child/descendant cycles.
                    const visited = new Set([child.id]);
                    let current = parent;

                    while (current) {
                        if (visited.has(current.id)) return false;

                        visited.add(current.id);

                        current = components.find(
                            item => item.id === current.parent
                        );
                    }
                }

                if ((child.parent ?? null) === parentId) {
                    return false;
                }

                child.parent = parentId;
                updated = true;
            });

            if (updated) {
                await load();
            }
        };

        IEActorAssetEditor.selections.set(key, {
            select,
            reparent: reparentComponent,
            addComponent,
            deleteComponent
        });



        const updateProperty = async (componentId, property, value) => {
            if (
                !property ||
                ['id', 'type', '__proto__', 'constructor', 'prototype'].includes(property)
            ) return;

            if (!componentId && property !== 'name') return;

            await writeAsset(asset => {
                const target = componentId
                    ? asset.data.components.find(
                        component => component.id === componentId
                    )
                    : asset.data;

                if (!target) {
                    throw new Error('Actor or component not found');
                }

                if (!Object.prototype.hasOwnProperty.call(target, property)) {
                    throw new Error(`Unknown property: ${property}`);
                }

                const previous = target[property];

				if (
					Array.isArray(previous) &&
					previous.length === 3 &&
					value &&
					typeof value === 'object' &&
					!Array.isArray(value) &&
					Number.isInteger(value.axis) &&
					value.axis >= 0 &&
					value.axis <= 2 &&
					Number.isFinite(value.value)
				) {
					const next = [...previous];
					next[value.axis] = value.value;
					value = next;
				}

                if (typeof previous === 'boolean' && typeof value !== 'boolean') {
                    throw new TypeError('Expected a boolean');
                }

                if (
                    typeof previous === 'number' &&
                    (typeof value !== 'number' || !Number.isFinite(value))
                ) {
                    throw new TypeError('Expected a finite number');
                }

                if (typeof previous === 'string' && typeof value !== 'string') {
                    throw new TypeError('Expected a string');
                }

                if (Array.isArray(previous) && !Array.isArray(value)) {
                    throw new TypeError('Expected an array');
                }

                if (
                    previous !== null &&
                    typeof previous === 'object' &&
                    !Array.isArray(previous) &&
                    value !== null &&
                    (
                        typeof value !== 'object' ||
                        Array.isArray(value)
                    )
                ) {
                    throw new TypeError('Expected an object');
                }

                target[property] = structuredClone(value);
            });

            await load();
        };


        const updateActorTransform = async message => {
            const values = validateTransform(message);

            await writeAsset(asset => {
                const actor = asset.data;

                if (message.actorId !== (actor.id ?? asset.id)) {
                    return false;
                }

                const transform = actor.components.find(
                    component => component.type === 'transform'
                );

                const target = transform ?? actor;

                for (const name of ['position', 'rotation', 'scale']) {
                    target[name] = values[name];
                }
            });
        };

        const updateComponentTransform = async message => {
            if (!message.componentId) return;

            const values = validateTransform(message);

            await writeAsset(asset => {
                const component = asset.data.components.find(
                    item => item.id === message.componentId
                );

                if (!component) {
                    throw new Error(
                        `Component not found: ${message.componentId}`
                    );
                }

                if (component.type === 'transform') {
                    throw new Error(
                        'Use Actor transform editing for the Transform component'
                    );
                }

                const target =
                    component.transform &&
                        typeof component.transform === 'object' &&
                        !Array.isArray(component.transform)
                        ? component.transform
                        : component;

                for (const name of ['position', 'rotation', 'scale']) {
                    target[name] = values[name];
                }
            });
        };

        const duplicateComponentTransform = async message => {
            if (!message.componentId) return;
            const values = validateTransform(message);
            let duplicateId = null;

            await writeAsset(asset => {
                const components = asset.data.components;
                const source = components.find(item =>
                    item.id === message.componentId
                );
                if (!source || source.type === 'transform') {
                    throw new Error('Component cannot be duplicated');
                }

                const subtreeIds = new Set([source.id]);
                let changed = true;
                while (changed) {
                    changed = false;
                    for (const component of components) {
                        if (subtreeIds.has(component.parent) && !subtreeIds.has(component.id)) {
                            subtreeIds.add(component.id);
                            changed = true;
                        }
                    }
                }

                const copies = components
                    .filter(component => subtreeIds.has(component.id))
                    .map(component => structuredClone(component));
                const ids = new Map(copies.map(component => [
                    component.id,
                    crypto.randomUUID()
                ]));

                for (const copy of copies) {
                    const oldId = copy.id;
                    copy.id = ids.get(oldId);
                    if (ids.has(copy.parent)) copy.parent = ids.get(copy.parent);
                    if (oldId === source.id) {
                        duplicateId = copy.id;
                        copy.name = `${copy.name ?? source.type} Copy`;
                        const target = copy.transform &&
                            typeof copy.transform === 'object' &&
                            !Array.isArray(copy.transform)
                            ? copy.transform : copy;
                        for (const name of ['position', 'rotation', 'scale']) {
                            target[name] = values[name];
                        }
                    }
                }

                components.push(...copies);
            });

            selectedComponentId = duplicateId;
            await load();
            if (outliner && duplicateId) {
                await outliner.revealComponent(key, duplicateId);
            }
        };


        const selectComponent = async message => {
            const asset = readAsset();

            const componentId = message.componentId ?? null;

            if (
                componentId !== null &&
                !asset.data.components.some(
                    component => component.id === componentId
                )
            ) return;

            selectedComponentId = componentId;

            await refreshProperties();

            if (outliner) {
                await outliner.revealComponent(key, componentId);
            }
        };


        const documentWatcher =
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document.uri.toString() !== key) return;

                if (event.document.getText() === lastSubmitted) {
                    lastSubmitted = null;
                    return;
                }

                lastSubmitted = null;
                void load();
            });

        const messageSubscription =
            panel.webview.onDidReceiveMessage(async message => {
				const action = ['onSceneUpdate', 'onOutlineUpdate']
					.includes(message.type)
					? message.action
					: message.type;

                switch (action) {
                    case 'ready':
                        isReady = true;
                        await load();
                        break;

                    case 'selectActor':
                        await select(null);
                        break;

                    case 'selectComponent':
                        await selectComponent(message);
                        break;

                    case 'updateActorTransform':
                        await updateActorTransform(message);
                        break;

                    case 'updateComponentTransform':
                        await updateComponentTransform(message);
                        break;

                    case 'duplicateComponentTransform':
                        await duplicateComponentTransform(message);
                        break;


                    case 'scriptPrint':
                        break;
                }
            });

        panel.onDidDispose(() => {
            disposed = true;

            documentWatcher.dispose();
            messageSubscription.dispose();

            if (IEActorAssetEditor.panels.get(key) === panel) {
                IEActorAssetEditor.panels.delete(key);
            }
            this.propertiesProvider.clearActorAssetSelection(key);
            IEActorAssetEditor.selections.delete(key);
        });
    }
}

module.exports = IEActorAssetEditor;
