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

// ============================================================
// MAD — Median Absolute Deviation (robusta agli estremi)
// ============================================================

export function mad(nums) {
  if (!nums || nums.length === 0) return 0;
  const med = median(nums);
  return median(nums.map((n) => Math.abs(n - med)));
}

// Anomalie basate su MAD: |x - mediana| > k * MAD (default k=3).
// Richiede almeno minSamples registrazioni; sotto quella soglia usa la
// stima manuale dell'admin (se presente) con una tolleranza percentuale.
// Gestisce il caso MAD=0 (molti valori identici) con fallback percentuale.
export function findAnomaliesMAD(taskStats, { k = 3, minSamples = 8, pctFallback = 50 } = {}) {
  const flagged = [];
  for (const t of taskStats) {
    const useMedian = t.durations.length >= minSamples;
    const ref = useMedian ? t.median : t.estimate;
    if (!ref || ref <= 0) continue;

    const m = useMedian ? mad(t.durations) : 0;
    for (const e of t.entries) {
      const secs =
        e.duration_seconds != null
          ? e.duration_seconds
          : Math.max(0, Math.floor((new Date(e.stopped_at) - new Date(e.started_at)) / 1000));
      let isAnomaly = false;
      if (useMedian && m > 0) {
        isAnomaly = Math.abs(secs - t.median) > k * m;
      } else {
        // pochi campioni o MAD=0: tolleranza percentuale sul riferimento
        const p = deviationPct(secs, ref);
        isAnomaly = p != null && Math.abs(p) >= pctFallback;
      }
      if (isAnomaly) {
        flagged.push({
          entry: e,
          task: t,
          seconds: secs,
          reference: ref,
          pct: deviationPct(secs, ref),
        });
      }
    }
  }
  return flagged.sort((a, b) => Math.abs(b.pct || 0) - Math.abs(a.pct || 0));
}

// ============================================================
// Statistiche personali (solo sui propri dati)
// ============================================================

function entrySecs(e) {
  if (e.duration_seconds != null) return e.duration_seconds;
  if (!e.stopped_at) return 0;
  return Math.max(0, Math.floor((new Date(e.stopped_at) - new Date(e.started_at)) / 1000));
}

export function monthKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "long" });
}

// Aggrega per mese: secondi, numero voci, giorni attivi
export function byMonth(entries) {
  const map = {};
  for (const e of entries) {
    if (!e.stopped_at) continue;
    const k = monthKey(e.started_at);
    if (!map[k]) map[k] = { key: k, secs: 0, count: 0, days: new Set() };
    map[k].secs += entrySecs(e);
    map[k].count++;
    const d = new Date(e.started_at);
    map[k].days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  return Object.values(map)
    .map((m) => ({ key: m.key, secs: m.secs, count: m.count, activeDays: m.days.size }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

// Confronto "questo mese vs mese scorso" fino a oggi:
// per essere onesto confronta il mese scorso SOLO fino allo stesso giorno.
export function monthComparison(entries, now = new Date()) {
  const day = now.getDate();
  const thisStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevSameDay = new Date(now.getFullYear(), now.getMonth() - 1, day, 23, 59, 59);
  const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59); // fine mese scorso

  let cur = { secs: 0, count: 0, days: new Set() };
  let prevPartial = { secs: 0, count: 0, days: new Set() };
  let prevFull = { secs: 0, count: 0 };

  for (const e of entries) {
    if (!e.stopped_at) continue;
    const d = new Date(e.started_at);
    const s = entrySecs(e);
    if (d >= thisStart) {
      cur.secs += s; cur.count++;
      cur.days.add(d.getDate());
    } else if (d >= prevStart && d <= prevEnd) {
      prevFull.secs += s; prevFull.count++;
      if (d <= prevSameDay) {
        prevPartial.secs += s; prevPartial.count++;
        prevPartial.days.add(d.getDate());
      }
    }
  }
  return {
    current: { secs: cur.secs, count: cur.count, activeDays: cur.days.size },
    prevPartial: { secs: prevPartial.secs, count: prevPartial.count, activeDays: prevPartial.days.size },
    prevFull,
    deltaSecsPct: deviationPct(cur.secs, prevPartial.secs),
    deltaCountPct: deviationPct(cur.count, prevPartial.count),
  };
}

// Record personali su tutto lo storico caricato
export function personalRecords(entries) {
  const months = byMonth(entries);
  if (months.length === 0) return null;
  const bestHours = [...months].sort((a, b) => b.secs - a.secs)[0];
  const bestOutput = [...months].sort((a, b) => b.count - a.count)[0];
  const bestDays = [...months].sort((a, b) => b.activeDays - a.activeDays)[0];

  // giornata più lunga
  const dayMap = {};
  for (const e of entries) {
    if (!e.stopped_at) continue;
    const d = new Date(e.started_at);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dayMap[k] = (dayMap[k] || 0) + entrySecs(e);
  }
  let bestDay = null;
  for (const [k, s] of Object.entries(dayMap)) {
    if (!bestDay || s > bestDay.secs) bestDay = { key: k, secs: s };
  }

  return { bestHours, bestOutput, bestDays, bestDay, months };
}

// Velocità: per i lavori con abbastanza storico, confronta la mediana
// recente (ultime `recentDays`) con la mediana complessiva.
export function speedTrends(entries, projectById, { recentDays = 56, minSamples = 5 } = {}) {
  const stats = buildTaskStats(entries, projectById);
  const cutoff = Date.now() - recentDays * 86400000;
  const out = [];
  for (const t of stats) {
    if (t.durations.length < minSamples) continue;
    const recent = [];
    for (const e of t.entries) {
      if (new Date(e.started_at).getTime() >= cutoff) recent.push(entrySecs(e));
    }
    if (recent.length < 3) continue;
    const recentMed = median(recent);
    const allMed = t.median;
    const pct = deviationPct(recentMed, allMed);
    if (pct == null) continue;
    out.push({
      description: t.description,
      project: t.project,
      recentMedian: recentMed,
      overallMedian: allMed,
      pct, // negativo = più veloce
      samples: t.durations.length,
    });
  }
  // i miglioramenti più forti prima
  return out.sort((a, b) => a.pct - b.pct);
}
