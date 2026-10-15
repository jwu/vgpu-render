import { frame, init, surface } from "vgpu";
import { DebugDraw3D, GpuDebugDraw3D, InfiniteGrid3D, type FrameCommand, type Vec3 } from "./index.js";
import { GODOT_EXAMPLES, type GodotExample } from "./godot-examples.js";
import { buildScene } from "./godot-scenes.js";
import sceneSource from "./godot-scenes.ts?raw";
import { cloneDemoConfig, DEFAULT_DEMO_CONFIG, loadDemoConfig, saveDemoConfig, SCREENSHOT_DEMO_CONFIG } from "./demo-config.js";
import "./demo.css";

const params = new URLSearchParams(location.search);
const compareMode = params.get("compare") === "1";
if (compareMode) document.documentElement.classList.add("compare-mode");
let config = compareMode ? cloneDemoConfig(SCREENSHOT_DEMO_CONFIG) : loadDemoConfig(localStorage);
if (params.get("projection") === "orthographic") config.camera.projection = "orthographic";
if (params.get("grid") === "0") config.view.showGrid = false;
const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const list = document.querySelector<HTMLElement>("#example-list")!;
const status = document.querySelector<HTMLElement>("#status")!;
const counts = document.querySelector<HTMLElement>("#counts")!;
const title = document.querySelector<HTMLElement>("#example-title")!;
const family = document.querySelector<HTMLElement>("#example-family")!;
const description = document.querySelector<HTMLElement>("#example-description")!;
const code = document.querySelector<HTMLElement>("#example-code")!;
const animateToggle = document.querySelector<HTMLInputElement>("#animate")!;
const gridToggle = document.querySelector<HTMLInputElement>("#show-grid")!;
const widthScale = document.querySelector<HTMLInputElement>("#line-width-scale")!;
const gridOpacity = document.querySelector<HTMLInputElement>("#grid-opacity")!;
const projection = document.querySelector<HTMLSelectElement>("#projection")!;
const background = document.querySelector<HTMLInputElement>("#background")!;
const resetConfig = document.querySelector<HTMLButtonElement>("#reset-config")!;
let selected: GodotExample = GODOT_EXAMPLES[0]!;
type PointerMode = "rotate" | "pan" | "fps";
type PointerState = { x: number; y: number; mode: PointerMode };
type FpsCamera = { position: [number, number, number]; yaw: number; pitch: number };
let pointer: PointerState | undefined;
let fpsCamera: FpsCamera | undefined;
const keys = new Set<string>();
const FPS_SPEED = 8;
const LOOK_SENSITIVITY = 0.008;
const PAN_SENSITIVITY = 0.0015;
let time = 0;
let previousTimestamp: number | undefined;
let viewProjection: Float32Array = new Float32Array(16);

