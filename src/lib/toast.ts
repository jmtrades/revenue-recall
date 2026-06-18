/**
 * Fire-and-forget transient toasts. Decoupled via a window CustomEvent (the same
 * pattern as rr:quick-create) so ANY client component can confirm a mutation
 * without a context provider or prop-drilling. The single <Toaster /> mounted in
 * the (app) layout renders them. No-op on the server.
 */
export type ToastTone = "success" | "error" | "info";
export interface ToastDetail {
  message: string;
  tone: ToastTone;
}

export function toast(message: string, tone: ToastTone = "success"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastDetail>("rr:toast", { detail: { message, tone } }));
}
