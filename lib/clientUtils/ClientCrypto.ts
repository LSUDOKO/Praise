/**
 * WebAuthn PRF → secp256k1 Ethereum private key derivation.
 * Plus AES-GCM encryption helpers for local recovery key storage.
 */

export const SECP256K1_N = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
);

export function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBuf(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const len = cleanHex.length;
  const view = new Uint8Array(len / 2);
  for (let i = 0; i < len; i += 2) {
    view[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return view;
}

/**
 * Derive a valid Ethereum private key from a WebAuthn PRF output.
 */
export async function prfToValidEthPrivKey(
  prfOutput: ArrayBuffer,
  infoLabel: Uint8Array
): Promise<`0x${string}`> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    prfOutput,
    "HKDF",
    false,
    ["deriveBits"]
  );

  const salt = new Uint8Array(32); // 32 zero bytes

  for (let counter = 0; counter < 16; counter++) {
    const info = new Uint8Array(infoLabel.byteLength + 1);
    info.set(infoLabel, 0);
    info[infoLabel.byteLength] = counter;

    const bits = await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info },
      baseKey,
      8 * 32 // 256 bits
    );
    const privBytes = new Uint8Array(bits);

    let n = 0n;
    for (const b of privBytes) n = (n << 8n) + BigInt(b);
    if (n === 0n) continue;
    if (n >= SECP256K1_N) continue;

    return `0x${bufToHex(privBytes.buffer)}` as `0x${string}`;
  }

  throw new Error("Failed to derive valid secp256k1 private key after 16 attempts");
}

/**
 * Derive a CryptoKey from a recovery phrase and salt using PBKDF2.
 */
export async function deriveEncryptionKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a private key string with a derived CryptoKey using AES-GCM.
 */
export async function encryptPrivateKey(
  privateKey: string,
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(privateKey)
  );

  return {
    ciphertext: bufToHex(ciphertextBuffer),
    iv: bufToHex(iv.buffer),
  };
}

/**
 * Decrypt a private key string from ciphertext and iv with a derived CryptoKey.
 */
export async function decryptPrivateKey(
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const dec = new TextDecoder();
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBuf(iv) as any },
    key,
    hexToBuf(ciphertext) as any
  );

  return dec.decode(decryptedBuffer);
}
