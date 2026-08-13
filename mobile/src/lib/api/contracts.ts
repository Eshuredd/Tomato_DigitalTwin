import { z } from 'zod';
import type { components } from './schema';

export type Health = components['schemas']['HealthResponse'];
export const healthSchema = z.object({ status: z.string(), service: z.string(), version: z.string() }).strict();
export const systemInfoSchema = z.record(z.string(), z.unknown());
export type SystemInfo = z.infer<typeof systemInfoSchema>;
