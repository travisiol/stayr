// Headless Chrome captures of the site at desktop and phone sizes.
//   node scripts/capture.mjs [baseUrl]   → docs/captures/*.png
// Phones: Chrome refuses windows narrower than ~500 px, so the phone routes
// are 390 px iframes side by side in a local harness page.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const base = process.argv[2] ?? "http://localhost:3868";
const chrome = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const out = path.resolve("docs/captures");
mkdirSync(out, { recursive: true });

const shots = [
  { name: "landing-hero", url: "/", w: 1440, h: 900, budget: 12000 },
  { name: "landing-full", url: "/", w: 1440, h: 6600, budget: 18000 },
  { name: "app", url: "/app", w: 1440, h: 1100, budget: 12000 },
];

const phoneRoutes = ["/", "/app"];
const harness = path.join(out, "mobile-harness.html");
writeFileSync(
  harness,
  `<!doctype html><body style="margin:0;background:#e9e6d8;display:flex;gap:20px;padding:20px">${phoneRoutes
    .map((r) => `<iframe src="${base}${r}" width="390" height="1600" style="border:0;border-radius:18px;background:#f5f3e9"></iframe>`)
    .join("")}</body>`,
);
shots.push({ name: "mobile", url: null, file: harness, w: 860, h: 1640, budget: 18000 });

// The dev image optimizer renders each width on first request, which takes
// longer than the capture's virtual time budget waits for the network: warm
// every candidate width of the hero image first.
for (const w of [256, 384, 640, 750, 828, 1080, 1200, 1920]) {
  try {
    await fetch(`${base}/_next/image?url=${encodeURIComponent("/brand/hourglass.png")}&w=${w}&q=75`);
  } catch {
    /* the server is not up; the capture will say so */
  }
}

for (const s of shots) {
  const file = path.join(out, `${s.name}.png`);
  const args = [
    "--headless=new",
    "--no-first-run",
    // Entrance animations are captured at their end state, not mid-fade.
    "--force-prefers-reduced-motion",
    `--user-data-dir=${path.join(process.env.TEMP ?? "/tmp", "stayr-shot")}`,
    "--hide-scrollbars",
    `--window-size=${s.w},${s.h}`,
    `--virtual-time-budget=${s.budget}`,
    `--screenshot=${file}`,
    s.url === null ? pathToFileURL(s.file).href : `${base}${s.url}`,
  ];
  const r = spawnSync(chrome, args, { stdio: "ignore", timeout: 180_000 });
  console.log(r.status === 0 ? "ok  " : "fail", s.name, file);
}
