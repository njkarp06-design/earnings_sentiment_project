import clsx from 'clsx';

export default function ReturnBadge({ value, label, pending = false }) {
  if (value == null) {
    return (
      <div className="text-center">
        <div className={clsx(
          'text-sm font-mono tabular-nums',
          pending ? 'text-amber-500/80 animate-pulse' : 'text-slate-700'
        )}>
          {pending ? '···' : '—'}
        </div>
        <div className={clsx(
          'text-[10px] mt-0.5 uppercase tracking-wider',
          pending ? 'text-amber-600/60' : 'text-slate-700'
        )}>
          {label}
        </div>
      </div>
    );
  }

  const pct = value.toFixed(2);
  const pos = value >= 0;

  return (
    <div className="text-center">
      <div className={clsx(
        'text-sm font-semibold font-mono tabular-nums',
        pos ? 'text-emerald-400' : 'text-red-400'
      )}>
        {pos ? '+' : ''}{pct}%
      </div>
      <div className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  );
}
