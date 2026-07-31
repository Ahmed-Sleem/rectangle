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
    "A company owner or administrator holds every permission, whatever user types they are given. The table below will show them as holding nothing.",
  ruleGuest:
    "A guest is refused every company-wide permission, whatever user types they are given. They reach only the projects they were added to.",
  ruleReach:
    "Acting on a project needs two things: being able to reach it — by being a member, or by holding “Reach every project” — and holding the permission for the action itself.",
  ruleDeletion:
    "Deleting a project is stricter than any permission. It needs a company owner or administrator, or being the project administrator of that project and holding “Delete projects”. Reaching every project is not enough.",
  ruleSeparation:
    "Separation of duties may forbid a combination this table shows as available. Those rules are listed in the section below.",

  standingsTitle: "Company standing",
  standingsNote: "Everyone has exactly one. It is decided before any user type is considered.",
  standingEverything: "Holds every permission",
  standingGuest: "Refused every company-wide permission",
  standingFromTypes: "Access comes from their user types",

  matrixTitle: "Every permission",
  matrixNote:
    "What each one allows, and which user types grant it. Owners and administrators are not listed: they hold all of them.",
  alsoGrants: "Also grants {{permissions}}",
  nobodyHolds: "No user type grants this",

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
    "مالك الشركة أو المسؤول يملك كل الصلاحيات مهما كانت أنواع المستخدم الممنوحة له. الجدول أدناه سيظهرهما كأنهما لا يملكان شيئًا.",
  ruleGuest:
    "الضيف تُرفض له كل الصلاحيات على مستوى الشركة مهما مُنح من أنواع المستخدم. لا يصل إلا إلى المشاريع التي أُضيف إليها.",
  ruleReach:
    "العمل على مشروع يتطلب أمرين: القدرة على الوصول إليه — بالعضوية أو بامتلاك «الوصول إلى كل المشاريع» — وامتلاك صلاحية الإجراء نفسه.",
  ruleDeletion:
    "حذف مشروع أشد من أي صلاحية. يتطلب مالكًا أو مسؤولًا للشركة، أو أن تكون مسؤول ذلك المشروع وتملك «حذف المشاريع». الوصول إلى كل المشاريع لا يكفي.",
  ruleSeparation:
    "قد يمنع الفصل بين المهام جمعًا يبدو في هذا الجدول متاحًا. تلك القواعد مذكورة في القسم أدناه.",

  standingsTitle: "الصفة في الشركة",
  standingsNote: "لكل شخص صفة واحدة فقط، وتُحسم قبل النظر في أي نوع مستخدم.",
  standingEverything: "يملك كل الصلاحيات",
  standingGuest: "تُرفض له كل صلاحيات الشركة",
  standingFromTypes: "صلاحياته تأتي من أنواع المستخدم",

  matrixTitle: "كل الصلاحيات",
  matrixNote:
    "ما تتيحه كل صلاحية، وأي أنواع المستخدم تمنحها. المالك والمسؤول غير مذكورين: هما يملكانها جميعًا.",
  alsoGrants: "يمنح أيضًا {{permissions}}",
  nobodyHolds: "لا يمنحها أي نوع مستخدم",

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
