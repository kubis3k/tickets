import { createHash, randomBytes } from "node:crypto";

/** 32 náhodných bajtů, base64url (43 znaků). Do DB se ukládá jen `hashToken(token)`. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** sha256 hex. Token má 256 bitů entropie, takže rychlý hash stačí (není to heslo). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
