// Brand asset pipeline — zero dependencies.
//
// Takes the two supplied renders (the 3D hourglass and the banner) from
// brand-src/ and produces every raster the site needs. The artwork is never
// redrawn: the hourglass is only *keyed* (its flat cream background turned
// transparent so it sits on the page's own cream without a visible plate),
// cropped and resampled; the banner is only placed on a canvas.
//
//   node scripts/brand.mjs
//
// Outputs
//   public/brand/hourglass.png       keyed RGBA cut-out, full resolution
//   public/brand/hourglass-720.png   same, 720 px tall (mobile / nav)
//   public/brand/banner.png          the banner as supplied
//   src/app/opengraph-image.png      1200×630, banner centred on its own cream
//   src/app/icon.png                 256×256 favicon (hourglass on cream)
//   src/app/apple-icon.png           180×180
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import path from "node:path";

const SRC_HOURGLASS = "brand-src/hourglass.png";
const SRC_BANNER = "brand-src/banner.png";

// ---------------------------------------------------------------- PNG codec
function decodePng(file) {
  const b = readFileSync(file);
  let p = 8;
  let w = 0, h = 0, ct = 0;
  const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p);
    const type = b.toString("ascii", p + 4, p + 8);
    const d = b.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    else if (type === "IDAT") idat.push(d);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : (() => { throw new Error(`unsupported colour type ${ct}`); })();
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const rgba = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const up = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) {
        const pp = a + up - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const s = x * bpp, d = (y * w + x) * 4;
      rgba[d] = cur[s]; rgba[d + 1] = cur[s + 1]; rgba[d + 2] = cur[s + 2];
      rgba[d + 3] = bpp === 4 ? cur[s + 3] : 255;
    }
    prev = cur;
  }
  return { w, h, rgba };
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng({ w, h, rgba }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --------------------------------------------------------------- operations
/** Area-averaging resample (box filter) — no ringing, no sharpening. */
function resample(img, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const sx = img.w / dw, sy = img.h / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * img.w + xx) * 4;
        const al = img.rgba[i + 3];
        // premultiplied average so transparent pixels don't drag colour in
        r += img.rgba[i] * al; g += img.rgba[i + 1] * al; b += img.rgba[i + 2] * al; a += al; n++;
      }
      const o = (y * dw + x) * 4;
      if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
      out[o + 3] = Math.round(a / n);
    }
  }
  return { w: dw, h: dh, rgba: out };
}

function crop(img, x0, y0, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) img.rgba.copy(out, y * w * 4, ((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x0 + w) * 4);
  return { w, h, rgba: out };
}

/**
 * Turns the render's flat background transparent. The background is not one
 * colour — the render has a faint vignette and grain — so it is modelled as a
 * smooth field: the image is cut into a coarse grid, each cell's background is
 * the mean of its near-background pixels (seeded from the corner colour), and
 * every pixel is compared to the bilinear interpolation of that field. The
 * alpha ramps from 0 (indistinguishable from background) to 1 over a short
 * distance so the soft studio shadow under the object survives as a partial
 * darkening instead of a hard cut.
 */
function keyBackground(img, { lo = 7, hi = 30, cells = 12 } = {}) {
  const { w, h, rgba } = img;
  const corner = [rgba[0], rgba[1], rgba[2]];
  const cw = Math.ceil(w / cells), ch = Math.ceil(h / cells);
  const field = new Float64Array(cells * cells * 3);
  const counts = new Float64Array(cells * cells);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const d = Math.abs(rgba[i] - corner[0]) + Math.abs(rgba[i + 1] - corner[1]) + Math.abs(rgba[i + 2] - corner[2]);
    if (d > 12) continue;
    const c = Math.floor(y / ch) * cells + Math.floor(x / cw);
    field[c * 3] += rgba[i]; field[c * 3 + 1] += rgba[i + 1]; field[c * 3 + 2] += rgba[i + 2]; counts[c]++;
  }
  for (let c = 0; c < cells * cells; c++) {
    if (counts[c] > 50) { field[c * 3] /= counts[c]; field[c * 3 + 1] /= counts[c]; field[c * 3 + 2] /= counts[c]; }
    else { field[c * 3] = corner[0]; field[c * 3 + 1] = corner[1]; field[c * 3 + 2] = corner[2]; }
  }
  const bgAt = (x, y) => {
    const fx = Math.min(cells - 1, Math.max(0, x / cw - 0.5)), fy = Math.min(cells - 1, Math.max(0, y / ch - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(cells - 1, x0 + 1), y1 = Math.min(cells - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const out = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const a = field[(y0 * cells + x0) * 3 + k] * (1 - tx) + field[(y0 * cells + x1) * 3 + k] * tx;
      const b = field[(y1 * cells + x0) * 3 + k] * (1 - tx) + field[(y1 * cells + x1) * 3 + k] * tx;
      out[k] = a * (1 - ty) + b * ty;
    }
    return out;
  };
  // Distance of every pixel from the background field.
  const dist = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const bg = bgAt(x, y);
    dist[y * w + x] = Math.min(255, Math.max(Math.abs(rgba[i] - bg[0]), Math.abs(rgba[i + 1] - bg[1]), Math.abs(rgba[i + 2] - bg[2])));
  }
  // Only the region *outside* the silhouette is keyed: a flood fill from the
  // image border through background-like pixels. The glass interior shows
  // the cream through it in the render and must stay exactly as drawn — the
  // page behind it is the same cream — so anything the fill cannot reach
  // stays fully opaque. Highlights on the rim (d ≈ 23) are above the fill
  // threshold and seal it.
  const outside = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { const k = y * w + x; if (!outside[k] && dist[k] <= 14) { outside[k] = 1; stack.push(k); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const k = stack.pop(); const x = k % w, y = (k - x) / w;
    if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
  }
  // Grow the outside region by a few pixels of ramp so the edge is soft.
  const out = Buffer.from(rgba);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x, i = k * 4;
    let near = outside[k];
    if (!near) {
      // pixels within 3 px of the outside get the ramp too (anti-aliased edge)
      for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && outside[yy * w + xx]) { near = 1; break; }
      }
    }
    if (!near) { out[i + 3] = 255; continue; }
    const t = Math.min(1, Math.max(0, (dist[k] - lo) / (hi - lo)));
    out[i + 3] = Math.round(255 * t * t * (3 - 2 * t));
  }
  return { w, h, rgba: out };
}

