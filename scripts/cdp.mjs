// Minimal Chrome DevTools Protocol driver: real time, real network, screenshots.
// Zero dependencies — Node 22+ has WebSocket and fetch.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const chrome = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ width = 1440, height = 900, mobile = false } = {}) {
  const port = 9400 + Math.floor(Math.random() * 300);
  const proc = spawn(
    chrome,
    [
      "--headless=new",
      "--no-first-run",
      `--user-data-dir=${path.join(process.env.TEMP ?? "/tmp", `stayr-cdp-${port}`)}`,
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--hide-scrollbars",
      `--window-size=${width},${height}`,
      `--remote-debugging-port=${port}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const version = await (async () => {
    for (let i = 0; i < 60; i++) {
      try {
        return await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      } catch {
        await sleep(250);
      }
    }
    throw new Error("chrome did not answer");
  })();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId: S } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, S);
  await send("Runtime.enable", {}, S);
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile }, S);

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, S);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + JSON.stringify(r.exceptionDetails.exception?.description ?? ""));
    return r.result.value;
  };
  const outDir = path.resolve("docs/captures");
  mkdirSync(outDir, { recursive: true });
  const shot = async (name, { clip, format = "png", quality } = {}) => {
    const { data } = await send("Page.captureScreenshot", { format, quality, clip: clip ? { ...clip, scale: 1 } : undefined }, S);
    const file = path.join(outDir, `${name}.${format === "jpeg" ? "jpg" : "png"}`);
    writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  };
  const waitFor = async (expression, label, timeout = 40_000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await evaluate(expression)) return;
      await sleep(250);
    }
    throw new Error(`timeout waiting for ${label}`);
  };
  const navigate = (url) => send("Page.navigate", { url }, S);
  const close = () => {
    try {
      ws.close();
    } catch {}
    proc.kill();
  };
  return { send, S, evaluate, shot, waitFor, navigate, close };
}
