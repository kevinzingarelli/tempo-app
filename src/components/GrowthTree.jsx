import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useData } from "../state/DataContext.jsx";
import { entrySeconds, fmtDuration } from "../lib/format.js";

// ============================================================
// v33 — Il boschetto diventa una scena dipinta e VIVA:
// · il sole nella scena segue quello vero (alba/tramonto reali)
// · il meteo è quello vero della città (Open-Meteo, gratis): nuvole,
//   pioggia, neve d'inverno
// · fiori di stagione: girasoli d'estate (seguono il sole!), zucche in
//   autunno, bucaneve d'inverno, tulipani in primavera
// · ogni albero completato è unico: specie e frutto propri (ciliegie,
//   arance, mele, limoni, susine, pesche), forma e posizione sue
// · uccellini di passaggio col sereno, stelle e luna di notte
// La LOGICA è identica a prima: un albero ogni TREE_HOURS ore.
// ============================================================
const TREE_HOURS = 40;
const HOURS_PER_STAGE = 5;

// Città di riferimento per meteo e orari del sole (uguale per tutti).
const PLACE = { name: "Vasto", lat: 42.1116, lon: 14.708 };

const STAGES = [
  "Seme", "Germoglio", "Piantina", "Alberello", "Giovane albero",
  "Albero", "Albero rigoglioso", "Albero maturo", "Albero fiorito",
];

// Specie: nome + frutto (colore/forma). L'albero n. X è SEMPRE la specie
// X%6, quindi ognuno mantiene identità stabile nel tempo.
const SPECIES = [
  { name: "ciliegio", fruit: "cherry" },
  { name: "arancio", fruit: "orange" },
  { name: "melo", fruit: "apple" },
  { name: "limone", fruit: "lemon" },
  { name: "susino", fruit: "plum" },
  { name: "pesco", fruit: "peach" },
];

