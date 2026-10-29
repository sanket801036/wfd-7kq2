export const gw = (mw: number | null | undefined, digits = 1) =>
  mw == null ? "—" : `${(mw / 1000).toFixed(digits)} GW`;

export const gwh = (mwh: number | null | undefined) =>
  mwh == null ? "—" : `${(mwh / 1000).toFixed(1)} GWh`;

export const signedGw = (mw: number | null | undefined) =>
  mw == null ? "—" : `${mw >= 0 ? "+" : "−"}${(Math.abs(mw) / 1000).toFixed(2)} GW`;

export const pct = (v: number | null | undefined, digits = 0) => (v == null ? "—" : `${v.toFixed(digits)}%`);

// All times are UTC; in January UK local time is the same (GMT).
export const hhmm = (iso: string) => iso.slice(11, 16);

export const dayLabel = (isoDate: string) =>
  new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

export const stamp = (iso: string | null) =>
  iso == null ? "—" : `${dayLabel(iso)} ${hhmm(iso)}`;
