// @ts-nocheck

const vscode = require('vscode');
const crypto = require('crypto');

class IEProjectEditor {
    static open() {
        return new Promise(resolve => {
            const workspace = vscode.workspace.workspaceFolders?.[0];
            const panel = vscode.window.createWebviewPanel(
                'infinite.projectEditor',
                'Create Infinite Project',
                vscode.ViewColumn.Active,
                { enableScripts: true }
            );
            const nonce = crypto.randomBytes(16).toString('hex');
            let finished = false;
            let selectedFolder = workspace?.uri ?? null;

            const finish = value => {
                if (finished) return;
                finished = true;
                resolve(value);
                panel.dispose();
            };

            const sendState = () => panel.webview.postMessage({
                type: 'state',
                workspace: workspace
                    ? {
                        name: workspace.name,
                        path: workspace.uri.fsPath
                    }
                    : null,
                selectedFolder: selectedFolder?.fsPath ?? ''
            });

            panel.webview.html = IEProjectEditor.html(nonce);

            panel.webview.onDidReceiveMessage(async message => {
                switch (message.type) {
                    case 'ready':
                        await sendState();
                        break;

                    case 'browse': {
                        const folders = await vscode.window.showOpenDialog({
                            title: 'Choose Project Location',
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            openLabel: 'Select Folder',
                            defaultUri: selectedFolder ?? workspace?.uri
                        });

                        if (folders?.[0]) {
                            selectedFolder = folders[0];
                            await panel.webview.postMessage({
                                type: 'folder',
                                path: selectedFolder.fsPath
                            });
                        }
                        break;
                    }

                    case 'create': {
                        const name = String(message.name ?? '').trim();
                        const useCurrentFolder = message.useCurrentFolder === true;

                        if (
                            !name ||
                            name === '.' ||
                            name === '..' ||
                            /[\\/]/.test(name)
                        ) {
                            await panel.webview.postMessage({
                                type: 'error',
                                message: 'Enter a valid project name without slashes.'
                            });
                            return;
                        }

                        if (useCurrentFolder && !workspace) {
                            await panel.webview.postMessage({
                                type: 'error',
                                message: 'No workspace folder is currently open.'
                            });
                            return;
                        }

                        const parent = useCurrentFolder
                            ? workspace.uri
                            : selectedFolder;

                        if (!parent) {
                            await panel.webview.postMessage({
                                type: 'error',
                                message: 'Choose a location for the project.'
                            });
                            return;
                        }

                        const projectUri = useCurrentFolder
                            ? parent
                            : vscode.Uri.joinPath(parent, name);

                        finish({
                            projectName: name,
                            projectUri,
                            shouldOpenProject:
                                message.openAfterCreate === true &&
                                projectUri.fsPath !== workspace?.uri.fsPath
                        });
                        break;
                    }

                    case 'cancel':
                        finish(null);
                        break;
                }
            });

            panel.onDidDispose(() => {
                if (!finished) finish(null);
            });
        });
    }

