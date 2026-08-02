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
  aiUserKeyInputSchema,
  type AiSettingsInput,
  type AiUserKeyInput,
} from "../domain/ai.js";
import { requirePermission, type UserPrincipal } from "../domain/auth.js";
import { DomainError } from "../domain/errors.js";
import { decryptSecret, encryptSecret } from "../infrastructure/secret-crypto.js";
import type { AuditRepository } from "./project-service.js";

export interface AiSettingsRecord {
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
  /** Whether asking a question would work right now, for this person. */
  ready: boolean;
  updatedAt?: string;
}

export interface AiSettingsRepository {
  get(tenantId: string): Promise<AiSettingsRecord | null>;
  upsert(
    tenantId: string,
    input: {
      baseUrl: string;
      model: string;
      encryptedApiKey: string | null;
      enabled: boolean;
      updatedByUserId: string;
    },
  ): Promise<AiSettingsRecord>;
  getUserKey(tenantId: string, userId: string): Promise<string | null>;
  saveUserKey(tenantId: string, userId: string, encryptedApiKey: string): Promise<void>;
  deleteUserKey(tenantId: string, userId: string): Promise<boolean>;
}

/** Everything the harness needs to call a provider, decrypted at the last moment. */
export interface ResolvedAiProvider {
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
    const personalKey = await this.repository.getUserKey(actor.tenantId, actor.userId);
    const hasCompanyKey = Boolean(record?.encryptedApiKey);
    const hasPersonalKey = Boolean(personalKey);

    if (!record) {
      return { configured: false, enabled: false, hasCompanyKey, hasPersonalKey, ready: false };
    }

    return {
      configured: true,
      enabled: record.enabled,
      baseUrl: record.baseUrl,
      model: record.model,
      hasCompanyKey,
      hasPersonalKey,
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
      },
    });

    const personalKey = await this.repository.getUserKey(actor.tenantId, actor.userId);
    return {
      configured: true,
      enabled: record.enabled,
      baseUrl: record.baseUrl,
      model: record.model,
      hasCompanyKey: Boolean(record.encryptedApiKey),
      hasPersonalKey: Boolean(personalKey),
      ready: record.enabled && Boolean(record.encryptedApiKey || personalKey),
      updatedAt: record.updatedAt,
    };
  }

  /** A person's own key, which they may set and remove without an administrator. */
  async saveMyKey(actor: UserPrincipal, rawInput: unknown): Promise<{ hasPersonalKey: true }> {
    requirePermission(actor, "ai.use");

    const parsed = aiUserKeyInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new DomainError("VALIDATION_FAILED", "That API key is not valid.");
    }
    const input: AiUserKeyInput = parsed.data;

    await this.repository.saveUserKey(actor.tenantId, actor.userId, encryptSecret(input.apiKey));

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ai.key.update",
      entityType: "ai_user_key",
      entityId: actor.userId,
      result: "success",
    });

    return { hasPersonalKey: true };
  }

  async deleteMyKey(actor: UserPrincipal): Promise<{ hasPersonalKey: false }> {
    requirePermission(actor, "ai.use");

    const removed = await this.repository.deleteUserKey(actor.tenantId, actor.userId);
    if (removed) {
      await this.audit.append({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "ai.key.delete",
        entityType: "ai_user_key",
        entityId: actor.userId,
        result: "success",
      });
    }

    // Idempotent: removing a key that is not there is a request that has
    // already been satisfied, not a failure worth showing somebody.
    return { hasPersonalKey: false };
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

    const personalKey = await this.repository.getUserKey(actor.tenantId, actor.userId);
    const cipher = personalKey ?? record.encryptedApiKey;
    if (!cipher) {
      throw new DomainError(
        "CONFIGURATION_REQUIRED",
        "No API key has been saved. Add your own in Settings, or ask an owner to add one for the company.",
      );
    }

    return { baseUrl: record.baseUrl, model: record.model, apiKey: decryptSecret(cipher) };
  }
}
