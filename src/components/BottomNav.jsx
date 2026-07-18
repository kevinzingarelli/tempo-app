import { IconTimer, IconChart, IconShield, IconStar, IconCalendar } from "../lib/icons.jsx";

export default function BottomNav({ tab, setTab, isAdmin }) {
  const items = [
    { id: "timer", label: "Timer", Icon: IconTimer },
    { id: "stats", label: "Per te", Icon: IconStar },
    { id: "reports", label: "Report", Icon: IconChart },
    { id: "timeoff", label: "Ferie", Icon: IconCalendar },
  ];
  if (isAdmin) items.push({ id: "admin", label: "Admin", Icon: IconShield });

  return (
    <nav className="bottom-nav">
      <div className="nav-brand">
        <img src="/icon-192.png" alt="" />
        Kesia Time
      </div>
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={"nav-btn" + (tab === id ? " active" : "")}
          onClick={() => setTab(id)}
        >
          <Icon />
          {label}
        </button>
      ))}
    </nav>
  );
}
