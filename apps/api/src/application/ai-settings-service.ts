/**
 * Where the assistant's provider and keys are kept.
 *
 * Separate from the assistant itself because they are different concerns with
 * different authority: configuring the company's provider is an administrative
 * act needing `settings.manage`, while using the assistant needs only
 * `ai.use`. Folding them together would mean every person who may ask a
 * question also holds the machinery for changing what everybody's questions
 * are sent to.
 *
 * Keys are write-only across every boundary. They are encrypted with the same
 * envelope as the SMTP password — one implementation of secret storage, so a
 * change to how secrets are held moves both — and the API answers only whether
 * a key exists. Nothing that reaches the browser can be decrypted, and nothing
 * in a log or an error can be either.
 */
import {
  aiSettingsInputSchema,
  AI_CYCLE_BOUNDS,
  aiUserProviderInputSchema,
  type AiSettingsInput,
  type AiUserProviderInput,
} from "../domain/ai.js";
import { requirePermission, type UserPrincipal } from "../domain/auth.js";
import { DomainError } from "../domain/errors.js";
import { decryptSecret, encryptSecret } from "../infrastructure/secret-crypto.js";
import type { AuditRepository } from "./project-service.js";

export interface AiSettingsRecord {
  /** Reasoning steps allowed per question. */
  maxCycles?: number;
  baseUrl: string;
  model: string;
  encryptedApiKey: string | null;
  enabled: boolean;
  updatedAt: string;
}

/** What a browser is allowed to know: everything except the key itself. */
export interface PublicAiSettings {
  configured: boolean;
  enabled: boolean;
  baseUrl?: string;
  model?: string;
  /** Whether a company key is saved. Never the key. */
  hasCompanyKey: boolean;
  /** Whether *this* person has saved one of their own. */
  hasPersonalKey: boolean;
  /** This person's own endpoint, when they have chosen one. */
  personalBaseUrl?: string;
  /** This person's own model, when they have chosen one. */
  personalModel?: string;
  /** What their questions actually go to, once overrides are applied. */
  effectiveBaseUrl?: string;
  effectiveModel?: string;
  /** Whether asking a question would work right now, for this person. */
  ready: boolean;
  /** Reasoning steps per question, so an owner can see and change it. */
  maxCycles: number;
  updatedAt?: string;
}

/** What a person has chosen for themselves. Null fields follow the company. */
export interface AiUserProviderRecord {
  baseUrl: string | null;
  model: string | null;
  encryptedApiKey: string | null;
}

export interface AiSettingsRepository {
  get(tenantId: string): Promise<AiSettingsRecord | null>;
  upsert(
    tenantId: string,
    input: {
      baseUrl: string;
      model: string;
      /** Absent keeps the saved budget rather than resetting it. */
      maxCycles?: number;
      encryptedApiKey: string | null;
      enabled: boolean;
      updatedByUserId: string;
    },
  ): Promise<AiSettingsRecord>;
  /** A person's overrides. Any field may be null, meaning "follow the company". */
  getUserProvider(tenantId: string, userId: string): Promise<AiUserProviderRecord | null>;
  /** Writes only the fields present; the others keep whatever they held. */
  saveUserProvider(
    tenantId: string,
    userId: string,
    input: { baseUrl?: string; model?: string; encryptedApiKey?: string },
  ): Promise<void>;
  deleteUserProvider(tenantId: string, userId: string): Promise<boolean>;
}

