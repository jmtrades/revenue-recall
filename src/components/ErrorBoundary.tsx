"use client";

import { Component, type ReactNode } from "react";

/**
 * A minimal client error boundary. Wrap a risky subtree (e.g. a third-party
 * realtime widget) so that if it throws during render, the failure is CONTAINED
 * to that subtree — its siblings stay interactive — instead of the error bubbling
 * up and tearing down the whole page's interactivity. Renders `fallback` (or
 * nothing) in place of the crashed subtree.
 *
 * This exists because a crash in an embedded widget must never be able to freeze
 * the core controls around it (the Power Dialer's Call/outcome buttons sit next
 * to the live voice-agent widget; one must not take down the other).
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; onError?: (error: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Surface it for diagnostics without crashing — the boundary already
    // contained it. (console.error is picked up by the client-error reporter.)
    console.error("ErrorBoundary caught:", error);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
