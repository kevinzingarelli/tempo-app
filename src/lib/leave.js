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

// ============================================================
// Saldi ferie CONFERMATI mese per mese (checkpoint), aggiunto in v26.
// Questo è un sistema più preciso rispetto alla sola proporzione annuale
// sopra: l'admin conferma un saldo ogni mese, e l'app propone il mese
// successivo calcolando maturato - preso dal saldo confermato precedente.
// ============================================================

// Primo giorno del mese di una data, come stringa "YYYY-MM-DD".
export function periodKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
export function addMonths(periodKeyStr, n) {
  const [y, m] = periodKeyStr.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return periodKey(d);
}
// Numero di mesi tra due period key (b - a), es. addMonths(a, monthsBetween(a,b)) === b
export function monthsBetween(aKey, bKey) {
  const [ay, am] = aKey.split("-").map(Number);
  const [by, bm] = bKey.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

// Maturazione mensile in giorni per una persona: monte annuo (giorni) / 12.
// Se il profilo ha solo annual_leave_hours, converto in giorni con work_hours_per_day.
export function monthlyAccrualDays(profile) {
  const hpd = num(profile?.work_hours_per_day) || DEFAULT_WORK_HOURS_PER_DAY;
  let yearDays = num(profile?.annual_leave_days);
  if (!yearDays && profile?.annual_leave_hours) {
    yearDays = num(profile.annual_leave_hours) / hpd;
  }
  return yearDays ? yearDays / 12 : 0;
}

// Giorni di ferie APPROVATE (kind="ferie") che ricadono nel mese "periodKeyStr"
// (dal 1° all'ultimo giorno di quel mese), contando i giorni feriali.
export function approvedDaysInMonth(requests, periodKeyStr) {
  const [y, m] = periodKeyStr.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  let total = 0;
  for (const r of requests || []) {
    if (r.status !== "approved") continue;
    if ((r.kind || "ferie") !== "ferie") continue;
    // intersezione tra [r.start_date, r.end_date] e [monthStart, monthEnd]
    const s = r.start_date < monthStart ? monthStart : r.start_date;
    const e = r.end_date > monthEnd ? monthEnd : r.end_date;
    if (s > e) continue;
    total += weekdaysInRange(s, e, y);
  }
  return total;
}

/**
 * Calcola la proposta di saldo per il periodo corrente (o un periodo
 * successivo), a partire dall'ultimo checkpoint confermato.
 * @param lastCheckpoint - {period, opening_days} ultimo confermato, o null se non esiste
 * @param profile - riga profiles della persona
 * @param requests - array di time_off della persona
 * @param targetPeriodKey - periodo per cui vogliamo la proposta ("YYYY-MM-01")
 * @returns null se non c'è un checkpoint precedente da cui partire, altrimenti
 *   { monthsElapsed, accruedDays, usedDays, proposedOpeningDays, fromPeriod, toPeriod }
 */
export function computeCheckpointProposal(lastCheckpoint, profile, requests, targetPeriodKey) {
  if (!lastCheckpoint) return null;
  const monthsElapsed = monthsBetween(lastCheckpoint.period, targetPeriodKey);
  if (monthsElapsed <= 0) return null; // il checkpoint è già per questo periodo o più avanti

  const monthlyAccrual = monthlyAccrualDays(profile);
  let accrued = 0;
  let used = 0;
  let cursor = lastCheckpoint.period;
  for (let i = 0; i < monthsElapsed; i++) {
    accrued += monthlyAccrual;
    used += approvedDaysInMonth(requests, cursor);
    cursor = addMonths(cursor, 1);
  }
  const proposedOpeningDays = Math.round((num(lastCheckpoint.opening_days) + accrued - used) * 100) / 100;

  return {
    monthsElapsed,
    accruedDays: Math.round(accrued * 100) / 100,
    usedDays: used,
    proposedOpeningDays,
    fromPeriod: lastCheckpoint.period,
    toPeriod: targetPeriodKey,
  };
}

// ---- helper ----

function num(v) {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : v;
  return Number.isFinite(n) ? n : 0;
}
function trimNum(n) {
  return Number.isInteger(n) ? String(n) : String(n);
}
