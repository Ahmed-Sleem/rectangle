/**
 * Everything a person reads before they have a session.
 *
 * Signing in, claiming a new company, resetting a password, accepting an
 * invitation, confirming an email change. These six screens were the only part
 * of the product with no translation at all — every string hardcoded English —
 * which in an Arabic-first product is the worst possible place for it: they are
 * the first screens anybody sees, and the only ones a new employee sees before
 * they have an account to set a language on.
 */
import type { LocaleBundle } from "./types";

const en = {
  // Sign in
  signInTitle: "Sign in",
  signInIntro: "Use your email and password. If you added a passkey, you can use it after entering your email.",
  email: "Email",
  password: "Password",
  signIn: "Sign in",
  signingIn: "Signing in…",
  usePasskey: "Use passkey",
  checkingPasskey: "Checking…",
  forgotPassword: "Forgot your password?",
  signInFailed: "Sign in failed. Check your email and password.",
  passkeyFailed: "That passkey could not be used. Try your password.",

  // First company
  setupTitle: "Set up your company",
  setupIntro: "Create the first company workspace and owner account.",
  companyName: "Company name",
  companySlug: "Company address",
  companySlugHint: "Lowercase letters, numbers, and dashes.",
  yourName: "Your name",
  setupSubmit: "Create company",
  setupPending: "Creating…",
  setupFailed: "Setup could not be completed.",

  // Password reset — request
  resetTitle: "Reset your password",
  resetIntro: "Enter your email and we will send you a link to choose a new password.",
  resetSubmit: "Send the link",
  resetPending: "Sending…",
  resetSentTitle: "Check your email",
  resetSentMessage:
    "If that address belongs to an account, a link is on its way. It expires shortly, so use it soon.",
  backToSignIn: "Back to sign in",

  // Password reset — confirm
  resetChooseTitle: "Choose a new password",
  resetChooseIntro: "Pick something you have not used here before.",
  newPassword: "New password",
  passwordRule: "At least 12 characters, with an uppercase letter, a lowercase letter and a number.",
  passwordWeak: "That password is too easy to guess.",
  resetConfirmSubmit: "Save the new password",
  resetConfirmPending: "Saving…",
  resetConfirmFailed: "The password could not be changed.",

  // Invitation
  invitationTitle: "Set up your account",
  invitationIntro: "Choose a password and your account is ready.",
  invitationSubmit: "Finish setting up",
  invitationPending: "Setting up…",
  invitationFailed: "The account could not be set up.",

  // Links that cannot be used
  linkIncompleteTitle: "Link incomplete",
  linkIncompleteMessage: "That link is missing part of its address. Open it again from the email.",
  linkUnavailableTitle: "Link unavailable",
  linkUnavailableMessage:
    "This link has expired or has already been used. Ask for a new one and it will work.",
  invitationUnavailableTitle: "Invitation unavailable",
  invitationUnavailableMessage:
    "This invitation has expired or has already been accepted. Ask whoever invited you to send another.",

  // Email change
  emailChangeConfirmedTitle: "Email address changed",
  emailChangeConfirmedMessage: "Sign in with your new address from now on.",
  emailChangeRevertedTitle: "Email address restored",
  emailChangeRevertedMessage: "The change has been undone. Your old address works again.",
  emailChangePending: "Checking the link…",
  // Extra fields and states these four pages carry
  company: "Company",
  companyHint: "The short name in your Rectangle address.",
  resetIntroShort: "We will email you a link to choose a new one.",
  resetSendLink: "Send reset link",
  resetRequestFailed: "That request could not be sent.",
  resetTokenMissing: "This reset link is missing its token. Request a new one.",
  resetSignsOutEverywhere: "Signing in again will be required on every device.",
  confirmNewPassword: "Confirm new password",
  confirmPassword: "Confirm password",
  passwordsMustMatch: "Both passwords must match.",
  setNewPassword: "Set new password",
  passwordChangeFailed: "Your password could not be changed.",
  checkingInvitation: "Checking your invitation",
  oneMoment: "One moment…",
  activateAccount: "Activate account",
  settingUp: "Setting up…",
  accountSetupFailed: "Your account could not be set up.",
  emailTokenMissing: "This link is missing its token.",
  confirmingNewAddress: "Confirming your new address",
  restoringAddress: "Restoring your address",
  linkNoLongerValid: "This link is no longer valid.",
  emailAddressUpdated: "Email address updated",
  addressRestored: "Address restored",
  invitationLinkInvalid: "This invitation link is no longer valid. Ask an administrator to send a new one.",
  emailChangedSignedOut: "Sign in with your new address. You have been signed out everywhere else.",
  emailRevertedDisabled:
    "Your previous address is back and the account has been disabled. Ask an administrator to review it and re-enable it.",
} as const;

