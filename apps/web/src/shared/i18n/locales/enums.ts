/**
 * Translations for values the backend stores as stable machine keys.
 *
 * The API returns identifiers such as `on_hold`; only the interface turns them
 * into words. Translated text is never persisted, so a company can switch
 * language without touching its data.
 */
import type { LocaleBundle } from "./types";

const en = {
  projectStatus: {
    planned: "Planned",
    active: "Active",
    on_hold: "On hold",
    completed: "Completed",
    archived: "Archived",
  },
  projectSector: {
    residential: "Residential",
    commercial: "Commercial",
    infrastructure: "Infrastructure",
    industrial: "Industrial",
    healthcare: "Healthcare",
    education: "Education",
    hospitality: "Hospitality",
    mixed_use: "Mixed use",
    other: "Other",
  },
  deliveryMethod: {
    design_bid_build: "Design–bid–build",
    design_build: "Design–build",
    construction_management: "Construction management",
    epc: "EPC",
    other: "Other",
  },
  memberRole: {
    project_admin: "Project admin",
    project_manager: "Project manager",
    controls_manager: "Controls manager",
    viewer: "Viewer",
    external_collaborator: "External collaborator",
  },
  stakeholderCategory: {
    client: "Client",
    consultant: "Consultant",
    contractor: "Contractor",
    subcontractor: "Subcontractor",
    supplier: "Supplier",
    authority: "Authority",
    community: "Community",
    internal: "Internal",
    other: "Other",
  },
  level: {
    low: "Low",
    medium: "Medium",
    high: "High",
  },
  userStatus: {
    active: "Active",
    disabled: "Disabled",
  },
  /** Seeded user types. Custom types created by a company keep their own name. */
  systemUserType: {
    owner: "Owner",
    project_manager: "Project manager",
    viewer: "Viewer",
  },
  activity: {
    "project.create": "Created the project",
    "project.update": "Updated project details",
    "project.member.add": "Added a team member",
    "project.member.update": "Changed a team member's role",
    "project.member.remove": "Removed a team member",
    "project.stakeholder.create": "Added a stakeholder",
    "project.stakeholder.update": "Updated a stakeholder",
    "project.stakeholder.delete": "Removed a stakeholder",
  },
} as const;

const ar: LocaleBundle<typeof en> = {
  projectStatus: {
    planned: "مخطط",
    active: "نشط",
    on_hold: "متوقف مؤقتًا",
    completed: "مكتمل",
    archived: "مؤرشف",
  },
  projectSector: {
    residential: "سكني",
    commercial: "تجاري",
    infrastructure: "بنية تحتية",
    industrial: "صناعي",
    healthcare: "رعاية صحية",
    education: "تعليم",
    hospitality: "ضيافة",
    mixed_use: "متعدد الاستخدامات",
    other: "أخرى",
  },
  deliveryMethod: {
    design_bid_build: "تصميم – مناقصة – تنفيذ",
    design_build: "تصميم وتنفيذ",
    construction_management: "إدارة تنفيذ",
    epc: "هندسة وتوريد وإنشاء",
    other: "أخرى",
  },
  memberRole: {
    project_admin: "مسؤول المشروع",
    project_manager: "مدير المشروع",
    controls_manager: "مدير الضوابط",
    viewer: "مطالع",
    external_collaborator: "متعاون خارجي",
  },
  stakeholderCategory: {
    client: "العميل",
    consultant: "استشاري",
    contractor: "مقاول",
    subcontractor: "مقاول من الباطن",
    supplier: "مورد",
    authority: "جهة حكومية",
    community: "المجتمع المحلي",
    internal: "داخلي",
    other: "أخرى",
  },
  level: {
    low: "منخفض",
    medium: "متوسط",
    high: "مرتفع",
  },
  userStatus: {
    active: "نشط",
    disabled: "معطّل",
  },
  systemUserType: {
    owner: "المالك",
    project_manager: "مدير المشروع",
    viewer: "مطالع",
  },
  activity: {
    "project.create": "أنشأ المشروع",
    "project.update": "حدّث بيانات المشروع",
    "project.member.add": "أضاف عضوًا إلى الفريق",
    "project.member.update": "غيّر دور أحد أعضاء الفريق",
    "project.member.remove": "أزال عضوًا من الفريق",
    "project.stakeholder.create": "أضاف صاحب مصلحة",
    "project.stakeholder.update": "حدّث بيانات صاحب مصلحة",
    "project.stakeholder.delete": "أزال صاحب مصلحة",
  },
};

export const enums = { en, ar };
