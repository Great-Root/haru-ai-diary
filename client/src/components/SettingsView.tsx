import { useState, useRef, useEffect } from "react";
import { t } from "@/i18n";
import type { Lang } from "@/i18n";
import type { Persona, VoiceGender } from "@/hooks/useSettings";
import { Moon, Sun, Monitor, Globe, Heart, Smile, Mic, VolumeX, Volume2, Speaker, Trash2, User, Camera } from "lucide-react";
import { ScrollArea } from "./ScrollArea";

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`w-12 h-7 rounded-full transition-colors duration-200 relative ${
        on ? "bg-[var(--haru-green)]" : "bg-[var(--haru-border)]"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform duration-200 ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

interface Settings {
  userId: string;
  theme: "light" | "dark" | "system";
  setTheme: (t: "light" | "dark" | "system") => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  persona: Persona;
  setPersona: (p: Persona) => void;
  gender: VoiceGender;
  setGender: (g: VoiceGender) => void;
  autoMute: boolean;
  setAutoMute: (v: boolean) => void;
  speakerMode: boolean;
  setSpeakerMode: (v: boolean) => void;
  volume: number;
  setVolume: (v: number) => void;
  userName: string;
  userGender: string;
  userAgeGroup: string;
  customAvatar: string;
  setCustomAvatar: (v: string) => void;
  updateProfile: (name: string, gender: string, ageGroup: string) => void;
  completeOnboarding: (name: string, gender: string, ageGroup: string) => void;
  resetData: () => Promise<void>;
}

interface Props {
  settings: Settings;
  isInChat?: boolean;
}

const themeOptions = [
  { value: "light" as const, icon: Sun, label: "Light" },
  { value: "dark" as const, icon: Moon, label: "Dark" },
  { value: "system" as const, icon: Monitor, label: "System" },
];

const langOptions: { value: Lang; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];

export function SettingsView({ settings, isInChat }: Props) {
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarGenerating, setAvatarGenerating] = useState(localStorage.getItem("haru-avatarGenerating") === "true");
  const [customAvatarUrl, setCustomAvatarUrl] = useState(localStorage.getItem("haru-customAvatar") || "");

  // Poll for avatar generation completion
  useEffect(() => {
    if (!avatarGenerating) return;
    const interval = setInterval(() => {
      const still = localStorage.getItem("haru-avatarGenerating");
      if (!still) {
        setAvatarGenerating(false);
        const url = localStorage.getItem("haru-customAvatar");
        if (url) {
          const urlWithCache = url + "?t=" + Date.now();
          setCustomAvatarUrl(urlWithCache);
          settings.setCustomAvatar(urlWithCache);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [avatarGenerating]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      setAvatarGenerating(true);
      localStorage.setItem("haru-avatarGenerating", "true");

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const mime = file.type || "image/jpeg";

      fetch(`/api/user/${settings.userId}/generate-avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mime, prompt: avatarPrompt }),
      }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }).then(data => {
        if (data.avatar_url) {
          localStorage.setItem("haru-customAvatar", data.avatar_url);
          settings.setCustomAvatar(data.avatar_url + "?t=" + Date.now());
        }
        localStorage.removeItem("haru-avatarGenerating");
        setAvatarGenerating(false);
      }).catch((err) => {
        console.error("Avatar generation error:", err);
        localStorage.removeItem("haru-avatarGenerating");
        setAvatarGenerating(false);
      });
    } catch (err) {
      console.error("Avatar upload error:", err);
      setAvatarGenerating(false);
      localStorage.removeItem("haru-avatarGenerating");
    }
  };

  const [editName, setEditName] = useState(settings.userName);
  const [editGender, setEditGender] = useState(settings.userGender);
  const [editAge, setEditAge] = useState(settings.userAgeGroup);
  const [avatarPrompt, setAvatarPrompt] = useState("");
  const profileChanged = editName !== settings.userName || editGender !== settings.userGender || editAge !== settings.userAgeGroup;

  const handleSaveProfile = () => {
    settings.updateProfile(editName, editGender, editAge);
  };

  const handleReset = async () => {
    if (!confirm(t("resetConfirm"))) return;
    setResetting(true);
    await settings.resetData();
    setResetting(false);
    setResetDone(true);
    setTimeout(() => setResetDone(false), 2000);
  };

  return (
    <ScrollArea className="flex-1 min-h-0 px-5 py-6">
      <h2 className="text-lg font-bold text-[var(--haru-text)] mb-6">{t("settings")}</h2>

      <div className="flex flex-col gap-4">
        {/* Profile */}
        <div className="rounded-xl border border-[var(--haru-border)] bg-[var(--haru-surface)] p-4">
          <h3 className="text-sm font-semibold text-[var(--haru-text-secondary)] mb-4 text-center">{t("profile")}</h3>

          {/* Avatar — centered */}
          <div className="flex flex-col items-center mb-4">
            <div className="relative w-24 h-24 mb-3 rounded-full overflow-hidden bg-[var(--haru-border)]">
              <img
                src={customAvatarUrl || `/avatars/avatar-${(editAge || "20s").replace("+", "")}-${editGender || "male"}.webp`}
                alt="avatar"
                className="w-full h-full object-cover"
              />
              {avatarGenerating && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            {/* Avatar prompt */}
            <textarea
              value={avatarPrompt}
              onChange={(e) => setAvatarPrompt(e.target.value)}
              placeholder={t("avatarPromptPlaceholder")}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[var(--haru-border)] bg-transparent text-xs text-[var(--haru-text)] outline-none focus:border-[var(--haru-green)] resize-none mb-2"
            />
            {/* Photo upload */}
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} hidden />
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarGenerating}
              className="text-[11px] text-[var(--haru-text-secondary)] active:opacity-60 flex items-center gap-1"
            >
              <Camera className="w-3 h-3" /> {t("uploadPhoto")}
            </button>
          </div>

          {/* Fields */}
          <div className="flex flex-col gap-3">
            {/* Name */}
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t("onboardingNamePlaceholder")}
              className="w-full px-3 py-2 rounded-lg border border-[var(--haru-border)] bg-transparent text-sm text-[var(--haru-text)] outline-none focus:border-[var(--haru-green)] text-center"
            />

            {/* Gender */}
            <div className="flex gap-2">
              {[
                { value: "male", label: t("male") },
                { value: "female", label: t("female") },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setEditGender(value)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                    editGender === value
                      ? "border-[var(--haru-green)] bg-[var(--haru-green)]/10 text-[var(--haru-green)]"
                      : "border-[var(--haru-border)] text-[var(--haru-text-secondary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Age */}
            <div className="flex flex-wrap justify-center gap-2">
              {["10s", "20s", "30s", "40s", "50s+"].map((ag) => (
                <button
                  key={ag}
                  onClick={() => setEditAge(ag)}
                  className={`px-4 py-1.5 rounded-full border text-xs font-medium transition-all ${
                    editAge === ag
                      ? "border-[var(--haru-green)] bg-[var(--haru-green)]/10 text-[var(--haru-green)]"
                      : "border-[var(--haru-border)] text-[var(--haru-text-secondary)]"
                  }`}
                >
                  {ag}
                </button>
              ))}
            </div>

            {/* Save */}
            {(profileChanged || avatarPrompt !== "") && (
              <button
                onClick={handleSaveProfile}
                className="w-full py-2 rounded-lg bg-[var(--haru-green)] text-white text-sm font-medium active:scale-95 transition-all"
              >
                {t("save")}
              </button>
            )}
          </div>
        </div>

        {/* Theme */}
        <div className="rounded-xl border border-[var(--haru-border)] bg-[var(--haru-surface)] p-4">
          <h3 className="text-sm font-semibold text-[var(--haru-text-secondary)] mb-3">{t("darkMode")}</h3>
          <div className="flex gap-2">
            {themeOptions.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => settings.setTheme(value)}
                className={`flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-lg border transition-all ${
                  settings.theme === value
                    ? "border-[var(--haru-green)] bg-[var(--haru-green)]/10 text-[var(--haru-green)]"
                    : "border-[var(--haru-border)] text-[var(--haru-text-secondary)] hover:border-[var(--haru-text-secondary)]"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className={`rounded-xl border border-[var(--haru-border)] bg-[var(--haru-surface)] p-4 ${isInChat ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-[var(--haru-text-secondary)]" />
            <h3 className="text-sm font-semibold text-[var(--haru-text-secondary)]">{t("language")}</h3>
            {isInChat && <span className="text-[10px] text-[var(--haru-text-secondary)]">({t("endChatToChange") || "end chat to change"})</span>}
          </div>
          <div className="flex gap-2">
            {langOptions.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => settings.setLang(value)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                  settings.lang === value
                    ? "border-[var(--haru-green)] bg-[var(--haru-green)]/10 text-[var(--haru-green)]"
                    : "border-[var(--haru-border)] text-[var(--haru-text-secondary)] hover:border-[var(--haru-text-secondary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Persona */}
        <div className={`rounded-xl border border-[var(--haru-border)] bg-[var(--haru-surface)] p-4 ${isInChat ? "opacity-50 pointer-events-none" : ""}`}>
          <h3 className="text-sm font-semibold text-[var(--haru-text-secondary)] mb-3">{t("persona")}</h3>
          <div className="flex gap-2">
            {([
              { value: "warm" as const, icon: Heart, label: t("personaWarm"), desc: t("personaWarmDesc") },
              { value: "casual" as const, icon: Smile, label: t("personaCasual"), desc: t("personaCasualDesc") },
            ]).map(({ value, icon: Icon, label, desc }) => (
              <button
                key={value}
                onClick={() => settings.setPersona(value)}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-all ${
                  settings.persona === value
                    ? "border-[var(--haru-green)] bg-[var(--haru-green)]/10 text-[var(--haru-green)]"
                    : "border-[var(--haru-border)] text-[var(--haru-text-secondary)] hover:border-[var(--haru-text-secondary)]"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm font-medium">{label}</span>
                <span className="text-[10px] opacity-70">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Voice Gender */}
        <div className={`rounded-xl border border-[var(--haru-border)] bg-[var(--haru-surface)] p-4 ${isInChat ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex items-center gap-2 mb-3">
            <Mic className="w-4 h-4 text-[var(--haru-text-secondary)]" />
            <h3 className="text-sm font-semibold text-[var(--haru-text-secondary)]">{t("voiceGender")}</h3>
          </div>
          <div className="flex gap-2">
            {([
              { value: "female" as const, label: t("voiceFemale") },
              { value: "male" as const, label: t("voiceMale") },
            ]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => settings.setGender(value)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                  settings.gender === value
                    ? "border-[var(--haru-green)] bg-[var(--haru-green)]/10 text-[var(--haru-green)]"
                    : "border-[var(--haru-border)] text-[var(--haru-text-secondary)] hover:border-[var(--haru-text-secondary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Auto Mute */}
        <div className="rounded-xl border border-[var(--haru-border)] bg-[var(--haru-surface)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <VolumeX className="w-4 h-4 text-[var(--haru-text-secondary)]" />
              <div>
                <h3 className="text-sm font-semibold text-[var(--haru-text-secondary)]">{t("autoMute")}</h3>
                <p className="text-[10px] text-[var(--haru-text-secondary)] opacity-70">{t("autoMuteDesc")}</p>
              </div>
            </div>
            <Toggle on={settings.autoMute} onChange={() => settings.setAutoMute(!settings.autoMute)} />
          </div>
        </div>



        {/* Volume */}
        <div className="rounded-xl border border-[var(--haru-border)] bg-[var(--haru-surface)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Volume2 className="w-4 h-4 text-[var(--haru-text-secondary)]" />
            <h3 className="text-sm font-semibold text-[var(--haru-text-secondary)]">{t("volumeLabel")}</h3>
            <span className="text-xs text-[var(--haru-text-secondary)] ml-auto">{Math.round(settings.volume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.volume}
            onChange={(e) => settings.setVolume(parseFloat(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none bg-[var(--haru-border)] accent-[var(--haru-green)]"
          />
        </div>

        {/* Reset Data */}
        <div className="rounded-xl border border-red-200 bg-[var(--haru-surface)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-400" />
              <div>
                <h3 className="text-sm font-semibold text-red-500">{t("resetData")}</h3>
                <p className="text-[10px] text-[var(--haru-text-secondary)] opacity-70">{t("resetDataDesc")}</p>
              </div>
            </div>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="px-3 py-1.5 rounded-lg border border-red-300 text-xs font-medium text-red-500 hover:bg-red-50 active:scale-95 transition-all disabled:opacity-40"
            >
              {resetting ? "..." : resetDone ? "✓" : t("reset")}
            </button>
          </div>
        </div>

        {/* About */}
        <div className="rounded-xl border border-[var(--haru-border)] bg-[var(--haru-surface)] p-4">
          <h3 className="text-sm font-semibold text-[var(--haru-text-secondary)] mb-2">{t("about")}</h3>
          <div className="text-sm text-[var(--haru-text)] space-y-1">
            <p>{t("appDesc")}</p>
            <p className="text-xs text-[var(--haru-text-secondary)]">{t("poweredBy")}</p>
            <p className="text-xs text-[var(--haru-text-secondary)]">Version 0.9.0</p>
          </div>
        </div>

        {/* How to use */}
        <div className="rounded-xl border border-[var(--haru-border)] bg-[var(--haru-surface)] p-4">
          <h3 className="text-sm font-semibold text-[var(--haru-text-secondary)] mb-2">{t("howToUse")}</h3>
          <div className="text-xs text-[var(--haru-text-secondary)] space-y-2">
            <p>{t("howTo1")}</p>
            <p>{t("howTo2")}</p>
            <p>{t("howTo3")}</p>
            <p>{t("howTo4")}</p>
          </div>
        </div>

        {/* Credits */}
        <div className="rounded-xl border border-[var(--haru-border)] bg-[var(--haru-surface)] p-4">
          <h3 className="text-sm font-semibold text-[var(--haru-text-secondary)] mb-2">{t("credits")}</h3>
          <div className="text-xs text-[var(--haru-text-secondary)] space-y-1">
            <p>{t("builtFor")}</p>
            <p>Voice: Gemini Native Audio</p>
            <p>Images: Gemini Imagen</p>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
