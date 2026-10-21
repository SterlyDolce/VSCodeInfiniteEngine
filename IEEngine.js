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
        this.errorHandler = undefined;
    }

    setErrorHandler(handler) {
        this.errorHandler = handler;
        return this;
    }

    contextualize(error, context) {
        const runtimeError = error instanceof Error ? error : new Error(String(error));
        runtimeError.runtimeContext ??= context;
        return runtimeError;
    }

    reportError(error, context) {
        const runtimeError = this.contextualize(error, context);
        try {
            this.errorHandler?.(runtimeError);
        } catch (handlerError) {
            console.error('Infinite Engine error handler failed:', handlerError);
        }
        return runtimeError;
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

        let began = false;
        try {
            try {
                this.game.onBegin();
            } catch (error) {
                throw this.contextualize(error, { phase: 'Game.onBegin' });
            }
            began = true;
            this.startActors();
            this.loop();
        } catch (error) {
            this.running = false;
            this.paused = false;
            if (this._loopHandle) {
                clearTimeout(this._loopHandle);
                this._loopHandle = undefined;
            }
            if (began) {
                try { this.stopActors(); } catch { /* Preserve the startup error. */ }
                try { this.game?.onEnd(); } catch { /* Preserve the startup error. */ }
            }
            throw error;
        }
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

        let firstError;
        try {
            this.stopActors();
        } catch (error) {
            firstError = error;
        }

        try {
            this.game?.onEnd();
        } catch (error) {
            firstError ??= this.contextualize(error, { phase: 'Game.onEnd' });
        } finally {
            if (this._loopHandle) {
                clearTimeout(this._loopHandle);
                this._loopHandle = undefined;
            }
        }

        if (firstError) throw firstError;
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

            try {
                this.update(deltaTime);
            } catch (error) {
                const runtimeError = this.contextualize(error, { phase: 'Update' });
                try { this.stop(); } catch { /* Report the original runtime error. */ }
                this.reportError(runtimeError, runtimeError.runtimeContext);
                return;
            }
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

        try {
            this.game?.onUpdate(deltaTime);
        } catch (error) {
            throw this.contextualize(error, { phase: 'Game.onUpdate' });
        }

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
                    try {
                        component.start();
                    } catch (error) {
                        throw this.contextualize(error, {
                            phase: 'Component.start',
                            actor: actor.name,
                            actorId: actor.id,
                            component: component.name ?? component.type,
                            componentId: component.id
                        });
                    }
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
                    try {
                        component.stop();
                    } catch (error) {
                        throw this.contextualize(error, {
                            phase: 'Component.stop',
                            actor: actor.name,
                            actorId: actor.id,
                            component: component.name ?? component.type,
                            componentId: component.id
                        });
                    }
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
                try {
                    component.update(deltaTime);
                } catch (error) {
                    throw this.contextualize(error, {
                        phase: 'Component.update',
                        actor: actor.name,
                        actorId: actor.id,
                        component: component.name ?? component.type,
                        componentId: component.id
                    });
                }
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
