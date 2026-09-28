import { createResource } from '@/lib/resource';
import type { AuditLogEntry } from './types';

export const auditLogs = createResource<AuditLogEntry>('audit-logs');
