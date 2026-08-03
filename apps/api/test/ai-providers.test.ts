/**
 * Two providers, kept apart.
 *
 * The company's configuration and a person's own are independent: neither
 * borrows a field from the other, either is usable on its own, and somebody
 * with both chooses. This replaced a field-by-field override that made "whose
 * settings are these, and who is paying" unanswerable — and that could not be
 * set up at all until an owner had configured a company provider first, which
 * was the bug reported from the product.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { AiSettingsService, type AiSettingsRepository, type AiSettingsRecord, type AiUserProviderRecord } from "../src/application/ai-settings-service.js";
import { configureSecretKey, encryptSecret } from "../src/infrastructure/secret-crypto.js";
import type { AuditEventInput, AuditRepository } from "../src/application/project-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";

configureSecretKey("a-test-secret-key-of-at-least-32-chars");

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

function person(permissions: string[]): UserPrincipal {
  return { tenantId, userId, roles: ["none"], permissions: permissions as never };
}

class MemoryRepo implements AiSettingsRepository {
  company: AiSettingsRecord | null = null;
  personal: AiUserProviderRecord | null = null;

  async get() { return this.company; }
  async upsert(_t: string, input: Record<string, unknown>) {
    this.company = {
      baseUrl: String(input.baseUrl),
      model: String(input.model),
      encryptedApiKey: (input.encryptedApiKey as string | null) ?? null,
      enabled: Boolean(input.enabled),
      updatedAt: new Date().toISOString(),
      ...(input.maxCycles === undefined ? {} : { maxCycles: Number(input.maxCycles) }),
      ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: Number(input.maxOutputTokens) }),
    };
    return this.company;
  }
  async getUserProvider() { return this.personal; }
  async saveUserProvider(_t: string, _u: string, input: Record<string, unknown>) {
    this.personal = {
      baseUrl: (input.baseUrl as string) ?? this.personal?.baseUrl ?? null,
      model: (input.model as string) ?? this.personal?.model ?? null,
      encryptedApiKey: (input.encryptedApiKey as string) ?? this.personal?.encryptedApiKey ?? null,
      ...(input.maxCycles === undefined ? {} : { maxCycles: Number(input.maxCycles) }),
      ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: Number(input.maxOutputTokens) }),
      ...(input.preferred === undefined ? {} : { preferred: input.preferred as "company" | "personal" }),
    };
  }
  async setPreferredProvider(_t: string, _u: string, preferred: "company" | "personal") {
    this.personal = { baseUrl: null, model: null, encryptedApiKey: null, ...(this.personal ?? {}), preferred };
  }
  async deleteUserProvider() {
    const had = this.personal !== null;
    this.personal = null;
    return had;
  }
}

class MemoryAudit implements AuditRepository {
  events: AuditEventInput[] = [];
  async append(event: AuditEventInput) { this.events.push(event); }
}

let repo: MemoryRepo;
let service: AiSettingsService;

beforeEach(() => {
  repo = new MemoryRepo();
  service = new AiSettingsService(repo, new MemoryAudit());
});

const COMPANY = {
  baseUrl: "https://company.test/v1",
  model: "company-model",
  encryptedApiKey: encryptSecret("sk-company"),
  enabled: true,
  updatedAt: new Date().toISOString(),
};

const PERSONAL_INPUT = {
  baseUrl: "https://mine.test/v1",
  model: "my-model",
  apiKey: "sk-mine",
};

describe("a person's own provider stands alone", () => {
  /*
   * The reported bug. resolveProvider used to throw before it ever looked at
   * the personal row, so somebody could configure their own model and still be
   * told the assistant was not set up.
   */
  it("works when the company has configured nothing at all", async () => {
    const actor = person(["ai.use"]);
    await service.saveMyProvider(actor, PERSONAL_INPUT);

    const provider = await service.resolveProvider(actor);

    expect(provider.baseUrl).toBe("https://mine.test/v1");
    expect(provider.model).toBe("my-model");
    expect(provider.apiKey).toBe("sk-mine");
  });

  it("reports itself as ready with no company provider", async () => {
    const actor = person(["ai.use"]);
    await service.saveMyProvider(actor, PERSONAL_INPUT);

    const settings = await service.getSettings(actor);

    expect(settings.ready).toBe(true);
    expect(settings.active).toBe("personal");
    expect(settings.company.configured).toBe(false);
    // Nothing to choose between: one configuration is not a choice.
    expect(settings.canChoose).toBe(false);
  });

  it("works even when the company has switched its own model off", async () => {
    repo.company = { ...COMPANY, enabled: false };
    const actor = person(["ai.use"]);
    await service.saveMyProvider(actor, PERSONAL_INPUT);

    const provider = await service.resolveProvider(actor);
    expect(provider.model).toBe("my-model");
  });

  it("refuses a personal setup with no key the first time", async () => {
    await expect(
      service.saveMyProvider(person(["ai.use"]), {
        baseUrl: "https://mine.test/v1",
        model: "my-model",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("keeps the stored key when only the model changes", async () => {
    const actor = person(["ai.use"]);
    await service.saveMyProvider(actor, PERSONAL_INPUT);
    await service.saveMyProvider(actor, { baseUrl: "https://mine.test/v1", model: "cheaper-model" });

    const provider = await service.resolveProvider(actor);
    expect(provider.model).toBe("cheaper-model");
    expect(provider.apiKey).toBe("sk-mine");
  });
});

describe("nothing is borrowed between the two", () => {
  /*
   * The whole point of the change. A mixture made "who is paying" unanswerable,
   * so a configuration is used whole or not at all.
   */
  it("never mixes a personal model with the company's endpoint", async () => {
    repo.company = COMPANY;
    const actor = person(["ai.use"]);
    await service.saveMyProvider(actor, PERSONAL_INPUT);

    const provider = await service.resolveProvider(actor);

    expect(provider.baseUrl).toBe("https://mine.test/v1");
    expect(provider.apiKey).toBe("sk-mine");
    // Not one field of the company's leaked in.
    expect(provider.baseUrl).not.toBe(COMPANY.baseUrl);
  });

  it("uses the budgets of whichever configuration is in use", async () => {
    repo.company = { ...COMPANY, maxCycles: 3, maxOutputTokens: 500 };
    const actor = person(["ai.use"]);

    // On the company's: the company's numbers.
    const onCompany = await service.resolveProvider(actor);
    expect(onCompany.maxCycles).toBe(3);
    expect(onCompany.maxOutputTokens).toBe(500);

    // On their own: their own, not the company's.
    await service.saveMyProvider(actor, { ...PERSONAL_INPUT, maxCycles: 20, maxOutputTokens: 8000 });
    const onPersonal = await service.resolveProvider(actor);
    expect(onPersonal.maxCycles).toBe(20);
    expect(onPersonal.maxOutputTokens).toBe(8000);
  });
});

describe("choosing, when there are two", () => {
  it("offers the choice only when both are usable", async () => {
    const actor = person(["ai.use"]);

    repo.company = COMPANY;
    expect((await service.getSettings(actor)).canChoose).toBe(false);

    await service.saveMyProvider(actor, PERSONAL_INPUT);
    expect((await service.getSettings(actor)).canChoose).toBe(true);
  });

  it("honours the choice", async () => {
    repo.company = COMPANY;
    const actor = person(["ai.use"]);
    await service.saveMyProvider(actor, PERSONAL_INPUT);

    // Setting one up selects it, so this starts on personal.
    expect((await service.resolveProvider(actor)).model).toBe("my-model");

    await service.chooseProvider(actor, { preferred: "company" });
    expect((await service.resolveProvider(actor)).model).toBe("company-model");
  });

  it("refuses a choice when there is nothing to choose between", async () => {
    repo.company = COMPANY;
    await expect(
      service.chooseProvider(person(["ai.use"]), { preferred: "personal" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  /*
   * A preference naming something that no longer exists must not strand
   * somebody on nothing. They fall to whatever is actually usable.
   */
  it("falls back when the chosen configuration is deleted", async () => {
    repo.company = COMPANY;
    const actor = person(["ai.use"]);
    await service.saveMyProvider(actor, PERSONAL_INPUT);
    await service.deleteMyProvider(actor);

    const settings = await service.getSettings(actor);
    expect(settings.active).toBe("company");
    expect(settings.ready).toBe(true);
  });

  it("says nothing is ready when neither is", async () => {
    const settings = await service.getSettings(person(["ai.use"]));
    expect(settings.active).toBe("none");
    expect(settings.ready).toBe(false);
    await expect(service.resolveProvider(person(["ai.use"]))).rejects.toMatchObject({
      code: "CONFIGURATION_REQUIRED",
    });
  });
});
