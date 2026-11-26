/**
 * HiggsArena database schema (Drizzle ORM, PostgreSQL 16).
 *
 * Money is numeric(14,5) in USD. Every timestamp is timestamptz.
 * The first five tables follow Better Auth's core schema.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => numeric(name, { precision: 14, scale: 5 });
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/* ------------------------------------------------------------------ */
/* Better Auth                                                         */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ------------------------------------------------------------------ */
/* Organization, members, teams                                        */
/* ------------------------------------------------------------------ */

export type OrgSettings = {
  personalKeysAllowed: boolean;
  /** Seconds Higgsfield keeps outputs. null = Higgsfield default (7 days). */
  retentionSeconds: number | null;
  mirrorOutputs: boolean;
  /** What to do when /estimate fails. */
  estimateFailurePolicy: "block" | "allow";
  /** Model failure-rate alert threshold over 24h, 0..1. */
  failureAlertThreshold: number;
  /** Max jobs the whole app submits to Higgsfield at once. */
  submitConcurrency: number;
  setupDismissed?: boolean;
};

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  personalKeysAllowed: false,
  retentionSeconds: null,
  mirrorOutputs: false,
  estimateFailurePolicy: "block",
  failureAlertThreshold: 0.5,
  submitConcurrency: 8,
};

export const organization = pgTable("organization", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  settings: jsonb("settings").$type<OrgSettings>().notNull().default(DEFAULT_ORG_SETTINGS),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const roleEnum = pgEnum("member_role", ["owner", "admin", "member"]);
export type Role = (typeof roleEnum.enumValues)[number];

export const member = pgTable(
  "member",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("member"),
    suspendedAt: ts("suspended_at"),
    notifyOnFinish: boolean("notify_on_finish").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("member_org_user_idx").on(t.organizationId, t.userId)],
);

export const team = pgTable("team", {
  id: id(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sharedLibrary: boolean("shared_library").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const teamMember = pgTable(
  "team_member",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.memberId] }), index("team_member_member_idx").on(t.memberId)],
);

export const invitation = pgTable(
  "invitation",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull().default("member"),
    teamIds: text("team_ids").array().notNull().default(sql`'{}'::text[]`),
    /** SHA-256 of the token. The token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("invitation_email_idx").on(t.email)],
);

/* ------------------------------------------------------------------ */
/* Restrictions and budgets                                            */
/* ------------------------------------------------------------------ */

export const policyScopeEnum = pgEnum("policy_scope", ["org", "team", "member"]);
export type PolicyScope = (typeof policyScopeEnum.enumValues)[number];

export const policy = pgTable(
  "policy",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    scope: policyScopeEnum("scope").notNull(),
    /** team.id or member.id; the organization id for scope "org". */
    scopeId: text("scope_id").notNull(),
    monthlyBudgetUsd: money("monthly_budget_usd"),
    dailyGenerationLimit: integer("daily_generation_limit"),
    maxConcurrentJobs: integer("max_concurrent_jobs"),
    allowedModels: text("allowed_models").array(),
    maxVideoDuration: integer("max_video_duration"),
    maxBatchSize: integer("max_batch_size"),
    maxUploadMb: integer("max_upload_mb"),
    paused: boolean("paused").notNull().default(false),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("policy_scope_idx").on(t.scope, t.scopeId)],
);

export const overrideStatusEnum = pgEnum("override_status", ["pending", "approved", "declined", "expired"]);

export type BlockReason = {
  rule: string;
  scope: PolicyScope;
  scopeId: string;
  scopeName: string;
  limitUsd?: string;
  spentUsd?: string;
  estimateUsd?: string;
  message: string;
};

export const budgetOverride = pgTable(
  "budget_override",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    modelSlug: text("model_slug").notNull(),
    params: jsonb("params").$type<Record<string, unknown>>().notNull(),
    keySource: text("key_source").$type<"org" | "personal">().notNull().default("org"),
    presetId: text("preset_id"),
    presetVars: jsonb("preset_vars").$type<Record<string, string>>(),
    amountUsd: money("amount_usd").notNull(),
    note: text("note"),
    blockedBy: jsonb("blocked_by").$type<BlockReason>().notNull(),
    status: overrideStatusEnum("status").notNull().default("pending"),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    decisionNote: text("decision_note"),
    resultGenerationId: text("result_generation_id"),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("override_status_idx").on(t.status)],
);

