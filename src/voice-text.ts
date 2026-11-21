export function speechParts(markdown: string, maxLength = 220) {
  const clean = markdown.replace(/\[([^\]]+)\]\(https?:[^)]+\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/\[[ИФ]\d+\]/g, '')
    .replace(/[*_#`]/g, '').replace(/^\s*(?:[-–]|\d+[.)])\s+/gm, '').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const chunks: string[] = [];
  for (const { segment } of new Intl.Segmenter('ru', { granularity: 'sentence' }).segment(clean)) {
    let rest = segment.trim();
    while (rest) {
      const firstLimit = Math.min(maxLength, 120);
      const extendFirst = chunks.length === 1 && chunks[0].length < Math.min(60, firstLimit / 2);
      const limit = !chunks.length ? firstLimit : extendFirst ? firstLimit - chunks[0].length - 1 : maxLength;
      let end = Math.min(limit, rest.length);
      if (end < rest.length) {
        const space = rest.lastIndexOf(' ', end);
        if (space > limit / 2) end = space;
      }
      const part = rest.slice(0, end).trim();
      rest = rest.slice(end).trim();
      const previous = chunks.at(-1);
      const mergedLength = (previous?.length ?? 0) + part.length + 1;
      if (previous && (extendFirst && mergedLength <= firstLimit || chunks.length > 1 && mergedLength <= maxLength)) chunks[chunks.length - 1] = `${previous} ${part}`;
      else chunks.push(part);
    }
  }
  return chunks;
}
