// Capture deterministic gallery screenshots over CDP from a real GPU browser.
//
// Usage:
//   bun scripts/capture-vgpu.ts [scene ...]
//
// Requires a running Vite dev server (default http://localhost:5173; override with `VGPU_URL`) and
// a working GPU display (X11 or Wayland). Reuse the server the developer already has — never start
// one here, and never `pkill -f vite`, which would also take down the other projects' servers. The WebGPU canvas must report
// `document.documentElement.dataset.renderReady === "true"` before capture.
//
// `CHROME_PATH` selects the browser binary (default: first known install path, then `PATH`), and
// `VGPU_OZONE_PLATFORM` pins the display server. The `--enable-features=Vulkan` below is what gives
// Chrome a hardware WebGPU adapter on Linux; without it `requestAdapter()` returns null.
//
// Set `VGPU_COMPARE=0` for scenes with no Godot reference — the text scenes, which the addon cannot
// draw — so the capture is the gallery alone instead of a split view against a missing reference.
// `VGPU_QUERY` appends a one-off query, e.g. `grid=0` to hide the infinite grid over the text.
// `VGPU_PAGE` selects a scene set, e.g. `VGPU_PAGE=vfx VGPU_COMPARE=0 bun scripts/capture-vgpu.ts slash-arc`.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { ozonePlatformArgs, resolveChromePath } from "./chrome-launch.js";

const SCENES = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["circle", "line"];
const BASE_URL = process.env.VGPU_URL ?? "http://localhost:5173";
/**
 * `?compare=1` puts the Godot reference beside the vgpu render. Scenes without a reference capture
 * the gallery alone when this is turned off; see the usage note above.
 */
const COMPARE = process.env.VGPU_COMPARE !== "0";
/** Scene set to capture; unset for the basic gallery, `vfx` for the battle page. */
const PAGE = process.env.VGPU_PAGE;
const PAGE_QUERY = PAGE === undefined || PAGE === "" ? "" : `page=${PAGE}&`;
const OUTPUT_DIR = resolve(import.meta.dir, "..", "artifacts", "visual-baseline");
const CHROME = resolveChromePath();
const PROFILE = mkdtempSync(resolve(tmpdir(), "vgpu-capture-"));
const WIDTH = 1920;
const HEIGHT = 1080;
/**
 * Device scale factor the page is emulated at. `1` captures the CSS-pixel layout; a HiDPI value
 * exercises the screen-space CSS→target pixel mapping, which is where a page authored in CSS pixels
 * would otherwise render at half its intended size.
 */
const DEVICE_SCALE = Number(process.env.VGPU_DPR ?? "1");

mkdirSync(OUTPUT_DIR, { recursive: true });

const browser = spawn(CHROME, [
  // Port 0 lets Chromium pick one and write it to `DevToolsActivePort`; a fixed port can already be
  // taken by another browser, and attaching to that one instead means no GPU and no rendered frame.
  "--remote-debugging-port=0",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--enable-unsafe-webgpu",
  "--enable-features=Vulkan",
  ...ozonePlatformArgs(),
  `--window-size=${WIDTH},${HEIGHT}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let stderr = "";
browser.stderr.on("data", (chunk) => { stderr += String(chunk); });

async function waitForEndpoint(): Promise<{ port: number; webSocketDebuggerUrl: string }> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const file = resolve(PROFILE, "DevToolsActivePort");
    if (existsSync(file)) {
      const port = Number(readFileSync(file, "utf8").split("\n")[0]!.trim());
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) {
          const info = await response.json() as { webSocketDebuggerUrl: string };
          return { port, webSocketDebuggerUrl: info.webSocketDebuggerUrl };
        }
      } catch { /* the socket is not up yet */ }
    }
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
  const { port, webSocketDebuggerUrl } = await waitForEndpoint();
  const client = makeClient(webSocketDebuggerUrl);
  await client.ready;

  for (const scene of SCENES) {
    const extra = process.env.VGPU_QUERY === undefined ? "" : `${process.env.VGPU_QUERY}&`;
    const url = `${BASE_URL}/?${extra}${PAGE_QUERY}${COMPARE ? "compare=1&" : ""}scene=${scene}`;
    // Open a blank page and navigate once. Opening the scene itself in the `/json/new` call and then
    // navigating to the same URL leaves `renderReady` unset, and the wait below never returns.
    const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    const info = await target.json() as { webSocketDebuggerUrl: string };
    const page = makeClient(info.webSocketDebuggerUrl);
    await page.ready;
    await page.send("Page.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: DEVICE_SCALE, mobile: false });
    await page.send("Page.navigate", { url });
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
