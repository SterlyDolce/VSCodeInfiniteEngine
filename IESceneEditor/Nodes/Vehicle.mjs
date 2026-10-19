// @ts-nocheck

import { nodeRegistry } from '../IENodeRegistry.mjs';
import * as THREE from 'three';

const states = new WeakMap();

function yawFromQuaternion(quaternion) {
    return new THREE.Euler()
        .setFromQuaternion(quaternion, 'YXZ')
        .y;
}

function dampAngle(current, target, response, deltaTime) {
    const difference = Math.atan2(
        Math.sin(target - current),
        Math.cos(target - current)
    );
    return current + difference * (1 - Math.exp(-response * deltaTime));
}

nodeRegistry.register('control.vehicle', {
    name: 'Car Controller',
    category: 'Controller',
    inputs: [
        { name: 'exec', type: 'execution' },
        { name: 'deltaTime', type: 'number', default: 0.016 },
        { name: 'forward', type: 'number', default: 0 },
        { name: 'right', type: 'number', default: 0 },
        { name: 'maxSpeed', type: 'number', default: 10 },
        { name: 'reverseSpeed', type: 'number', default: 4 },
        { name: 'acceleration', type: 'number', default: 16 },
        { name: 'braking', type: 'number', default: 26 },
        { name: 'drag', type: 'number', default: 9 },
        { name: 'turnRate', type: 'number', default: 110 }
    ],
    outputs: [
        { name: 'exec', type: 'execution' }
    ],
    execute({ node, actor, engine, readInput }) {
        if (!actor) return;

        const dt = Math.min(Math.max(Number(readInput('deltaTime')) || 0, 0), 0.05);
        const forward = THREE.MathUtils.clamp(
            Number(readInput('forward')) || 0, -1, 1
        );

        const right = THREE.MathUtils.clamp(
            Number(readInput('right')) || 0, -1, 1
        );

        const maxSpeed = Math.max(0, Number(readInput('maxSpeed')) || 0);
        const reverseSpeed = Math.max(0, Number(readInput('reverseSpeed')) || 0);
        const acceleration = Math.max(0, Number(readInput('acceleration')) || 0);
        const braking = Math.max(0, Number(readInput('braking')) || 0);
        const drag = Math.max(0, Number(readInput('drag')) || 0);
        const turnRate = Math.max(0, Number(readInput('turnRate')) || 0);

        let state = states.get(node);
        if (!state) {
            state = { speed: 0 };
            states.set(node, state);
        }

        const throttle = forward;

        const desired = throttle > 0 ? maxSpeed : throttle < 0 ? -reverseSpeed : 0;
        const rate = throttle === 0 ? drag : state.speed * throttle < 0 ? braking : acceleration;
        const change = Math.sign(desired - state.speed) * Math.min(Math.abs(desired - state.speed), rate * dt);
        state.speed += change;

        const steer = -right;
        const speedRatio = maxSpeed > 0 ? Math.min(Math.abs(state.speed) / maxSpeed, 1) : 0;

        if (steer !== 0 && speedRatio > 0.02) {
            const reverse = state.speed < 0 ? -1 : 1;
            actor.rotateY(steer * reverse * turnRate * Math.PI / 180 * dt * speedRatio);
        }

        actor.translateZ(-state.speed * dt);
    }
});




