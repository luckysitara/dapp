// src/shared/services/EncryptionService.ts
import * as nacl from 'tweetnacl';
import { Keypair } from '@solana/web3.js';
import * as AES from 'expo-crypto';
import { encode, decode } from 'js-base64';

export class EncryptionService {
  /**
   * Generates a new X25519 key pair.
   * This might not be directly used if the Seeker's private key comes from MWA.
   * @returns A nacl.BoxKeyPair containing publicKey and secretKey.
   */
  static generateX25519KeyPair(): nacl.BoxKeyPair {
    return nacl.box.keyPair();
  }

  /**
   * Derives a shared secret using X25519.
   *
   * @param seekerPrivateKey The Seeker's private key (Uint8Array, 32 bytes).
   * @param recipientPublicKey The recipient's public key (Uint8Array, 32 bytes).
   * @returns The shared secret (Uint8Array, 32 bytes).
   */
  static deriveSharedSecret(
    seekerPrivateKey: Uint8Array,
    recipientPublicKey: Uint8Array
  ): Uint8Array {
    // tweetnacl's box.before does X25519 key agreement
    // It expects a 32-byte secret key and a 32-byte public key.
    return nacl.box.before(recipientPublicKey, seekerPrivateKey);
  }

  /**
   * Encrypts a payload using AES-256-GCM with a derived shared secret.
   *
   * @param sharedSecret The 32-byte shared secret derived from X25519.
   * @param payload The string to encrypt.
   * @returns An object containing the IV, ciphertext, and authentication tag, all in Base64.
   */
  static async encrypt(
    sharedSecret: Uint8Array,
    payload: string
  ): Promise<{ iv: string; ciphertext: string; tag: string }> {
    // Generate a random 12-byte IV (Initialization Vector) for AES-GCM
    const iv = AES.getRandomBytes(12);

    // Convert shared secret to a CryptoKey for AES-GCM
    const key = await crypto.subtle.importKey(
      'raw',
      sharedSecret,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    // Convert payload to Uint8Array
    const encodedPayload = new TextEncoder().encode(payload);

    // Encrypt the payload
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encodedPayload
    );

    // The encrypted result includes both ciphertext and authentication tag.
    // The tag is appended to the ciphertext in AES-GCM output.
    // Standard GCM tag size is 16 bytes.
    const tagLength = 16;
    const ciphertext = new Uint8Array(encrypted, 0, encrypted.byteLength - tagLength);
    const tag = new Uint8Array(encrypted, encrypted.byteLength - tagLength, tagLength);

    return {
      iv: encode(iv),
      ciphertext: encode(ciphertext),
      tag: encode(tag),
    };
  }

  /**
   * Decrypts an AES-256-GCM encrypted payload using a derived shared secret.
   *
   * @param sharedSecret The 32-byte shared secret.
   * @param encryptedData An object containing the IV, ciphertext, and authentication tag, all in Base64.
   * @returns The decrypted string.
   */
  static async decrypt(
    sharedSecret: Uint8Array,
    encryptedData: { iv: string; ciphertext: string; tag: string }
  ): Promise<string> {
    const iv = decode(encryptedData.iv);
    const ciphertext = decode(encryptedData.ciphertext);
    const tag = decode(encryptedData.tag);

    // Reconstruct the full encrypted buffer (ciphertext + tag)
    const fullEncrypted = new Uint8Array(ciphertext.byteLength + tag.byteLength);
    fullEncrypted.set(ciphertext, 0);
    fullEncrypted.set(tag, ciphertext.byteLength);

    // Convert shared secret to a CryptoKey for AES-GCM
    const key = await crypto.subtle.importKey(
      'raw',
      sharedSecret,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // Decrypt the payload
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      fullEncrypted
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Placeholder function to fetch a recipient's X25519 public key.
   * In a real application, this would involve a server call or on-chain lookup.
   * For now, it might return a hardcoded or simulated public key.
   *
   * @param recipientIdentifier The identifier of the recipient (e.g., Solana Public Key, .sol handle).
   * @returns A promise that resolves to the recipient's X25519 public key (Uint8Array).
   */
  static async fetchRecipientX25519PublicKey(
    recipientIdentifier: string
  ): Promise<Uint8Array> {
    // TODO: Implement actual logic to fetch recipient's X25519 public key
    // This might involve:
    // 1. Looking up a Solana Public Key from a .sol handle.
    // 2. Fetching an associated X25519 public key from a user profile service.
    console.warn(
      `[EncryptionService] fetchRecipientX25519PublicKey for ${recipientIdentifier} is a placeholder.`
    );
    // For demonstration, return a generated key. In production, this would be retrieved securely.
    return EncryptionService.generateX25519KeyPair().publicKey;
  }
}