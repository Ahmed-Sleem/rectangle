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
  AI_OUTPUT_TOKEN_BOUNDS,
  aiPreferredProviderSchema,
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
  /** Longest reply the company model may generate. */
  maxOutputTokens?: number;
  baseUrl: string;
  model: string;
  encryptedApiKey: string | null;
  enabled: boolean;
  updatedAt: string;
}

/** What a browser is allowed to know: everything except the key itself. */
/** What a person has configured for themselves. Complete or not usable. */
export interface AiUserProviderRecord {
  baseUrl: string | null;
  model: string | null;
  encryptedApiKey: string | null;
  maxCycles?: number;
  maxOutputTokens?: number;
  /** Which configuration this person uses when both exist. */
  preferred?: "company" | "personal";
}

/** One configuration, as a screen is allowed to see it. Never the key. */
export interface PublicAiProvider {
  configured: boolean;
  baseUrl?: string;
  model?: string;
  hasKey: boolean;
  maxCycles: number;
  maxOutputTokens: number;
}

/**
 * The assistant's configuration for one person.
 *
 * Two independent providers rather than one with overrides. The company's is
 * shared and paid for by the company; a personal one is complete in itself and
 * paid for by whoever configured it. Nothing falls back from one to the other,
 * because a half-personal provider running on the company's key made "who is
 * paying for this" unanswerable.
 */
export interface PublicAiSettings {
  /** The company's provider. Everyone with `ai.use` may see whether it exists. */
  company: PublicAiProvider;
  /** Whether the company has switched its provider on for everybody. */
  enabled: boolean;
  /** This person's own provider, if they have set one up. */
  personal: PublicAiProvider;
  /**
   * Which one this person is actually using. Resolved, not stored: somebody
   * with only one configuration is using that one whatever the column says.
   */
  active: "company" | "personal" | "none";
  /**
   * Whether a choice exists to be made. Only true when both are usable — a
   * radio group with one option is not a choice, and offering it would be a
   * control that cannot change anything.
   */
  canChoose: boolean;
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
    input: {
      baseUrl?: string;
      model?: string;
      encryptedApiKey?: string;
      maxCycles?: number;
      maxOutputTokens?: number;
      preferred?: "company" | "personal";
    },
  ): Promise<void>;
  setPreferredProvider(
    tenantId: string,
    userId: string,
    preferred: "company" | "personal",
  ): Promise<void>;
  deleteUserProvider(tenantId: string, userId: string): Promise<boolean>;
}

/** Everything the harness needs to call a provider, decrypted at the last moment. */
export interface ResolvedAiProvider {
  /** The reasoning budget belonging to whichever configuration is in use. */
  maxCycles?: number;
  /** The output ceiling belonging to whichever configuration is in use. */
  maxOutputTokens?: number;
  baseUrl: string;
  model: string;
  apiKey: string;
}

/**
 * Which configuration a person is actually on.
 *
 * One function, called by both the screen's answer and the request path, so
 * what somebody is shown and what their questions are sent to cannot disagree.
 * The stored preference is honoured only when it names something usable: a
 * person who chose "personal" and then deleted it is on the company's, not on
 * nothing, and does not have to go and re-pick.
 */
