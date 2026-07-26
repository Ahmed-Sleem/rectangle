/**
 * Notification types and context.
 *
 * Kept apart from the provider component so a module importing `useToast`
 * does not import React components, which keeps fast refresh working.
 */
import { createContext } from "react";

export type ToastTone = "success" | "error" | "warning" | "info";

export interface ToastOptions {
  /** Optional second line. The title alone should carry the meaning. */
  description?: string;
  /**
   * How long before it leaves, in milliseconds.
   *
   * Five seconds is the floor recommended for accessibility: shorter and a
   * screen-magnifier user cannot reach it before it goes. Longer messages get
   * longer automatically rather than requiring every caller to think about it.
   */
  durationMs?: number;
}

export interface ToastRecord extends ToastOptions {
  id: string;
  tone: ToastTone;
  title: string;
}

export interface ToastApi {
  /** Generic entry point when the tone is decided at runtime. */
  show: (tone: ToastTone, title: string, options?: ToastOptions) => string;
  success: (title: string, options?: ToastOptions) => string;
  error: (title: string, options?: ToastOptions) => string;
  warning: (title: string, options?: ToastOptions) => string;
  info: (title: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);
