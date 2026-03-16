// Emoji → mascot image mapping
// Falls back to null (show emoji) if no mascot image exists
const MASCOT_EMOTIONS: Record<string, string> = {
  "😊": "/mascot/mascot-happy.webp",
  "😄": "/mascot/mascot-laughing.webp",
  "🥰": "/mascot/mascot-love.webp",
  "😍": "/mascot/mascot-excited-love.webp",
  "🤗": "/mascot/mascot-hug.webp",
  "😁": "/mascot/mascot-grinning.webp",
  "🥹": "/mascot/mascot-touched.webp",
  "😢": "/mascot/mascot-crying.webp",
  "😭": "/mascot/mascot-sobbing.webp",
  "😞": "/mascot/mascot-disappointed.webp",
  "🥺": "/mascot/mascot-pleading.webp",
  "😤": "/mascot/mascot-frustrated.webp",
  "😠": "/mascot/mascot-angry.webp",
  "😮": "/mascot/mascot-surprised.webp",
  "😲": "/mascot/mascot-shocked.webp",
  "🤯": "/mascot/mascot-mind-blown.webp",
  "🤔": "/mascot/mascot-thinking.webp",
  "😏": "/mascot/mascot-smirk.webp",
  "😴": "/mascot/mascot-sleepy.webp",
  "😫": "/mascot/mascot-exhausted.webp",
  "☕": "/mascot/mascot-coffee.webp",
  "🍽️": "/mascot/mascot-eating.webp",
  "🍰": "/mascot/mascot-dessert.webp",
  "🎵": "/mascot/mascot-music.webp",
  "📚": "/mascot/mascot-reading.webp",
  "⚽": "/mascot/mascot-sports.webp",
  "🎮": "/mascot/mascot-gaming.webp",
  "✈️": "/mascot/mascot-travel.webp",
  "🌸": "/mascot/mascot-spring.webp",
  "☀️": "/mascot/mascot-sunny.webp",
  "🌧️": "/mascot/mascot-rainy.webp",
  "❄️": "/mascot/mascot-winter.webp",
  "👋": "/mascot/mascot-greeting.webp",
  "🎉": "/mascot/mascot-celebration.webp",
  "💪": "/mascot/mascot-fighting.webp",
  "🙏": "/mascot/mascot-grateful.webp",
  "💡": "/mascot/mascot-idea.webp",
  "😌": "/mascot/mascot-peaceful.webp",
  "🔥": "/mascot/mascot-fire.webp",
};

// Cache for checking which images actually exist
const imageCache = new Map<string, boolean>();

export function getMascotForEmotion(emoji: string): string | null {
  const path = MASCOT_EMOTIONS[emoji];
  if (!path) return null;

  // If we already know it doesn't exist, skip
  if (imageCache.has(path)) {
    return imageCache.get(path) ? path : null;
  }

  return path;
}

export function markMascotMissing(path: string) {
  imageCache.set(path, false);
}

export function markMascotExists(path: string) {
  imageCache.set(path, true);
}
