// @ts-nocheck

const vscode = require('vscode');
const crypto = require('crypto');

class IEGeometryEditor {
    constructor(context, propertiesProvider) {
        this.context = context;
        this.propertiesProvider = propertiesProvider;
    }

    async resolveCustomTextEditor(document, panel) {
        const folder = vscode.Uri.joinPath(
            this.context.extensionUri,
            'IEGeometryEditor'
        );

        const threeFolder = vscode.Uri.joinPath(
            this.context.extensionUri,
            'node_modules',
            'three'
        );

        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                folder,
                threeFolder
            ]
        };

        const uri = (...segments) =>
            panel.webview.asWebviewUri(
                vscode.Uri.joinPath(...segments)
            ).toString();

        const scriptUri = uri(folder, 'script.mjs');
        const styleUri = uri(folder, 'style.css');

        const threeUri = uri(
            threeFolder,
            'build',
            'three.module.js'
        );

        const addonsUri = uri(
            threeFolder,
            'examples',
            'jsm'
        ) + '/';

        const nonce = crypto.randomBytes(16).toString('hex');

        panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">

    <meta name="viewport"
        content="width=device-width, initial-scale=1.0">

    <meta http-equiv="Content-Security-Policy"
        content="
            default-src 'none';
            style-src ${panel.webview.cspSource};
            script-src 'nonce-${nonce}' ${panel.webview.cspSource};
        ">

    <link rel="stylesheet" href="${styleUri}">

    <script type="importmap" nonce="${nonce}">
    {
        "imports": {
            "three": "${threeUri}",
            "three/addons/": "${addonsUri}"
        }
    }
    </script>

    <title>Infinite Geometry Editor</title>
</head>

<body>
    <div id="workspace">

        <div id="viewport"></div>

        <div id="toolbar">
            <span id="geometry-name">Geometry</span>

            <div class="toolbar-actions">
                <button id="wireframe">Wireframe</button>
                <button id="grid">Grid</button>
                <button id="fit">Fit</button>
            </div>
        </div>

        <div id="statistics"></div>

        <div id="status">Loading geometry...</div>

    </div>

    <script
        type="module"
        nonce="${nonce}"
        src="${scriptUri}">
    </script>
</body>
</html>`;

        let ready = false;
        let disposed = false;

        const sendGeometry = async () => {
            if (!ready || disposed) return;

            try {
                const asset = JSON.parse(document.getText());

                if (
                    asset.type !== 'geometry' ||
                    asset.data?.type !== 'buffer'
                ) {
                    throw new Error(
                        'Unsupported Geometry Asset format'
                    );
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
                switch (action) {
                    case 'ready':
                        ready = true;
                        await sendGeometry();
                        break;
                }
            }
        );

        const watcher =
            vscode.workspace.onDidChangeTextDocument(event => {
                if (
                    event.document.uri.toString() ===
                    document.uri.toString()
                ) {
                    void sendGeometry();
                }
            });

        panel.onDidDispose(() => {
            disposed = true;
            watcher.dispose();
            messages.dispose();
        });
    }
}

module.exports = IEGeometryEditor;
