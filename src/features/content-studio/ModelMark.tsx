import marks from './modelMarks.json';

// Original prototype's modelLogo/lookOf artwork and palette.
export function ModelMark({ id }: { id: string }) {
  const styles: [string, keyof typeof marks, string][] = [
    ['gemini-3-pro-image', 'pro', '#ffb15a'],
    ['gemini-3.1-flash-image', 'banana', '#d1fe17'],
    ['gemini-2.5-flash-image', 'banana', '#ffe14a'],
    ['flux', 'flame', '#ff7a3c'],
    ['qwen', 'qwen', '#5ec8ff'],
    ['grok', 'bolt', '#f4f4f5'],
    ['seedream', 'seed', '#7dffb3'],
    ['muse', 'muse', '#c4b5fd'],
    ['mai-image', 'window', '#7eb6ff'],
    ['recraft', 'pen', '#ff8ad4'],
    ['krea', 'krea', '#d1fe17'],
    ['riverflow', 'wave', '#5eead4'],
    ['hy-image', 'peak', '#fbbf24'],
    ['gpt-image', 'spark-plus', '#8fef6a'],
  ];
  const [, mark, tone] = styles.find(([part]) => id.includes(part)) || ['', 'spark', '#b7f27a'];
  return (
    <span className="content-model-logo" style={{ color: tone }} aria-hidden="true">
      <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: marks[mark as keyof typeof marks] }} />
    </span>
  );
}
