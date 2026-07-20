import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useData } from "../state/DataContext.jsx";
import { entrySeconds, fmtDuration } from "../lib/format.js";

// Ogni 10 ore lavorate personali = un passo di crescita "grande" (stadio).
const HOURS_PER_STAGE = 10;
// Micro-crescita percepibile ogni 15 minuti.
const MICRO_STEP_SECS = 15 * 60;

const STAGES = ["Seme", "Germoglio", "Alberello", "Albero", "Albero fiorito"];

// Palette foglie per stadio (dal tenero al rigoglioso)
const LEAF = [
  ["#8fd6a6", "#6fbf8e"],
  ["#7fce97", "#57ac79"],
  ["#63c07f", "#3f9a67"],
  ["#4fae7a", "#2f7d4f"],
  ["#57b98a", "#2f7d4f"],
];

export default function GrowthTree({ userId }) {
  const { runningEntries } = useData();
  const [baseSecs, setBaseSecs] = useState(null); // totale voci concluse (dal DB)
  const [, setTick] = useState(0);
  const runningStartRef = useRef(null);

  // ids dei timer attivi, come stringa stabile per confronto nelle dipendenze
  const runningIdsKey = runningEntries.map((e) => e.id).join(",");

  // Carico il totale delle voci concluse (una volta, e a ogni stop/nuovo timer)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("time_entries")
        .select("duration_seconds")
        .eq("user_id", userId)
        .not("stopped_at", "is", null);
      if (cancelled) return;
      const total = (data || []).reduce((s, e) => s + (e.duration_seconds || 0), 0);
      setBaseSecs(total);
    })();
    return () => { cancelled = true; };
    // si ricarica quando cambiano i timer in corso (nuovo avvio o stop)
  }, [userId, runningIdsKey]);

  // Aggiornamento live: ogni 20s ricalcolo (fa avanzare la barra col timer)
  useEffect(() => {
    if (runningEntries.length === 0) return;
    const t = setInterval(() => setTick((n) => n + 1), 20000);
    return () => clearInterval(t);
  }, [runningEntries.length]);

  if (baseSecs === null) return null;

  // Secondi "live" = base + timer in corso (se attivo e non in pausa)
  const liveSecs = runningEntries.reduce((s, e) => s + entrySeconds(e), 0);
  const totalSecs = baseSecs + liveSecs;
  const totalHours = totalSecs / 3600;

  const stageIndex = Math.min(STAGES.length - 1, Math.floor(totalHours / HOURS_PER_STAGE));
  const isMax = stageIndex >= STAGES.length - 1;
  const intoStage = totalHours - stageIndex * HOURS_PER_STAGE;
  const pct = isMax ? 100 : Math.min(100, (intoStage / HOURS_PER_STAGE) * 100);
  const hoursToNext = Math.max(0, HOURS_PER_STAGE - intoStage);

  // micro-progresso: quanti "scatti" da 15 min dentro lo stadio corrente
  const microSteps = Math.floor((totalSecs % (HOURS_PER_STAGE * 3600)) / MICRO_STEP_SECS);
  const treesGrown = Math.floor(totalHours / (HOURS_PER_STAGE * (STAGES.length - 1)));

  // scala di crescita continua 0→1 sull'intero percorso di uno stadio
  const growth = isMax ? 1 : intoStage / HOURS_PER_STAGE;
  const isLive = runningEntries.some((e) => !e.paused_at);

  return (
    <div className="card growth-card">
      <div className="growth-top">
        <TreeSVG stageIndex={stageIndex} growth={growth} microSteps={microSteps} live={isLive} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
            {STAGES[stageIndex]}
            {isLive && <span className="growth-live">in crescita</span>}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            {fmtDuration(totalSecs)} in totale
            {treesGrown > 0 ? ` · ${treesGrown} ${treesGrown === 1 ? "albero completato" : "alberi completati"}` : ""}
          </div>
        </div>
      </div>

      <div className="growth-bar">
        <div className="growth-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        {isMax ? "Albero completato." : `Prossimo stadio a ${(stageIndex + 1) * HOURS_PER_STAGE}h · mancano ${hoursToNext.toFixed(1)}h`}
      </div>
    </div>
  );
}

