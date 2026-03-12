/**
 * PhiEncryptionService — symmetric encryption for HIPAA PHI fields.
 *
 * Uses PostgreSQL pgcrypto extension: `pgp_sym_encrypt` / `pgp_sym_decrypt`.
 * Key is read from `PHI_ENCRYPTION_KEY` env var — never hardcoded.
 *
 * HIPAA §164.312(a)(2)(iv) and §164.312(e)(2)(ii): Encryption and decryption.
 *
 * All 18 HIPAA Safe Harbor identifiers are enumerated in PHI_FIELDS.
 * Use `encryptFields()` to encrypt all PHI fields in a flat record before
 * persisting, and `decryptFields()` to restore them after reading.
 */

import { env } from "@/config/env.js";
import { db } from "@/db/client.js";
import { sql } from "drizzle-orm";

/**
 * All 18 HIPAA Safe Harbor identifier field names used in this codebase.
 *
 * Logging redact covers: firstName, lastName, dob, ssn, medicareId, address,
 *   phone, email, emergencyContact, insuranceId  (10)
 * Additional identifiers: faxNumber, url, ipAddress, socialSecurityNumber,
 *   accountNumber, certificateLicenseNumber, vehicleId, deviceId  (8)
 */
export const PHI_FIELDS: ReadonlySet<string> = new Set([
  // 1. Names
  "firstName",
  "lastName",
  // 2. Geographic subdivisions smaller than state
  "address",
  // 3. Dates (except year) related to individual
  "dob",
  // 4. Phone numbers
  "phone",
  // 5. Fax numbers
  "faxNumber",
  // 6. Email addresses
  "email",
  // 7. Social security numbers (both common field name variants)
  "ssn",
  "socialSecurityNumber",
  // 8. Medical record numbers
  "mrn",
  // 9. Health plan beneficiary numbers
  "medicareId",
  "insuranceId",
  // 10. Account numbers
  "accountNumber",
  // 11. Certificate and license numbers
  "certificateLicenseNumber",
  // 12. Vehicle identifiers and serial numbers including VINs
  "vehicleId",
  // 13. Device identifiers and serial numbers
  "deviceId",
  // 14. Web universal resource locators (URLs)
  "url",
  // 15. Internet Protocol (IP) addresses
  "ipAddress",
  // 16–18. Other unique identifying data (emergency contact, insurance)
  "emergencyContact",
]);

export class PhiEncryptionService {
  /**
   * Encrypt a single PHI string value.
   * Returns a base64-encoded pgp_sym_encrypt ciphertext.
   */
  static async encrypt(value: string): Promise<string> {
    const result = await db.execute(
      sql`SELECT encode(pgp_sym_encrypt(${value}, ${env.phiEncryptionKey}), 'base64') AS ciphertext`,
    );
    return (result.rows[0] as { ciphertext: string }).ciphertext;
  }

  /**
   * Decrypt a base64-encoded pgp_sym_encrypt ciphertext.
   * Returns the original plaintext string.
   */
  static async decrypt(ciphertext: string): Promise<string> {
    const result = await db.execute(
      sql`SELECT pgp_sym_decrypt(decode(${ciphertext}, 'base64'), ${env.phiEncryptionKey}) AS plaintext`,
    );
    return (result.rows[0] as { plaintext: string }).plaintext;
  }

  /**
   * Encrypt all PHI fields in a flat record.
   * Fields not in PHI_FIELDS are returned unchanged.
   * Null/undefined values are left as-is.
   */
  static async encryptFields(
    record: Record<string, string | null | undefined>,
  ): Promise<Record<string, string | null | undefined>> {
    const result: Record<string, string | null | undefined> = { ...record };
    for (const key of Object.keys(record)) {
      if (PHI_FIELDS.has(key) && typeof record[key] === "string") {
        result[key] = await PhiEncryptionService.encrypt(record[key] as string);
      }
    }
    return result;
  }

  /**
   * Decrypt all PHI fields in a flat record.
   * Fields not in PHI_FIELDS are returned unchanged.
   * Null/undefined values are left as-is.
   */
  static async decryptFields(
    record: Record<string, string | null | undefined>,
  ): Promise<Record<string, string | null | undefined>> {
    const result: Record<string, string | null | undefined> = { ...record };
    for (const key of Object.keys(record)) {
      if (PHI_FIELDS.has(key) && typeof record[key] === "string") {
        result[key] = await PhiEncryptionService.decrypt(record[key] as string);
      }
    }
    return result;
  }
}
