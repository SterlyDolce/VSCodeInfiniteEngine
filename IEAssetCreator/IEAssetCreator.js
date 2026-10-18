// @ts-nocheck

const vscode = require('vscode');
const crypto = require('crypto');
const { getTemplates } = require('../IEActorAssetEditor/IEAssetTemplates');

class IEAssetCreator {
    static open(_context) {
        return new Promise(resolve => {
            const panel = vscode.window.createWebviewPanel(
                'infinite.assetCreator',
                'Create IE Asset',
                vscode.ViewColumn.Active,
                { enableScripts: true }
            );

            const nonce = crypto.randomBytes(16).toString('hex');
            let finished = false;

            const finish = value => {
                if (finished) return;
                finished = true;
                resolve(value);
                panel.dispose();
            };

            panel.webview.html = IEAssetCreator.html(
                panel.webview,
                nonce
            );

            
            panel.webview.onDidReceiveMessage(message => {
				const action = message.type === 'onAssetsUpdate'
					? message.action
					: message.type;

                if (action === 'ready') {
                    panel.webview.postMessage({
                        type: 'templates',
                        templates: getTemplates().map(t => ({
                            type: t.type,
                            label: t.label,
                            description: t.description,
                            icon: t.icon
                        }))
                    });
                }

                if (action === 'create') {
                    const template = getTemplates().find(
                        t => t.type === message.assetType
                    );

                    const name = String(message.name ?? '').trim();

                    if (!template || !name || /[\\/]/.test(name)) {
                        panel.webview.postMessage({
                            type: 'error',
                            message: 'Choose a template and enter a valid name.'
                        });
                        return;
                    }

                    finish({ type: template.type, name });
                }

                if (action === 'cancel') {
                    finish(null);
                }
            });

            panel.onDidDispose(() => {
                if (!finished) finish(null);
            });
        });
    }

    static html(webview, nonce) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy"
content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
    * { box-sizing: border-box; }

    body {
        margin: 0;
        padding: 28px;
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        font-family: var(--vscode-font-family);
    }

    main {
        max-width: 860px;
        margin: 0 auto;
    }

    h1 {
        font-size: 22px;
        font-weight: 600;
        margin: 0 0 8px;
    }

    .subtitle {
        color: var(--vscode-descriptionForeground);
        font-size: 13px;
        margin-bottom: 24px;
    }

    .grid {
        display: grid;
        grid-template-columns: repeat(
            auto-fit, minmax(185px, 1fr)
        );
        gap: 12px;
        margin-bottom: 24px;
    }

    .asset-card {
        text-align: left;
        min-height: 130px;
        padding: 16px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 8px;
        background: var(--vscode-sideBar-background);
        color: var(--vscode-foreground);
        cursor: pointer;
        font: inherit;
    }

    .asset-card:hover {
        border-color: var(--vscode-focusBorder);
        background: var(--vscode-list-hoverBackground);
    }

    .asset-card.selected {
        border: 2px solid var(--vscode-focusBorder);
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }

    .asset-icon {
        font-size: 24px;
        margin-bottom: 12px;
    }

    .asset-title {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 6px;
    }

    .asset-description {
        font-size: 12px;
        opacity: .7;
    }

    .footer {
        border-top: 1px solid var(--vscode-panel-border);
        padding-top: 20px;
    }

    label {
        display: block;
        margin-bottom: 8px;
        font-size: 12px;
    }

    input {
        width: 100%;
        padding: 9px 12px;
        border: 1px solid var(--vscode-input-border);
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        font: inherit;
        outline: none;
    }

    input:focus {
        border-color: var(--vscode-focusBorder);
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 18px;
    }

    .actions button {
        border: 0;
        padding: 9px 18px;
        cursor: pointer;
        font: inherit;
    }

    #cancel {
        color: var(--vscode-button-secondaryForeground);
        background: var(--vscode-button-secondaryBackground);
    }

    #create {
        color: var(--vscode-button-foreground);
        background: var(--vscode-button-background);
    }

    #create:disabled {
        opacity: .5;
        cursor: not-allowed;
    }

    #error {
        color: var(--vscode-errorForeground);
        min-height: 18px;
        font-size: 12px;
        margin-top: 8px;
    }
</style>
</head>

<body>
<main>
    <h1>Create IE Asset</h1>
    <div class="subtitle">
        Choose an asset template to get started.
    </div>

    <div id="grid" class="grid"></div>

    <div class="footer">
        <label for="name">Asset Name</label>
        <input id="name" placeholder="Enter asset name">

        <div id="error"></div>

        <div class="actions">
            <button id="cancel">Cancel</button>
            <button id="create" disabled>Create Asset</button>
        </div>
    </div>
</main>

<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const grid = document.getElementById('grid');
    const nameInput = document.getElementById('name');
    const createButton = document.getElementById('create');
    const error = document.getElementById('error');

    let selected = null;

    const icons = {
        script: '◇',
        actor: '⬡',
        geometry: '▱',
        material: '◈',
        texture: '▧',
        skeleton: '♧',
        animation: '▶',
        animationState: '◎'
    };

    function updateCreateButton() {
        createButton.disabled =
            !selected || !nameInput.value.trim();
    }

    function renderTemplates(templates) {
        grid.replaceChildren();

        for (const template of templates) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'asset-card';

            const icon = document.createElement('div');
            icon.className = 'asset-icon';
            icon.textContent = icons[template.type] ?? '◇';

            const title = document.createElement('div');
            title.className = 'asset-title';
            title.textContent = template.label;

            const description = document.createElement('div');
            description.className = 'asset-description';
            description.textContent = template.description;

            card.append(icon, title, description);

            card.addEventListener('click', () => {
                selected = template.type;
                error.textContent = '';

                grid.querySelectorAll('.asset-card')
                    .forEach(item => {
                        item.classList.remove('selected');
                        item.setAttribute('aria-pressed', 'false');
                    });

                card.classList.add('selected');
                card.setAttribute('aria-pressed', 'true');

                if (!nameInput.value.trim()) {
                    nameInput.value = template.label
                        .replace(/\\s+/g, '');
                }

                updateCreateButton();
            });

            grid.appendChild(card);
        }
    }

    window.addEventListener('message', event => {
        const message = event.data;

        if (message.type === 'templates') {
            renderTemplates(message.templates ?? []);
        }

        if (message.type === 'error') {
            error.textContent = message.message;
        }
    });

    nameInput.addEventListener('input', updateCreateButton);

    createButton.addEventListener('click', () => {
        if (!selected || !nameInput.value.trim()) return;

        vscode.postMessage({
            type: 'onAssetsUpdate',
            action: 'create',
            assetType: selected,
            name: nameInput.value.trim()
        });
    });

    document.getElementById('cancel')
        .addEventListener('click', () => {
            vscode.postMessage({ type: 'onAssetsUpdate', action: 'cancel' });
        });

    vscode.postMessage({ type: 'onAssetsUpdate', action: 'ready' });
</script>
</body>
</html>`;
    }
}

module.exports = IEAssetCreator;
