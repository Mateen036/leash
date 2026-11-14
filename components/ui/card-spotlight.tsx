"use client";

/**
 * Aceternity UI "Card Spotlight" (https://ui.aceternity.com/components/card-spotlight), MIT.
 * Adapted for Leash: CSS-only texture, sharing the orbital scene's palette
 * without allocating an additional WebGL context.
 */
import { useMotionValue, motion, useMotionTemplate } from "motion/react";
import React, { type MouseEvent as ReactMouseEvent } from "react";
import { cn } from "@/lib/utils";

export const CardSpotlight = ({
  children,
  radius = 260,
  color = "#14372d",
  className,
  ...props
}: {
  radius?: number;
  color?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) => {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  function handleMouseMove({
    currentTarget,
    clientX,
    clientY,
  }: ReactMouseEvent<HTMLDivElement>) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }
  const mask = useMotionTemplate`radial-gradient(${radius}px circle at ${mouseX}px ${mouseY}px, white, transparent 80%)`;
  return (
    <div
      className={cn("group/spotlight relative", className)}
      onMouseMove={handleMouseMove}
      {...props}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-px z-0 rounded-[inherit] opacity-0 transition duration-300 group-hover/spotlight:opacity-100 motion-reduce:hidden"
        style={{
          backgroundColor: color,
          backgroundImage:
            "radial-gradient(#00ec9726 1.2px, transparent 1.3px)",
          backgroundSize: "9px 9px",
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
};
