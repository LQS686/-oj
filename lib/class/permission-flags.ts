/**
 * Shared class-domain permission bag (JSON on ClassMember.permissions).
 * Keys align with ALLOWED_PERMISSION_KEYS / ClassPermissions.
 */
export type ClassPermissionFlags = Record<string, boolean>
