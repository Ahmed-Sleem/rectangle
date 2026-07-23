/**
 * Password hashing uses Node's scrypt KDF with per-password random salts and
 * timing-safe verification. No plaintext password is ever stored or returned.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const keyLength = 64;
const params = {
  cost: 32768,
  blockSize: 8,
  parallelization: 1,
} as const;

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, encodedHash: string): Promise<boolean>;
}

function deriveScryptKey(password: string, salt: Buffer, length: number, cost: number, blockSize: number, parallelization: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, { N: cost, r: blockSize, p: parallelization, maxmem: 64 * 1024 * 1024 }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(24);
    const key = await deriveScryptKey(password, salt, keyLength, params.cost, params.blockSize, params.parallelization);
    return [
      "scrypt",
      String(params.cost),
      String(params.blockSize),
      String(params.parallelization),
      salt.toString("base64url"),
      key.toString("base64url"),
    ].join("$");
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const [scheme, costRaw, blockSizeRaw, parallelizationRaw, saltRaw, keyRaw] = encodedHash.split("$");
    if (scheme !== "scrypt" || !costRaw || !blockSizeRaw || !parallelizationRaw || !saltRaw || !keyRaw) {
      return false;
    }
    const cost = Number.parseInt(costRaw, 10);
    const blockSize = Number.parseInt(blockSizeRaw, 10);
    const parallelization = Number.parseInt(parallelizationRaw, 10);
    if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelization)) {
      return false;
    }

    const salt = Buffer.from(saltRaw, "base64url");
    const expected = Buffer.from(keyRaw, "base64url");
    const actual = await deriveScryptKey(password, salt, expected.length, cost, blockSize, parallelization);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
