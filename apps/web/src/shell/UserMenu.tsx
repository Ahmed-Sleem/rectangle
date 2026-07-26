/**
 * The signed-in person, shown on every screen.
 *
 * The panel is portalled to the document body rather than positioned inside
 * the header. `.rect-panel` and `.rect-panel__header` both create stacking
 * contexts, so a `z-index` set on a descendant is resolved *within* the
 * header and can only compete with its siblings — which is why the menu
 * appeared beneath page content no matter how high the value went. Escaping
 * to the body is the only fix that does not require unpicking the shell's
 * layering.
 *
 * Because it is portalled it cannot be positioned by CSS relative to the
 * trigger, so the trigger's rectangle is measured on open and the panel is
 * placed from that, then kept in step with scroll and resize.
 */
import { LogOut, Settings as SettingsIcon, User } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useOptionalAuth } from "@/shared/auth";
import { Avatar } from "@/shared/ui";

/** Matches the exit animation so the panel is not removed mid-transition. */
const EXIT_MS = 130;

interface Anchor {
  top: number;
  /** Distance from the viewport's trailing edge, so RTL needs no second case. */
  inlineEnd: number;
}

export function UserMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const auth = useOptionalAuth();

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const rtl = document.documentElement.dir === "rtl";
    setAnchor({
      top: rect.bottom + 8,
      // In RTL the panel hangs from the trigger's left edge instead, measured
      // from the same viewport side so one number covers both directions.
      inlineEnd: rtl ? rect.left : window.innerWidth - rect.right,
    });
  }, []);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      // Focus returns to the control that opened the menu, so a keyboard user
      // is not dropped at the top of the document.
      triggerRef.current?.focus();
    }, EXIT_MS);
  }, []);

  // Measured before paint so the panel never appears at the wrong place first.
  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    // A menu anchored to a moving trigger must move with it, or it detaches.
    function onReflow() {
      measure();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, close, measure]);

  // Rendering a menu for nobody would imply a session that does not exist.
  const name = auth?.user?.displayName;
  if (!name) return null;

  function go(path: string) {
    setOpen(false);
    setClosing(false);
    navigate(path);
  }

  const panel =
    open && anchor && typeof document !== "undefined"
      ? createPortal(
          <div
            className="rect-user-menu__panel"
            ref={panelRef}
            role="menu"
            data-state={closing ? "closed" : "open"}
            style={{ insetBlockStart: `${anchor.top}px`, insetInlineEnd: `${anchor.inlineEnd}px` }}
          >
            <span className="rect-user-menu__identity">
              <Avatar name={name} colorKey={auth?.user?.userId ?? name} />
              <span className="rect-user-menu__identity-text">
                <span className="rect-user-menu__identity-name">{name}</span>
                {auth?.user?.email ? (
                  <span className="rect-user-menu__identity-email">{auth.user.email}</span>
                ) : null}
              </span>
            </span>

            <button type="button" role="menuitem" className="rect-user-menu__item" onClick={() => go("/profile")}>
              <User size={16} strokeWidth={2} aria-hidden />
              {t("feature.profile")}
            </button>
            <button type="button" role="menuitem" className="rect-user-menu__item" onClick={() => go("/settings")}>
              <SettingsIcon size={16} strokeWidth={2} aria-hidden />
              {t("feature.settings")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="rect-user-menu__item rect-user-menu__item--danger"
              onClick={() => go("/logout")}
            >
              <LogOut size={16} strokeWidth={2} aria-hidden />
              {t("feature.logout")}
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="rect-user-menu">
      <button
        type="button"
        ref={triggerRef}
        className="rect-user-menu__trigger"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={name}
      >
        <Avatar name={name} colorKey={auth?.user?.userId ?? name} size="sm" />
        <span className="rect-user-menu__name">{name}</span>
      </button>
      {panel}
    </div>
  );
}
