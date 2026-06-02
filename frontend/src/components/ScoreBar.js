import clsx from 'clsx';

function barColor(score) {
  if (score >= 70) return 'bg-green-500';
  if (score >= 45) return 'bg-yellow-500';
  return 'bg-red-500';
}

function textColor(score) {
  if (score >= 70) return 'text-green-400';
  if (score >= 45) return 'text-yellow-400';
  return 'text-red-400';
}

export default function ScoreBar({ score }) {
  const pct = Math.min(Math.max(score ?? 0, 0), 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-slate-700 rounded-full h-1.5 overflow-hidden">
        <div
          className={clsx('h-full rounded-full', barColor(pct))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={clsx('text-sm font-semibold w-7 text-right tabular-nums', textColor(pct))}>
        {score ?? '—'}
      </span>
    </div>
  );
}
