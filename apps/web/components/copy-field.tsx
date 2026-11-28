"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button, Input } from "./ui";

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[0.9rem] font-bold">{label}</span>
      <div className="flex gap-2">
        <Input readOnly value={value} aria-label={label} className="font-mono text-[0.84rem]" onFocus={(e) => e.currentTarget.select()} />
        <Button
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
          aria-label={`Copiar ${label}`}
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </div>
  );
}
