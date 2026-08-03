/**
 * Marking the things the assistant did.
 *
 * The owner asked to see, in the log, that the assistant acted — "the model of
 * ahmed" rather than an entry indistinguishable from Ahmed clicking a button
 * himself. Both facts matter and neither replaces the other: the person is
 * accountable because they approved it, and the assistant is how it happened.
 *
 * Rather than thread a flag through every service method, the audit repository
 * is wrapped. When an approved proposal is being executed, this store holds the
 * tool that is running; the wrapper stamps `viaAssistant` and the tool name onto
 * whatever the underlying service writes. So `create_task` records a task
 * creation by Ahmed, marked as performed by the assistant, using the service's
 * own audit entry — not a second, parallel one that would have to be kept in
 * step with it forever.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditEventInput, AuditRepository } from "./project-service.js";

interface AssistantAction {
  tool: string;
  /** The proposal that was approved, so the entry can be traced back to it. */
  actionId: string;
}

const assistantActionStore = new AsyncLocalStorage<AssistantAction>();

/** Runs an approved tool with every audit entry inside it marked. */
export function runAsAssistant<T>(action: AssistantAction, run: () => Promise<T>): Promise<T> {
  return assistantActionStore.run(action, run);
}

/**
 * Wraps an audit repository so anything written while the assistant is acting
 * says so.
 *
 * A decorator rather than a change to each service, because the rule is "every
 * audit entry written during an assistant action is marked" — that is one rule,
 * and it belongs in one place. Twenty services remembering to add a field is
 * nineteen chances to forget.
 */
export function withAssistantAttribution(inner: AuditRepository): AuditRepository {
  return {
    async append(event: AuditEventInput): Promise<void> {
      const action = assistantActionStore.getStore();
      if (!action) return inner.append(event);

      await inner.append({
        ...event,
        metadata: {
          ...(event.metadata ?? {}),
          /*
           * The actor stays the person. They approved it, and an audit trail
           * that blamed software for a decision a human made would be worse
           * than useless in a dispute.
           */
          viaAssistant: true,
          assistantTool: action.tool,
          assistantActionId: action.actionId,
        },
      });
    },
  };
}
