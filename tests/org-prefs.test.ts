import { describe, it, expect } from "vitest";
import { NOTIFICATION_OPTIONS, defaultNotificationPrefs, mergeNotificationPrefs } from "@/lib/notifications";

describe("notification preferences", () => {
  it("defaults include every option with its declared default", () => {
    const defaults = defaultNotificationPrefs();
    expect(Object.keys(defaults).sort()).toEqual(NOTIFICATION_OPTIONS.map((o) => o.key).sort());
    for (const o of NOTIFICATION_OPTIONS) expect(defaults[o.key]).toBe(o.default);
  });

  it("overlays stored values onto defaults", () => {
    const merged = mergeNotificationPrefs({ stage_change: true, daily_digest: false });
    expect(merged.stage_change).toBe(true);
    expect(merged.daily_digest).toBe(false);
    expect(merged.task_reminders).toBe(true); // untouched default
  });

  it("ignores unknown keys and non-boolean values", () => {
    const merged = mergeNotificationPrefs({ bogus: true, recall_flag: "yes" as unknown as boolean });
    expect("bogus" in merged).toBe(false);
    expect(merged.recall_flag).toBe(true); // default kept, string ignored
  });

  it("returns clean defaults for null/undefined input", () => {
    expect(mergeNotificationPrefs(null)).toEqual(defaultNotificationPrefs());
    expect(mergeNotificationPrefs(undefined)).toEqual(defaultNotificationPrefs());
  });
});
