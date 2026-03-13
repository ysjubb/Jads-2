/**
 * FP12 — XMLDSig Signing for NPNT Permission Artefacts
 *
 * Implements W3C XMLDSig enveloped signature:
 *   XML Canonicalization 1.1 → SHA-256 digest → RSA-2048 signature
 *
 * For iDEX demo: uses Node.js native crypto with self-signed certificates.
 * Production: requires DGCA-recognized CA certificate.
 */

import * as crypto from 'crypto';
import { ExclusiveCanonicalization } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';

// ── Types ──────────────────────────────────────────────────────────────

export interface XmlDsigSignResult {
  signedXml: string;
  digestValue: string;       // base64 SHA-256 of canonicalized content
  signatureValue: string;    // base64 RSA-SHA256 of canonicalized SignedInfo
  certificatePem: string;    // The certificate used
}

export interface XmlDsigVerifyResult {
  valid: boolean;
  errors: string[];
  signerCN: string;
  signerIssuer: string;
  certExpiry: Date | null;
  digestAlgorithm: string;
  signatureAlgorithm: string;
}

// ── Canonicalization (W3C Exclusive C14N 1.0) ─────────────────────────

/**
 * W3C Exclusive XML Canonicalization 1.0 (xml-crypto). Required for XMLDSig
 * compliance with DGCA NPNT v1.2 specification.
 * Algorithm URI: http://www.w3.org/2001/10/xml-exc-c14n#
 */
function canonicalize(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const c14n = new ExclusiveCanonicalization();
  return c14n.process(doc.documentElement).toString();
}

/**
 * Remove the Signature element for enveloped signature digest computation.
 */
function removeSignatureElement(xml: string): string {
  return xml.replace(/<Signature[\s\S]*?<\/Signature>/g, '').trim();
}

// ── Signer ─────────────────────────────────────────────────────────────

/**
 * Sign a NPNT PA XML document with RSA-2048 + SHA-256.
 *
 * @param unsignedXml    The PA XML without a Signature element
 * @param privateKeyPem  RSA-2048 private key in PEM format
 * @param certificatePem X.509 certificate in PEM format
 * @returns              The signed XML with Signature element appended
 */
export function signPaXml(
  unsignedXml: string,
  privateKeyPem: string,
  certificatePem: string
): XmlDsigSignResult {
  // Step 1: Canonicalize the unsigned XML (with Signature removed for safety)
  const contentToDigest = canonicalize(removeSignatureElement(unsignedXml));

  // Step 2: Compute SHA-256 digest
  const digestBuffer = crypto.createHash('sha256').update(contentToDigest, 'utf8').digest();
  const digestValue = digestBuffer.toString('base64');

  // Step 3: Build SignedInfo element
  const signedInfo = buildSignedInfoXml(digestValue);

  // Step 4: Canonicalize SignedInfo
  const canonicalSignedInfo = canonicalize(signedInfo);

  // Step 5: Sign with RSA-2048 SHA-256
  const signer = crypto.createSign('SHA256');
  signer.update(canonicalSignedInfo, 'utf8');
  const signatureValue = signer.sign(privateKeyPem, 'base64');

  // Step 6: Extract certificate base64 (strip PEM headers)
  const certBase64 = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');

  // Step 7: Build complete Signature block
  const signatureBlock = buildSignatureXml(signedInfo, signatureValue, certBase64);

  // Step 8: Insert before closing </UAPermission>
  const signedXml = unsignedXml.replace(
    '</UAPermission>',
    `  ${signatureBlock}\n</UAPermission>`
  );

  return {
    signedXml,
    digestValue,
    signatureValue,
    certificatePem,
  };
}

/**
 * Build the SignedInfo XML element.
 */
function buildSignedInfoXml(digestValue: string): string {
  return `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
    <CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
    <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
    <Reference URI="">
      <Transforms>
        <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
        <Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
      </Transforms>
      <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
      <DigestValue>${digestValue}</DigestValue>
    </Reference>
  </SignedInfo>`;
}

/**
 * Build the complete Signature XML block.
 */
function buildSignatureXml(
  signedInfo: string,
  signatureValue: string,
  certBase64: string
): string {
  return `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
  ${signedInfo}
  <SignatureValue>${signatureValue}</SignatureValue>
  <KeyInfo>
    <X509Data>
      <X509Certificate>${certBase64}</X509Certificate>
    </X509Data>
  </KeyInfo>
</Signature>`;
}

// ── Verifier ───────────────────────────────────────────────────────────

/**
 * Verify the XMLDSig signature on a signed PA XML.
 */