const ar: LocaleBundle<typeof en> = {
  signInTitle: "تسجيل الدخول",
  signInIntro: "استخدم بريدك الإلكتروني وكلمة المرور. إذا أضفت مفتاح مرور، يمكنك استخدامه بعد إدخال بريدك.",
  email: "البريد الإلكتروني",
  password: "كلمة المرور",
  signIn: "تسجيل الدخول",
  signingIn: "جارٍ تسجيل الدخول…",
  usePasskey: "استخدام مفتاح المرور",
  checkingPasskey: "جارٍ التحقق…",
  forgotPassword: "نسيت كلمة المرور؟",
  signInFailed: "تعذّر تسجيل الدخول. تحقّق من بريدك وكلمة المرور.",
  passkeyFailed: "تعذّر استخدام مفتاح المرور. جرّب كلمة المرور.",

  setupTitle: "إعداد شركتك",
  setupIntro: "أنشئ أول مساحة عمل للشركة وحساب المالك.",
  companyName: "اسم الشركة",
  companySlug: "عنوان الشركة",
  companySlugHint: "حروف إنجليزية صغيرة وأرقام وشرطات.",
  yourName: "اسمك",
  setupSubmit: "إنشاء الشركة",
  setupPending: "جارٍ الإنشاء…",
  setupFailed: "تعذّر إكمال الإعداد.",

  resetTitle: "إعادة تعيين كلمة المرور",
  resetIntro: "أدخل بريدك الإلكتروني وسنرسل لك رابطًا لاختيار كلمة مرور جديدة.",
  resetSubmit: "إرسال الرابط",
  resetPending: "جارٍ الإرسال…",
  resetSentTitle: "تحقّق من بريدك",
  resetSentMessage: "إذا كان هذا العنوان يخص حسابًا، فالرابط في طريقه إليك. صلاحيته قصيرة، فاستخدمه قريبًا.",
  backToSignIn: "العودة لتسجيل الدخول",

  resetChooseTitle: "اختر كلمة مرور جديدة",
  resetChooseIntro: "اختر كلمة لم تستخدمها هنا من قبل.",
  newPassword: "كلمة المرور الجديدة",
  passwordRule: "١٢ حرفًا على الأقل، مع حرف كبير وحرف صغير ورقم.",
  passwordWeak: "كلمة المرور هذه يسهل تخمينها.",
  resetConfirmSubmit: "حفظ كلمة المرور الجديدة",
  resetConfirmPending: "جارٍ الحفظ…",
  resetConfirmFailed: "تعذّر تغيير كلمة المرور.",

  invitationTitle: "إعداد حسابك",
  invitationIntro: "اختر كلمة مرور ويصبح حسابك جاهزًا.",
  invitationSubmit: "إنهاء الإعداد",
  invitationPending: "جارٍ الإعداد…",
  invitationFailed: "تعذّر إعداد الحساب.",

  linkIncompleteTitle: "الرابط غير مكتمل",
  linkIncompleteMessage: "ينقص هذا الرابط جزءًا من عنوانه. افتحه مرة أخرى من البريد.",
  linkUnavailableTitle: "الرابط غير صالح",
  linkUnavailableMessage: "انتهت صلاحية هذا الرابط أو تم استخدامه. اطلب رابطًا جديدًا وسيعمل.",
  invitationUnavailableTitle: "الدعوة غير متاحة",
  invitationUnavailableMessage: "انتهت صلاحية هذه الدعوة أو تم قبولها. اطلب ممن دعاك إرسال دعوة أخرى.",

  emailChangeConfirmedTitle: "تم تغيير البريد الإلكتروني",
  emailChangeConfirmedMessage: "سجّل الدخول بعنوانك الجديد من الآن.",
  emailChangeRevertedTitle: "تمت استعادة البريد الإلكتروني",
  emailChangeRevertedMessage: "تم التراجع عن التغيير. عنوانك القديم يعمل مرة أخرى.",
  emailChangePending: "جارٍ التحقق من الرابط…",
  company: "الشركة",
  companyHint: "الاسم المختصر في عنوان Rectangle الخاص بك.",
  resetIntroShort: "سنرسل إليك رابطًا لاختيار كلمة مرور جديدة.",
  resetSendLink: "إرسال رابط الاستعادة",
  resetRequestFailed: "تعذّر إرسال الطلب.",
  resetTokenMissing: "ينقص رابط الاستعادة رمزه. اطلب رابطًا جديدًا.",
  resetSignsOutEverywhere: "سيلزم تسجيل الدخول مرة أخرى على كل جهاز.",
  confirmNewPassword: "تأكيد كلمة المرور الجديدة",
  confirmPassword: "تأكيد كلمة المرور",
  passwordsMustMatch: "يجب أن تتطابق كلمتا المرور.",
  setNewPassword: "تعيين كلمة المرور",
  passwordChangeFailed: "تعذّر تغيير كلمة المرور.",
  checkingInvitation: "جارٍ التحقق من دعوتك",
  oneMoment: "لحظة واحدة…",
  activateAccount: "تفعيل الحساب",
  settingUp: "جارٍ الإعداد…",
  accountSetupFailed: "تعذّر إعداد حسابك.",
  emailTokenMissing: "ينقص هذا الرابط رمزه.",
  confirmingNewAddress: "جارٍ تأكيد عنوانك الجديد",
  restoringAddress: "جارٍ استعادة عنوانك",
  linkNoLongerValid: "لم يعد هذا الرابط صالحًا.",
  emailAddressUpdated: "تم تحديث البريد الإلكتروني",
  addressRestored: "تمت استعادة العنوان",
  invitationLinkInvalid: "لم يعد رابط الدعوة صالحًا. اطلب من المسؤول إرسال رابط جديد.",
  emailChangedSignedOut: "سجّل الدخول بعنوانك الجديد. تم إنهاء جلساتك على الأجهزة الأخرى.",
  emailRevertedDisabled:
    "عاد عنوانك السابق وتم تعطيل الحساب. اطلب من المسؤول مراجعته وإعادة تفعيله.",
};

export const auth = { en, ar };
