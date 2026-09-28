"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { clsx } from "clsx";
import type { PointerEvent } from "react";
import { SandFlow } from "@/components/SandFlow";

/**
 * The supplied render, untouched except for its keyed background — placed
 * with a slow entrance, a gentle float and a few degrees of pointer-driven
 * tilt. Entrance and float are CSS animations (they play from the first
 * paint and need no JavaScript frame loop); only the tilt uses springs.
 * Under reduced motion everything sits still.
 *
 * The image is served as-is from /brand (no optimizer): the artwork is the
 * hero, and a deterministic file beats a variant rendered on first request.
 */
export function Hourglass({ className, priority = false }: { className?: string; priority?: boolean }) {
  const reduce = useReducedMotion();
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const tiltX = useSpring(rx, { stiffness: 50, damping: 16, mass: 0.6 });
  const tiltY = useSpring(ry, { stiffness: 50, damping: 16, mass: 0.6 });

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (reduce || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    ry.set(x * 9);
    rx.set(-y * 6);
  }

  function onLeave() {
    rx.set(0);
    ry.set(0);
  }

  return (
    <div
      className={clsx("relative select-none", className)}
      style={{ perspective: 1400 }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <div className="hourglass-enter relative">
        <motion.div style={{ rotateX: tiltX, rotateY: tiltY, transformStyle: "preserve-3d" }} className="hourglass-float relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- served verbatim, two sizes, no optimizer */}
          <img
            src="/brand/hourglass.png"
            srcSet="/brand/hourglass-720.png 611w, /brand/hourglass.png 1014w"
            sizes="(min-width: 1024px) 520px, (min-width: 640px) 380px, 300px"
            width={1014}
            height={1189}
            alt="A 3D hourglass with thick forest-green caps, clear glass and cream sand"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            className="h-auto w-full"
            draggable={false}
          />
          <SandFlow />
        </motion.div>
        {/* studio shadow, a touch wider than the base */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[97%] h-[6%] w-[78%] -translate-x-1/2 rounded-[50%] opacity-60"
          style={{ background: "radial-gradient(closest-side, rgba(18,38,28,0.22), rgba(18,38,28,0) 100%)", filter: "blur(6px)" }}
        />
      </div>
      <style>{`
        .hourglass-enter { animation: hourglass-enter 1.2s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
        @keyframes hourglass-enter { from { opacity: 0; transform: translateY(30px) scale(0.965); } to { opacity: 1; transform: none; } }
        .hourglass-float { animation: hourglass-float 7s ease-in-out infinite; will-change: transform; }
        @keyframes hourglass-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -8px; } }
        @media (prefers-reduced-motion: reduce) { .hourglass-enter, .hourglass-float { animation: none; } }
      `}</style>
    </div>
  );
}
