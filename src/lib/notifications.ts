/**
 * Notification preference metadata. Kept free of server-only imports so both the
 * server (lib/org) and client components can use it.
 */

export type NotificationPrefs = Record<string, boolean>;

/** The notification toggles shown in Settings, with their default state. */
export const NOTIFICATION_OPTIONS = [
  { key: "lead_assigned", label: "New lead assigned to me", default: true },
  { key: "recall_flag", label: "Deal flagged by Revenue Recall", default: true },
  { key: "stage_change", label: "Deal stage changes", default: false },
  { key: "daily_digest", label: "Daily pipeline digest (email)", default: true },
  { key: "task_reminders", label: "Task reminders", default: true },
] as const;

export function defaultNotificationPrefs(): NotificationPrefs {
  return Object.fromEntries(NOTIFICATION_OPTIONS.map((o) => [o.key, o.default]));
}

/** Merge stored prefs over the defaults, ignoring unknown/invalid keys. */
export function mergeNotificationPrefs(stored?: Record<string, unknown> | null): NotificationPrefs {
  const prefs = defaultNotificationPrefs();
  if (stored) {
    for (const o of NOTIFICATION_OPTIONS) {
      if (typeof stored[o.key] === "boolean") prefs[o.key] = stored[o.key] as boolean;
    }
  }
  return prefs;
}