export function verifyPaSignature(signedXml: string): XmlDsigVerifyResult {
  const errors: string[] = [];
  let signerCN = '';
  let signerIssuer = '';
  let certExpiry: Date | null = null;

  try {
    // Extract SignatureValue
    const sigMatch = signedXml.match(/<SignatureValue>([^<]+)<\/SignatureValue>/);
    if (!sigMatch) {
      errors.push('No SignatureValue found in XML');
      return { valid: false, errors, signerCN, signerIssuer, certExpiry, digestAlgorithm: '', signatureAlgorithm: '' };
    }
    const signatureValue = sigMatch[1].trim();

    // Extract DigestValue
    const digestMatch = signedXml.match(/<DigestValue>([^<]+)<\/DigestValue>/);
    if (!digestMatch) {
      errors.push('No DigestValue found in XML');
      return { valid: false, errors, signerCN, signerIssuer, certExpiry, digestAlgorithm: '', signatureAlgorithm: '' };
    }
    const storedDigest = digestMatch[1].trim();

    // Extract certificate
    const certMatch = signedXml.match(/<X509Certificate>([^<]+)<\/X509Certificate>/);
    if (!certMatch) {
      errors.push('No X509Certificate found in XML');
      return { valid: false, errors, signerCN, signerIssuer, certExpiry, digestAlgorithm: '', signatureAlgorithm: '' };
    }
    const certBase64 = certMatch[1].trim();
    const certPem = `-----BEGIN CERTIFICATE-----\n${certBase64}\n-----END CERTIFICATE-----`;

    // Parse certificate info
    try {
      const cert = new crypto.X509Certificate(certPem);
      signerCN = cert.subject.split('CN=')[1]?.split(',')[0] ?? 'Unknown';
      signerIssuer = cert.issuer;
      // cert.validTo is a string like "Jan  1 00:00:00 2027 GMT"
      certExpiry = new Date(cert.validTo);

      // Check expiry
      if (new Date() > certExpiry) {
        errors.push(`Certificate expired on ${certExpiry.toISOString()}`);
      }
    } catch {
      errors.push('Failed to parse X.509 certificate');
    }

    // Recompute digest of content (without Signature element)
    const contentToDigest = canonicalize(removeSignatureElement(signedXml));
    const recomputedDigest = crypto.createHash('sha256').update(contentToDigest, 'utf8').digest('base64');

    if (recomputedDigest !== storedDigest) {
      errors.push(`Digest mismatch: computed ${recomputedDigest}, stored ${storedDigest}`);
    }

    // Verify RSA signature
    // Rebuild SignedInfo with the stored digest
    const signedInfo = buildSignedInfoXml(storedDigest);
    const canonicalSignedInfo = canonicalize(signedInfo);

    const verifier = crypto.createVerify('SHA256');
    verifier.update(canonicalSignedInfo, 'utf8');
    const sigValid = verifier.verify(certPem, signatureValue, 'base64');

    if (!sigValid) {
      errors.push('RSA-SHA256 signature verification failed');
    }
  } catch (e: any) {
    errors.push(`Verification error: ${e.message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    signerCN,
    signerIssuer,
    certExpiry,
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  };
}

// ── Demo Certificate Generator ─────────────────────────────────────────

import * as x509 from '@peculiar/x509';

// Use Node.js built-in WebCrypto for @peculiar/x509
x509.cryptoProvider.set(globalThis.crypto);

/**
 * FOR DEMO/DEV ONLY. Generates a self-signed RSA-2048 X.509 certificate.
 * The resulting certificate is cryptographically valid but NOT issued by DGCA.
 * Production requires a certificate from a CCA India licensed CA (eMudhra, CDAC).
 * @returns { privateKey: PKCS8 PEM, certificate: X.509 PEM }
 */
export async function generateDemoCertificate(): Promise<{ privateKey: string; certificate: string }> {
  const alg: RsaHashedKeyGenParams = {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-256',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
  };

  const keys = await globalThis.crypto.subtle.generateKey(alg, true, ['sign', 'verify']);

  // Generate random serial number (8 bytes, hex-encoded)
  const serialBytes = crypto.randomBytes(8);
  const serialNumber = serialBytes.toString('hex');

  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber,
    name: 'CN=JADS Demo PA Signer, O=JADS Platform, C=IN',
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    keys,
    signingAlgorithm: alg,
    extensions: [
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.3'], false), // Code Signing
    ],
  });

  // Export certificate as PEM
  const certificate = cert.toString('pem');

  // Export private key as PKCS#8 PEM
  const pkcs8 = await globalThis.crypto.subtle.exportKey('pkcs8', keys.privateKey);
  const pkBase64 = Buffer.from(pkcs8).toString('base64');
  const pkLines = pkBase64.match(/.{1,64}/g)!.join('\n');
  const privateKey = `-----BEGIN PRIVATE KEY-----\n${pkLines}\n-----END PRIVATE KEY-----`;

  return { privateKey, certificate };
}
