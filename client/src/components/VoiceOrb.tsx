import { Mascot } from "./Mascot";

interface Props {
  state: "idle" | "connecting" | "userSpeaking" | "aiSpeaking";
  statusText: string;
  mini?: boolean;
}

export function VoiceOrb({ state, statusText, mini }: Props) {
  if (mini) {
    return (
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
        state === "aiSpeaking" ? "animate-orb-ai" : "animate-orb-idle"
      }`}>
        <img src="/icon-192.png" alt="haru" className="w-14 h-14 object-contain" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Orb container */}
      <div className="relative w-48 h-48 flex items-center justify-center bg-[var(--haru-surface)] rounded-full">
        {/* Ring 1 — outermost */}
        <div
          className={`absolute w-48 h-48 rounded-full border-2 ${
            state === "userSpeaking"
              ? "border-[var(--haru-green)]/40 animate-orb-pulse"
              : state === "aiSpeaking"
              ? "border-[var(--haru-brown)]/40 animate-orb-ai"
              : state === "connecting"
              ? "border-[var(--haru-green)]/30 animate-orb-connecting"
              : "border-[var(--haru-green)]/15 animate-orb-idle"
          }`}
        />
        {/* Ring 2 — middle */}
        <div
          className={`absolute w-40 h-40 rounded-full border-2 ${
            state === "userSpeaking"
              ? "border-[var(--haru-green)]/50 animate-orb-pulse"
              : state === "aiSpeaking"
              ? "border-[var(--haru-brown)]/50 animate-orb-ai"
              : state === "connecting"
              ? "border-[var(--haru-green)]/20 animate-orb-connecting"
              : "border-[var(--haru-green)]/10 animate-orb-idle"
          }`}
          style={{ animationDelay: state === "userSpeaking" ? "0.3s" : "0.5s" }}
        />
        {/* Ring 3 — inner glow */}
        <div
          className={`absolute w-32 h-32 rounded-full ${
            state === "userSpeaking"
              ? "bg-[var(--haru-green)]/8 animate-orb-pulse"
              : state === "aiSpeaking"
              ? "bg-[var(--haru-brown)]/8 animate-orb-ai"
              : "bg-[var(--haru-green)]/5 animate-orb-idle"
          }`}
          style={{ animationDelay: state === "userSpeaking" ? "0.6s" : "1s" }}
        />
        {/* Mascot */}
        <Mascot className={`w-28 h-28 relative z-10 transition-transform duration-500 ${
          state === "aiSpeaking" ? "scale-105" : "scale-100"
        }`} />
      </div>

      {/* Status text — prominent */}
      <p
        className={`text-sm font-medium transition-colors duration-300 ${
          state === "userSpeaking"
            ? "text-[var(--haru-green)]"
            : state === "aiSpeaking"
            ? "text-[var(--haru-brown)]"
            : state === "connecting"
            ? "text-[var(--haru-text-secondary)] animate-pulse"
            : "text-[var(--haru-text-secondary)]"
        }`}
      >
        {statusText}
      </p>
    </div>
  );
}