/**
 * Albero SVG stratificato: tronco + chioma a 3 livelli sovrapposti con
 * ombreggiature per un effetto di profondità (pseudo-3D). "growth" (0→1)
 * scala altezza tronco e ampiezza chioma; "microSteps" aggiunge foglioline.
 */
function TreeSVG({ stageIndex, growth, microSteps, live }) {
  const [leafLight, leafDark] = LEAF[stageIndex];
  // dimensioni in un viewBox 100x100, ancorate in basso al centro
  const cx = 50;
  const groundY = 92;

  // crescita: dal seme (piccolo) all'albero pieno
  const minH = 10, maxH = 46;
  const trunkH = minH + (maxH - minH) * growth;
  const trunkTop = groundY - trunkH;
  const trunkW = 3 + 4 * growth;

  // raggio chioma cresce con lo stadio e con growth
  const baseCrown = 8 + stageIndex * 3;
  const crownR = baseCrown + 14 * growth;
  const showCrown = stageIndex >= 1 || growth > 0.35;

  // posizione "cima" della chioma
  const crownCy = trunkTop - crownR * 0.35;

  // foglioline extra (microSteps) come piccoli cerchi attorno alla chioma
  const leaves = [];
  const nLeaves = Math.min(10, microSteps);
  for (let i = 0; i < nLeaves; i++) {
    const ang = (i / 10) * Math.PI * 2 + i;
    const rr = crownR * 0.72;
    leaves.push({
      x: cx + Math.cos(ang) * rr,
      y: crownCy + Math.sin(ang) * rr * 0.8,
      r: 2.1,
    });
  }

  return (
    <div className={"growth-svg-wrap" + (live ? " live" : "")}>
      <svg viewBox="0 0 100 100" width="72" height="72" role="img" aria-label="Albero dei progressi">
        <defs>
          {/* Chioma: luce dall'alto-sinistra, ombra in basso-destra (volume 3D) */}
          <radialGradient id="gt-crown" cx="35%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="22%" stopColor={leafLight} />
            <stop offset="72%" stopColor={leafDark} />
            <stop offset="100%" stopColor={leafDark} stopOpacity="0.95" />
          </radialGradient>
          <radialGradient id="gt-crown-back" cx="60%" cy="60%" r="75%">
            <stop offset="0%" stopColor={leafDark} />
            <stop offset="100%" stopColor="#1f5638" />
          </radialGradient>
          {/* Tronco cilindrico: luce a sinistra, ombra a destra */}
          <linearGradient id="gt-trunk" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5f3f24" />
            <stop offset="32%" stopColor="#a06f42" />
            <stop offset="55%" stopColor="#8a5c37" />
            <stop offset="100%" stopColor="#4e3319" />
          </linearGradient>
          <radialGradient id="gt-soil" cx="50%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#d0a870" />
            <stop offset="100%" stopColor="#8a6b42" />
          </radialGradient>
          {/* Sfumatura morbida per le luci */}
          <filter id="gt-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
        </defs>

        {/* ombra proiettata a terra (dà profondità) */}
        <ellipse cx={cx + 3} cy={groundY + 3} rx={crownR * 0.9 + 4} ry="4.5" fill="#000" opacity="0.14" />

        {/* terreno */}
        <ellipse cx={cx} cy={groundY + 2} rx="26" ry="5.5" fill="url(#gt-soil)" opacity="0.7" />

        {/* seme (solo stadio 0 con poca crescita) */}
        {stageIndex === 0 && growth < 0.35 ? (
          <g>
            <ellipse cx={cx} cy={groundY - 4} rx="6" ry="7.5" fill="#a9743f" />
            <ellipse cx={cx - 1.6} cy={groundY - 6} rx="1.8" ry="2.6" fill="#d8ad78" opacity="0.7" />
            {growth > 0.12 && (
              <path d={`M${cx},${groundY - 10} q3,-6 7,-7 q-2,5 -7,7`} fill={leafDark} />
            )}
          </g>
        ) : (
          <g>
            {/* tronco con leggera curva */}
            <path
              d={`M${cx - trunkW / 2},${groundY}
                  Q${cx - trunkW / 2 - 1},${trunkTop + trunkH * 0.4} ${cx - trunkW * 0.35},${trunkTop}
                  L${cx + trunkW * 0.35},${trunkTop}
                  Q${cx + trunkW / 2 + 1},${trunkTop + trunkH * 0.4} ${cx + trunkW / 2},${groundY} Z`}
              fill="url(#gt-trunk)"
            />
            {/* riflesso di luce sul tronco (cilindricità) */}
            <path
              d={`M${cx - trunkW * 0.22},${groundY - 1}
                  L${cx - trunkW * 0.12},${trunkTop + 1}`}
              stroke="#c89058" strokeWidth={trunkW * 0.18} strokeLinecap="round" opacity="0.5"
            />
            {/* rami (dallo stadio 2) */}
            {stageIndex >= 2 && (
              <>
                <path d={`M${cx},${trunkTop + trunkH * 0.35} q-9,-3 -13,-9`} stroke="#7a5433" strokeWidth="2" fill="none" strokeLinecap="round" />
                <path d={`M${cx},${trunkTop + trunkH * 0.5} q9,-2 13,-8`} stroke="#7a5433" strokeWidth="2" fill="none" strokeLinecap="round" />
              </>
            )}

            {showCrown && (
              <g className="gt-crown-g">
                {/* sfere posteriori (profondità, più scure) */}
                <circle cx={cx + crownR * 0.42} cy={crownCy + crownR * 0.22} r={crownR * 0.68} fill="url(#gt-crown-back)" />
                <circle cx={cx - crownR * 0.5} cy={crownCy + crownR * 0.15} r={crownR * 0.6} fill="url(#gt-crown-back)" />
                {/* massa principale */}
                <circle cx={cx - crownR * 0.14} cy={crownCy + crownR * 0.05} r={crownR} fill="url(#gt-crown)" />
                {/* lobi laterali per un contorno "a grappolo" */}
                <circle cx={cx + crownR * 0.52} cy={crownCy - crownR * 0.05} r={crownR * 0.55} fill="url(#gt-crown)" />
                <circle cx={cx - crownR * 0.55} cy={crownCy - crownR * 0.02} r={crownR * 0.5} fill="url(#gt-crown)" />
                <circle cx={cx + crownR * 0.05} cy={crownCy - crownR * 0.5} r={crownR * 0.55} fill="url(#gt-crown)" />
                {/* luce superiore (highlight volumetrico) */}
                <circle cx={cx - crownR * 0.2} cy={crownCy - crownR * 0.42} r={crownR * 0.5} fill={leafLight} opacity="0.55" filter="url(#gt-soft)" />
                <ellipse cx={cx - crownR * 0.45} cy={crownCy - crownR * 0.4} rx={crownR * 0.26} ry={crownR * 0.16} fill="#ffffff" opacity="0.4" filter="url(#gt-soft)" />

                {/* fiori sullo stadio massimo */}
                {stageIndex >= 4 &&
                  [0, 1, 2, 3, 4, 5].map((i) => {
                    const a = (i / 6) * Math.PI * 2;
                    return (
                      <g key={i}>
                        <circle
                          cx={cx - crownR * 0.1 + Math.cos(a) * crownR * 0.6}
                          cy={crownCy - crownR * 0.05 + Math.sin(a) * crownR * 0.55}
                          r="2.6"
                          fill="#ffd1e3"
                        />
                        <circle
                          cx={cx - crownR * 0.1 + Math.cos(a) * crownR * 0.6}
                          cy={crownCy - crownR * 0.05 + Math.sin(a) * crownR * 0.55}
                          r="1"
                          fill="#ff9ec4"
                        />
                      </g>
                    );
                  })}

                {/* foglioline micro-crescita (ogni 15 min) */}
                {leaves.map((lf, i) => (
                  <circle key={i} cx={lf.x} cy={lf.y} r={lf.r} fill={leafLight} className="gt-leaf" style={{ animationDelay: `${i * 0.08}s` }} />
                ))}
              </g>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