function resolveActive(
  companyUsable: boolean,
  personalUsable: boolean,
  preferred: "company" | "personal" | undefined,
): "company" | "personal" | "none" {
  if (preferred === "personal" && personalUsable) return "personal";
  if (preferred === "company" && companyUsable) return "company";
  // No preference, or one that names something that is not there any more.
  if (personalUsable) return "personal";
  if (companyUsable) return "company";
  return "none";
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
     * itself with. No key is in this response, so reading it discloses nothing
     * an ordinary user should not know.
     */
    requirePermission(actor, "ai.use");

    const record = await this.repository.get(actor.tenantId);
    const personal = await this.repository.getUserProvider(actor.tenantId, actor.userId);

    const company: PublicAiProvider = {
      configured: Boolean(record),
      ...(record?.baseUrl ? { baseUrl: record.baseUrl } : {}),
      ...(record?.model ? { model: record.model } : {}),
      hasKey: Boolean(record?.encryptedApiKey),
      maxCycles: record?.maxCycles ?? AI_CYCLE_BOUNDS.default,
      maxOutputTokens: record?.maxOutputTokens ?? AI_OUTPUT_TOKEN_BOUNDS.default,
    };

    /*
     * Complete or absent. A row with an endpoint but no key is a half-finished
     * setup, and reporting it as configured would put a working-looking block
     * on the screen for something that cannot answer a question.
     */
    const personalComplete = Boolean(
      personal?.baseUrl && personal.model && personal.encryptedApiKey,
    );

    const personalProvider: PublicAiProvider = {
      configured: personalComplete,
      ...(personal?.baseUrl ? { baseUrl: personal.baseUrl } : {}),
      ...(personal?.model ? { model: personal.model } : {}),
      hasKey: Boolean(personal?.encryptedApiKey),
      maxCycles: personal?.maxCycles ?? AI_CYCLE_BOUNDS.default,
      maxOutputTokens: personal?.maxOutputTokens ?? AI_OUTPUT_TOKEN_BOUNDS.default,
    };

    /*
     * Usable is not the same as configured. The company's has to be switched on
     * as well, because an owner pausing it must stop everybody — that is what
     * the switch is for. A personal one has no such gate: it is that person's
     * own account and nobody else's to pause.
     */
    const companyUsable = company.configured && (record?.enabled ?? false) && company.hasKey;
    const personalUsable = personalComplete;

    const active = resolveActive(companyUsable, personalUsable, personal?.preferred);

    return {
      company,
      enabled: record?.enabled ?? false,
      personal: personalProvider,
      active,
      // A radio group with one option is not a choice. Only offered when there
      // are genuinely two working configurations to pick between.
      canChoose: companyUsable && personalUsable,
      ready: active !== "none",
      ...(record?.updatedAt ? { updatedAt: record.updatedAt } : {}),
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
      ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
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
        ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
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

    /*
     * A key may be omitted only when one is already stored. Otherwise this
     * would write a half-configuration that looks set up on the screen and
     * fails the first time somebody asks a question.
     */
    const existing = await this.repository.getUserProvider(actor.tenantId, actor.userId);
    if (!input.apiKey && !existing?.encryptedApiKey) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "An API key is needed the first time you set up your own model.",
      );
    }

    await this.repository.saveUserProvider(actor.tenantId, actor.userId, {
      baseUrl: input.baseUrl,
      model: input.model,
      ...(input.apiKey ? { encryptedApiKey: encryptSecret(input.apiKey) } : {}),
      ...(input.maxCycles === undefined ? {} : { maxCycles: input.maxCycles }),
      ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
      /*
       * Setting up your own model is choosing it. Making somebody configure a
       * provider and then separately switch to it would be two steps for one
       * intention, and the second is the one people forget.
       */
      preferred: "personal",
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
        baseUrl: input.baseUrl,
        model: input.model,
        keyChanged: Boolean(input.apiKey),
      },
    });

    return this.getSettings(actor);
  }

  /**
   * Chooses between two configurations that both exist.
   *
   * Refused when there is nothing to choose between, rather than quietly
   * storing a preference that resolves to the same thing either way — a setting
   * that does not change anything is worse than an absent one, because
   * somebody will believe it did something.
   */
  async chooseProvider(actor: UserPrincipal, rawInput: unknown): Promise<PublicAiSettings> {
    requirePermission(actor, "ai.use");

    const parsed = aiPreferredProviderSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new DomainError("VALIDATION_FAILED", "That is not a provider you can choose.");
    }

    const current = await this.getSettings(actor);
    if (!current.canChoose) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "There is only one model available to you, so there is nothing to choose.",
      );
    }

    await this.repository.setPreferredProvider(
      actor.tenantId,
      actor.userId,
      parsed.data.preferred,
    );

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ai.provider.choose",
      entityType: "ai_user_key",
      entityId: actor.userId,
      result: "success",
      metadata: { preferred: parsed.data.preferred },
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
    const personal = await this.repository.getUserProvider(actor.tenantId, actor.userId);

    /*
     * One configuration, whole. Never a mixture.
     *
     * This used to require a company record before it would even look at the
     * personal one, so somebody could configure their own model and still be
     * told the assistant was not set up — which is the bug that was reported.
     * It also merged the two field by field, so a person could end up on the
     * company's endpoint with their own key and neither the screen nor the
     * audit trail could say who was paying.
     */
    const personalUsable = Boolean(personal?.baseUrl && personal.model && personal.encryptedApiKey);
    const companyUsable = Boolean(record?.enabled && record.encryptedApiKey);

    const active = resolveActive(companyUsable, personalUsable, personal?.preferred);

    if (active === "personal" && personal?.baseUrl && personal.model && personal.encryptedApiKey) {
      return {
        baseUrl: personal.baseUrl,
        model: personal.model,
        apiKey: decryptSecret(personal.encryptedApiKey),
        // Their budgets, because they are paying for these calls.
        maxCycles: personal.maxCycles ?? AI_CYCLE_BOUNDS.default,
        maxOutputTokens: personal.maxOutputTokens ?? AI_OUTPUT_TOKEN_BOUNDS.default,
      };
    }

    if (active === "company" && record?.encryptedApiKey) {
      return {
        baseUrl: record.baseUrl,
        model: record.model,
        apiKey: decryptSecret(record.encryptedApiKey),
        maxCycles: record.maxCycles ?? AI_CYCLE_BOUNDS.default,
        maxOutputTokens: record.maxOutputTokens ?? AI_OUTPUT_TOKEN_BOUNDS.default,
      };
    }

    /*
     * Nothing usable. The message says which of the three situations it is,
     * because "not configured", "switched off" and "no key" need three
     * different responses from the person reading it.
     */
    if (!record && !personal) {
      throw new DomainError(
        "CONFIGURATION_REQUIRED",
        "The assistant is not set up. Add your own model in Settings, or ask an owner to set one up for the company.",
      );
    }
    if (record && !record.enabled && !personalUsable) {
      throw new DomainError(
        "CONFIGURATION_REQUIRED",
        "The company assistant is switched off. Add your own model in Settings to use it anyway.",
      );
    }
    throw new DomainError(
      "CONFIGURATION_REQUIRED",
      "No API key has been saved. Add your own in Settings, or ask an owner to add one for the company.",
    );
  }
}
