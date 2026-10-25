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
                vscode.Uri.joinPath(this.context.extensionUri, 'Shared'),
                vscode.Uri.joinPath(this.context.extensionUri, 'node_modules'),
                threeFolder
            ]
        };

        const uri = (...segments) =>
            panel.webview.asWebviewUri(
                vscode.Uri.joinPath(...segments)
            ).toString();

        const scriptUri = uri(folder, 'script.mjs');
        const sharedStyleUri = uri(
            this.context.extensionUri, 'Shared', 'ui.css'
        );
        const sharedUiUri = uri(
            this.context.extensionUri, 'Shared', 'ui.js'
        );

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

    <link rel="stylesheet" href="${sharedStyleUri}">

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

<body data-ie-editor="geometry">
    <div id="workspace">

        <div id="viewport"></div>

        <div id="toolbar" role="toolbar" aria-label="Geometry controls">
            <span id="geometry-name">Geometry</span>

            <div id="actions" class="toolbar-actions">
                <button id="wireframe" title="Wireframe" aria-label="Wireframe"><ion-icon name="cube-outline"></ion-icon></button>
                <button id="grid" title="Grid" aria-label="Grid"><ion-icon name="grid-outline"></ion-icon></button>
                <button id="fit" title="Fit Geometry" aria-label="Fit Geometry"><ion-icon name="scan-outline"></ion-icon></button>
            </div>
        </div>

        <div id="statistics"></div>

        <div id="status">Loading geometry...</div>

    </div>

    <script type="module" nonce="${nonce}" src="${sharedUiUri}"></script>
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
