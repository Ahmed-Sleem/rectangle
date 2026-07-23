/**
 * Shared UI primitives are the production building blocks for every Rectangle
 * feature page. They centralize dense desktop sizing, accessibility semantics,
 * theme-token styling, and predictable component contracts before domain pages
 * start duplicating UI patterns.
 */
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { forwardRef } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { cn } from "@/shared/lib/cn";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn("rect-ui-button", `rect-ui-button--${variant}`, `rect-ui-button--${size}`, className)}
      {...props}
    />
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: Size;
  variant?: "plain" | "soft" | "dark";
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ className, label, size = "md", variant = "soft", type = "button", children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={props.title ?? label}
        className={cn("rect-ui-icon-button", `rect-ui-icon-button--${variant}`, `rect-ui-icon-button--${size}`, className)}
        {...props}
      >
        {children}
      </button>
    );
  },
);

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

export function Field({ label, htmlFor, hint, error, required, className, children, ...props }: FieldProps) {
  return (
    <div className={cn("rect-ui-field", className)} {...props}>
      {label ? (
        <label className="rect-ui-field__label" htmlFor={htmlFor}>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </label>
      ) : null}
      {children}
      {hint && !error ? <p className="rect-ui-field__hint">{hint}</p> : null}
      {error ? <p className="rect-ui-field__error">{error}</p> : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, "aria-invalid": ariaInvalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn("rect-ui-input", invalid && "rect-ui-input--invalid", className)}
      aria-invalid={ariaInvalid ?? invalid}
      {...props}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, "aria-invalid": ariaInvalid, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn("rect-ui-textarea", invalid && "rect-ui-input--invalid", className)}
      aria-invalid={ariaInvalid ?? invalid}
      {...props}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, "aria-invalid": ariaInvalid, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn("rect-ui-select", invalid && "rect-ui-input--invalid", className)}
      aria-invalid={ariaInvalid ?? invalid}
      {...props}
    >
      {children}
    </select>
  );
});

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, description, ...props },
  ref,
) {
  return (
    <label className={cn("rect-ui-check", className)}>
      <input ref={ref} type="checkbox" {...props} />
      <span className="rect-ui-check__body">
        <span className="rect-ui-check__label">{label}</span>
        {description ? <span className="rect-ui-check__description">{description}</span> : null}
      </span>
    </label>
  );
});

export interface SwitchProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { className, label, ...props },
  ref,
) {
  return (
    <label className={cn("rect-ui-switch", className)}>
      <input ref={ref} type="checkbox" role="switch" {...props} />
      <span className="rect-ui-switch__track" aria-hidden="true">
        <span className="rect-ui-switch__thumb" />
      </span>
      <span className="rect-ui-switch__label">{label}</span>
    </label>
  );
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return <span className={cn("rect-ui-badge", `rect-ui-badge--${tone}`, className)} {...props} />;
}

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "section" | "article" | "div";
}

export function Card({ as: Component = "section", className, ...props }: CardProps) {
  return <Component className={cn("rect-ui-card", className)} {...props} />;
}

export function Toolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rect-ui-toolbar", className)} {...props} />;
}

