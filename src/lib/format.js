// ============================================================
// Utility tempo / date
// ============================================================

// Secondi -> "HH:MM:SS" (per il timer che corre)
export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

// Secondi -> "2h 30m" oppure "45m" (per liste e report)
export function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0 && m === 0) return s > 0 ? `${s}s` : "0m";
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Secondi -> ore decimali "1,50 h" (per export/somme)
export function fmtHours(totalSeconds, decimals = 2) {
  const h = totalSeconds / 3600;
  return h.toFixed(decimals).replace(".", ",");
}

// "HH:MM" da una data
export function fmtTime(date) {
  const d = new Date(date);
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

// Etichetta giorno: Oggi / Ieri / data
export function dayLabel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return "Oggi";
  if (sameDay(d, yest)) return "Ieri";
  return d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Chiave giorno "YYYY-MM-DD" in orario locale
export function dayKey(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Inizio della settimana (lunedì) come Date
export function startOfWeek(ref = new Date()) {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const wd = (d.getDay() + 6) % 7; // lun=0
  d.setDate(d.getDate() - wd);
  return d;
}

export function startOfDay(ref = new Date()) {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfMonth(ref = new Date()) {
  const d = new Date(ref);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Durata in secondi di una voce (gestisce anche timer in corso)
export function entrySeconds(entry, now = Date.now()) {
  if (entry.stopped_at) {
    if (typeof entry.duration_seconds === "number" && entry.duration_seconds >= 0) {
      return entry.duration_seconds;
    }
    return Math.max(
      0,
      Math.floor((new Date(entry.stopped_at) - new Date(entry.started_at)) / 1000)
    );
  }
  // in corso
  return Math.max(0, Math.floor((now - new Date(entry.started_at)) / 1000));
}

// ---- Parsing input manuale durata ----
// Accetta: "2h", "2:30", "1h 30m", "90m", "1.5", "1,5", "0:45"
// Ritorna secondi (interi) oppure null se non valido.
export function parseDurationInput(raw) {
  if (!raw) return null;
  const str = String(raw).trim().toLowerCase().replace(",", ".");
  if (!str) return null;

  // formato "h:m" o "h:m:s"
  if (str.includes(":")) {
    const parts = str.split(":").map((p) => parseInt(p, 10));
    if (parts.some((n) => Number.isNaN(n))) return null;
    const [h = 0, m = 0, s = 0] = parts;
    return h * 3600 + m * 60 + s;
  }

  // formato con lettere "1h 30m" / "2h" / "45m"
  if (/[hm]/.test(str)) {
    let total = 0;
    const hMatch = str.match(/(\d+(?:\.\d+)?)\s*h/);
    const mMatch = str.match(/(\d+(?:\.\d+)?)\s*m/);
    if (hMatch) total += parseFloat(hMatch[1]) * 3600;
    if (mMatch) total += parseFloat(mMatch[1]) * 60;
    if (!hMatch && !mMatch) return null;
    return Math.round(total);
  }

  // numero puro = ore decimali (es. "1.5" -> 1h30)
  const num = parseFloat(str);
  if (Number.isNaN(num)) return null;
  return Math.round(num * 3600);
}

// "YYYY-MM-DD" + "HH:MM" -> Date (orario locale)
export function combineDateTime(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

export function toDateInput(date) {
  return dayKey(date);
}

export function toTimeInput(date) {
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}
