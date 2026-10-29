import type { ReactNode } from "react";

export function Kpi({ label, value, hint, tone = "default" }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "good" | "warn";
}) {
  const color = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-sm leading-snug text-slate-500">{hint}</p>}
    </div>
  );
}

export function Panel({ title, subtitle, children, right }: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-slate-700">
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-teal-600" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
      {label}
    </label>
  );
}

// Decision times the desk might realistically commit at on D-1 (UK local = UTC in January).
const DECISION_TIMES = ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "16:00"];

export function DecisionTimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-sm text-slate-700">
      <span className="label mb-1 block">Decision time (D-1, UK)</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
      >
        {DECISION_TIMES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </label>
  );
}

export function Loading() {
  return <div className="card animate-pulse text-sm text-slate-500">Loading…</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="card border-red-200 bg-red-50 text-sm text-red-700">{message}</div>;
}
