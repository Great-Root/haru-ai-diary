// Font stack: browser picks the right font per character automatically
// Korean → Nanum Pen Script, Japanese → Zen Kurenaido, Latin → Caveat
const DIARY_FONT = "'Nanum Pen Script', 'Zen Kurenaido', 'Caveat', cursive";

function parseMarkup(text: string, kp: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\*\*(.*?)\*\*|==(.*?)==/gs;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] != null) {
      nodes.push(<strong key={`${kp}b${m.index}`} className="font-bold">{parseMarkup(m[1], `${kp}b${m.index}_`)}</strong>);
    } else if (m[2] != null) {
      nodes.push(<span key={`${kp}h${m.index}`} className="rounded-sm px-0.5" style={{ backgroundColor: 'var(--haru-highlight)' }}>{parseMarkup(m[2], `${kp}h${m.index}_`)}</span>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function renderDiaryContent(content: string) {
  return content.split(/!\[.*?\]\((.*?)\)|\[image:(.*?)\]/g).map((part, i) => {
    if (i % 3 === 1 && part) {
      return <img key={i} src={part} alt="" className="w-full rounded-lg my-3" />;
    }
    if (i % 3 === 2 && part) {
      return <img key={i} src={part} alt="" className="w-full rounded-lg my-3" />;
    }
    if (!part) return null;
    return <div key={i} className="whitespace-pre-wrap diary-lines">{parseMarkup(part, `p${i}_`)}</div>;
  });
}

export function getDiaryFont() {
  return DIARY_FONT;
}
