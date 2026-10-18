// @ts-nocheck

const vscode = require('vscode');
const path = require('path');

const IEActor = require('./IEActor');
const IEActorInstance = require('./IEActorInstance');
const WorldActor = require('./Actors/WorldActor');

const ActorRegistry = require('./ActorRegistry');
const registerActors = require('./Actors/registerActors');
const registerComponents = require('./Components/registerComponents');

registerComponents();
registerActors();

class IEScene {
    constructor(scenePath = undefined) {
        this.path = scenePath;
        this.name = undefined;
        this.version = 1;
        this.actors = [];

        this.world = new WorldActor(this.name || 'Untitled', undefined);
        this.actors.push(this.world);
    }

    async load() {
        if (!this.path) {
            throw new Error('Cannot load a runtime scene from disk.');
        }

        const bytes = await vscode.workspace.fs.readFile(this.path);
        const text = Buffer.from(bytes).toString('utf8').trim();

        if (!text) {
            this.createDefaultScene();
            await this.save();
            return this;
        }

        let data;

        try {
            data = JSON.parse(text);
        } catch (error) {
            throw new Error(
                `Invalid scene JSON: ${error instanceof Error ? error.message : String(error)}`
            );
        }

        this.name = data.name ?? this.getDefaultName();
        this.version = data.version ?? 1;

        this.actors = Array.isArray(data.actors)
            ? data.actors.map(actorData => ActorRegistry.fromJSON(actorData))
            : [];

        this.world = this.actors.find(actor => actor.type === 'World');

        if (!this.world) {
            throw new Error('Scene does not contain a World actor');
        }

        return this;
    }

    createDefaultScene() {
        this.name = this.getDefaultName();
        this.version = 1;
        this.world = new WorldActor('World', undefined);
        this.actors = [this.world];
    }

    getDefaultName() {
        if (!this.path) return 'Scene';

        const fileName = path.basename(this.path.fsPath);

        return path.basename(fileName, path.extname(fileName));
    }

    async save() {
        if (!this.path) {
            throw new Error('Cannot save a runtime scene.');
        }

        const json = JSON.stringify(this.toJSON(), null, 4);

        await vscode.workspace.fs.writeFile(
            this.path,
            Buffer.from(json, 'utf8')
        );
    }


    addActor(actor) {
        if (!(actor instanceof IEActor)) {
            actor = ActorRegistry.fromJSON(actor);
        }

        if (actor.type === 'World') {
            throw new Error('World already exists.');
        }

        if (this.getActor(actor.id)) {
            throw new Error(`Duplicate actor ID: ${actor.id}`);
        }

        // Only one Environment Actor per scene
        if (actor.type === 'Environment') {
            const existingEnvironment = this.actors.find(
                item => item.type === 'Environment'
            );

            if (existingEnvironment) {
                throw new Error(
                    'This scene already contains an Environment Actor.'
                );
            }
        }

        if (!actor.parent) {
            actor.parent = this.world.id;
        }

        this.actors.push(actor);

        return actor;
    }


    removeActor(actorId) {
        if (actorId === this.world.id) return false;

        const index = this.actors.findIndex(actor => actor.id === actorId);
        if (index === -1) return false;

        this.actors.splice(index, 1);
        return true;
    }

    getActor(actorId) {
        return this.actors.find(actor => actor.id === actorId);
    }

    getActors() {
        return this.actors;
    }

    getEnvironment() {
        return this.actors.find(
            actor => actor.type === 'Environment'
        ) ?? null;
    }

    async instantiateActor(assetReference, assetManager, parentId = undefined) {
        const asset = await assetManager.resolve(assetReference);

        if (!asset || asset.type !== 'actor') {
            throw new Error('Invalid Actor Asset');
        }

        const actor = IEActorInstance.create(
            asset,
            parentId ?? this.world.id
        );

        return this.addActor(actor);
    }

    toJSON() {
        return {
            name: this.name ?? this.getDefaultName(),
            version: this.version,
            actors: this.actors.map(actor => actor.toJSON())
        };
    }

    static fromJSON(data) {
        const scene = new IEScene();

        scene.name = data.name ?? 'Scene';
        scene.version = data.version ?? 1;

        scene.actors = Array.isArray(data.actors)
            ? data.actors.map(actorData => ActorRegistry.fromJSON(actorData))
            : [];

        scene.world = scene.actors.find(actor => actor.type === 'World');

        if (!scene.world) {
            throw new Error('Scene does not contain a World actor');
        }

        return scene;
    }

    clone() {
        return IEScene.fromJSON(structuredClone(this.toJSON()));
    }
}

module.exports = IEScene;
