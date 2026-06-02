import clsx from 'clsx';

export default function ReturnBadge({ value, label, pending = false }) {
  if (value == null) {
    return (
      <div className="text-center">
        <div className={clsx('text-xs', pending ? 'text-amber-500/80 animate-pulse' : 'text-slate-600')}>
          {pending ? '···' : '—'}
        </div>
        <div className={clsx('text-[10px] mt-0.5', pending ? 'text-amber-600/60' : 'text-slate-600')}>
          {label}
        </div>
      </div>
    );
  }

  const pct = value.toFixed(2);
  const pos = value >= 0;

  return (
    <div className="text-center">
      <div className={clsx('text-xs font-semibold', pos ? 'text-green-400' : 'text-red-400')}>
        {pos ? '+' : ''}{pct}%
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
