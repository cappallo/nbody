import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { Body } from '../physics/ThreeBodySystem';

const TRAIL_CAPACITY = 2000;
interface BodyVisual {
  group: THREE.Group;
  core: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  trail: Line2;
  positions: THREE.InterleavedBuffer;
  colors: THREE.InterleavedBuffer;
  color: THREE.Color;
}

const starVertex = `
  attribute float brightness;
  varying float vBrightness;
  void main() {
    vBrightness = brightness;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = 1.0 + brightness * 1.5;
  }
`;
const starFragment = `
  varying float vBrightness;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float alpha = (1.0 - smoothstep(0.0, 1.0, d)) * vBrightness;
    gl_FragColor = vec4(mix(vec3(0.38, 0.52, 0.85), vec3(0.85, 0.91, 1.0), vBrightness), alpha);
  }
`;
const bodyVertex = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosition = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const bodyFragment = `
  uniform vec3 bodyColor;
  uniform float time;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vLocal;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 view = normalize(cameraPosition - vPosition);
    float rim = pow(1.0 - max(0.0, dot(n, view)), 2.5);
    float bands = sin(vLocal.y * 21.0 + sin(vLocal.x * 13.0 + time * 0.22) * 1.8
      + sin(vLocal.z * 17.0 - time * 0.16));
    float grain = sin(vLocal.x * 45.0 + vLocal.z * 37.0 + time * 0.1) * 0.06;
    float light = 0.45 + 0.55 * max(0.0, dot(n, normalize(vec3(-0.4, 0.8, 1.0))));
    vec3 color = bodyColor * (0.55 + bands * 0.11 + grain) * light;
    color += bodyColor * rim * 2.4 + vec3(1.0, 0.86, 0.7) * pow(max(0.0, dot(n, view)), 18.0) * 0.4;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** The renderer consumes physics positions; camera and effects never change them. */
export class SpaceRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100000);
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private visuals: BodyVisual[] = [];
  private sky = new THREE.Group();
  private grid = new THREE.Group();
  private halo: THREE.CanvasTexture;
  private following = true;
  private bounds = new THREE.Box3();
  private center = new THREE.Vector3();
  private size = new THREE.Vector3();
  private offset = new THREE.Vector3();
  private point = new THREE.Vector3();
  private width = 1;
  private height = 1;
  private onStart: () => void;

  constructor(canvas: HTMLCanvasElement, onInteraction: () => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'default' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0x03050c);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.camera.position.set(430, 300, 580);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = 5;
    this.controls.maxPolarAngle = Math.PI - 0.02;
    this.controls.minPolarAngle = 0.02;
    this.controls.autoRotateSpeed = 0.45;
    this.controls.listenToKeyEvents(canvas);
    this.onStart = () => {
      this.following = false;
      this.controls.autoRotate = false;
      onInteraction();
    };
    this.controls.addEventListener('start', this.onStart);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.55, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.halo = this.createHalo();
    this.createSky();
    this.createGrid();
  }

  private createHalo(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(0.15, 'rgba(255,255,255,0.22)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.045)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }

  private createSky(): void {
    // A fixed seed keeps the sky stable across resets and React remounts.
    let seed = 2137;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const positions = [], brightness = [];
    for (let i = 0; i < 1500; i++) {
      const y = random() * 2 - 1, phi = random() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      positions.push(5000 * r * Math.cos(phi), 5000 * y, 5000 * r * Math.sin(phi));
      brightness.push(0.15 + random() ** 3 * 0.7);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('brightness', new THREE.Float32BufferAttribute(brightness, 1));
    const stars = new THREE.Points(geometry, new THREE.ShaderMaterial({
      vertexShader: starVertex, fragmentShader: starFragment, transparent: true, depthWrite: false,
      depthTest: false, blending: THREE.AdditiveBlending,
    }));
    stars.renderOrder = -10;
    this.sky.add(stars);
    for (const [x, y, z, color] of [[-1800, 600, -2600, 0x543da1], [1700, -400, -2200, 0x185778]]) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.halo, color, opacity: 0.18, blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false,
      }));
      sprite.position.set(x, y, z);
      sprite.scale.set(6000, 4000, 1);
      sprite.renderOrder = -11;
      this.sky.add(sprite);
    }
    this.scene.add(this.sky);
  }

  private createGrid(): void {
    const helper = new THREE.GridHelper(2400, 48, 0x465d85, 0x23304a);
    helper.material.transparent = true;
    helper.material.opacity = 0.22;
    helper.material.depthWrite = false;
    this.grid.add(helper);
    for (const radius of [160, 320, 640]) {
      const points = Array.from({ length: 160 }, (_, i) => {
        const angle = i * Math.PI / 80;
        return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      });
      this.grid.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0x5f789f, transparent: true, opacity: 0.2, depthWrite: false })));
    }
    this.grid.position.y = -260;
    this.scene.add(this.grid);
  }

  private createVisual(body: Body): BodyVisual {
    const color = new THREE.Color(body.color);
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), new THREE.ShaderMaterial({
      uniforms: { bodyColor: { value: color }, time: { value: 0 } },
      vertexShader: bodyVertex, fragmentShader: bodyFragment,
    }));
    group.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.halo, color,
      opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(8, 8, 1);
    group.add(glow);
    this.scene.add(group);

    // Allocate trail buffers once, then update them in place (no per-frame GPU allocation).
    const geometry = new LineGeometry();
    geometry.setPositions(new Float32Array(TRAIL_CAPACITY * 3));
    geometry.setColors(new Float32Array(TRAIL_CAPACITY * 3));
    const material = new LineMaterial({ color: 0xffffff, vertexColors: true, transparent: true,
      opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    material.linewidth = 2;
    const trail = new Line2(geometry, material);
    trail.frustumCulled = false;
    trail.visible = false;
    this.scene.add(trail);
    return { group, core, trail, color,
      positions: (geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute).data,
      colors: (geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute).data };
  }

  private clearVisuals(): void {
    for (const v of this.visuals) {
      this.scene.remove(v.group, v.trail);
      this.disposeObject(v.group);
      this.disposeObject(v.trail);
    }
    this.visuals = [];
  }

  public resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setSize(this.width, this.height);
  }

  private measure(bodies: Body[]): number {
    this.bounds.makeEmpty();
    for (const body of bodies) {
      this.bounds.expandByPoint(this.point.fromArray(body.position));
      for (const p of body.trail) this.bounds.expandByPoint(this.point.fromArray(p));
    }
    this.bounds.getCenter(this.center);
    this.bounds.getSize(this.size);
    const radius = Math.max(100, this.size.length() * 0.5 + 30);
    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * Math.min(1, this.camera.aspect));
    return radius / Math.sin(halfFov) * 1.12;
  }

  public fit(bodies: Body[], resetAngle = false): void {
    const distance = this.measure(bodies);
    this.offset.copy(this.camera.position).sub(this.controls.target).normalize();
    if (resetAngle) this.offset.set(0.8, 0.55, 1.3).normalize();
    this.controls.target.copy(this.center);
    this.camera.position.copy(this.center).addScaledVector(this.offset, distance);
    this.camera.far = Math.max(20000, distance * 30);
    this.camera.updateProjectionMatrix();
    this.controls.update(0);
  }

  public setFollowing(value: boolean): void { this.following = value; }
  public setOrbiting(value: boolean): void { this.controls.autoRotate = value; }
  public setGrid(value: boolean): void { this.grid.visible = value; }
  public setBloom(value: boolean): void { this.bloom.enabled = value; }

  public render(bodies: Body[], time: number, delta: number): void {
    if (this.visuals.length !== bodies.length) {
      this.clearVisuals();
      this.visuals = bodies.map(body => this.createVisual(body));
    }
    bodies.forEach((body, i) => {
      const v = this.visuals[i];
      v.group.position.fromArray(body.position);
      v.group.scale.setScalar(body.radius);
      v.core.material.uniforms.time.value = time;
      const count = Math.min(body.trail.length, TRAIL_CAPACITY);
      const start = body.trail.length - count;
      v.trail.visible = count > 1;
      v.trail.geometry.instanceCount = Math.max(0, count - 1);
      for (let j = 0; j < count - 1; j++) {
        for (let end = 0; end < 2; end++) {
          const p = body.trail[start + j + end];
          const intensity = 0.02 + 2.3 * ((j + end) / Math.max(1, count - 1)) ** 1.8;
          for (let axis = 0; axis < 3; axis++) {
            v.positions.array[j * 6 + end * 3 + axis] = p[axis];
            v.colors.array[j * 6 + end * 3 + axis] = [v.color.r, v.color.g, v.color.b][axis] * intensity;
          }
        }
      }
      v.positions.needsUpdate = true;
      v.colors.needsUpdate = true;
      v.trail.material.resolution.set(this.width, this.height);
    });
    if (this.following) {
      const distance = this.measure(bodies);
      const alpha = 1 - Math.exp(-delta * 3);
      this.offset.copy(this.camera.position).sub(this.controls.target);
      const length = THREE.MathUtils.lerp(this.offset.length(), distance, alpha);
      this.controls.target.lerp(this.center, alpha);
      this.camera.position.copy(this.controls.target).add(this.offset.setLength(length));
      this.camera.far = Math.max(20000, distance * 30);
      this.camera.updateProjectionMatrix();
      this.grid.position.copy(this.center);
      const scale = Math.max(1, this.size.length() / 700);
      this.grid.position.y -= 260 * scale;
      this.grid.scale.setScalar(scale);
    }
    this.controls.update(delta);
    this.sky.position.copy(this.camera.position);
    this.composer.render(delta);
  }

  private disposeObject(object: THREE.Object3D): void {
    object.traverse(child => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach(material => material.dispose());
      else mesh.material?.dispose();
    });
  }

  public dispose(): void {
    this.controls.removeEventListener('start', this.onStart);
    this.controls.dispose();
    this.disposeObject(this.scene);
    this.halo.dispose();
    this.composer.passes.forEach(pass => pass.dispose());
    this.composer.dispose();
    this.renderer.dispose();
  }
}
