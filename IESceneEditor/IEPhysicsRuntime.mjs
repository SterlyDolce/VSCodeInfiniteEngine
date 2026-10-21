// @ts-nocheck
import * as THREE from 'three';

let rapierReady;
let RAPIER;

function initializeRapier() {
    rapierReady ??= (async () => {
        const uri = globalThis.INFINITE_ASSETS?.rapierModule ??
            '@dimforge/rapier3d-compat';
        const module = await import(uri);
        RAPIER = module.default;
        await RAPIER.init();
    })();
    return rapierReady;
}

const positive = (value, fallback) =>
    Number.isFinite(value) && value > 0 ? value : fallback;

const finite = (value, fallback = 0) =>
    Number.isFinite(value) ? value : fallback;

const BODY_TYPES = {
    dynamic: 'dynamic',
    fixed: 'fixed',
    kinematicposition: 'kinematicPosition',
    kinematicvelocity: 'kinematicVelocity'
};

// Rapier consumes the height matrix in column-major order. Infinite Engine's
// plane vertices are row-major (Z rows, X columns), so copying the position
// buffer directly transposes the collision surface whenever X/Z samples vary.
export function createTerrainHeightfield(geometry) {
	const rows = geometry.resolutionY;
	const columns = geometry.resolutionX;
	const sampleRows = rows + 1;
	const sampleColumns = columns + 1;
	const heights = new Float32Array(sampleRows * sampleColumns);

	for (let column = 0; column < sampleColumns; column++) {
		for (let row = 0; row < sampleRows; row++) {
			const vertex = row * sampleColumns + column;
			const matrix = row + column * sampleRows;
			heights[matrix] = finite(geometry.positions[vertex * 3 + 1]);
		}
	}

	return { rows, columns, heights };
}

const normalizeBodyType = value =>
    BODY_TYPES[String(value ?? 'fixed').trim().toLowerCase()];

const normalizeColliderShape = value => {
    const shape = String(value ?? 'box').trim().toLowerCase();
    return ['box', 'sphere', 'capsule'].includes(shape) ? shape : 'box';
};

export class IEPhysicsRuntime {
    constructor(root, options = {}) {
        this.root = root;
        this.gravity = options.gravity ?? { x: 0, y: -9.81, z: 0 };
        this.world = null;
        this.eventQueue = null;
        this.entries = [];
        this.colliderActors = new Map();
        this.actorBodies = new WeakMap();
        this.actorGroundDistances = new WeakMap();
        this.accumulator = 0;
        this.fixedDelta = 1 / 60;
        this.ready = false;
    }

    async initialize() {
        await initializeRapier();
        this.world = new RAPIER.World(this.gravity);
        this.world.timestep = this.fixedDelta;
        this.eventQueue = new RAPIER.EventQueue(true);
        this.root.updateMatrixWorld(true);

        this.root.traverse(actor => {
            if (!actor.userData?.isActorRoot) return;
            this.createActorPhysics(actor);
        });

        this.ready = true;
        return this;
    }

