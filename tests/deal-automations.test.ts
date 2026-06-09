import { describe, it, expect, vi, beforeEach } from "vitest";

const { createManualTask } = vi.hoisted(() => ({ createManualTask: vi.fn() }));
vi.mock("@/lib/tasks/manual", () => ({ createManualTask }));

const { getOrgSettings } = vi.hoisted(() => ({ getOrgSettings: vi.fn() }));
vi.mock("@/lib/org", () => ({ getOrgSettings }));

import { fireDealStageAutomations } from "@/lib/agent/deal-automations";
import type { Opportunity, Stage } from "@/lib/crm/types";

function opp(p: Partial<Opportunity> = {}): Opportunity {
  return { id: "o1", title: "Acme — 50 seats", pipelineId: "p", stageId: "s", value: 1000, currency: "USD", contactId: "c1", createdAt: "", updatedAt: "", ...p };
}
const won: Stage = { id: "w", label: "Won", probability: 1, type: "won" };
const lost: Stage = { id: "l", label: "Lost", probability: 0, type: "lost" };
const open: Stage = { id: "p1", label: "Proposal", probability: 0.4, type: "open" };

describe("fireDealStageAutomations", () => {
  beforeEach(() => {
    createManualTask.mockReset();
    createManualTask.mockResolvedValue({});
    getOrgSettings.mockReset();
  });

  it("creates onboarding tasks on win when won_onboarding is enabled", async () => {
    getOrgSettings.mockResolvedValue({ automations: { won_onboarding: true } });
    await fireDealStageAutomations(opp(), won);
    expect(createManualTask).toHaveBeenCalledTimes(3);
    expect(createManualTask.mock.calls[0][0]).toMatch(/Welcome & kick off/);
  });

  it("creates a 90-day win-back task on loss when lost_winback is enabled", async () => {
    getOrgSettings.mockResolvedValue({ automations: { lost_winback: true } });
    await fireDealStageAutomations(opp(), lost);
    expect(createManualTask).toHaveBeenCalledTimes(1);
    expect(createManualTask.mock.calls[0][0]).toMatch(/Win-back/);
  });

  it("creates a handoff task on an open-stage move when stage_handoff is enabled", async () => {
    getOrgSettings.mockResolvedValue({ automations: { stage_handoff: true } });
    await fireDealStageAutomations(opp(), open);
    expect(createManualTask).toHaveBeenCalledTimes(1);
    expect(createManualTask.mock.calls[0][0]).toMatch(/Next step .* now in Proposal/);
  });

  it("does nothing when the matching automation is disabled", async () => {
    getOrgSettings.mockResolvedValue({ automations: { won_onboarding: false } });
    await fireDealStageAutomations(opp(), won);
    expect(createManualTask).not.toHaveBeenCalled();
  });

  it("never throws — a task-creation failure can't block the stage move", async () => {
    getOrgSettings.mockResolvedValue({ automations: { won_onboarding: true } });
    createManualTask.mockRejectedValue(new Error("no db"));
    await expect(fireDealStageAutomations(opp(), won)).resolves.toBeUndefined();
  });

  it("no-ops without a stage", async () => {
    getOrgSettings.mockResolvedValue({ automations: { stage_handoff: true } });
    await fireDealStageAutomations(opp(), undefined);
    expect(createManualTask).not.toHaveBeenCalled();
  });
});
