// @ts-nocheck

const vscode = require('vscode');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const {
    initializeMaterialGraph,
    compileMaterial
} = require('./MaterialGraph');

class IEMaterialEditor {
    static panels = new Map();

    constructor(context, propertiesProvider) {
        this.context = context;
        this.propertiesProvider = propertiesProvider;
    }

    async resolveCustomTextEditor(document, panel) {
        const uri = document.uri.toString();

        IEMaterialEditor.panels.set(uri, panel);

        const folder = vscode.Uri.joinPath(
            this.context.extensionUri,
            'IEMaterialEditor'
        );

        const registryPath = path.join(
            this.context.extensionPath,
            'IEMaterialEditor',
            'Nodes',
            'index.mjs'
        );

        const { materialNodeRegistry } = await import(
            pathToFileURL(registryPath).href
        );

        const definitions = materialNodeRegistry.getDefinitions();

        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                folder,
                vscode.Uri.joinPath(this.context.extensionUri, 'Shared'),
                vscode.Uri.joinPath(this.context.extensionUri, 'node_modules')
            ]
        };

        const nonce = crypto.randomBytes(16).toString('hex');

        const script = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(folder, 'script.mjs')
        );

        const sharedStyle = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'Shared', 'ui.css')
        );
        const sharedUi = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'Shared', 'ui.js')
        );

        panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">

    <meta http-equiv="Content-Security-Policy"
        content="
            default-src 'none';
            style-src ${panel.webview.cspSource};
            script-src 'nonce-${nonce}' ${panel.webview.cspSource};
            connect-src ${panel.webview.cspSource};
        ">

    <link rel="stylesheet" href="${sharedStyle}">

    <title>Infinite Material Editor</title>
</head>
<body data-ie-editor="graph-basic">
    <div id="workspace">
        <div id="toolbar" role="toolbar" aria-label="Material graph controls">
            <span id="material-name">Material</span>

            <div id="actions" class="toolbar-actions">
                <button id="compile" title="Compile" aria-label="Compile"><ion-icon name="hammer-outline"></ion-icon></button>
                <button id="fit" title="Fit Graph" aria-label="Fit Graph"><ion-icon name="scan-outline"></ion-icon></button>
                <button id="zoom-out" aria-label="Zoom out"><ion-icon name="remove"></ion-icon></button>
                <button id="zoom-in" aria-label="Zoom in"><ion-icon name="add"></ion-icon></button>
            </div>
        </div>

        <div id="graph-container">
            <canvas id="graph"></canvas>
        </div>

        <div id="status">Loading Material...</div>
    </div>

    <script type="module" nonce="${nonce}" src="${sharedUi}"></script>
    <script type="module"
        nonce="${nonce}"
        src="${script}">
    </script>
</body>
</html>`;

        let disposed = false;
        let ready = false;
        let lastSubmitted = null;
        let writing = Promise.resolve();

        const readAsset = () => {
            const asset = JSON.parse(document.getText());

            if (
                asset?.type !== 'material' ||
                !asset.data ||
                typeof asset.data !== 'object' ||
                Array.isArray(asset.data)
            ) {
                throw new Error('Invalid Material Asset');
            }

            return asset;
        };

        // Serialize document writes to avoid conflicting edits.
        const writeAsset = async mutate => {
            const task = writing.catch(() => { }).then(async () => {
                if (disposed) return false;

                const asset = readAsset();
                const changed = await mutate(asset);

                if (changed === false) return false;

                const serialized =
                    JSON.stringify(asset, null, 4) + '\n';

                if (serialized === document.getText()) {
                    return true;
                }

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
                    throw new Error('Failed to update Material Asset');
                }

                return true;
            });

            writing = task.catch(() => { });

            return task;
        };

        const sendDocument = async () => {
            if (!ready || disposed) return;

            try {
                const asset = readAsset();

                await panel.webview.postMessage({
                    type: 'load',
                    asset,
                    filename: path.basename(document.uri.fsPath)
                });
            } catch (error) {
                await panel.webview.postMessage({
                    type: 'invalid',
                    error: error.message
                });
            }
        };

        // Initial graph creation does not compile data.
        const initializeGraph = async () => {
            await writeAsset(asset => {
                if (
                    Array.isArray(asset.nodes) &&
                    asset.nodes.length > 0 &&
                    Array.isArray(asset.links)
                ) return false;

                initializeMaterialGraph(asset);
            });
        };

        const saveGraph = async message => {
            if (
                !Array.isArray(message.nodes) ||
                !Array.isArray(message.links)
            ) {
                throw new Error('Invalid graph data');
            }

            await writeAsset(asset => {
                asset.nodes = structuredClone(message.nodes);
                asset.links = structuredClone(message.links);

                // Never update asset.data here.
            });

            await panel.webview.postMessage({
                type: 'graphSaved',
                revision: message.revision ?? null
            });
        };

        const compile = async () => {
            // Finish queued saves before reading the graph.
            await writing;

            const asset = readAsset();

            // Compile a snapshot, leaving the original unchanged.
            const compiledData = compileMaterial(
                structuredClone(asset),
                materialNodeRegistry
            );

            await writeAsset(current => {
                // Prevent compiling over a graph changed
                // since the compilation snapshot.
                if (
                    JSON.stringify(current.nodes) !==
                    JSON.stringify(asset.nodes) ||
                    JSON.stringify(current.links) !==
                    JSON.stringify(asset.links)
                ) {
                    throw new Error(
                        'Graph changed during compilation. Retry Compile.'
                    );
                }

                current.data = compiledData;
            });

            await panel.webview.postMessage({
                type: 'compiled',
                data: compiledData
            });
        };

        const watcher =
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document.uri.toString() !== uri) return;

                if (event.document.getText() === lastSubmitted) {
                    lastSubmitted = null;
                    return;
                }

                lastSubmitted = null;
                void sendDocument();
            });

        const messageSubscription =
            panel.webview.onDidReceiveMessage(async message => {
                try {
                    const action = message.type === 'onGraphUpdate'
                        ? message.action
                        : message.type;
                    switch (action) {
                        case 'ready':
                            ready = true;

                            await panel.webview.postMessage({
                                type: 'definitions',
                                definitions
                            });

                            await initializeGraph();
                            await sendDocument();
                            break;

                        case 'graphSelection':
                            this.propertiesProvider?.setGraphSelection({
                                uri: document.uri.toString(),
                                selection: message.selection
                            });
                            break;

                        case 'saveGraph':
                            await saveGraph(message);
                            break;

                        case 'compile':
                            await compile();
                            break;

                        default:
                            break;
                    }
                } catch (error) {
                    console.error(
                        '[IE Material Editor]',
                        error
                    );

                    await panel.webview.postMessage({
                        type: 'error',
                        operation: message.type,
                        error: error.message
                    });
                }
            });

        panel.onDidDispose(() => {
            disposed = true;

            watcher.dispose();
            messageSubscription.dispose();

            if (IEMaterialEditor.panels.get(uri) === panel) {
                IEMaterialEditor.panels.delete(uri);
            }

            this.propertiesProvider?.clearGraphSelection(uri);
        });
    }
}

module.exports = IEMaterialEditor;
