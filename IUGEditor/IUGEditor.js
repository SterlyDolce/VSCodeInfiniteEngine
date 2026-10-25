// @ts-nocheck

const vscode = require('vscode');
const fs = require('fs');
const crypto = require('crypto');

class IUGEditor {
    static panels = new Map();
    static outlinerProvider = null;

    constructor(context, propertiesProvider) {
        this.context = context;
        this.propertiesProvider = propertiesProvider;
    }

    async resolveCustomTextEditor(document, panel) {
        const root = vscode.Uri.joinPath(this.context.extensionUri, 'IUGEditor');
        const resource = (...parts) => panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, ...parts)
        ).toString();

        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                root,
                vscode.Uri.joinPath(this.context.extensionUri, 'Shared'),
                vscode.Uri.joinPath(this.context.extensionUri, 'node_modules')
            ]
        };

        let html = fs.readFileSync(
            vscode.Uri.joinPath(root, 'index.html').fsPath,
            'utf8'
        );
        const replacements = {
            '{{SHARED_STYLE_URI}}': resource('Shared', 'ui.css'),
            '{{SHARED_UI_URI}}': resource('Shared', 'ui.js'),
            '{{SCRIPT_URI}}': resource('IUGEditor', 'script.mjs'),
            '{{CSP_SOURCE}}': panel.webview.cspSource,
            '{{NONCE}}': crypto.randomBytes(16).toString('hex')
        };
        for (const [key, value] of Object.entries(replacements)) {
            html = html.replaceAll(key, value);
        }
        panel.webview.html = html;
        const key = document.uri.toString();
        IUGEditor.panels.set(key, panel);

        const readAsset = () => {
            const asset = JSON.parse(document.getText());
            if (asset.type !== 'ui' || !Array.isArray(asset.data?.elements)) {
                throw new Error('Invalid User Interface IEAsset');
            }
            return asset;
        };

        const postAsset = () => panel.webview.postMessage({
            type: 'load',
            asset: readAsset()
        });

        const syncHost = async (data, selection, selectedId = null) => {
            const asset = readAsset();
            asset.data = structuredClone(data ?? asset.data);
            IUGEditor.outlinerProvider?.setUIAsset(asset, document.uri, selectedId);
            await this.propertiesProvider?.syncActiveEditor();
            this.propertiesProvider?.setGraphSelection({
                uri: key,
                selection
            });
        };

        let saving = Promise.resolve();
        const save = data => {
            saving = saving.catch(() => {}).then(async () => {
                if (!data || !Array.isArray(data.elements) || !data.canvas) {
                    throw new Error('Invalid UI document');
                }
                const asset = readAsset();
                asset.data = data;
                const edit = new vscode.WorkspaceEdit();
                edit.replace(
                    document.uri,
                    new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(document.getText().length)
                    ),
                    JSON.stringify(asset, null, 4) + '\n'
                );
                if (!await vscode.workspace.applyEdit(edit)) {
                    throw new Error('Could not update User Interface asset');
                }
                await document.save();
                await panel.webview.postMessage({ type: 'saved' });
            });
            return saving;
        };

        const messages = panel.webview.onDidReceiveMessage(async message => {
            try {
                if (message.type === 'ready') await postAsset();
                if (message.type === 'save') await save(message.data);
                if (message.type === 'selection') {
                    await syncHost(message.data, message.selection, message.selectedId);
                }
            } catch (error) {
                await panel.webview.postMessage({
                    type: 'error',
                    message: error instanceof Error ? error.message : String(error)
                });
            }
        });

        const changes = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.uri.toString() === document.uri.toString()) {
                postAsset().catch(() => {});
            }
        });
        panel.onDidDispose(() => {
            messages.dispose();
            changes.dispose();
            if (IUGEditor.panels.get(key) === panel) IUGEditor.panels.delete(key);
            this.propertiesProvider?.clearGraphSelection(key);
            if (IUGEditor.outlinerProvider?.uiAsset?.uri === key) {
                IUGEditor.outlinerProvider.clear();
            }
        });
    }
}

module.exports = IUGEditor;
