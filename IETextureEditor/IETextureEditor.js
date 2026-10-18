// @ts-nocheck

const vscode = require('vscode');
const crypto = require('crypto');

class IETextureEditor {
    constructor(context, propertiesProvider) {
        this.context = context;
        this.propertiesProvider = propertiesProvider;
    }

    async resolveCustomTextEditor(document, panel) {
        const folder = vscode.Uri.joinPath(
            this.context.extensionUri,
            'IETextureEditor'
        );

        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [folder]
        };

        const resource = filename =>
            panel.webview.asWebviewUri(
                vscode.Uri.joinPath(folder, filename)
            ).toString();

        const nonce = crypto.randomBytes(16).toString('hex');

        panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">

    <meta name="viewport"
        content="width=device-width, initial-scale=1">

    <meta http-equiv="Content-Security-Policy"
        content="
            default-src 'none';
            script-src 'nonce-${nonce}' ${panel.webview.cspSource};
            style-src ${panel.webview.cspSource};
            img-src data:;
        ">

    <link rel="stylesheet" href="${resource('style.css')}">

    <title>Infinite Texture Editor</title>
</head>
<body>
    <div id="workspace">

        <div id="toolbar">
            <span id="texture-name">Texture</span>

            <div class="toolbar-actions">
                <select id="channel" title="Preview channels">
                    <option value="rgba">RGBA</option>
                    <option value="rgb">RGB</option>
                    <option value="r">Red</option>
                    <option value="g">Green</option>
                    <option value="b">Blue</option>
                    <option value="a">Alpha</option>
                </select>

                <button id="checker" class="active">
                    Checker
                </button>

                <button id="fit">Fit</button>
                <button id="actual">1:1</button>
                <button id="zoom-out">−</button>
                <button id="zoom-in">+</button>
            </div>
        </div>

        <div id="viewport" class="checkerboard">
            <canvas id="preview"></canvas>
        </div>

        <div id="status">Loading texture...</div>

        <div id="information">
            <span id="resolution">—</span>
            <span id="format">—</span>
            <span id="zoom-label">100%</span>
        </div>

    </div>

    <script
        type="module"
        nonce="${nonce}"
        src="${resource('script.mjs')}">
    </script>
</body>
</html>`;

        let ready = false;
        let disposed = false;

        const sendTexture = async () => {
            if (!ready || disposed) return;

            try {
                const asset = JSON.parse(document.getText());

                if (
                    asset?.type !== 'texture' ||
                    typeof asset.data?.image !== 'string' ||
                    !asset.data.image.startsWith('data:image/')
                ) {
                    throw new Error('Unsupported Texture Asset format');
                }

                await panel.webview.postMessage({
                    type: 'load',
                    asset
                });
            } catch (error) {
                await panel.webview.postMessage({
                    type: 'error',
                    error: error.message
                });
            }
        };

        const messages = panel.webview.onDidReceiveMessage(
            async message => {
                const action = message.type === 'onAssetsUpdate'
                    ? message.action
                    : message.type;

                if (action === 'ready') {
                    ready = true;
                    await sendTexture();
                }
            }
        );

        const watcher =
            vscode.workspace.onDidChangeTextDocument(event => {
                if (
                    event.document.uri.toString() ===
                    document.uri.toString()
                ) {
                    void sendTexture();
                }
            });

        panel.onDidDispose(() => {
            disposed = true;
            messages.dispose();
            watcher.dispose();
        });
    }
}

module.exports = IETextureEditor;
