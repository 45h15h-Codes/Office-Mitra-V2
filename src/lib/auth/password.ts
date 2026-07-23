/**
 * lib/auth/password.ts
 *
 * Argon2id password hashing — server-only.
 * Never import from client bundles.
 */
import argon2 from "argon2";

// OWASP-recommended argon2id parameters (2024)
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,       // 3 iterations
  parallelism: 4,
};

/**
 * Hash a plain-text password.
 * Returns an argon2id encoded string (includes salt + params).
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/**
 * Verify a plain-text password against a stored argon2 hash.
 * Returns true if valid, false otherwise — never throws on bad password.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
