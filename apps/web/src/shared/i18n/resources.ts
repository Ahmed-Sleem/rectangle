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
      projects: {
        shellBadge: "UI shell",
        noFakeDataBadge: "No fake data",
        shellTitle: "Project registry foundation",
        shellDescription:
          "This page establishes the Projects experience without pretending that create, edit, or list data exists. Real project records will be enabled only after the backend, ownership checks, validation, and audit trail are wired.",
        actionsLabel: "Project actions",
        createProject: "Create project",
        createDisabledReason:
          "Create is disabled until Rectangle has a real project API, database persistence, object-level permissions, and audit logging.",
        emptyTitle: "No production project data is connected yet",
        emptyMessage:
          "Rectangle is ready to host the Projects module, but this screen intentionally shows no sample rows and no local-only project storage.",
        readinessLabel: "Projects readiness areas",
        readiness: {
          registryTitle: "Registry views",
          registryDescription: "Search, filter, sort, saved views, favorites, and project hierarchy will sit here once real data exists.",
          permissionsTitle: "Tenant ownership",
          permissionsDescription: "Every project action must verify company ownership, membership, role permissions, and safe state transitions.",
          stakeholdersTitle: "Members and stakeholders",
          stakeholdersDescription: "Project teams, consultants, contractors, client contacts, and responsibility roles need a real permissions model.",
          controlsTitle: "Status, cost, schedule, risk",
          controlsDescription: "Health rollups must come from trusted budget, schedule, issue, risk, and progress sources rather than static UI numbers.",
        },
        modelTitle: "First project data contract",
        modelDescription:
          "These are the first backend fields and validation rules to implement before enabling the Create project flow.",
        fields: {
          name: "Project name",
          code: "Project code",
          status: "Status",
          dates: "Start and finish dates",
          budget: "Budget / contract value",
        },
        fieldRules: {
          name: "Required, 2–120 characters",
          code: "Required, unique per tenant, safe characters only",
          status: "Required enum with controlled transitions",
          dates: "Optional pair; finish cannot be before start",
          budget: "Optional positive decimal with currency rules",
        },
        fieldReasons: {
          name: "Readable identity across reports and AI context",
          code: "Stable reference for integrations and document control",
          status: "Reliable portfolio filtering and lifecycle governance",
          dates: "Schedule health, delay analysis, and progress context",
          budget: "Cost control, exposure tracking, and executive rollups",
        },
        table: {
          field: "Field",
          rule: "Validation rule",
          reason: "Why it matters",
        },
        nextTitle: "Recommended next build after this shell",
        nextDescription:
          "Build the backend foundation for real Projects CRUD: API contracts, database schema, tenant ownership, validation, audit events, and tests. Then this UI can safely unlock creation and project detail routes.",
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
      projects: {
        shellBadge: "واجهة أولية",
        noFakeDataBadge: "بدون بيانات وهمية",
        shellTitle: "أساس سجل المشاريع",
        shellDescription:
          "هذه الصفحة تؤسس تجربة المشاريع من غير ادعاء وجود إنشاء أو تعديل أو بيانات قائمة. سيتم تفعيل سجلات المشاريع الحقيقية فقط بعد ربط الخلفية، وفحوصات الملكية، والتحقق، وسجل التدقيق.",
        actionsLabel: "إجراءات المشروع",
        createProject: "إنشاء مشروع",
        createDisabledReason:
          "تم تعطيل الإنشاء إلى أن يتوفر API حقيقي للمشاريع، وتخزين قاعدة بيانات، وصلاحيات على مستوى الكائن، وسجل تدقيق.",
        emptyTitle: "لا توجد بيانات مشاريع إنتاجية متصلة بعد",
        emptyMessage:
          "Rectangle جاهز لاستضافة وحدة المشاريع، لكن هذه الشاشة لا تعرض صفوفًا تجريبية ولا تخزين مشاريع محلي فقط.",
        readinessLabel: "مناطق جاهزية المشاريع",
        readiness: {
          registryTitle: "عروض السجل",
          registryDescription: "سيظهر هنا البحث والتصفية والترتيب والعروض المحفوظة والمفضلة وتسلسل المشاريع عند توفر بيانات حقيقية.",
          permissionsTitle: "ملكية المستأجر",
          permissionsDescription: "كل إجراء على المشروع يجب أن يتحقق من ملكية الشركة والعضوية والدور وانتقالات الحالة الآمنة.",
          stakeholdersTitle: "الأعضاء وأصحاب المصلحة",
          stakeholdersDescription: "فرق المشروع والاستشاريون والمقاولون وجهات العميل ومسؤولياتهم تحتاج نموذج صلاحيات حقيقي.",
          controlsTitle: "الحالة والتكلفة والجدول والمخاطر",
          controlsDescription: "ملخصات الصحة يجب أن تأتي من مصادر موثوقة للميزانية والجدول والمشكلات والمخاطر والتقدم، وليس من أرقام ثابتة في الواجهة.",
        },
        modelTitle: "عقد بيانات المشروع الأول",
        modelDescription:
          "هذه هي أول حقول الخلفية وقواعد التحقق التي يجب تنفيذها قبل تفعيل مسار إنشاء المشروع.",
        fields: {
          name: "اسم المشروع",
          code: "كود المشروع",
          status: "الحالة",
          dates: "تاريخا البدء والانتهاء",
          budget: "الميزانية / قيمة العقد",
        },
        fieldRules: {
          name: "إلزامي، من 2 إلى 120 حرفًا",
          code: "إلزامي، فريد داخل المستأجر، وحروفه آمنة فقط",
          status: "قيمة إلزامية محددة مع انتقالات حالة مضبوطة",
          dates: "زوج اختياري؛ لا يجوز أن يكون الانتهاء قبل البدء",
          budget: "رقم عشري موجب اختياري مع قواعد العملة",
        },
        fieldReasons: {
          name: "هوية واضحة في التقارير وسياق الذكاء الاصطناعي",
          code: "مرجع ثابت للتكاملات وضبط المستندات",
          status: "تصفية موثوقة للمحفظة وحوكمة دورة الحياة",
          dates: "صحة الجدول وتحليل التأخير وسياق التقدم",
          budget: "ضبط التكلفة وتتبع التعرض وملخصات الإدارة",
        },
        table: {
          field: "الحقل",
          rule: "قاعدة التحقق",
          reason: "سبب الأهمية",
        },
        nextTitle: "البناء الموصى به بعد هذه الواجهة",
        nextDescription:
          "ابنِ أساس الخلفية لعمليات المشاريع الحقيقية: عقود API، ومخطط قاعدة البيانات، وملكية المستأجر، والتحقق، وأحداث التدقيق، والاختبارات. بعدها يمكن لهذه الواجهة تفعيل الإنشاء وصفحات تفاصيل المشروع بأمان.",
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