    createActorPhysics(actor) {
        const components = actor.userData.components ?? [];
        const colliders = components.filter(component =>
            component.type === 'collider' && component.enabled !== false
        );
        const rigidBodyComponent = components.find(component =>
            component.type === 'rigidBody' && component.enabled !== false
        );
		const terrains = components.filter(component =>
			component.type === 'terrain' && component.enabled !== false && component.physics !== false && component.resolvedTerrain?.geometry
		);

        // A collider without an explicit body is a static collider. Conversely,
        // a rigid body is still useful without a collider (for example, as a
        // physics-driven parent or while its collider is being configured).
        if (!colliders.length && !terrains.length && !rigidBodyComponent) return;

        const rigidBody = rigidBodyComponent ?? { bodyType: 'fixed' };

        const descriptors = {
            dynamic: RAPIER.RigidBodyDesc.dynamic,
            fixed: RAPIER.RigidBodyDesc.fixed,
            kinematicPosition: RAPIER.RigidBodyDesc.kinematicPositionBased,
            kinematicVelocity: RAPIER.RigidBodyDesc.kinematicVelocityBased
        };
        const bodyType = normalizeBodyType(rigidBody.bodyType);
        const createDescriptor = descriptors[bodyType];

        if (!createDescriptor) {
            throw new Error(`Unsupported rigid body type: ${rigidBody.bodyType}`);
        }
        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        actor.matrixWorld.decompose(position, rotation, scale);

        const bodyDesc = createDescriptor()
            .setTranslation(position.x, position.y, position.z)
            .setRotation(rotation)
            .setGravityScale(finite(rigidBody.gravityScale, 1))
            .setLinearDamping(Math.max(0, finite(rigidBody.linearDamping)))
            .setAngularDamping(Math.max(0, finite(rigidBody.angularDamping)))
            .setCanSleep(rigidBody.canSleep ?? true)
            .setCcdEnabled(rigidBody.ccd ?? false)
            .setUserData({ actorId: actor.userData.actorId });

        // Rapier derives a dynamic body's mass from its colliders. Give a
        // collider-less body a usable default mass so gravity and impulses do
        // not silently leave it immobile.
        if (bodyType === 'dynamic' && colliders.length === 0) {
            bodyDesc.setAdditionalMass(1);
        }

        const body = this.world.createRigidBody(bodyDesc);
        this.actorBodies.set(actor, body);
		this.actorGroundDistances.set(
			actor,
			colliders.reduce((distance, component) => {
				const offsetY = finite(component.offset?.[1]) * scale.y;
				const shape = normalizeColliderShape(component.shape);
				let extent;

				if (shape === 'sphere') {
					extent = positive(component.radius, 0.5) * Math.max(
						Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)
					);
				} else if (shape === 'capsule') {
					extent = positive(component.height, 1) * Math.abs(scale.y) * 0.5 +
						positive(component.radius, 0.5) * Math.max(
							Math.abs(scale.x), Math.abs(scale.z)
						);
				} else {
					extent = positive(component.size?.[1], 1) * Math.abs(scale.y) * 0.5;
				}

				return Math.max(distance, extent - offsetY);
			}, 0)
		);
        body.setEnabledTranslations(
            !rigidBody.lockPositionX,
            !rigidBody.lockPositionY,
            !rigidBody.lockPositionZ,
            false
        );
        body.setEnabledRotations(
            !rigidBody.lockRotationX,
            !rigidBody.lockRotationY,
            !rigidBody.lockRotationZ,
            false
        );

        for (const component of colliders) {
            const descriptor = this.createColliderDescriptor(component, scale);
            const collider = this.world.createCollider(descriptor, body);
            this.colliderActors.set(collider.handle, actor);
        }
		for (const component of terrains) {
			const geometry = component.resolvedTerrain.geometry;
			const { rows, columns, heights } = createTerrainHeightfield(geometry);
			const descriptor = RAPIER.ColliderDesc.heightfield(
				rows, columns, heights,
				{
					x: geometry.width * Math.abs(scale.x),
					y: Math.abs(scale.y),
					z: geometry.depth * Math.abs(scale.z)
				},
				RAPIER.HeightFieldFlags.FIX_INTERNAL_EDGES
			).setFriction(Math.max(0, finite(component.friction, .8)))
			 .setRestitution(Math.max(0, finite(component.restitution)));
			const collider = this.world.createCollider(descriptor, body);
			this.colliderActors.set(collider.handle, actor);
		}

