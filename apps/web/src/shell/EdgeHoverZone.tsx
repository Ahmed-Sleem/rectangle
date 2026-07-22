export function EdgeHoverZone({ onToggle }: { onToggle: () => void }) {
  return (
    <div
      className="rect-panel__edge"
      onClick={onToggle}
      role="presentation"
      aria-hidden
    />
  );
}
