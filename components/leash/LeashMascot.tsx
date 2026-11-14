"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";

/** Original vector artwork. Pointer samples update Motion values, never React state. */
export function LeashMascot() {
  const id = useId().replace(/:/g, "");
  const reduced = useReducedMotion();
  const [canMove, setCanMove] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [tapped, setTapped] = useState(false);
  const excited = canMove && (hovered || tapped);
  const frame = useRef<number | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const point = useRef({ x: 0, y: 0 });
  const host = useRef<HTMLDivElement>(null);
  const eyeX = useMotionValue(0);
  const eyeY = useMotionValue(0);
  const tilt = useMotionValue(0);
  const spring = { stiffness: 190, damping: 22 };
  const x = useSpring(eyeX, spring);
  const y = useSpring(eyeY, spring);
  const rotate = useSpring(tilt, spring);

  useEffect(() => {
    // Static during hydration. This Motion version snapshots the preference,
    // so also subscribe to changes made while the page is open.
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setCanMove(reduced === false && !media.matches);
    const update = () => setCanMove(!media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [reduced]);

  useEffect(() => {
    // Also handles changing the OS preference while the page is open.
    if (!canMove) {
      eyeX.set(0);
      eyeY.set(0);
      tilt.set(0);
      x.jump(0);
      y.jump(0);
      rotate.jump(0);
      setHovered(false);
      setTapped(false);
    }
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      if (tapTimer.current) clearTimeout(tapTimer.current);
    };
  }, [canMove, eyeX, eyeY, tilt, x, y, rotate]);

  function track(event: PointerEvent<HTMLDivElement>) {
    if (!canMove || event.pointerType === "touch") return;
    point.current = { x: event.clientX, y: event.clientY };
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const box = host.current?.getBoundingClientRect();
      if (!box) return;
      const clamp = (n: number) => Math.max(-1, Math.min(1, n));
      const nx = clamp((point.current.x - box.left - box.width / 2) / (box.width / 2));
      const ny = clamp((point.current.y - box.top - box.height / 2) / (box.height / 2));
      eyeX.set(nx * 7);
      eyeY.set(ny * 5);
      tilt.set(nx * 4);
    });
  }

  function reset() {
    setHovered(false);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    eyeX.set(0);
    eyeY.set(0);
    tilt.set(0);
  }

  function tap(event: PointerEvent<HTMLDivElement>) {
    if (!canMove || event.pointerType !== "touch") return;
    setTapped(true);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setTapped(false), 1400);
  }

  return (
    <div
      ref={host}
      className="leash-mascot"
      data-excited={excited}
      data-motion={canMove}
      onPointerEnter={(event) => {
        if (canMove && event.pointerType !== "touch") setHovered(true);
        track(event);
      }}
      onPointerMove={track}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onPointerDown={tap}
    >
      <svg viewBox="0 0 600 560" width="600" height="560" role="img" aria-label="Leash mascot">
        <defs>
          <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="0.8" y2="1">
            <stop stopColor="#effff7" />
            <stop offset="0.5" stopColor="#b8e5d3" />
            <stop offset="1" stopColor="#5c968b" />
          </linearGradient>
          <linearGradient id={`${id}-body`} x1="0" x2="1" y2="1">
            <stop stopColor="#28463f" /><stop offset="1" stopColor="#0c1e22" />
          </linearGradient>
          <linearGradient id={`${id}-ear`} x1="0" x2="1" y2="1">
            <stop stopColor="#cdbbff" /><stop offset="1" stopColor="#7660bb" />
          </linearGradient>
          <linearGradient id={`${id}-cable`} x1="0" x2="1">
            <stop stopColor="#b59aff" stopOpacity="0" />
            <stop offset="0.23" stopColor="#b59aff" />
            <stop offset="1" stopColor="#00ec97" />
          </linearGradient>
          <radialGradient id={`${id}-aura`}>
            <stop stopColor="#00ec97" stopOpacity="0.14" />
            <stop offset="1" stopColor="#00ec97" stopOpacity="0" />
          </radialGradient>
          <filter id={`${id}-glow`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        <circle cx="340" cy="280" r="245" fill={`url(#${id}-aura)`} />
        <g fill="none" stroke="#45665f" strokeWidth="1">
          <circle cx="340" cy="280" r="210" opacity="0.25" />
          <circle cx="340" cy="280" r="178" opacity="0.18" strokeDasharray="2 9" />
          <ellipse cx="340" cy="452" rx="155" ry="24" opacity="0.35" />
          <path d="M340 62v12m0 412v12M118 280h12m420 0h12" opacity="0.5" />
        </g>
        <g fill="#b59aff">
          <path d="M488 117v14m-7-7h14" stroke="currentColor" className="mascot-spark" />
          <circle cx="160" cy="214" r="3" />
          <circle cx="515" cy="340" r="2" />
        </g>
        <ellipse cx="340" cy="445" rx="95" ry="12" fill="#00ec97" opacity="0.1" filter={`url(#${id}-glow)`} />

        {/* The slack cable points back toward the headline and its action. */}
        <path className="mascot-leash-glow" d="M310 337C239 336 276 420 195 415S153 290 43 314L0 330" fill="none" stroke={`url(#${id}-cable)`} strokeWidth="10" filter={`url(#${id}-glow)`} />
        <path d="M310 337C239 336 276 420 195 415S153 290 43 314L0 330" fill="none" stroke={`url(#${id}-cable)`} strokeWidth="2.5" strokeLinecap="round" />

        <motion.g style={{ rotate, transformOrigin: "340px 315px", transformBox: "view-box" }}>
          <motion.g
            className="mascot-pose"
            animate={{ y: excited ? [0, -13, 0] : 0 }}
            transition={excited ? { duration: 0.58, repeat: Infinity, ease: "easeInOut" } : { duration: canMove ? 0.3 : 0 }}
          >
            <g className="mascot-breathe">
              <g className="mascot-tail">
                <path d="M399 383C442 392 477 364 466 341C458 324 436 337 445 351" fill="none" stroke="#102c2a" strokeWidth="22" strokeLinecap="round" />
                <path d="M399 381C442 390 477 362 466 339C458 322 436 335 445 349" fill="none" stroke="#9ed6c0" strokeWidth="13" strokeLinecap="round" />
                <path d="M466 339C458 322 436 335 445 349" fill="none" stroke="#b59aff" strokeWidth="13" strokeLinecap="round" />
              </g>
              {/* Small armored body and oversized, soft paws. */}
              <rect x="278" y="318" width="126" height="114" rx="49" fill={`url(#${id}-body)`} stroke="#527b6c" strokeWidth="2" />
              <rect x="303" y="349" width="76" height="63" rx="25" fill="#0a171c" stroke="#426258" />
              <path d="m327 379 10 10 19-23" fill="none" stroke="#00ec97" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="271" y="406" width="62" height="33" rx="15" fill={`url(#${id}-shell)`} stroke="#7aa897" strokeWidth="2" />
              <rect x="352" y="406" width="62" height="33" rx="15" fill={`url(#${id}-shell)`} stroke="#7aa897" strokeWidth="2" />
              <path d="M288 425h14m67 0h14" stroke="#588a77" strokeWidth="2" strokeLinecap="round" />

              {/* Asymmetric ears give this little agent its own silhouette. */}
              <g className="mascot-ear">
                <path d="M246 196 216 130Q205 110 193 131L180 192Q178 214 207 224Z" fill={`url(#${id}-ear)`} stroke="#3c3d58" strokeWidth="3" />
                <path d="m210 154-8 38 23 9" fill="none" stroke="#e0d2ff" strokeWidth="4" strokeLinecap="round" opacity="0.65" />
              </g>
              <path d="m421 196 27-74q6-19 19-4l18 58q7 26-22 39Z" fill={`url(#${id}-shell)`} stroke="#527c6c" strokeWidth="3" />
              <path d="m456 148 10 37-25 14" fill="none" stroke="#638f80" strokeWidth="5" strokeLinecap="round" />
              <path d="M342 159v-23" stroke="#96c2ad" strokeWidth="6" />
              <circle cx="342" cy="129" r="9" fill="#00ec97" />
              <circle cx="339" cy="126" r="3" fill="#effff7" />

              <rect x="222" y="164" width="239" height="165" rx="65" fill="#0a1b1d" stroke="#36564b" strokeWidth="3" />
              <rect x="220" y="157" width="239" height="165" rx="65" fill={`url(#${id}-shell)`} stroke="#91bdaa" strokeWidth="2" />
              <path d="M244 198q8-23 34-25h99" fill="none" stroke="#f1fff7" strokeWidth="3" opacity="0.6" strokeLinecap="round" />
              <rect x="240" y="194" width="199" height="93" rx="39" fill="#09171e" stroke="#517b70" strokeWidth="3" />
              <path d="M262 208q48-14 107-3" fill="none" stroke="#45636d" strokeWidth="2" opacity="0.45" strokeLinecap="round" />
              <g className="mascot-blink">
                <motion.g style={{ x, y }} className="mascot-pupils" fill="#00ec97">
                  <rect x="279" y="222" width="23" height="34" rx="11.5" />
                  <rect x="376" y="222" width="23" height="34" rx="11.5" />
                  <g fill="#eafff5">
                    <circle cx="286" cy="230" r="3.5" /><circle cx="383" cy="230" r="3.5" />
                  </g>
                </motion.g>
              </g>
              <path d="m330 263 9 5 9-5" fill="none" stroke="#9ae2ca" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <g fill="#9b8bcf" opacity="0.6">
                <ellipse cx="264" cy="268" rx="8" ry="3" /><ellipse cx="415" cy="268" rx="8" ry="3" />
              </g>
              <path d="M324 303h31" stroke="#3a6d5a" strokeWidth="3" strokeLinecap="round" />
              <rect x="285" y="320" width="110" height="15" rx="7.5" fill="#00ec97" />
              <rect className="mascot-leash-glow" x="285" y="320" width="110" height="15" rx="7.5" fill="#00ec97" filter={`url(#${id}-glow)`} />
              <circle cx="310" cy="330" r="11" fill="#113c31" stroke="#82ffca" strokeWidth="2" />
              <path d="M306 330h8m-4-4v8" stroke="#bfffe5" strokeWidth="1.5" strokeLinecap="round" />
            </g>
          </motion.g>
        </motion.g>
        <g className="mascot-caption" textAnchor="middle" fontFamily="var(--mono)">
          <text x="340" y="502" fill="#b7cfc5" fontSize="10" letterSpacing="3">YOUR AGENT. YOUR LIMITS.</text>
          <circle cx="279" cy="523" r="2.5" fill="#00ec97" />
          <text x="348" y="526" fill="#7f9e93" fontSize="9" letterSpacing="1">READY WHEN YOU ARE</text>
        </g>
      </svg>
    </div>
  );
}
