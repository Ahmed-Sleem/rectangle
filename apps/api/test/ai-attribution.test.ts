/**
 * "In the log we see the model of Ahmed."
 *
 * The owner's requirement was that an action carried out by the assistant is
 * distinguishable from the same action typed by hand — while still being
 * attributed to the person, because they approved it and they are accountable
 * for it. Both facts, not one.
 */
import { describe, expect, it } from "vitest";
import { runAsAssistant, withAssistantAttribution } from "../src/application/ai-attribution.js";
import type { AuditEventInput, AuditRepository } from "../src/application/project-service.js";

function recorder(): AuditRepository & { events: AuditEventInput[] } {
  const events: AuditEventInput[] = [];
  return { events, async append(event) { events.push(event); } };
}

const entry: AuditEventInput = {
  tenantId: "t1",
  actorUserId: "u1",
  action: "task.create",
  entityType: "task",
  entityId: "task-1",
  result: "success",
  metadata: { title: "Pour the slab" },
};

describe("attributing what the assistant did", () => {
  it("marks entries written while an approved action runs", async () => {
    const inner = recorder();
    const audit = withAssistantAttribution(inner);

    await runAsAssistant({ tool: "create_task", actionId: "act-1" }, async () => {
      await audit.append(entry);
    });

    expect(inner.events[0]?.metadata).toMatchObject({
      viaAssistant: true,
      assistantTool: "create_task",
      assistantActionId: "act-1",
      // What the service itself recorded survives untouched.
      title: "Pour the slab",
    });
  });

  /*
   * The person stays the actor. An audit trail that blamed software for a
   * decision a human approved would be worse than useless in a dispute.
   */
  it("keeps the person as the actor", async () => {
    const inner = recorder();
    const audit = withAssistantAttribution(inner);

    await runAsAssistant({ tool: "create_task", actionId: "act-1" }, async () => {
      await audit.append(entry);
    });

    expect(inner.events[0]?.actorUserId).toBe("u1");
  });

  it("leaves ordinary entries exactly as they were", async () => {
    const inner = recorder();
    const audit = withAssistantAttribution(inner);

    await audit.append(entry);

    expect(inner.events[0]?.metadata).toEqual({ title: "Pour the slab" });
    expect(inner.events[0]?.metadata).not.toHaveProperty("viaAssistant");
  });

  /*
   * The marking must not leak past the action it belongs to. These run in the
   * same process and the store is module-level, so a scope that failed to end
   * would silently stamp every later write in the application.
   */
  it("stops marking once the action is finished", async () => {
    const inner = recorder();
    const audit = withAssistantAttribution(inner);

    await runAsAssistant({ tool: "create_task", actionId: "act-1" }, async () => {
      await audit.append(entry);
    });
    await audit.append(entry);

    expect(inner.events[0]?.metadata).toHaveProperty("viaAssistant");
    expect(inner.events[1]?.metadata).not.toHaveProperty("viaAssistant");
  });

  it("stops marking even when the action throws", async () => {
    const inner = recorder();
    const audit = withAssistantAttribution(inner);

    await expect(
      runAsAssistant({ tool: "delete_task", actionId: "act-2" }, async () => {
        throw new Error("the service refused");
      }),
    ).rejects.toThrow();

    await audit.append(entry);
    expect(inner.events[0]?.metadata).not.toHaveProperty("viaAssistant");
  });
});
