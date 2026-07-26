/** Public shared UI building blocks for Rectangle feature modules. */
export {
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  LoadingState,
  PageGrid,
  PageHeader,
  Select,
  SuccessState,
  Switch,
  Textarea,
  Toast,
  Toolbar,
  WarningState,
  type BadgeProps,
  type ButtonProps,
  type CheckboxProps,
  type DataTableColumn,
  type DataTableProps,
  type DrawerProps,
  type FieldProps,
  type IconButtonProps,
  type InputProps,
  type PageGridProps,
  type SelectProps,
  type StateBlockProps,
  type SwitchProps,
  type TextareaProps,
  type ToastProps,
} from "./primitives";

export { buttonClassName, type ButtonSize, type ButtonVariant } from "./button-class";

export { avatarTint, initialsOf, AVATAR_TINT_COUNT } from "./initials";

/** Grounded AI advice. Sources are required, so an uncited claim cannot render. */
export {
  InsightBanner,
  type InsightBannerProps,
  type InsightSource,
  type InsightState,
} from "./insight-banner";

/** Centralised notifications. One provider at the root; `useToast` anywhere. */
export {
  ToastProvider,
  useToast,
  type ToastApi,
  type ToastOptions,
  type ToastRecord,
  type ToastTone,
} from "./toast";

/**
 * The window system. Every overlay in the product must come from here so
 * sizing, focus handling, dismissal and backdrop behaviour stay identical.
 */
export {
  ConfirmDialog,
  FormDialog,
  Overlay,
  type ConfirmDialogProps,
  type FormDialogProps,
  type OverlayProps,
  type OverlaySize,
} from "./overlay";

/** Configuration building blocks, reusable by any page. */
export {
  ChoiceGroup,
  SettingRow,
  SettingsSection,
  SettingsStack,
  type ChoiceGroupProps,
  type ChoiceOption,
  type SettingRowProps,
  type SettingsSectionProps,
} from "./settings-blocks";

/** The shared page toolbar: search, filters, actions, view toggle. */
export {
  PageToolbar,
  type PageToolbarProps,
  type SelectFilter,
  type SelectFilterOption,
  type ToggleFilter,
  type ToolbarFilter,
  type ToolbarSearch,
  type ToolbarView,
} from "./page-toolbar";


/** Page composition blocks: summary figures, card grid, side panel. */
export {
  Avatar,
  AvatarGroup,
  BreakdownBar,
  CardGrid,
  ProgressBar,
  SidePanel,
  StatCard,
  StatRow,
  ViewToggle,
  type AvatarGroupProps,
  type AvatarProps,
  type BreakdownBarProps,
  type CardGridProps,
  type ProgressBarProps,
  type SidePanelProps,
  type StatCardProps,
  type StatRowProps,
  type ViewToggleProps,
} from "./page-blocks";
