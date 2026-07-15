// ============================================================
// Utility statistiche per report e anomalie
// ============================================================

// Mediana di una lista di numeri (robusta agli estremi, meglio della media)
export function median(nums) {
  if (!nums || nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(nums) {
  if (!nums || nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Chiave che identifica un "tipo di lavoro": progetto + descrizione normalizzata.
// Così "Montaggio Reel" di giorni diversi finisce nello stesso gruppo.
export function taskKey(entry) {
  const desc = (entry.description || "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${entry.project_id || "none"}::${desc}`;
}

// Scostamento percentuale di un valore rispetto a un riferimento.
// Ritorna un numero (es. +12 o -9). null se il riferimento è 0.
export function deviationPct(value, reference) {
  if (!reference || reference <= 0) return null;
  return ((value - reference) / reference) * 100;
}

// Formatta una percentuale con segno: 12 -> "+12%"
export function fmtPct(p, decimals = 0) {
  if (p == null || Number.isNaN(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(decimals)}%`;
}

// Colore semaforo in base allo scostamento (per le anomalie).
// Vicino allo zero = ok; oltre soglia = attenzione.
export function deviationColor(p, threshold = 40) {
  if (p == null) return "var(--ink-faint)";
  const a = Math.abs(p);
  if (a < threshold * 0.5) return "var(--ok)";
  if (a < threshold) return "var(--warn)";
  return "var(--stop)";
}

// Raggruppa voci per taskKey e calcola statistiche per ciascun tipo di lavoro.
// entries: voci COMPLETATE (con durata).
export function buildTaskStats(entries, projectById) {
  const groups = {};
  for (const e of entries) {
    if (!e.stopped_at) continue;
    const k = taskKey(e);
    if (!groups[k]) groups[k] = { key: k, entries: [], durations: [] };
    groups[k].entries.push(e);
    const secs =
      e.duration_seconds != null
        ? e.duration_seconds
        : Math.max(0, Math.floor((new Date(e.stopped_at) - new Date(e.started_at)) / 1000));
    groups[k].durations.push(secs);
  }

  return Object.values(groups)
    .map((g) => {
      const sample = g.entries[0];
      const proj = projectById ? projectById(sample.project_id) : null;
      const med = median(g.durations);
      const est = proj?.estimated_seconds || null;
      // riferimento: mediana se abbastanza campioni, altrimenti stima admin
      const reference = g.durations.length >= 5 ? med : est || med;
      return {
        key: g.key,
        description: sample.description || "Senza descrizione",
        project: proj,
        count: g.durations.length,
        median: med,
        min: Math.min(...g.durations),
        max: Math.max(...g.durations),
        total: g.durations.reduce((a, b) => a + b, 0),
        estimate: est,
        reference,
        hasEnoughData: g.durations.length >= 5,
        entries: g.entries,
        durations: g.durations,
      };
    })
    .sort((a, b) => b.total - a.total);
}

// Trova le voci "anomale": scostamento oltre soglia rispetto al riferimento.
// Richiede un minimo di storico per evitare falsi allarmi.
export function findAnomalies(taskStats, threshold = 40, minSamples = 5) {
  const flagged = [];
  for (const t of taskStats) {
    const ref = t.hasEnoughData ? t.median : t.estimate;
    if (!ref || ref <= 0) continue;
    if (t.hasEnoughData === false && !t.estimate) continue;
    for (const e of t.entries) {
      const secs =
        e.duration_seconds != null
          ? e.duration_seconds
          : Math.max(0, Math.floor((new Date(e.stopped_at) - new Date(e.started_at)) / 1000));
      const p = deviationPct(secs, ref);
      if (p != null && Math.abs(p) >= threshold) {
        flagged.push({
          entry: e,
          task: t,
          seconds: secs,
          reference: ref,
          pct: p,
        });
      }
    }
  }
  // ordina per scostamento più forte
  return flagged.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
}