function fmtRemain(hours) {
  const totalMin = Math.round(hours * 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ---------- pseudo-casuale deterministica (stessa scena a ogni render) ----------
function R(seed) {
  let s = (seed * 7919) % 2147483647 || 7;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
// accetta sia "#rrggbb" sia "rgb(r,g,b)" (mix può ricevere colori già miscelati)
function hx(c) {
  if (c[0] === "#") return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const m = c.match(/\d+/g) || [0, 0, 0];
  return [+m[0], +m[1], +m[2]];
}
function mix(a, b, t) {
  const A = hx(a), B = hx(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`;
}

// ---------- meteo vero + orari del sole (Open-Meteo, cache 30 min) ----------
const METEO_KEY = "boschetto_meteo_v1";
function wxKindFromCode(code) {
  if (code >= 71 && code <= 86 && code !== 80 && code !== 81 && code !== 82) return "neve";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "pioggia";
  if (code >= 2) return "nuvoloso";
  return "sereno";
}
function useMeteo() {
  const [meteo, setMeteo] = useState(() => {
    try { return JSON.parse(localStorage.getItem(METEO_KEY) || "null"); } catch { return null; }
  });
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (meteo && Date.now() - meteo.ts < 30 * 60 * 1000) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${PLACE.lat}&longitude=${PLACE.lon}&current=weather_code&daily=sunrise,sunset&timezone=auto&forecast_days=1`;
        const res = await fetch(url);
        const j = await res.json();
        const parseH = (iso) => { const d = new Date(iso); return d.getHours() + d.getMinutes() / 60; };
        const next = {
          ts: Date.now(),
          kind: wxKindFromCode(j?.current?.weather_code ?? 0),
          sunrise: j?.daily?.sunrise?.[0] ? parseH(j.daily.sunrise[0]) : 6.1,
          sunset: j?.daily?.sunset?.[0] ? parseH(j.daily.sunset[0]) : 20.7,
        };
        if (!cancelled) {
          setMeteo(next);
          try { localStorage.setItem(METEO_KEY, JSON.stringify(next)); } catch { /* pieno */ }
        }
      } catch { /* offline o API giù: si usa l'ultimo valore noto */ }
    }
    load();
    const t = setInterval(load, 31 * 60 * 1000);
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return meteo || { kind: "sereno", sunrise: 6.1, sunset: 20.7 };
}

// ---------- cielo: palette che segue l'ora vera ----------
function skyAt(h, sr, ss) {
  const NIGHT = ["#141c38", "#232c50", "#31406a"];
  const KEYS = [
    [sr - 1.1, "#20304f", "#4b537a", "#8a6a7a"],
    [sr + 0.4, "#5a6ea0", "#e8a06a", "#ffd9a3"],
    [sr + 3, "#6fb3e0", "#a8d5ee", "#e6f2e4"],
    [(sr + ss) / 2, "#57a6dc", "#a5d3ef", "#e9f4e6"],
    [ss - 2, "#6b9fd4", "#c9d8e8", "#f2e6cf"],
    [ss + 0.1, "#54568f", "#e88a5a", "#ffc27a"],
    [ss + 1.1, "#232c50", "#5a5380", "#a86353"],
  ];
  if (h <= KEYS[0][0] || h >= KEYS[KEYS.length - 1][0] + 0.8) return NIGHT;
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (h >= KEYS[i][0] && h <= KEYS[i + 1][0]) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const t = (h - a[0]) / ((b[0] - a[0]) || 1);
  return [mix(a[1], b[1], t), mix(a[2], b[2], t), mix(a[3], b[3], t)];
}

// ---------- pezzi della scena ----------
function Fruit({ kind, x, y }) {
  if (kind === "cherry") return (<g><circle cx={x} cy={y} r="2.1" fill="#c8283c" /><circle cx={x + 3.2} cy={y + 1.4} r="2.1" fill="#a81e30" /></g>);
  if (kind === "orange") return (<g><circle cx={x} cy={y} r="3" fill="#f08c1e" /><circle cx={x - 1} cy={y - 1} r="0.9" fill="#ffc46a" /></g>);
  if (kind === "apple") return (<g><circle cx={x} cy={y} r="2.7" fill="#d43f31" /><circle cx={x - 0.9} cy={y - 0.9} r="0.8" fill="#ff9d8a" /></g>);
  if (kind === "lemon") return <ellipse cx={x} cy={y} rx="2" ry="2.9" fill="#f2d431" />;
  if (kind === "plum") return (<g><ellipse cx={x} cy={y} rx="2.3" ry="2.8" fill="#7d4a9e" /><circle cx={x - 0.8} cy={y - 1} r="0.7" fill="#b48ad0" /></g>);
  return (<g><circle cx={x} cy={y} r="2.8" fill="#f4977a" /><circle cx={x - 0.9} cy={y - 0.9} r="0.9" fill="#ffc9b4" /></g>);
}

// Chioma "a pennellate": tre strati di cerchi (ombra, mezzo, luce)
function Canopy({ cx, cy, w, h, seed, tint }) {
  const r = R(seed);
  const dark = mix("#1d5233", "#254a2e", r());
  const lite = mix("#63b07b", "#7cc48f", r());
  const dots = [];
  // chioma compatta: i cerchi restano attorno al centro, senza "colare"
  // sul tronco (prima l'albero sembrava un cespuglio)
  for (let i = 0; i < 7; i++) dots.push({ x: cx + (r() - 0.5) * w, y: cy + h * 0.16 + (r() - 0.5) * h * 0.32, rr: w * 0.22 + r() * w * 0.09, f: dark });
  for (let i = 0; i < 7; i++) dots.push({ x: cx + (r() - 0.5) * w * 0.9, y: cy + (r() - 0.5) * h * 0.42, rr: w * 0.2 + r() * w * 0.08, f: tint });
  for (let i = 0; i < 5; i++) dots.push({ x: cx - w * 0.12 + (r() - 0.5) * w * 0.55, y: cy - h * 0.24 + (r() - 0.5) * h * 0.26, rr: w * 0.14 + r() * w * 0.06, f: lite, o: 0.9 });
  return (<g>{dots.map((d, i) => <circle key={i} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={d.rr.toFixed(1)} fill={d.f} opacity={d.o} />)}</g>);
}

// Un albero da frutto completo. growth 0→1 per quello in crescita.
function FruitTree({ x, baseY, h, seed, species, growth = 1, showFruit = true, flowers = false }) {
  const r = R(seed);
  const gh = h * (0.3 + 0.7 * growth);
  const w = gh * 0.85;
  // chioma in alto (centro al 76% dell'altezza): il tronco resta visibile
  const cy = baseY - gh * 0.76;
  const tint = ["#2f7d4f", "#37905c", "#2e7a52", "#3f9560"][seed % 4];
  const rf = R(seed + 5);
  const fruits = [];
  if (showFruit) {
    for (let i = 0; i < 6; i++) fruits.push({ x: x + (rf() - 0.5) * w * 0.75, y: cy + (rf() - 0.5) * gh * 0.34 });
  }
  const rp = R(seed + 11);
  const petals = [];
  if (flowers) {
    for (let i = 0; i < 5; i++) petals.push({ x: x + (rp() - 0.5) * w * 0.9, y: cy + (rp() - 0.5) * gh * 0.4 });
  }
  const tw = gh * 0.055; // mezza larghezza del tronco alla base
  return (
    <g className="bsc-sway" style={{ animationDuration: `${(4.6 + r() * 2.4).toFixed(1)}s`, animationDelay: `${(r() * 2.5).toFixed(1)}s` }}>
      {/* ombra a terra: "pianta" l'albero nel prato */}
      <ellipse cx={x + gh * 0.06} cy={baseY + 1.5} rx={w * 0.5} ry={gh * 0.045 + 1.5} fill="#12301e" opacity="0.18" />
      <path
        d={`M${x - tw},${baseY} C${x - tw * 1.3},${baseY - gh * 0.34} ${x - tw * 0.5},${baseY - gh * 0.46} ${x - tw * 0.3},${cy + gh * 0.2}
            L${x + tw * 0.3},${cy + gh * 0.2} C${x + tw * 0.6},${baseY - gh * 0.48} ${x + tw * 1.5},${baseY - gh * 0.3} ${x + tw},${baseY} Z`}
        fill="url(#bsc-trunk)"
      />
      {gh > 26 && (
        <>
          <path d={`M${x},${baseY - gh * 0.46} q${-gh * 0.12},${-gh * 0.1} ${-gh * 0.2},${-gh * 0.14}`} stroke="#5d3f26" strokeWidth="2.2" fill="none" />
          <path d={`M${x},${baseY - gh * 0.4} q${gh * 0.12},${-gh * 0.12} ${gh * 0.19},${-gh * 0.15}`} stroke="#5d3f26" strokeWidth="2" fill="none" />
        </>
      )}
      <Canopy cx={x} cy={cy} w={w} h={gh * 0.52} seed={seed} tint={tint} />
      {fruits.map((f, i) => <Fruit key={i} kind={species.fruit} x={+f.x.toFixed(1)} y={+f.y.toFixed(1)} />)}
      {petals.map((p, i) => <circle key={"p" + i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="2.2" fill="#ffd1e3" />)}
    </g>
  );
}

// Fiori di stagione in primo piano
function SeasonFlowers({ month, sunX, sunY, night }) {
  const positions = [];
  for (let i = 0; i < 6; i++) positions.push({ x: 56 + i * 26 + (i % 2) * 6, h: 32 + (i % 3) * 7 });
  for (let i = 0; i < 4; i++) positions.push({ x: 596 + i * 21, h: 28 + (i % 2) * 8 });

  // estate: girasoli che SEGUONO il sole
  if (month >= 5 && month <= 7) {
    return positions.map((p, i) => {
      const hy = 258 - p.h;
      let ang = -26;
      if (!night) {
        const dx = sunX - p.x, dy = sunY - hy;
        ang = Math.max(-38, Math.min(38, Math.atan2(dx, -dy) * 57.3 * 0.55));
      }
      return (
        <g key={i}>
          <path d={`M${p.x},258 C${p.x - 2},${258 - p.h * 0.4} ${p.x + 2},${258 - p.h * 0.6} ${p.x},${hy + 4}`} stroke="#3c7a3f" strokeWidth="2.6" fill="none" />
          <path d={`M${p.x},${258 - p.h * 0.45} q-8,-2 -11,-9 q9,0 11,9`} fill="#4b8a4a" />
          <path d={`M${p.x},${258 - p.h * 0.6} q8,-2 11,-8 q-9,-1 -11,8`} fill="#4b8a4a" />
          <g className="bsc-sfh" style={{ transformOrigin: `${p.x}px ${hy + 4}px`, transform: `rotate(${ang.toFixed(0)}deg)` }}>
            {Array.from({ length: 12 }).map((_, k) => (
              <ellipse key={k} cx={p.x} cy={hy - 6} rx="3.4" ry="8.5" fill={night ? "#c9971c" : "#f4b81e"} transform={`rotate(${k * 30} ${p.x} ${hy + 2})`} />
            ))}
            <circle cx={p.x} cy={hy + 2} r="5.6" fill="#5d3a14" />
            <circle cx={p.x} cy={hy + 2} r="3.4" fill="#7a5220" />
          </g>
        </g>
      );
    });
  }
  // autunno: zucche
  if (month >= 8 && month <= 10) {
    return positions.slice(0, 7).map((p, i) => (
      <g key={i}>
        <ellipse cx={p.x} cy={252} rx={9 + (i % 3) * 2} ry={7 + (i % 2)} fill={i % 2 ? "#d97a1e" : "#c96a16"} />
        <ellipse cx={p.x - 4} cy={252} rx="3.4" ry={6.4 + (i % 2)} fill="#e8933c" opacity="0.7" />
        <path d={`M${p.x},${244 - (i % 2)} q1,-4 4,-5`} stroke="#4b6a2e" strokeWidth="2.4" fill="none" />
      </g>
    ));
  }
  // inverno: bucaneve
  if (month === 11 || month <= 1) {
    return positions.map((p, i) => (
      <g key={i}>
        <path d={`M${p.x},258 q-1,-8 0,-14`} stroke="#5d8a55" strokeWidth="1.6" fill="none" />
        <ellipse cx={p.x - 1} cy={244 - (i % 3)} rx="2.6" ry="4" fill="#f4f6f0" transform={`rotate(-24 ${p.x} 246)`} />
      </g>
    ));
  }
  // primavera: tulipani
  return positions.map((p, i) => (
    <g key={i}>
      <path d={`M${p.x},258 q-1,-9 0,-16`} stroke="#3c7a3f" strokeWidth="2" fill="none" />
      <path d={`M${p.x - 4},${242 - (i % 3) * 2} q4,-7 8,0 q-1,6 -4,6 q-3,0 -4,-6`} fill={["#d84a5f", "#e8a12c", "#b455c8"][i % 3]} />
    </g>
  ));
}

// ---------- LA SCENA ----------
// (esportata anche da sola: usata dalla pagina di anteprima locale dev-scene.html)
export function Scene({ hourNow, wx, month, growth, treesGrown, currentSpecies, stageIndex, bloomCount = 0 }) {
  const { kind, sunrise: sr, sunset: ss } = wx;
  const gray = kind === "pioggia" || kind === "neve" ? 0.5 : kind === "nuvoloso" ? 0.22 : 0;
  let [top, midc, bot] = skyAt(hourNow, sr, ss);
  if (gray) { top = mix2(top, "#8a93a0", gray); midc = mix2(midc, "#98a1ac", gray); bot = mix2(bot, "#a8b0b8", gray); }

  const t = (hourNow - sr) / (ss - sr);
  const day = t >= 0 && t <= 1;
  const tc = Math.max(0, Math.min(1, t));
  const sunX = 50 + 580 * tc;
  const sunY = 200 - 162 * Math.sin(Math.PI * tc);
  const warm = day ? Math.sin(Math.PI * t) : 0;

  // stelle (fisse, seedate)
  const stars = [];
  if (!day) { const r = R(42); for (let i = 0; i < 30; i++) stars.push({ x: r() * 680, y: r() * 110, rr: 0.6 + r() * 0.9, o: 0.25 + r() * 0.55 }); }

  // nuvole per meteo
  const nClouds = kind === "sereno" ? 1 : kind === "nuvoloso" ? 4 : 3;
  const cloudFill = kind === "pioggia" || kind === "neve" ? "#77808c" : kind === "nuvoloso" ? "#e6ecf0" : "#ffffff";
  const clouds = [];
  for (let i = 0; i < nClouds; i++) {
    const r = R(i * 17 + 3);
    clouds.push({ y: 34 + r() * 52, sc: 0.7 + r() * 0.8, dur: 48 + r() * 40, delay: r() });
  }

  // pioggia / neve (seedate)
  const drops = [];
  if (kind === "pioggia") { const r = R(8); for (let i = 0; i < 40; i++) drops.push({ x: r() * 680, y: r() * 240, d: r() * 0.7 }); }
  const flakes = [];
  if (kind === "neve") { const r = R(9); for (let i = 0; i < 34; i++) flakes.push({ x: r() * 680, y: r() * 240, rr: 1.4 + r() * 1.6, d: r() * 4 }); }

  // I fiori dei task completati (v34): ogni task chiuso sboccia nel prato.
  // Fino a 40 fiori singoli; oltre, ogni 10 task in più il prato si
  // infittisce con una "macchia fiorita" — così anche a quota 100+ la
  // scena resta leggibile e sempre più rigogliosa, mai caotica.
  const BLOOM_COLORS = ["#e86a8a", "#f2b81e", "#b455c8", "#5aa7dd", "#f08c1e"];
  const blooms = [];
  for (let i = 0; i < Math.min(bloomCount, 40); i++) {
    const r = R(i * 37 + 11);
    let bx = 20 + r() * 640;
    if (bx > 290 && bx < 420) bx = bx < 355 ? bx - 150 : bx + 140; // il centro è dell'albero protagonista
    blooms.push({ x: bx, y: 231 + r() * 19, c: BLOOM_COLORS[i % BLOOM_COLORS.length], s: 0.75 + r() * 0.5 });
  }
  const patches = [];
  const nPatches = Math.min(8, Math.floor(Math.max(0, bloomCount - 40) / 10));
  for (let p = 0; p < nPatches; p++) {
    const r = R(p * 53 + 7);
    let px = 40 + r() * 600;
    if (px > 290 && px < 420) px = px < 355 ? px - 150 : px + 140;
    const dots = [];
    for (let k = 0; k < 9; k++) {
      dots.push({ dx: (r() - 0.5) * 30, dy: (r() - 0.5) * 8, c: BLOOM_COLORS[Math.floor(r() * 5)] });
    }
    patches.push({ x: px, y: 236 + r() * 12, dots });
  }

  // il bosco: posizioni fisse, alberi unici per seed/specie
  const slots = [
    [118, 196, 60], [238, 188, 50], [558, 192, 66], [452, 186, 44],
    [66, 190, 46], [630, 186, 52], [306, 184, 42], [176, 186, 40],
    [512, 184, 38], [386, 182, 36], [90, 172, 32], [598, 170, 34],
  ];
  const shown = Math.min(treesGrown, slots.length);

  return (
    <svg viewBox="0 0 680 260" width="100%" role="img" aria-label={`Il tuo boschetto: ${treesGrown} alberi completati, ora sta crescendo un ${currentSpecies.name}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id="bsc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={top} /><stop offset="55%" stopColor={midc} /><stop offset="100%" stopColor={bot} />
        </linearGradient>
        <radialGradient id="bsc-sun">
          <stop offset="0%" stopColor={mix("#ff9d4d", "#fff3c4", warm)} />
          <stop offset="45%" stopColor={mix("#ff9d4d", "#ffe9a0", warm)} stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ffdd88" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bsc-trunk" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4e3319" /><stop offset="45%" stopColor="#8a5f38" /><stop offset="100%" stopColor="#3c2812" />
        </linearGradient>
        <linearGradient id="bsc-h1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={mix2("#9dbf92", "#b8c9c2", gray + (1 - warm) * 0.3)} /><stop offset="100%" stopColor={mix2("#7ba377", "#9aa9a0", gray)} />
        </linearGradient>
        <linearGradient id="bsc-h2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={mix2("#6f9e66", "#8a9c8c", gray)} /><stop offset="100%" stopColor={mix2("#4f7f4f", "#6a8070", gray)} />
        </linearGradient>
        <linearGradient id="bsc-h3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={mix2("#3f7a46", "#5c7562", gray)} /><stop offset="100%" stopColor={mix2("#2c5c36", "#465c4c", gray)} />
        </linearGradient>
      </defs>

      <rect width="680" height="260" fill="url(#bsc-sky)" />
      {stars.map((s, i) => <circle key={i} cx={s.x.toFixed(0)} cy={s.y.toFixed(0)} r={s.rr.toFixed(1)} fill="#e9e4d0" opacity={s.o.toFixed(2)} />)}
      {!day && (<g><circle cx="586" cy="52" r="15" fill="#efe9d6" /><circle cx="581" cy="48" r="14" fill={top} /></g>)}
      {day && kind !== "pioggia" && kind !== "neve" && (
        <g>
          <circle cx={sunX.toFixed(0)} cy={sunY.toFixed(0)} r="34" fill="url(#bsc-sun)" />
          <circle cx={sunX.toFixed(0)} cy={sunY.toFixed(0)} r={(11 + 5 * (1 - warm)).toFixed(0)} fill={mix("#ffb35c", "#fff6d8", warm)} />
        </g>
      )}

      {clouds.map((c, i) => (
        <g key={i} className="bsc-drift" style={{ animationDuration: `${c.dur.toFixed(0)}s`, animationDelay: `-${(c.delay * c.dur).toFixed(0)}s` }} opacity={kind === "sereno" ? 0.7 : 0.95}>
          <g transform={`translate(0,${c.y.toFixed(0)}) scale(${c.sc.toFixed(2)})`}>
            <ellipse cx="0" cy="0" rx="34" ry="12" fill={cloudFill} />
            <ellipse cx="24" cy="-7" rx="22" ry="10" fill={cloudFill} />
            <ellipse cx="-26" cy="-4" rx="20" ry="9" fill={cloudFill} />
          </g>
        </g>
      ))}

      <path d="M0,158 Q170,124 340,146 T680,134 V260 H0 Z" fill="url(#bsc-h1)" />
      <path d="M0,190 Q210,158 420,180 T680,172 V260 H0 Z" fill="url(#bsc-h2)" />

      {/* Gli alberi completati: ognuno con la SUA specie e forma */}
      {slots.slice(0, shown).map(([x, y, h], i) => (
        <FruitTree key={i} x={x} baseY={y} h={h} seed={i * 13 + 3} species={SPECIES[i % SPECIES.length]} />
      ))}

      <path d="M0,224 Q220,198 460,216 T680,208 V260 H0 Z" fill="url(#bsc-h3)" />

      {/* Il prato dei task completati: un fiore per ogni task chiuso */}
      {patches.map((p, i) => (
        <g key={"pt" + i} transform={`translate(${p.x.toFixed(0)},${p.y.toFixed(0)})`}>
          {p.dots.map((d, k) => (
            <circle key={k} cx={d.dx.toFixed(1)} cy={d.dy.toFixed(1)} r="1.7" fill={d.c} opacity="0.9" />
          ))}
        </g>
      ))}
      {blooms.map((b, i) => (
        <g key={"bl" + i} transform={`translate(${b.x.toFixed(0)},${b.y.toFixed(0)}) scale(${b.s.toFixed(2)})`}>
          <path d="M0,0 v-5" stroke="#3c7a3f" strokeWidth="1" />
          <circle cx="-1.8" cy="-6" r="1.5" fill={b.c} />
          <circle cx="1.8" cy="-6" r="1.5" fill={b.c} />
          <circle cx="0" cy="-7.8" r="1.5" fill={b.c} />
          <circle cx="0" cy="-4.2" r="1.5" fill={b.c} />
          <circle cx="0" cy="-6" r="1.1" fill="#fff2c0" />
        </g>
      ))}

      {/* L'albero in crescita, protagonista in primo piano */}
      {growth < 0.05 ? (
        <g>
          <ellipse cx="352" cy="253" rx="8" ry="4.5" fill="#6a4c28" />
          <ellipse cx="352" cy="248" rx="4.5" ry="5.5" fill="#a9743f" />
          {growth > 0.02 && <path d="M352,242 q4,-8 9,-9 q-3,7 -9,9" fill="#57ac79" />}
        </g>
      ) : (
        <FruitTree
          x={352} baseY={256} h={92} seed={treesGrown * 13 + 7}
          species={currentSpecies} growth={growth}
          showFruit={stageIndex >= 7} flowers={stageIndex >= 8}
        />
      )}

      <SeasonFlowers month={month} sunX={sunX} sunY={sunY} night={!day} />

      {day && kind === "sereno" && (
        <g className="bsc-fly" stroke={mix("#3a3a3a", "#5a4a3a", warm)} strokeWidth="1.6" fill="none">
          <path d="M0,60 Q3,56 6,60 Q9,56 12,60" /><path d="M22,52 Q25,48 28,52 Q31,48 34,52" /><path d="M12,72 Q15,68 18,72 Q21,68 24,72" />
        </g>
      )}
      {/* velo notturno: di notte anche colline e alberi si scuriscono */}
      {!day && <rect width="680" height="260" fill="#0c1428" opacity="0.28" style={{ pointerEvents: "none" }} />}
      {drops.map((d, i) => (
        <line key={i} className="bsc-rain" style={{ animationDelay: `-${d.d.toFixed(2)}s` }} x1={d.x.toFixed(0)} y1={d.y.toFixed(0)} x2={(d.x - 3).toFixed(0)} y2={(d.y + 11).toFixed(0)} stroke="#aebfce" strokeWidth="1.3" opacity="0.6" />
      ))}
      {flakes.map((f, i) => (
        <circle key={i} className="bsc-snow" style={{ animationDelay: `-${f.d.toFixed(1)}s` }} cx={f.x.toFixed(0)} cy={f.y.toFixed(0)} r={f.rr.toFixed(1)} fill="#f4f6f8" opacity="0.85" />
      ))}
    </svg>
  );
}
// scorciatoia per non ripetere mix con guard
function mix2(a, b, t) { return t > 0 ? mix(a, b, t) : a; }

export default function GrowthTree({ userId, bloomCount = 0 }) {
  const { runningEntries } = useData();
  const [baseSecs, setBaseSecs] = useState(null);
  const [, setTick] = useState(0);
  const wx = useMeteo();

  const runningIdsKey = runningEntries.map((e) => e.id).join(",");

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
  }, [userId, runningIdsKey]);

  // il sole si muove e la luce cambia: ricalcolo ogni minuto
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  if (baseSecs === null) return null;

  const liveSecs = runningEntries.reduce((s, e) => s + entrySeconds(e), 0);
  const totalSecs = baseSecs + liveSecs;
  const totalHours = totalSecs / 3600;

  const treesGrown = Math.floor(totalHours / TREE_HOURS);
  const treeHours = totalHours - treesGrown * TREE_HOURS;
  const stageIndex = Math.min(STAGES.length - 1, Math.floor(treeHours / HOURS_PER_STAGE));
  const intoStage = treeHours - stageIndex * HOURS_PER_STAGE;
  const pct = Math.min(100, (treeHours / TREE_HOURS) * 100);
  const hoursToNext = stageIndex >= STAGES.length - 1 ? TREE_HOURS - treeHours : HOURS_PER_STAGE - intoStage;
  const nextLabel = stageIndex >= STAGES.length - 1 ? `Albero completo a ${TREE_HOURS}h` : `Prossimo stadio a ${(stageIndex + 1) * HOURS_PER_STAGE}h`;

  const growth = Math.min(1, treeHours / TREE_HOURS);
  const isLive = runningEntries.some((e) => !e.paused_at);
  const currentSpecies = SPECIES[treesGrown % SPECIES.length];

  const now = new Date();
  const hourNow = now.getHours() + now.getMinutes() / 60;
  const month = now.getMonth();
  const WX_LABEL = { sereno: "sereno", nuvoloso: "nuvoloso", pioggia: "pioggia", neve: "neve" };

  return (
    <div className="card growth-card" style={{ overflow: "hidden" }}>
      <div style={{ margin: "-16px -16px 12px", lineHeight: 0 }}>
        <Scene
          hourNow={hourNow} wx={wx} month={month} growth={growth}
          treesGrown={treesGrown} currentSpecies={currentSpecies} stageIndex={stageIndex}
          bloomCount={bloomCount}
        />
      </div>

      <div className="row-between" style={{ alignItems: "baseline", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {STAGES[stageIndex]} · {currentSpecies.name}
          </span>
          {isLive && <span className="growth-live">in crescita</span>}
        </div>
        <span className="muted" style={{ fontSize: 11.5, flexShrink: 0 }}>
          {PLACE.name} · {WX_LABEL[wx.kind] || ""}
        </span>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
        {fmtDuration(totalSecs)} in totale
        {treesGrown > 0 ? ` · ${treesGrown} ${treesGrown === 1 ? "albero nel boschetto" : "alberi nel boschetto"}` : ""}
      </div>

      <div className="growth-bar" style={{ marginTop: 10 }}>
        <div className="growth-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        {nextLabel} · mancano {fmtRemain(hoursToNext)}
      </div>
    </div>
  );
}
