import { useData } from "../state/DataContext.jsx";
import Sheet from "./Sheet.jsx";
import { IconCheck } from "../lib/icons.jsx";

export default function ProjectPicker({ open, onClose, value, onChange }) {
  const { activeProjects } = useData();

  function pick(id) {
    onChange(id);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Scegli progetto">
      <div className="card">
        <button
          className="list-action"
          style={{ width: "100%", textAlign: "left" }}
          onClick={() => pick(null)}
        >
          <span className="muted" style={{ fontWeight: 600 }}>
            Nessun progetto
          </span>
          {!value && <IconCheck style={{ width: 18, height: 18, color: "#27264d" }} />}
        </button>
        {activeProjects.map((p) => (
          <button
            key={p.id}
            className="list-action"
            style={{ width: "100%", textAlign: "left" }}
            onClick={() => pick(p.id)}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                className="entry-dot"
                style={{ background: p.color || "#999" }}
              />
              <span style={{ fontWeight: 600 }}>{p.name}</span>
            </span>
            {value === p.id && (
              <IconCheck style={{ width: 18, height: 18, color: "#27264d" }} />
            )}
          </button>
        ))}
        {activeProjects.length === 0 && (
          <div className="empty" style={{ padding: 24 }}>
            Nessun progetto. L'amministratore può crearli nella sezione Admin.
          </div>
        )}
      </div>
    </Sheet>
  );
}
