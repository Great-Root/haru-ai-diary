"""Generate mascot emotion images using Imagen API.

Usage: python -m scripts.generate_mascot_emotions
"""

import asyncio
import os
import sys

from google import genai
from google.genai import types

# Emoji → (filename, scene description)
EMOTION_MAP = {
    # Happy / Positive
    "😊": ("happy", "smiling warmly with rosy cheeks, eyes closed in a gentle smile"),
    "😄": ("laughing", "laughing joyfully with mouth open, sparkles around"),
    "🥰": ("love", "blushing deeply with little hearts floating around"),
    "😍": ("excited-love", "eyes turned into hearts, bouncing with excitement"),
    "🤗": ("hug", "arms wide open offering a warm hug"),
    "😁": ("grinning", "grinning ear to ear, looking proud"),
    "🥹": ("touched", "eyes glistening with happy tears, deeply moved"),

    # Sad / Down
    "😢": ("crying", "a single tear rolling down the cheek, looking sad"),
    "😭": ("sobbing", "crying with streams of tears, very emotional"),
    "😞": ("disappointed", "looking down with droopy eyes, slightly deflated"),
    "🥺": ("pleading", "puppy eyes, looking up with a quivering lip"),

    # Angry / Frustrated
    "😤": ("frustrated", "puffing steam from nose, cheeks puffed up in frustration"),
    "😠": ("angry", "frowning with furrowed brows, arms crossed"),

    # Surprised / Shocked
    "😮": ("surprised", "mouth wide open in surprise, eyes big and round"),
    "😲": ("shocked", "jaw dropped, hands on cheeks in shock"),
    "🤯": ("mind-blown", "top of head popping open with stars and sparkles coming out"),

    # Thinking / Curious
    "🤔": ("thinking", "hand on chin, looking up thoughtfully with a question mark nearby"),
    "😏": ("smirk", "one eyebrow raised with a knowing smirk"),

    # Tired / Sleepy
    "😴": ("sleepy", "eyes closed with a small sleep bubble, wearing a tiny nightcap"),
    "😫": ("exhausted", "melting down tiredly, looking completely drained"),

    # Food / Drink
    "☕": ("coffee", "happily holding a warm cup of coffee with steam rising"),
    "🍽️": ("eating", "holding chopsticks excitedly, drooling a little"),
    "🍰": ("dessert", "eyes sparkling at a slice of cake, fork in hand"),

    # Activities
    "🎵": ("music", "wearing tiny headphones, bouncing to music with music notes floating around"),
    "📚": ("reading", "wearing small glasses, deeply absorbed in a book"),
    "⚽": ("sports", "kicking a tiny soccer ball energetically"),
    "🎮": ("gaming", "holding a game controller, eyes focused and determined"),
    "✈️": ("travel", "wearing a tiny explorer hat, holding a small suitcase"),

    # Weather / Nature
    "🌸": ("spring", "surrounded by cherry blossom petals floating gently"),
    "☀️": ("sunny", "wearing tiny sunglasses, basking in sunshine"),
    "🌧️": ("rainy", "holding a small umbrella, raindrops falling around"),
    "❄️": ("winter", "wearing a tiny scarf and mittens, snowflakes falling"),

    # Social
    "👋": ("greeting", "waving hello cheerfully with a big smile"),
    "🎉": ("celebration", "wearing a tiny party hat, confetti falling around"),
    "💪": ("fighting", "flexing tiny arms, looking determined and strong"),
    "🙏": ("grateful", "hands together in gratitude, peaceful expression"),

    # Misc
    "💡": ("idea", "lightbulb glowing above head, eyes bright with inspiration"),
    "😌": ("peaceful", "eyes gently closed, floating calmly with a serene smile"),
    "🔥": ("fire", "surrounded by tiny flames, looking super motivated"),
}

BASE_PROMPT = (
    "A cute kawaii cloud character mascot in soft watercolor illustration style. "
    "The cloud is white with soft pink and blue tints, has simple dot eyes and a small mouth, "
    "tiny stubby legs, and small hands. Pastel colors, gentle brush strokes, "
    "transparent/no background. The character is {description}. "
    "Keep the style consistent: minimal, adorable, hand-drawn watercolor diary illustration."
)


async def generate_one(client: genai.Client, emoji: str, name: str, description: str, output_dir: str):
    filepath = os.path.join(output_dir, f"mascot-{name}.png")
    if os.path.exists(filepath):
        print(f"  [skip] {emoji} {name} — already exists")
        return

    prompt = BASE_PROMPT.format(description=description)
    print(f"  [gen] {emoji} {name}...")

    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=types.Content(parts=[types.Part.from_text(text=prompt)]),
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
            ),
        )

        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.data:
                with open(filepath, "wb") as f:
                    f.write(part.inline_data.data)
                print(f"  [ok] {emoji} {name} → {filepath}")
                return

        print(f"  [warn] {emoji} {name} — no image in response")
    except Exception as e:
        print(f"  [err] {emoji} {name} — {e}")


async def main():
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: Set GOOGLE_API_KEY or GEMINI_API_KEY")
        sys.exit(1)

    output_dir = os.path.join(os.path.dirname(__file__), "..", "client", "public", "mascot")
    os.makedirs(output_dir, exist_ok=True)

    client = genai.Client(api_key=api_key)

    print(f"Generating {len(EMOTION_MAP)} mascot emotion images...")
    print(f"Output: {os.path.abspath(output_dir)}\n")

    # Generate in batches of 3 to avoid rate limits
    items = list(EMOTION_MAP.items())
    batch_size = 3
    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        tasks = [
            generate_one(client, emoji, name, desc, output_dir)
            for emoji, (name, desc) in batch
        ]
        await asyncio.gather(*tasks)
        if i + batch_size < len(items):
            await asyncio.sleep(2)  # rate limit pause

    print(f"\nDone! Generated images in {os.path.abspath(output_dir)}")

    # Generate the mapping file for the client
    mapping_lines = []
    for emoji, (name, _) in EMOTION_MAP.items():
        mapping_lines.append(f'  "{emoji}": "/mascot/mascot-{name}.png",')

    mapping_ts = f"""// Auto-generated emoji → mascot image mapping
const MASCOT_EMOTIONS: Record<string, string> = {{
{chr(10).join(mapping_lines)}
}};

export function getMascotForEmotion(emoji: string): string | null {{
  return MASCOT_EMOTIONS[emoji] || null;
}}
"""
    mapping_path = os.path.join(os.path.dirname(__file__), "..", "client", "src", "utils", "mascotEmotions.ts")
    os.makedirs(os.path.dirname(mapping_path), exist_ok=True)
    with open(mapping_path, "w") as f:
        f.write(mapping_ts)
    print(f"Generated mapping: {os.path.abspath(mapping_path)}")


if __name__ == "__main__":
    asyncio.run(main())
