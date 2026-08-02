/**
 * Copy for the permission reference.
 *
 * Its own namespace, typed so Arabic cannot fall behind. Most of it is
 * explanation rather than labelling: the page exists because the access model
 * is larger than anybody holds in their head, and copy that only names things
 * would leave the reader exactly where they started.
 */
import type { LocaleBundle } from "./types";

const en = {
  rulesTitle: "Read these first",
  rulesLabel: "Rules that decide access",
  ruleStanding:
    "The company owner holds every permission without being granted any, so the table below will show them as holding nothing. Everyone else holds exactly what has been ticked for them.",
  ruleBundles:
    "A saved list of permissions grants nothing by itself. Choosing one only fills in the boxes, and the boxes are what the person actually holds.",
  ruleReach:
    "Acting on a project needs two things: being able to reach it — by being a member, or by holding “Reach every project” — and holding the permission for the action itself.",
  ruleDeletion:
    "Deleting a project is stricter than any permission. It needs the company owner, or being an owner of that project and holding “Delete projects”. Reaching every project is not enough.",
  ruleSeparation:
    "Separation of duties may forbid a combination this table shows as available. Those rules are listed in the section below.",

  standingsTitle: "Company standing",
  standingsNote: "Everyone has exactly one. It is decided before any permission is considered.",
  standingEverything: "Holds every permission",
  standingFromGrants: "Only the permissions granted to them",

  matrixTitle: "Every permission",
  matrixNote:
    "What each one allows, and who currently holds it. The company owner is not listed: they hold all of them.",
  alsoGrants: "Also grants {{permissions}}",
  nobodyHolds: "Nobody holds this",

  projectRolesTitle: "What a project role grants",
  projectRolesNote:
    "Held on one project and applying only to that project. This is how a site team runs its own work without a company-wide permission.",
  grantsNothing: "Grants nothing on its own",

  loadingTitle: "Loading the access model",
  loadingMessage: "Fetching every permission and who holds it.",
  errorTitle: "The access model could not be loaded",
  errorMessage: "Something went wrong reading the permissions.",
  tryAgain: "Try again",
} as const;

const ar: LocaleBundle<typeof en> = {
  rulesTitle: "اقرأ هذا أولًا",
  rulesLabel: "القواعد التي تحدد الصلاحية",
  ruleStanding:
    "مالك الشركة يملك كل الصلاحيات دون أن تُمنح له، لذا سيظهر في الجدول أدناه كأنه لا يملك شيئًا. وكل شخص آخر يملك ما حُدِّد له بالضبط.",
  ruleBundles:
    "القائمة المحفوظة من الصلاحيات لا تمنح شيئًا بذاتها. اختيارها يملأ الخانات فقط، والخانات هي ما يملكه الشخص فعليًا.",
  ruleReach:
    "العمل على مشروع يتطلب أمرين: القدرة على الوصول إليه — بالعضوية أو بامتلاك «الوصول إلى كل المشاريع» — وامتلاك صلاحية الإجراء نفسه.",
  ruleDeletion:
    "حذف مشروع أشد من أي صلاحية. يتطلب مالك الشركة، أو أن تكون مالكًا لذلك المشروع وتملك «حذف المشاريع». الوصول إلى كل المشاريع لا يكفي.",
  ruleSeparation:
    "قد يمنع الفصل بين المهام جمعًا يبدو في هذا الجدول متاحًا. تلك القواعد مذكورة في القسم أدناه.",

  standingsTitle: "الصفة في الشركة",
  standingsNote: "لكل شخص صفة واحدة فقط، وتُحسم قبل النظر في أي صلاحية.",
  standingEverything: "يملك كل الصلاحيات",
  standingFromGrants: "فقط الصلاحيات الممنوحة له",

  matrixTitle: "كل الصلاحيات",
  matrixNote:
    "ما تتيحه كل صلاحية، ومن يملكها حاليًا. مالك الشركة غير مذكور: هو يملكها جميعًا.",
  alsoGrants: "يمنح أيضًا {{permissions}}",
  nobodyHolds: "لا أحد يملكها",

  projectRolesTitle: "ما يمنحه دور المشروع",
  projectRolesNote:
    "يُمنح على مشروع واحد وينطبق عليه وحده. بهذا يدير فريق الموقع عمله دون صلاحية على مستوى الشركة.",
  grantsNothing: "لا يمنح شيئًا بذاته",

  loadingTitle: "جارٍ تحميل نموذج الصلاحيات",
  loadingMessage: "يتم جلب كل صلاحية ومن يملكها.",
  errorTitle: "تعذّر تحميل نموذج الصلاحيات",
  errorMessage: "حدث خطأ أثناء قراءة الصلاحيات.",
  tryAgain: "أعد المحاولة",
};

export const permissionReference = { en, ar };
