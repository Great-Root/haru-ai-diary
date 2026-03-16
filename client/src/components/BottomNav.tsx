import { Home, BookOpen, Settings } from "lucide-react";

export type ViewType = "home" | "chat" | "diary" | "settings";

interface Props {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  isInChat?: boolean;
}

export function BottomNav({ currentView, onNavigate, isInChat }: Props) {
  const items: { view: ViewType; icon: typeof Home; label: string }[] = [
    { view: "home", icon: Home, label: "Home" },
    { view: "diary", icon: BookOpen, label: "Diary" },
    { view: "settings", icon: Settings, label: "Settings" },
  ];

  return (
    <nav className="flex items-center justify-around border-t border-[var(--haru-border)] bg-[var(--haru-surface)]/90 backdrop-blur-sm px-2 py-2 safe-bottom">
      {items.map(({ view, icon: Icon, label }) => {
        const active = currentView === view || (view === "home" && currentView === "chat");
        return (
          <button
            key={view}
            onClick={() => onNavigate(view)}
            className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-colors ${
              active
                ? "text-[var(--haru-green)]"
                : "text-[var(--haru-text-secondary)] hover:text-[var(--haru-text)]"
            }`}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {view === "home" && isInChat && !active && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--haru-green)] animate-pulse" />
              )}
            </div>
            <span className="text-[10px] font-medium">{view === "home" && isInChat ? "Chat" : label}</span>
          </button>
        );
      })}
    </nav>
  );
}
