import { useState } from "react";
import { useData } from "../state/DataContext.jsx";

export default function TagInput({ tags, onChange }) {
  const { tagSuggestions } = useData();
  const [draft, setDraft] = useState("");

  function add(tag) {
    const t = tag.trim();
    if (!t) return;
    if (tags.includes(t)) {
      setDraft("");
      return;
    }
    onChange([...tags, t]);
    setDraft("");
  }
  function remove(tag) {
    onChange(tags.filter((t) => t !== tag));
  }

  const available = tagSuggestions.filter((s) => !tags.includes(s)).slice(0, 8);

  return (
    <div>
      {tags.length > 0 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {tags.map((t) => (
            <span
              key={t}
              className="chip selected"
              onClick={() => remove(t)}
              style={{ cursor: "pointer" }}
            >
              {t} <span className="chip-x">×</span>
            </span>
          ))}
        </div>
      )}
      <input
        className="field"
        placeholder="Aggiungi tag e premi Invio"
        value={draft}
        autoCapitalize="none"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          }
        }}
      />
      {available.length > 0 && (
        <div className="chips" style={{ marginTop: 8 }}>
          {available.map((s) => (
            <span key={s} className="chip" onClick={() => add(s)} style={{ cursor: "pointer" }}>
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
