import clsx from 'clsx';

export default function ReturnBadge({ value, label }) {
  if (value == null) {
    return (
      <div className="text-center">
        <div className="text-xs text-slate-600">—</div>
        <div className="text-[10px] text-slate-600 mt-0.5">{label}</div>
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
