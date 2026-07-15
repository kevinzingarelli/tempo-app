// ============================================================
// Livello offline
// Obiettivo: non perdere mai le ore. Il timer in corso vive anche
// in locale (sopravvive a chiusura/refresh) e le scritture sulle
// voci vengono messe in coda se manca la rete, poi sincronizzate.
// Strategia conflitti: ultima modifica vince (come Toggl).
// ============================================================

const Q_KEY = "tempo.queue.v1";
const CACHE_KEY = "tempo.cache.v1";
const TIMER_KEY = "tempo.timer.v1";

// ---------- ID locali ----------
export function localId() {
  return "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}
export function isLocalId(id) {
  return typeof id === "string" && id.startsWith("local-");
}

// ---------- Coda scritture ----------
export function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(Q_KEY) || "[]");
  } catch {
    return [];
  }
}
function setQueue(q) {
  try {
    localStorage.setItem(Q_KEY, JSON.stringify(q));
  } catch {}
}
export function enqueue(op) {
  const q = getQueue();
  q.push({ ...op, ts: Date.now() });
  setQueue(q);
}
export function queueCount() {
  return getQueue().length;
}

// Rimpiazza un id locale con quello reale in tutte le operazioni in coda
function remapId(localIdValue, realId) {
  const q = getQueue().map((op) => {
    if (op.payload && op.payload.id === localIdValue) {
      return { ...op, payload: { ...op.payload, id: realId } };
    }
    if (op.targetLocalId === localIdValue) {
      return { ...op, targetLocalId: undefined, payload: { ...op.payload, id: realId } };
    }
    return op;
  });
  setQueue(q);
}

// Elabora la coda usando un "executor" Supabase fornito da chi chiama.
// executor(op) -> { realId? } in caso di insert. Lancia in caso di errore rete.
export async function flushQueue(executor) {
  let q = getQueue();
  if (q.length === 0) return { ok: true, done: 0 };
  let done = 0;
  while (q.length > 0) {
    const op = q[0];
    try {
      const res = await executor(op);
      if (op.type === "insert" && res && res.realId && op.payload && op.payload.id) {
        remapId(op.payload.id, res.realId);
      }
      q = getQueue();
      q.shift();
      setQueue(q);
      done++;
    } catch (e) {
      // Probabile assenza di rete: fermati e riprova più tardi.
      return { ok: false, done, error: e };
    }
    q = getQueue();
  }
  return { ok: true, done };
}

// ---------- Cache dati (apertura istantanea / offline al lancio) ----------
export function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
  } catch {
    return null;
  }
}
export function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {}
}

// ---------- Timer in corso (persistenza locale) ----------
export function readLocalTimer() {
  try {
    return JSON.parse(localStorage.getItem(TIMER_KEY) || "null");
  } catch {
    return null;
  }
}
export function writeLocalTimer(entry) {
  try {
    if (entry) localStorage.setItem(TIMER_KEY, JSON.stringify(entry));
    else localStorage.removeItem(TIMER_KEY);
  } catch {}
}

export function clearAllLocal() {
  try {
    localStorage.removeItem(Q_KEY);
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(TIMER_KEY);
  } catch {}
}
