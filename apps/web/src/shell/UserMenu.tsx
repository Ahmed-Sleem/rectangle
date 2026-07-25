/**
 * The signed-in person, shown on every screen.
 *
 * Rectangle displayed other people's names throughout the product while never
 * showing whose account you were actually using. This closes that: identity is
 * visible everywhere, and the routes it offers are the ones that already
 * exist — nothing is listed that does not lead somewhere real.
 */
import { LogOut, Settings as SettingsIcon, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useOptionalAuth } from "@/shared/auth";
import { Avatar } from "@/shared/ui";

export function UserMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const auth = useOptionalAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dismissed by clicking elsewhere or pressing Escape, matching every other
  // transient surface in the product.
  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Rendering a menu for nobody would be worse than rendering nothing: it
  // would imply a session that does not exist.
  const name = auth?.user?.displayName;
  if (!name) return null;

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <div className="rect-user-menu" ref={containerRef}>
      <button
        type="button"
        className="rect-user-menu__trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={name}
      >
        <Avatar name={name} size="sm" />
        <span className="rect-user-menu__name">{name}</span>
      </button>

      {open ? (
        <div className="rect-user-menu__panel" role="menu">
          <span className="rect-user-menu__identity">
            <span className="rect-user-menu__identity-name">{name}</span>
            {auth?.user?.email ? (
              <span className="rect-user-menu__identity-email">{auth.user.email}</span>
            ) : null}
          </span>
          <button type="button" role="menuitem" className="rect-user-menu__item" onClick={() => go("/profile")}>
            <User size={16} strokeWidth={2} aria-hidden />
            {t("feature.profile")}
          </button>
          <button type="button" role="menuitem" className="rect-user-menu__item" onClick={() => go("/settings")}>
            <SettingsIcon size={16} strokeWidth={2} aria-hidden />
            {t("feature.settings")}
          </button>
          <button type="button" role="menuitem" className="rect-user-menu__item" onClick={() => go("/logout")}>
            <LogOut size={16} strokeWidth={2} aria-hidden />
            {t("feature.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