export function PageHeader({ className, title, eyebrow, actions, children, ...props }: HTMLAttributes<HTMLElement> & {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className={cn("rect-ui-page-header", className)} {...props}>
      <div>
        {eyebrow ? <p className="rect-ui-page-header__eyebrow">{eyebrow}</p> : null}
        <h2 className="rect-ui-page-header__title">{title}</h2>
        {children ? <div className="rect-ui-page-header__description">{children}</div> : null}
      </div>
      {actions ? <div className="rect-ui-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export interface PageGridProps extends HTMLAttributes<HTMLDivElement> {
  columns?: 1 | 2 | 3 | 4 | 6 | 12;
}

export function PageGrid({ columns = 12, className, ...props }: PageGridProps) {
  return <div className={cn("rect-ui-page-grid", `rect-ui-page-grid--${columns}`, className)} {...props} />;
}

export interface StateBlockProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  message?: string;
  action?: ReactNode;
}

function StateBlock({ className, title, message, action, children, ...props }: StateBlockProps & { children: ReactNode }) {
  return (
    <div className={cn("rect-ui-state", className)} {...props}>
      <div className="rect-ui-state__icon" aria-hidden="true">{children}</div>
      <p className="rect-ui-state__title">{title}</p>
      {message ? <p className="rect-ui-state__message">{message}</p> : null}
      {action ? <div className="rect-ui-state__action">{action}</div> : null}
    </div>
  );
}

export function EmptyState(props: StateBlockProps) {
  return <StateBlock {...props}><Info size={28} strokeWidth={1.8} /></StateBlock>;
}

export function LoadingState({ title = "Loading", message = "Please wait while the data loads.", ...props }: Partial<StateBlockProps>) {
  return <StateBlock title={title} message={message} {...props}><Loader2 className="rect-ui-state__spinner" size={28} strokeWidth={1.8} /></StateBlock>;
}

export function ErrorState(props: StateBlockProps) {
  return <StateBlock {...props}><XCircle size={28} strokeWidth={1.8} /></StateBlock>;
}

export function SuccessState(props: StateBlockProps) {
  return <StateBlock {...props}><CheckCircle2 size={28} strokeWidth={1.8} /></StateBlock>;
}

export function WarningState(props: StateBlockProps) {
  return <StateBlock {...props}><AlertTriangle size={28} strokeWidth={1.8} /></StateBlock>;
}

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  accessor: (row: Row) => ReactNode;
  align?: "start" | "center" | "end";
}

export interface DataTableProps<Row> extends HTMLAttributes<HTMLDivElement> {
  columns: Array<DataTableColumn<Row>>;
  rows: Row[];
  getRowKey: (row: Row, index: number) => string;
  emptyMessage?: string;
  caption?: string;
}

export function DataTable<Row>({ columns, rows, getRowKey, emptyMessage = "No records found.", caption, className, ...props }: DataTableProps<Row>) {
  return (
    <div className={cn("rect-ui-table-wrap", className)} {...props}>
      <table className="rect-ui-table">
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} className={cn(column.align && `rect-ui-table__cell--${column.align}`)} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? rows.map((row, index) => (
            <tr key={getRowKey(row, index)}>
              {columns.map((column) => (
                <td key={column.id} className={cn(column.align && `rect-ui-table__cell--${column.align}`)}>
                  {column.accessor(row)}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td className="rect-ui-table__empty" colSpan={columns.length}>{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export interface DrawerProps extends HTMLAttributes<HTMLElement> {
  open: boolean;
  title: string;
  onClose?: () => void;
}

export function Drawer({ open, title, onClose, className, children, ...props }: DrawerProps) {
  if (!open) return null;
  return (
    <aside className={cn("rect-ui-drawer", className)} aria-label={title} {...props}>
      <header className="rect-ui-drawer__header">
        <h3>{title}</h3>
        {onClose ? <IconButton label="Close panel" size="sm" variant="plain" onClick={onClose}>×</IconButton> : null}
      </header>
      <div className="rect-ui-drawer__body">{children}</div>
    </aside>
  );
}

export interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  title: string;
  onClose: () => void;
}

export function Modal({ open, title, onClose, className, children, ...props }: ModalProps) {
  if (!open) return null;
  return (
    <div className="rect-ui-modal-backdrop" role="presentation">
      <section className={cn("rect-ui-modal", className)} role="dialog" aria-modal="true" aria-label={title} {...props}>
        <header className="rect-ui-modal__header">
          <h3>{title}</h3>
          <IconButton label="Close dialog" size="sm" variant="plain" onClick={onClose}>×</IconButton>
        </header>
        <div className="rect-ui-modal__body">{children}</div>
      </section>
    </div>
  );
}

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  title: string;
  message?: string;
}

export function Toast({ tone = "neutral", title, message, className, ...props }: ToastProps) {
  return (
    <div className={cn("rect-ui-toast", `rect-ui-toast--${tone}`, className)} role="status" {...props}>
      <p className="rect-ui-toast__title">{title}</p>
      {message ? <p className="rect-ui-toast__message">{message}</p> : null}
    </div>
  );
}

export interface ConfirmDialogProps extends ModalProps {
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
}

export function ConfirmDialog({ confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onClose, children, ...props }: ConfirmDialogProps) {
  return (
    <Modal onClose={onClose} {...props}>
      {children}
      <Toolbar className="rect-ui-confirm__actions">
        <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>
        <Button variant="primary" onClick={onConfirm}>{confirmLabel}</Button>
      </Toolbar>
    </Modal>
  );
}
