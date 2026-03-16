import { useRef, useEffect } from "react";

interface Props {
  className?: string;
}

export function Mascot({ className = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const sizedRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const processFrame = () => {
      if (video.paused || video.ended || document.hidden) {
        rafRef.current = requestAnimationFrame(processFrame);
        return;
      }

      // Set canvas size once
      if (!sizedRef.current && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        sizedRef.current = true;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const brightness = data[i] + data[i + 1] + data[i + 2];
        if (brightness < 40) {
          data[i + 3] = 0;
        } else if (brightness < 80) {
          data[i + 3] = ((brightness - 40) * 255 / 40) | 0;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      rafRef.current = requestAnimationFrame(processFrame);
    };

    const start = () => { rafRef.current = requestAnimationFrame(processFrame); };
    video.addEventListener("play", start);
    if (!video.paused) start();

    return () => {
      video.removeEventListener("play", start);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      <video
        ref={videoRef}
        src="/mascot-idle.webm"
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
      />
      <canvas ref={canvasRef} className="w-full h-full object-contain" />
    </div>
  );
}
