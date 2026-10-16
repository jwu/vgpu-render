// Shared browser resolution for the CDP capture scripts.
//
// Both scripts used to default to a hard-coded `/usr/bin/chromium`, which silently pointed at a path
// many hosts do not have, and they hard-coded `--ozone-platform=x11` even on Wayland sessions. A
// missing binary makes `spawn` fail with an ENOENT that reads like a rendering problem, so resolve
// the browser up front and throw a message that says what to set instead.

import { existsSync } from "node:fs";

/** Names looked up on `PATH` first, so a host that wraps the browser keeps its wrapper. */
const KNOWN_NAMES = ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"];

/** Absolute install locations used when neither name is on `PATH`. */
const KNOWN_PATHS = [
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/local/bin/chromium",
  "/snap/bin/chromium",
];

function findOnPath(name: string): string | undefined {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (dir === "") continue;
    const candidate = `${dir}/${name}`;
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Browser binary for the capture scripts. `CHROME_PATH` wins when set, otherwise the first known
 * name found on `PATH` and then the first known absolute install path.
 */
export function resolveChromePath(): string {
  const override = process.env.CHROME_PATH?.trim();
  if (override) {
    if (!existsSync(override)) throw new Error(`CHROME_PATH=${override} does not exist`);
    return override;
  }
  for (const name of KNOWN_NAMES) {
    const found = findOnPath(name);
    if (found) return found;
  }
  for (const candidate of KNOWN_PATHS) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `no Chrome/Chromium found; set CHROME_PATH to the browser binary (tried ${[...KNOWN_PATHS, ...KNOWN_NAMES].join(", ")})`,
  );
}

/**
 * Ozone platform arguments. Chrome picks its own display server by default, which is what a Wayland
 * session needs; set `VGPU_OZONE_PLATFORM=x11` (or `wayland`) to pin the capture to one. An empty
 * value or `auto` omits the flag.
 */
export function ozonePlatformArgs(): string[] {
  const value = process.env.VGPU_OZONE_PLATFORM?.trim() ?? "auto";
  if (value === "" || value === "auto") return [];
  return [`--ozone-platform=${value}`];
}
