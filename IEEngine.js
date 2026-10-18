// @ts-nocheck
const { performance } = require('perf_hooks');

class IEEngine {
    constructor(context, output) {
        this.context = context;
        this.output = output;

        this.activeScene = undefined;
        this.game = undefined;

        this.running = false;
        this.paused = false;

        this.lastTime = 0;

        this.targetFPS = 60;
        this.frameDuration = 1000 / this.targetFPS;

        this._loopHandle = undefined;
    }

    loadScene(scene) {
        this.activeScene = scene;
        return this;
    }

    setGame(game) {
        this.game = game;
        this.game.engine = this;

        return this;
    }

    start() {
        if (this.running) {
            return;
        }

        if (!this.activeScene) {
            throw new Error(
                'Cannot start engine without an active scene.'
            );
        }

        if (!this.game) {
            throw new Error(
                'Cannot start engine without a Game.'
            );
        }

        this.running = true;
        this.paused = false;

        this.lastTime = performance.now();

        this.game.onBegin();

        this.startActors();

        this.loop();
    }

    pause() {
        if (!this.running || this.paused) {
            return;
        }

        this.paused = true;
    }

    continue() {
        if (!this.running || !this.paused) {
            return;
        }

        this.paused = false;

        this.lastTime = performance.now();
    }

    stop() {
        if (!this.running) {
            return;
        }

        this.running = false;
        this.paused = false;

        this.stopActors();

        this.game?.onEnd();

        if (this._loopHandle) {
            clearTimeout(this._loopHandle);
            this._loopHandle = undefined;
        }
    }

    loop() {
        if (!this.running) {
            return;
        }

        const frameStart = performance.now();

        if (!this.paused) {
            const deltaTime =
                (frameStart - this.lastTime) / 1000;

            this.lastTime = frameStart;

            this.update(deltaTime);
        }

        const frameEnd = performance.now();

        const frameTime =
            frameEnd - frameStart;

        const delay = Math.max(
            0,
            this.frameDuration - frameTime
        );

        this._loopHandle = setTimeout(
            () => {
                this.loop();
            },
            delay
        );
    }

    update(deltaTime) {
        if (!this.activeScene) {
            return;
        }

        this.game?.onUpdate(deltaTime);

        for (const actor of this.activeScene.getActors()) {
            this.updateActor(
                actor,
                deltaTime
            );
        }
    }

    startActors() {
        if (!this.activeScene) {
            return;
        }

        for (const actor of this.activeScene.getActors()) {
            for (const component of actor.components) {
                if (!component.enabled) {
                    continue;
                }

                if (typeof component.start === 'function') {
                    component.start();
                }
            }
        }
    }

    stopActors() {
        if (!this.activeScene) {
            return;
        }

        for (const actor of this.activeScene.getActors()) {
            for (const component of actor.components) {
                if (typeof component.stop === 'function') {
                    component.stop();
                }
            }
        }
    }

    updateActor(actor, deltaTime) {
        for (const component of actor.components) {
            if (!component.enabled) {
                continue;
            }

            if (typeof component.update === 'function') {
                component.update(
                    deltaTime
                );
            }
        }
    }

    print(...values) {
        const message = values
            .map(value => {
                if (typeof value === 'string') {
                    return value;
                }

                try {
                    return JSON.stringify(value);
                } catch {
                    return String(value);
                }
            })
            .join(' ');

        this.output.appendLine(message);
    }
}

module.exports = IEEngine;
