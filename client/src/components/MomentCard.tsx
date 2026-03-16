import { useState } from "react";
import { ChevronDown, ChevronUp, Camera } from "lucide-react";
import type { Moment } from "@/hooks/useLiveConnection";
import { t } from "@/i18n";
import { getMascotForEmotion, markMascotMissing, markMascotExists } from "@/utils/mascotEmotions";

interface Props {
  moment: Moment;
}

function MascotPlaceholder({ emotion }: { emotion: string }) {
  const mascotSrc = getMascotForEmotion(emotion);
  const [failed, setFailed] = useState(false);

  if (mascotSrc && !failed) {
    return (
      <img
        src={mascotSrc}
        alt={emotion}
        className="w-full h-full object-cover"
        onError={() => {
          markMascotMissing(mascotSrc);
          setFailed(true);
        }}
        onLoad={() => markMascotExists(mascotSrc)}
      />
    );
  }

  return (
    <div className="flex items-center justify-center w-full h-full">
      <span className="text-5xl">{emotion}</span>
    </div>
  );
}

export function MomentCard({ moment }: Props) {
  const hasImage = moment.image_url && moment.image_url.length > 0;
  const hasRefPhoto = moment.ref_photo && moment.ref_photo.length > 0;
  const [showRef, setShowRef] = useState(false);

  return (
    <div className="self-center w-[85%]">
      <div className="rounded-xl overflow-hidden shadow-md">
        {/* Image */}
        <div className="aspect-square bg-[var(--haru-card)]">
          {hasImage ? (
            <img src={moment.image_url} alt="illustration" className="w-full h-full object-cover" />
          ) : (
            <MascotPlaceholder emotion={moment.emotion || "📝"} />
          )}
        </div>

        {/* Ref photo — collapsible */}
        {hasRefPhoto && (
          <div className="bg-[var(--haru-card)] border-t border-[var(--haru-card-border)]">
            <button
              onClick={() => setShowRef(!showRef)}
              className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] text-[var(--haru-text-secondary)] active:bg-[var(--haru-border)]/30"
            >
              <Camera className="w-3 h-3" />
              {t("refPhoto")}
              {showRef ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showRef && (
              <div className="px-2 pb-2">
                <img
                  src={moment.ref_photo}
                  alt="reference"
                  className="w-full rounded-lg"
                />
              </div>
            )}
          </div>
        )}

        {/* Caption */}
        <div className="bg-[var(--haru-card)] px-3 py-2.5">
          <div className="flex items-start gap-1.5">
            {moment.emotion && <span className="text-base leading-tight">{moment.emotion}</span>}
            <p className="text-xs text-[var(--haru-text)] leading-relaxed flex-1">{moment.content}</p>
          </div>
          <div className="flex items-center justify-between mt-1">
            {moment.weather ? (
              <span className="text-[10px] text-[var(--haru-text-secondary)]">
                {moment.weather.icon} {moment.weather.temp}°
              </span>
            ) : <span />}
            {moment.time && (
              <span className="text-[10px] text-[var(--haru-text-secondary)]">{moment.time}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
