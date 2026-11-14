"use client";
import { MotionConfig, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { SiteNav, SiteFooter } from "./SiteChrome";
export function PageFrame({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLElement>();
  useEffect(() => {
    if (reduced) return;
    const animation = animate(
      scope.current,
      { opacity: [0, 1], y: [8, 0] },
      { duration: 0.25 },
    );
    return () => animation.stop();
  }, [animate, reduced, scope]);
  return (
    <MotionConfig reducedMotion="user">
      <div className="site-shell">
        <SiteNav />
        <main ref={scope} className="route-content">
          {children}
        </main>
        <SiteFooter />
      </div>
    </MotionConfig>
  );
}
