// @ts-nocheck

const vscode = require('vscode');
const path = require('path');

class IEAssetExplorer {
    constructor() {
        this._onDidChangeTreeData =
            new vscode.EventEmitter();

        this.onDidChangeTreeData =
            this._onDidChangeTreeData.event;

        this.dropMimeTypes = ['text/uri-list'];
        this.dragMimeTypes = [];
        this.importHandler = null;
    }

    setImportHandler(handler) {
        this.importHandler = handler;
    }

    async handleDrop(_target, dataTransfer) {
        const item = dataTransfer.get('text/uri-list');
        if (!item || !this.importHandler) return;

        const value = await item.asString();
        const uris = value.split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => vscode.Uri.parse(line))
            .filter(uri => uri.scheme === 'file');

        if (uris.length) await this.importHandler(uris);
    }

    refresh(element) {
        this._onDidChangeTreeData.fire(element);
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (element) {
            return this.getDirectoryChildren(
                element.resourceUri
            );
        }

        return this.getProjects();
    }

    async getProjects() {
        const folders = vscode.workspace.workspaceFolders || [];
        const projects = [];

        for (const folder of folders) {
            if (!(await this.isProject(folder.uri))) {
                continue;
            }

            projects.push(
                new IEAssetItem({
                    label: folder.name,
                    uri: folder.uri,
                    type: 'project',
                    isDirectory: true,
                    collapsibleState:
                        vscode.TreeItemCollapsibleState.Expanded
                })
            );
        }

        return projects;
    }

    async isProject(uri) {
        try {
            const entries =
                await vscode.workspace.fs.readDirectory(uri);

            return entries.some(([name, type]) =>
                type === vscode.FileType.File &&
                name.endsWith('.ieproject')
            );
        } catch {
            return false;
        }
    }

    async getDirectoryChildren(directoryUri) {
        let entries;

        try {
            entries =
                await vscode.workspace.fs.readDirectory(
                    directoryUri
                );
        } catch (error) {
            console.error(
                '[IEAssetExplorer] Failed to read directory:',
                directoryUri.toString(),
                error
            );

            return [];
        }

        const items = [];

        for (const [name, fileType] of entries) {
            if (this.shouldIgnore(name)) {
                continue;
            }

            const uri = vscode.Uri.joinPath(
                directoryUri,
                name
            );

            const isDirectory =
                (fileType & vscode.FileType.Directory) !== 0;

            let type = isDirectory
                ? 'folder'
                : this.resolveType(name);

            if (type === 'asset') {
                type = await this.getIEAssetType(uri);
            }

            items.push(
                new IEAssetItem({
                    label: name,
                    uri,
                    type,
                    isDirectory,
                    collapsibleState: isDirectory
                        ? vscode.TreeItemCollapsibleState.Collapsed
                        : vscode.TreeItemCollapsibleState.None
                })
            );
        }

        return items.sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) {
                return a.isDirectory ? -1 : 1;
            }

            return a.label.localeCompare(
                b.label,
                undefined,
                {
                    numeric: true,
                    sensitivity: 'base'
                }
            );
        });
    }

    async getIEAssetType(uri) {
        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            const asset = JSON.parse(
                new TextDecoder().decode(bytes)
            );

            return asset.type || 'asset';
        } catch (error) {
            console.warn(
                '[IEAssetExplorer] Could not read asset:',
                uri.toString(),
                error
            );

            return 'asset';
        }
    }

    shouldIgnore(name) {
        return [
            '.git',
            '.DS_Store',
            'node_modules',
            '.vscode-test'
        ].includes(name);
    }

    resolveType(name) {
        const extension =
            path.extname(name).toLowerCase();

        const types = {
            '.ieasset': 'asset',
            '.iescene': 'scene',
            '.ieproject': 'projectFile',

            '.js': 'script',
            '.mjs': 'script',
            '.ts': 'script',
            '.json': 'json',

            '.glb': 'model',
            '.gltf': 'model',
            '.fbx': 'model',
            '.obj': 'model',

            '.png': 'texture',
            '.jpg': 'texture',
            '.jpeg': 'texture',
            '.webp': 'texture',
            '.hdr': 'texture',

            '.mp3': 'audio',
            '.wav': 'audio',
            '.ogg': 'audio',

            '.mp4': 'video',
            '.webm': 'video'
        };

        return types[extension] || 'file';
    }

    dispose() {
        this._onDidChangeTreeData.dispose();
    }
}

class IEAssetItem extends vscode.TreeItem {
    constructor({
        label,
        uri,
        type,
        isDirectory,
        collapsibleState
    }) {
        super(label, collapsibleState);

        this.resourceUri = uri;
        this.type = type;
        this.isDirectory = isDirectory;

        this.contextValue = `infinite.${type}`;

        this.tooltip = uri.fsPath || uri.toString();

        const icons = {
            project: 'root-folder',
            projectFile: 'settings-gear',
            folder: 'folder',

            // Infinite Engine assets
            actor: 'symbol-class',
            mesh: 'symbol-structure',
            material: 'symbol-color',
            texture: 'file-media',

            // Visual scripting
            script: 'workflow',
            visualScript: 'workflow',
            graph: 'type-hierarchy',

            // Animation
            animation: 'clapperboard',
            animationState: 'git-branch',
            animationStateMachine: 'git-merge',
            blendSpace: 'git-compare',

            // Scene
            scene: 'globe',

            // Other assets
            model: 'symbol-structure',
            audio: 'unmute',
            video: 'device-camera-video',
            json: 'json',
            asset: 'symbol-object',
            file: 'file'
        };

		const imageIcons = {
			actor: 'cube.png',
			geometry: 'cube.png',
			mesh: 'cube.png',
			skeleton: 'bone.png',
			script: 'nodes.png',
			visualScript: 'nodes.png',
			graph: 'nodes.png',
			animationState: 'anim_nodes.png',
			animationStateMachine: 'anim_nodes.png',
			blendSpace: 'anim_nodes.png',
			animation: 'animation.png'
		};

		this.iconPath = imageIcons[type]
			? vscode.Uri.file(
				path.join(__dirname, 'images', imageIcons[type])
			)
			: new vscode.ThemeIcon(icons[type] || 'file');

        if (!isDirectory) {
            this.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [uri]
            };
        }
    }

}

module.exports = IEAssetExplorer;
