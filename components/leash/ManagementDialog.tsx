"use client";
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { X } from "lucide-react";
import styles from "./management.module.css";

/** Native modal provides focus trapping, Escape and focus restoration. */
export function ManagementDialog({
  title,
  onClose,
  children,
  returnFocus,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => {
        const target = returnFocus?.current || previous;
        if (target instanceof HTMLElement && target.isConnected) target.focus();
      });
    };
  }, [returnFocus]);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialogHead}>
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="widget-icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
