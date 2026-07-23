// Segnaposto animati mostrati durante i caricamenti (v31): al posto della
// rotellina, la sagoma della schermata che sta arrivando. L'attesa sembra
// più breve e la pagina non "salta" quando compaiono i dati veri.
export default function Skeleton({ rows = 3, height = 64, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14, ...style }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skel" style={{ height }} />
      ))}
    </div>
  );
}
