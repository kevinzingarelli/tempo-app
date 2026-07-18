import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { fmtDuration } from "../lib/format.js";

// Ogni 10 ore lavorate personali = un passo di crescita.
const HOURS_PER_STAGE = 10;
const STAGES = [
  { emoji: "🌱", label: "Seme" },
  { emoji: "🌿", label: "Germoglio" },
  { emoji: "🌳", label: "Alberello" },
  { emoji: "🌳", label: "Albero" },
  { emoji: "🌸", label: "Albero fiorito" },
];

export default function GrowthTree({ userId }) {
  const [totalSecs, setTotalSecs] = useState(null);

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
      setTotalSecs(total);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (totalSecs === null) return null;

  const totalHours = totalSecs / 3600;
  const stageIndex = Math.min(STAGES.length - 1, Math.floor(totalHours / HOURS_PER_STAGE));
  const stage = STAGES[stageIndex];
  const intoStage = totalHours - stageIndex * HOURS_PER_STAGE;
  const pct = stageIndex >= STAGES.length - 1 ? 100 : Math.min(100, (intoStage / HOURS_PER_STAGE) * 100);
  const hoursToNext = Math.max(0, HOURS_PER_STAGE - intoStage);
  const isMax = stageIndex >= STAGES.length - 1;
  const treesGrown = Math.floor(totalHours / (HOURS_PER_STAGE * (STAGES.length - 1)));

  return (
    <div className="card growth-card">
      <div className="growth-top">
        <div className="growth-emoji" aria-hidden>{stage.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{stage.label}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            {fmtDuration(totalSecs)} lavorate in totale
            {treesGrown > 0 ? ` · ${treesGrown} ${treesGrown === 1 ? "albero completato" : "alberi completati"}` : ""}
          </div>
        </div>
      </div>
      <div className="growth-bar">
        <div className="growth-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        {isMax
          ? "Albero completato."
          : `Prossimo stadio a ${(stageIndex + 1) * HOURS_PER_STAGE}h`}
      </div>
    </div>
  );
}
