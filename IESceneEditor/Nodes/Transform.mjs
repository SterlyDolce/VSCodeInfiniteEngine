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

function getPlanarDirections(target) {
    target.updateWorldMatrix?.(true, false);

    const rotation = target.getWorldQuaternion(new THREE.Quaternion());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation);
    forward.y = 0;

    // Looking straight up/down has no useful ground-plane direction. Fall
    // back to the spring arm's stored yaw so movement remains stable.
    if (forward.lengthSq() < 1e-8 && target.userData?.springArm) {
        const yaw = target.userData.springArmRotation?.[1] ?? 0;
        forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    }

    forward.normalize();
    const right = new THREE.Vector3().crossVectors(
        forward,
        new THREE.Vector3(0, 1, 0)
    ).normalize();

    return { forward, right };
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

nodeRegistry.register('transform.springArmOrbit', {
    name: 'Spring Arm Orbit',
    category: 'Transform',
    inputs: [
        { name: 'exec', type: 'execution' },
        targetInput,
        { name: 'deltaX', type: 'number', default: 0 },
        { name: 'deltaY', type: 'number', default: 0 },
        { name: 'sensitivity', type: 'number', default: 0.12 },
        { name: 'minPitch', type: 'number', default: -65 },
        { name: 'maxPitch', type: 'number', default: 75 }
    ],
    outputs: [
        { name: 'exec', type: 'execution' }
    ],
    execute(context) {
        const { readInput } = context;
        const target = getTarget(context);

        if (!target.userData?.springArm) {
            throw new TypeError('Spring Arm Orbit requires a Spring Arm component');
        }

        const deltaX = Number(readInput('deltaX'));
        const deltaY = Number(readInput('deltaY'));
        const sensitivity = Math.max(0, Number(readInput('sensitivity')));
        const minPitch = THREE.MathUtils.degToRad(Number(readInput('minPitch')));
        const maxPitch = THREE.MathUtils.degToRad(Number(readInput('maxPitch')));

        if (![deltaX, deltaY, sensitivity, minPitch, maxPitch].every(Number.isFinite)) {
            throw new Error('Invalid Spring Arm Orbit inputs');
        }

        const rotation = target.userData.springArmRotation ?? [0, 0, 0];
        const pitch = THREE.MathUtils.clamp(
            (rotation[0] ?? 0) - THREE.MathUtils.degToRad(deltaY * sensitivity),
            Math.min(minPitch, maxPitch),
            Math.max(minPitch, maxPitch)
        );
        const yaw = (rotation[1] ?? 0) - THREE.MathUtils.degToRad(deltaX * sensitivity);

        target.userData.springArmRotation = [pitch, yaw, rotation[2] ?? 0];
        const orbitRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
            pitch,
            yaw,
            rotation[2] ?? 0,
            'YXZ'
        ));

        if (target.userData.followActorRotation) {
            target.quaternion.copy(orbitRotation);
        } else if (target.parent) {
            // The stored orbit is a world-space rotation when actor following
            // is disabled. Apply the inverse parent rotation immediately so
            // nodes later in this execution chain observe the correct camera
            // direction instead of one frame of actor-yaw feedback.
            target.parent.updateWorldMatrix?.(true, false);
            const parentRotation = target.parent.getWorldQuaternion(
                new THREE.Quaternion()
            );
            target.quaternion.copy(
                parentRotation.invert().multiply(orbitRotation)
            );
        } else {
            target.quaternion.copy(orbitRotation);
        }
        target.updateWorldMatrix?.(false, true);

        return 'exec';
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

nodeRegistry.register('transform.getSpringArmDirections', {
    name: 'Get Spring Arm Directions',
    category: 'Transform',
    inputs: [targetInput],
    outputs: [
        { name: 'forward', type: 'vector3' },
        { name: 'right', type: 'vector3' }
    ],
    evaluate(context) {
        const target = getTarget(context);

        if (!target.userData?.springArm) {
            throw new TypeError(
                'Get Spring Arm Directions requires a Spring Arm component'
            );
        }

        const directions = getPlanarDirections(target);
        return context.output === 'right'
            ? directions.right.toArray()
            : directions.forward.toArray();
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
