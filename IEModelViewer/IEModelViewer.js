// @ts-nocheck

const vscode = require('vscode');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const IEAssetImporter = require('../IEAssetImporter');

class IEModelViewer {
    static panels = new Map();

    constructor(context) {
        this.context = context;
    }

    async openCustomDocument(uri) {
        return {
            uri,
            dispose() {}
        };
    }

    async resolveCustomEditor(document, panel) {
        const webview = panel.webview;

        const modelDirectory = vscode.Uri.joinPath(
            document.uri,
            '..'
        );

        webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this.context.extensionUri,
                modelDirectory
            ]
        };

        panel.title = path.basename(document.uri.fsPath);
        webview.html = await this.getHtml(webview);
        IEModelViewer.panels.set(document.uri.toString(), {
            panel,
            ready: false
        });

        const modelUri = webview.asWebviewUri(document.uri);

        const messageListener = webview.onDidReceiveMessage(
            async message => {
                const action = message.type === 'onAssetsUpdate'
                    ? message.action
                    : message.type;
                switch (action) {
                    case 'ready':
                        IEModelViewer.panels.get(document.uri.toString()).ready = true;
                        await webview.postMessage({
                            type: 'loadModel',
                            uri: modelUri.toString(),
                            name: path.basename(document.uri.fsPath),
                            autoImport: IEAssetImporter.consumeModelImport(document.uri)
                        });
                        break;

                    case 'saveConvertedAssets':
                        try {
                            const workspace =
                                vscode.workspace.getWorkspaceFolder(
                                    document.uri
                                ) ?? vscode.workspace.workspaceFolders?.[0];

                            if (!workspace) {
                                throw new Error(
                                    'Open an Infinite Engine project before importing assets'
                                );
                            }

                            const importer = new IEAssetImporter(
                                workspace.uri.fsPath
                            );

                            const result = await importer.saveAssets(
                                document.uri.fsPath,
                                'gltf',
                                message.assets,
                                { bundle: message.modelName }
                            );

                            await webview.postMessage({
                                type: 'conversionComplete',
                                assetCount: result.assetCount
                            });

                            vscode.window.showInformationMessage(
                                `Created ${result.assetCount} IEAssets for ${message.modelName}`
                            );
                        } catch (error) {
                            await webview.postMessage({
                                type: 'conversionError',
                                error: error.message
                            });
                        }
                        break;

                    case 'error':
                        vscode.window.showErrorMessage(
                            `Model Viewer: ${message.message}`
                        );
                        break;
                }
            }
        );

        panel.onDidDispose(() => {
            IEModelViewer.panels.delete(document.uri.toString());
            messageListener.dispose();
        });
    }

    static async import(uri) {
        const entry = this.panels.get(uri.toString());
        if (!entry) throw new Error('The model importer is not ready.');
        if (!entry.ready) return;
        IEAssetImporter.consumeModelImport(uri);
        await entry.panel.webview.postMessage({ type: 'startImport' });
    }

    async getHtml(webview) {
        const viewerDirectory = vscode.Uri.joinPath(
            this.context.extensionUri,
            'IEModelViewer'
        );

        const threeDirectory = vscode.Uri.joinPath(
            this.context.extensionUri,
            'node_modules',
            'three'
        );

        const htmlPath = vscode.Uri.joinPath(
            viewerDirectory,
            'index.html'
        );

        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                viewerDirectory,
                'script.mjs'
            )
        );

        const sharedStyleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'Shared',
                'ui.css'
            )
        );

        const sharedUiUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'Shared', 'ui.js')
        );

        const threeUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                threeDirectory,
                'build',
                'three.module.js'
            )
        );

        const addonsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                threeDirectory,
                'examples',
                'jsm'
            )
        );

        const nonce = crypto.randomBytes(16).toString('base64');

        let html = await fs.readFile(
            htmlPath.fsPath,
            'utf8'
        );

        return html
            .replaceAll('{{scriptUri}}', scriptUri.toString())
            .replaceAll('{{sharedStyleUri}}', sharedStyleUri.toString())
            .replaceAll('{{sharedUiUri}}', sharedUiUri.toString())
            .replaceAll('{{threeUri}}', threeUri.toString())
            .replaceAll('{{addonsUri}}', addonsUri.toString())
            .replaceAll('{{cspSource}}', webview.cspSource)
            .replaceAll('{{nonce}}', nonce);
    }
}

module.exports = IEModelViewer;
