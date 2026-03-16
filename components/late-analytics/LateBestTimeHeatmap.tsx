'use client';

type BestTimeSlot = { dayOfWeek: number; hour: number; avgEngagement: number };

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function LateBestTimeHeatmap({ bestTimes }: { bestTimes: BestTimeSlot[] }) {
  // Build a grid: dayOfWeek (0=Sun) x hour -> engagement
  const grid: Record<string, number> = {};
  let maxEng = 0;
  for (const slot of bestTimes) {
    const s = slot as Record<string, unknown>;
    const dow = s.dayOfWeek ?? s.day ?? 0;
    const hr = s.hour ?? s.time ?? 0;
    const eng = (s.avgEngagement ?? s.engagement ?? s.averageEngagement ?? 0) as number;
    const key = `${dow}-${hr}`;
    grid[key] = (grid[key] || 0) + eng;
    if (grid[key] > maxEng) maxEng = grid[key];
  }

  // Reorder: Mon=1, Tue=2, ... Sun=0
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];

  // Top 3 best times
  const sorted = Object.entries(grid).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const bestSlots = sorted.map(([key]) => {
    const [dow, h] = key.split('-').map(Number);
    const dayName = DAYS[dayOrder.indexOf(dow)];
    const hour = h > 12 ? `${h - 12}pm` : h === 0 ? '12am' : h === 12 ? '12pm' : `${h}am`;
    return `${dayName} ${hour}`;
  });

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Best Time to Post</h3>
      <div className="overflow-x-auto">
        <div className="min-w-[500px]">
          {dayOrder.map((dow, dayIdx) => (
            <div key={dow} className="flex items-center gap-1 mb-1">
              <span className="text-[10px] text-[var(--text-muted)] w-7 shrink-0">{DAYS[dayIdx]}</span>
              {HOURS.map(h => {
                const val = grid[`${dow}-${h}`] || 0;
                const intensity = maxEng > 0 ? val / maxEng : 0;
                return (
                  <div
                    key={h}
                    className="w-4 h-4 rounded-sm"
                    style={{ backgroundColor: intensity === 0 ? 'var(--bg-tertiary)' : `rgba(34, 197, 94, ${0.15 + intensity * 0.85})` }}
                    title={`${DAYS[dayIdx]} ${h}:00 - Engagement: ${val.toFixed(1)}`}
                  />
                );
              })}
            </div>
          ))}
          <div className="flex items-center gap-1 mt-1 ml-8">
            {['12am', '3am', '6am', '9am', '12pm', '3pm', '6pm', '9pm'].map(l => (
              <span key={l} className="text-[9px] text-[var(--text-muted)]" style={{ width: `${100/8}%` }}>{l}</span>
            ))}
          </div>
        </div>
      </div>
      {bestSlots.length > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>Best time:</span>
          {bestSlots.map(s => (
            <span key={s} className="rounded-md bg-[var(--bg-tertiary)] px-2 py-0.5 font-medium text-[var(--text-primary)]">{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}