        this.entries.push({
            actor,
            body,
            bodyType
        });
    }

    createColliderDescriptor(component, scale) {
        const size = component.size ?? [1, 1, 1];
        const radiusScale = Math.max(Math.abs(scale.x), Math.abs(scale.z));
        const shape = normalizeColliderShape(component.shape);
        let descriptor;

        if (shape === 'sphere') {
            descriptor = RAPIER.ColliderDesc.ball(
                positive(component.radius, 0.5) * Math.max(radiusScale, Math.abs(scale.y))
            );
        } else if (shape === 'capsule') {
            descriptor = RAPIER.ColliderDesc.capsule(
                positive(component.height, 1) * Math.abs(scale.y) * 0.5,
                positive(component.radius, 0.5) * radiusScale
            );
        } else {
            descriptor = RAPIER.ColliderDesc.cuboid(
                positive(size[0], 1) * Math.abs(scale.x) * 0.5,
                positive(size[1], 1) * Math.abs(scale.y) * 0.5,
                positive(size[2], 1) * Math.abs(scale.z) * 0.5
            );
        }

        const offset = component.offset ?? [0, 0, 0];
        descriptor
            // Collider coordinates are local to the rigid body. Since the
            // actor's world scale is baked into the collider dimensions, its
            // local offset must be scaled as well or the helper and collider
            // diverge for scaled actors.
            .setTranslation(
                finite(offset[0]) * scale.x,
                finite(offset[1]) * scale.y,
                finite(offset[2]) * scale.z
            )
            .setFriction(Math.max(0, finite(component.friction, 0.5)))
            .setRestitution(Math.max(0, finite(component.restitution)))
            .setDensity(positive(component.density, 1))
            .setSensor(component.sensor ?? false);

        if (component.collisionEvents !== false) {
            descriptor.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
        }
        return descriptor;
    }

    update(deltaTime) {
        if (!this.ready || !this.world) return;

        if (!Number.isFinite(deltaTime) || deltaTime <= 0) return;

        for (const entry of this.entries) {
            if (!entry.bodyType.startsWith('kinematic')) continue;
            entry.actor.updateMatrixWorld(true);
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            entry.actor.matrixWorld.decompose(position, rotation, scale);
            entry.body.setNextKinematicTranslation(position);
            entry.body.setNextKinematicRotation(rotation);
        }

        this.accumulator = Math.min(this.accumulator + deltaTime, 0.25);
        while (this.accumulator >= this.fixedDelta) {
            this.world.step(this.eventQueue);
            this.drainEvents();
            this.accumulator -= this.fixedDelta;
        }

        for (const entry of this.entries) {
            if (entry.bodyType !== 'dynamic') continue;
            this.applyBodyTransform(entry.actor, entry.body);
        }
    }

    getBody(actor) {
        return actor?.isObject3D
            ? this.actorBodies.get(actor) ?? null
            : null;
    }

	castSpringArm(origin, target, radius = 0.25, actor = null) {
		if (!this.ready || !this.world) return null;

		const dx = target.x - origin.x;
		const dy = target.y - origin.y;
		const dz = target.z - origin.z;
		const distance = Math.hypot(dx, dy, dz);
		if (distance <= 1e-6) return null;

		const direction = {
			x: dx / distance,
			y: dy / distance,
			z: dz / distance
		};
		const hit = this.world.castShape(
			origin,
			{ x: 0, y: 0, z: 0, w: 1 },
			direction,
			new RAPIER.Ball(positive(radius, 0.25)),
			0,
			distance,
			true,
			undefined,
			undefined,
			undefined,
			actor ? this.getBody(actor) : undefined
		);

		return hit ? Math.max(0, Math.min(distance, hit.time_of_impact)) : null;
	}

	getGroundContact(actor, origin, maxDistance = 1) {
		if (!this.ready || !this.world || !origin) return null;

		const body = this.getBody(actor);
		if (!body) return null;

		const ray = new RAPIER.Ray(
			{ x: origin.x, y: origin.y, z: origin.z },
			{ x: 0, y: -1, z: 0 }
		);
		const hit = this.world.castRayAndGetNormal(
			ray,
			Math.max(0, finite(maxDistance, 1)),
			true,
			undefined,
			undefined,
			undefined,
			body
		);

		if (!hit || hit.normal.y < 0.25) return null;

		const distance = finite(
			hit.timeOfImpact ?? hit.toi,
			0
		);
		return {
			distance,
			point: {
				x: origin.x,
				y: origin.y - distance,
				z: origin.z
			},
			normal: {
				x: hit.normal.x,
				y: hit.normal.y,
				z: hit.normal.z
			}
		};
	}

	isGrounded(actor, tolerance = 0.15) {
		if (!this.ready || !this.world) return false;

		const body = this.getBody(actor);
		if (!body) return false;

		const origin = body.translation();
		const minimumGroundNormal = 0.25;
		const ray = new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 });
		const distance = (this.actorGroundDistances.get(actor) ?? 0) +
			Math.max(0, finite(tolerance, 0.15));
		const hit = this.world.castRayAndGetNormal(
			ray,
			distance,
			true,
			undefined,
			undefined,
			undefined,
			body
		);

		if (hit && hit.normal.y >= minimumGroundNormal) return true;

		// A center ray often misses beneath a capsule resting on an uneven or
		// steep heightfield. Inspect the actual contact patch instead.
		for (let index = 0; index < body.numColliders(); index++) {
			const collider = body.collider(index);
			let grounded = false;

			this.world.contactPairsWith(collider, other => {
				if (grounded) return;
				this.world.contactPair(collider, other, manifold => {
					const normal = manifold.normal();
					if (Math.abs(normal.y) < minimumGroundNormal) return;

					for (let contact = 0; contact < manifold.numSolverContacts(); contact++) {
						const point = manifold.solverContactPoint(contact);
						if (point && point.y < origin.y - 0.05) {
							grounded = true;
							break;
						}
					}
				});
			});

			if (grounded) return true;

			// Sweep the whole collider a small distance down. This covers the
			// small separation Rapier permits between resting contacts and avoids
			// depending on a single point beneath the actor origin.
			const shapeHit = this.world.castShape(
				collider.translation(),
				collider.rotation(),
				{ x: 0, y: -1, z: 0 },
				collider.shape,
				0,
				Math.max(0, finite(tolerance, 0.15)),
				true,
				undefined,
				undefined,
				collider,
				body
			);

			if (
				shapeHit &&
				shapeHit.normal1.y >= minimumGroundNormal
			) return true;
		}

		return false;
	}

    applyBodyTransform(actor, body) {
        const translation = body.translation();
        const rotation = body.rotation();
        const worldPosition = new THREE.Vector3(
            translation.x,
            translation.y,
            translation.z
        );
        const worldRotation = new THREE.Quaternion(
            rotation.x,
            rotation.y,
            rotation.z,
            rotation.w
        );

        if (actor.parent) {
            actor.parent.updateMatrixWorld(true);
            actor.position.copy(actor.parent.worldToLocal(worldPosition.clone()));
            const parentRotation = new THREE.Quaternion();
            actor.parent.getWorldQuaternion(parentRotation);
            actor.quaternion.copy(parentRotation.invert().multiply(worldRotation));
        } else {
            actor.position.copy(worldPosition);
            actor.quaternion.copy(worldRotation);
        }
        actor.updateMatrixWorld(true);
    }

    drainEvents() {
        this.eventQueue.drainCollisionEvents((first, second, started) => {
            const actorA = this.colliderActors.get(first);
            const actorB = this.colliderActors.get(second);
            if (!actorA || !actorB) return;

            const type = started ? 'collisionenter' : 'collisionexit';
            actorA.dispatchEvent({ type, otherActor: actorB });
            actorB.dispatchEvent({ type, otherActor: actorA });
        });
    }

    dispose() {
        this.entries.length = 0;
        this.colliderActors.clear();
        this.actorBodies = new WeakMap();
        this.actorGroundDistances = new WeakMap();
        this.eventQueue?.free();
        this.world?.free();
        this.eventQueue = null;
        this.world = null;
        this.ready = false;
    }
}
