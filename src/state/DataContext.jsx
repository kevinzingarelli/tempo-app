import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import {
  localId,
  isLocalId,
  enqueue,
  flushQueue,
  queueCount,
  readCache,
  writeCache,
  readLocalTimer,
  writeLocalTimer,
} from "../lib/offline";

const DataCtx = createContext(null);
export const useData = () => useContext(DataCtx);

// quanti giorni di storico carichiamo per la vista personale
const HISTORY_DAYS = 70;

// Riconosce se un errore è dovuto alla mancanza di rete (da mettere in coda)
// oppure è un errore vero del database (da segnalare, non ritentare all'infinito).
function isNetworkError(e) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  // Gli errori del database PostgREST hanno un "code" (es. 42501 permesso negato).
  if (e && e.code) return false;
  const msg = (e?.message || "").toLowerCase();
  return /failed to fetch|networkerror|network error|load failed|fetch|timeout|connessione/.test(
    msg
  );
}

// Traduce gli errori tecnici del database in messaggi comprensibili.
function traduciErrore(e) {
  const code = e?.code || "";
  const msg = (e?.message || "").toLowerCase();
  if (code === "42501" || msg.includes("row-level security") || msg.includes("not authorized")) {
    return "Operazione non consentita.";
  }
  if (msg.includes("duplicate")) return "Voce già esistente.";
  return "Salvataggio non riuscito. Riprova.";
}

