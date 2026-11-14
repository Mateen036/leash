"use client";
import { actionName } from "../leash/display";
/**
 * Action timeline adapted from Kokonut UI AI status motion patterns.
 * MIT · https://kokonutui.com · https://github.com/kokonut-labs/kokonutui
 * Driven only by reported protocol states; no countdown or simulated completion.
 */
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, CircleDot } from "lucide-react";
export function ActionStatus({
  events,
}: {
  events: { status: string; at: string }[];
}) {
  const reduced = useReducedMotion();
  return (
    <ol className="action-status" aria-label="Reported action status history">
      <AnimatePresence initial={false}>
        {events.map((event, index) => (
          <motion.li
            key={`${event.status}-${index}`}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.3 }}
          >
            <span className="action-status-icon">
              {event.status === "SUCCESS" ? (
                <Check size={16} />
              ) : (
                <CircleDot size={16} />
              )}
            </span>
            <span>
              <strong>{actionName(event.status)}</strong>
              <time dateTime={event.at}>
                {new Date(event.at).toLocaleString()}
              </time>
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
