// ============================================================
// Calcolo del costo del personale (controllo di gestione).
//
// DISCLAIMER: tutti i valori sono STIME GESTIONALI INTERNE.
// Il dato ufficiale è quello del consulente del lavoro / busta paga.
//
// Metodo (approvato Step 1): costo orario TEORICO come base.
//   costo orario teorico = costo azienda annuo / ore lavorabili annue
//
// Il costo azienda annuo può essere fornito in due modi:
//   A) costo orario già pronto (es. 31 €/h) → lo usiamo diretto
//   B) componenti annui → li sommiamo e dividiamo per le ore
// ============================================================

// Ore lavorabili annue di default se non specificate.
// 40h/sett * 52 sett - ferie/permessi/festività tipici ≈ 1.700h "produttive".
// Usiamo un default prudente e modificabile per persona.
export const DEFAULT_WORKABLE_HOURS_YEAR = 1700;

/**
 * Dato un record staff_cost, calcola il costo orario gestionale (€/h).
 * Ritorna { costPerHour, annualCost, method } oppure null se dati insufficienti.
 */
export function hourlyCostFrom(record) {
  if (!record) return null;

  // Modalità A: costo orario diretto
  if (record.cost_per_hour != null && record.cost_per_hour > 0) {
    return {
      costPerHour: record.cost_per_hour,
      annualCost: null,
      method: "diretto",
    };
  }

  // Modalità B: componenti annui
  const gross = num(record.annual_gross);
  if (gross > 0) {
    const contrib = gross * (num(record.contrib_pct) / 100);
    const tfr = gross * (num(record.tfr_pct) / 100);
    const other = num(record.other_annual);
    const annualCost = gross + contrib + tfr + other;
    const hours = num(record.workable_hours_year) || DEFAULT_WORKABLE_HOURS_YEAR;
    if (hours <= 0) return null;
    return {
      costPerHour: annualCost / hours,
      annualCost,
      method: "componenti",
    };
  }

  return null;
}

/**
 * Sceglie il record di costo attivo per una persona a una certa data.
 * records: array di staff_cost per un singolo user_id.
 * Ritorna il record con valid_from più recente <= atDate.
 */
export function activeCostRecord(records, atDate = new Date()) {
  if (!records || records.length === 0) return null;
  const iso = toISO(atDate);
  const eligible = records
    .filter((r) => (r.valid_from || "0000-01-01") <= iso)
    .sort((a, b) => (b.valid_from || "").localeCompare(a.valid_from || ""));
  return eligible[0] || null;
}

/**
 * Costo orario attivo per una persona a una data (comodo shortcut).
 * Fallback: se non c'è staff_cost, usa profile.cost_rate (vecchio campo).
 */
export function personHourlyCost(records, profile, atDate = new Date()) {
  const rec = activeCostRecord(records, atDate);
  const fromRec = hourlyCostFrom(rec);
  if (fromRec) return fromRec.costPerHour;
  // fallback sul vecchio campo cost_rate del profilo
  if (profile?.cost_rate != null && profile.cost_rate > 0) return profile.cost_rate;
  return null;
}

// ---- helper ----
function num(v) {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : v;
  return Number.isFinite(n) ? n : 0;
}
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