    static html(nonce) {
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
        padding: 32px;
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        font-family: var(--vscode-font-family);
    }
    main { max-width: 760px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 24px; font-weight: 600; }
    .subtitle {
        margin: 0 0 28px;
        color: var(--vscode-descriptionForeground);
        line-height: 1.5;
    }
    .section {
        margin-bottom: 22px;
        padding: 20px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 8px;
        background: var(--vscode-sideBar-background);
    }
    label { display: block; margin-bottom: 8px; font-size: 12px; font-weight: 600; }
    input[type="text"] {
        width: 100%;
        padding: 9px 11px;
        border: 1px solid var(--vscode-input-border);
        outline: none;
        color: var(--vscode-input-foreground);
        background: var(--vscode-input-background);
        font: inherit;
    }
    input[type="text"]:focus { border-color: var(--vscode-focusBorder); }
    .choice { display: flex; gap: 10px; align-items: flex-start; margin: 10px 0; }
    .choice label { margin: 0; font-size: 13px; font-weight: 400; cursor: pointer; }
    .choice small { display: block; margin-top: 3px; color: var(--vscode-descriptionForeground); }
    .folder-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 14px; }
    button {
        padding: 9px 15px;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        color: var(--vscode-button-foreground);
        background: var(--vscode-button-background);
        font: inherit;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
        color: var(--vscode-button-secondaryForeground);
        background: var(--vscode-button-secondaryBackground);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .preview {
        margin-top: 12px;
        color: var(--vscode-descriptionForeground);
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
        overflow-wrap: anywhere;
    }
    .error { min-height: 20px; margin-top: 12px; color: var(--vscode-errorForeground); }
    .footer { display: flex; justify-content: flex-end; gap: 8px; }
    .hidden { display: none; }
</style>
</head>
<body>
<main>
    <h1>Create Infinite Project</h1>
    <p class="subtitle">Configure the project and choose where its files will be created.</p>

    <section class="section">
        <label for="name">Project Name</label>
        <input id="name" type="text" placeholder="MyProject" spellcheck="false">
    </section>

    <section class="section">
        <label>Location</label>
        <div id="current-choice" class="choice hidden">
            <input id="use-current" type="radio" name="location" value="current">
            <label for="use-current">
                Use current workspace folder
                <small id="workspace-path"></small>
            </label>
        </div>
        <div class="choice">
            <input id="use-new" type="radio" name="location" value="new" checked>
            <label for="use-new">
                Create a new project folder
                <small>The project name will be used as the folder name.</small>
            </label>
        </div>
        <div id="folder-controls" class="folder-row">
            <input id="folder" type="text" readonly placeholder="Choose a parent folder">
            <button id="browse" class="secondary" type="button">Browse…</button>
        </div>
        <div id="preview" class="preview"></div>
    </section>

    <section class="section">
        <div class="choice">
            <input id="open-after" type="checkbox" checked>
            <label for="open-after">Open the project after creation</label>
        </div>
        <div id="error" class="error" role="alert"></div>
    </section>

    <div class="footer">
        <button id="cancel" class="secondary" type="button">Cancel</button>
        <button id="create" type="button">Create Project</button>
    </div>
</main>

<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const name = document.getElementById('name');
    const folder = document.getElementById('folder');
    const preview = document.getElementById('preview');
    const error = document.getElementById('error');
    const useCurrent = document.getElementById('use-current');
    const useNew = document.getElementById('use-new');
    const folderControls = document.getElementById('folder-controls');
    let workspace = null;

    function joinPath(parent, child) {
        if (!parent) return child;
        const separator = parent.includes('\\\\') ? '\\\\' : '/';
        return parent.replace(/[\\\\/]$/, '') + separator + child;
    }

    function update() {
        const current = useCurrent.checked && workspace;
        folderControls.classList.toggle('hidden', Boolean(current));
        preview.textContent = current
            ? 'Project path: ' + workspace.path
            : 'Project path: ' + joinPath(folder.value, name.value.trim() || 'MyProject');
        error.textContent = '';
    }

    window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'state') {
            workspace = message.workspace;
            folder.value = message.selectedFolder || '';
            if (workspace) {
                document.getElementById('current-choice').classList.remove('hidden');
                document.getElementById('workspace-path').textContent = workspace.path;
                name.value = workspace.name;
                useCurrent.checked = true;
            } else {
                name.value = 'MyProject';
                useNew.checked = true;
            }
            update();
            name.focus();
            name.select();
        } else if (message.type === 'folder') {
            folder.value = message.path;
            useNew.checked = true;
            update();
        } else if (message.type === 'error') {
            error.textContent = message.message;
        }
    });

    name.addEventListener('input', update);
    useCurrent.addEventListener('change', update);
    useNew.addEventListener('change', update);
    document.getElementById('browse').addEventListener('click', () => {
        vscode.postMessage({ type: 'browse' });
    });
    document.getElementById('cancel').addEventListener('click', () => {
        vscode.postMessage({ type: 'cancel' });
    });
    document.getElementById('create').addEventListener('click', () => {
        vscode.postMessage({
            type: 'create',
            name: name.value,
            useCurrentFolder: useCurrent.checked,
            openAfterCreate: document.getElementById('open-after').checked
        });
    });
    name.addEventListener('keydown', event => {
        if (event.key === 'Enter') document.getElementById('create').click();
    });

    vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
    }
}

module.exports = IEProjectEditor;
