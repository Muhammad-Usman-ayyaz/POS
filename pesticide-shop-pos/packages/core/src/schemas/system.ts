import { z } from 'zod';
import { Id, IsoDateTime } from './common.js';

export const AuditLog = z.object({
  id: Id,
  user_id: Id.nullable(),
  action: z.string().min(1),
  table_name: z.string().nullable(),
  row_id: z.string().nullable(),
  details: z.string().nullable(),
  created_at: IsoDateTime,
});
export type AuditLog = z.infer<typeof AuditLog>;

export const ChangeLog = z.object({
  id: Id,
  table_name: z.string().min(1),
  row_id: z.string().min(1),
  operation: z.enum(['insert', 'update', 'delete']),
  payload: z.string().nullable(),
  created_at: IsoDateTime,
  synced_at: IsoDateTime.nullable(),
});
export type ChangeLog = z.infer<typeof ChangeLog>;

export const BackupLog = z.object({
  id: Id,
  created_at: IsoDateTime,
  destination: z.string().min(1),
  file_name: z.string().nullable(),
  size_bytes: z.number().int().nonnegative().nullable(),
  checksum: z.string().nullable(),
  status: z.enum(['ok', 'failed']),
  error: z.string().nullable(),
});
export type BackupLog = z.infer<typeof BackupLog>;
