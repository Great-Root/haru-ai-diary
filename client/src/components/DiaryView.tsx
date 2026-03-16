import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Share2, Calendar as CalendarIcon, Camera, ChevronDown, ChevronUp } from "lucide-react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { t, getLang } from "@/i18n";
import { renderDiaryContent, getDiaryFont } from "./DiaryContent";
import { ScrollArea } from "./ScrollArea";

interface Weather {
  icon: string;
  desc: string;
  temp: number;
  high: number;
  low: number;
  humidity: number;
  wind_speed: number;
}

interface Moment {
  id: number;
  content: string;
  emotion: string;
  time: string;
  image_url?: string;
  ref_photo?: string;
  weather?: Weather;
}

interface Diary {
  id: number;
  date: string;
  content: string;
  created_at: string;
}

interface Props {
  onBack: () => void;
  userId: string;
  scrollToMomentId?: number | null;
}

export function DiaryView({ onBack, userId, scrollToMomentId }: Props) {
  const diaryCardRef = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [moments, setMoments] = useState<Moment[]>([]);
  const [diary, setDiary] = useState<Diary | null>(null);
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const [loading, setLoading] = useState(true);
  const [generatingDiary, setGeneratingDiary] = useState(false);
  const [diaryPrompt, setDiaryPrompt] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [expandedRefPhoto, setExpandedRefPhoto] = useState<number | null>(null);
  const [calendarData, setCalendarData] = useState<Record<string, { count: number; emotion: string; has_diary: boolean }>>({});

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/moments/${date}?uid=${encodeURIComponent(userId)}`).then((r) => r.json()),
      fetch(`/api/diary/${date}?uid=${encodeURIComponent(userId)}`).then((r) => r.json()),
    ]).then(([momentsRes, diaryRes]) => {
      setMoments(momentsRes.moments || []);
      setDiary(diaryRes.diary || null);
      setLoading(false);
    });
  }, [date]);

  useEffect(() => {
    if (scrollToMomentId != null && !loading) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`moment-${scrollToMomentId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
              observer.disconnect();
              setTimeout(() => {
                el.classList.add("moment-highlight");
                setTimeout(() => el.classList.remove("moment-highlight"), 2000);
              }, 300);
            }
          }, { threshold: 0.8 });
          observer.observe(el);
        }
      });
    }
  }, [scrollToMomentId, loading]);

  const changeDate = (delta: number) => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  };

  const loadCalendarMonth = useCallback((year: number, month: number) => {
    fetch(`/api/calendar/${year}/${month}?uid=${encodeURIComponent(userId)}`)
      .then(r => r.json())
      .then(data => setCalendarData(data.days || {}))
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (showCalendar) {
      const d = new Date(date + "T12:00:00");
      loadCalendarMonth(d.getFullYear(), d.getMonth() + 1);
    }
  }, [showCalendar, date, loadCalendarMonth]);

  const handleGenerateDiary = async () => {
    setGeneratingDiary(true);
    try {
      const res = await fetch(`/api/diary/${date}/generate?uid=${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: diaryPrompt, lang: getLang() }),
      });
      const data = await res.json();
      if (data.diary) {
        setDiary(data.diary);
      }
    } catch (e) {
      console.error("Diary generation failed:", e);
    } finally {
      setGeneratingDiary(false);
    }
  };

  const locale = { ko: "ko-KR", en: "en-US", ja: "ja-JP" }[getLang()] || "en-US";
  const displayDate = (() => {
    const d = new Date(date + "T00:00:00");
    const base = d.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
    const weekday = d.toLocaleDateString(locale, { weekday: "short" });
    return `${base} (${weekday})`;
  })();

  const handleShare = () => {
    const el = diaryCardRef.current;
    if (!el) return;
    // Add print class to show only the diary card
    el.classList.add("diary-print-target");
    window.print();
    el.classList.remove("diary-print-target");
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Date navigation + weather + calendar toggle */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--haru-border)]">
        <div className="flex items-center gap-1">
          <button onClick={() => changeDate(-1)} className="p-1.5 rounded-full transition-colors" style={{ color: 'var(--haru-text-secondary)', WebkitTapHighlightColor: 'transparent' }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          {/* Spacer to match right side (calendar + arrow) */}
          <div className="w-[28px]" />
        </div>
        <button onClick={() => setShowCalendar(!showCalendar)} className="flex flex-col items-center" style={{ WebkitTapHighlightColor: 'transparent' }}>
          <span className="text-sm font-medium text-[var(--haru-text)]">{displayDate}</span>
          {date !== todayStr && (
            <button
              onClick={(e) => { e.stopPropagation(); setDate(todayStr); }}
              className="text-[9px] text-[var(--haru-green)] font-medium mt-0.5"
            >
              today
            </button>
          )}
          {(() => {
            const w = moments.find(m => m.weather)?.weather;
            if (!w) return null;
            return (
              <span className="text-[10px] text-[var(--haru-text-secondary)]">
                {w.icon} {w.high}° / {w.low}°
              </span>
            );
          })()}
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className={`p-1.5 rounded-full transition-colors ${showCalendar ? "bg-[var(--haru-green)] text-white" : ""}`}
            style={{ color: showCalendar ? undefined : 'var(--haru-text-secondary)', WebkitTapHighlightColor: 'transparent' }}
          >
            <CalendarIcon className="w-4 h-4" />
          </button>
          <button onClick={() => changeDate(1)} className="p-1.5 rounded-full transition-colors" style={{ color: 'var(--haru-text-secondary)', WebkitTapHighlightColor: 'transparent' }}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calendar view */}
      <div
        className="overflow-hidden border-b border-[var(--haru-border)] transition-all duration-300 ease-out"
        style={{ maxHeight: showCalendar ? "400px" : "0px", opacity: showCalendar ? 1 : 0 }}
      >
        <div className="px-4 py-3">
          <Calendar
            value={new Date(date + "T12:00:00")}
            onChange={(value) => {
              if (value instanceof Date) {
                setDate(`${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`);
              }
            }}
            onActiveStartDateChange={({ activeStartDate }) => {
              if (activeStartDate) {
                loadCalendarMonth(activeStartDate.getFullYear(), activeStartDate.getMonth() + 1);
              }
            }}
            tileContent={({ date: tileDate }) => {
              const key = `${tileDate.getFullYear()}-${String(tileDate.getMonth() + 1).padStart(2, "0")}-${String(tileDate.getDate()).padStart(2, "0")}`;
              const day = calendarData[key];
              if (!day) return null;
              return (
                <div className="flex flex-col items-center">
                  <span className="text-[8px] leading-none">
                    {day.emotion || "📝"}{day.weather?.icon ? `/${day.weather.icon}` : ""}
                  </span>
                  {day.has_diary && <span className="w-1 h-1 rounded-full bg-[var(--haru-green)] mt-0.5" />}
                </div>
              );
            }}
            locale={locale}
            calendarType="gregory"
            formatDay={(_, date) => String(date.getDate())}
            className="haru-calendar"
          />
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 min-h-0 px-5 py-5">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-[var(--haru-green)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : moments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="text-4xl">📖</span>
            <p className="text-[var(--haru-text-secondary)] text-sm">{t("noRecordThisDay")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Diary — generate or show */}
            {moments.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={diaryPrompt}
                    onChange={(e) => setDiaryPrompt(e.target.value)}
                    placeholder={t("diaryPromptPlaceholder")}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-[var(--haru-border)] bg-transparent text-xs text-[var(--haru-text)] outline-none focus:border-[var(--haru-green)]"
                  />
                  <button
                    onClick={handleGenerateDiary}
                    disabled={generatingDiary}
                    className={`px-4 py-2.5 rounded-xl text-xs font-medium active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap ${
                      diary
                        ? "bg-[var(--haru-text-secondary)]/10 text-[var(--haru-text-secondary)]"
                        : "bg-[var(--haru-green)] text-white"
                    }`}
                  >
                    {generatingDiary
                      ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                      : diary ? "✏️" : "📖"}
                  </button>
                </div>
              </div>
            )}
            {diary && (
              <div ref={diaryCardRef} className="rounded-xl diary-paper border border-[var(--haru-card-border)] p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-base font-bold text-[var(--haru-text)]">{t("myDiary")}</h3>
                    <p className="text-[11px] text-[var(--haru-text-secondary)] mt-0.5">{displayDate}</p>
                    {(() => {
                      const w = moments.find(m => m.weather)?.weather;
                      if (!w) return null;
                      return (
                        <p className="text-[11px] text-[var(--haru-text-secondary)] mt-0.5">
                          {w.icon} {w.desc} {w.temp}° ({w.low}°/{w.high}°)
                        </p>
                      );
                    })()}
                  </div>
                  {(
                    <button
                      onClick={handleShare}
                      className="p-1.5 rounded-full hover:bg-white/50 transition-colors"
                    >
                      <Share2 className="w-4 h-4 text-[var(--haru-brown)]" />
                    </button>
                  )}
                </div>
                <div className="text-xl text-[var(--haru-text)]" style={{ fontFamily: getDiaryFont(), lineHeight: '32px' }}>
                  {renderDiaryContent(diary.content)}
                </div>
              </div>
            )}

            {/* Moments header */}
            <h3 className="text-xs font-semibold text-[var(--haru-text-secondary)] uppercase tracking-wider">
              Moments
            </h3>

            {/* Moments grid */}
            <div className="flex flex-col gap-4">
              {moments.map((moment) => (
                <div
                  key={moment.id}
                  id={`moment-${moment.id}`}
                  className="rounded-xl border border-[var(--haru-card-border)] bg-[var(--haru-surface)] p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{moment.emotion}</span>
                    <span className="text-[11px] text-[var(--haru-text-secondary)]">{moment.time}</span>
                    {moment.weather && (
                      <span className="text-[10px] text-[var(--haru-text-secondary)] ml-auto" title={`${moment.weather.desc} | 습도 ${moment.weather.humidity}% | 바람 ${moment.weather.wind_speed}km/h`}>
                        {moment.weather.icon} {moment.weather.temp}°
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--haru-text)] leading-relaxed">{moment.content}</p>
                  {moment.image_url && (
                    <img
                      src={moment.image_url}
                      alt="illustration"
                      className="w-full rounded-lg mt-3"
                    />
                  )}
                  {moment.ref_photo && (
                    <div className="mt-2 flex flex-col items-end">
                      <button
                        onClick={() => setExpandedRefPhoto(expandedRefPhoto === moment.id ? null : moment.id)}
                        className="flex items-center gap-1 text-[10px] text-[var(--haru-text-secondary)] active:opacity-60"
                      >
                        <Camera className="w-3 h-3" />
                        {t("refPhoto")}
                        {expandedRefPhoto === moment.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {expandedRefPhoto === moment.id && (
                        <img src={moment.ref_photo} alt="reference" className="w-full rounded-lg mt-1" />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Share button at bottom */}
            {navigator.share && !diary && (
              <button
                onClick={handleShare}
                className="flex items-center justify-center gap-2 py-2.5 rounded-full border border-[var(--haru-card-border)] text-sm text-[var(--haru-brown)] hover:bg-[var(--haru-card)] transition-colors"
              >
                <Share2 className="w-4 h-4" />
                {t("share")}
              </button>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
