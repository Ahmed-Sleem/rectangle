/**
 * PostgreSQL storage for the assistant's provider, keys and pending actions.
 *
 * Two of these are ordinary configuration. The third — pending actions — is a
 * security control, and its queries are written so that the guarantees the
 * service promises are enforced by the database rather than by the order in
 * which the service happens to call things.
 */
import type pg from "pg";
import type {
  AiSettingsRecord,
  AiSettingsRepository,
  AiUserProviderRecord,
} from "../../application/ai-settings-service.js";
import type {
  AiAutoApprovalRepository,
  AiConversationRepository,
  AiConversationSummary,
  AiPendingActionRepository,
  PendingAction,
  StoredAiMessage,
} from "../../application/ai-service.js";
import { buildExpressionSearchClause, type SearchMode } from "./search-sql.js";

function mapSettings(row: Record<string, unknown>): AiSettingsRecord {
  return {
    baseUrl: String(row.base_url),
    model: String(row.model),
    encryptedApiKey: row.api_key_cipher == null ? null : String(row.api_key_cipher),
    enabled: Boolean(row.enabled),
    ...(row.max_cycles == null ? {} : { maxCycles: Number(row.max_cycles) }),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export class PostgresAiSettingsRepository implements AiSettingsRepository {
  constructor(private readonly pool: pg.Pool) {}

  async get(tenantId: string): Promise<AiSettingsRecord | null> {
    const result = await this.pool.query(
      "select base_url, model, api_key_cipher, enabled, max_cycles, max_output_tokens, updated_at from ai_settings where tenant_id = $1",
      [tenantId],
    );
    return result.rows[0] ? mapSettings(result.rows[0] as Record<string, unknown>) : null;
  }

  async upsert(
    tenantId: string,
    input: {
      baseUrl: string;
      model: string;
      encryptedApiKey: string | null;
      enabled: boolean;
      maxCycles?: number;
      maxOutputTokens?: number;
      updatedByUserId: string;
    },
  ): Promise<AiSettingsRecord> {
    const result = await this.pool.query(
      `insert into ai_settings (tenant_id, base_url, model, api_key_cipher, enabled, max_cycles, max_output_tokens, updated_at, updated_by_user_id)
       values ($1, $2, $3, $4, $5, coalesce($6, 10), coalesce($7, 2048), now(), $8)
       on conflict (tenant_id) do update set
         base_url = excluded.base_url,
         model = excluded.model,
         api_key_cipher = excluded.api_key_cipher,
         enabled = excluded.enabled,
         -- Absent keeps the saved budget: changing a model name must not
         -- silently reset a limit somebody tuned.
         max_cycles = coalesce($6, ai_settings.max_cycles),
         max_output_tokens = coalesce($7, ai_settings.max_output_tokens),
         updated_at = now(),
         updated_by_user_id = excluded.updated_by_user_id
       returning base_url, model, api_key_cipher, enabled, max_cycles, max_output_tokens, updated_at`,
      [
        tenantId,
        input.baseUrl,
        input.model,
        input.encryptedApiKey,
        input.enabled,
        input.maxCycles ?? null,
        input.maxOutputTokens ?? null,
        input.updatedByUserId,
      ],
    );
    return mapSettings(result.rows[0] as Record<string, unknown>);
  }

  async getUserProvider(tenantId: string, userId: string): Promise<AiUserProviderRecord | null> {
    const result = await this.pool.query<{
      base_url: string | null;
      model: string | null;
      api_key_cipher: string | null;
      max_cycles: number | null;
      max_output_tokens: number | null;
      preferred: string | null;
    }>(
      `select base_url, model, api_key_cipher, max_cycles, max_output_tokens, preferred
         from ai_user_keys where tenant_id = $1 and user_id = $2`,
      [tenantId, userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      baseUrl: row.base_url,
      model: row.model,
      encryptedApiKey: row.api_key_cipher,
      ...(row.max_cycles == null ? {} : { maxCycles: Number(row.max_cycles) }),
      ...(row.max_output_tokens == null ? {} : { maxOutputTokens: Number(row.max_output_tokens) }),
      ...(row.preferred == null ? {} : { preferred: row.preferred as "company" | "personal" }),
    };
  }

  /**
   * Writes only what was sent.
   *
   * `coalesce(excluded.x, ai_user_keys.x)` is what makes a partial save
   * partial: a column the caller did not mention arrives as null and the
   * existing value is kept. Assigning `excluded.x` directly would mean saving a
   * model silently erased the key saved last week, which is the kind of data
   * loss nobody reports because they assume they did it themselves.
   */
  async saveUserProvider(
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
  ): Promise<void> {
    await this.pool.query(
      `insert into ai_user_keys (
         tenant_id, user_id, base_url, model, api_key_cipher,
         max_cycles, max_output_tokens, preferred, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, now())
       on conflict (tenant_id, user_id) do update set
         base_url = coalesce(excluded.base_url, ai_user_keys.base_url),
         model = coalesce(excluded.model, ai_user_keys.model),
         api_key_cipher = coalesce(excluded.api_key_cipher, ai_user_keys.api_key_cipher),
         max_cycles = coalesce(excluded.max_cycles, ai_user_keys.max_cycles),
         max_output_tokens = coalesce(excluded.max_output_tokens, ai_user_keys.max_output_tokens),
         preferred = coalesce(excluded.preferred, ai_user_keys.preferred),
         updated_at = now()`,
      [
        tenantId,
        userId,
        input.baseUrl ?? null,
        input.model ?? null,
        input.encryptedApiKey ?? null,
        input.maxCycles ?? null,
        input.maxOutputTokens ?? null,
        input.preferred ?? null,
      ],
    );
  }

  /**
   * Records which configuration a person is using.
   *
   * An upsert rather than an update: somebody may prefer the company's provider
   * without ever having configured one of their own, and that choice still has
   * to be stored somewhere. The row then holds a preference and nothing else,
   * which `getUserProvider` reports as an unconfigured personal provider — the
   * correct answer.
   */
  async setPreferredProvider(
    tenantId: string,
    userId: string,
    preferred: "company" | "personal",
  ): Promise<void> {
    await this.pool.query(
      `insert into ai_user_keys (tenant_id, user_id, preferred, updated_at)
       values ($1, $2, $3, now())
       on conflict (tenant_id, user_id) do update set
         preferred = excluded.preferred,
         updated_at = now()`,
      [tenantId, userId, preferred],
    );
  }

  async deleteUserProvider(tenantId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      "delete from ai_user_keys where tenant_id = $1 and user_id = $2",
      [tenantId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export class PostgresAiPendingActionRepository implements AiPendingActionRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: {
    tenantId: string;
    userId: string;
    tool: string;
    arguments: Record<string, unknown>;
    expiresAt: string;
  }): Promise<{ id: string }> {
    const result = await this.pool.query<{ id: string }>(
      `insert into ai_pending_actions (tenant_id, user_id, tool, arguments, expires_at)
       values ($1, $2, $3, $4::jsonb, $5)
       returning id`,
      [input.tenantId, input.userId, input.tool, JSON.stringify(input.arguments), input.expiresAt],
    );
    return { id: String(result.rows[0]?.id) };
  }

  /**
   * A proposal that may still be acted on.
   *
   * Every condition is in the WHERE clause rather than checked afterwards:
   * belonging to this tenant and this person, not already confirmed, and not
   * expired. A row failing any of them is simply not found, so the service
   * cannot forget one of the four and produce a hole — and "not found" is the
   * right answer to all of them anyway, since distinguishing "expired" from
   * "someone else's" would tell a caller about a proposal that is none of
   * their business.
   */
  async findClaimable(tenantId: string, userId: string, id: string): Promise<PendingAction | null> {
    const result = await this.pool.query<{ id: string; tool: string; arguments: unknown }>(
      `select id, tool, arguments
         from ai_pending_actions
        where id = $1
          and tenant_id = $2
          and user_id = $3
          and confirmed_at is null
          and expires_at > now()`,
      [id, tenantId, userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      tool: String(row.tool),
      arguments: (row.arguments ?? {}) as Record<string, unknown>,
    };
  }

  /**
   * Claims the proposal, and reports whether this caller is the one who got it.
   *
   * `confirmed_at is null` inside the UPDATE is what makes this safe under
   * concurrency: two requests arriving together both run the statement, the
   * database serialises them, and exactly one matches a row that is still
   * unclaimed. Reading first and then writing would let both pass the read.
   */
  async markConfirmed(tenantId: string, userId: string, id: string): Promise<boolean> {
    const result = await this.pool.query(
      `update ai_pending_actions
          set confirmed_at = now()
        where id = $1
          and tenant_id = $2
          and user_id = $3
          and confirmed_at is null
          and expires_at > now()`,
      [id, tenantId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Removes proposals nobody answered.
   *
   * They are not sensitive, but they are a record of what an assistant was
   * about to do, and keeping those indefinitely is a slow disclosure with no
   * purpose. Confirmed ones stay: the audit trail references them.
   */
  async deleteExpired(): Promise<number> {
    const result = await this.pool.query(
      "delete from ai_pending_actions where confirmed_at is null and expires_at < now()",
    );
    return result.rowCount ?? 0;
  }
}

/**
 * PostgreSQL storage for conversations.
 *
 * The isolation guarantee lives in these queries and nowhere else. Every
 * statement names the tenant and, where the row belongs to a person, that
 * person — inside the WHERE clause, never as a check performed on the result.
 * The difference matters: a filter applied after the fact is a line of code
 * somebody can delete without any query failing, whereas a condition in the
 * SQL means the row is never read at all. Nothing here can return a thread to
 * a caller who was not identified as its owner, because there is no statement
 * that selects one without saying whose it is.
 */
export class PostgresAiConversationRepository implements AiConversationRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: {
    tenantId: string;
    userId: string;
    title: string;
    projectId: string | null;
  }): Promise<{ id: string }> {
    const result = await this.pool.query<{ id: string }>(
      `insert into ai_conversations (tenant_id, user_id, title, project_id)
       values ($1, $2, $3, $4)
       returning id`,
      [input.tenantId, input.userId, input.title, input.projectId],
    );
    return { id: String(result.rows[0]?.id) };
  }

  async find(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<{ id: string; title: string; projectId: string | null } | null> {
    const result = await this.pool.query<{
      id: string;
      title: string;
      project_id: string | null;
    }>(
      `select id, title, project_id
         from ai_conversations
        where id = $1 and tenant_id = $2 and user_id = $3`,
      [id, tenantId, userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { id: String(row.id), title: String(row.title), projectId: row.project_id };
  }

  /**
   * A page of this person's conversations, newest activity first.
   *
   * Keyed-set pagination rather than an offset, and the reason is specific to
   * this list rather than a general preference. The rows are ordered by when
   * they were last active, and using the assistant is what changes that — so
   * asking a question while scrolling reorders the very list being paged. With
   * an offset, page two would then repeat a thread that had moved down or skip
   * one that had moved up. A cursor names the last row actually seen, so the
   * next page continues from there whatever has moved in the meantime.
   *
   * The tuple comparison is on `(updated_at, id)` because `updated_at` alone is
   * not unique: two threads touched in the same millisecond would make the
   * boundary ambiguous and one of them would be lost between pages. The id
   * breaks the tie, and the index is on the pair.
   *
   * Search goes through `buildExpressionSearchClause` rather than any matching
   * written here. That is the single search engine the product consolidated on,
   * and it is what gives this list Arabic folding, prefix matching while
   * somebody types, and typo tolerance without any of it being reimplemented.
   */
  async list(
    tenantId: string,
    userId: string,
    options: { limit: number; before?: { updatedAt: string; id: string }; query?: string; mode?: SearchMode },
  ): Promise<AiConversationSummary[]> {
    const values: unknown[] = [tenantId, userId];
    const conditions = ["tenant_id = $1", "user_id = $2"];

    if (options.before) {
      values.push(options.before.updatedAt, options.before.id);
      conditions.push(`(updated_at, id) < ($${values.length - 1}, $${values.length})`);
    }

    let rank = "";
    if (options.query?.trim()) {
      const clause = buildExpressionSearchClause(
        options.query,
        ["coalesce(title, '')"],
        values.length + 1,
        options.mode ?? "exact",
      );
      if (clause) {
        conditions.push(clause.where);
        values.push(...clause.values);
        /*
         * Recency still decides, with relevance only breaking ties. Somebody
         * searching their own conversations is looking for one they remember
         * having, and "most recent among the things that matched" is closer to
         * how they remember it than a rank over a short title ever is.
         */
        rank = `${clause.rank} desc,`;
      }
    }

    values.push(options.limit);

    const result = await this.pool.query<{
      id: string;
      title: string;
      project_id: string | null;
      updated_at: string;
    }>(
      `select id, title, project_id, updated_at
         from ai_conversations
        where ${conditions.join(" and ")}
        order by updated_at desc, ${rank} id desc
        limit $${values.length}`,
      values,
    );

    return result.rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      projectId: row.project_id,
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    }));
  }

  async messages(
    tenantId: string,
    conversationId: string,
    limit?: number,
  ): Promise<StoredAiMessage[]> {
    const result =
      limit === undefined
        ? await this.pool.query(
            `select id, role, content, used_tools, created_at
               from ai_messages
              where tenant_id = $1 and conversation_id = $2
              order by created_at, id`,
            [tenantId, conversationId],
          )
        : await this.pool.query(
            `select id, role, content, used_tools, created_at from (
               select id, role, content, used_tools, created_at
                 from ai_messages
                where tenant_id = $1 and conversation_id = $2
                order by created_at desc, id desc
                limit $3
             ) recent
             order by created_at, id`,
            [tenantId, conversationId, limit],
          );

    return (result.rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      role: row.role === "assistant" ? "assistant" : "user",
      content: String(row.content),
      usedTools: Array.isArray(row.used_tools) ? row.used_tools.map(String) : [],
      createdAt: new Date(String(row.created_at)).toISOString(),
    }));
  }

  /**
   * Adds a turn, and moves the thread to the top of the list.
   *
   * Both statements or neither. A message stored against a thread whose
   * `updated_at` did not move would sink out of view the moment it was
   * written, so the ordering is part of the write rather than a later repair.
   */
  async appendMessage(input: {
    tenantId: string;
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    usedTools: string[];
  }): Promise<StoredAiMessage> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<{
        id: string;
        role: string;
        content: string;
        used_tools: string[];
        created_at: string;
      }>(
        `insert into ai_messages (conversation_id, tenant_id, role, content, used_tools)
         values ($1, $2, $3, $4, $5)
         returning id, role, content, used_tools, created_at`,
        [input.conversationId, input.tenantId, input.role, input.content, input.usedTools],
      );
      await client.query(
        "update ai_conversations set updated_at = now() where id = $1 and tenant_id = $2",
        [input.conversationId, input.tenantId],
      );
      await client.query("commit");

      const row = result.rows[0];
      if (!row) throw new Error("The message was not stored.");
      return {
        id: String(row.id),
        role: row.role === "assistant" ? "assistant" : "user",
        content: String(row.content),
        usedTools: Array.isArray(row.used_tools) ? row.used_tools.map(String) : [],
        createdAt: new Date(String(row.created_at)).toISOString(),
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async rename(tenantId: string, userId: string, id: string, title: string): Promise<boolean> {
    const result = await this.pool.query(
      `update ai_conversations set title = $4
        where id = $1 and tenant_id = $2 and user_id = $3`,
      [id, tenantId, userId, title],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** The messages go with it: `ai_messages.conversation_id` cascades. */
  async remove(tenantId: string, userId: string, id: string): Promise<boolean> {
    const result = await this.pool.query(
      "delete from ai_conversations where id = $1 and tenant_id = $2 and user_id = $3",
      [id, tenantId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

/**
 * Tools a person has chosen not to be asked about.
 *
 * Three statements and no cleverness, which is right for a table whose entire
 * job is to answer one boolean question quickly. The rule about which tools may
 * be stored here is not enforced in SQL: the database has no way to know which
 * tools are irreversible, and duplicating that list in a check constraint would
 * create a second answer to drift from the registry. The service refuses them.
 */
export class PostgresAiAutoApprovalRepository implements AiAutoApprovalRepository {
  constructor(private readonly pool: pg.Pool) {}

  async list(tenantId: string, userId: string): Promise<string[]> {
    const result = await this.pool.query<{ tool: string }>(
      "select tool from ai_auto_approvals where tenant_id = $1 and user_id = $2 order by tool",
      [tenantId, userId],
    );
    return result.rows.map((row) => String(row.tool));
  }

  async grant(tenantId: string, userId: string, tool: string): Promise<void> {
    // Idempotent: agreeing twice is the same standing decision, not a conflict.
    await this.pool.query(
      `insert into ai_auto_approvals (tenant_id, user_id, tool)
       values ($1, $2, $3)
       on conflict (tenant_id, user_id, tool) do nothing`,
      [tenantId, userId, tool],
    );
  }

  async revoke(tenantId: string, userId: string, tool: string): Promise<boolean> {
    const result = await this.pool.query(
      "delete from ai_auto_approvals where tenant_id = $1 and user_id = $2 and tool = $3",
      [tenantId, userId, tool],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
