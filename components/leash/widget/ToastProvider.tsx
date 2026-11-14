"use client";
import { ErrorNotice } from "../ErrorNotice";
import { plainText } from "../display";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, X, ExternalLink } from "lucide-react";
export type ToastMessage = {
  title: string;
  description?: string;
  variant?: "success" | "error";
  href?: string;
};
const ToastContext = createContext<(message: ToastMessage) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<(ToastMessage & { id: number })[]>([]),
    reduced = useReducedMotion();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]),
    nextId = useRef(0);
  const toast = useCallback((message: ToastMessage) => {
    const id = ++nextId.current;
    setItems((list) => [...list.slice(-3), { ...message, id }]);
    timers.current.push(
      setTimeout(
        () => setItems((list) => list.filter((t) => t.id !== id)),
        9000,
      ),
    );
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="widget-toasts"
        aria-live="polite"
        aria-relevant="additions"
      >
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              className={`widget-toast ${t.variant === "error" ? "toast-error" : ""}`}
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <span className="toast-icon">
                {t.variant === "error" ? <X size={17} /> : <Check size={17} />}
              </span>
              <div>
                {t.variant === "error" ? (
                  <ErrorNotice
                    error={t.description || t.title}
                    className="toast-message"
                  />
                ) : (
                  <>
                    <strong>{plainText(t.title)}</strong>
                    {t.description && <p>{plainText(t.description)}</p>}
                  </>
                )}
                {t.href && (
                  <a href={t.href} target="_blank" rel="noreferrer">
                    View transaction <ExternalLink size={11} />
                  </a>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() =>
                  setItems((list) => list.filter((i) => i.id !== t.id))
                }
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
