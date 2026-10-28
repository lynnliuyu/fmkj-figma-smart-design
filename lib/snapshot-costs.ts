/** Pure filtering shared by customer exports and permission-filtered API reads. */
const INTERNAL_COST_FIELDS = new Set(["cost", "cost_price", "costPrice", "cost_amount", "costAmount"])

/** Return a copy without internal cost fields, including nested legacy snapshots. */
export function stripSnapshotCosts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSnapshotCosts)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !INTERNAL_COST_FIELDS.has(key))
    .map(([key, entry]) => [key, stripSnapshotCosts(entry)]))
}
