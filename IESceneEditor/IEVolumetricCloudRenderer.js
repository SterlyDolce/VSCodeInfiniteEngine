// @ts-nocheck

import * as THREE from 'three';

/** Camera-centered sky shell with ray-marched, horizon-faded cloud layer. */
export default class IEVolumetricCloudRenderer {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.elapsed = 0;
    this._sunDirection = new THREE.Vector3(0.4, 0.8, 0.25).normalize();
  }

  value(prop, fallback) {
    const v = prop == null ? fallback : typeof prop.getValue === 'function' ? prop.getValue() : prop;
    return v == null ? fallback : v;
  }

  create() {
    const uniforms = {
      uTime: { value: this.elapsed },
      uCoverage: { value: 0.48 },
      uDensity: { value: 0.8 },
      uScale: { value: 0.012 },
      uHeight: { value: 120 },
      uThickness: { value: 60 },
      uWind: { value: new THREE.Vector2(0.8, 0.25) },
      uSunDir: { value: this._sunDirection.clone() },
      uSunColor: { value: new THREE.Color('#fff5dc') },
      uCloudColor: { value: new THREE.Color('#ffffff') },
      uShadowColor: { value: new THREE.Color('#78869b') },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.BackSide,
      vertexShader: `
        varying vec3 vWorldPosition;

        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPosition = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        precision highp float;

        varying vec3 vWorldPosition;

        uniform float uTime, uCoverage, uDensity, uScale, uHeight, uThickness;
        uniform vec2 uWind;
        uniform vec3 uSunDir, uSunColor, uCloudColor, uShadowColor;

        float hash(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }

        float noise3(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);

          return mix(
            mix(
              mix(hash(i), hash(i+vec3(1,0,0)), f.x),
              mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x),
              f.y
            ),
            mix(
              mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
              mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x),
              f.y
            ),
            f.z
          );
        }

        float fbm(vec3 p) {
          float v = 0.0;

          v += 0.54 * noise3(p);
          p *= 2.03;

          v += 0.27 * noise3(p);
          p *= 2.01;

          v += 0.13 * noise3(p);

          return v;
        }

        float cloudDensity(vec3 world) {
          float h = (world.y - uHeight) / max(1.0, uThickness);

          if (h <= 0.0 || h >= 1.0) return 0.0;

          vec3 p = world * uScale;
          p.xz += uWind * uTime * 0.02;

          float shape = fbm(p * vec3(0.7, 1.15, 0.7));
          float detail = noise3(p * 3.6) * 0.15;

          float threshold = mix(
            0.73,
            0.30,
            clamp(uCoverage, 0.0, 1.0)
          );

          float amount = smoothstep(
            threshold,
            threshold + 0.16,
            shape - detail
          );

          float vertical =
            smoothstep(0.0, 0.18, h) *
            (1.0 - smoothstep(0.72, 1.0, h));

          return amount * vertical * max(0.0, uDensity);
        }

        void main() {
          vec3 origin = cameraPosition;
          vec3 ray = normalize(vWorldPosition - origin);

          float bottom = uHeight;
          float top = bottom + max(1.0, uThickness);

          // Infinite horizontal cloud slab
          if (abs(ray.y) < 0.00001) discard;

          float t0 = (bottom - origin.y) / ray.y;
          float t1 = (top - origin.y) / ray.y;

          float start = max(0.0, min(t0, t1));
          float endT = max(t0, t1);

          if (endT <= start) discard;

          // Fade distant clouds naturally toward the horizon
          const float MAX_DISTANCE = 4500.0;
          const float FADE_START = 1700.0;
          const float FADE_END = 4100.0;

          if (start >= FADE_END) discard;

          endT = min(endT, MAX_DISTANCE);

          if (endT <= start) discard;

          const int STEPS = 40;

          float stepSize = (endT - start) / float(STEPS);
          float alpha = 0.0;

          vec3 result = vec3(0.0);
          vec3 sunDir = normalize(uSunDir);

          float lightFacing = clamp(
            dot(sunDir, vec3(0.0, 1.0, 0.0)),
            0.0,
            1.0
          );

          for (int i = 0; i < STEPS; ++i) {
            float t = start + (float(i) + 0.5) * stepSize;

            float distanceFade =
              1.0 - smoothstep(FADE_START, FADE_END, t);

            if (distanceFade <= 0.0) continue;

            vec3 pos = origin + ray * t;

            float d = cloudDensity(pos) * distanceFade;

            if (d < 0.001) continue;

            float towardSun = cloudDensity(
              pos + sunDir * 14.0
            );

            float light =
              exp(-towardSun * 2.2) *
              (0.55 + 0.45 * lightFacing);

            vec3 col = mix(
              uShadowColor,
              uCloudColor * uSunColor,
              clamp(light, 0.0, 1.0)
            );

            float a =
              1.0 - exp(-d * stepSize * 0.045);

            result += (1.0 - alpha) * a * col;
            alpha += (1.0 - alpha) * a;

            if (alpha > 0.985) break;
          }

          if (alpha < 0.003) discard;

          gl_FragColor = vec4(
            result / max(alpha, 0.0001),
            alpha
          );

          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });

    // Camera-centered sky sphere instead of finite cloud box
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 20),
      material
    );

    this.mesh.name = 'IE Volumetric Clouds';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;

    this.mesh.onBeforeRender = (_renderer, _scene, camera) => {
      this.mesh.position.setFromMatrixPosition(camera.matrixWorld);
      this.mesh.updateMatrixWorld(true);
    };

    this.scene.add(this.mesh);
  }

  update(component, sun) {
    if (!component || this.value(component.enabled, true) === false) {
      this.clear();
      return;
    }

    if (!this.mesh) this.create();

    const u = this.mesh.material.uniforms;

    const number = (name, fallback) =>
      Number(this.value(component[name], fallback));

    u.uCoverage.value = THREE.MathUtils.clamp(
      number('coverage', 0.48),
      0,
      1
    );

    u.uDensity.value = Math.max(
      0,
      number('density', 0.8)
    );

    u.uScale.value = Math.max(
      0.00001,
      number('scale', 0.012)
    );

    u.uHeight.value = number('height', 120);

    u.uThickness.value = Math.max(
      1,
      number('thickness', 60)
    );

    u.uWind.value.set(
      number('windX', 0.8),
      number('windZ', 0.25)
    );

    u.uCloudColor.value.set(
      this.value(component.color, '#ffffff')
    );

    u.uShadowColor.value.set(
      this.value(component.shadowColor, '#78869b')
    );

    if (sun) {
      sun.updateWorldMatrix(true, false);
      sun.target.updateWorldMatrix(true, false);

      this._sunDirection.subVectors(
        new THREE.Vector3().setFromMatrixPosition(sun.matrixWorld),
        new THREE.Vector3().setFromMatrixPosition(sun.target.matrixWorld)
      ).normalize();

      u.uSunDir.value.copy(this._sunDirection);
      u.uSunColor.value.copy(sun.color);
    }
  }

  tick(deltaSeconds) {
    if (!this.mesh) return;

    this.elapsed += Math.max(0, deltaSeconds || 0);

    this.mesh.material.uniforms.uTime.value = this.elapsed;
  }

  clear() {
    if (!this.mesh) return;

    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();

    this.mesh = null;
  }

  dispose() {
    this.clear();
  }
}
