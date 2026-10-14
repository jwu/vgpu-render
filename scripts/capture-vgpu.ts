// Capture deterministic gallery screenshots over CDP from a real GPU browser.
//
// Usage:
//   bun scripts/capture-vgpu.ts [scene ...]
//
// Requires the Vite dev server at http://127.0.0.1:5174 and a working GPU
// display (X11 or Wayland). The WebGPU canvas must report
// `document.documentElement.dataset.renderReady === "true"` before capture.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const SCENES = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["circle", "line"];
const BASE_URL = process.env.VGPU_URL ?? "http://127.0.0.1:5174";
const OUTPUT_DIR = resolve(import.meta.dir, "..", "artifacts", "visual-baseline");
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/chromium";
const PROFILE = mkdtempSync(resolve(tmpdir(), "vgpu-capture-"));
const PORT = 9333;
const WIDTH = 1920;
const HEIGHT = 1080;

mkdirSync(OUTPUT_DIR, { recursive: true });

const browser = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--enable-unsafe-webgpu",
  "--enable-features=Vulkan",
  "--ozone-platform=x11",
  `--window-size=${WIDTH},${HEIGHT}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let stderr = "";
browser.stderr.on("data", (chunk) => { stderr += String(chunk); });

async function waitForEndpoint(): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return (await response.json() as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`CDP endpoint did not start. stderr:\n${stderr.slice(-2000)}`);
}

type CdpMessage = { id?: number; method?: string; params?: unknown; result?: unknown; error?: unknown; sessionId?: string };

function makeClient(url: string) {
  const socket = new WebSocket(url);
  const pending = new Map<number, (message: CdpMessage) => void>();
  const events: CdpMessage[] = [];
  let nextId = 1;
  const ready = new Promise<void>((res, rej) => { socket.onopen = () => res(); socket.onerror = () => rej(new Error("socket error")); });
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as CdpMessage;
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)!(message);
      pending.delete(message.id);
    } else {
      events.push(message);
    }
  };
  const send = (method: string, params?: unknown, sessionId?: string) => new Promise<CdpMessage>((res) => {
    const id = nextId++;
    pending.set(id, res);
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  return { socket, ready, send, events };
}

async function waitForRenderReady(client: ReturnType<typeof makeClient>, sessionId: string): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = await client.send("Runtime.evaluate", {
      expression: `document.documentElement.dataset.renderReady === "true" ? (document.querySelector("#counts")?.textContent ?? "ready") : null`,
      returnByValue: true,
    }, sessionId);
    const value = (result.result as { result?: { value?: string | null } } | undefined)?.result?.value;
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("renderReady never became true");
}

try {
  const wsUrl = await waitForEndpoint();
  const client = makeClient(wsUrl);
  await client.ready;

  for (const scene of SCENES) {
    const target = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`${BASE_URL}/?compare=1&scene=${scene}`)}`, { method: "PUT" });
    const info = await target.json() as { webSocketDebuggerUrl: string };
    const page = makeClient(info.webSocketDebuggerUrl);
    await page.ready;
    await page.send("Page.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
    await page.send("Page.navigate", { url: `${BASE_URL}/?compare=1&scene=${scene}` });
    const counts = await waitForRenderReady(page, "");
    const shot = await page.send("Page.captureScreenshot", { format: "png" });
    const data = (shot.result as { data: string }).data;
    const path = `${OUTPUT_DIR}/vgpu-${scene}.png`;
    await Bun.write(path, Buffer.from(data, "base64"));
    console.log(`captured ${scene}: ${counts} -> ${path}`);
    await page.send("Page.close");
    page.socket.close();
  }
  client.socket.close();
} finally {
  browser.kill("SIGTERM");
}
