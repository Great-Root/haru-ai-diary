import { useRef, useEffect, useCallback } from "react";
import type { ChatEntry } from "@/hooks/useLiveConnection";
import { t } from "@/i18n";
import { MomentCard } from "./MomentCard";
import { renderDiaryContent, getDiaryFont } from "./DiaryContent";

interface Props {
  entries: ChatEntry[];
  compact?: boolean;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

function formatTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatArea({ entries, compact, scrollContainerRef }: Props) {
  const internalRef = useRef<HTMLDivElement>(null);
  const scrollRef = scrollContainerRef || internalRef;
  const autoScrollRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    autoScrollRef.current = atBottom;
  }, [scrollRef]);

  // Attach scroll listener to external container if provided
  useEffect(() => {
    if (!scrollContainerRef?.current) return;
    const el = scrollContainerRef.current;
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [scrollContainerRef, handleScroll]);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [entries, scrollRef]);

  if (entries.length === 0) {
    return <div ref={compact ? undefined : internalRef} className="flex-1" />;
  }

  return (
    <div
      ref={compact ? undefined : internalRef}
      onScroll={compact ? undefined : handleScroll}
      className={`flex flex-col ${
        compact ? "gap-1.5 px-1 py-1" : "gap-2 px-4 py-3 flex-1 overflow-y-auto"
      }`}
    >
      {entries.map((entry) => {
        if (entry.role === "moment" && entry.moment) {
          return (
            <div key={entry.id} className="animate-slide-up">
              <MomentCard moment={entry.moment} />
            </div>
          );
        }

        if (entry.role === "diary" && entry.diary) {
          return (
            <div key={entry.id} className="self-center w-[90%] animate-slide-up">
              <div className="rounded-xl diary-paper border border-[var(--haru-card-border)] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">📖</span>
                  <span className="text-sm font-bold text-[var(--haru-text)]">{t("todayDiary")}</span>
                  <span className="text-[10px] text-[var(--haru-text-secondary)] ml-auto">{entry.diary.date}</span>
                </div>
                <div className="text-xl text-[var(--haru-text)]" style={{ fontFamily: getDiaryFont(), lineHeight: '32px' }}>
                  {renderDiaryContent(entry.diary.content)}
                </div>
              </div>
            </div>
          );
        }

        const time = formatTime(entry.timestamp);

        if (entry.role === "user") {
          return (
            <div key={entry.id} className="flex flex-col items-end animate-fade-in">
              <div
                className={`rounded-xl rounded-br-sm bg-[var(--haru-green)] text-white px-3 py-1.5 leading-relaxed ${
                  compact ? "max-w-[75%] text-xs" : "max-w-[85%] text-sm"
                }`}
              >
                {entry.imageUrl ? (
                  <img
                    src={entry.imageUrl}
                    alt="photo"
                    className={compact ? "max-w-[120px] rounded-lg" : "max-w-[200px] rounded-lg"}
                  />
                ) : (
                  <p className="whitespace-pre-wrap">{entry.text}</p>
                )}
              </div>
              {time && (
                <span className={`text-[var(--haru-text-secondary)] mt-0.5 ${compact ? "text-[9px]" : "text-[10px]"}`}>
                  {time}
                </span>
              )}
            </div>
          );
        }

        // Tool loading indicator
        if (entry.id.startsWith("loading-")) {
          const isImage = entry.id === "loading-generate_image";
          return (
            <div key={entry.id} className="self-center animate-fade-in">
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--haru-ai-bubble)] border border-[var(--haru-border)]">
                <span className="w-4 h-4 border-2 border-[var(--haru-green)] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-[var(--haru-text-secondary)]">
                  {isImage ? "🎨" : "📖"} {entry.text}
                </span>
              </div>
            </div>
          );
        }

        return (
          <div key={entry.id} className="flex flex-col items-start animate-fade-in">
            <div
              className={`rounded-xl rounded-bl-sm bg-[var(--haru-ai-bubble)] px-3 py-1.5 leading-relaxed ${
                compact ? "max-w-[75%] text-xs" : "max-w-[85%] text-sm"
              }`}
            >
              <span className={`text-[var(--haru-green)] font-semibold block mb-0.5 ${compact ? "text-[10px]" : "text-[11px]"}`}>
                Haru
              </span>
              <p className="whitespace-pre-wrap text-[var(--haru-text)]">{entry.text}</p>
            </div>
            {time && (
              <span className={`text-[var(--haru-text-secondary)] mt-0.5 ${compact ? "text-[9px]" : "text-[10px]"}`}>
                {time}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
