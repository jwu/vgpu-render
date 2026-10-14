import { frame, init, surface } from "vgpu";
import { DebugDraw3D, GpuDebugDraw3D, InfiniteGrid3D, type FrameCommand, type Vec3 } from "./index.js";
import { GODOT_EXAMPLES, type GodotExample } from "./godot-examples.js";
import { buildScene } from "./godot-scenes.js";
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
let pointer: { x: number; y: number } | undefined;
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
function updateDetails(): void {
  family.textContent = "visual parity under review";
  title.textContent = selected.title;
  description.textContent = selected.notes ? `${selected.description} — ${selected.notes}` : selected.description;
  code.textContent = selected.columns.map((column) => `${column.implemented ? "✓" : "·"} ${column.label}\n  ${column.samples.join(" · ")}`).join("\n");
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
  if (config.view.animate && previousTimestamp !== undefined) time += Math.min((timestamp - previousTimestamp) / 1000, 0.1);
  previousTimestamp = timestamp;
  const width = Math.max(canvas.clientWidth, 1);
  const height = Math.max(canvas.clientHeight, 1);
  const c = config.camera;
  const eye: Vec3 = [c.target[0] + Math.cos(c.yaw) * Math.cos(c.pitch) * c.distance, c.target[1] + Math.sin(c.pitch) * c.distance, c.target[2] + Math.sin(c.yaw) * Math.cos(c.pitch) * c.distance];
  viewProjection = multiply(c.projection === "orthographic" ? orthographic(c.orthographicHeight, width / height, c.near, c.far) : perspective(c.fov, width / height, c.near, c.far), lookAt(eye, c.target));
  const recorder = debug.beginFrame();
  buildScene(selected.id, recorder, time);
  const raw = debug.finishFrame(recorder);
  const commands: readonly FrameCommand[] = raw.map((command) => command.kind === "line" ? { ...command, width: command.width * config.view.lineWidthScale } : command);
  renderer.prepare(commands, { viewProjection });
  grid.setOpacity(config.view.gridOpacity);
  grid.prepare({ viewProjection, cameraPosition: eye, gridCenter: [c.target[0], c.target[2]], viewportSize: [width, height] });
  frame(gpu, (f) => f.pass({ target: output, clear: config.view.background, clearDepth: 1 }, (pass) => {
    if (config.view.showGrid) grid.draw(pass);
    renderer.draw(pass);
  }));
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
canvas.addEventListener("pointerdown", (event) => {
  if (compareMode || event.button !== 1) return;
  pointer = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!pointer) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  const c = config.camera;
  if (event.shiftKey) { const pan = c.distance * 0.0015; c.target[0] -= dx * pan; c.target[2] += dy * pan; }
  else { c.yaw -= dx * 0.008; c.pitch = Math.max(-1.35, Math.min(1.35, c.pitch + dy * 0.008)); }
  pointer = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener("pointerup", () => { pointer = undefined; persist(); });
canvas.addEventListener("pointercancel", () => { pointer = undefined; });
canvas.addEventListener("wheel", (event) => {
  if (compareMode) return;
  const factor = Math.exp(event.deltaY * 0.001);
  if (config.camera.projection === "orthographic") config.camera.orthographicHeight = Math.max(1, Math.min(100, config.camera.orthographicHeight * factor));
  else config.camera.distance = Math.max(3, Math.min(100, config.camera.distance * factor));
  persist(); event.preventDefault();
}, { passive: false });
