"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Original decorative hero background: grains of "sand" on a vibrating plate
 * drift toward the nodal lines of a standing wave (a Chladni-style resonance
 * pattern) and re-settle whenever the vibration mode changes.
 *
 * - Pure decoration: aria-hidden, no text or data.
 * - devicePixelRatio aware (capped at 2) and resized with the container.
 * - Pauses when the tab is hidden or the canvas is off-screen.
 * - Under prefers-reduced-motion it renders one settled, static frame.
 */

/** Vibration modes (n, m, sign). Sign selects the symmetric or antisymmetric plate solution. */
const MODES: Array<[number, number, 1 | -1]> = [
  [1, 4, 1],
  [3, 5, -1],
  [2, 5, 1],
  [4, 7, -1],
  [3, 7, 1],
  [2, 7, -1],
  [5, 6, 1],
];
const MODE_SECONDS = 9;
const BLEND_SECONDS = 2.5;
const SETTLE_STEPS = 220;

interface Field {
  value: number;
  gx: number;
  gy: number;
}

function sample([n, m, s]: [number, number, 1 | -1], x: number, y: number, out: Field): void {
  const a = n * Math.PI;
  const b = m * Math.PI;
  const cax = Math.cos(a * x);
  const cbx = Math.cos(b * x);
  const cay = Math.cos(a * y);
  const cby = Math.cos(b * y);
  const sax = Math.sin(a * x);
  const sbx = Math.sin(b * x);
  const say = Math.sin(a * y);
  const sby = Math.sin(b * y);
  out.value = cax * cby + s * cbx * cay;
  out.gx = -a * sax * cby - s * b * sbx * cay;
  out.gy = -b * cax * sby - s * a * cbx * say;
}

export function ResonanceField({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let dpr = 1;
    let xs = new Float32Array(0);
    let ys = new Float32Array(0);
    let tint = new Uint8Array(0);
    let frame = 0;
    let running = false;
    let visible = true;
    let modeIndex = 0;
    let modeStartedAt = performance.now();
    const f1: Field = { value: 0, gx: 0, gy: 0 };
    const f2: Field = { value: 0, gx: 0, gy: 0 };

    function seed(count: number) {
      xs = new Float32Array(count);
      ys = new Float32Array(count);
      tint = new Uint8Array(count);
      for (let i = 0; i < count; i++) {
        xs[i] = Math.random();
        ys[i] = Math.random();
        tint[i] = Math.random() < 0.035 ? 1 : 0;
      }
    }

    function step(blend: number) {
      const current = MODES[modeIndex % MODES.length];
      const next = MODES[(modeIndex + 1) % MODES.length];
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i];
        const y = ys[i];
        sample(current, x, y, f1);
        let value = f1.value;
        let gx = f1.gx;
        let gy = f1.gy;
        if (blend > 0) {
          sample(next, x, y, f2);
          value += (f2.value - value) * blend;
          gx += (f2.gx - gx) * blend;
          gy += (f2.gy - gy) * blend;
        }
        const g = Math.hypot(gx, gy) + 1e-6;
        const amplitude = Math.abs(value);
        // Slide toward the nodal line, plus vibration noise that dies out on it.
        let nx = x - (value * gx * 0.003) / g + (Math.random() - 0.5) * (0.014 * amplitude + 0.0045);
        let ny = y - (value * gy * 0.003) / g + (Math.random() - 0.5) * (0.014 * amplitude + 0.0045);
        if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
          nx = Math.random();
          ny = Math.random();
        }
        xs[i] = nx;
        ys[i] = ny;
      }
    }

    function draw() {
      ctx!.fillStyle = "#000";
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);
      const size = Math.max(1, Math.round(dpr * 0.9));
      const w = canvas!.width;
      const h = canvas!.height;
      ctx!.fillStyle = "rgba(255,255,255,0.62)";
      for (let i = 0; i < xs.length; i++) if (!tint[i]) ctx!.fillRect((xs[i] * w) | 0, (ys[i] * h) | 0, size, size);
      ctx!.fillStyle = "rgba(255,59,29,0.9)";
      for (let i = 0; i < xs.length; i++) if (tint[i]) ctx!.fillRect((xs[i] * w) | 0, (ys[i] * h) | 0, size, size);
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      const count = Math.round(Math.min(14000, Math.max(2500, (width * height) / 95)) * intensity);
      if (count !== xs.length) {
        seed(count);
        for (let i = 0; i < SETTLE_STEPS; i++) step(0);
      }
      draw();
    }

    function tick(now: number) {
      if (!running) return;
      const elapsed = (now - modeStartedAt) / 1000;
      if (elapsed > MODE_SECONDS + BLEND_SECONDS) {
        modeIndex = (modeIndex + 1) % MODES.length;
        modeStartedAt = now;
      }
      const blend = elapsed > MODE_SECONDS ? Math.min(1, (elapsed - MODE_SECONDS) / BLEND_SECONDS) : 0;
      step(blend);
      draw();
      frame = requestAnimationFrame(tick);
    }

    function updateRunning() {
      const shouldRun = visible && !document.hidden && !reducedMotion.matches;
      if (shouldRun && !running) {
        running = true;
        modeStartedAt = performance.now();
        frame = requestAnimationFrame(tick);
      } else if (!shouldRun && running) {
        running = false;
        cancelAnimationFrame(frame);
      }
    }

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      updateRunning();
    });
    intersection.observe(canvas);
    document.addEventListener("visibilitychange", updateRunning);
    reducedMotion.addEventListener("change", updateRunning);

    resize();
    updateRunning();

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", updateRunning);
      reducedMotion.removeEventListener("change", updateRunning);
    };
  }, [intensity]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cn("pointer-events-none block size-full bg-black", className)} />;
}
