import { useState } from "react";
import { useAuth } from "../state/AuthContext.jsx";
import AdminDashboard from "../components/admin/AdminDashboard.jsx";
import AdminReport from "../components/admin/AdminReport.jsx";
import ReportExplorer from "../components/admin/ReportExplorer.jsx";
import Profitability from "../components/admin/Profitability.jsx";
import Opportunities from "../components/admin/Opportunities.jsx";
import TaskStats from "../components/admin/TaskStats.jsx";
import ProjectManager from "../components/admin/ProjectManager.jsx";
import ClientManager from "../components/admin/ClientManager.jsx";
import UserManager from "../components/admin/UserManager.jsx";
import { IconLogout } from "../lib/icons.jsx";

const TABS = [
  { id: "dash", label: "Dashboard" },
  { id: "report", label: "Report" },
  { id: "explore", label: "Esplora" },
  { id: "profit", label: "Redditività" },
  { id: "opps", label: "Opportunità" },
  { id: "tasks", label: "Attività" },
  { id: "projects", label: "Progetti" },
  { id: "clients", label: "Clienti" },
  { id: "people", label: "Persone" },
];

export default function Admin() {
  const { signOut, profile } = useAuth();
  const [section, setSection] = useState("dash");

  return (
    <div className="screen">
      <div className="row-between" style={{ marginBottom: 16 }}>
        <div>
          <div className="screen-title">Admin</div>
          <div className="screen-sub" style={{ marginBottom: 0 }}>{profile?.name || "Amministratore"}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={signOut} aria-label="Esci">
          <IconLogout style={{ width: 16, height: 16 }} /> Esci
        </button>
      </div>

      {/* schede scorrevoli */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 18, paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            style={{
              flex: "0 0 auto",
              padding: "9px 16px",
              borderRadius: 999,
              fontWeight: 600,
              fontSize: 13.5,
              whiteSpace: "nowrap",
              background: section === t.id ? "var(--brand)" : "var(--surface)",
              color: section === t.id ? "#fff" : "var(--ink-soft)",
              border: section === t.id ? "1px solid var(--brand)" : "1px solid var(--line-strong)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {section === "dash" && <AdminDashboard />}
      {section === "report" && <AdminReport />}
      {section === "explore" && <ReportExplorer />}
      {section === "profit" && <Profitability />}
      {section === "opps" && <Opportunities />}
      {section === "tasks" && <TaskStats />}
      {section === "projects" && <ProjectManager />}
      {section === "clients" && <ClientManager />}
      {section === "people" && <UserManager />}
    </div>
  );
}
