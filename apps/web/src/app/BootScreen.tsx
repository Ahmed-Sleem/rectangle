/**
 * The Rectangle boot screen.
 *
 * One component, because the product now waits in two different places and
 * both waits must look identical: once while the browser reaches a first paint,
 * and again after signing in while the shell and the first page's data settle.
 * Two copies of this would be two animations that drift apart, and the second
 * one is the one people see every single day.
 *
 * The `label` is what distinguishes them to assistive technology — the visual
 * is deliberately the same, so a person sees one continuous idea of "Rectangle
 * is getting ready" rather than two unrelated screens.
 */
import "./app-ready-gate.css";

const WORDMARK = "RECTANGLE";

export function BootScreen({ label }: { label: string }) {
  return (
    <div className="rect-boot" role="status" aria-label={label}>
      <div className="rect-boot__wordmark" aria-hidden="true">
        {WORDMARK.split("").map((letter, index) => (
          <span className="rect-boot__letter" key={`${letter}-${index}`}>
            {letter}
          </span>
        ))}
      </div>
      <p className="rect-boot__text">{label}</p>
    </div>
  );
}
