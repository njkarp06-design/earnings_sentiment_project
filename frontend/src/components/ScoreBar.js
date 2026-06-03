import clsx from 'clsx';

function barColor(score) {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 45) return 'bg-amber-500';
  return 'bg-red-500';
}

function textColor(score) {
  if (score >= 70) return 'text-emerald-400';
  if (score >= 45) return 'text-amber-400';
  return 'text-red-400';
}

export default function ScoreBar({ score }) {
  const pct = Math.min(Math.max(score ?? 0, 0), 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-500', barColor(pct))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={clsx('text-sm font-semibold font-mono w-7 text-right tabular-nums', textColor(pct))}>
        {score ?? '—'}
      </span>
    </div>
  );
}
