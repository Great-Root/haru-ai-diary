import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, ImagePlus, Square, MessageCircle } from "lucide-react";
import { t, getLang } from "@/i18n";
import { useLiveConnection } from "@/hooks/useLiveConnection";
import { useSettings } from "@/hooks/useSettings";
import { BottomNav, type ViewType } from "@/components/BottomNav";
import { HomeView } from "@/components/HomeView";
import { ChatArea } from "@/components/ChatArea";
import { Controls } from "@/components/Controls";
import { VoiceOrb } from "@/components/VoiceOrb";
import { DiaryView } from "@/components/DiaryView";
import { OnboardingView } from "@/components/OnboardingView";
import { SettingsView } from "@/components/SettingsView";

function todayString() {
  const locales: Record<string, string> = { ko: "ko-KR", en: "en-US", ja: "ja-JP" };
  const locale = locales[getLang()] || navigator.language || "en-US";
  return new Date().toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function App() {
  const [view, setView] = useState<ViewType>("home");
  const [fabExpanded, setFabExpanded] = useState(false);
  const [scrollToMomentId, setScrollToMomentId] = useState<number | null>(null);
  const settings = useSettings();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const fabPhotoRef = useRef<HTMLInputElement>(null);

  const {
    connectionState,
    statusText,
    chatEntries,
    aiSpeaking,
    muted,
    connect,
    disconnect,
    sendTextInput,
    sendPhoto,
    interrupt,
    toggleMute,
    pendingImageApproval,
    approveImage,
    rejectImage,
    pendingDiaryApproval,
    approveDiary,
    rejectDiary,
  } = useLiveConnection(settings.persona, settings.gender, settings.lang, settings.autoMute, settings.userId, settings.speakerMode, settings.volume);

  const isInChat = connectionState === "connected" || connectionState === "connecting";

  // Reset view when onboarding state changes (e.g. after data reset)
  useEffect(() => {
    if (!settings.onboarded) setView("home");
  }, [settings.onboarded]);

  const handleStartChat = () => {
    setView("chat");
    connect();
  };

  const handleStopChat = () => {
    disconnect();
    if (view === "chat") setView("home");
  };

  const handleNavigate = (target: ViewType) => {
    setFabExpanded(false);
    if (target === "home" && isInChat) {
      setView("chat");
      return;
    }
    if (target === "diary") setScrollToMomentId(null);
    setView(target);
  };

  // Derive orb state
  const orbState = connectionState !== "connected"
    ? "connecting" as const
    : aiSpeaking
    ? "aiSpeaking" as const
    : "userSpeaking" as const;

  // Mic is effectively muted when manually muted OR autoMute + AI speaking
  const isMicMuted = muted || (settings.autoMute && aiSpeaking);

  return (
    <div className="flex justify-center h-dvh overflow-hidden">
      <div className="w-full max-w-[600px] h-full flex flex-col bg-[var(--haru-surface)] shadow-lg relative overflow-hidden">
        {/* Header */}
        <header className="px-5 py-2.5 flex justify-between items-center border-b border-[var(--haru-border)] shrink-0">
          <h1 className="text-xl font-bold text-[var(--haru-green)] tracking-widest">HARU</h1>
          <div className="flex items-center gap-2">
            {settings.onboarded && settings.userName && (
              <>
                <span className="text-[12px] text-[var(--haru-text-secondary)]">{settings.userName}</span>
                <div className="w-8 h-8 rounded-full overflow-hidden bg-[var(--haru-border)]">
                  <img
                    src={settings.customAvatar || `/avatars/avatar-${(settings.userAgeGroup || "20s").replace("+", "")}-${settings.userGender || "male"}.webp`}
                    alt="profile"
                    className="w-full h-full object-cover"
                  />
                </div>
              </>
            )}
            {(!settings.onboarded || !settings.userName) && (
              <span className="text-[13px] text-[var(--haru-text-secondary)]">{todayString()}</span>
            )}
          </div>
        </header>

        {/* Onboarding */}
        {!settings.onboarded && !isInChat && (
          <OnboardingView
            onComplete={settings.completeOnboarding}
            onDemo={async () => {
              await fetch(`/api/user/${settings.userId}/seed-demo`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lang: settings.lang, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
              });
              settings.completeOnboarding("Demo", "male", "20s");
            }}
            theme={settings.theme}
            setTheme={settings.setTheme}
            lang={settings.lang}
            setLang={settings.setLang}
          />
        )}

        {/* Main content area */}
        {settings.onboarded && view === "home" && !isInChat && (
          <HomeView onStartChat={handleStartChat} onViewDiary={(momentId) => { setScrollToMomentId(momentId ?? -1); setView("diary"); }} userId={settings.userId} />
        )}

        {view === "chat" && (
          <div className="flex-1 relative overflow-hidden">
            {/* Orb — behind chat */}
            <div
              className="absolute inset-0 flex items-center justify-center z-0"
              onClick={aiSpeaking ? interrupt : undefined}
            >
              <VoiceOrb state={orbState} statusText={statusText} />
            </div>

            {/* Transcript — floating overlay above controls */}
            <div ref={chatScrollRef} className={`absolute left-0 right-0 top-0 overflow-y-auto px-3 z-10`} style={{ bottom: (pendingImageApproval != null || pendingDiaryApproval) ? '120px' : '76px' }}>
              <ChatArea entries={chatEntries} compact scrollContainerRef={chatScrollRef} />
            </div>

            {/* Approval UI — above controls */}
            {(pendingImageApproval != null || pendingDiaryApproval) && (
              <div className="absolute left-0 right-0 bottom-[76px] z-20 flex justify-center px-3 pb-2 animate-fade-in">
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--haru-surface)] border border-[var(--haru-border)] shadow-lg">
                  <span className="text-sm">{pendingDiaryApproval ? "📖" : "🎨"}</span>
                  <span className="text-xs text-[var(--haru-text)]">
                    {pendingDiaryApproval ? t("diaryApprovalPrompt") : t("imageApprovalPrompt")}
                  </span>
                  <button
                    onClick={pendingDiaryApproval ? approveDiary : approveImage}
                    className="px-3 py-1 rounded-full bg-[var(--haru-green)] text-white text-xs font-medium active:scale-95 transition-transform"
                  >
                    {t("approve")}
                  </button>
                  <button
                    onClick={pendingDiaryApproval ? rejectDiary : rejectImage}
                    className="px-3 py-1 rounded-full bg-[var(--haru-border)] text-[var(--haru-text-secondary)] text-xs font-medium active:scale-95 transition-transform"
                  >
                    {t("reject")}
                  </button>
                </div>
              </div>
            )}

            {/* Controls — pinned bottom */}
            <div className="absolute left-0 right-0 bottom-3 z-20">
              <Controls
                connectionState={connectionState}
                onDisconnect={handleStopChat}
                onSendText={sendTextInput}
                onSendPhoto={sendPhoto}
                muted={isMicMuted}
                onToggleMute={toggleMute}
                speakerMode={settings.speakerMode}
                onToggleSpeakerMode={() => {}}
                volume={settings.volume}
                onVolumeChange={settings.setVolume}
              />
            </div>
          </div>
        )}

        {settings.onboarded && view === "diary" && (
          <DiaryView onBack={() => { setScrollToMomentId(null); setView(isInChat ? "chat" : "home"); }} userId={settings.userId} scrollToMomentId={scrollToMomentId} />
        )}

        {settings.onboarded && view === "settings" && (
          <SettingsView settings={settings} isInChat={isInChat} />
        )}

        {/* Chat FAB — when viewing other tabs during conversation */}
        {isInChat && view !== "chat" && (
          <div className="absolute bottom-16 right-3 z-30 flex flex-col items-end gap-2 animate-fade-in">
            {/* Expanded controls */}
            {fabExpanded && (
              <div className="flex flex-col gap-2 animate-fade-in">
                {/* Back to chat */}
                <button
                  onClick={() => { setView("chat"); setFabExpanded(false); }}
                  className="w-12 h-12 rounded-full bg-[var(--haru-surface)] shadow-lg border border-[var(--haru-border)] flex items-center justify-center active:scale-95 transition-transform"
                >
                  <MessageCircle className="w-5 h-5 text-[var(--haru-green)]" />
                </button>
                {/* Mute */}
                <button
                  onClick={toggleMute}
                  className={`w-12 h-12 rounded-full shadow-lg border border-[var(--haru-border)] flex items-center justify-center active:scale-95 transition-transform ${
                    isMicMuted ? "bg-red-500/10" : "bg-[var(--haru-surface)]"
                  }`}
                >
                  {isMicMuted
                    ? <MicOff className="w-5 h-5 text-red-500" />
                    : <Mic className="w-5 h-5 text-[var(--haru-green)]" />
                  }
                </button>
                {/* Photo */}
                <input ref={fabPhotoRef} type="file" accept="image/*" capture="environment" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) { sendPhoto(file); e.target.value = ""; }
                }} hidden />
                <button
                  onClick={() => fabPhotoRef.current?.click()}
                  className="w-12 h-12 rounded-full bg-[var(--haru-surface)] shadow-lg border border-[var(--haru-border)] flex items-center justify-center active:scale-95 transition-transform"
                >
                  <ImagePlus className="w-5 h-5 text-[var(--haru-brown)]" />
                </button>
                {/* End chat */}
                <button
                  onClick={() => { handleStopChat(); setFabExpanded(false); }}
                  className="w-12 h-12 rounded-full bg-red-500 shadow-lg flex items-center justify-center active:scale-95 transition-transform"
                >
                  <Square className="w-5 h-5 text-white" />
                </button>
              </div>
            )}
            {/* Main FAB */}
            <div className="relative">
              {/* Pulse ring — no pulse when muted */}
              {!isMicMuted && (
                <span className={`absolute inset-0 rounded-full animate-pulse-ring opacity-30 ${
                  orbState === "aiSpeaking" ? "bg-[var(--haru-brown)]" : "bg-[var(--haru-green)]"
                }`} />
              )}
              <button
                onClick={() => setFabExpanded(!fabExpanded)}
                className={`relative w-14 h-14 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all ${
                  isMicMuted
                    ? "bg-red-500/80"
                    : orbState === "aiSpeaking"
                    ? "bg-[var(--haru-brown)]"
                    : "bg-[var(--haru-green)]"
                }`}
              >
                <VoiceOrb state={orbState} statusText="" mini />
              </button>
            </div>
          </div>
        )}

        {/* Bottom Navigation — hidden during onboarding */}
        {settings.onboarded && (
          <div className="shrink-0">
            <BottomNav currentView={isInChat && view === "chat" ? "home" : view} onNavigate={handleNavigate} isInChat={isInChat} />
          </div>
        )}
      </div>
    </div>
  );
}
