// @ts-nocheck
import IEVolumetricCloudRenderer from './IEVolumetricCloudRenderer.js';

import * as THREE from 'three';

export default class IEEnvironmentRenderer {
    constructor(scene) {
        this.scene = scene;

        this.environment = null;

        this.sky = null;
        this.sun = null;
        this.sunTarget = null;
        this.ambient = null;
        this.fog = null;
        this.clouds = new IEVolumetricCloudRenderer(scene);

        this.originalBackground = scene.background;
        this.originalFog = scene.fog;
    }

    setEnvironment(actor) {
        if (this.environment !== actor) {
            this.clear();
            this.environment = actor;
        }

        this.update();
    }

    update() {
        const actor = this.environment;
        if (!actor) return;

        const get = type =>
            actor.components.find(
                component => component.type === type
            );

        this.updateSky(get('sky'));
        this.updateSun(get('directionalLight'));
        this.updateAmbient(get('ambientLight'));
        this.updateFog(get('fog'));
        this.clouds.update(get('volumetricCloud'), this.sun);
    }

    value(property, fallback) {
        if (property === undefined || property === null) {
            return fallback;
        }

        return typeof property.getValue === 'function'
            ? property.getValue()
            : property;
    }

    updateSky(component) {
        if (!component || component.enabled === false) {
            this.removeSky();
            return;
        }

        if (!this.sky) {
            const geometry = new THREE.SphereGeometry(500, 32, 20);

            const material = new THREE.ShaderMaterial({
                side: THREE.BackSide,
                depthWrite: false,
                uniforms: {
                    uTopColor: {
                        value: new THREE.Color('#5fa9ff')
                    },
                    uHorizonColor: {
                        value: new THREE.Color('#b9dcff')
                    },
                    uBottomColor: {
                        value: new THREE.Color('#eaf4ff')
                    }
                },
                vertexShader: `
                varying vec3 vWorldPosition;

                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;

                    gl_Position = projectionMatrix * viewMatrix * worldPosition;
                }
            `,
                fragmentShader: `
                varying vec3 vWorldPosition;

                uniform vec3 uTopColor;
                uniform vec3 uHorizonColor;
                uniform vec3 uBottomColor;

                void main() {
                    vec3 dir = normalize(vWorldPosition - cameraPosition);

                    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

                    vec3 color;

                    if (h < 0.5) {
                        float t = h / 0.5;
                        color = mix(uBottomColor, uHorizonColor, t);
                    } else {
                        float t = (h - 0.5) / 0.5;
                        color = mix(uHorizonColor, uTopColor, t);
                    }

                    gl_FragColor = vec4(color, 1.0);

                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                }
            `
            });

            this.sky = new THREE.Mesh(geometry, material);
            this.sky.name = 'IE Environment Sky';
            this.sky.frustumCulled = false;

            this.sky.onBeforeRender = (_renderer, _scene, camera) => {
                this.sky.position.setFromMatrixPosition(camera.matrixWorld);
                this.sky.updateMatrixWorld();
            };

            this.scene.add(this.sky);
        }

        const uniforms = this.sky.material.uniforms;

        uniforms.uTopColor.value.set(
            this.value(component.topColor, '#5fa9ff')
        );

        uniforms.uHorizonColor.value.set(
            this.value(component.horizonColor, '#b9dcff')
        );

        uniforms.uBottomColor.value.set(
            this.value(component.bottomColor, '#eaf4ff')
        );

        this.scene.background = null;
    }

    removeSky() {
        if (!this.sky) {
            this.scene.background = this.originalBackground;
            return;
        }

        this.scene.remove(this.sky);
        this.sky.geometry.dispose();
        this.sky.material.dispose();
        this.sky = null;

        this.scene.background = this.originalBackground;
    }

    updateSun(component) {
        if (!component || component.enabled === false) {
            this.removeSun();
            return;
        }

        if (!this.sun) {
            this.sun = new THREE.DirectionalLight();

            this.sun.name = 'IE Environment Sun';

            this.sunTarget = this.sun.target;
            this.sunTarget.name = 'IE Environment Sun Target';

            this.scene.add(this.sun);
            this.scene.add(this.sunTarget);
        }

        this.sun.color.set(
            this.value(component.color, '#ffffff')
        );

        this.sun.intensity = this.value(
            component.intensity,
            1
        );

        this.sun.castShadow = Boolean(
            this.value(component.castShadow, false)
        );

        // Default sun direction until the component's
        // transform is connected.
        this.sun.position.set(30, 60, 20);
        this.sunTarget.position.set(0, 0, 0);

        // Update direction after transform changes.
        this.sunTarget.updateMatrixWorld();
    }

    updateAmbient(component) {
        if (!component || component.enabled === false) {
            this.removeAmbient();
            return;
        }

        if (!this.ambient) {
            this.ambient = new THREE.HemisphereLight();

            this.ambient.name =
                'IE Environment Ambient Light';

            this.scene.add(this.ambient);
        }

        this.ambient.color.set(
            this.value(component.skyColor, '#ffffff')
        );

        this.ambient.groundColor.set(
            this.value(component.groundColor, '#444444')
        );

        this.ambient.intensity = this.value(
            component.intensity,
            1
        );
    }

    updateFog(component) {
        if (!component || component.enabled === false) {
            if (this.scene.fog === this.fog) {
                this.scene.fog = this.originalFog;
            }

            this.fog = null;
            return;
        }

        const mode = this.value(component.mode, 'linear');
        const color = this.value(component.color, '#AABBD0');

        if (mode === 'exponential') {
            if (!(this.fog instanceof THREE.FogExp2)) {
                this.fog = new THREE.FogExp2();
            }

            this.fog.color.set(color);
            this.fog.density = Math.max(
                0,
                Number(this.value(component.density, 0.01))
            );
        } else {
            if (!(this.fog instanceof THREE.Fog)) {
                this.fog = new THREE.Fog();
            }

            this.fog.color.set(color);
            this.fog.near = Math.max(
                0,
                Number(this.value(component.near, 10))
            );

            this.fog.far = Math.max(
                this.fog.near + 0.01,
                Number(this.value(component.far, 150))
            );
        }

        this.scene.fog = this.fog;
    }

    removeSun() {
        if (!this.sun) return;

        this.scene.remove(this.sun);
        this.scene.remove(this.sunTarget);

        this.sun.shadow.dispose();

        this.sun = null;
        this.sunTarget = null;
    }

    removeAmbient() {
        if (!this.ambient) return;

        this.scene.remove(this.ambient);
        this.ambient = null;
    }

    clear() {
        this.clouds.clear();
        this.removeSky();
        this.removeSun();
        this.removeAmbient();

        if (this.scene.fog === this.fog) {
            this.scene.fog = this.originalFog;
        }

        this.fog = null;
        this.environment = null;
    }

    dispose() {
        this.clear();
        this.clouds.dispose();
    }
}
