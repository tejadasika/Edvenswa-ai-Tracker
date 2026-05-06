export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-zinc-500 border-t-transparent ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="flex items-center gap-3 text-fg-muted text-sm">
        <Spinner size={20} />
        <span>{label}</span>
      </div>
    </div>
  );
}
