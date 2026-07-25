/** Public shared UI building blocks for Rectangle feature modules. */
export {
  Badge,
  Button,
  buttonClassName,
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

/** Search and filter toolbar blocks. */
export {
  FilterBar,
  FilterBarSpacer,
  FilterSelect,
  SearchField,
  type FilterBarProps,
  type FilterSelectProps,
  type SearchFieldProps,
} from "./search-field";

/** Page composition blocks: summary figures, card grid, side panel. */
export {
  AvatarGroup,
  BreakdownBar,
  CardGrid,
  SidePanel,
  StatCard,
  StatRow,
  ViewToggle,
  type AvatarGroupProps,
  type BreakdownBarProps,
  type CardGridProps,
  type SidePanelProps,
  type StatCardProps,
  type StatRowProps,
  type ViewToggleProps,
} from "./page-blocks";
