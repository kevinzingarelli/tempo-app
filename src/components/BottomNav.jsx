import { IconTimer, IconChart, IconShield } from "../lib/icons.jsx";

export default function BottomNav({ tab, setTab, isAdmin }) {
  const items = [
    { id: "timer", label: "Timer", Icon: IconTimer },
    { id: "reports", label: "Report", Icon: IconChart },
  ];
  if (isAdmin) items.push({ id: "admin", label: "Admin", Icon: IconShield });

  return (
    <nav className="bottom-nav">
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
