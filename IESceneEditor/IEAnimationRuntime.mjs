// @ts-nocheck

import * as THREE from 'three';

/**
 * Infinite Engine — Animation Runtime
 *
 * One instance per animated actor.
 *
 * Requires:
 *   root: THREE.Object3D containing the animated rig
 *   asset: animationState .ieasset object
 *   resolveClip(id): THREE.AnimationClip | null
 *
 * Supports:
 *   State machines
 *   1D and 2D Blend Spaces
 *   Transition conditions
 *   Triggers
 *   Crossfades
 *   Override and additive layers
 *   Bone masks
 */

export class IEAnimationRuntime {
    constructor({
        root,
        asset,
        resolveClip
    }) {
        if (!root?.isObject3D) {
            throw new Error(
                'IEAnimationRuntime requires a Three.js Object3D'
            );
        }

        if (typeof resolveClip !== 'function') {
            throw new Error(
                'IEAnimationRuntime requires resolveClip(id)'
            );
        }

        this.root = root;
        this.asset = asset;
        this.resolveClip = resolveClip;

        this.mixer = new THREE.AnimationMixer(root);
        this.completedLoops = new Set();

        this.onAnimationLoop = event => {
            this.completedLoops.add(event.action);
        };

        this.mixer.addEventListener(
            'loop',
            this.onAnimationLoop
        );

        this.parameters = new Map();
        this.triggers = new Set();

        this.layers = [];
        this.actions = new Map();

        this.time = 0;
        this.playing = true;

        this.initializeParameters();
        this.initializeLayers();

        console.log('[IE Animation] Initialized:', {
            asset: this.asset.name,
            layers: this.layers.map(layer => ({
                name: layer.name,
                current: layer.current,
                weight: layer.weight
            })),
            actions: [...this.actions.values()].map(action => ({
                clip: action.getClip().name,
                tracks: action.getClip().tracks.length,
                duration: action.getClip().duration
            }))
        });
    }

    // -------------------------------------------------
    // PARAMETERS
    // -------------------------------------------------


    initializeParameters() {
        const parameters = this.asset.data?.parameters ?? [];

        for (const parameter of parameters) {
            const value = parameter.default ?? (
                parameter.type === 'boolean' ? false : 0
            );

            const duration = Number(
                parameter.transitionDuration ?? 0.2
            );

            this.parameters.set(parameter.name, {
                type: parameter.type,
                value,
                target: value,
                transitionDuration:
                    parameter.type === 'number' &&
                        Number.isFinite(duration)
                        ? Math.max(0, duration)
                        : 0,
                transitionStart: value,
                transitionElapsed: 0
            });
        }
    }


    setParameter(name, value) {
        const parameter = this.parameters.get(name);

        if (!parameter) {
            throw new Error(
                `Unknown animation parameter: ${name}`
            );
        }

        if (parameter.type === 'trigger') {
            if (value) this.fireTrigger(name);
            else this.triggers.delete(name);
            return;
        }

        if (
            parameter.type === 'number' &&
            (
                typeof value !== 'number' ||
                !Number.isFinite(value)
            )
        ) {
            throw new Error(`${name} requires a number`);
        }

        if (
            parameter.type === 'boolean' &&
            typeof value !== 'boolean'
        ) {
            throw new Error(`${name} requires a boolean`);
        }



        if (parameter.type === 'number') {
            if (parameter.target !== value) {
                parameter.transitionStart = parameter.value;
                parameter.transitionElapsed = 0;
                parameter.target = value;
            }

            if (parameter.transitionDuration === 0) {
                parameter.value = value;
            }
        } else {
            parameter.value = value;
        }


    }

    getParameter(name) {
        return this.parameters.get(name)?.value;
    }

    fireTrigger(name) {
        if (
            this.parameters.get(name)?.type !== 'trigger'
        ) {
            throw new Error(
                `${name} is not a trigger parameter`
            );
        }

        this.triggers.add(name);
    }

    resetTrigger(name) {
        this.triggers.delete(name);
    }

    // -------------------------------------------------
    // LAYERS
    // -------------------------------------------------

