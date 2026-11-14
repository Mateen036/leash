"use client";

import { motion, useReducedMotion } from "motion/react";
import { NumberTicker } from "@/components/ui/number-ticker";

/** USD amount from 6-decimal token units, ticking when it changes (static under reduced motion). */
export function Amount({
  units,
  className,
}: {
  units: string | bigint;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const value = Number(units) / 1e6;
  if (reduce) return <span className={className}>${value.toFixed(2)}</span>;
  return (
    <span className={className}>
      $
      <NumberTicker
        key={value}
        value={value}
        startValue={0}
        decimalPlaces={2}
        className="!tracking-normal !text-inherit"
      />
    </span>
  );
}

/** Spending ring: today's agent spend against the on-chain daily cap. */
export function SpendRing({
  spent,
  cap,
  size = 54,
}: {
  spent: string;
  cap: string;
  size?: number;
}) {
  const reduce = useReducedMotion();
  const ratio = Math.min(1, Number(cap) > 0 ? Number(spent) / Number(cap) : 0);
  const r = size / 2 - 5;
  return (
    <svg
      className="la-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${Math.round(ratio * 100)}% of daily cap spent`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#253139"
        strokeWidth="5"
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={ratio > 0.85 ? "#c4acff" : "#00ec97"}
        strokeWidth="5"
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: Math.max(ratio, 0.001) }}
        transition={{ duration: reduce ? 0 : 0.9, ease: [0.23, 1, 0.32, 1] }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="#e6f4ef"
      >
        {Math.round(ratio * 100)}%
      </text>
    </svg>
  );
}
