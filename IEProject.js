// @ts-nocheck
const vscode = require('vscode');

class IEProject {
    constructor(context) {
        this.context = context;
        this.name = undefined;
        this.path = undefined;
    }

    createProject(name, path) {
        this.name = name;
        this.path = path;

        return this;
    }

    async init() {
        if (!this.name || !this.path) {
            throw new Error('Project has not been created yet.');
        }

        const assetsPath = vscode.Uri.joinPath(this.path, 'Assets');
        const scenesPath = vscode.Uri.joinPath(this.path, 'Scenes');
        const scriptsPath = vscode.Uri.joinPath(this.path, 'Scripts');

        await vscode.workspace.fs.createDirectory(assetsPath);
        await vscode.workspace.fs.createDirectory(scenesPath);
        await vscode.workspace.fs.createDirectory(scriptsPath);

        await this.createProjectFile();
        await this.createDefaultScene();
        await this.createMainFile();

        return this;
    }

    async createProjectFile() {
        if (!this.name || !this.path) {
            throw new Error('Project has not been created yet.');
        }
        const projectFile = vscode.Uri.joinPath(
            this.path,
            'Infinite.ieproject'
        );

        const data = {
            name: this.name,
            version: 1,
            entry: 'main.js',
            startScene: 'Scenes/Main.iescene'
        };

        await vscode.workspace.fs.writeFile(
            projectFile,
            Buffer.from(
                JSON.stringify(data, null, 4),
                'utf8'
            )
        );
    }

    async createDefaultScene() {
        if (!this.name || !this.path) {
            throw new Error('Project has not been created yet.');
        }

        const scenesPath = vscode.Uri.joinPath(this.path, 'Scenes');
        await vscode.workspace.fs.createDirectory(scenesPath);
        const sceneFile = vscode.Uri.joinPath(
            this.path,
            'Scenes',
            'Main.iescene'
        );

        const data = {
            name: 'Main',
            actors: [{
            "id": require('crypto').randomUUID(),
            "name": "World",
            "type": "World",
            "components": [
                {
                    "id": require('crypto').randomUUID(),
                    "type": "script",
                    "name": "script",
                    "enabled": true,
                    "script": null
                }
            ]
        },]
        };

        await vscode.workspace.fs.writeFile(
            sceneFile,
            Buffer.from(
                JSON.stringify(data, null, 4),
                'utf8'
            )
        );
    }

    async createMainFile() {
        if (!this.name || !this.path) {
            throw new Error('Project has not been created yet.');
        }

        const mainFile = vscode.Uri.joinPath(
            this.path,
            'main.js'
        );

        const content = `const { Game } = require('@infinite/Runtime');

class MyGame extends Game {
	onBegin() {

	}

	onUpdate(deltaTime) {

	}

	onEnd() {

	}
}

module.exports = MyGame;
`;

        await vscode.workspace.fs.writeFile(
            mainFile,
            Buffer.from(
                content,
                'utf8'
            )
        );
    }
}

module.exports = IEProject;
