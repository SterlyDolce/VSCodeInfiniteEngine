// @ts-nocheck

const vscode = require('vscode');
const fs = require('fs/promises');
const path = require('path');

class IEProjectManagerProvider {
    static viewType = 'infinite.projectManager';

    constructor(context) {
        this.context = context;
        this.extensionUri = context.extensionUri;
        this.view = null;
    }

    resolveWebviewView(webviewView) {
        this.view = webviewView;

        const webview = webviewView.webview;

        webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'images')
            ]
        };

        webview.html = this.getHtml(webview);

        const subscription = webview.onDidReceiveMessage(
            async (message) => {
                try {
					const action = message.type === 'onAssetsUpdate'
						? message.action
						: message.command;
					switch (action) {
                        case 'createProject':
                            await vscode.commands.executeCommand(
                                'infinite.createProject'
                            );
                            break;

                        case 'openProject':
                            await this.openProject();
                            break;

                        case 'openRecent':
                            await this.openRecentProject(
                                message.path
                            );
                            break;

                        case 'removeRecent':
                            await this.removeRecentProject(
                                message.path
                            );
                            break;

                        case 'refresh':
                            await this.refresh();
                            break;
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(
                        `Infinite Engine: ${error.message}`
                    );
                }
            }
        );

        webviewView.onDidDispose(() => {
            subscription.dispose();
            if (this.view === webviewView) {
                this.view = null;
            }
        });

        this.refresh();
    }

    async openProject() {
        const selected = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Infinite Engine Project': ['ieproject']
            },
            openLabel: 'Open Project'
        });

        if (!selected?.length) return;

        const projectFile = selected[0];

        await this.openRecentProject(
            path.dirname(projectFile.fsPath)
        );
    }

    async openRecentProject(projectPath) {
        if (typeof projectPath !== 'string') return;

        // Accept only projects already recorded by this extension,
        // or projects chosen through the native Open dialog.
        const workspacePath = path.resolve(projectPath);

        let entries;
        try {
            entries = await fs.readdir(workspacePath);
        } catch {
            vscode.window.showErrorMessage(
                'Project folder could not be found.'
            );
            return;
        }

        if (!entries.some(name => name.endsWith('.ieproject'))) {
            vscode.window.showErrorMessage(
                'This folder does not contain an Infinite Engine project.'
            );
            return;
        }

        await this.addRecentProject(workspacePath);

        await vscode.commands.executeCommand(
            'vscode.openFolder',
            vscode.Uri.file(workspacePath),
            false
        );
    }

    getRecentProjects() {
        return this.context.globalState.get(
            'infinite.recentProjects',
            []
        );
    }

    async addRecentProject(projectPath) {
        const current = this.getRecentProjects();

        const next = [
            projectPath,
            ...current.filter(item => item !== projectPath)
        ].slice(0, 10);

        await this.context.globalState.update(
            'infinite.recentProjects',
            next
        );

        await this.refresh();
    }

    async removeRecentProject(projectPath) {
        const next = this.getRecentProjects()
            .filter(item => item !== projectPath);

        await this.context.globalState.update(
            'infinite.recentProjects',
            next
        );

        await this.refresh();
    }

    async refresh() {
        if (!this.view) return;

        const recent = this.getRecentProjects().map(
            projectPath => ({
                name: path.basename(projectPath),
                path: projectPath
            })
        );

        const workspace = vscode.workspace.workspaceFolders?.[0];
        const currentPath = workspace?.uri.fsPath;

        let isProjectOpen = false;

        if (currentPath) {
            try {
                const entries = await fs.readdir(currentPath);
                isProjectOpen = entries.some(
                    name => name.endsWith('.ieproject')
                );
            } catch {
                isProjectOpen = false;
            }
        }

        await this.view.webview.postMessage({
            command: 'update',
            recent,
            currentProject: isProjectOpen
                ? {
                    name: path.basename(currentPath),
                    path: currentPath
                }
                : null
        });
    }

    getHtml(webview) {
        const nonce = require('crypto')
            .randomBytes(16)
            .toString('base64');

        const csp = [
            "default-src 'none'",
            `img-src ${webview.cspSource}`,
            `style-src 'nonce-${nonce}'`,
            `script-src 'nonce-${nonce}'`
        ].join('; ');

        const logoUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.extensionUri,
                'images',
                'infinite-color.png'
            )
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta
        http-equiv="Content-Security-Policy"
        content="${csp}"
    >
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <style nonce="${nonce}">
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 16px 12px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
        }

        .brand-icon {
            width: 34px;
            height: 34px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 9px;
            font-size: 20px;
            font-weight: 700;
        }

        .brand-text h1 {
            margin: 0;
            font-size: 15px;
            font-weight: 650;
        }

        .brand-text span {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .actions {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 26px;
        }

        button {
            cursor: pointer;
            font-family: inherit;
        }

        .action {
            width: 100%;
            border: none;
            padding: 10px 12px;
            border-radius: 5px;
            font-size: 12px;
            font-weight: 500;
            text-align: left;
        }

        .primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .primary:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            padding: 0 2px;
        }

        .section-header h2 {
            margin: 0;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.7px;
        }

        .icon-button {
            background: transparent;
            border: none;
            color: var(--vscode-descriptionForeground);
            font-size: 15px;
        }

        .icon-button:hover {
            color: var(--vscode-foreground);
        }

        .project {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 3px;
            cursor: pointer;
        }

        .project:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .project-icon {
            font-size: 18px;
            flex-shrink: 0;
        }

        .project-info {
            flex: 1;
            min-width: 0;
        }

        .project-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-weight: 500;
            font-size: 12px;
        }

        .project-path {
            margin-top: 3px;
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .project-remove {
            display: none;
            background: transparent;
            color: var(--vscode-descriptionForeground);
            border: none;
            padding: 4px;
        }

        .project:hover .project-remove {
            display: block;
        }

        .project-remove:hover {
            color: var(--vscode-errorForeground);
        }

        .empty {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 22px 8px;
            font-size: 12px;
            line-height: 1.6;
        }

        .current-project {
            padding: 12px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            margin-bottom: 24px;
        }

        .current-project strong {
            display: block;
            margin-bottom: 5px;
        }

        .current-project small {
            display: block;
            color: var(--vscode-descriptionForeground);
            overflow-wrap: anywhere;
        }

        .status {
            display: flex;
            align-items: center;
            gap: 7px;
            margin-bottom: 8px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--vscode-testing-iconPassed);
        }

        .hidden {
            display: none;
        }
            .brand-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: transparent;
    border-radius: 8px;
}