nodeRegistry.register('control.player', {
    name: 'Player Controller',
    category: 'Controller',

    inputs: [
        { name: 'exec', type: 'execution' },

        { name: 'deltaTime', type: 'number', default: 0.016 },


        { name: 'forward', type: 'number', default: false },
        { name: 'right', type: 'number', default: false },

        { name: 'run', type: 'boolean', default: false },
		{ name: 'jump', type: 'boolean', default: false },
		{ name: 'jumpSpeed', type: 'number', default: 6 },

        { name: 'walkSpeed', type: 'number', default: 4 },
        { name: 'runSpeed', type: 'number', default: 8 },

        { name: 'acceleration', type: 'number', default: 16 },
        { name: 'deceleration', type: 'number', default: 20 },

        { name: 'cameraRelative', type: 'boolean', default: false },
        {
            name: 'Movement Reference',
            type: 'transformable',
            default: null
        },

        { name: 'rotation', type: 'boolean', default: true },
        { name: 'rotationSpeed', type: 'number', default: 12 }
    ],

    outputs: [
        { name: 'exec', type: 'execution' },
        { name: 'speed', type: 'number' },
        { name: 'isMoving', type: 'boolean' },
        { name: 'isRunning', type: 'boolean' },
		{ name: 'isGrounded', type: 'boolean' }
    ],

    execute({ node, actor, engine, readInput }) {
        if (!actor) return;

        const number = (name, fallback = 0) => {
            const value = Number(readInput(name));
            return Number.isFinite(value) ? value : fallback;
        };

        const dt = Math.min(
            Math.max(number('deltaTime', 0.016), 0),
            0.05
        );

        const forward = THREE.MathUtils.clamp(
            number('forward'), -1, 1
        );

        const right = THREE.MathUtils.clamp(
            number('right'), -1, 1
        );
        const run = Boolean(readInput('run'));
		const jump = Boolean(readInput('jump'));
		const jumpSpeed = Math.max(0, number('jumpSpeed', 6));
        const walkSpeed = Math.max(0, number('walkSpeed', 4));
        const runSpeed = Math.max(0, number('runSpeed', 8));

        const acceleration = Math.max(0, number('acceleration', 16));
        const deceleration = Math.max(0, number('deceleration', 20));

        const rotationSpeed = Math.max(0, number('rotationSpeed', 12));
        const rotationEnabled = Boolean(readInput('rotation'));

        const cameraRelative = Boolean(readInput('cameraRelative'));

        let state = states.get(node);

        if (!state) {
            state = {
				velocity: new THREE.Vector3(),
                direction: new THREE.Vector3(),
                speed: 0,
				jumpPressed: false,
				isGrounded: false,
                groundedHold: 0,
                jumpGroundLock: 0,
                yaw: null
            };

            states.set(node, state);
        }

        // Input direction
        const x = right;
        const z = -forward;

        const direction = new THREE.Vector3(x, 0, z);

        if (direction.lengthSq() > 1) {
            direction.normalize();
        }

        // Transform local input into world direction
        if (cameraRelative) {
            const hasMovementReference = node.pins?.some(pin =>
                pin.name === 'Movement Reference' && pin.direction === 'input'
            );
            let reference = hasMovementReference
                ? readInput('Movement Reference')
                : null;

            // Compatibility for graphs saved before Movement Reference was
            // introduced. New graphs make this dependency explicit.
            if (!reference && !hasMovementReference) {
                let highestPriority = -Infinity;
                actor.traverse?.(object => {
                    if (
                        object.isCamera &&
                        object.userData?.activeCamera === true &&
                        Number(object.userData?.cameraPriority ?? 0) > highestPriority
                    ) {
                        reference = object;
                        highestPriority = Number(
                            object.userData?.cameraPriority ?? 0
                        );
                    }
                });
            }

            if (reference) {
                reference.updateWorldMatrix?.(true, false);
                const rotation = reference.getWorldQuaternion(
                    new THREE.Quaternion()
                );
                const cameraForward = new THREE.Vector3(0, 0, -1)
                    .applyQuaternion(rotation);

                cameraForward.y = 0;

                if (cameraForward.lengthSq() < 1e-8) {
                    cameraForward.set(0, 0, -1);
                }

                cameraForward.normalize();

                const cameraRight = new THREE.Vector3()
                    .crossVectors(
                        cameraForward,
                        new THREE.Vector3(0, 1, 0)
                    );

                direction.set(0, 0, 0);

                direction.addScaledVector(cameraRight, x);
                direction.addScaledVector(
                    cameraForward,
                    forward
                );

                if (direction.lengthSq() > 0) {
                    direction.normalize();
                }
            }
        } else if (!rotationEnabled) {
            // With automatic rotation disabled, inputs are actor-local.
            // When enabled they must remain world-relative; rotating an
            // already actor-relative direction creates a continuous spin.
            direction.applyQuaternion(actor.getWorldQuaternion(
                new THREE.Quaternion()
            ));
            direction.y = 0;

            if (direction.lengthSq() > 0) {
                direction.normalize();
            }
        }

        const moving = forward !== 0 || right !== 0;
        const targetSpeed = moving
            ? (run ? runSpeed : walkSpeed)
            : 0;

        const targetVelocity = direction.clone().multiplyScalar(targetSpeed);

        const rate = moving ? acceleration : deceleration;

        const difference = targetVelocity.clone().sub(state.velocity);
        const maxChange = rate * dt;

        if (difference.length() > maxChange && maxChange > 0) {
            difference.setLength(maxChange);
        }

        state.velocity.add(difference);

        const body = engine?.getPhysicsBody?.(actor);
        const dynamicBody = body?.isDynamic?.() === true;

        if (dynamicBody) {
			state.jumpGroundLock = Math.max(
				0,
				state.jumpGroundLock - dt
			);
			const hasGroundContact =
				state.jumpGroundLock === 0 &&
				engine?.isGrounded?.(actor, 0.25) === true;

			if (hasGroundContact) {
				state.groundedHold = 0.15;
			} else {
				state.groundedHold = Math.max(0, state.groundedHold - dt);
			}

			// A short hold prevents animation/state flicker while moving across
			// triangle seams. Jumping still requires a current contact below.
			state.isGrounded = hasGroundContact || state.groundedHold > 0;
			const verticalVelocity = body.linvel().y;
			const shouldJump =
				jump &&
				!state.jumpPressed &&
				hasGroundContact &&
				verticalVelocity <= 0.1;

			if (shouldJump) {
				state.isGrounded = false;
				state.groundedHold = 0;
				state.jumpGroundLock = 0.12;
			}

			const nextVerticalVelocity = shouldJump
				? jumpSpeed
				: verticalVelocity;
            body.setLinvel({
                x: state.velocity.x,
                y: nextVerticalVelocity,
                z: state.velocity.z
            }, true);
        } else if (maxChange > 0) {
			state.isGrounded = false;
            actor.position.addScaledVector(state.velocity, dt);
        }

		state.jumpPressed = jump;

        const horizontalVelocity = new THREE.Vector3(
            state.velocity.x,
            0,
            state.velocity.z
        );
        const shouldRotate =
            rotationEnabled &&
            rotationSpeed > 0 &&
            horizontalVelocity.lengthSq() > 0.0025;

        // Dynamic character bodies must stay upright. Collision impulses can
        // otherwise tip the capsule and roll any camera parented to the actor.
        if (dynamicBody) {
            // Lock pitch and roll at the solver level. Correcting rotation
            // before the physics step alone still lets steep terrain tip the
            // body during that step, producing a visibly rolled frame.
            body.setEnabledRotations(false, true, false, true);
            const bodyRotation = body.rotation();
            const currentRotation = new THREE.Quaternion(
                bodyRotation.x,
                bodyRotation.y,
                bodyRotation.z,
                bodyRotation.w
            );
            if (!Number.isFinite(state.yaw)) {
                state.yaw = yawFromQuaternion(currentRotation);
            }

            if (shouldRotate) {
                const targetYaw = Math.atan2(
                    -horizontalVelocity.x,
                    -horizontalVelocity.z
                );
                state.yaw = dampAngle(
                    state.yaw,
                    targetYaw,
                    rotationSpeed,
                    dt
                );
            }

            const uprightRotation = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                state.yaw
            );
            body.setAngvel({ x: 0, y: 0, z: 0 }, true);
            body.setRotation(uprightRotation, true);
        // Smoothly face movement direction for non-physics actors.
        } else if (shouldRotate) {
            if (!Number.isFinite(state.yaw)) {
                state.yaw = yawFromQuaternion(
                    actor.getWorldQuaternion(new THREE.Quaternion())
                );
            }
            const targetYaw = Math.atan2(
                -horizontalVelocity.x,
                -horizontalVelocity.z
            );
            state.yaw = dampAngle(
                state.yaw,
                targetYaw,
                rotationSpeed,
                dt
            );
            actor.quaternion.setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                state.yaw
            );
        }

        state.speed = state.velocity.length();
        state.direction.copy(direction);

        state.isMoving = state.speed > 0.05;
        state.isRunning = run && moving && state.isMoving;
    },

    evaluate({ node, output }) {
        const state = states.get(node);

        if (output === 'speed') return state?.speed ?? 0;
        if (output === 'isMoving') return state?.isMoving ?? false;
        if (output === 'isRunning') return state?.isRunning ?? false;
		if (output === 'isGrounded') return state?.isGrounded ?? false;

        return undefined;
    }
});
