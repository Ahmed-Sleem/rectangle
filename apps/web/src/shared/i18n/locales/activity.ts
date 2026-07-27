/** The activity trail: scopes, filters, and the states the page can be in. */
import type { LocaleBundle } from "./types";

const en = {
  pageLabel: "Activity",

  scopeLabel: "Whose activity",
  scope_self: "Mine",
  scope_team: "My teams",
  scope_all: "Everyone",

  filterAction: "Filter by action",
  allActions: "All actions",
  filterResult: "Filter by outcome",
  allResults: "All outcomes",
  resultSuccess: "Succeeded",
  resultFailure: "Failed",
  clearFilters: "Clear filters",

  loadingTitle: "Loading activity",
  loadingMessage: "Fetching what has happened recently.",
  errorTitle: "Activity could not be loaded",
  errorMessage: "The record could not be reached just now. Please try again.",
  tryAgain: "Try again",

  emptyTitle: "Nothing has happened yet",
  emptyMessage: "Actions you take, and work on your projects, will appear here.",
  noMatchTitle: "No matching activity",
  noMatchMessage: "Nothing matches these filters. Try a wider range.",

  unknownActor: "Someone",
  loadMore: "Show older",
  loadingMore: "Loading…",
} as const;

const ar: LocaleBundle<typeof en> = {
  pageLabel: "النشاط",

  scopeLabel: "نشاط مَن",
  scope_self: "نشاطي",
  scope_team: "فِرقي",
  scope_all: "الجميع",

  filterAction: "تصفية حسب الإجراء",
  allActions: "كل الإجراءات",
  filterResult: "تصفية حسب النتيجة",
  allResults: "كل النتائج",
  resultSuccess: "نجح",
  resultFailure: "فشل",
  clearFilters: "مسح عوامل التصفية",

  loadingTitle: "جارٍ تحميل النشاط",
  loadingMessage: "جارٍ جلب ما حدث مؤخرًا.",
  errorTitle: "تعذّر تحميل النشاط",
  errorMessage: "تعذّر الوصول إلى السجل الآن. يرجى المحاولة مرة أخرى.",
  tryAgain: "إعادة المحاولة",

  emptyTitle: "لم يحدث شيء بعد",
  emptyMessage: "ستظهر هنا الإجراءات التي تقوم بها والعمل على مشاريعك.",
  noMatchTitle: "لا يوجد نشاط مطابق",
  noMatchMessage: "لا شيء يطابق عوامل التصفية هذه. جرّب نطاقًا أوسع.",

  unknownActor: "شخص ما",
  loadMore: "عرض الأقدم",
  loadingMore: "جارٍ التحميل…",
};

export const activity = { en, ar };
