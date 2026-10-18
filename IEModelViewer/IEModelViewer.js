// @ts-nocheck

const vscode = require('vscode');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const IEAssetManager = require('../IEAssetManager');

class IEModelViewer {
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

        const modelUri = webview.asWebviewUri(document.uri);

        const messageListener = webview.onDidReceiveMessage(
            async message => {
                const action = message.type === 'onAssetsUpdate'
                    ? message.action
                    : message.type;
                switch (action) {
                    case 'ready':
                        await webview.postMessage({
                            type: 'loadModel',
                            uri: modelUri.toString(),
                            name: path.basename(document.uri.fsPath)
                        });
                        break;

                    case 'saveConvertedAssets':
                        try {
                            const workspace =
                                vscode.workspace.getWorkspaceFolder(
                                    document.uri
                                );

                            if (!workspace) {
                                throw new Error(
                                    'Model must be inside a project workspace'
                                );
                            }

                            const assetManager = new IEAssetManager(
                                workspace.uri.fsPath
                            );

                            await assetManager.scan();

                            const result =
                                await assetManager.saveConvertedAssets(
                                    message.modelName,
                                    message.assets
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
            messageListener.dispose();
        });
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

        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                viewerDirectory,
                'style.css'
            )
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
            .replaceAll('{{styleUri}}', styleUri.toString())
            .replaceAll('{{threeUri}}', threeUri.toString())
            .replaceAll('{{addonsUri}}', addonsUri.toString())
            .replaceAll('{{cspSource}}', webview.cspSource)
            .replaceAll('{{nonce}}', nonce);
    }
}

module.exports = IEModelViewer;
