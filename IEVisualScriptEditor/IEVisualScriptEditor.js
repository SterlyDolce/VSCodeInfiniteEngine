// @ts-nocheck

const vscode = require('vscode');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const IEAssetManager = require('../IEAssetManager');
const IETypeRegistry = require('../Types/IETypeRegistry');


class IEVisualScriptEditor {
	static outlinerProvider = null;

    constructor(context, propertiesProvider) {
        this.context = context;
        this.propertiesProvider = propertiesProvider;
    }

    async resolveCustomTextEditor(document, panel) {

        const registryPath = path.join(
            this.context.extensionPath,
            'IESceneEditor',
            'Nodes',
            'index.mjs'
        );


        const { nodeRegistry } = await import(
            pathToFileURL(registryPath).href
        );

        const registryModulePath = path.join(
            this.context.extensionPath,
            'IESceneEditor',
            'IENodeRegistry.mjs'
        );

        const { IENodeRegistry } = await import(
            pathToFileURL(registryModulePath).href
        );

        const animationNodesPath = path.join(
            this.context.extensionPath,
            'IESceneEditor',
            'Nodes',
            'IEAnimationStateNodes.mjs'
        );

        const { registeranimationStateNodes } = await import(
            pathToFileURL(animationNodesPath).href
        );

        const createProjectRegistry = async () => {
            const registry = new IENodeRegistry();

            // Copy built-in node definitions.
            for (const definition of nodeRegistry.getAll()) {
                registry.register(
                    definition.type,
                    definition
                );
            }

            const workspace =
                vscode.workspace.getWorkspaceFolder(
                    document.uri
                );

            if (!workspace) {
                return registry;
            }

            const manager = new IEAssetManager(
                workspace.uri.fsPath
            );

            await manager.scan();

            await registeranimationStateNodes(
                manager,
                registry
            );

            return registry;
        };


        let projectRegistry = null;

        const sendDefinitions = async () => {
            const registry = await createProjectRegistry();

            // Store the same registry used to generate
            // nodes in the Visual Script Editor.
            projectRegistry = registry;

            console.log(
                '[IE] Registered Animation Script nodes:',
                registry.getAll()
                    .filter(node =>
                        node.type.startsWith('animationstate.asset:')
                    )
                    .map(node => node.type)
            );

            const definitions = registry.getDefinitions();

            await panel.webview.postMessage({
                type: 'definitions',
                definitions
            });

            return definitions;
        };




        const sendActorAssets = async () => {
            try {
                const workspace = vscode.workspace.getWorkspaceFolder(document.uri);

                if (!workspace) {
                    await panel.webview.postMessage({
                        type: 'actorAssets',
                        assets: []
                    });
                    return;
                }

                const manager = new IEAssetManager(workspace.uri.fsPath);
                await manager.scan();

                // const allAssets = manager.getAssets();
                const actors = manager.getAssets('actor');

                const actorAssets = await Promise.all(
                    actors.map(async actor => {
                        const fullAsset = await manager.getAsset(actor.id);

                        return {
                            id: actor.id,
                            name: actor.name,
                            components: (fullAsset?.data?.components ?? []).map(c => ({
                                id: c.id,
                                name: c.name ?? c.type,
                                type: c.type
                            }))
                        };
                    })
                );

                await panel.webview.postMessage({
                    type: 'actorAssets',
                    assets: actorAssets
                });
            } catch (error) {
                console.error('[IE] Failed to load Actor Assets:', error);

                await panel.webview.postMessage({
                    type: 'actorAssets',
                    assets: []
                });
            }
        };


        const folder = vscode.Uri.joinPath(
            this.context.extensionUri,
            'IEVisualScriptEditor'
        );

        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [folder]
        };

        IEVisualScriptEditor.panels ??= new Map();

        const uriKey = document.uri.toString();
        IEVisualScriptEditor.panels.set(uriKey, panel);

        const nonce = crypto.randomBytes(16).toString('base64');
        const js = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(folder, 'script.mjs')
        );
        const css = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(folder, 'style.css')
        );
        const csp = panel.webview.cspSource;

        panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${csp}; script-src 'nonce-${nonce}' ${csp};">
    <link rel="stylesheet" href="${css}">
    <title>Infinite Graph Editor</title>
</head>

<body>
    <div id="workspace">
        <canvas id="graph"></canvas>

        <div id="toolbar">
    <div id="actions"><button id="back-main" hidden>← Main</button></div>
    <span id="graph-title">Main Graph</span>
    <div id="actions">
    <span></span>
    <button id="fit">Fit</button>
    <button id="zoom-out">−</button>
    <button id="zoom-in">+</button></div>
