import { useData } from "../state/DataContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { fmtDuration, fmtTime, entrySeconds } from "../lib/format.js";
import { IconPlay } from "../lib/icons.jsx";

export default function EntryRow({ entry, onEdit }) {
  const { projectById, clientById, startFromEntry } = useData();
  const { isAdmin } = useAuth();
  const project = projectById(entry.project_id);
  const client = project?.client_id ? clientById(project.client_id) : null;
  const secs = entrySeconds(entry);

  function restart(e) {
    e.stopPropagation();
    startFromEntry(entry);
  }

  // Categorizzazione incompleta (v32): ogni voce dovrebbe avere un
  // progetto, e ogni progetto un cliente. Il cliente mancante lo
  // segnaliamo solo agli admin (sono loro che possono sistemarlo).
  const missingProject = !project;
  const missingClient = isAdmin && project && !project.client_id;

  const sub = [
    project?.name && client ? `${project.name} (${client.name})` : project?.name,
    `${fmtTime(entry.started_at)}${entry.stopped_at ? "–" + fmtTime(entry.stopped_at) : ""}`,
    entry.billable ? "€" : null,
    ...(entry.tags || []).map((t) => "#" + t),
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="entry" onClick={() => onEdit(entry)} style={{ cursor: "pointer" }}>
      <span
        className="entry-dot"
        style={{ background: project?.color || "#cfcfca" }}
      />
      <div className="entry-main">
        <div className="entry-desc">
          {entry.description || <span className="muted">Senza descrizione</span>}
        </div>
        <div className="entry-sub">
          {(missingProject || missingClient) && (
            <span className="entry-flag">
              ⚠️ {missingProject ? "senza progetto" : "progetto senza cliente"}
            </span>
          )}
          {sub}
        </div>
      </div>
      <span className="entry-dur">{fmtDuration(secs)}</span>
      <button className="entry-play" onClick={restart} aria-label="Riavvia">
        <IconPlay />
      </button>
    </div>
  );
}
