import { getPool } from "./server-db"
import { CODE_DELIVERY_UNAVAILABLE_MESSAGE, verificationCodesAvailable } from "./verification-delivery"

export type CodeType = "login" | "register" | "reset-password"

const CODE_EXPIRY_MINUTES = 5
const MAX_CODES_PER_HOUR = 5

export async function generateAndSendCode(
  target: string,
  type: CodeType
): Promise<{ success: boolean; code?: string; error?: string }> {
  if (!verificationCodesAvailable()) return { success: false, error: CODE_DELIVERY_UNAVAILABLE_MESSAGE }
  const pool = getPool()

  const recentResult = await pool.query(
    `SELECT count(*)::int as count FROM verification_codes
     WHERE target = $1 AND created_at > now() - interval '1 hour'`,
    [target]
  )

  if (recentResult.rows[0].count >= MAX_CODES_PER_HOUR) {
    return { success: false, error: "发送次数过多，请 1 小时后再试" }
  }

  await pool.query(
    `UPDATE verification_codes SET used_at = now()
     WHERE target = $1 AND type = $2 AND used_at IS NULL AND expires_at > now()`,
    [target, type]
  )

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000)

  await pool.query(
    `INSERT INTO verification_codes (target, code, type, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [target, code, type, expiresAt.toISOString()]
  )

  console.log(`[AUTH DEV] Verification code for ${target}: ${code}`)
  return { success: true, code }
}

export async function verifyCode(
  target: string,
  code: string,
  type: CodeType
): Promise<boolean> {
  const pool = getPool()

  const result = await pool.query(
    `UPDATE verification_codes
     SET used_at = now()
     WHERE id = (
       SELECT id FROM verification_codes
       WHERE target = $1 AND code = $2 AND type = $3
         AND used_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1
     )
       AND used_at IS NULL AND expires_at > now()
     RETURNING id`,
    [target, code, type]
  )

  return result.rows.length > 0
}
