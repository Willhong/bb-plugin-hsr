import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const skillName = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/);
export const location = z.object({ registryPath: z.string().min(1), nodeBinary: z.string().min(1) });
export const historyEntry = z.object({ calls: z.number().nonnegative(), loads: z.number().nonnegative().default(0), applications: z.number().nonnegative().default(0), lastUsed: z.string().nullable() });
export const catalogSchema = z.object({
  registryPath: z.string(),
  skills: z.array(z.object({ name: skillName, description: z.string(), path: z.string() })).max(500),
  history: z.record(z.string(), historyEntry),
  usageStatus: z.string(),
});
export type Catalog = z.infer<typeof catalogSchema>;
export const readInput = z.object({
  skill: skillName,
  file: z.string().min(1).max(1024).default("SKILL.md"),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(12000).default(12000),
});
export const hostContract = defineRpcContract({
  record: {
    input: location.extend({ skill: skillName, kind: z.enum(["loaded", "applied"]), session: z.string().min(1).max(300), eventId: z.string().min(1).max(100) }),
    output: z.object({ recorded: z.boolean(), eventId: z.string(), skill: z.string(), kind: z.string() }),
  },
  catalog: { input: location, output: catalogSchema },
  read: {
    input: location.extend(readInput.shape),
    output: z.object({ path: z.string(), text: z.string(), totalChars: z.number(), nextOffset: z.number().nullable() }),
  },
});
