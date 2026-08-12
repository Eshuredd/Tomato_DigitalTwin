import { apiRequest } from './client';
import { healthSchema, systemInfoSchema, type Health, type SystemInfo } from './contracts';
export function getHealth(signal?: AbortSignal): Promise<Health> { return apiRequest('/health', { signal, schema: healthSchema }); }
export function getSystemInfo(signal?: AbortSignal): Promise<SystemInfo> { return apiRequest('/system-info', { signal, schema: systemInfoSchema }); }
