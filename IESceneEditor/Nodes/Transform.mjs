// @ts-nocheck

import * as THREE from 'three';
import { nodeRegistry } from '../IENodeRegistry.mjs';

const targetInput = {
    name: 'Target',
    type: 'transformable',
    default: null
};

function getTarget({ node, actor, readInput }) {
    // Saved graphs created before Target existed continue to use their owner.
    const hasTargetPin = node.pins?.some(pin =>
        pin.name === 'Target' && pin.direction === 'input'
    );
    const target = hasTargetPin ? readInput('Target') : actor;

    if (!target) {
        throw new Error('Transform target is required');
    }

    if (
        !target.position?.isVector3 ||
        !target.quaternion?.isQuaternion ||
        !target.scale?.isVector3
    ) {
        throw new TypeError(
            'Transform target must be an actor or transformable component'
        );
    }

    return target;
}

nodeRegistry.register('transform.rotate', {
    name: 'Rotate',
    category: 'Transform',
    inputs: [
        { name: 'exec', type: 'execution' },
        targetInput,
        { name: 'degrees', type: 'number', default: 0 },
        { name: 'axis', type: 'vector3', default: [0, 1, 0] }
    ],
    outputs: [],
    execute(context) {
        const { readInput } = context;
        const target = getTarget(context);
        const degrees = Number(readInput('degrees'));
        const axis = readInput('axis');

        if (!Number.isFinite(degrees) ||
            !Array.isArray(axis) ||
            axis.length !== 3 ||
            !axis.every(Number.isFinite)) {
            throw new Error('Invalid rotation inputs');
        }

        const direction = new THREE.Vector3(...axis);

        if (direction.lengthSq() === 0) return;

        target.rotateOnAxis(
            direction.normalize(),
            THREE.MathUtils.degToRad(degrees)
        );
    }
});


nodeRegistry.register('transform.getPosition', {
    name: 'Get Position',
    category: 'Transform',
    inputs: [targetInput],
    outputs: [
        { name: 'position', type: 'vector3' }
    ],
    evaluate(context) {
        return getTarget(context).position.toArray();
    }
});

nodeRegistry.register('transform.getForward', {
    name: 'Get Forward',
    category: 'Transform',
    inputs: [targetInput],
    outputs: [
        { name: 'forward', type: 'vector3' }
    ],
    evaluate(context) {
        const rotation = getTarget(context)
            .getWorldQuaternion(new THREE.Quaternion());
        return new THREE.Vector3(0, 0, -1)
            .applyQuaternion(rotation)
            .normalize()
            .toArray();
    }
});

nodeRegistry.register('transform.getRight', {
    name: 'Get Right',
    category: 'Transform',
    inputs: [targetInput],
    outputs: [
        { name: 'right', type: 'vector3' }
    ],
    evaluate(context) {
        const rotation = getTarget(context)
            .getWorldQuaternion(new THREE.Quaternion());
        return new THREE.Vector3(1, 0, 0)
            .applyQuaternion(rotation)
            .normalize()
            .toArray();
    }
});

nodeRegistry.register('transform.setPosition', {
    name: 'Set Position',
    category: 'Transform',
    inputs: [
        { name: 'exec', type: 'execution' },
        targetInput,
        { name: 'position', type: 'vector3', default: [0, 0, 0] }
    ],
    outputs: [
        { name: 'exec', type: 'execution' }
    ],
    execute(context) {
        const { readInput } = context;
        const target = getTarget(context);
        const position = readInput('position');

        if (!Array.isArray(position) ||
            position.length !== 3 ||
            !position.every(Number.isFinite)) {
            throw new Error('Invalid position');
        }

        target.position.fromArray(position);
    }
});

nodeRegistry.register('transform.translate', {
    name: 'Translate',
    category: 'Transform',
    inputs: [
        { name: 'exec', type: 'execution' },
        targetInput,
        { name: 'offset', type: 'vector3', default: [0, 0, 0] }
    ],
    outputs: [
        { name: 'exec', type: 'execution' }
    ],
    execute(context) {
        const { readInput } = context;
        const target = getTarget(context);
        const offset = readInput('offset');

        if (!Array.isArray(offset) ||
            offset.length !== 3 ||
            !offset.every(Number.isFinite)) {
            throw new Error('Invalid translation');
        }

        target.position.add(
            new THREE.Vector3(...offset)
        );
    }
});

nodeRegistry.register('transform.setScale', {
    name: 'Set Scale',
    category: 'Transform',
    inputs: [
        { name: 'exec', type: 'execution' },
        targetInput,
        { name: 'scale', type: 'vector3', default: [1, 1, 1] }
    ],
    outputs: [
        { name: 'exec', type: 'execution' }
    ],
    execute(context) {
        const { readInput } = context;
        const target = getTarget(context);
        const scale = readInput('scale');

        if (!Array.isArray(scale) ||
            scale.length !== 3 ||
            !scale.every(Number.isFinite)) {
            throw new Error('Invalid scale');
        }

        target.scale.fromArray(scale);
    }
});
