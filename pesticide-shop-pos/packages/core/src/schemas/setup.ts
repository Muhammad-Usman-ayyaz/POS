import { z } from 'zod';
import { editableMeta, Flag, Id, IsoDateTime, Role, syncScope } from './common.js';

export const Shop = z.object({
  id: Id,
  name: z.string().min(1),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  currency: z.string().min(1),
  ...editableMeta,
});
export type Shop = z.infer<typeof Shop>;

export const Branch = z.object({
  id: Id,
  shop_id: Id,
  name: z.string().min(1),
  code: z.string().min(1),
  ...editableMeta,
});
export type Branch = z.infer<typeof Branch>;

export const Device = z.object({
  id: Id,
  branch_id: Id,
  name: z.string().min(1),
  device_code: z.string().min(1),
  ...editableMeta,
});
export type Device = z.infer<typeof Device>;

const UserBase = z.object({
  id: Id,
  name: z.string().min(1),
  username: z.string().min(1),
  password_hash: z.string().min(1),
  role: Role,
  is_active: Flag,
  ...syncScope,
  ...editableMeta,
});
export const User = UserBase;
export type User = z.infer<typeof User>;

/** What is safe to send to the UI: a user without the password hash. */
export const PublicUser = UserBase.omit({ password_hash: true });
export type PublicUser = z.infer<typeof PublicUser>;

export const Setting = z.object({
  id: Id,
  key: z.string().min(1),
  value: z.string().nullable(),
  ...syncScope,
  ...editableMeta,
});
export type Setting = z.infer<typeof Setting>;

export const NumberSequence = z.object({
  id: Id,
  device_id: Id,
  sequence_name: z.string().min(1),
  prefix: z.string(),
  last_number: z.number().int().nonnegative(),
  updated_at: IsoDateTime,
});
export type NumberSequence = z.infer<typeof NumberSequence>;
