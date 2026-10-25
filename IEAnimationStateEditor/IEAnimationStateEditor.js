// @ts-nocheck

const vscode = require('vscode');
const fs = require('fs');
const crypto = require('crypto');

const IEAssetManager = require('../IEAssetManager');

class IEAnimationStateEditor {
    constructor(context, propertiesProvider) {
        this.context = context;
        this.propertiesProvider = propertiesProvider;
    }

    async resolveCustomTextEditor(document, panel) {
        const editorRoot = vscode.Uri.joinPath(
            this.context.extensionUri,
            'IEAnimationStateEditor'
        );

        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                editorRoot,
                vscode.Uri.joinPath(this.context.extensionUri, 'Shared'),
                vscode.Uri.joinPath(this.context.extensionUri, 'node_modules')
            ]
        };

        const resource = filename =>
            panel.webview.asWebviewUri(
                vscode.Uri.joinPath(editorRoot, filename)
            ).toString();

        const nonce = crypto
            .randomBytes(16)
            .toString('hex');

        let html = fs.readFileSync(
            vscode.Uri.joinPath(
                editorRoot,
                'index.html'
            ).fsPath,
            'utf8'
        );

        const replacements = {
            '{{SHARED_STYLE_URI}}': panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this.context.extensionUri, 'Shared', 'ui.css')
            ).toString(),
            '{{SHARED_UI_URI}}': panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this.context.extensionUri, 'Shared', 'ui.js')
            ).toString(),
            '{{SCRIPT_URI}}': resource('script.mjs'),
            '{{CSP_SOURCE}}': panel.webview.cspSource,
            '{{NONCE}}': nonce
        };

        for (const [key, value] of Object.entries(replacements)) {
            html = html.replaceAll(key, value);
        }

        panel.webview.html = html;

        let disposed = false;
        let ready = false;
        let writing = Promise.resolve();
        let suppressNextChange = false;

        const editorUri = document.uri.toString();

        this.propertiesProvider.animationStateCanvas = {
            uri: editorUri,
            panel
        };

        const readAsset = () => {
            const asset = JSON.parse(document.getText());

            if (
                asset.type !== 'animationState' ||
                !asset.data ||
                typeof asset.data !== 'object'
            ) {
                throw new Error(
                    'Invalid Animation Script asset'
                );
            }

            const data = asset.data;

            if (
                !Array.isArray(data.layers) &&
                !(
                    Array.isArray(data.states) &&
                    Array.isArray(data.transitions)
                )
            ) {
                throw new Error(
                    'Animation Script requires layers or legacy states'
                );
            }

            return asset;
        };

        const getAnimations = async () => {
            const workspace =
                vscode.workspace.getWorkspaceFolder(
                    document.uri
                );

            if (!workspace) return [];

            const manager = new IEAssetManager(
                workspace.uri.fsPath
            );

            await manager.scan();

            const results = [];

            for (const entry of manager.getAssets('animation')) {
                const asset = await manager.resolve({
                    type: 'animation',
                    id: entry.id
                });

                if (!asset) continue;

                results.push({
                    id: asset.id,
                    name: asset.name,
                    duration: asset.data?.duration ?? 0
                });
            }

            return results;
        };

        const sendData = async () => {
            if (!ready || disposed) return;

            const asset = readAsset();

            panel.webview.postMessage({
                type: 'load',
                asset,
                animations: await getAnimations()
            });
        };

        const validateGraph = data => {
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid animation graph');
            }

            const copy = structuredClone(data);

            // Support existing older Animation Scripts.
            if (!Array.isArray(copy.layers)) {
                if (
                    !Array.isArray(copy.states) ||
                    !Array.isArray(copy.transitions) ||
                    !Array.isArray(copy.variables)
                ) {
                    throw new Error(
                        'Invalid legacy animation graph'
                    );
                }

                const ids = new Set();

                for (const state of copy.states) {
                    if (
                        typeof state.id !== 'string' ||
                        !state.id ||
                        ids.has(state.id) ||
                        typeof state.name !== 'string'
                    ) {
                        throw new Error('Invalid state');
                    }

                    ids.add(state.id);
                }

                if (!ids.has(copy.entry)) {
                    throw new Error(
                        'Entry state does not exist'
                    );
                }

                for (const link of copy.transitions) {
                    if (
                        !ids.has(link.from) ||
                        !ids.has(link.to) ||
                        link.from === link.to
                    ) {
                        throw new Error(
                            'Invalid transition'
                        );
                    }
                }

                return copy;
            }

            if (!Array.isArray(copy.parameters)) {
                throw new Error(
                    'Graph parameters must be an array'
                );
            }

            const parameterTypes = new Map();

            for (const param of copy.parameters) {
                if (
                    !param ||
                    typeof param.name !== 'string' ||
                    !param.name.trim() ||
                    parameterTypes.has(param.name) ||
                    !['number', 'boolean', 'trigger']
                        .includes(param.type)
                ) {
                    throw new Error(
                        'Invalid or duplicate animation parameter'
                    );
                }

                parameterTypes.set(
                    param.name,
                    param.type
                );
            }

            const layerIds = new Set();

            if (!copy.layers.length) {
                throw new Error(
                    'Animation Script requires a layer'
                );
            }

            for (const layer of copy.layers) {
                if (
                    !layer ||
                    typeof layer.id !== 'string' ||
                    !layer.id ||
                    layerIds.has(layer.id) ||
                    !Array.isArray(layer.nodes) ||
                    !Array.isArray(layer.links)
                ) {
                    throw new Error(
                        'Invalid animation layer'
                    );
                }

                layerIds.add(layer.id);

                const nodes = new Map();
                let entryCount = 0;

                for (const node of layer.nodes) {
                    if (
                        !node ||
                        typeof node.id !== 'string' ||
                        !node.id ||
                        nodes.has(node.id) ||
                        typeof node.name !== 'string' ||
                        ![
                            'entry',
                            'state',
                            'blend',
                            'blend1d',
                            'blend2d'
                        ].includes(node.kind) ||
                        !Array.isArray(node.position) ||
                        node.position.length !== 2 ||
                        !node.position.every(Number.isFinite)
                    ) {
                        throw new Error(
                            `Invalid node in ${layer.name}`
                        );
                    }

                    nodes.set(node.id, node);

                    if (node.kind === 'entry') {
                        entryCount++;
                    }

                    const dimensions =
                        node.kind === 'blend1d' ? 1 :
                            ['blend', 'blend2d']
                                .includes(node.kind) ? 2 : 0;

                    if (!dimensions) continue;

                    const blend = node.blendSpace;

                    // A newly created blend node may remain
                    // unconfigured while the user edits it.
                    if (!blend) continue;

                    if (
                        blend.dimensions !== dimensions ||
                        !Array.isArray(blend.samples)
                    ) {
                        throw new Error(
                            `${node.name}: invalid Blend Space`
                        );
                    }

                    const axes = dimensions === 1
                        ? ['x']
                        : ['x', 'y'];

                    const references = axes.map(
                        axis => blend.parameters?.[axis]
                    );

                    const configured = references.every(
                        value =>
                            typeof value === 'string' &&
                            value.length > 0
                    );

                    if (configured) {
                        if (
                            new Set(references).size !==
                            references.length ||
                            references.some(
                                name =>
                                    parameterTypes.get(name) !==
                                    'number'
                            )
                        ) {
                            throw new Error(
                                `${node.name}: axes must reference ` +
                                'distinct numeric parameters'
                            );
                        }
                    } else if (references.some(Boolean)) {
                        throw new Error(
                            `${node.name}: configure all axes`
                        );
                    }

                    const sampleIds = new Set();

                    for (const sample of blend.samples) {
                        if (
                            !sample ||
                            typeof sample.id !== 'string' ||
                            !sample.id ||
                            sampleIds.has(sample.id) ||
                            !Number.isFinite(sample.x) ||
                            (
                                dimensions === 2 &&
                                !Number.isFinite(sample.y)
                            )
                        ) {
                            throw new Error(
                                `${node.name}: invalid blend sample`
                            );
                        }

                        sampleIds.add(sample.id);
                    }
                }

                if (entryCount !== 1) {
                    throw new Error(
                        `${layer.name}: exactly one Entry is required`
                    );
                }

                const links = new Set();
                const entry = [...nodes.values()].find(
                    node => node.kind === 'entry'
                );

                let outgoingEntryLinks = 0;

                for (const link of layer.links) {
                    if (
                        !link ||
                        typeof link.id !== 'string' ||
                        !link.id ||
                        links.has(link.id) ||
                        !nodes.has(link.from) ||
                        !nodes.has(link.to) ||
                        link.from === link.to ||
                        nodes.get(link.to).kind === 'entry'
                    ) {
                        throw new Error(
                            `${layer.name}: invalid transition`
                        );
                    }

                    links.add(link.id);


                    if (
                        link.blendDuration !== undefined &&
                        (
                            !Number.isFinite(link.blendDuration) ||
                            link.blendDuration < 0 ||
                            link.blendDuration > 10
                        )
                    ) {
                        throw new Error(
                            'Invalid crossfade duration'
                        );
                    }

                    if (
                        link.exitTime !== undefined &&
                        (
                            !Number.isFinite(link.exitTime) ||
                            link.exitTime < 0 ||
                            link.exitTime > 1
                        )
                    ) {
                        throw new Error(
                            'Exit time must be between 0 and 1'
                        );
                    }

                    if (
                        link.mode !== undefined &&
                        !['end', 'conditions', 'immediate']
                            .includes(link.mode)
                    ) {
                        throw new Error('Invalid transition mode');
                    }

                    if (
                        link.conditionMode !== undefined &&
                        !['all', 'any'].includes(link.conditionMode)
                    ) {
                        throw new Error('Invalid condition logic');
                    }

                    if (
                        link.conditions !== undefined &&
                        !Array.isArray(link.conditions)
                    ) {
                        throw new Error('Invalid transition conditions');
                    }

                    for (const condition of link.conditions ?? []) {
                        const type = parameterTypes.get(
                            condition.parameter
                        );

                        const validOperators = {
                            number: ['==', '!=', '>', '>=', '<', '<='],
                            boolean: ['==', '!='],
                            trigger: ['trigger']
                        };

                        if (
                            !type ||
                            !validOperators[type].includes(
                                condition.operator
                            )
                        ) {
                            throw new Error(
                                'Invalid transition condition'
                            );
                        }

                        if (
                            type === 'number' &&
                            !Number.isFinite(condition.value)
                        ) {
                            throw new Error(
                                'Numeric conditions require a number'
                            );
                        }

                        if (
                            type === 'boolean' &&
                            typeof condition.value !== 'boolean'
                        ) {
                            throw new Error(
                                'Boolean conditions require true or false'
                            );
                        }
                    }


                    if (link.from === entry.id) {
                        outgoingEntryLinks++;
                    }
                }

                if (outgoingEntryLinks > 1) {
                    throw new Error(
                        `${layer.name}: Entry can have only ` +
                        'one outgoing connection'
                    );
                }
            }

            return copy;
        };

        const saveGraph = async data => {
            writing = writing
                .catch(() => { })
                .then(async () => {
                    const asset = readAsset();

                    asset.data = validateGraph(data);

                    const updated =
                        JSON.stringify(asset, null, 4) + '\n';

                    const edit = new vscode.WorkspaceEdit();

                    edit.replace(
                        document.uri,
                        new vscode.Range(
                            document.positionAt(0),
                            document.positionAt(
                                document.getText().length
                            )
                        ),
                        updated
                    );

                    suppressNextChange = true;

                    const applied =
                        await vscode.workspace.applyEdit(edit);

                    if (!applied) {
                        suppressNextChange = false;
                        throw new Error(
                            'Failed to save animation graph'
                        );
                    }

                    // Keep CustomTextEditor edits inside
                    // VS Code's undo/redo system.
                    await document.save();
                });

            return writing;
        };

        const subscription =
            panel.webview.onDidReceiveMessage(
                async message => {
                    try {
                        const action = message.type === 'onGraphUpdate'
                            ? message.action
                            : message.type;

                        switch (action) {
                            case 'stateSelection':
                                console.log('[IE Animation State] Selection received:', {
                                    layerId: message.layerId,
                                    nodeId: message.node?.id,
                                    nodeName: message.node?.name,
                                    nodeKind: message.node?.kind
                                });
								this.propertiesProvider.setAnimationStateSelection({
									uri: editorUri,
									kind: message.transition
										? 'animationTransition'
										: 'animationNode',
									id: message.transition?.id ?? message.node?.id ?? null,
									layerId: message.layerId,
									value: message.transition ?? message.node,
									fromName: message.fromName,
									toName: message.toName,
									animations: message.animations ?? [],
									parameters: message.parameters ?? []
								});
                                break;
                            case 'ready':
                                ready = true;
                                await sendData();
                                break;

                            case 'save':
                                await saveGraph(message.data);

                                if (!disposed) {
                                    panel.webview.postMessage({
										type: 'saved',
										revision: message.revision
                                    });
                                }
                                break;

                            case 'refreshAnimations':
                                panel.webview.postMessage({
                                    type: 'animations',
                                    animations:
                                        await getAnimations()
                                });
                                break;
                        }
                    } catch (error) {
                        if (!disposed) {
                            panel.webview.postMessage({
                                type: 'error',
                                message: error.message
                            });
                        }
                    }
                }
            );

        const watcher =
            vscode.workspace.onDidChangeTextDocument(
                event => {
                    if (
                        event.document.uri.toString() !==
                        document.uri.toString()
                    ) {
                        return;
                    }

                    if (suppressNextChange) {
                        suppressNextChange = false;
                        return;
                    }

                    if (!disposed && ready) {
                        panel.webview.postMessage({
                            type: 'externalChange'
                        });
                    }
                }
            );

        panel.onDidDispose(() => {
            if (
                this.propertiesProvider.animationStateCanvas?.panel === panel
            ) {
                this.propertiesProvider.animationStateCanvas = null;
            }
            disposed = true;
            subscription.dispose();
            watcher.dispose();
        });
    }
}

module.exports = IEAnimationStateEditor;
