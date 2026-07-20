// ============================================================
// Calcolo maturazione ferie e permessi (stima gestionale interna).
// Il dato ufficiale è quello del consulente del lavoro.
//
// Modello: ogni persona ha un monte ANNUO di ore ferie e ore permessi.
// La maturazione è proporzionale ai mesi trascorsi nell'anno corrente.
//   maturato_a_oggi = monte_annuo * (mesi_trascorsi / 12)
// L'usato è calcolato dai giorni di assenza approvati (per categoria),
// convertiti in ore con le ore lavorative al giorno.
// ============================================================

export const DEFAULT_WORK_HOURS_PER_DAY = 8;

// Frazione dell'anno trascorsa, basata sul mese corrente (mese pieno).
// A fine luglio (mese 6, 0-based) = 7/12.
export function yearAccrualFraction(atDate = new Date()) {
  const month = atDate.getMonth(); // 0-11
  return (month + 1) / 12;
}

// Giorni feriali (lun-ven) in un intervallo, limitati all'anno indicato.
export function weekdaysInRange(startISO, endISO, year) {
  let d = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  let count = 0;
  while (d <= end) {
    if (d.getFullYear() === year) {
      const wd = d.getDay();
      if (wd !== 0 && wd !== 6) count++;
    }
    d = new Date(d.getTime() + 86400000);
  }
  return count;
}

/**
 * Calcola il saldo ferie+permessi di una persona per l'anno corrente.
 * @param profile - riga profiles (con annual_leave_hours, annual_permit_hours, work_hours_per_day, annual_leave_days come fallback)
 * @param requests - array di time_off della persona (con status, kind, start_date, end_date)
 * @param atDate - data di riferimento (default oggi)
 * @returns oggetto con ore maturate/usate/residue per ferie e permessi, o null se manca il monte
 */
export function leaveBalance(profile, requests, atDate = new Date()) {
  const year = atDate.getFullYear();
  const hpd = num(profile?.work_hours_per_day) || DEFAULT_WORK_HOURS_PER_DAY;

  // monte annuo in ore: preferisco i campi in ore; fallback su giorni*ore
  let leaveHoursYear = num(profile?.annual_leave_hours);
  if (!leaveHoursYear && profile?.annual_leave_days) {
    leaveHoursYear = num(profile.annual_leave_days) * hpd;
  }
  const permitHoursYear = num(profile?.annual_permit_hours);

  if (!leaveHoursYear && !permitHoursYear) return null;

  const frac = yearAccrualFraction(atDate);

  // usato per categoria (giorni feriali approvati * ore al giorno)
  let leaveUsedDays = 0, permitUsedDays = 0;
  for (const r of requests || []) {
    if (r.status !== "approved") continue;
    const days = weekdaysInRange(r.start_date, r.end_date, year);
    const kind = r.kind || "ferie";
    if (kind === "permesso") permitUsedDays += days;
    else if (kind === "ferie") leaveUsedDays += days;
    // la malattia non intacca ferie/permessi
  }

  const build = (yearHours, usedDays) => {
    if (!yearHours) return null;
    const accrued = yearHours * frac;
    const used = usedDays * hpd;
    return {
      yearHours,
      accruedHours: accrued,
      usedHours: used,
      remainingHours: accrued - used, // residuo maturato non goduto
      remainingTotalHours: yearHours - used, // residuo sull'intero anno
      hoursPerDay: hpd,
    };
  };

  return {
    hoursPerDay: hpd,
    ferie: build(leaveHoursYear, leaveUsedDays),
    permessi: build(permitHoursYear, permitUsedDays),
  };
}

/**
 * Formatta un numero di ore come "20g 2h" (giorni interi + ore residue),
 * usando le ore lavorative al giorno indicate.
 */
export function fmtDaysHours(hours, hoursPerDay = DEFAULT_WORK_HOURS_PER_DAY) {
  if (hours == null || !Number.isFinite(hours)) return "—";
  const neg = hours < 0;
  let h = Math.abs(hours);
  const days = Math.floor(h / hoursPerDay);
  const remH = Math.round((h - days * hoursPerDay) * 10) / 10;
  let out;
  if (days > 0 && remH > 0) out = `${days}g ${trimNum(remH)}h`;
  else if (days > 0) out = `${days}g`;
  else out = `${trimNum(remH)}h`;
  return (neg ? "-" : "") + out;
}

// ---- helper ----
function num(v) {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : v;
  return Number.isFinite(n) ? n : 0;
}
function trimNum(n) {
  return Number.isInteger(n) ? String(n) : String(n);
}
