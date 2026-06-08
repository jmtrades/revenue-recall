"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui";
import { assignableRoles, memberActionError, type Member } from "@/lib/members";
import type { MemberRole } from "@/lib/authz";

const ROLE_LABEL: Record<MemberRole, string> = { owner: "Owner", admin: "Admin", manager: "Manager", rep: "Rep" };

export function MembersList({ initial, viewerRole }: { initial: Member[]; viewerRole: MemberRole | null }) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManageAny = viewerRole === "owner" || viewerRole === "admin";
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const roleOptions = canManageAny && viewerRole ? assignableRoles(viewerRole) : [];

  // A row gets controls only when the viewer may act on it — the server enforces
  // the same rules, so this is purely to avoid showing no-op controls.
  function editable(m: Member): boolean {
    if (!canManageAny || !viewerRole || m.isSelf) return false;
    if (viewerRole === "admin" && m.role === "owner") return false;
    return true;
  }

  async function changeRole(m: Member, role: MemberRole) {
    if (role === m.role || !viewerRole) return;
    const reason = memberActionError({ actorRole: viewerRole, actorIsSelf: m.isSelf, targetRole: m.role, ownerCount, action: "role", newRole: role });
    if (reason) { setError(reason); return; }
    setBusyId(m.id);
    setError(null);
    const prev = members;
    setMembers((cur) => cur.map((x) => (x.id === m.id ? { ...x, role } : x)));
    try {
      const res = await fetch(`/api/members/${encodeURIComponent(m.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? "Couldn't update role");
      router.refresh();
    } catch (e) {
      setMembers(prev);
      setError(e instanceof Error ? e.message : "Couldn't update role");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(m: Member) {
    if (!viewerRole) return;
    const reason = memberActionError({ actorRole: viewerRole, actorIsSelf: m.isSelf, targetRole: m.role, ownerCount, action: "remove" });
    if (reason) { setError(reason); return; }
    if (!window.confirm(`Remove ${m.name || m.email || "this teammate"} from the workspace? They'll lose access immediately.`)) return;
    setBusyId(m.id);
    setError(null);
    const prev = members;
    setMembers((cur) => cur.filter((x) => x.id !== m.id));
    try {
      const res = await fetch(`/api/members/${encodeURIComponent(m.id)}`, { method: "DELETE" });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? "Couldn't remove member");
      router.refresh();
    } catch (e) {
      setMembers(prev);
      setError(e instanceof Error ? e.message : "Couldn't remove member");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <p className="stat-label">Members</p>
      <ul className="mt-2 divide-y divide-border">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-3">
            <Avatar name={m.name} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-fg">{m.name}</span>
                {m.isSelf && <span className="pill bg-surface-2 text-muted">You</span>}
              </div>
              <div className="truncate text-xs text-muted">{m.email ?? "—"}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {editable(m) ? (
                <>
                  <select
                    value={m.role}
                    disabled={busyId === m.id}
                    onChange={(e) => changeRole(m, e.target.value as MemberRole)}
                    aria-label={`Role for ${m.name}`}
                    className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-fg outline-none focus:border-brand disabled:opacity-50"
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => remove(m)}
                    disabled={busyId === m.id}
                    className="text-xs text-muted transition hover:text-danger disabled:opacity-50"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <span className="pill bg-surface-2 text-muted">{ROLE_LABEL[m.role]}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
