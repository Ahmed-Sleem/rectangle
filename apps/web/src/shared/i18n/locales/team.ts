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

  createUserTypeFailed: "تعذّر إنشاء نوع المستخدم.",
  createUserFailed: "تعذّر إنشاء المستخدم.",
  updateUserFailed: "تعذّر تحديث هذا المستخدم.",
};

export const team = { en, ar };
