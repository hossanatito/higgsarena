import type { ClientGeneration } from "@/lib/generations/access";
import type { PublicModel } from "@/lib/catalog/repo";
import type { BlockReason } from "@/lib/db/schema";

export type { ClientGeneration, PublicModel, BlockReason };

export type CharacterOption = { id: string; referenceId: string; name: string; modelVersion: "v1" | "v2" | "cinema"; thumbnailUrl: string | null };

export type KeyOptions = { org: boolean; personal: boolean; personalAllowed: boolean };

export type Values = Record<string, unknown>;

export const ACTIVE = ["submitting", "queued", "in_progress"] as const;
export const isActive = (s: string) => (ACTIVE as readonly string[]).includes(s);
