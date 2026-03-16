import { useState, useRef } from "react";
import { Moon, Sun, Globe } from "lucide-react";
import { t, type Lang } from "@/i18n";
import { Mascot } from "./Mascot";

interface Props {
  onComplete: (name: string, gender: string, ageGroup: string) => void;
  onDemo: () => void;
  theme: "light" | "dark" | "system";
  setTheme: (t: "light" | "dark" | "system") => void;
  lang: Lang;
  setLang: (l: Lang) => void;
}

const AGE_GROUPS = ["10s", "20s", "30s", "40s", "50s+"];
const LANGS: { value: Lang; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "EN" },
  { value: "ja", label: "日本語" },
];

export function OnboardingView({ onComplete, onDemo, theme, setTheme, lang, setLang }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [slideX, setSlideX] = useState(0);
  const [sliding, setSliding] = useState(false);
  const slideStartRef = useRef(0);
  const slideTrackRef = useRef<HTMLDivElement>(null);

  const avatarAge = ageGroup.replace("+", "");

  const handleFinish = () => {
    onComplete(name, gender, ageGroup);
  };

  const handleSkip = () => {
    onComplete("", "", "");
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 pb-2 min-h-0 overflow-hidden gap-6">
      {/* Content — centered */}
      <div className="flex flex-col items-center w-full max-w-[300px]">
        <div className="w-40 h-40 mb-4 rounded-full overflow-hidden bg-[var(--haru-surface)]">
          {gender && ageGroup ? (
            <img src={`/avatars/avatar-${avatarAge}-${gender}.webp`} alt="avatar" className="w-full h-full object-cover" />
          ) : gender ? (
            <img src={`/avatars/avatar-20s-${gender}.webp`} alt="avatar" className="w-full h-full object-cover opacity-60" />
          ) : (
            <Mascot className="w-full h-full" />
          )}
        </div>

        {step === 0 && (
          <div className="flex flex-col items-center gap-5 w-full">
            <h2 className="text-xl font-bold text-[var(--haru-text)]">{t("onboardingHi")}</h2>
            <p className="text-sm text-[var(--haru-text-secondary)]">{t("onboardingName")}</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("onboardingNamePlaceholder")}
              className="w-full px-4 py-3 rounded-xl border border-[var(--haru-border)] bg-[var(--haru-surface)] text-sm text-[var(--haru-text)] outline-none focus:border-[var(--haru-green)] text-center"
              autoFocus
            />
            <button
              onClick={() => setStep(1)}
              className="w-full py-3 rounded-full bg-[var(--haru-green)] text-white font-semibold active:scale-95 transition-all"
            >
              {t("next")}
            </button>

            {/* Demo + Settings — only on first step */}
            <button
              onClick={onDemo}
              className="text-[11px] text-[var(--haru-green)] underline active:opacity-60 mt-2"
            >
              {t("tryDemo")}
            </button>
            <div className="flex items-center gap-3 mt-1">
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--haru-border)]/30 text-[var(--haru-text-secondary)] active:scale-95"
              >
                {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
              <div className="flex items-center gap-0.5 bg-[var(--haru-border)]/30 rounded-full px-1 py-0.5">
                {LANGS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setLang(value)}
                    className={`px-2 py-1 rounded-full text-[10px] font-medium transition-all ${
                      lang === value
                        ? "bg-[var(--haru-green)] text-white"
                        : "text-[var(--haru-text-secondary)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col items-center gap-5 w-full">
            <h2 className="text-xl font-bold text-[var(--haru-text)]">{name || "👋"}!</h2>
            <p className="text-sm text-[var(--haru-text-secondary)]">{t("onboardingGender")}</p>
            <div className="flex gap-3 w-full">
              {[
                { value: "male", label: t("male"), emoji: "👦" },
                { value: "female", label: t("female"), emoji: "👧" },
              ].map(({ value, label, emoji }) => (
                <button
                  key={value}
                  onClick={() => setGender(value)}
                  className={`flex-1 py-4 rounded-xl border-2 text-center transition-all active:scale-95 ${
                    gender === value
                      ? "border-[var(--haru-green)] bg-[var(--haru-green)]/10 text-[var(--haru-green)]"
                      : "border-[var(--haru-border)] text-[var(--haru-text-secondary)]"
                  }`}
                >
                  <span className="text-2xl block mb-1">{emoji}</span>
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full py-3 rounded-full bg-[var(--haru-green)] text-white font-semibold active:scale-95 transition-all"
            >
              {t("next")}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col items-center gap-5 w-full">
            <h2 className="text-xl font-bold text-[var(--haru-text)]">{t("onboardingAge")}</h2>
            <div className="flex flex-wrap justify-center gap-2 w-full">
              {AGE_GROUPS.map((ag) => (
                <button
                  key={ag}
                  onClick={() => setAgeGroup(ag)}
                  className={`px-5 py-2.5 rounded-full border-2 text-sm font-medium transition-all active:scale-95 ${
                    ageGroup === ag
                      ? "border-[var(--haru-green)] bg-[var(--haru-green)]/10 text-[var(--haru-green)]"
                      : "border-[var(--haru-border)] text-[var(--haru-text-secondary)]"
                  }`}
                >
                  {ag}
                </button>
              ))}
            </div>
            <button
              onClick={handleFinish}
              className="w-full py-3 rounded-full bg-[var(--haru-green)] text-white font-semibold active:scale-95 transition-all"
            >
              {t("onboardingStart")}
            </button>
          </div>
        )}
      </div>

      {/* Step indicator + skip */}
      <div className="flex flex-col items-center gap-2 shrink-0">
        {/* Step indicator */}
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${
                i === step ? "bg-[var(--haru-green)] w-6" : "bg-[var(--haru-border)]"
              }`}
            />
          ))}
        </div>

        {/* Slide to skip */}
        <div
          ref={slideTrackRef}
          className="relative w-48 h-9 rounded-full bg-[var(--haru-border)]/30 overflow-hidden select-none"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            slideStartRef.current = e.clientX - slideX;
            setSliding(true);
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!sliding) return;
            const track = slideTrackRef.current;
            if (!track) return;
            const maxX = track.clientWidth - 32;
            const x = Math.max(0, Math.min(maxX, e.clientX - slideStartRef.current));
            setSlideX(x);
            if (x >= maxX * 0.9) {
              setSliding(false);
              handleSkip();
            }
          }}
          onPointerUp={() => {
            setSliding(false);
            setSlideX(0);
          }}
        >
          <div
            className={`absolute top-0 left-0 h-full rounded-full bg-[var(--haru-green)]/20 ${sliding ? "" : "transition-all duration-200"}`}
            style={{ width: slideX + 32 }}
          />
          <div className="absolute inset-0 flex items-center justify-center pl-8">
            <span className="text-[10px] text-[var(--haru-text-secondary)]">{t("slideToSkip")} →→</span>
          </div>
          <div
            className={`absolute top-0 left-0 w-9 h-9 rounded-full bg-[var(--haru-green)] ${sliding ? "" : "transition-transform duration-200"}`}
            style={{ transform: `translateX(${slideX}px)` }}
          />
        </div>
        <p className="text-[10px] text-[var(--haru-text-secondary)] opacity-50">{t("skipHint")}</p>

      </div>
    </div>
  );
}
