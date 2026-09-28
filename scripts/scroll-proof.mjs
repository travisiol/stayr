// The page as a visitor scrolls it: real-time headless Chrome (CDP) at a
// normal viewport, one screenshot per scroll offset, desktop and phone.
//   node scripts/scroll-proof.mjs [baseUrl] [path]   → docs/captures/scroll-<w>-<n>.png + sheet
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch, sleep } from "./cdp.mjs";

const base = process.argv[2] ?? "http://localhost:3868";
const route = process.argv[3] ?? "/";
const chrome = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const out = path.resolve("docs/captures");

async function run(width, height, mobile, fractions) {
  const tag = mobile ? "mobile" : "desktop";
  const b = await launch({ width, height, mobile });
  const files = [];
  try {
    await b.navigate(`${base}${route}?scroll`);
    await b.waitFor("document.readyState === 'complete'", "load", 60_000);
    await sleep(1500);
    const total = await b.evaluate("document.documentElement.scrollHeight - window.innerHeight");
    for (const f of fractions) {
      await b.evaluate(`window.scrollTo({ top: ${Math.round(total * f)}, behavior: 'instant' })`);
      await sleep(500);
      const file = await b.shot(`scroll-${tag}-${f.toFixed(2)}`);
      files.push({ file, f });
    }
  } finally {
    b.close();
  }
  const cols = mobile ? 6 : 3;
  const thumbW = mobile ? 210 : 460;
  const thumbH = Math.round((thumbW * height) / width);
  const sheet = path.join(out, `scroll-sheet-${tag}.html`);
  writeFileSync(
    sheet,
    `<!doctype html><body style="margin:0;background:#e9e6d8;padding:12px;font:12px sans-serif;color:#194b38"><div style="display:grid;grid-template-columns:repeat(${cols},${thumbW}px);gap:12px">${files
      .map((x) => `<figure style="margin:0"><img src="${pathToFileURL(x.file).href}" width="${thumbW}" height="${thumbH}" style="display:block;border-radius:6px"><figcaption style="text-align:center;margin-top:4px">${Math.round(x.f * 100)}% down</figcaption></figure>`)
      .join("")}</div></body>`,
  );
  const rows = Math.ceil(files.length / cols);
  spawnSync(
    chrome,
    ["--headless=new", "--no-first-run", `--user-data-dir=${path.join(process.env.TEMP ?? "/tmp", "stayr-sheet")}`, "--hide-scrollbars", `--window-size=${cols * (thumbW + 12) + 24},${rows * (thumbH + 34) + 24}`, "--virtual-time-budget=5000", `--screenshot=${path.join(out, `scroll-sheet-${tag}.png`)}`, pathToFileURL(sheet).href],
    { stdio: "ignore", timeout: 120_000 },
  );
  console.log("sheet", path.join(out, `scroll-sheet-${tag}.png`));
}

await run(1440, 900, false, [0, 0.12, 0.3, 0.5, 0.7, 1]);
await run(390, 844, true, [0, 0.1, 0.3, 0.5, 0.75, 1]);
