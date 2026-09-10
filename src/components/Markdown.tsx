/** Minimal Markdown renderer for the explanation text: headings, bullets, bold, paragraphs. No raw HTML. */
export default function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let list: string[] = [];
  let para: string[] = [];
  const flushList = () => { if (list.length) { blocks.push(<ul key={blocks.length} className="list-disc pl-5 space-y-1">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = []; } };
  const flushPara = () => { if (para.length) { blocks.push(<p key={blocks.length}>{inline(para.join(" "))}</p>); para = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const li = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (h) { flushList(); flushPara(); blocks.push(<h3 key={blocks.length} className="font-semibold mt-3 first:mt-0">{inline(h[2])}</h3>); }
    else if (li) { flushPara(); list.push(li[1]); }
    else if (!line.trim()) { flushList(); flushPara(); }
    else { flushList(); para.push(line.trim()); }
  }
  flushList(); flushPara();
  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>;
}

function inline(s: string): React.ReactNode[] {
  const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
}
