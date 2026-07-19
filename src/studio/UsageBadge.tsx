export function UsageBadge({ label = "Total uses", count }: { label?: string; count?: number }) {
  return (
    <div className="usage-counter compact-usage">
      <span>{label}</span>
      <strong>{count === undefined ? "…" : count.toLocaleString()}</strong>
      <small>{count === undefined ? "syncing securely" : "verified total uses"}</small>
    </div>
  );
}
