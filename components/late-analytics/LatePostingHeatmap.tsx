'use client';

type Post = { publishedAt: string };

export default function LatePostingHeatmap({ posts }: { posts: Post[] }) {
  const countByDate = new Map<string, number>();
  for (const p of posts) {
    if (!p.publishedAt) continue;
    const date = new Date(p.publishedAt).toISOString().split('T')[0];
    countByDate.set(date, (countByDate.get(date) || 0) + 1);
  }

  // Generate last 30 weeks (210 days) to fill a wide grid like GetLate
  const today = new Date();
  const totalDays = 7 * 30; // 30 weeks
  const cells: { date: string; count: number; dayOfWeek: number }[] = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    cells.push({ date: dateStr, count: countByDate.get(dateStr) || 0, dayOfWeek: d.getDay() });
  }

  // Group into columns (weeks) — each column is Sun-Sat
  const weeks: typeof cells[] = [];
  let currentWeek: typeof cells = [];
  for (const cell of cells) {
    if (cell.dayOfWeek === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push(cell);
  }
  if (currentWeek.length) weeks.push(currentWeek);

  const maxCount = Math.max(...cells.map(c => c.count), 1);

  function getColor(count: number): string {
    if (count === 0) return 'var(--bg-tertiary)';
    const ratio = count / maxCount;
    if (ratio < 0.25) return 'rgba(59, 130, 246, 0.2)';
    if (ratio < 0.5) return 'rgba(59, 130, 246, 0.4)';
    if (ratio < 0.75) return 'rgba(59, 130, 246, 0.65)';
    return 'rgba(59, 130, 246, 0.9)';
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 overflow-x-auto">
      <div className="flex gap-[2px] min-w-fit">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[2px]">
            {Array.from({ length: 7 }, (_, dayIdx) => {
              const cell = week.find(c => c.dayOfWeek === dayIdx);
              return (
                <div
                  key={dayIdx}
                  className="rounded-[2px]"
                  style={{
                    width: 'clamp(10px, 2.8vw, 18px)',
                    height: 'clamp(10px, 2.8vw, 18px)',
                    backgroundColor: !cell ? 'transparent' : getColor(cell.count),
                  }}
                  title={cell ? `${cell.date}: ${cell.count} posts` : ''}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
