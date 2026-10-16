// Capture the vgpu side of the bevy text reference: one PNG per shared case.
//
// Usage:
//   bun run dev -- --host 127.0.0.1 --port 5174   # in another shell
//   bun scripts/capture-text-reference.ts [case ...]
//
// Requires a working GPU display (X11 or Wayland) and Chromium. Writes
// `artifacts/text-reference/vgpu-<id>.png`; the bevy side of the same cases comes from
// `tools/bevy-text-reference` (see docs/text-reference.md), and
// `artifacts/text-reference/index.html` puts the two side by side.
//
// Every case is captured at its own pixel size with the device scale factor pinned to 1, so the
// PNG is a 1:1 copy of what the renderer drew and can be compared against bevy's render target
// without rescaling.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const BASE_URL = process.env.VGPU_URL ?? "http://127.0.0.1:5174";
const OUTPUT_DIR = resolve(import.meta.dir, "..", "artifacts", "text-reference");
const CASES = resolve(import.meta.dir, "..", "tools", "bevy-text-reference", "cases.json");
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/chromium";
const PROFILE = mkdtempSync(resolve(tmpdir(), "vgpu-text-reference-"));

type ReferenceCase = { readonly id: string; readonly width: number; readonly height: number };

const spec = JSON.parse(readFileSync(CASES, "utf8")) as { cases: readonly ReferenceCase[] };
const wanted = process.argv.slice(2);
const cases = wanted.length === 0 ? spec.cases : spec.cases.filter((entry) => wanted.includes(entry.id));
if (cases.length === 0) throw new Error(`no cases matched ${wanted.join(", ")}`);

mkdirSync(OUTPUT_DIR, { recursive: true });

const browser = spawn(
  CHROME,
  [
    // Port 0 lets Chromium pick one and write it to `DevToolsActivePort`; a fixed port can already be
    // taken by another browser, and attaching to that one instead means no GPU and no rendered frame.
    "--remote-debugging-port=0",
    `--user-data-dir=${PROFILE}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--enable-unsafe-webgpu",
    "--enable-features=Vulkan",
    "--ozone-platform=x11",
    "--window-size=1920,1080",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

let stderr = "";
browser.stderr.on("data", (chunk) => {
  stderr += String(chunk);
});

async function waitForEndpoint(): Promise<{ port: number; webSocketDebuggerUrl: string }> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const file = resolve(PROFILE, "DevToolsActivePort");
    if (existsSync(file)) {
      const port = Number(readFileSync(file, "utf8").split("\n")[0]!.trim());
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) {
          const info = (await response.json()) as { webSocketDebuggerUrl: string };
          return { port, webSocketDebuggerUrl: info.webSocketDebuggerUrl };
        }
      } catch {
        /* the socket is not up yet */
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`CDP endpoint did not start. stderr:\n${stderr.slice(-2000)}`);
}

type CdpMessage = { id?: number; method?: string; params?: unknown; result?: unknown; error?: unknown };

function makeClient(url: string) {
  const socket = new WebSocket(url);
  const pending = new Map<number, (message: CdpMessage) => void>();
  let nextId = 1;
  const ready = new Promise<void>((res, rej) => {
    socket.onopen = () => res();
    socket.onerror = () => rej(new Error("socket error"));
  });
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as CdpMessage;
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)!(message);
      pending.delete(message.id);
    }
  };
  const send = (method: string, params?: unknown) =>
    new Promise<CdpMessage>((res) => {
      const id = nextId++;
      pending.set(id, res);
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { socket, ready, send };
}

/** Waits for the page to finish drawing, and surfaces a page-side failure instead of timing out. */
async function waitForRenderReady(client: ReturnType<typeof makeClient>): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const message = await client.send("Runtime.evaluate", {
      expression: `document.documentElement.dataset.renderError ?? (document.documentElement.dataset.renderReady === "true" ? "ready" : null)`,
      returnByValue: true,
    });
    const value = (message.result as { result?: { value?: string | null } } | undefined)?.result?.value;
    if (value === "ready") return;
    if (typeof value === "string" && value.length > 0) throw new Error(`page failed: ${value}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("renderReady never became true");
}

try {
  const { port, webSocketDebuggerUrl } = await waitForEndpoint();
  const client = makeClient(webSocketDebuggerUrl);
  await client.ready;

  for (const entry of cases) {
    // Open a blank page and navigate once. Opening the case URL in the `/json/new` call and then
    // navigating to the same URL leaves `renderReady` unset, and the wait below never returns.
    const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    const info = (await target.json()) as { webSocketDebuggerUrl: string };
    const page = makeClient(info.webSocketDebuggerUrl);
    await page.ready;
    await page.send("Page.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: entry.width,
      height: entry.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.send("Page.navigate", { url: `${BASE_URL}/text-reference.html?case=${encodeURIComponent(entry.id)}` });
    await waitForRenderReady(page);

    const shot = await page.send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width: entry.width, height: entry.height, scale: 1 },
      captureBeyondViewport: false,
    });
    const data = (shot.result as { data: string }).data;
    const path = resolve(OUTPUT_DIR, `vgpu-${entry.id}.png`);
    await Bun.write(path, Buffer.from(data, "base64"));
    console.log(`${entry.id} -> ${path}`);

    await page.send("Page.close");
    page.socket.close();
  }
  client.socket.close();
} finally {
  browser.kill("SIGTERM");
}