</div>

        <div id="node-menu" class="popup" hidden>
            <input id="menu-search" placeholder="Search nodes..." />
            <div id="menu-items"></div>
        </div>

        <div id="status">Loading...</div>
        <div id="zoom-label">100%</div>
    </div>

    <script type="module" nonce="${nonce}" src="${js}"></script>
</body>

</html>`;

        let lastSubmitted = null;

        const sendDocument = () => {
            try {
                const asset = JSON.parse(document.getText());

                if (
                    asset.type !== 'script' ||
                    !Array.isArray(asset.data?.nodes) ||
                    !Array.isArray(asset.data?.links) ||
                    !Array.isArray(asset.data?.variables)
                ) {
                    throw new Error('Not a valid visual script asset');
                }

                panel.webview.postMessage({
                    type: 'load',
                    asset,
                    filename: path.basename(document.uri.fsPath)
                });
            } catch (error) {
                panel.webview.postMessage({
                    type: 'invalid',
                    error: error.message
                });
            }
        };

        const watcher = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.uri.toString() !== document.uri.toString()) {
                return;
            }

            if (event.document.getText() === lastSubmitted) {
                lastSubmitted = null;
                return;
            }

            lastSubmitted = null;
            sendDocument();
        });


        const workspace =
            vscode.workspace.getWorkspaceFolder(
                document.uri
            );

        let animationAssetWatcher = null;
        let refreshTimer = null;

        if (workspace) {
            const pattern = new vscode.RelativePattern(
                workspace,
                'Assets/**/*.ieasset'
            );

            animationAssetWatcher =
                vscode.workspace.createFileSystemWatcher(
                    pattern
                );

            const refresh = () => {
                clearTimeout(refreshTimer);

                refreshTimer = setTimeout(async () => {
                    try {
                        await sendDefinitions();
                    } catch (error) {
                        console.error(
                            '[IE] Animation node refresh failed:',
                            error
                        );
                    }
                }, 250);
            };

            animationAssetWatcher.onDidCreate(
                refresh,
                null,
                []
            );

            animationAssetWatcher.onDidChange(
                refresh,
                null,
                []
            );

            animationAssetWatcher.onDidDelete(
                refresh,
                null,
                []
            );
        }


        panel.onDidDispose(() => {
            watcher.dispose();

            if (IEVisualScriptEditor.panels?.get(uriKey) === panel) {
                IEVisualScriptEditor.panels.delete(uriKey);
            }

            clearTimeout(refreshTimer);
            animationAssetWatcher?.dispose();

            this.propertiesProvider?.clearGraphSelection(uriKey);
        });

        panel.webview.onDidReceiveMessage(async message => {
			if (message.type === 'onGraphUpdate') {
				message = { ...message, type: message.action };
			}


            if (message.type === 'nodeLifecycle') {
                const {
                    event,
                    node,
                    input,
                    output,
                    sourceNode,
                    functionId,
                    sequence
                } = message;

                if (
                    !['onConnect', 'onDisconnect'].includes(event) ||
                    !node?.id ||
                    !node?.type ||
                    !input?.id ||
                    !output?.id ||
                    input.direction !== 'input' ||
                    output.direction !== 'output'
                ) return;

                try {
                    // Only operate on the snapshot from this event.
                    // Do not mutate the saved document here.
                    const updatedNode = structuredClone(node);


                    const registry = projectRegistry ?? nodeRegistry;

                    if (!registry.has(updatedNode.type)) {
                        console.warn(
                            '[IE Node Lifecycle] Unknown node type:',
                            updatedNode.type
                        );
                    } else {
                        registry.dispatch(
                            updatedNode.type,
                            event,
                            {
                                node: updatedNode,

                                input: updatedNode.pins?.find(
                                    pin => pin.id === input.id
                                ),

                                output: structuredClone(output),

                                sourceNode: sourceNode
                                    ? structuredClone(sourceNode)
                                    : null
                            }
                        );
                    }


                    await panel.webview.postMessage({
                        type: 'nodeUpdated',
                        nodeId: updatedNode.id,
                        functionId: functionId ?? null,
                        sequence,
                        node: updatedNode
                    });
                } catch (error) {
                    console.error('[IE Node Lifecycle]', error);

                    await panel.webview.postMessage({
                        type: 'nodeLifecycleError',
                        error: error.message
                    });
                }

                return;
            }

            if (message.type === 'graphSelection') {
                this.propertiesProvider.setGraphSelection({
                    uri: document.uri.toString(),
                    selection: message.selection
                });
                return;
            }

			if (message.type === 'scriptItemDrop') {
				console.log('[IE Script DnD] Extension received graph drop', message);

				const item = message.item ??
					IEVisualScriptEditor.outlinerProvider?.getActiveScriptDrag(
						document.uri.toString()
					);
				const position = message.position;

				if (
					item?.uri !== document.uri.toString() ||
					!['variable', 'function'].includes(item.kind) ||
					typeof item.id !== 'string' ||
					!Number.isFinite(position?.x) ||
					!Number.isFinite(position?.y)
				) {
					console.warn('[IE Script DnD] Drop validation failed', {
						item,
						position,
						expectedUri: document.uri.toString()
					});
					return;
				}

				console.log('[IE Script DnD] Drop validated', { item, position });

				let current;

				try {
					current = JSON.parse(document.getText());
				} catch (error) {
					console.error('[IE Script DnD] Could not parse script asset', error);
					return;
				}

				if (current.type !== 'script') return;

				if (item.kind === 'variable') {
					const variable = current.data?.variables?.find(
						entry => entry.id === item.id
					);

					if (!variable) {
						console.warn('[IE Script DnD] Variable UUID not found', item.id);
						return;
					}

					await panel.webview.postMessage({
						type: 'createDroppedScriptNode',
						kind: 'variable',
						id: variable.id,
						position
					});
					console.log('[IE Script DnD] Sent variable menu request to graph');
					return;
				}

				const fn = current.data?.functions?.find(
					entry => entry.id === item.id
				);

				if (!fn) {
					console.warn('[IE Script DnD] Function UUID not found', item.id);
					return;
				}

				await panel.webview.postMessage({
					type: 'createDroppedScriptNode',
					kind: 'function',
					id: fn.id,
					position
				});
				console.log('[IE Script DnD] Sent function call creation to graph');
				return;
			}

            if (message.type === 'ready') {
                await sendDefinitions();

                await panel.webview.postMessage({
                    type: 'dataTypes',
                    types: IETypeRegistry.getDefinitions()
                });

                await sendActorAssets();

                sendDocument();
                return;
            }

            if (message.type !== 'save') return;

            try {
                const asset = message.asset;

                if (
                    asset?.type !== 'script' ||
                    !Array.isArray(asset.data?.nodes) ||
                    !Array.isArray(asset.data?.links) ||
                    !Array.isArray(asset.data?.variables)
                ) {
                    throw new Error('Invalid visual script graph');
                }

                const original = JSON.parse(document.getText());

                if (
                    original.type !== 'script' ||
                    original.id !== asset.id
                ) {
                    throw new Error('Asset identity cannot change');
                }


                const graphs = [
                    asset.data,
                    ...(asset.data.functions ?? [])
                ];

                for (const graph of graphs) {
                    for (const variable of graph.variables ?? []) {
                        const typedValue = IETypeRegistry.create(
                            variable.type,
                            variable.value
                        );

                        variable.value = typedValue.getValue();
                    }
                }

                const updated = JSON.stringify(asset, null, 4) + '\n';


                if (updated === document.getText()) {
                    panel.webview.postMessage({
                        type: 'saved',
                        revision: message.revision
                    });
                    return;
                }

                const edit = new vscode.WorkspaceEdit();
                const end = document.positionAt(document.getText().length);

                edit.replace(
                    document.uri,
                    new vscode.Range(0, 0, end.line, end.character),
                    updated
                );

                lastSubmitted = updated;

                if (!await vscode.workspace.applyEdit(edit)) {
                    throw new Error('Failed to update document');
                }

                panel.webview.postMessage({
                    type: 'saved',
                    revision: message.revision
                });
            } catch (error) {
                lastSubmitted = null;

                panel.webview.postMessage({
                    type: 'saveError',
                    error: error.message
                });
            }
        });
    }


    static async openFunction(uri, functionId) {
        const key = typeof uri === 'string'
            ? uri
            : uri.toString();

        const panel = IEVisualScriptEditor.panels?.get(key);

        if (!panel) {
            vscode.window.showWarningMessage(
                'The Visual Script Editor is not open.'
            );
            return;
        }

        panel.reveal();

        await panel.webview.postMessage({
            type: 'openFunction',
            id: functionId
        });
    }

	static async armScriptItem(uri, item) {
		const key = typeof uri === 'string' ? uri : uri.toString();
		const panel = IEVisualScriptEditor.panels?.get(key);
		if (!panel) return false;

		await panel.webview.postMessage({
			type: 'armScriptItemDrop',
			item
		});
		return true;
	}

}

module.exports = IEVisualScriptEditor;