/** Everything the harness needs to call a provider, decrypted at the last moment. */
export interface ResolvedAiProvider {
  /** The reasoning budget this company chose. */
  maxCycles?: number;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export class AiSettingsService {
  constructor(
    private readonly repository: AiSettingsRepository,
    private readonly audit: AuditRepository,
  ) {}

  async getSettings(actor: UserPrincipal): Promise<PublicAiSettings> {
    /*
     * `ai.use`, not `settings.manage`. Somebody who may use the assistant has
     * to be able to see whether it is switched on and whether their own key is
     * saved — otherwise a panel that does not work has nothing to explain
     * itself with. The key is not in this response, so reading it discloses
     * nothing an ordinary user should not know.
     */
    requirePermission(actor, "ai.use");

    const record = await this.repository.get(actor.tenantId);
    const personal = await this.repository.getUserProvider(actor.tenantId, actor.userId);
    const hasCompanyKey = Boolean(record?.encryptedApiKey);
    const hasPersonalKey = Boolean(personal?.encryptedApiKey);

    /*
     * What this person's questions would actually be sent to, after the
     * overrides are applied. Reported rather than left for the screen to work
     * out: the fallback happens field by field in `resolveProvider`, and a
     * second implementation of that in the browser is a second answer waiting
     * to disagree with the first.
     */
    const effectiveBaseUrl = personal?.baseUrl ?? record?.baseUrl;
    const effectiveModel = personal?.model ?? record?.model;

    if (!record) {
      return {
        configured: false,
        enabled: false,
        hasCompanyKey,
        hasPersonalKey,
        ready: false,
        maxCycles: AI_CYCLE_BOUNDS.default,
        ...(personal?.baseUrl ? { personalBaseUrl: personal.baseUrl } : {}),
        ...(personal?.model ? { personalModel: personal.model } : {}),
      };
    }

    return {
      configured: true,
      enabled: record.enabled,
      baseUrl: record.baseUrl,
      model: record.model,
      hasCompanyKey,
      hasPersonalKey,
      ...(personal?.baseUrl ? { personalBaseUrl: personal.baseUrl } : {}),
      ...(personal?.model ? { personalModel: personal.model } : {}),
      ...(effectiveBaseUrl ? { effectiveBaseUrl } : {}),
      ...(effectiveModel ? { effectiveModel } : {}),
      maxCycles: record.maxCycles ?? AI_CYCLE_BOUNDS.default,
      // Enabled is not the same as usable: a company can switch it on and have
      // nobody able to use it because no key was ever saved.
      ready: record.enabled && (hasCompanyKey || hasPersonalKey),
      updatedAt: record.updatedAt,
    };
  }

  async saveSettings(actor: UserPrincipal, rawInput: unknown): Promise<PublicAiSettings> {
    requirePermission(actor, "settings.manage");

    const parsed = aiSettingsInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new DomainError("VALIDATION_FAILED", "Assistant settings are not valid.");
    }
    const input: AiSettingsInput = parsed.data;

    /*
     * An absent key means "leave the saved one alone", which is what lets
     * somebody change the model without re-typing a secret they cannot see.
     * The schema refuses an empty string, so "clear it" cannot happen by
     * accident — switching the assistant off is the way to stop it being used.
     */
    const existing = await this.repository.get(actor.tenantId);
    const encryptedApiKey = input.apiKey
      ? encryptSecret(input.apiKey)
      : (existing?.encryptedApiKey ?? null);

    const record = await this.repository.upsert(actor.tenantId, {
      baseUrl: input.baseUrl,
      model: input.model,
      ...(input.maxCycles === undefined ? {} : { maxCycles: input.maxCycles }),
      encryptedApiKey,
      enabled: input.enabled,
      updatedByUserId: actor.userId,
    });

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ai.settings.update",
      entityType: "ai_settings",
      entityId: actor.tenantId,
      result: "success",
      // The endpoint and model are configuration worth recording. The key is
      // never written anywhere it could be read back, including here.
      metadata: {
        baseUrl: input.baseUrl,
        model: input.model,
        enabled: input.enabled,
        keyChanged: Boolean(input.apiKey),
        ...(input.maxCycles === undefined ? {} : { maxCycles: input.maxCycles }),
      },
    });

    /*
     * Read back through the same method the screen uses, rather than assembled
     * a second time here. The response after saving and the response on the
     * next page load are now literally the same computation, so they cannot
     * disagree about what is configured — which they would the moment somebody
     * added a field to one and forgot the other.
     */
    return this.getSettings(actor);
  }

  /**
   * A person's own provider: any of endpoint, model and key.
   *
   * Every field is optional and only what is sent is written, so setting a
   * model does not silently clear a key that was saved last week. Sending
   * nothing at all is refused rather than treated as "clear everything":
   * removing an override is what `deleteMyProvider` is for, and guessing which
   * of the two an empty request meant would eventually guess wrong.
   */
  async saveMyProvider(
    actor: UserPrincipal,
    rawInput: unknown,
  ): Promise<PublicAiSettings> {
    requirePermission(actor, "ai.use");

    const parsed = aiUserProviderInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new DomainError("VALIDATION_FAILED", "Those assistant settings are not valid.");
    }
    const input: AiUserProviderInput = parsed.data;

    if (!input.baseUrl && !input.model && !input.apiKey) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "Choose an endpoint, a model or a key. Nothing was set.",
      );
    }

    await this.repository.saveUserProvider(actor.tenantId, actor.userId, {
      ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.apiKey ? { encryptedApiKey: encryptSecret(input.apiKey) } : {}),
    });

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ai.user_provider.update",
      entityType: "ai_user_key",
      entityId: actor.userId,
      result: "success",
      // The choices are worth recording. The key never is, anywhere.
      metadata: {
        baseUrlChanged: Boolean(input.baseUrl),
        modelChanged: Boolean(input.model),
        keyChanged: Boolean(input.apiKey),
      },
    });

    return this.getSettings(actor);
  }

  /** Removes every personal override, so this person follows the company again. */
  async deleteMyProvider(actor: UserPrincipal): Promise<PublicAiSettings> {
    requirePermission(actor, "ai.use");

    const removed = await this.repository.deleteUserProvider(actor.tenantId, actor.userId);
    if (removed) {
      await this.audit.append({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "ai.user_provider.delete",
        entityType: "ai_user_key",
        entityId: actor.userId,
        result: "success",
      });
    }

    // Idempotent: removing an override that is not there is a request that has
    // already been satisfied, not a failure worth showing somebody.
    return this.getSettings(actor);
  }

  /**
   * The provider to call for this person, or a refusal explaining what is
   * missing.
   *
   * Decryption happens here and nowhere else, at the last moment before a
   * request is made. A personal key wins over the company's: somebody who has
   * gone to the trouble of adding their own means their usage to be theirs.
   */
  async resolveProvider(actor: UserPrincipal): Promise<ResolvedAiProvider> {
    const record = await this.repository.get(actor.tenantId);
    if (!record) {
      throw new DomainError(
        "CONFIGURATION_REQUIRED",
        "The assistant has not been set up for this company yet.",
      );
    }
    if (!record.enabled) {
      throw new DomainError("CONFIGURATION_REQUIRED", "The assistant is switched off.");
    }

    /*
     * Field by field, not all-or-nothing. Somebody who set only a model keeps
     * the company's endpoint and key; somebody who set only a key keeps the
     * company's choice of model. Treating the personal row as a single unit
     * would force a person to restate settings they were happy with, and would
     * stop them tracking the company when an owner changed provider.
     */
    const personal = await this.repository.getUserProvider(actor.tenantId, actor.userId);
    const cipher = personal?.encryptedApiKey ?? record.encryptedApiKey;
    if (!cipher) {
      throw new DomainError(
        "CONFIGURATION_REQUIRED",
        "No API key has been saved. Add your own in Settings, or ask an owner to add one for the company.",
      );
    }

    return {
      baseUrl: personal?.baseUrl ?? record.baseUrl,
      model: personal?.model ?? record.model,
      apiKey: decryptSecret(cipher),
      // Company-wide deliberately: the budget is a spending decision, so it is
      // the owner's to make even where the model is somebody's own choice.
      ...(record.maxCycles === undefined ? {} : { maxCycles: record.maxCycles }),
    };
  }
}
