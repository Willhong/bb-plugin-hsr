import { defineRpcContract } from '@get-bb/plugin-sdk';
import { z } from 'zod';
export const rpcContract = defineRpcContract({
  usage: {
    input: z.object({}).strict(),
    output: z.object({
      fetchedAt: z.string(), usageStatus: z.string(), total: z.number(), observed: z.number(),
      requests: z.number(), loads: z.number(), applications: z.number(), observations: z.number(),
      rows: z.array(z.object({
        name: z.string(), description: z.string(), path: z.string(), calls: z.number(),
        requests: z.number(), loads: z.number(), applications: z.number(), lastUsed: z.string().nullable(), score: z.number(), share: z.number(),
      })).max(500),
    }),
  },
});
