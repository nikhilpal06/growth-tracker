"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 size={16} className={`animate-spin ${className}`} />;
}

export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "success"; children: React.ReactNode }) {
  const cls = kind === "error" ? "bg-red-50 text-danger border-red-200" : kind === "success" ? "bg-green-50 text-success border-green-200" : "bg-blue-50 text-brand border-blue-200";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

/** Toast-like transient message. */
export function useFlash(ms = 3000) {
  const [msg, setMsg] = useState<{ kind: "info" | "error" | "success"; text: string } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), ms);
    return () => clearTimeout(t);
  }, [msg, ms]);
  return {
    msg,
    flash: (text: string, kind: "info" | "error" | "success" = "success") => setMsg({ kind, text }),
    node: msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : null,
  };
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5 lg:mb-6">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="muted mt-1">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
