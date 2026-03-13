/**
 * FP15 — ML-DSA Post-Quantum Dual Signing (NIST FIPS 204)
 *
 * Implements ML-DSA-65 (Module-Lattice-Based Digital Signature Algorithm,
 * formerly CRYSTALS-Dilithium) alongside existing RSA-2048 signatures.
 *
 * Uses @noble/post-quantum which is already installed in the project.
 *
 * Security level: ML-DSA-65 = NIST Level 3 (128-bit quantum security)
 *   - Public key:  1,952 bytes
 *   - Private key: 4,000 bytes
 *   - Signature:   3,293 bytes
 */

import * as crypto from 'crypto';

// ── Dynamic Import ─────────────────────────────────────────────────────

/**
 * Lazy-load @noble/post-quantum to handle cases where the module
 * may not be available (e.g., in test environments).
 */
let _mlDsa: any = null;

async function getMlDsa(): Promise<any> {
  if (_mlDsa) return _mlDsa;
  try {
    const mod = await import('@noble/post-quantum/ml-dsa');
    _mlDsa = mod.ml_dsa65;
    return _mlDsa;
  } catch {
    return null;
  }
}

// ── Types ──────────────────────────────────────────────────────────────

export interface MlDsaKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface HybridSignature {
  rsaSignature: string;       // base64 RSA-2048-SHA256
  mlDsaSignature: string;     // base64 ML-DSA-65
  algorithm: 'RSA2048+MLDSA65';
  publicKeyMlDsa: string;     // base64 ML-DSA public key (for verification)
}

export interface HybridVerifyResult {
  rsa: boolean;
  mlDsa: boolean;
  bothValid: boolean;
  pqcAvailable: boolean;
}

// ── PQC Signer ─────────────────────────────────────────────────────────

export class PqcSigner {
  private secretKey: Uint8Array;
  private publicKey: Uint8Array;

  constructor(secretKey: Uint8Array, publicKey: Uint8Array) {
    this.secretKey = secretKey;
    this.publicKey = publicKey;
  }

  /**
   * Generate an ML-DSA-65 key pair.
   */
  static async generateKeyPair(): Promise<MlDsaKeyPair> {
    const mlDsa = await getMlDsa();
    if (!mlDsa) {
      throw new Error('ML-DSA not available — @noble/post-quantum not installed');
    }
    const { publicKey, secretKey } = mlDsa.keygen();
    return { publicKey, secretKey };
  }

  /**
   * Sign a message with ML-DSA-65.
   */
  async sign(message: Buffer | string): Promise<Buffer> {
    const mlDsa = await getMlDsa();
    if (!mlDsa) {
      throw new Error('ML-DSA not available');
    }
    const msgBytes = typeof message === 'string' ? Buffer.from(message, 'utf8') : message;
    const sig = mlDsa.sign(this.secretKey, msgBytes);
    return Buffer.from(sig);
  }

  /**
   * Verify an ML-DSA-65 signature.
   */
  static async verify(
    message: Buffer | string,
    signature: Buffer,
    publicKey: Uint8Array
  ): Promise<boolean> {
    const mlDsa = await getMlDsa();
    if (!mlDsa) return false;

    try {
      const msgBytes = typeof message === 'string' ? Buffer.from(message, 'utf8') : message;
      return mlDsa.verify(publicKey, msgBytes, signature);
    } catch {
      return false;
    }
  }

  getPublicKey(): Uint8Array {
    return this.publicKey;
  }
}

// ── Hybrid Signer ──────────────────────────────────────────────────────

export class HybridSigner {
  private rsaPrivateKey: string;
  private rsaPublicKeyOrCert: string;
  private pqcSigner: PqcSigner | null;
  private pqcPublicKey: Uint8Array | null;

  constructor(
    rsaPrivateKey: string,
    rsaPublicKeyOrCert: string,
    pqcSigner?: PqcSigner,
    pqcPublicKey?: Uint8Array
  ) {
    this.rsaPrivateKey = rsaPrivateKey;
    this.rsaPublicKeyOrCert = rsaPublicKeyOrCert;
    this.pqcSigner = pqcSigner ?? null;
    this.pqcPublicKey = pqcPublicKey ?? pqcSigner?.getPublicKey() ?? null;
  }

  /**
   * Create a HybridSigner with fresh ML-DSA keys.
   */
  static async create(rsaPrivateKey: string, rsaPublicKeyOrCert: string): Promise<HybridSigner> {
    try {
      const keyPair = await PqcSigner.generateKeyPair();
      const pqcSigner = new PqcSigner(keyPair.secretKey, keyPair.publicKey);
      return new HybridSigner(rsaPrivateKey, rsaPublicKeyOrCert, pqcSigner, keyPair.publicKey);
    } catch {
      // PQC not available — RSA-only mode
      return new HybridSigner(rsaPrivateKey, rsaPublicKeyOrCert);
    }
  }

  /**
   * Dual-sign content with RSA-2048 + ML-DSA-65.
   */
  async sign(content: string): Promise<HybridSignature> {
    // RSA signature
    const rsaSigner = crypto.createSign('SHA256');
    rsaSigner.update(content, 'utf8');
    const rsaSignature = rsaSigner.sign(this.rsaPrivateKey, 'base64');

    // ML-DSA signature
    let mlDsaSignature = '';
    let publicKeyMlDsa = '';

    if (this.pqcSigner) {
      try {
        const sig = await this.pqcSigner.sign(content);
        mlDsaSignature = sig.toString('base64');
        publicKeyMlDsa = Buffer.from(this.pqcPublicKey!).toString('base64');
      } catch {
        // PQC degraded — RSA only
        mlDsaSignature = 'PQC_DEGRADED';
      }
    } else {
      mlDsaSignature = 'PQC_NOT_AVAILABLE';
    }

    return {
      rsaSignature,
      mlDsaSignature,
      algorithm: 'RSA2048+MLDSA65',
      publicKeyMlDsa,
    };
  }

  /**
   * Verify a hybrid signature.
   */
  async verify(content: string, sig: HybridSignature): Promise<HybridVerifyResult> {
    // Verify RSA
    let rsa = false;
    try {
      const verifier = crypto.createVerify('SHA256');
      verifier.update(content, 'utf8');
      rsa = verifier.verify(this.rsaPublicKeyOrCert, sig.rsaSignature, 'base64');
    } catch {
      rsa = false;
    }

    // Verify ML-DSA
    let mlDsa = false;
    let pqcAvailable = false;

    if (sig.mlDsaSignature && sig.mlDsaSignature !== 'PQC_DEGRADED' && sig.mlDsaSignature !== 'PQC_NOT_AVAILABLE' && sig.publicKeyMlDsa) {
      pqcAvailable = true;
      try {
        const pubKey = new Uint8Array(Buffer.from(sig.publicKeyMlDsa, 'base64'));
        const sigBuf = Buffer.from(sig.mlDsaSignature, 'base64');
        mlDsa = await PqcSigner.verify(content, sigBuf, pubKey);
      } catch {
        mlDsa = false;
      }
    }

    return {
      rsa,
      mlDsa,
      bothValid: rsa && (mlDsa || !pqcAvailable),
      pqcAvailable,
    };
  }
}