    initializeLayers() {
        const sourceLayers =
            this.asset.data?.layers ?? [];

        for (const source of sourceLayers) {
            const nodeMap = new Map(
                source.nodes.map(node => [node.id, node])
            );

            const entry = source.nodes.find(
                node => node.kind === 'entry'
            );

            const initialLink = source.links.find(
                link => link.from === entry?.id
            );

            const initialNode = initialLink
                ? nodeMap.get(initialLink.to)
                : null;

            const runtimeLayer = {
                id: source.id,
                name: source.name,
                source,
                nodes: nodeMap,

                current: initialNode?.id ?? null,
                transition: null,

                weight: source.weight ?? 1,
                enabled: source.enabled !== false
            };

            this.layers.push(runtimeLayer);

            if (initialNode) {
                this.enterNode(runtimeLayer, initialNode);
            }
        }
    }

    getLayer(name) {
        return this.layers.find(
            layer =>
                layer.name === name ||
                layer.id === name
        );
    }

    setLayerWeight(name, weight) {
        const layer = this.getLayer(name);

        if (!layer) return false;

        layer.weight = THREE.MathUtils.clamp(
            weight, 0, 1
        );

        return true;
    }

    setLayerEnabled(name, enabled) {
        const layer = this.getLayer(name);

        if (!layer) return false;

        layer.enabled = !!enabled;
        return true;
    }

    getCurrentState(layerName) {
        const layer = this.getLayer(layerName);

        if (!layer) return null;

        return layer.nodes.get(layer.current) ?? null;
    }

    // -------------------------------------------------
    // BONE MASKS
    // -------------------------------------------------

    getMaskNames(mask) {
        if (
            !mask ||
            typeof mask === 'string'
        ) {
            // Full Body or a named mask without a
            // resolved bone list.
            return null;
        }

        const include = mask.include ?? [];

        if (!include.length) return null;

        const names = new Set(include);

        if (mask.includeDescendants) {
            for (const name of include) {
                const object =
                    this.root.getObjectByName(name);

                object?.traverse(child => {
                    names.add(child.name);
                });
            }
        }

        return names;
    }

    filterClipByMask(clip, mask) {
        const names = this.getMaskNames(mask);

        if (!names) return clip;

        const filtered = clip.clone();

        filtered.tracks = filtered.tracks.filter(
            track => {
                // Supports:
                //   LeftArm.quaternion
                //   .bones[LeftArm].quaternion
                const match = track.name.match(
                    /^(?:\.bones\[([^\]]+)\]|([^.[\]]+))/
                );

                const target = match?.[1] ?? match?.[2];

                return !!target && names.has(target);
            }
        );

