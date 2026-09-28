// Proof of the sand animation: real-time headless Chrome (CDP), the hourglass
// region captured at 2× a few hundred milliseconds apart, plus a contact
// sheet of the frames.
//   node scripts/sand-proof.mjs [baseUrl]   → docs/captures/sand-*.png, sand-strip.png
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch, sleep } from "./cdp.mjs";

const base = process.argv[2] ?? "http://localhost:3868";
const chrome = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const out = path.resolve("docs/captures");

const b = await launch({ width: 1440, height: 900 });
try {
  await b.navigate(`${base}/?sandproof`);
  await b.waitFor("typeof window.__stayrSand === 'object'", "sand hook");
  await sleep(1800); // entrance animation done, grains flowing
  const rect = await b.evaluate(
    "(() => { const r = document.querySelector('.hourglass-float canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()",
  );
  const files = [];
  for (let i = 0; i < 6; i++) {
    const grains = await b.evaluate("window.__stayrSand.step(0, 0)");
    const { data } = await b.send(
      "Page.captureScreenshot",
      { format: "png", clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 2 } },
      b.S,
    );
    const file = path.join(out, `sand-${i}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    files.push({ file, grains });
    console.log("frame", i, "grains", grains);
    await sleep(350);
  }
  // contact sheet
  const sheet = path.join(out, "sand-strip.html");
  writeFileSync(
    sheet,
    `<!doctype html><body style="margin:0;background:#e9e6d8;display:flex;gap:12px;padding:12px">${files
      .map((f, i) => `<figure style="margin:0;text-align:center;font:12px sans-serif;color:#194b38"><img src="${pathToFileURL(f.file).href}" width="${Math.round(rect.width * 0.55)}"><figcaption>t+${i * 350} ms · ${f.grains} grains</figcaption></figure>`)
      .join("")}</body>`,
  );
  const stripW = Math.round((rect.width * 0.55 + 12) * files.length + 12);
  const stripH = Math.round(rect.height * 0.55 + 44);
  spawnSync(
    chrome,
    ["--headless=new", "--no-first-run", `--user-data-dir=${path.join(process.env.TEMP ?? "/tmp", "stayr-strip")}`, "--hide-scrollbars", `--window-size=${stripW},${stripH}`, "--virtual-time-budget=4000", `--screenshot=${path.join(out, "sand-strip.png")}`, pathToFileURL(sheet).href],
    { stdio: "ignore", timeout: 120_000 },
  );
  console.log("strip", path.join(out, "sand-strip.png"));
} finally {
  b.close();
}
