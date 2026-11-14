"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, ShieldCheck, KeyRound } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { AnimatedBeam } from "../ui/animated-beam";
export function LeashSteps() {
  const container = useRef<HTMLDivElement>(null),
    a = useRef<HTMLDivElement>(null),
    b = useRef<HTMLDivElement>(null),
    c = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div ref={container} className="leash-steps">
      {[
        {
          ref: a,
          icon: ShieldCheck,
          title: "Set your limits",
          copy: "Choose a budget, allowed apps, and expiry.",
        },
        {
          ref: b,
          icon: Bot,
          title: "Review each action",
          copy: "See the amounts and fees before confirming.",
        },
        {
          ref: c,
          icon: KeyRound,
          title: "Stay in control",
          copy: "Over-limit actions are blocked. Pause or revoke any time.",
        },
      ].map((step, index) => (
        <article key={step.title}>
          <span className="leash-eyebrow">0{index + 1}</span>
          <div className="how-icon" ref={step.ref}>
            <step.icon size={24} />
          </div>
          <h3>{step.title}</h3>
          <p>{step.copy}</p>
        </article>
      ))}
      {mounted && !reduced && (
        <>
          <AnimatedBeam
            containerRef={container}
            fromRef={a}
            toRef={b}
            pathOpacity={0.18}
            gradientStartColor="#00ec97"
            gradientStopColor="#b49aff"
            duration={6}
          />
          <AnimatedBeam
            containerRef={container}
            fromRef={b}
            toRef={c}
            pathOpacity={0.18}
            gradientStartColor="#b49aff"
            gradientStopColor="#00ec97"
            duration={6}
            delay={0.5}
          />
        </>
      )}
    </div>
  );
}