function alphaBounds(img, threshold = 8) {
  let minx = img.w, maxx = -1, miny = img.h, maxy = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.rgba[(y * img.w + x) * 4 + 3] > threshold) {
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
  }
  return { minx, miny, maxx, maxy };
}

function canvas(w, h, [r, g, b]) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255; }
  return { w, h, rgba };
}

/** Source-over composite of `src` onto `dst` at (x0, y0). */
function blit(dst, src, x0, y0) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const dx = x0 + x, dy = y0 + y;
    if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
    const s = (y * src.w + x) * 4, d = (dy * dst.w + dx) * 4;
    const a = src.rgba[s + 3] / 255;
    for (let k = 0; k < 3; k++) dst.rgba[d + k] = Math.round(src.rgba[s + k] * a + dst.rgba[d + k] * (1 - a));
    dst.rgba[d + 3] = 255;
  }
}

// --------------------------------------------------------------------- main
mkdirSync("public/brand", { recursive: true });
mkdirSync("src/app", { recursive: true });

const hour = decodePng(SRC_HOURGLASS);
const keyed = keyBackground(hour);
const bb = alphaBounds(keyed, 20);
const margin = 24;
const x0 = Math.max(0, bb.minx - margin), y0 = Math.max(0, bb.miny - margin);
const cw = Math.min(hour.w - x0, bb.maxx - bb.minx + 1 + margin * 2);
const ch = Math.min(hour.h - y0, bb.maxy - bb.miny + 1 + margin * 2);
const cut = crop(keyed, x0, y0, cw, ch);
writeFileSync("public/brand/hourglass.png", encodePng(cut));
const small = resample(cut, Math.round((cw * 720) / ch), 720);
writeFileSync("public/brand/hourglass-720.png", encodePng(small));
console.log(`hourglass: keyed, cropped to ${cw}×${ch} (from ${hour.w}×${hour.h}), bg ${hour.rgba.subarray(0, 3).toString("hex")}`);

// favicon: the cut-out scaled into a cream square with a little air
for (const [name, size] of [["icon.png", 256], ["apple-icon.png", 180]]) {
  const c = canvas(size, size, [0xf5, 0xf3, 0xe9]);
  const target = Math.round(size * 0.86);
  const scaled = resample(cut, Math.round((cw * target) / ch), target);
  blit(c, scaled, Math.round((size - scaled.w) / 2), Math.round((size - scaled.h) / 2));
  writeFileSync(path.join("src/app", name), encodePng(c));
}

// banner: as supplied, and as the 1200×630 Open Graph card
copyFileSync(SRC_BANNER, "public/brand/banner.png");
const banner = decodePng(SRC_BANNER);
const og = canvas(1200, 630, [banner.rgba[0], banner.rgba[1], banner.rgba[2]]);
const bw = 1200, bh = Math.round((banner.h * bw) / banner.w);
blit(og, resample(banner, bw, bh), 0, Math.round((630 - bh) / 2));
writeFileSync("src/app/opengraph-image.png", encodePng(og));
console.log(`banner: ${banner.w}×${banner.h} → public/brand/banner.png, og 1200×630`);
