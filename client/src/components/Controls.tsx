import { useState, useRef, useCallback } from "react";
import { Square, ImagePlus, Send, MessageSquare, ChevronRight, Mic, MicOff, Volume2, VolumeX, Camera, Image } from "lucide-react";
import { t } from "@/i18n";

interface Props {
  connectionState: string;
  onDisconnect: () => void;
  onSendText: (text: string) => void;
  onSendPhoto: (file: File) => void;
  muted: boolean;
  onToggleMute: () => void;
  speakerMode: boolean;
  onToggleSpeakerMode: () => void;
  volume: number;
  onVolumeChange: (v: number) => void;
}

export function Controls({
  connectionState,
  onDisconnect,
  onSendText,
  onSendPhoto,
  muted,
  onToggleMute,
  speakerMode,
  onToggleSpeakerMode,
  volume,
  onVolumeChange,
}: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [textValue, setTextValue] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevVolumeRef = useRef(volume);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const barRef = useRef<HTMLDivElement>(null);
  const volumeAreaRef = useRef<HTMLDivElement>(null);

  const handleVolumePointerDown = useCallback((e: React.PointerEvent) => {
    startYRef.current = e.clientY;
    draggingRef.current = false;
    // Capture on the parent div so drag works even outside child elements
    volumeAreaRef.current?.setPointerCapture(e.pointerId);

    longPressTimer.current = setTimeout(() => {
      draggingRef.current = true;
      setShowVolume(true);
      longPressTimer.current = null;
    }, 300);
  }, []);

  const handleVolumePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) {
      if (Math.abs(e.clientY - startYRef.current) > 10 && longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
        draggingRef.current = true;
        setShowVolume(true);
      }
      if (!draggingRef.current) return;
    }
    // Map pointer position to volume based on bar position
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = 1 - (e.clientY - rect.top) / rect.height;
    const newVol = Math.max(0, Math.min(1, ratio));
    onVolumeChange(Math.round(newVol * 20) / 20);
  }, [onVolumeChange]);

  const handleVolumePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      if (volume > 0) {
        prevVolumeRef.current = volume;
        onVolumeChange(0);
      } else {
        onVolumeChange(prevVolumeRef.current || 0.8);
      }
    }
    draggingRef.current = false;
    setTimeout(() => setShowVolume(false), 300);
  }, [volume, onVolumeChange]);

  const isConnected = connectionState === "connected";

  const handleSend = () => {
    if (!textValue.trim()) return;
    onSendText(textValue);
    setTextValue("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && isConnected) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSendPhoto(file);
      e.target.value = "";
    }
  };

  const [inputReady, setInputReady] = useState(false);

  const toggleInput = () => {
    if (!showInput) {
      setInputReady(true);
      requestAnimationFrame(() => {
        setShowInput(true);
        setTimeout(() => inputRef.current?.focus(), 300);
      });
    } else {
      setShowInput(false);
      setInputReady(false);
    }
  };

  return (
    <div className="bg-[var(--haru-surface)]/60 backdrop-blur-sm px-5 py-2 safe-bottom flex justify-center">
      {/* Main controls row: [Mute] [Volume] [Stop] [Photo] [Text] */}
      <div ref={rowRef} className="relative inline-flex items-center gap-5">
        {/* Mute mic */}
        <button
          onClick={onToggleMute}
          disabled={!isConnected}
          className={`w-11 h-11 flex items-center justify-center rounded-full disabled:opacity-40 active:scale-95 transition-all ${
            muted
              ? "bg-red-500/15 text-red-500"
              : "bg-[var(--haru-green)]/15 text-[var(--haru-green)]"
          }`}
        >
          {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Volume — tap: toggle mute, long press + drag: volume */}
        <div
          ref={volumeAreaRef}
          className="relative w-11 h-11"
          onPointerDown={handleVolumePointerDown}
          onPointerMove={handleVolumePointerMove}
          onPointerUp={handleVolumePointerUp}
          onPointerLeave={(e) => {
            // Don't close while dragging — only close on pointer up
            if (longPressTimer.current) {
              clearTimeout(longPressTimer.current);
              longPressTimer.current = null;
            }
            if (!draggingRef.current) return;
          }}
          style={{ touchAction: "none" }}
        >
          <div
            className={`absolute bottom-0 left-0 w-11 rounded-full flex flex-col items-center justify-end overflow-hidden transition-all duration-200 ${
              volume > 0
                ? "bg-[var(--haru-green)]/15 text-[var(--haru-green)]"
                : "bg-red-500/15 text-red-500"
            } ${!isConnected ? "opacity-40" : ""}`}
            style={{ height: showVolume ? "160px" : "44px" }}
          >
            {showVolume && (
              <div className="w-full flex-1 relative px-3 pt-4 pb-3">
                <div className="text-[10px] text-center font-medium mb-1">{Math.round(volume * 100)}%</div>
                <div ref={barRef} className="w-1.5 mx-auto h-full bg-[var(--haru-border)]/50 rounded-full overflow-hidden relative">
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-[var(--haru-green)] rounded-full transition-all duration-75"
                    style={{ height: `${volume * 100}%` }}
                  />
                </div>
              </div>
            )}
            <div className="w-11 h-11 flex items-center justify-center shrink-0">
              {volume > 0 ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </div>
          </div>
        </div>

        {/* Stop — primary */}
        <button
          onClick={onDisconnect}
          className="w-14 h-14 flex items-center justify-center rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 active:scale-95 transition-all"
        >
          <Square className="w-5 h-5" />
        </button>

        {/* Photo — tap to show camera/gallery options */}
        <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} hidden />
        <input ref={galleryRef} type="file" accept="image/*" onChange={handlePhoto} hidden />
        <div className="relative w-11 h-11 z-20">
          <div
            className={`absolute bottom-0 left-0 w-11 rounded-full flex flex-col items-center justify-end bg-[var(--haru-brown)]/15 ${!isConnected ? "opacity-40" : ""}`}
            style={{ transition: "max-height 0.2s ease-out", maxHeight: showPhotoMenu ? "200px" : "44px", overflow: "hidden" }}
          >
            {showPhotoMenu && (
              <div className="flex flex-col gap-1.5 pt-2 pb-3">
                <button
                  onClick={() => { photoRef.current?.click(); setShowPhotoMenu(false); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--haru-brown)]/20 text-[var(--haru-brown)] active:scale-95"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { galleryRef.current?.click(); setShowPhotoMenu(false); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--haru-brown)]/20 text-[var(--haru-brown)] active:scale-95"
                >
                  <Image className="w-4 h-4" />
                </button>
              </div>
            )}
            <button
              onClick={() => setShowPhotoMenu(!showPhotoMenu)}
              disabled={!isConnected}
              className="w-11 h-11 flex items-center justify-center shrink-0 text-[var(--haru-brown)] active:scale-95"
            >
              <ImagePlus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Text toggle button */}
        <button
          onClick={toggleInput}
          disabled={!isConnected}
          className={`w-11 h-11 flex items-center justify-center rounded-full disabled:opacity-40 active:scale-95 transition-all ${
            showInput ? "opacity-0" : ""
          } ${
            inputReady
              ? "bg-[var(--haru-green)] text-white shadow-md"
              : "bg-[var(--haru-brown)]/15 text-[var(--haru-brown)]"
          }`}
        >
          <MessageSquare className="w-5 h-5" />
        </button>

        {/* Text input — absolute overlay, matches row width */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 right-0 z-10 rounded-full flex items-center overflow-hidden transition-all duration-300 ease-out ${
            showInput
              ? "bg-[var(--haru-surface)] border border-[var(--haru-border)] shadow-lg px-[7px]"
              : "pointer-events-none"
          } ${!isConnected ? "opacity-40" : ""}`}
          style={{ width: showInput ? "100%" : "0px", height: showInput ? "58px" : "44px", opacity: showInput ? 1 : 0 }}
        >
          {showInput && (
            <>
              <button
                onClick={toggleInput}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-[var(--haru-green)] text-white shrink-0 active:scale-95"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <input
                ref={inputRef}
                type="text"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("typeMessage")}
                disabled={!isConnected}
                className="flex-1 min-w-0 px-3 py-2 text-sm outline-none bg-transparent text-[var(--haru-text)] placeholder:text-[var(--haru-text-secondary)]"
              />
            </>
          )}
          <button
            onClick={showInput ? handleSend : undefined}
            disabled={!isConnected}
            className={`w-11 h-11 flex items-center justify-center rounded-full shrink-0 active:scale-95 transition-all ${
              showInput
                ? textValue.trim()
                  ? "bg-[var(--haru-green)] text-white"
                  : "bg-[var(--haru-green)]/30 text-white/50"
                : ""
            }`}
          >
            {showInput && <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
