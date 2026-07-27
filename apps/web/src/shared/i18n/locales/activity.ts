/** The activity trail: scopes, filters, and the states the page can be in. */
import type { LocaleBundle } from "./types";

const en = {
  pageLabel: "Activity",

  scopeLabel: "Whose activity",
  scope_self: "Mine",
  scope_team: "My teams",
  scope_all: "Everyone",

  searchLabel: "Search activity",
  searchPlaceholder: "Person, action, or project",

  panelPeople: "Most active",
  panelPeopleEmpty: "Nobody has done anything in this range.",
  panelActions: "Most common",
  panelActionsEmpty: "Nothing has happened in this range.",
  panelProjects: "Busiest projects",
  panelProjectsEmpty: "No project work in this range.",
  panelAttention: "Worth a look",
  panelAttentionEmpty: "Nothing unusual in this range.",

  rangeLabel: "Date range",
  rangeToday: "Today",
  rangeWeek: "This week",
  rangeMonth: "Last 30 days",

  summaryLabel: "Activity at a glance",
  statTotal: "Events",
  statFailures: "Failed",
  statPeople: "People active",
  statBusiest: "Busiest day",
  statBusiestHint_one: "{{count}} event",
  statBusiestHint_other: "{{count}} events",

  today: "Today",
  yesterday: "Yesterday",
  dayCount_one: "{{count}} event",
  dayCount_other: "{{count}} events",

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

  searchLabel: "البحث في النشاط",
  searchPlaceholder: "شخص أو إجراء أو مشروع",

  panelPeople: "الأكثر نشاطًا",
  panelPeopleEmpty: "لم يقم أحد بأي شيء في هذا النطاق.",
  panelActions: "الأكثر تكرارًا",
  panelActionsEmpty: "لم يحدث شيء في هذا النطاق.",
  panelProjects: "المشاريع الأكثر نشاطًا",
  panelProjectsEmpty: "لا يوجد عمل على المشاريع في هذا النطاق.",
  panelAttention: "يستحق الانتباه",
  panelAttentionEmpty: "لا شيء غير معتاد في هذا النطاق.",

  rangeLabel: "النطاق الزمني",
  rangeToday: "اليوم",
  rangeWeek: "هذا الأسبوع",
  rangeMonth: "آخر 30 يومًا",

  summaryLabel: "نظرة سريعة على النشاط",
  statTotal: "الأحداث",
  statFailures: "فشل",
  statPeople: "أشخاص نشطون",
  statBusiest: "اليوم الأكثر نشاطًا",
  statBusiestHint_zero: "{{count}} حدث",
  statBusiestHint_one: "حدث واحد",
  statBusiestHint_two: "حدثان",
  statBusiestHint_few: "{{count}} أحداث",
  statBusiestHint_many: "{{count}} حدثًا",
  statBusiestHint_other: "{{count}} حدث",

  today: "اليوم",
  yesterday: "أمس",
  dayCount_zero: "{{count}} حدث",
  dayCount_one: "حدث واحد",
  dayCount_two: "حدثان",
  dayCount_few: "{{count}} أحداث",
  dayCount_many: "{{count}} حدثًا",
  dayCount_other: "{{count}} حدث",

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
