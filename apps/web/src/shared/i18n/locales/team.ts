/** Company team administration: user types, permissions, and people. */
import type { LocaleBundle } from "./types";

const en = {
  pageLabel: "Team administration",
  createUserType: "Create user type",
  createUserTypeDescription:
    "Group permissions into a role you can assign to people on your team.",
  createUser: "Create user",
  createUserDescription:
    "Add a person to your company and choose what they are allowed to do.",

  userTypesTitle: "User types",
  userTypeName: "Type",
  userTypeKey: "Key",
  userTypePermissions: "Permissions",
  noUserTypes: "No user types yet.",

  usersTitle: "Users",
  userName: "Name",
  userEmail: "Email",
  userTypes: "User types",
  userStatus: "Status",
  userAction: "Action",
  noUsers: "No users yet.",
  disable: "Disable",
  activate: "Activate",

  fieldName: "Name",
  fieldKey: "Key",
  fieldDescription: "Description",
  fieldPermissions: "Permissions",
  fieldEmail: "Email",
  fieldTemporaryPassword: "Temporary password",

  loadingTitle: "Loading team",
  loadingMessage: "Fetching your company's people and roles…",
  errorTitle: "Team could not be loaded",
  errorMessage: "Something went wrong while loading your team. Please try again.",
  tryAgain: "Try again",
  readOnlyTitle: "Team is managed by an administrator",
  readOnlyMessage: "Ask a company owner or admin to add people and change roles.",
  noUserTypesTitle: "No roles yet",
  noUserTypesMessage: "Create a role to describe what a group of people may do.",
  noUsersTitle: "No people yet",
  noUsersMessage: "Add the first person to your company to get started.",
  needTypeFirst: "Create a role before adding people.",
  createUserTypeFailed: "User type could not be created.",
  createUserFailed: "User could not be created.",
  updateUserFailed: "That user could not be updated.",
} as const;

const ar: LocaleBundle<typeof en> = {
  pageLabel: "إدارة الفريق",
  createUserType: "إنشاء نوع مستخدم",
  createUserTypeDescription: "اجمع الصلاحيات في دور يمكنك تعيينه لأفراد فريقك.",
  createUser: "إنشاء مستخدم",
  createUserDescription: "أضف شخصًا إلى شركتك وحدد ما يُسمح له بفعله.",

  userTypesTitle: "أنواع المستخدمين",
  userTypeName: "النوع",
  userTypeKey: "المفتاح",
  userTypePermissions: "الصلاحيات",
  noUserTypes: "لا توجد أنواع مستخدمين بعد.",

  usersTitle: "المستخدمون",
  userName: "الاسم",
  userEmail: "البريد الإلكتروني",
  userTypes: "أنواع المستخدم",
  userStatus: "الحالة",
  userAction: "إجراء",
  noUsers: "لا يوجد مستخدمون بعد.",
  disable: "تعطيل",
  activate: "تفعيل",

  fieldName: "الاسم",
  fieldKey: "المفتاح",
  fieldDescription: "الوصف",
  fieldPermissions: "الصلاحيات",
  fieldEmail: "البريد الإلكتروني",
  fieldTemporaryPassword: "كلمة مرور مؤقتة",

  loadingTitle: "جارٍ تحميل الفريق",
  loadingMessage: "جارٍ جلب أفراد شركتك وأدوارهم…",
  errorTitle: "تعذّر تحميل الفريق",
  errorMessage: "حدث خطأ أثناء تحميل الفريق. حاول مرة أخرى.",
  tryAgain: "إعادة المحاولة",
  readOnlyTitle: "يدير الفريق أحد المسؤولين",
  readOnlyMessage: "اطلب من مالك الشركة أو المسؤول إضافة الأشخاص وتغيير الأدوار.",
  noUserTypesTitle: "لا توجد أدوار بعد",
  noUserTypesMessage: "أنشئ دورًا لتحديد ما يمكن لمجموعة من الأشخاص فعله.",
  noUsersTitle: "لا يوجد أشخاص بعد",
  noUsersMessage: "أضف أول شخص إلى شركتك للبدء.",
  needTypeFirst: "أنشئ دورًا قبل إضافة الأشخاص.",
  createUserTypeFailed: "تعذّر إنشاء نوع المستخدم.",
  createUserFailed: "تعذّر إنشاء المستخدم.",
  updateUserFailed: "تعذّر تحديث هذا المستخدم.",
};

export const team = { en, ar };
