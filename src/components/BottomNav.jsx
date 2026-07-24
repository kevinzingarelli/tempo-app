import { IconHome, IconChart, IconShield, IconStar, IconCalendar } from "../lib/icons.jsx";

export default function BottomNav({ tab, setTab, isAdmin }) {
  const items = [
    { id: "timer", label: "Home", Icon: IconHome },
    { id: "stats", label: "Per te", Icon: IconStar },
    { id: "reports", label: "Report", Icon: IconChart },
    { id: "timeoff", label: "Ferie", Icon: IconCalendar },
  ];
  if (isAdmin) items.push({ id: "admin", label: "Admin", Icon: IconShield });

  return (
    <nav className="bottom-nav">
      <div className="nav-brand">
        <img src="/icon-192.png" alt="" />
        Boschetto
      </div>
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={"nav-btn" + (tab === id ? " active" : "")}
          onClick={() => {
            // Tocco sulla scheda già attiva = torna in cima (dolcemente);
            // cambio scheda = si riparte comunque dall'alto (v38).
            if (tab === id) window.scrollTo({ top: 0, behavior: "smooth" });
            else { setTab(id); window.scrollTo({ top: 0 }); }
          }}
        >
          <Icon />
          {label}
        </button>
      ))}
    </nav>
  );
}
