import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ProgressiveAnswer({ text, live, onReveal }: { text: string; live: boolean; onReveal: () => void }) {
  const [shown, setShown] = useState(live ? '' : text);
  const rendered = useRef(shown);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!live || reduced) { rendered.current = text; setShown(text); return; }
    if (!text.startsWith(rendered.current)) { rendered.current = ''; setShown(''); }
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = now - previous;
      if (elapsed < 12) { frame = requestAnimationFrame(tick); return; }
      previous = now;
      const remaining = text.length - rendered.current.length;
      if (remaining <= 0) return;
      const speed = Math.min(480, 100 + remaining / 12);
      let count = rendered.current.length + Math.max(1, Math.round(speed * Math.min(elapsed, 48) / 1000));
      if (count < text.length && /[\uD800-\uDBFF]/.test(text[count - 1])) count++;
      rendered.current = text.slice(0, count);
      setShown(rendered.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, live, reduced]);
  useEffect(onReveal, [shown]);
  return <div className="chat-answer" aria-live="off" aria-busy={shown.length < text.length}><Markdown skipHtml remarkPlugins={[remarkGfm]}>{shown}</Markdown></div>;
}