/* ------------------------------------------------------------------ */
/* Credentials and settings                                            */
/* ------------------------------------------------------------------ */

export const apiCredential = pgTable(
  "api_credential",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ownerType: text("owner_type").$type<"org" | "user">().notNull(),
    /** Set for personal keys. */
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    /** AES-256-GCM ciphertext of {"id","secret"}, bound to this row. */
    keyEnc: text("key_enc").notNull(),
    keyHint: text("key_hint").notNull(),
    webhookSecretEnc: text("webhook_secret_enc"),
    webhookSecretHint: text("webhook_secret_hint"),
    lastVerifiedAt: ts("last_verified_at"),
    lastUsedAt: ts("last_used_at"),
    lastError: text("last_error"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("credential_owner_idx").on(t.organizationId, t.ownerType, t.userId).where(sql`${t.userId} is not null`),
    uniqueIndex("credential_org_idx").on(t.organizationId, t.ownerType).where(sql`${t.userId} is null`),
  ],
);

export const instanceSetting = pgTable("instance_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  /** Encrypted JSON of the secret parts, bound to the key. */
  secretEnc: text("secret_enc"),
  secretHints: jsonb("secret_hints").$type<Record<string, string>>().notNull().default({}),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export const modelCategoryEnum = pgEnum("model_category", ["image", "edit", "video", "motion", "character"]);
export type ModelCategory = (typeof modelCategoryEnum.enumValues)[number];

export const model = pgTable(
  "model",
  {
    slug: text("slug").primaryKey(),
    name: text("name").notNull(),
    family: text("family").notNull(),
    provider: text("provider").notNull(),
    category: modelCategoryEnum("category").notNull(),
    mode: text("mode").notNull(),
    endpoint: text("endpoint").notNull(),
    outputType: text("output_type").$type<"image" | "video" | "audio" | "character">().notNull(),
    description: text("description"),
    notes: text("notes"),
    fields: jsonb("fields").$type<import("@/lib/catalog/types").FieldSpec[]>().notNull(),
    inputSchema: jsonb("input_schema").$type<Record<string, unknown>>(),
    docsUrl: text("docs_url"),
    verified: boolean("verified").notNull().default(false),
    enabled: boolean("enabled").notNull().default(false),
    featured: boolean("featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(1000),
    isCustom: boolean("is_custom").notNull().default(false),
    /** True once the owner edits fields, so Sync catalog leaves it alone. */
    userEdited: boolean("user_edited").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("model_category_idx").on(t.category)],
);

/* ------------------------------------------------------------------ */
/* Generations and characters                                          */
/* ------------------------------------------------------------------ */

export const generationStatusEnum = pgEnum("generation_status", [
  "submitting",
  "queued",
  "in_progress",
  "completed",
  "failed",
  "nsfw",
  "canceled",
  "error",
]);
export type GenerationStatus = (typeof generationStatusEnum.enumValues)[number];

export type OutputFile = {
  kind: "image" | "video" | "audio" | "file";
  /** Higgsfield URL. */
  url: string;
  /** Present once the file is mirrored to S3 / R2. */
  storageKey?: string;
  contentType?: string;
  label?: string;
};

export const generation = pgTable(
  "generation",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Teams the member belonged to when the job was submitted (for team budgets). */
    teamIds: text("team_ids").array().notNull().default(sql`'{}'::text[]`),
    modelSlug: text("model_slug").notNull(),
    modelName: text("model_name").notNull(),
    outputType: text("output_type").notNull(),
    requestId: text("request_id").unique(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: generationStatusEnum("status").notNull().default("submitting"),
    prompt: text("prompt"),
    params: jsonb("params").$type<Record<string, unknown>>().notNull(),
    outputs: jsonb("outputs").$type<OutputFile[]>().notNull().default([]),
    estimatedCostUsd: money("estimated_cost_usd"),
    costUsd: money("cost_usd"),
    costUnknown: boolean("cost_unknown").notNull().default(false),
    keySource: text("key_source").$type<"org" | "personal">().notNull().default("org"),
    credentialId: text("credential_id").references(() => apiCredential.id, { onDelete: "set null" }),
    overrideId: text("override_id"),
    presetId: text("preset_id"),
    error: text("error"),
    correlationId: text("correlation_id"),
    webhookUsed: boolean("webhook_used").notNull().default(false),
    expiresAt: ts("expires_at"),
    mirroredAt: ts("mirrored_at"),
    favorite: boolean("favorite").notNull().default(false),
    deletedAt: ts("deleted_at"),
    pollAttempts: integer("poll_attempts").notNull().default(0),
    nextPollAt: ts("next_poll_at"),
    notifiedAt: ts("notified_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
  },
  (t) => [
    index("generation_member_idx").on(t.memberId, t.createdAt),
    index("generation_status_idx").on(t.status),
    index("generation_created_idx").on(t.createdAt),
    index("generation_model_idx").on(t.modelSlug),
  ],
);

export const characterStatusEnum = pgEnum("character_status", [
  "not_ready",
  "queued",
  "in_progress",
  "completed",
  "failed",
]);

export const character = pgTable("character", {
  id: id(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  memberId: text("member_id")
    .notNull()
    .references(() => member.id, { onDelete: "cascade" }),
  referenceId: text("reference_id").unique(),
  name: text("name").notNull(),
  modelVersion: text("model_version").$type<"v1" | "v2" | "cinema">().notNull(),
  status: characterStatusEnum("status").notNull().default("not_ready"),
  thumbnailUrl: text("thumbnail_url"),
  failReason: text("fail_reason"),
  imageCount: integer("image_count").notNull().default(0),
  keySource: text("key_source").$type<"org" | "personal">().notNull().default("org"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Accountability, notifications and housekeeping                      */
/* ------------------------------------------------------------------ */

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt), index("audit_action_idx").on(t.action)],
);

export const notification = pgTable(
  "notification",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("notification_user_idx").on(t.userId, t.createdAt)],
);

/** Dedupe for one-off alerts such as "team reached 80% this month". */
export const alertSent = pgTable("alert_sent", {
  key: text("key").primaryKey(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const webhookEvent = pgTable("webhook_event", {
  id: text("id").primaryKey(),
  requestId: text("request_id"),
  receivedAt: ts("received_at").notNull().defaultNow(),
});

export const appRateLimit = pgTable("app_rate_limit", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
});

/* ------------------------------------------------------------------ */
/* Phase 3: presets and collections                                    */
/* ------------------------------------------------------------------ */

/**
 * A prompt template and/or brand preset: a model, starting values, and the
 * settings members may not change. Prompt templates can contain {{fields}}
 * that members fill in.
 */
export const preset = pgTable(
  "preset",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    modelSlug: text("model_slug").notNull(),
    promptTemplate: text("prompt_template"),
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    /** Field names members cannot change. Enforced on the server. */
    lockedFields: text("locked_fields").array().notNull().default(sql`'{}'::text[]`),
    /** Empty = every member; otherwise only members of these teams. */
    teamIds: text("team_ids").array().notNull().default(sql`'{}'::text[]`),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    archivedAt: ts("archived_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("preset_org_idx").on(t.organizationId)],
);

export const collection = pgTable(
  "collection",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ownerMemberId: text("owner_member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** private: owner (and admins). team: everyone in the studio can view. */
    visibility: text("visibility").$type<"private" | "team">().notNull().default("private"),
    /** SHA-256 of the read-only link token. Null when sharing is off. */
    shareTokenHash: text("share_token_hash").unique(),
    shareExpiresAt: ts("share_expires_at"),
    shareShowPrompts: boolean("share_show_prompts").notNull().default(false),
    shareCreatedAt: ts("share_created_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("collection_org_idx").on(t.organizationId), index("collection_owner_idx").on(t.ownerMemberId)],
);

export const collectionItem = pgTable(
  "collection_item",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collection.id, { onDelete: "cascade" }),
    generationId: text("generation_id")
      .notNull()
      .references(() => generation.id, { onDelete: "cascade" }),
    addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    addedAt: ts("added_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.generationId] }), index("collection_item_gen_idx").on(t.generationId)],
);
