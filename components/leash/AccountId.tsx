"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { shortAccount } from "./display";
export function AccountId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="account-id">
      <span>{shortAccount(id)}</span>
      <button
        type="button"
        aria-label={copied ? "Account copied" : "Copy account ID"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(id);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </span>
  );
}
