import { useState } from "react";
import { api } from "./api";
import AccuracyView from "./components/AccuracyView";
import DayView from "./components/DayView";
import Method from "./components/Method";
import { ErrorBox, Loading } from "./components/ui";
import { useApi } from "./useApi";

const TABS = [
  { id: "day", label: "Day-ahead decision" },
  { id: "accuracy", label: "Forecast accuracy" },
  { id: "method", label: "How it works" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function App() {
  const [tab, setTab] = useState<Tab>("day");
  const meta = useApi(() => api.meta(), []);

  return (
    <div className="min-h-screen">
      <header className="bg-gradient-to-r from-teal-800 to-slate-900 text-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-widest text-teal-200">GB day-ahead · wind</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Wind Forecast Desk</h1>
          <p className="mt-1 max-w-2xl text-sm text-teal-50/80">
            The wind forecast you actually have when you buy day-ahead, and how far to trust it.
          </p>
          <nav className="mt-5 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.id ? "bg-white text-teal-900" : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {meta.error && <ErrorBox message={`Could not reach the API: ${meta.error}`} />}
        {meta.loading && <Loading />}
        {meta.data && tab === "day" && <DayView meta={meta.data} />}
        {meta.data && tab === "accuracy" && <AccuracyView meta={meta.data} />}
        {meta.data && tab === "method" && <Method meta={meta.data} />}
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-slate-400 sm:px-6">
        Data: Elexon BMRS (FUELHH, WINDFOR), January 2026 snapshot. Pilot build.
      </footer>
    </div>
  );
}