.brand-icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}
    </style>
</head>

<body>
    <div class="brand">
        <div class="brand-icon">
    <img src="${logoUri}" alt="Infinite Engine">
</div>
        <div class="brand-text">
            <h1>Infinite Engine</h1>
            <span>Game Development Environment</span>
        </div>
    </div>

    <div class="actions">
        <button class="action primary" id="create">
            + Create Project
        </button>

        <button class="action secondary" id="open">
            Open Project
        </button>
    </div>

    <div id="current-section" class="hidden">
        <div class="section-header">
            <h2>Current Project</h2>
        </div>
        <div id="current-project"></div>
    </div>

    <div class="section-header">
        <h2>Recent Projects</h2>
        <button
            class="icon-button"
            id="refresh"
            title="Refresh"
            aria-label="Refresh"
        >↻</button>
    </div>

    <div id="recent-projects">
        <div class="empty">
            No recent projects yet.<br>
            Create your first Infinite Engine project.
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        const send = (action, data = {}) => {
            vscode.postMessage({
                type: 'onAssetsUpdate',
                action,
                ...data
            });
        };

        document.getElementById('create')
            .addEventListener('click', () => {
                send('createProject');
            });

        document.getElementById('open')
            .addEventListener('click', () => {
                send('openProject');
            });

        document.getElementById('refresh')
            .addEventListener('click', () => {
                send('refresh');
            });

        const recentContainer =
            document.getElementById('recent-projects');

        const currentSection =
            document.getElementById('current-section');

        const currentContainer =
            document.getElementById('current-project');

        function createProjectElement(project) {
            const element = document.createElement('div');
            element.className = 'project';

            const icon = document.createElement('div');
            icon.className = 'project-icon';
            icon.textContent = '◈';

            const info = document.createElement('div');
            info.className = 'project-info';

            const name = document.createElement('div');
            name.className = 'project-name';
            name.textContent = project.name;

            const projectPath = document.createElement('div');
            projectPath.className = 'project-path';
            projectPath.textContent = project.path;
            projectPath.title = project.path;

            info.append(name, projectPath);

            const remove = document.createElement('button');
            remove.className = 'project-remove';
            remove.textContent = '×';
            remove.title = 'Remove from recent projects';
            remove.setAttribute(
                'aria-label',
                'Remove ' + project.name
            );

            remove.addEventListener('click', event => {
                event.stopPropagation();
                send('removeRecent', { path: project.path });
            });

            element.append(icon, info, remove);

            element.addEventListener('click', () => {
                send('openRecent', { path: project.path });
            });

            return element;
        }

        window.addEventListener('message', event => {
            const message = event.data;

            if (message.command !== 'update') return;

            recentContainer.replaceChildren();

            if (!message.recent.length) {
                const empty = document.createElement('div');
                empty.className = 'empty';
                empty.textContent = 'No recent projects yet.';
                recentContainer.appendChild(empty);
            } else {
                for (const project of message.recent) {
                    recentContainer.appendChild(
                        createProjectElement(project)
                    );
                }
            }

            currentContainer.replaceChildren();

            if (message.currentProject) {
                currentSection.classList.remove('hidden');

                const card = document.createElement('div');
                card.className = 'current-project';

                const status = document.createElement('div');
                status.className = 'status';

                const name = document.createElement('strong');
                name.textContent = message.currentProject.name;

                const projectPath = document.createElement('small');
                projectPath.textContent =
                    message.currentProject.path;

                card.append(status, name, projectPath);
                currentContainer.appendChild(card);
            } else {
                currentSection.classList.add('hidden');
            }
        });

        send('refresh');
    </script>
</body>
</html>`;
    }
}

module.exports = IEProjectManagerProvider;
