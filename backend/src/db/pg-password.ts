/**
 * The dev default must never reach production: it is the same password that
 * was once exposed on a public 5432. Fail closed when PG_PASSWORD is missing.
 */
export function resolvePgPassword(): string {
  const password = process.env.PG_PASSWORD;
  if (password) return password;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PG_PASSWORD is required in production");
  }
  return "quadrant_dev_password";
}