export function DataProvider({ children }) {
  const { user, isAdmin } = useAuth();
  const [projects, setProjects] = useState([]);
  const [entries, setEntries] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [clients, setClients] = useState([]);
  const [financeMap, setFinanceMap] = useState({}); // project_id -> billable_rate
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pending, setPending] = useState(queueCount());
  const [toasts, setToasts] = useState([]);
  const flushing = useRef(false);

  // ---------- Toast ----------
  const toast = useCallback((msg, kind = "default") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  // ---------- Caricamento ----------
  const fetchAll = useCallback(async () => {
    if (!user) return;
    const since = new Date();
    since.setDate(since.getDate() - HISTORY_DAYS);

    const [proj, ent, fav] = await Promise.all([
      supabase.from("projects").select("*").order("name"),
      supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", user.id)
        .gte("started_at", since.toISOString())
        .order("started_at", { ascending: false }),
      supabase.from("favorites").select("*").eq("user_id", user.id).order("created_at"),
    ]);

    if (proj.data) setProjects(proj.data);
    if (fav.data) setFavorites(fav.data);

    // I NOMI dei clienti servono a tutti (per cercare e vedere su cosa si
    // lavora). La RLS li rende leggibili a ogni utente attivo. I dati
    // economici (project_finance) restano riservati agli admin.
    const cliRes = await supabase.from("clients").select("*").order("name");
    if (cliRes.data) setClients(cliRes.data);

    if (isAdmin) {
      const fin = await supabase.from("project_finance").select("*");
      if (fin.data) {
        const m = {};
        fin.data.forEach((r) => (m[r.project_id] = r.billable_rate));
        setFinanceMap(m);
      }
    }

    if (ent.data) {
      // includiamo anche un eventuale timer in corso non in finestra storica
      const running = ent.data.find((e) => !e.stopped_at);
      setEntries(ent.data);
      writeLocalTimer(running || null);
      writeCache({
        projects: proj.data || [],
        entries: ent.data,
        favorites: fav.data || [],
      });
    }
  }, [user, isAdmin]);

  // primo caricamento: prima la cache (istantaneo), poi la rete
  useEffect(() => {
    if (!user) {
      setProjects([]);
      setEntries([]);
      setFavorites([]);
      setLoading(false);
      return;
    }
    const cache = readCache();
    if (cache) {
      setProjects(cache.projects || []);
      setEntries(cache.entries || []);
      setFavorites(cache.favorites || []);
      setLoading(false);
    }
    fetchAll().finally(() => setLoading(false));
  }, [user, fetchAll]);

  // ---------- Sincronizzazione coda ----------
  const executor = useCallback(async (op) => {
    if (op.type === "insert") {
      const payload = { ...op.payload };
      const wasLocal = isLocalId(payload.id);
      if (wasLocal) delete payload.id; // lascia generare l'id al DB
      const { data, error } = await supabase
        .from(op.table)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return { realId: data?.id };
    }
    if (op.type === "update") {
      const { id, ...fields } = op.payload;
      const { error } = await supabase.from(op.table).update(fields).eq("id", id);
      if (error) throw error;
      return {};
    }
    if (op.type === "delete") {
      const { error } = await supabase.from(op.table).delete().eq("id", op.payload.id);
      if (error) throw error;
      return {};
    }
    return {};
  }, []);

  const sync = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    flushing.current = true;
    try {
      const res = await flushQueue(executor);
      setPending(queueCount());
      if (res.done > 0) {
        await fetchAll(); // riallinea gli id locali con quelli reali
        toast("Dati sincronizzati", "ok");
      }
    } finally {
      flushing.current = false;
    }
  }, [executor, fetchAll, toast]);

  // online/offline
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      sync();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    if (navigator.onLine) sync();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [sync]);

  // ---------- Helper scrittura con coda ----------
  // prova diretta; se la rete fallisce, mette in coda. Lo stato locale
  // è già aggiornato in modo ottimistico da chi chiama.
  const persist = useCallback(
    async (op, optimistic) => {
      if (optimistic) optimistic();
      if (!navigator.onLine) {
        enqueue(op);
        setPending(queueCount());
        return { queued: true };
      }
      try {
        const res = await executor(op);
        if (op.type === "insert" && res.realId && op.payload?.id) {
          // riallinea l'id nello stato locale
          const realId = res.realId;
          const tmpId = op.payload.id;
          const swap = (arr) =>
            arr.map((x) => (x.id === tmpId ? { ...x, id: realId } : x));
          if (op.table === "time_entries") setEntries((a) => swap(a));
          if (op.table === "favorites") setFavorites((a) => swap(a));
          if (op.table === "projects") setProjects((a) => swap(a));
        }
        return { ok: true };
      } catch (e) {
        if (isNetworkError(e)) {
          // Offline o rete instabile: metti in coda, riproveremo.
          enqueue(op);
          setPending(queueCount());
          return { queued: true, error: e };
        }
        // Errore vero del database (es. permesso negato): NON mettere in coda.
        // Segnala e riallinea lo stato con quello reale del server.
        toast(traduciErrore(e), "error");
        fetchAll();
        return { failed: true, error: e };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [executor, toast]
  );

  // Tutti i timer attivi (senza stopped_at), dal più recente. Per la
  // maggior parte delle persone ce n'è al massimo uno; solo per gli admin
  // (Kevin, Asia) è possibile averne più di uno in parallelo.
  const runningEntries = entries.filter((e) => !e.stopped_at)
    .sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  // "Timer principale": il più recente. Tutto il codice esistente che usa
  // runningEntry (singolare) continua a funzionare senza modifiche.
  const runningEntry = runningEntries[0] || null;

  // ---------- Timer ----------
  const startTimer = useCallback(
    async ({ description = "", project_id = null, tags = [], billable = false, parallel = false }) => {
      const now = new Date();

      // ferma un eventuale timer in corso — salvo se sto avviando un
      // timer IN PARALLELO (funzione riservata agli admin, vedi UI).
      if (!parallel) {
        const current = entries.find((e) => !e.stopped_at);
        if (current) {
          await stopTimerInternal(current, now);
        }
      }

      const id = localId();
      const entry = {
        id,
        user_id: user.id,
        project_id,
        description,
        tags,
        billable,
        started_at: now.toISOString(),
        stopped_at: null,
        duration_seconds: null,
        paused_at: null,
        paused_seconds: 0,
      };
      writeLocalTimer(entry);
      setEntries((a) => [entry, ...a]);

      // Online: inserisci subito e usa l'id reale del database, così un
      // eventuale "stop" immediato colpisce la riga giusta (niente timer
      // che "riappare"). Offline: resta in coda con id locale.
      if (navigator.onLine) {
        try {
          const { id: _tmp, ...toInsert } = entry;
          const { data, error } = await supabase
            .from("time_entries")
            .insert(toInsert)
            .select()
            .single();
          if (error) throw error;
          if (data) {
            setEntries((a) => a.map((x) => (x.id === id ? { ...x, ...data } : x)));
            writeLocalTimer(data);
          }
          return;
        } catch (e) {
          if (!isNetworkError(e)) {
            toast(traduciErrore(e), "error");
            setEntries((a) => a.filter((x) => x.id !== id));
            writeLocalTimer(null);
            return;
          }
          // errore di rete: ripiega sulla coda offline
        }
      }
      enqueue({ type: "insert", table: "time_entries", payload: entry });
      setPending(queueCount());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, user, persist, toast]
  );

  async function stopTimerInternal(entry, when) {
    // Se era in pausa, il lavoro è finito al momento della pausa.
    const stoppedAt = entry.paused_at ? new Date(entry.paused_at) : when || new Date();
    const dur = Math.max(
      0,
      Math.floor(
        (stoppedAt - new Date(entry.started_at)) / 1000 - (entry.paused_seconds || 0)
      )
    );
    const fields = {
      stopped_at: stoppedAt.toISOString(),
      duration_seconds: dur,
      paused_at: null,
    };
    setEntries((a) =>
      a.map((e) => (e.id === entry.id ? { ...e, ...fields } : e))
    );
    writeLocalTimer(null);
    await persist({
      type: "update",
      table: "time_entries",
      payload: { id: entry.id, ...fields },
    });
  }

  const stopTimer = useCallback(async (entryId = null) => {
    const current = entryId
      ? entries.find((e) => e.id === entryId && !e.stopped_at)
      : entries.find((e) => !e.stopped_at);
    if (current) await stopTimerInternal(current, new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, persist]);

  // ---------- Pausa / Riprendi ----------
  const pauseTimer = useCallback(async (entryId = null) => {
    const current = entryId
      ? entries.find((e) => e.id === entryId && !e.stopped_at)
      : entries.find((e) => !e.stopped_at);
    if (!current || current.paused_at) return;
    const fields = { paused_at: new Date().toISOString() };
    const updated = { ...current, ...fields };
    writeLocalTimer(updated);
    await persist(
      { type: "update", table: "time_entries", payload: { id: current.id, ...fields } },
      () => setEntries((a) => a.map((e) => (e.id === current.id ? updated : e)))
    );
  }, [entries, persist]);

  const resumeTimer = useCallback(async (entryId = null) => {
    const current = entryId
      ? entries.find((e) => e.id === entryId && !e.stopped_at)
      : entries.find((e) => !e.stopped_at);
    if (!current || !current.paused_at) return;
    const extra = Math.max(
      0,
      Math.floor((Date.now() - new Date(current.paused_at)) / 1000)
    );
    const fields = {
      paused_at: null,
      paused_seconds: (current.paused_seconds || 0) + extra,
    };
    const updated = { ...current, ...fields };
    writeLocalTimer(updated);
    await persist(
      { type: "update", table: "time_entries", payload: { id: current.id, ...fields } },
      () => setEntries((a) => a.map((e) => (e.id === current.id ? updated : e)))
    );
  }, [entries, persist]);

  const updateRunning = useCallback(
    async (fields) => {
      const current = entries.find((e) => !e.stopped_at);
      if (!current) return;
      const updated = { ...current, ...fields };
      writeLocalTimer(updated);
      await persist(
        {
          type: "update",
          table: "time_entries",
          payload: { id: current.id, ...fields },
        },
        () => setEntries((a) => a.map((e) => (e.id === current.id ? updated : e)))
      );
    },
    [entries, persist]
  );

  // ---------- Voci ----------
  const addEntry = useCallback(
    async ({ description, project_id, tags, billable, note, started_at, stopped_at }) => {
      const dur = Math.max(
        0,
        Math.floor((new Date(stopped_at) - new Date(started_at)) / 1000)
      );
      const id = localId();
      const entry = {
        id,
        user_id: user.id,
        project_id: project_id || null,
        description: description || "",
        tags: tags || [],
        billable: !!billable,
        note: note || null,
        started_at,
        stopped_at,
        duration_seconds: dur,
      };
      await persist({ type: "insert", table: "time_entries", payload: entry }, () =>
        setEntries((a) =>
          [entry, ...a].sort(
            (x, y) => new Date(y.started_at) - new Date(x.started_at)
          )
        )
      );
    },
    [user, persist]
  );

  const updateEntry = useCallback(
    async (id, fields) => {
      // ricalcola durata se cambiano gli orari
      let patch = { ...fields };
      const target = entries.find((e) => e.id === id);
      if (target && (fields.started_at || fields.stopped_at)) {
        const st = fields.started_at || target.started_at;
        const sp = fields.stopped_at || target.stopped_at;
        if (sp) {
          patch.duration_seconds = Math.max(
            0,
            Math.floor((new Date(sp) - new Date(st)) / 1000)
          );
        }
      }
      await persist(
        { type: "update", table: "time_entries", payload: { id, ...patch } },
        () =>
          setEntries((a) =>
            a
              .map((e) => (e.id === id ? { ...e, ...patch } : e))
              .sort((x, y) => new Date(y.started_at) - new Date(x.started_at))
          )
      );
    },
    [entries, persist]
  );

  const deleteEntry = useCallback(
    async (id) => {
      const target = entries.find((e) => e.id === id);
      if (target && !target.stopped_at) writeLocalTimer(null);
      await persist({ type: "delete", table: "time_entries", payload: { id } }, () =>
        setEntries((a) => a.filter((e) => e.id !== id))
      );
    },
    [entries, persist]
  );

  const duplicateEntry = useCallback(
    async (entry) => {
      const now = new Date();
      const dur = entry.duration_seconds || 0;
      const started = new Date(now.getTime() - dur * 1000);
      await addEntry({
        description: entry.description,
        project_id: entry.project_id,
        tags: entry.tags,
        billable: entry.billable,
        started_at: started.toISOString(),
        stopped_at: now.toISOString(),
      });
      toast("Voce duplicata", "ok");
    },
    [addEntry, toast]
  );

  // ---------- Preferiti ----------
  const addFavorite = useCallback(
    async ({ description, project_id, tags }) => {
      const id = localId();
      const fav = {
        id,
        user_id: user.id,
        description: description || "",
        project_id: project_id || null,
        tags: tags || [],
      };
      await persist({ type: "insert", table: "favorites", payload: fav }, () =>
        setFavorites((a) => [...a, fav])
      );
      toast("Aggiunto ai preferiti", "ok");
    },
    [user, persist, toast]
  );

  const removeFavorite = useCallback(
    async (id) => {
      await persist({ type: "delete", table: "favorites", payload: { id } }, () =>
        setFavorites((a) => a.filter((f) => f.id !== id))
      );
    },
    [persist]
  );

  const startFromFavorite = useCallback(
    async (fav) => {
      const proj = projects.find((p) => p.id === fav.project_id);
      await startTimer({
        description: fav.description,
        project_id: fav.project_id,
        tags: fav.tags || [],
        billable: proj?.billable_default || false,
      });
      toast("Timer avviato", "ok");
    },
    [projects, startTimer, toast]
  );

  // "Continua" un lavoro passato con un tap: riusa progetto e descrizione.
  const startFromEntry = useCallback(
    async (entry) => {
      const proj = projects.find((p) => p.id === entry.project_id);
      await startTimer({
        description: entry.description || "",
        project_id: entry.project_id || null,
        tags: entry.tags || [],
        billable: entry.billable ?? proj?.billable_default ?? false,
      });
      toast("Timer avviato", "ok");
    },
    [projects, startTimer, toast]
  );

  // ---------- Progetti (admin) ----------
  // Gestione progetti/clienti/tariffe: azioni admin che richiedono connessione.
  const addProject = useCallback(
    async ({ name, color, billable_default, estimated_seconds, planned_seconds, is_overhead, billable_rate, client_id }) => {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name,
          color,
          billable_default: !!billable_default,
          estimated_seconds: estimated_seconds || null,
          planned_seconds: planned_seconds || null,
          is_overhead: !!is_overhead,
          client_id: client_id || null,
          archived: false,
        })
        .select()
        .single();
      if (error) {
        toast(traduciErrore(error), "error");
        return;
      }
      if (billable_rate != null && billable_rate !== "") {
        await supabase
          .from("project_finance")
          .upsert({ project_id: data.id, billable_rate: Number(billable_rate) });
        setFinanceMap((m) => ({ ...m, [data.id]: Number(billable_rate) }));
      }
      setProjects((a) => [...a, data].sort((x, y) => x.name.localeCompare(y.name)));
      return data;
    },
    [toast]
  );

  const updateProject = useCallback(
    async (id, { billable_rate, ...fields }) => {
      if (Object.keys(fields).length) {
        const { error } = await supabase.from("projects").update(fields).eq("id", id);
        if (error) {
          toast(traduciErrore(error), "error");
          return;
        }
        setProjects((a) => a.map((p) => (p.id === id ? { ...p, ...fields } : p)));
      }
      if (billable_rate !== undefined) {
        if (billable_rate === null || billable_rate === "") {
          await supabase.from("project_finance").delete().eq("project_id", id);
          setFinanceMap((m) => {
            const n = { ...m };
            delete n[id];
            return n;
          });
        } else {
          await supabase
            .from("project_finance")
            .upsert({ project_id: id, billable_rate: Number(billable_rate) });
          setFinanceMap((m) => ({ ...m, [id]: Number(billable_rate) }));
        }
      }
    },
    [toast]
  );

  // ---------- Clienti (admin) ----------
  const addClient = useCallback(
    async (name) => {
      const { data, error } = await supabase
        .from("clients")
        .insert({ name })
        .select()
        .single();
      if (error) {
        toast(traduciErrore(error), "error");
        return null;
      }
      setClients((a) => [...a, data].sort((x, y) => x.name.localeCompare(y.name)));
      return data;
    },
    [toast]
  );

  const updateClient = useCallback(
    async (id, name) => {
      const { error } = await supabase.from("clients").update({ name }).eq("id", id);
      if (error) {
        toast(traduciErrore(error), "error");
        return;
      }
      setClients((a) => a.map((c) => (c.id === id ? { ...c, name } : c)));
    },
    [toast]
  );

  const deleteClient = useCallback(
    async (id) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) {
        toast(traduciErrore(error), "error");
        return;
      }
      setClients((a) => a.filter((c) => c.id !== id));
    },
    [toast]
  );

  const projectById = useCallback(
    (id) => projects.find((p) => p.id === id) || null,
    [projects]
  );
  const projectRate = useCallback((id) => (id in financeMap ? financeMap[id] : null), [financeMap]);
  const clientById = useCallback((id) => clients.find((c) => c.id === id) || null, [clients]);

  // suggerimenti tag dalle voci esistenti
  const tagSuggestions = Array.from(
    new Set(entries.flatMap((e) => e.tags || []))
  ).slice(0, 30);

  // suggerimenti descrizione dallo storico personale:
  // per ogni descrizione usata, ricordo frequenza e progetto più frequente
  const descSuggestions = (() => {
    const map = {};
    for (const e of entries) {
      const d = (e.description || "").trim();
      if (!d) continue;
      const k = d.toLowerCase();
      if (!map[k]) map[k] = { text: d, count: 0, projects: {} };
      map[k].count++;
      if (e.project_id) {
        map[k].projects[e.project_id] = (map[k].projects[e.project_id] || 0) + 1;
      }
    }
    return Object.values(map)
      .map((s) => {
        let best = null, bestN = 0;
        for (const [pid, n] of Object.entries(s.projects)) {
          if (n > bestN) { best = pid; bestN = n; }
        }
        return { text: s.text, count: s.count, project_id: best };
      })
      .sort((a, b) => b.count - a.count);
  })();

  const value = {
    loading,
    online,
    pending,
    toasts,
    toast,
    projects,
    activeProjects: projects.filter((p) => !p.archived),
    entries,
    favorites,
    runningEntry,
    runningEntries,
    tagSuggestions,
    descSuggestions,
    startTimer,
    stopTimer,
    pauseTimer,
    resumeTimer,
    updateRunning,
    addEntry,
    updateEntry,
    deleteEntry,
    duplicateEntry,
    addFavorite,
    removeFavorite,
    startFromFavorite,
    startFromEntry,
    addProject,
    updateProject,
    projectById,
    projectRate,
    clients,
    clientById,
    addClient,
    updateClient,
    deleteClient,
    refresh: fetchAll,
  };

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
