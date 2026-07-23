/**
 * Translation resources for the Rectangle shell foundation. Keeping the first
 * language set small and explicit lets every future feature add its own typed
 * namespace without hardcoding labels in components.
 */
export const resources = {
  en: {
    translation: {
      app: {
        name: "Rectangle",
      },
      common: {
        loading: "Loading…",
        moduleNotImplemented: "This module is not implemented yet.",
      },
      feature: {
        overview: "Overview",
        projects: "Projects",
        analytics: "Analytics",
        team: "Team",
        settings: "Settings",
        profile: "Profile",
        logout: "Logout",
        unknown: "Not found",
      },
      settings: {
        languageTitle: "Language",
        english: "English",
        arabic: "Arabic",
        activeLanguage: "Current language",
      },
      shell: {
        nav: {
          main: "Main",
          primary: "Primary",
          account: "Account",
          collapse: "Collapse menu",
          expand: "Expand menu",
        },
        ai: {
          assistant: "AI Assistant",
          statusPending: "Model connection pending",
          readyTitle: "Ready for system AI",
          readyText:
            "The chat surface is prepared. Connect a real model adapter before enabling send, so Rectangle never shows fake AI answers.",
          composerLabel: "Ask Rectangle AI",
          placeholder: "Connect the model to ask about schedules, risks, documents…",
          close: "Close AI panel",
          open: "Open AI panel",
          currentPageOn: "Current page context on",
          currentPageOff: "Current page context off",
          currentPage: "Current page context",
          send: "Send",
        },
      },
    },
  },
  ar: {
    translation: {
      app: {
        name: "Rectangle",
      },
      common: {
        loading: "جارٍ التحميل…",
        moduleNotImplemented: "هذه الوحدة غير مفعّلة بعد.",
      },
      feature: {
        overview: "نظرة عامة",
        projects: "المشاريع",
        analytics: "التحليلات",
        team: "الفريق",
        settings: "الإعدادات",
        profile: "الملف الشخصي",
        logout: "تسجيل الخروج",
        unknown: "غير موجود",
      },
      settings: {
        languageTitle: "اللغة",
        english: "الإنجليزية",
        arabic: "العربية",
        activeLanguage: "اللغة الحالية",
      },
      shell: {
        nav: {
          main: "الرئيسية",
          primary: "التنقل الرئيسي",
          account: "الحساب",
          collapse: "طي القائمة",
          expand: "توسيع القائمة",
        },
        ai: {
          assistant: "مساعد الذكاء الاصطناعي",
          statusPending: "اتصال النموذج قيد الإعداد",
          readyTitle: "جاهز لذكاء النظام",
          readyText:
            "واجهة المحادثة جاهزة. اربط نموذجًا حقيقيًا قبل تفعيل الإرسال حتى لا يعرض Rectangle أي إجابات وهمية.",
          composerLabel: "اسأل ذكاء Rectangle",
          placeholder: "اربط النموذج للسؤال عن الجداول والمخاطر والمستندات…",
          close: "إغلاق لوحة الذكاء الاصطناعي",
          open: "فتح لوحة الذكاء الاصطناعي",
          currentPageOn: "سياق الصفحة الحالية مفعّل",
          currentPageOff: "سياق الصفحة الحالية غير مفعّل",
          currentPage: "سياق الصفحة الحالية",
          send: "إرسال",
        },
      },
    },
  },
} as const;

export type RectangleLanguage = keyof typeof resources;

export const supportedLanguages = Object.keys(resources) as RectangleLanguage[];

export function getDirection(language: RectangleLanguage): "ltr" | "rtl" {
  return language === "ar" ? "rtl" : "ltr";
}

export function isRectangleLanguage(value: string | null): value is RectangleLanguage {
  return value === "en" || value === "ar";
}
