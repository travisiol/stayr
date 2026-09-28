"use client";

import { useEffect, useState } from "react";
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from "framer-motion";
import { clsx } from "clsx";
import { economics } from "@/lib/site";
import { formatMultiplier } from "@/lib/rewards-math";

/**
 * Four stops at equal spacing (the track is not to scale — 24 hours is not
 * twelve times wider than 2 hours). A marker travels the track on a slow
 * loop and the multiplier it carries steps up at each stop.
 */
const STOPS = [
  { at: 0, label: "Buy", multiplier: economics.baseMultiplier },
  ...economics.milestones.map((m, i) => ({ at: (i + 1) / economics.milestones.length, label: m.label, multiplier: m.multiplier })),
];

export function MilestoneTimeline() {
  const reduce = useReducedMotion();
  // Starts at the first stop on the server and the client alike; under
  // reduced motion the marker simply jumps to the end once mounted.
  const p = useMotionValue(0);
  const [tier, setTier] = useState(0);
  const left = useTransform(p, (v) => `${v * 100}%`);

  useEffect(() => {
    if (reduce) {
      p.set(1);
      return;
    }
    const controls = animate(p, [0, 1], { duration: 16, ease: "linear", repeat: Infinity, repeatDelay: 2 });
    return () => controls.stop();
  }, [p, reduce]);

  useMotionValueEvent(p, "change", (v) => {
    let t = 0;
    for (let i = 0; i < STOPS.length; i++) if (v >= STOPS[i].at - 0.0001) t = i;
    setTier((prev) => (prev === t ? prev : t));
  });

  return (
    <div className="pt-4">
      <div className="relative mx-3 h-1.5 rounded-full bg-cream-deep sm:mx-6">
        <motion.div className="absolute left-0 top-0 h-full rounded-full bg-lime-deep" style={{ width: left }} aria-hidden="true" />
        {STOPS.map((s, i) => (
          <div
            key={s.label}
            className={clsx(
              "absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors duration-300",
              i <= tier ? "border-forest bg-lime" : "border-line-strong bg-paper",
            )}
            style={{ left: `${s.at * 100}%` }}
            aria-hidden="true"
          />
        ))}
        <motion.div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left }} aria-hidden="true">
          <div className="relative h-5 w-5 rounded-full bg-forest shadow-[0_2px_8px_rgba(18,38,28,0.35)] ring-4 ring-cream" />
          <div className="num absolute left-1/2 top-[-38px] -translate-x-1/2 whitespace-nowrap rounded-[8px] bg-forest px-2 py-0.5 text-[12px] font-semibold text-cream">
            {formatMultiplier(STOPS[tier].multiplier)}
          </div>
        </motion.div>
      </div>
      <ol className="mt-6 grid grid-cols-4 sm:mx-6">
        {STOPS.map((s, i) => (
          <li
            key={s.label}
            className={clsx(
              "flex flex-col gap-1 transition-colors duration-300",
              i === 0 ? "items-start text-left" : i === STOPS.length - 1 ? "items-end text-right" : "items-center text-center",
            )}
          >
            <span className={clsx("num text-[clamp(20px,2.6vw,30px)] font-semibold", i <= tier ? "text-forest" : "text-moss-soft")}>
              {formatMultiplier(s.multiplier)}
            </span>
            <span className="text-[13px] font-medium text-moss">{s.label}</span>
          </li>
        ))}
      </ol>
      <p className="sr-only">
        Holding milestones: {STOPS.map((s) => `${s.label} ${formatMultiplier(s.multiplier)}`).join(", ")}. Selling resets the clock.
      </p>
    </div>
  );
}
