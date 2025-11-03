export const PLAN_RETENTION_HOURS = {
  hobby: 24,
  starter: 24 * 2,
  developer: 24 * 7,
  pro: 24 * 14,
  enterprise: 24 * 14,
};

export function hasSessionExpired(plan: string, createdAt: Date) {
  const retentionMs = PLAN_RETENTION_HOURS[plan] * 60 * 60 * 1000;
  return Date.now() - new Date(createdAt).getTime() > retentionMs;
}
