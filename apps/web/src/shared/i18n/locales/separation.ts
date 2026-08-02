/**
 * Copy for the separation-of-duties screen.
 *
 * Its own namespace, typed so Arabic cannot fall behind. Most of these strings
 * are doing explanatory work rather than labelling a control: almost nobody
 * arrives at this screen already knowing what the term means, and a control
 * nobody understands is one nobody switches on.
 */
import type { LocaleBundle } from "./types";

const en = {
  emptyTitle: "No pairs separated yet",
  emptyMessage:
    "Name two permissions that should never sit with the same person — deciding something and approving it, for instance. Anyone given both will be refused, with the reason you write here.",
  listLabel: "Separated permission pairs",
  and: "and",

  firstPermission: "First permission",
  secondPermission: "Second permission",
  choosePermission: "Choose a permission",
  reason: "Why these must stay apart",
  reasonHint: "Shown to whoever is refused, so it has to make the refusal arguable.",
  reasonPlaceholder: "Inventing a role and assigning it must not be one person's job.",

  check: "Check who this affects",
  checking: "Checking…",
  nobodyAffected: "Nobody currently holds both. This rule can be added safely.",
  affectedCount_one: "{{count}} person already holds both.",
  affectedCount_other: "{{count}} people already hold both.",
  affectedLabel: "People affected by this rule",
  whichToGiveUp: "Which permission should they give up?",
  whichToGiveUpHint:
    "It is taken from these people only. Nobody else is affected, and no saved list is changed.",
  chooseSide: "Choose one",
  chooseToSee: "Choose a permission above to see what they lose",
  wouldLose: "Loses {{permission}}",

  startOver: "Start over",
  declare: "Add rule",
  saving: "Adding…",
  remove: "Remove",
  removeLabel: "Remove the rule separating {{a}} and {{b}}",
  removeTitle: "Remove this rule?",
  removeMessage:
    "New assignments will stop being checked against it. Access already taken away is not given back.",

  loadingTitle: "Loading rules",
  loadingMessage: "Fetching the pairs this company has separated.",
  loadErrorTitle: "Those rules could not be loaded",
  loadErrorMessage: "Something went wrong reading the separation rules.",
  tryAgain: "Try again",
  checkFailed: "That pair could not be checked.",
  saveFailed: "That rule could not be added.",
} as const;

const ar: LocaleBundle<typeof en> = {
  emptyTitle: "لا توجد صلاحيات مفصولة بعد",
  emptyMessage:
    "حدّد صلاحيتين لا يجوز أن يجمعهما شخص واحد، مثل اتخاذ القرار واعتماده. من يُمنح الاثنتين سيُرفض، مع السبب الذي تكتبه هنا.",
  listLabel: "أزواج الصلاحيات المفصولة",
  and: "و",

  firstPermission: "الصلاحية الأولى",
  secondPermission: "الصلاحية الثانية",
  choosePermission: "اختر صلاحية",
  reason: "لماذا يجب الفصل بينهما",
  reasonHint: "يظهر لمن يُرفض طلبه، لذا يجب أن يوضّح سبب الرفض.",
  reasonPlaceholder: "إنشاء الأدوار وإسنادها لا يجوز أن يكون بيد شخص واحد.",

  check: "تحقّق ممن يتأثر",
  checking: "جارٍ التحقق…",
  nobodyAffected: "لا أحد يجمع بينهما حاليًا. يمكن إضافة القاعدة بأمان.",
  affectedCount_zero: "لا أحد يجمع بينهما.",
  affectedCount_one: "شخص واحد يجمع بينهما بالفعل.",
  affectedCount_two: "شخصان يجمعان بينهما بالفعل.",
  affectedCount_few: "{{count}} أشخاص يجمعون بينهما بالفعل.",
  affectedCount_many: "{{count}} شخصًا يجمعون بينهما بالفعل.",
  affectedCount_other: "{{count}} شخص يجمعون بينهما بالفعل.",
  affectedLabel: "الأشخاص المتأثرون بهذه القاعدة",
  whichToGiveUp: "أي صلاحية يتنازلون عنها؟",
  whichToGiveUpHint:
    "تُنزع من هؤلاء الأشخاص وحدهم. لا أحد غيرهم يتأثر، ولا تتغير أي قائمة محفوظة.",
  chooseSide: "اختر واحدة",
  chooseToSee: "اختر صلاحية أعلاه لمعرفة ما سيفقدونه",
  wouldLose: "يفقد {{permission}}",

  startOver: "ابدأ من جديد",
  declare: "أضف القاعدة",
  saving: "جارٍ الإضافة…",
  remove: "إزالة",
  removeLabel: "إزالة قاعدة الفصل بين {{a}} و{{b}}",
  removeTitle: "إزالة هذه القاعدة؟",
  removeMessage:
    "لن تُفحص الإسنادات الجديدة بموجبها. الصلاحيات التي سُحبت لا تُعاد تلقائيًا.",

  loadingTitle: "جارٍ تحميل القواعد",
  loadingMessage: "يتم جلب أزواج الصلاحيات التي فصلتها الشركة.",
  loadErrorTitle: "تعذّر تحميل القواعد",
  loadErrorMessage: "حدث خطأ أثناء قراءة قواعد الفصل.",
  tryAgain: "أعد المحاولة",
  checkFailed: "تعذّر التحقق من هذا الزوج.",
  saveFailed: "تعذّرت إضافة القاعدة.",
};

export const separation = { en, ar };