        return filtered;
    }

    // -------------------------------------------------
    // ACTION CREATION
    // -------------------------------------------------

    actionKey(layer, node, sample = null) {
        return [
            layer.id,
            node.id,
            sample?.id ?? 'state'
        ].join(':');
    }

    getAction(layer, node, sample = null) {
        const key = this.actionKey(
            layer, node, sample
        );

        if (this.actions.has(key)) {
            return this.actions.get(key);
        }


        const animationId = sample
            ? sample.animation
            : node.animation;

        if (!animationId) {
            console.warn(
                '[IE Animation] No animation assigned:',
                node.name
            );

            return null;
        }

        const sourceClip = this.resolveClip(animationId);

        if (!(sourceClip instanceof THREE.AnimationClip)) {
            console.warn(
                '[IE Animation] Invalid animation clip:',
                animationId,
                sourceClip
            );

            return null;
        }



        // Each state/sample gets its own clip instance.
        // That avoids sharing playback time between
        // distinct animation graph nodes.
        const clip = sourceClip.clone();

        // clip = this.filterClipByMask(
        //     clip,
        //     layer.source.mask
        // );

        if (!clip.tracks.length) {
            return null;
        }

        const additive =
            String(layer.source.mode).toLowerCase() ===
            'additive';

        if (additive) {
            THREE.AnimationUtils.makeClipAdditive(clip);
            clip.blendMode =
                THREE.AdditiveAnimationBlendMode;
        }

        const action = this.mixer.clipAction(
            clip,
            this.root,
            additive
                ? THREE.AdditiveAnimationBlendMode
                : THREE.NormalAnimationBlendMode
        );

        const loop = sample
            ? sample.loop !== false
            : node.loop !== false;

        action.setLoop(
            loop
                ? THREE.LoopRepeat
                : THREE.LoopOnce,
            loop ? Infinity : 1
        );

        action.clampWhenFinished = !loop;
        action.enabled = true;

        action.setEffectiveTimeScale(
            sample?.speed ?? node.speed ?? 1
        );

        action.setEffectiveWeight(0);
        action.play();

        this.actions.set(key, action);

        return action;
    }

    // -------------------------------------------------
    // NODE PLAYBACK
    // -------------------------------------------------

    nodeSamples(node) {
        if (
            node.kind === 'blend1d' ||
            node.kind === 'blend' ||
            node.kind === 'blend2d'
        ) {
            return node.blendSpace?.samples ?? [];
        }

        return [];
    }

    enterNode(layer, node) {
        if (!node) return;

        if (node.kind === 'state') {
            const action = this.getAction(
                layer, node
            );

            if (action) {
                action.reset();
                action.play();
            }

            return;
        }

        for (const sample of this.nodeSamples(node)) {
            const action = this.getAction(
                layer, node, sample
            );

            if (!action) continue;

            action.reset();
            action.play();
        }
    }

    // -------------------------------------------------
    // 1D BLEND SPACE
    // -------------------------------------------------

    blend1D(node) {
        const blend = node.blendSpace;
        const samples = [...(blend?.samples ?? [])]
            .filter(
                sample =>
                    Number.isFinite(sample.x) &&
                    !!sample.animation
            )
            .sort((a, b) => a.x - b.x);

        if (!samples.length) return [];

        if (samples.length === 1) {
            return [{
                sample: samples[0],
                weight: 1
            }];
        }

        const parameter = blend.parameters?.x;

        const value = Number(
            this.getParameter(parameter) ?? 0
        );

        if (value <= samples[0].x) {
            return [{
                sample: samples[0],
                weight: 1
            }];
        }

        const last = samples[samples.length - 1];

        if (value >= last.x) {
            return [{
                sample: last,
                weight: 1
            }];
        }

        for (let i = 0; i < samples.length - 1; i++) {
            const left = samples[i];
            const right = samples[i + 1];

            if (
                value >= left.x &&
                value <= right.x
            ) {
                const distance = right.x - left.x;

                const t = distance > 0
                    ? (value - left.x) / distance
                    : 0;

                return [
                    {
                        sample: left,
                        weight: 1 - t
                    },
                    {
                        sample: right,
                        weight: t
                    }
                ];
            }
        }

        return [];
    }

    // -------------------------------------------------
    // 2D BLEND SPACE
    // -------------------------------------------------

    blend2D(node) {
        const blend = node.blendSpace;

        const samples = (blend?.samples ?? [])
            .filter(
                sample =>
                    Number.isFinite(sample.x) &&
                    Number.isFinite(sample.y) &&
                    !!sample.animation
            );

        if (!samples.length) return [];

        const x = Number(
            this.getParameter(
                blend.parameters?.x
            ) ?? 0
        );

        const y = Number(
            this.getParameter(
                blend.parameters?.y
            ) ?? 0
        );

        // Prototype interpolation:
        // inverse-distance weighting.
        //
        // Good for scattered sample points.
        // Triangle-based barycentric interpolation
        // can replace this later.

        const distances = samples.map(sample => ({
            sample,
            distance: Math.hypot(
                sample.x - x,
                sample.y - y
            )
        }));

        const exact = distances.filter(
            item => item.distance < 0.00001
        );

        if (exact.length) {
            return exact.map(item => ({
                sample: item.sample,
                weight: 1 / exact.length
            }));
        }

        const weighted = distances.map(item => ({
            sample: item.sample,
            weight: 1 / (
                item.distance * item.distance
            )
        }));

        const total = weighted.reduce(
            (sum, item) => sum + item.weight,
            0
        );

        return weighted.map(item => ({
            sample: item.sample,
            weight: item.weight / total
        }));
    }

    // -------------------------------------------------
    // STATE WEIGHTS
    // -------------------------------------------------

    getNodeWeights(layer, node) {
        if (!node) return [];

        if (node.kind === 'state') {
            const action = this.getAction(
                layer, node
            );

            return action
                ? [{ action, weight: 1 }]
                : [];
        }

        const samples =
            node.kind === 'blend1d'
                ? this.blend1D(node)
                : this.blend2D(node);

        const output = [];

        for (const item of samples) {
            const action = this.getAction(
                layer,
                node,
                item.sample
            );

            if (!action) continue;

            output.push({
                action,
                weight: item.weight
            });
        }

        // Normalize only available animations.
        const total = output.reduce(
            (sum, item) => sum + item.weight,
            0
        );

        if (total > 0) {
            for (const item of output) {
                item.weight /= total;
            }
        }

        return output;
    }

    // -------------------------------------------------
    // TRANSITION CONDITIONS
    // -------------------------------------------------

    evaluateCondition(condition) {
        const parameter =
            this.parameters.get(condition.parameter);

        if (!parameter) return false;

        const operator = condition.operator;

        if (parameter.type === 'trigger') {
            return (
                operator === 'trigger' &&
                this.triggers.has(condition.parameter)
            );
        }

        const a = parameter.value;
        const b = condition.value;

        switch (operator) {
            case '==': return a === b;
            case '!=': return a !== b;
            case '>': return a > b;
            case '>=': return a >= b;
            case '<': return a < b;
            case '<=': return a <= b;
            case 'absGreater':
                return Math.abs(a) > b;
            case 'absLessOrEqual':
                return Math.abs(a) <= b;
            default:
                return false;
        }
    }

    evaluateConditions(link) {
        const conditions = link.conditions ?? [];

        if (!conditions.length) return false;

        const checks = conditions.map(
            condition =>
                this.evaluateCondition(condition)
        );

        return link.conditionMode === 'any'
            ? checks.some(Boolean)
            : checks.every(Boolean);
    }

    consumeTransitionTriggers(link) {
        for (const condition of link.conditions ?? []) {
            if (
                this.parameters.get(
                    condition.parameter
                )?.type === 'trigger'
            ) {
                this.triggers.delete(
                    condition.parameter
                );
            }
        }
    }

    // -------------------------------------------------
    // EXIT TIME
    // -------------------------------------------------


    normalizedNodeTime(layer, node) {
        // On End applies to single-animation states.
        if (node.kind !== 'state') return 0;

        const action = this.getAction(layer, node);

        if (!action) return 0;

        const duration = action.getClip().duration;

        if (duration <= 0) return 1;

        // Three.js resets time when looping, so capture
        // actual completed loops from AnimationMixer.
        if (this.completedLoops.has(action)) {
            return 1;
        }

        if (node.loop === false) {
            return Math.min(
                action.time / duration,
                1
            );
        }

        return THREE.MathUtils.clamp(
            (action.time % duration) / duration,
            0,
            1
        );
    }


    canTransition(layer, link) {
        const from = layer.nodes.get(link.from);

        if (!from) return false;

        const mode = link.mode ?? (
            link.conditions?.length
                ? 'conditions'
                : link.label === 'Immediate'
                    ? 'immediate'
                    : 'end'
        );

        if (mode === 'immediate') {
            return true;
        }

        if (mode === 'conditions') {
            return this.evaluateConditions(link);
        }

        if (mode === 'end') {
            const exitTime = THREE.MathUtils.clamp(
                link.exitTime ?? 1,
                0, 1
            );

            return (
                this.normalizedNodeTime(
                    layer, from
                ) >= exitTime
            );
        }

        return false;
    }

    // -------------------------------------------------
    // START TRANSITION
    // -------------------------------------------------

    startTransition(layer, link) {
        const target = layer.nodes.get(link.to);

        if (!target) return;

        const duration = Math.max(
            0,
            Number(link.blendDuration ?? 0.2)
        );

        this.consumeTransitionTriggers(link);

        this.enterNode(layer, target);

        if (duration === 0) {
            layer.current = target.id;
            layer.transition = null;
            return;
        }

        layer.transition = {
            from: layer.current,
            to: target.id,
            elapsed: 0,
            duration
        };
    }

    evaluateTransitions(layer) {
        if (
            !layer.current ||
            layer.transition
        ) return;

        const links = layer.source.links.filter(
            link =>
                link.from === layer.current
        );

        // First matching outgoing link wins.
        // Graph order is therefore priority order.
        for (const link of links) {
            if (this.canTransition(layer, link)) {
                this.startTransition(layer, link);
                break;
            }
        }
    }

    // -------------------------------------------------
    // UPDATE
    // -------------------------------------------------

    update(deltaTime) {
        if (!this.playing) return;

        const dt = Math.max(
            0, Math.min(deltaTime, 0.1)
        );

        this.time += dt;


        // Smooth numeric Animation State parameters before
        // evaluating transitions and Blend Space weights.
        for (const parameter of this.parameters.values()) {
            if (parameter.type !== 'number') continue;

            const duration = parameter.transitionDuration;

            if (duration <= 0) {
                parameter.value = parameter.target;
                continue;
            }

            if (parameter.value === parameter.target) continue;

            parameter.transitionElapsed = Math.min(
                parameter.transitionElapsed + dt,
                duration
            );

            const t = parameter.transitionElapsed / duration;

            parameter.value = THREE.MathUtils.lerp(
                parameter.transitionStart,
                parameter.target,
                t
            );
        }


        const weights = new Map();

        const addWeights = (
            runtimeLayer,
            node,
            multiplier
        ) => {
            if (!node) return;

            const entries = this.getNodeWeights(
                runtimeLayer, node
            );

            for (const entry of entries) {
                weights.set(
                    entry.action,
                    (weights.get(entry.action) ?? 0) +
                    entry.weight *
                    multiplier *
                    (
                        runtimeLayer.enabled
                            ? runtimeLayer.weight
                            : 0
                    )
                );
            }
        };

        for (const runtimeLayer of this.layers) {
            if (!runtimeLayer.current) continue;

            this.evaluateTransitions(runtimeLayer);

            const transition =
                runtimeLayer.transition;

            if (transition) {
                transition.elapsed += dt;

                const alpha = THREE.MathUtils.clamp(
                    transition.elapsed /
                    transition.duration,
                    0, 1
                );

                addWeights(
                    runtimeLayer,
                    runtimeLayer.nodes.get(
                        transition.from
                    ),
                    1 - alpha
                );

                addWeights(
                    runtimeLayer,
                    runtimeLayer.nodes.get(
                        transition.to
                    ),
                    alpha
                );

                if (alpha >= 1) {
                    runtimeLayer.current =
                        transition.to;

                    runtimeLayer.transition = null;
                }

            } else {
                addWeights(
                    runtimeLayer,
                    runtimeLayer.nodes.get(
                        runtimeLayer.current
                    ),
                    1
                );
            }
        }

        // Update every action, including those now
        // inactive, so that previous weights never
        // remain on the skeleton.
        for (const action of this.actions.values()) {
            action.setEffectiveWeight(
                THREE.MathUtils.clamp(
                    weights.get(action) ?? 0,
                    0, 1
                )
            );
        }

        // Consume loop events evaluated this frame.
        // Mixer may emit new events for the next frame.
        this.completedLoops.clear();
        this.mixer.update(dt);
    }

    // -------------------------------------------------
    // CONTROLS
    // -------------------------------------------------

    pause() {
        this.playing = false;
    }

    resume() {
        this.playing = true;
    }

    reset() {
        this.triggers.clear();
        this.time = 0;

        for (const action of this.actions.values()) {
            action.stop();
        }

        this.actions.clear();
        this.mixer.stopAllAction();

        this.layers.length = 0;
        this.initializeLayers();
    }

    dispose() {
        this.mixer.removeEventListener(
            'loop',
            this.onAnimationLoop
        );

        this.completedLoops.clear();
        this.playing = false;

        this.mixer.stopAllAction();

        for (const action of this.actions.values()) {
            this.mixer.uncacheAction(
                action.getClip(),
                this.root
            );
        }

        this.actions.clear();
        this.layers.length = 0;
        this.triggers.clear();
        this.parameters.clear();
    }
}
