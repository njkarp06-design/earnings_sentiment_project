import clsx from 'clsx';

/**
 * Live indicator dot with an expanding "radar" halo — the single looping
 * heartbeat of the app. Solid dot stays put (no layout shift); a faded ring
 * scales out behind it. Set ping={false} for an idle/empty state (no halo).
 */
export default function LiveDot({
  size = 'w-1.5 h-1.5',
  color = 'bg-emerald-500',
  ping = true,
  className,
}) {
  return (
    <span className={clsx('relative inline-flex shrink-0', size, className)}>
      {ping && (
        <span
          className={clsx('absolute inset-0 rounded-full opacity-75', color)}
          style={{ animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }}
        />
      )}
      <span className={clsx('relative w-full h-full rounded-full', color)} />
    </span>
  );
}
