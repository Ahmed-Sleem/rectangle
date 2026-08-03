/**
 * What the person is looking at, described for the assistant.
 *
 * This replaced a toggle in the composer. The toggle attached the current
 * project to every message and was wrong in two ways: it spent tokens on
 * context most questions did not need, and a project was the only thing it
 * could carry — so on Tasks, Risks, Team or Settings the assistant knew nothing
 * about where the person was standing.
 *
 * Now the context travels with the request but never enters the prompt. The
 * model calls `current_screen` when a question says "this", "here" or "it", and
 * pays for the context exactly then. Everything else it might want — who they
 * are, what projects exist, what changed this week — works the same way: it
 * asks. Nothing is pushed.
 *
 * The route pattern is reported rather than the resolved path, so the assistant
 * is told "the project page" rather than a URL with an id embedded in it that
 * it might read back to somebody.
 */
import { useMatches, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { getFeatureByPath } from "@/shell/registry";
import { getLocalizedFeatureTitle, useRectangleI18n } from "@/shared/i18n";

export interface ScreenContext {
  route?: string;
  pageName?: string;
  projectId?: string;
  taskId?: string;
  riskId?: string;
}

export function useScreenContext(): ScreenContext {
  const matches = useMatches();
  const params = useParams();
  const { language } = useRectangleI18n();
  const { t } = useTranslation();

  // The deepest matched route is the page actually being shown; the ones above
  // it are layouts, which are not where anybody would say they are.
  const route = matches[matches.length - 1]?.pathname;
  const feature = route ? getFeatureByPath(route) : undefined;

  /*
   * The page's own name, in the person's language. The assistant answers in
   * their language, so telling it "Risks" when the screen says "المخاطر" would
   * have it name a page they cannot see.
   */
  const pageName = feature
    ? getLocalizedFeatureTitle(feature, language, t("feature.unknown"))
    : undefined;

  return {
    ...(route ? { route } : {}),
    ...(pageName ? { pageName } : {}),
    /*
     * Only ids that are genuinely in the URL. A stale id from a page the person
     * has navigated away from would be worse than none: the assistant would
     * confidently answer about the wrong project.
     */
    ...(params.projectId ? { projectId: params.projectId } : {}),
    ...(params.taskId ? { taskId: params.taskId } : {}),
    ...(params.riskId ? { riskId: params.riskId } : {}),
  };
}
