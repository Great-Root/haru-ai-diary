import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Pause, Play } from "lucide-react";
import { t } from "@/i18n";
import { getMascotForEmotion } from "@/utils/mascotEmotions";
import { Mascot } from "./Mascot";

interface RecentMoment {
  id: number;
  content: string;
  emotion: string;
  image_url?: string;
  date: string;
}

interface Props {
  onStartChat: () => void;
  onViewDiary: (momentId?: number) => void;
  userId: string;
}

function MomentThumb({ m, onClick }: { m: RecentMoment; onClick: () => void }) {
  return (
    <div
      className="w-20 h-20 shrink-0 rounded-xl overflow-hidden border border-[var(--haru-card-border)] bg-[var(--haru-card)] relative cursor-pointer"
      onClick={onClick}
    >
      {m.image_url ? (
        <img src={m.image_url} alt={m.content} className="w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-2xl">
          {getMascotForEmotion(m.emotion || "📝") ? (
            <img src={getMascotForEmotion(m.emotion || "📝")!} alt={m.emotion} className="w-full h-full object-cover" draggable={false} />
          ) : (
            m.emotion || "📝"
          )}
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent p-1 rounded-b-xl">
        <p className="text-[9px] text-white truncate">{m.content}</p>
      </div>
    </div>
  );
}

function buildColumns(moments: RecentMoment[]) {
  // Row-first: fill top row left→right, then bottom row
  const colCount = Math.ceil(moments.length / 2);
  const cols: [RecentMoment, RecentMoment | null][] = [];
  for (let c = 0; c < colCount; c++) {
    const top = moments[c];
    const bottom = moments[c + colCount] || null;
    cols.push([top, bottom]);
  }
  return cols;
}

function Carousel({ cols, onViewDiary, autoScroll, setAutoScroll }: {
  cols: [RecentMoment, RecentMoment | null][];
  onViewDiary: (id?: number) => void;
  autoScroll: boolean;
  setAutoScroll: (v: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const touchRef = useRef({ startX: 0, startOffset: 0, dragging: false, lastX: 0, lastTime: 0, velocity: 0 });
  const momentumRef = useRef<number | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DOM cache: pre-built column elements keyed by colIdx
  const colCacheRef = useRef<Map<number, HTMLElement>>(new Map());
  const prevRangeRef = useRef<{ start: number; count: number }>({ start: -1, count: 0 });

  const colWidth = 88;
  const totalWidth = cols.length * colWidth;

  const wrap = (v: number) => {
    const m = v % totalWidth;
    return m < 0 ? m + totalWidth : m;
  };

  // Build and cache a column DOM node
  const getColNode = useCallback((colIdx: number) => {
    const cached = colCacheRef.current.get(colIdx);
    if (cached) return cached;

    const col = cols[colIdx];
    const colDiv = document.createElement("div");
    colDiv.className = "flex flex-col gap-2 shrink-0";
    colDiv.style.width = "80px";

    for (const m of [col[0], col[1]]) {
      if (!m) {
        const spacer = document.createElement("div");
        spacer.className = "w-20 h-20";
        colDiv.appendChild(spacer);
        continue;
      }
      const thumb = document.createElement("div");
      thumb.className = "w-20 h-20 shrink-0 rounded-xl overflow-hidden border border-[var(--haru-card-border)] bg-[var(--haru-card)] relative cursor-pointer";
      thumb.dataset.momentId = String(m.id);

      if (m.image_url) {
        const img = document.createElement("img");
        img.src = m.image_url;
        img.className = "w-full h-full object-cover";
        img.draggable = false;
        thumb.appendChild(img);
      } else {
        const inner = document.createElement("div");
        inner.className = "w-full h-full flex items-center justify-center text-2xl";
        const mascot = getMascotForEmotion(m.emotion || "📝");
        if (mascot) {
          const img = document.createElement("img");
          img.src = mascot;
          img.className = "w-full h-full object-cover";
          img.draggable = false;
          inner.appendChild(img);
        } else {
          inner.textContent = m.emotion || "📝";
        }
        thumb.appendChild(inner);
      }

      const overlay = document.createElement("div");
      overlay.className = "absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent p-1 rounded-b-xl";
      const p = document.createElement("p");
      p.className = "text-[9px] text-white truncate";
      p.textContent = m.content;
      overlay.appendChild(p);
      thumb.appendChild(overlay);
      colDiv.appendChild(thumb);
    }

    colCacheRef.current.set(colIdx, colDiv);
    return colDiv;
  }, [cols, onViewDiary]);

  const renderItems = useCallback(() => {
    const container = containerRef.current;
    const strip = stripRef.current;
    if (!container || !strip) return;

    const viewWidth = container.clientWidth;
    const visibleCount = Math.ceil(viewWidth / colWidth) + 3; // +3: 1 extra left + 2 right buffer
    const startCol = Math.floor(offsetRef.current / colWidth) - 1; // start 1 col before visible area
    const prev = prevRangeRef.current;

    // Apply transform every frame (sub-pixel offset), shift 1 col left
    const sub = offsetRef.current % colWidth;
    strip.style.transform = `translateX(-${sub + colWidth}px)`;

    // Skip DOM update if visible range unchanged
    if (prev.start === startCol && prev.count === visibleCount) return;

    const prevEnd = prev.start + prev.count;
    const newEnd = startCol + visibleCount;

    if (prev.start >= 0 && startCol >= prev.start && startCol < prevEnd) {
      // Scrolling right: remove from left, add to right
      const removeCount = startCol - prev.start;
      for (let i = 0; i < removeCount && strip.firstChild; i++) {
        strip.removeChild(strip.firstChild);
      }
      for (let i = prevEnd; i < newEnd; i++) {
        const colIdx = ((i % cols.length) + cols.length) % cols.length;
        strip.appendChild(getColNode(colIdx).cloneNode(true));
      }
    } else if (prev.start >= 0 && startCol < prev.start && newEnd > prev.start) {
      // Scrolling left: remove from right, add to left
      const removeCount = prevEnd - newEnd;
      for (let i = 0; i < removeCount && strip.lastChild; i++) {
        strip.removeChild(strip.lastChild);
      }
      for (let i = prev.start - 1; i >= startCol; i--) {
        const colIdx = ((i % cols.length) + cols.length) % cols.length;
        strip.insertBefore(getColNode(colIdx).cloneNode(true), strip.firstChild);
      }
    } else {
      // Full rebuild (initial or big jump)
      const frag = document.createDocumentFragment();
      for (let i = 0; i < visibleCount; i++) {
        const colIdx = (((startCol + i) % cols.length) + cols.length) % cols.length;
        frag.appendChild(getColNode(colIdx).cloneNode(true));
      }
      strip.replaceChildren(frag);
    }

    prevRangeRef.current = { start: startCol, count: visibleCount };
  }, [cols, colWidth, getColNode]);

  // Reset cache when moments change
  useEffect(() => {
    colCacheRef.current.clear();
    prevRangeRef.current = { start: -1, count: 0 };
  }, [cols]);

  // Auto scroll
  useEffect(() => {
    if (!autoScroll || totalWidth === 0) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    let lastTime = 0;
    const speed = 30;
    const tick = (time: number) => {
      if (lastTime === 0) lastTime = time;
      const delta = (time - lastTime) / 1000;
      lastTime = time;
      offsetRef.current = wrap(offsetRef.current + speed * delta);
      renderItems();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [autoScroll, totalWidth, renderItems, wrap]);

  // Touch handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (momentumRef.current) cancelAnimationFrame(momentumRef.current);
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    const wasAutoScroll = autoScroll;
    if (autoScroll) setAutoScroll(false);

    touchRef.current = {
      startX: e.clientX,
      startOffset: offsetRef.current,
      dragging: true,
      lastX: e.clientX,
      lastTime: e.timeStamp,
      velocity: 0,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    (touchRef.current as any).wasAutoScroll = wasAutoScroll;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!touchRef.current.dragging) return;
    const dx = touchRef.current.startX - e.clientX;
    const dt = e.timeStamp - touchRef.current.lastTime;
    if (dt > 0) {
      touchRef.current.velocity = (touchRef.current.lastX - e.clientX) / dt;
    }
    touchRef.current.lastX = e.clientX;
    touchRef.current.lastTime = e.timeStamp;
    offsetRef.current = wrap(touchRef.current.startOffset + dx);
    renderItems();
  };

  const handlePointerUp = () => {
    if (!touchRef.current.dragging) return;
    touchRef.current.dragging = false;
    const wasAutoScroll = (touchRef.current as any).wasAutoScroll;

    // Momentum
    let v = touchRef.current.velocity * 1000; // px/s
    if (Math.abs(v) > 20) {
      const decel = 0.95;
      const momentumTick = () => {
        v *= decel;
        if (Math.abs(v) < 5) {
          if (wasAutoScroll) {
            pauseTimerRef.current = setTimeout(() => setAutoScroll(true), 2000);
          }
          return;
        }
        offsetRef.current = wrap(offsetRef.current + v / 60);
        renderItems();
        momentumRef.current = requestAnimationFrame(momentumTick);
      };
      momentumRef.current = requestAnimationFrame(momentumTick);
    } else if (wasAutoScroll) {
      pauseTimerRef.current = setTimeout(() => setAutoScroll(true), 2000);
    }
  };

  // Initial render
  useEffect(() => {
    renderItems();
  }, [renderItems]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden pl-5 pr-0"
      style={{ touchAction: "pan-y", maskImage: "linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={(e) => {
        // Don't navigate if user was dragging
        if (Math.abs(touchRef.current.startX - touchRef.current.lastX) > 5) return;
        const el = (e.target as HTMLElement).closest("[data-moment-id]") as HTMLElement | null;
        if (el?.dataset.momentId) onViewDiary(Number(el.dataset.momentId));
      }}
    >
      <div ref={stripRef} className="flex gap-2" style={{ willChange: "transform" }} />
    </div>
  );
}

export function HomeView({ onStartChat, onViewDiary, userId }: Props) {
  const [recentMoments, setRecentMoments] = useState<RecentMoment[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const needsScroll = recentMoments.length > 6;

  useEffect(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    fetch(`/api/moments/${today}?uid=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((res) => setRecentMoments(res.moments || []))
      .catch(() => {});
  }, []);

  const cols = buildColumns(recentMoments);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Top area */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-5 gap-3">
        <div className="max-w-[180px] max-h-[180px] w-full aspect-square flex items-center justify-center">
          <Mascot className="w-full h-full" />
        </div>
        <h2 className="text-2xl font-bold text-[var(--haru-green)]">HARU</h2>
        <p className="text-sm text-[var(--haru-text-secondary)]">Just talk about your day.</p>
        <button
          onClick={onStartChat}
          className="flex items-center gap-2.5 px-8 py-3.5 rounded-full bg-gradient-to-r from-[var(--haru-green)] to-[var(--haru-green-dark)] text-white text-base font-semibold shadow-lg hover:shadow-xl active:scale-95 transition-all mt-2"
        >
          <Mic className="w-5 h-5" />
          {t("startChat")}
        </button>
      </div>

      {/* Bottom — moments */}
      {recentMoments.length > 0 && (
        <div className="shrink-0 pb-3 pt-2 border-t border-[var(--haru-border)]">
          <div className="flex items-center justify-between mb-2 px-5">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-[var(--haru-text-secondary)]">{t("todayMoments")}</h3>
              {needsScroll && (
                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className="p-0.5 rounded-full text-[var(--haru-text-secondary)] active:scale-95"
                >
                  {autoScroll ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
              )}
            </div>
            <button
              onClick={() => onViewDiary()}
              className="text-xs text-[var(--haru-green)] hover:underline"
            >
              {t("viewAll")}
            </button>
          </div>

          {needsScroll ? (
            <Carousel cols={cols} onViewDiary={onViewDiary} autoScroll={autoScroll} setAutoScroll={setAutoScroll} />
          ) : (
            <div className="flex flex-wrap justify-center gap-2 px-5">
              {recentMoments.map((m) => (
                <MomentThumb key={m.id} m={m} onClick={() => onViewDiary(m.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {recentMoments.length === 0 && (
        <div className="shrink-0 text-center text-[var(--haru-text-secondary)] px-5 pb-3 pt-2 border-t border-[var(--haru-border)]">
          <p className="text-sm">{t("noMomentsYet")}</p>
          <p className="text-xs mt-0.5">{t("startToRecord")}</p>
        </div>
      )}
    </div>
  );
}
