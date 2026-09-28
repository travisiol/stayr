"use client";

import { useEffect, useRef } from "react";

/**
 * Sand in motion, painted on a transparent canvas laid exactly over the
 * hourglass render. Three populations of grains, all in the render's own
 * pixel grid (1014 × 1189) so the geometry never depends on the layout:
 *
 *   trickle — grains sliding down the top sand's concave surface into the funnel
 *   stream  — grains falling from the neck to the pile, under gravity, drawn
 *             with a short streak in their direction of travel
 *   roll    — grains that land on the pile and slide a little down its slope,
 *             a few of them kicked up on impact
 *
 * The render already shows a still stream and a pile; the canvas only adds
 * movement on top of them. It draws nothing under reduced motion, and stops
 * while the tab is hidden or the hourglass is off screen.
 */

// Geometry measured in public/brand/hourglass.png (scripts/measure-sand.mjs).
const W = 1014;
const CX = 398; // axis of the glass
const NECK_Y = 592; // where the stream enters the lower bulb
const APEX_Y = 790; // top of the lower pile
const PILE_HALF = 178; // half-width of the pile at its base
const PILE_BASE_Y = 915;
const TOP_RIM_Y = 405; // top sand surface at the glass wall
const TOP_RIM_HALF = 205;
const FUNNEL_Y = 574; // top sand surface at the centre (the hole)

const GRAVITY = 1500; // px/s² in render pixels
const STREAM_RATE = 110; // grains per second
const TRICKLE_COUNT = 42;
// darker grains read on the pale glass and the pale sand; a few glints
const TONES = ["#a99a70", "#c4b58c", "#fffbee"] as const;

type Grain = { kind: 0 | 1 | 2; x: number; y: number; vx: number; vy: number; s: number; side: number; life: number; tone: number; size: number };

function pileY(x: number): number {
  return APEX_Y + (Math.abs(x - CX) * (PILE_BASE_Y - APEX_Y)) / PILE_HALF;
}

function topSurfaceY(dx: number): number {
  const t = Math.min(1, Math.abs(dx) / TOP_RIM_HALF);
  return FUNNEL_Y - (FUNNEL_Y - TOP_RIM_Y) * Math.pow(t, 1.5);
}

/** Small deterministic PRNG so a dev capture can be reproduced. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SandSim = {
  step: (dt: number) => void;
  draw: (ctx: CanvasRenderingContext2D) => void;
  grains: () => number;
};

export function createSandSim(seed = 7): SandSim {
  const rnd = mulberry32(seed);
  const grains: Grain[] = [];
  let emit = 0;
  const pickTone = () => {
    const r = rnd();
    return r < 0.5 ? 0 : r < 0.86 ? 1 : 2;
  };

  function spawnTrickle(fresh: boolean): Grain {
    const side = rnd() < 0.5 ? -1 : 1;
    const s = fresh ? 140 + rnd() * 62 : 16 + rnd() * 186;
    return { kind: 0, x: CX + side * s, y: topSurfaceY(s) - 2, vx: 0, vy: 0, s, side, life: 1, tone: rnd() < 0.8 ? 0 : 1, size: 3 + rnd() * 1.6 };
  }
  for (let i = 0; i < TRICKLE_COUNT; i++) grains.push(spawnTrickle(false));

  function step(dt: number) {
    emit += dt * STREAM_RATE;
    while (emit >= 1) {
      emit -= 1;
      const g = (rnd() + rnd() + rnd() - 1.5) * 2.2; // roughly gaussian, ±3 px
      grains.push({ kind: 1, x: CX + g, y: NECK_Y + rnd() * 10, vx: (rnd() - 0.5) * 14, vy: 120 + rnd() * 80, s: 0, side: 0, life: 1, tone: pickTone(), size: 3 + rnd() * 1.8 });
    }
    for (let i = grains.length - 1; i >= 0; i--) {
      const g = grains[i];
      if (g.kind === 0) {
        // slide toward the funnel, faster as the surface steepens
        const t = 1 - g.s / TOP_RIM_HALF;
        g.s -= (20 + 120 * t * t) * dt;
        if (g.s <= 5) {
          grains[i] = spawnTrickle(true);
          continue;
        }
        g.x = CX + g.side * g.s + Math.sin(g.s * 0.35 + g.size) * 1.6;
        g.y = topSurfaceY(g.s) - 2;
      } else if (g.kind === 1) {
        g.vy += GRAVITY * dt;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        const floor = pileY(g.x);
        if (g.y >= floor) {
          // landed: one or two grains roll down the slope, sometimes one bounces
          const n = rnd() < 0.4 ? 2 : 1;
          grains.splice(i, 1);
          for (let k = 0; k < n; k++) {
            const side = Math.sign(g.x - CX + (rnd() - 0.5) * 8) || (rnd() < 0.5 ? -1 : 1);
            const bounce = rnd() < 0.18;
            grains.push({
              kind: 2,
              x: g.x,
              y: floor - 1.5,
              vx: side * (60 + rnd() * 130),
              vy: bounce ? -(120 + rnd() * 140) : 0,
              s: 0,
              side,
              life: 0.4 + rnd() * 0.7,
              tone: rnd() < 0.6 ? 0 : 1,
              size: 2.6 + rnd() * 1.4,
            });
          }
          continue;
        }
      } else {
        g.x += g.vx * dt;
        g.vx *= Math.max(0, 1 - 2 * dt);
        if (g.vy !== 0) {
          // a kicked-up grain: small arc, then it settles on the slope
          g.vy += GRAVITY * dt;
          g.y += g.vy * dt;
          const floor = pileY(g.x) - 1.5;
          if (g.y >= floor) {
            g.y = floor;
            g.vy = 0;
          }
        } else {
          g.y = pileY(g.x) - 1.5;
        }
        g.life -= dt;
        if (g.life <= 0 || Math.abs(g.x - CX) > PILE_HALF - 6) grains.splice(i, 1);
      }
    }
  }

  function draw(ctx: CanvasRenderingContext2D) {
    for (const g of grains) {
      const half = g.size / 2;
      ctx.fillStyle = TONES[g.tone];
      if (g.kind === 1) {
        // a short streak behind a falling grain: motion, even in a still frame
        const len = Math.min(12, g.vy * 0.022);
        ctx.globalAlpha = 0.45;
        ctx.fillRect(g.x - half * 0.6, g.y - len, g.size * 0.6, len);
        ctx.globalAlpha = 0.95;
        ctx.fillRect(g.x - half, g.y - half, g.size, g.size);
      } else {
        ctx.globalAlpha = g.kind === 2 ? Math.min(1, g.life * 2.2) * 0.9 : 0.75;
        ctx.fillRect(g.x - half, g.y - half, g.size, g.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  return { step, draw, grains: () => grains.length };
}

export function SandFlow() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sim = createSandSim();
    let scale = 1;
    let dpr = 1;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      if (rect.width === 0) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      scale = rect.width / W;
      canvas!.width = Math.round(rect.width * dpr);
      canvas!.height = Math.round(rect.height * dpr);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(canvas);

    let raf = 0;
    let last = 0;
    function render() {
      ctx!.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      ctx!.clearRect(0, 0, W, canvas!.height / (dpr * scale));
      sim.draw(ctx!);
    }
    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      sim.step(dt);
      render();
    }
    raf = requestAnimationFrame(frame);

    // Dev hook: drive the simulation by hand for headless captures.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __stayrSand?: unknown }).__stayrSand = {
        step: (dt: number, n = 1) => {
          for (let i = 0; i < n; i++) sim.step(dt);
          render();
          return sim.grains();
        },
      };
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
