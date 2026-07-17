// Grafici SVG leggeri, nessuna libreria esterna.

// Anello di progresso (es. ore fatte vs ore da contratto)
export function ProgressRing({
  value = 0,
  max = 1,
  size = 120,
  stroke = 12,
  color = "var(--brand)",
  track = "var(--ring-track)",
  centerTop,
  centerBottom,
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1.15, value / max) : 0; // consenti un po' di sforamento visivo
  const dash = Math.min(1, pct) * c;
  const over = pct > 1;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? "var(--stop)" : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray .6s ease, stroke .3s" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        {centerTop && (
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: size * 0.2,
              lineHeight: 1,
            }}
          >
            {centerTop}
          </div>
        )}
        {centerBottom && (
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 3 }}>
            {centerBottom}
          </div>
        )}
      </div>
    </div>
  );
}

// Donut a più segmenti
export function Donut({ segments = [], size = 120, stroke = 16, centerTop, centerBottom }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        {segments.map((seg, i) => {
          const frac = seg.value / total;
          const dash = frac * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              style={{ transition: "stroke-dasharray .6s ease" }}
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      {(centerTop || centerBottom) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          {centerTop && (
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: size * 0.19 }}>
              {centerTop}
            </div>
          )}
          {centerBottom && (
            <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>{centerBottom}</div>
          )}
        </div>
      )}
    </div>
  );
}

// Barre verticali per tendenze (es. ore per settimana)
export function MiniBars({ data = [], height = 120, color = "var(--brand)", formatValue }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barGap = 6;
  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: barGap,
          height,
          padding: "0 2px",
        }}
      >
        {data.map((d, i) => {
          const h = (d.value / max) * 100;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
              <div style={{ fontSize: 9.5, color: "var(--ink-faint)", marginBottom: 3, fontWeight: 600 }}>
                {d.value > 0 && formatValue ? formatValue(d.value) : ""}
              </div>
              <div
                style={{
                  width: "100%",
                  maxWidth: 34,
                  height: `${Math.max(2, h)}%`,
                  background: d.highlight ? "var(--hot-b)" : color,
                  borderRadius: "6px 6px 3px 3px",
                  transition: "height .5s ease",
                  minHeight: 3,
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: barGap, marginTop: 6, padding: "0 2px" }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "var(--ink-soft)", fontWeight: 600 }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// Barra orizzontale singola (riutilizzabile)
export function HBar({ label, value, max, color = "var(--brand)", valueLabel, onClick }) {
  const w = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="bar-row" onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      <span className="bar-name">{label}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${w}%`, background: color }} />
      </span>
      <span className="bar-val">{valueLabel}</span>
    </div>
  );
}
