/**
 * Chooses atomic permissions without making twenty-seven checkboxes feel like
 * twenty-seven unrelated decisions.
 *
 * Every permission is one action, which is what makes least privilege possible
 * at all — but a flat list that long reads as a wall and gets skimmed, and a
 * skimmed permission screen is how somebody ends up holding more than anybody
 * intended. So the list is grouped by the thing being acted on, each group can
 * be taken as a whole, and each group says how much of it is currently on.
 *
 * The grouping is the server's, delivered with the permissions themselves,
 * rather than a second copy of the same knowledge kept in the UI.
 */
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/shared/ui";
import type { PermissionOption } from "./admin-api";
import "./PermissionPicker.css";

/** Renders the group heading in the order areas were declared server-side. */
function groupsOf(options: PermissionOption[]): Array<{ id: string; options: PermissionOption[] }> {
  const order: string[] = [];
  const byGroup = new Map<string, PermissionOption[]>();
  for (const option of options) {
    if (!byGroup.has(option.group)) {
      byGroup.set(option.group, []);
      order.push(option.group);
    }
    byGroup.get(option.group)?.push(option);
  }
  return order.map((id) => ({ id, options: byGroup.get(id) ?? [] }));
}

export function PermissionPicker({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: PermissionOption[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const groups = useMemo(() => groupsOf(options), [options]);
  /*
   * Groups the person already has something in start open, so an existing
   * user type shows what it grants without any clicking. A fresh one starts
   * closed, which is what makes the list short enough to read.
   */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const held = new Set(value);

  function isOpen(groupId: string, groupOptions: PermissionOption[]): boolean {
    const explicit = collapsed[groupId];
    if (explicit !== undefined) return !explicit;
    return groupOptions.some((option) => held.has(option.key));
  }

  function set(next: Set<string>) {
    // Emitted in the order the server declared, so two equal sets look equal.
    onChange(options.filter((option) => next.has(option.key)).map((option) => option.key));
  }

  function toggle(option: PermissionOption, checked: boolean) {
    const next = new Set(held);
    if (checked) {
      next.add(option.key);
      /*
       * Granting a write without the matching read produces a person who can
       * change a record and not see the result, which nobody means to ask for.
       * The server closes the same set; doing it here too means the screen
       * shows what is about to be saved rather than something narrower.
       */
      for (const implied of option.implies ?? []) next.add(implied);
    } else {
      next.delete(option.key);
      // Anything that implied this one has to go with it, or the set the screen
      // shows and the set the server stores drift apart.
      for (const other of options) {
        if ((other.implies ?? []).includes(option.key)) next.delete(other.key);
      }
    }
    set(next);
  }

  function toggleGroup(groupOptions: PermissionOption[], checked: boolean) {
    const next = new Set(held);
    for (const option of groupOptions) {
      if (checked) {
        next.add(option.key);
        for (const implied of option.implies ?? []) next.add(implied);
      } else {
        next.delete(option.key);
      }
    }
    set(next);
  }

  return (
    <div className="rect-permissions">
      {groups.map((group) => {
        const chosen = group.options.filter((option) => held.has(option.key)).length;
        const open = isOpen(group.id, group.options);
        return (
          <section className="rect-permissions__group" key={group.id}>
            <header className="rect-permissions__head">
              <button
                type="button"
                className="rect-permissions__disclose"
                aria-expanded={open}
                onClick={() =>
                  setCollapsed((current) => ({ ...current, [group.id]: open }))
                }
              >
                <ChevronDown
                  size={16}
                  strokeWidth={2}
                  aria-hidden
                  className={
                    open
                      ? "rect-permissions__chevron rect-permissions__chevron--open"
                      : "rect-permissions__chevron"
                  }
                />
                <span className="rect-permissions__name">{t(`team.permissionGroup_${group.id}`)}</span>
                {/* Says how much of this area is granted without opening it. */}
                <span className="rect-permissions__count">
                  {t("team.permissionGroupCount", { chosen, total: group.options.length })}
                </span>
              </button>
              <Checkbox
                label={t("team.permissionGroupAll")}
                checked={chosen === group.options.length}
                disabled={disabled}
                onChange={(event) => toggleGroup(group.options, event.currentTarget.checked)}
              />
            </header>

            {open ? (
              <div className="rect-permissions__list">
                {group.options.map((option) => (
                  <Checkbox
                    key={option.key}
                    label={option.label}
                    description={option.description}
                    checked={held.has(option.key)}
                    disabled={disabled}
                    onChange={(event) => toggle(option, event.currentTarget.checked)}
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