function selectExample(example: GodotExample, updateHash = true): void {
  selected = example;
  time = 0;
  if (updateHash) location.hash = example.id;
  renderList();
  updateDetails();
}
function renderList(): void {
  list.replaceChildren(...GODOT_EXAMPLES.map((example) => {
    const button = document.createElement("button");
    button.className = `example-button${example.id === selected.id ? " active" : ""}`;
    button.innerHTML = `<strong>${example.title}</strong><small>partial parity</small>`;
    button.onclick = () => selectExample(example);
    return button;
  }));
}
function sourceForExample(id: string): string {
  const header = `import { DebugDraw3D } from "vgpu-render";\n\nconst debug = new DebugDraw3D();\nconst frame = debug.beginFrame();`;
  const examples: Record<string, string> = {
    index: `${header}\n\nframe.point([0, 0, 0], { color: [1, 0.3, 0.2, 1], size: 8 });\nframe.line([0, 0, 0], [1, 0, 0], { color: [0.2, 0.8, 1, 1], width: 2 });\nframe.arrow([0, 0, 0], [0, 1, 0]);\nframe.grid([0, 0, 0], [4, 4], [0.5, 0.5]);\n\nconst commands = debug.finishFrame(frame);`,
    line: `${header}\n\nframe.line([0, 0, 0], [1.1, 0, 0], {\n  color: [0.2, 0.8, 1, 1],\n  width: 2,\n  dash: [0.2, 0.1],\n});\nframe.lineStrip([[0, 0, 0], [0.5, 0, 0.3], [1, 0, 0]], {\n  width: 2,\n  joint: "round",\n});`,
    arrow: `${header}\n\nframe.arrow([0, 0, 0], [1, 0.8, 0], {\n  color: [0.2, 0.8, 1, 1],\n  width: 2,\n  headLength: 0.25,\n  headAngle: Math.PI / 4,\n});`,
    axes: `${header}\n\nframe.axes([0, 0, 0], 1, 2);\nframe.axes([1.5, 0, 0], 0.75, 4);`,
    grid: `${header}\n\nframe.grid([0, 0, 0], [6, 4], [0.35, 0.35], {\n  color: [0.45, 0.55, 0.65, 1],\n  width: 1,\n});`,
    rect: `${header}\n\nframe.lineLoop([\n  [-0.5, 0, -0.35], [0.5, 0, -0.35],\n  [0.5, 0, 0.35], [-0.5, 0, 0.35],\n], { width: 2, joint: "round" });`,
    box: `${header}\n\nframe.mesh(box([1, 0.7, 0.7]), {\n  solid: true,\n  color: [0.2, 0.6, 1, 0.8],\n});`,
    circle: `${header}\n\nframe.lineLoop(circlePoints(0.5, 64), {\n  color: [0.2, 0.8, 1, 1],\n  width: 2,\n});`,
    arc: `${header}\n\nframe.lineStrip(arcPoints(0.5, Math.PI * 1.5, 32), {\n  color: [0.2, 0.8, 1, 1],\n  width: 2,\n});`,
    curve: `${header}\n\nframe.curve({\n  points: [\n    { position: [-1, 0, 0], out: [-0.5, 0, 1] },\n    { position: [1, 0, 0], in: [0.5, 0, -1] },\n  ],\n}, { width: 2, tolerance: 0.08 });`,
    sphere: `${header}\n\nframe.mesh(sphere(0.5), {\n  solid: true,\n  color: [0.2, 0.6, 1, 0.8],\n});`,
    cone: `${header}\n\nframe.mesh(cone(0.5, 1, 32), {\n  solid: true,\n  color: [0.2, 0.6, 1, 0.8],\n});`,
    cylinder: `${header}\n\nframe.mesh(cylinder(0.5, 1, 32), {\n  solid: true,\n  color: [0.2, 0.6, 1, 0.8],\n});`,
    capsule: `${header}\n\nframe.mesh(capsule(0.35, 1, 24), {\n  solid: true,\n  color: [0.2, 0.6, 1, 0.8],\n});`,
    world_space_width: `${header}\n\nframe.line([0, 0, 0], [1, 0, 0], {\n  width: 0.08,\n  widthMode: "world",\n  color: [0.2, 0.8, 1, 1],\n});`,
  };
  return examples[id] ?? examples.index!;
}
function sourceFunction(name: string): string {
  const start = sceneSource.search(new RegExp(`(?:export )?function ${name}\\(`));
  if (start < 0) return "";
  const next = sceneSource.slice(start + 1).search(/\n(?:export )?function /);
  return sceneSource.slice(start, next < 0 ? undefined : start + 1 + next).trim();
}
function actualSourceForExample(id: string): string {
  const sceneNames: Record<string, string> = {
    index: "overviewMatrix",
    line: "lineMatrix",
    arrow: "arrowMatrix",
    axes: "axesMatrix",
    grid: "gridMatrix",
    rect: "rectMatrix",
    box: "boxMatrix",
    circle: "circleMatrix",
    arc: "arcMatrix",
    curve: "curveMatrix",
    sphere: "shapeScene",
    cone: "shapeScene",
    cylinder: "shapeScene",
    capsule: "shapeScene",
    world_space_width: "worldWidthMatrix",
  };
  return `${sourceFunction("buildScene")}\n\n${sourceFunction(sceneNames[id] ?? "overviewMatrix")}`;
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
function highlightSource(source: string): string {
  const tokenPattern = /\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:import|from|const|new|true|false|undefined|solid|width|color|dash|joint|headLength|headAngle|tolerance|widthMode)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*(?=\s*\()/g;
  let output = "";
  let cursor = 0;
  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    output += escapeHtml(source.slice(cursor, index));
    const escaped = escapeHtml(token);
    const className = token.startsWith("//")
      ? "token-comment"
      : token.startsWith('"') || token.startsWith("'") || token.startsWith("`")
        ? "token-string"
        : /^\d/.test(token)
          ? "token-number"
          : /^(?:true|false|undefined)$/.test(token)
            ? "token-boolean"
            : /^(?:import|from|const|new)$/.test(token)
              ? "token-keyword"
              : /^(?:solid|width|color|dash|joint|headLength|headAngle|tolerance|widthMode)$/.test(token)
                ? "token-property"
                : "token-function";
    output += `<span class="${className}">${escaped}</span>`;
    cursor = index + token.length;
  }
  return output + escapeHtml(source.slice(cursor));
}
function updateDetails(): void {
  family.textContent = "source preview";
  title.textContent = selected.title;
  description.textContent = selected.notes ? `${selected.description} — ${selected.notes}` : selected.description;
  code.innerHTML = highlightSource(actualSourceForExample(selected.id));
}
function syncControls(): void {
  animateToggle.checked = config.view.animate;
  gridToggle.checked = config.view.showGrid;
  widthScale.value = String(config.view.lineWidthScale);
  gridOpacity.value = String(config.view.gridOpacity);
  projection.value = config.camera.projection;
  background.value = "#" + config.view.background.slice(0, 3).map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
}
function persist(): void {
  if (!compareMode) {
    try { saveDemoConfig(config, localStorage); } catch { /* Storage can be unavailable. */ }
  }
}
function perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fov / 2);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far / (near - far), -1, 0, 0, near * far / (near - far), 0]);
}
function orthographic(height: number, aspect: number, near: number, far: number): Float32Array {
  return new Float32Array([2 / (height * aspect), 0, 0, 0, 0, 2 / height, 0, 0, 0, 0, 1 / (near - far), 0, 0, 0, near / (near - far), 1]);
}
function lookAt(eye: Vec3, target: Vec3): Float32Array {
  const length = Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]);
  const z: Vec3 = [(eye[0] - target[0]) / length, (eye[1] - target[1]) / length, (eye[2] - target[2]) / length];
  const xLength = Math.hypot(z[2], z[0]);
  const x: Vec3 = xLength < 1e-6 ? [1, 0, 0] : [z[2] / xLength, 0, -z[0] / xLength];
  const y: Vec3 = [z[1] * x[2], z[2] * x[0] - z[0] * x[2], -z[1] * x[0]];
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]), -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]), -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]), 1]);
}
function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) out[col * 4 + row] = a[row]! * b[col * 4]! + a[4 + row]! * b[col * 4 + 1]! + a[8 + row]! * b[col * 4 + 2]! + a[12 + row]! * b[col * 4 + 3]!;
  return out;
}
function cameraBasis(): { right: Vec3; up: Vec3 } {
  const c = config.camera;
  const right: Vec3 = [Math.sin(c.yaw), 0, -Math.cos(c.yaw)];
  const up: Vec3 = [-Math.sin(c.pitch) * Math.cos(c.yaw), Math.cos(c.pitch), -Math.sin(c.pitch) * Math.sin(c.yaw)];
  return { right, up };
}
function orbitCameraPosition(): Vec3 {
  const c = config.camera;
  return [c.target[0] + Math.cos(c.yaw) * Math.cos(c.pitch) * c.distance, c.target[1] + Math.sin(c.pitch) * c.distance, c.target[2] + Math.sin(c.yaw) * Math.cos(c.pitch) * c.distance];
}
function enterFpsCamera(): void {
  const position = orbitCameraPosition();
  const c = config.camera;
  const forward: Vec3 = [
    (c.target[0] - position[0]) / c.distance,
    (c.target[1] - position[1]) / c.distance,
    (c.target[2] - position[2]) / c.distance,
  ];
  fpsCamera = {
    position: [position[0], position[1], position[2]],
    yaw: Math.atan2(forward[0], -forward[2]),
    pitch: Math.asin(forward[1]),
  };
}
function exitFpsCamera(): void {
  if (!fpsCamera) return;
  const c = config.camera;
  c.target = [
    fpsCamera.position[0] + Math.sin(fpsCamera.yaw) * Math.cos(fpsCamera.pitch) * c.distance,
    fpsCamera.position[1] + Math.sin(fpsCamera.pitch) * c.distance,
    fpsCamera.position[2] - Math.cos(fpsCamera.yaw) * Math.cos(fpsCamera.pitch) * c.distance,
  ];
  c.yaw = fpsCamera.yaw + Math.PI / 2;
  c.pitch = -fpsCamera.pitch;
  fpsCamera = undefined;
}
function fpsBasis(camera: FpsCamera): { forward: Vec3; right: Vec3; up: Vec3 } {
  const forward: Vec3 = [
    Math.sin(camera.yaw) * Math.cos(camera.pitch),
    Math.sin(camera.pitch),
    -Math.cos(camera.yaw) * Math.cos(camera.pitch),
  ];
  const right: Vec3 = [Math.cos(camera.yaw), 0, Math.sin(camera.yaw)];
  const up: Vec3 = [
    -Math.sin(camera.yaw) * Math.sin(camera.pitch),
    Math.cos(camera.pitch),
    Math.cos(camera.yaw) * Math.sin(camera.pitch),
  ];
  return { forward, right, up };
}
function applyFpsMovement(delta: number): void {
  if (compareMode || !fpsCamera || keys.size === 0) return;
  const { forward, right, up } = fpsBasis(fpsCamera);
  const forwardAmount = (keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0);
  const rightAmount = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
  const upAmount = (keys.has("e") ? 1 : 0) - (keys.has("q") ? 1 : 0);
  const move: Vec3 = [
    forward[0] * forwardAmount + right[0] * rightAmount + up[0] * upAmount,
    forward[1] * forwardAmount + right[1] * rightAmount + up[1] * upAmount,
    forward[2] * forwardAmount + right[2] * rightAmount + up[2] * upAmount,
  ];
  const length = Math.hypot(move[0], move[1], move[2]);
  if (length < 1e-6) return;
  const step = FPS_SPEED * delta / length;
  fpsCamera.position[0] += move[0] * step;
  fpsCamera.position[1] += move[1] * step;
  fpsCamera.position[2] += move[2] * step;
}
window.addEventListener("error", (event) => { status.textContent = `error: ${event.message}`; });
window.addEventListener("unhandledrejection", (event) => { status.textContent = `error: ${String(event.reason)}`; });
window.addEventListener("hashchange", () => {
  const match = GODOT_EXAMPLES.find((example) => example.id === location.hash.slice(1));
  if (match) selectExample(match, false);
});
const initial = GODOT_EXAMPLES.find((example) => example.id === (params.get("scene") ?? location.hash.slice(1)));
if (initial) selected = initial;
renderList(); updateDetails(); syncControls();
const gpu = await init();
const output = surface(gpu, canvas, { depth: true });
const renderer = new GpuDebugDraw3D(gpu, { points: 16384, lines: 65536, triangles: 65536 });
const debug = new DebugDraw3D({ defaultLineStyle: { width: 2 } });
const grid = new InfiniteGrid3D(gpu);
function render(timestamp: number): void {
  const delta = previousTimestamp === undefined ? 0 : Math.min((timestamp - previousTimestamp) / 1000, 0.1);
  if (config.view.animate) time += delta;
  applyFpsMovement(delta);
  previousTimestamp = timestamp;
  const width = Math.max(canvas.clientWidth, 1);
  const height = Math.max(canvas.clientHeight, 1);
  const c = config.camera;
  const eye = fpsCamera?.position ?? orbitCameraPosition();
  const target: Vec3 = fpsCamera
    ? [eye[0] + Math.sin(fpsCamera.yaw) * Math.cos(fpsCamera.pitch), eye[1] + Math.sin(fpsCamera.pitch), eye[2] - Math.cos(fpsCamera.yaw) * Math.cos(fpsCamera.pitch)]
    : c.target;
  viewProjection = multiply(c.projection === "orthographic" ? orthographic(c.orthographicHeight, width / height, c.near, c.far) : perspective(c.fov, width / height, c.near, c.far), lookAt(eye, target));
  const recorder = debug.beginFrame();
  buildScene(selected.id, recorder, time);
  const raw = debug.finishFrame(recorder);
  const commands: readonly FrameCommand[] = raw.map((command) => command.kind === "line" ? { ...command, width: command.width * config.view.lineWidthScale } : command);
  renderer.prepare(commands, { viewProjection });
  grid.setOpacity(config.view.gridOpacity);
  grid.prepare({ viewProjection, cameraPosition: eye, gridCenter: fpsCamera ? [eye[0], eye[2]] : [c.target[0], c.target[2]], viewportSize: [width, height] });
  frame(gpu, (f) => {
    renderer.updateIndirect(f);
    f.pass({ target: output, clear: config.view.background, clearDepth: 1 }, (pass) => {
      if (config.view.showGrid) grid.draw(pass);
      renderer.draw(pass);
    });
  });
  counts.textContent = `${commands.length} commands · ${selected.columns.length} columns`;
  status.textContent = "WebGPU ready · partial parity";
  document.documentElement.dataset.renderReady = "true";
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
animateToggle.onchange = () => { config.view.animate = animateToggle.checked; persist(); };
gridToggle.onchange = () => { config.view.showGrid = gridToggle.checked; persist(); };
widthScale.oninput = () => { config.view.lineWidthScale = Number(widthScale.value); persist(); };
gridOpacity.oninput = () => { config.view.gridOpacity = Number(gridOpacity.value); persist(); };
projection.onchange = () => { config.camera.projection = projection.value === "orthographic" ? "orthographic" : "perspective"; persist(); };
background.oninput = () => { const hex = background.value; config.view.background = [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255, 1]; persist(); };
resetConfig.onclick = () => { config = cloneDemoConfig(DEFAULT_DEMO_CONFIG); time = 0; syncControls(); persist(); };
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("pointerdown", (event) => {
  if (compareMode) return;
  const mode: PointerMode = event.button === 0 ? "rotate" : event.button === 1 ? "pan" : event.button === 2 ? "fps" : "rotate";
  if (event.button > 2) return;
  pointer = { x: event.clientX, y: event.clientY, mode };
  if (mode === "fps") {
    enterFpsCamera();
    void canvas.requestPointerLock();
  } else {
    canvas.setPointerCapture(event.pointerId);
  }
});
canvas.addEventListener("pointermove", (event) => {
  if (!pointer || compareMode) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  const c = config.camera;
  if (pointer.mode === "fps") {
    if (!fpsCamera) return;
    const lookX = document.pointerLockElement === canvas ? event.movementX : dx;
    const lookY = document.pointerLockElement === canvas ? event.movementY : dy;
    fpsCamera.yaw += lookX * LOOK_SENSITIVITY;
    fpsCamera.pitch = Math.max(-1.35, Math.min(1.35, fpsCamera.pitch - lookY * LOOK_SENSITIVITY));
  } else if (pointer.mode === "rotate") {
    c.yaw += dx * LOOK_SENSITIVITY;
    c.pitch = Math.max(-1.35, Math.min(1.35, c.pitch + dy * LOOK_SENSITIVITY));
  } else if (pointer.mode === "pan") {
    const { right, up } = cameraBasis();
    const pan = c.distance * PAN_SENSITIVITY;
    const panX = -dx;
    const panY = dy;
    c.target[0] += (right[0] * panX + up[0] * panY) * pan;
    c.target[1] += (right[1] * panX + up[1] * panY) * pan;
    c.target[2] += (right[2] * panX + up[2] * panY) * pan;
  }
  pointer = { x: event.clientX, y: event.clientY, mode: pointer.mode };
});
const releasePointer = (event: PointerEvent) => {
  if (pointer === undefined) return;
  pointer = undefined;
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  if (event.pointerId >= 0 && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (event.button === 2 || fpsCamera) exitFpsCamera();
  keys.clear();
  persist();
};
canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);
window.addEventListener("keydown", (event) => {
  if (compareMode) return;
  const key = event.key.toLowerCase();
  if (!["w", "a", "s", "d", "q", "e"].includes(key)) return;
  keys.add(key);
  if (pointer?.mode === "fps") event.preventDefault();
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== canvas && pointer?.mode === "fps") {
    pointer = undefined;
    keys.clear();
    exitFpsCamera();
    persist();
  }
});
canvas.addEventListener("wheel", (event) => {
  if (compareMode) return;
  const factor = Math.exp(event.deltaY * 0.001);
  if (config.camera.projection === "orthographic") config.camera.orthographicHeight = Math.max(1, Math.min(100, config.camera.orthographicHeight * factor));
  else config.camera.distance = Math.max(3, Math.min(100, config.camera.distance * factor));
  persist(); event.preventDefault();
}, { passive: false });
