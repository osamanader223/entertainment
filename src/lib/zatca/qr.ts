/**
 * ZATCA Phase 1 (Generation Phase) QR code — 5-tag TLV, Base64-encoded.
 *
 * PHASE 1 ONLY. Real ZATCA Phase 2 (Integration Phase) QR codes carry 9
 * tags (these 5 plus the cryptographic stamp, hash, signature, and public
 * key) and require a ZATCA-issued certificate. None of that is built here
 * — this module implements exactly the 5-tag Phase 1 structure and nothing
 * more.
 *
 * TLV structure (repeated for each of the 5 tags), concatenated in order:
 *
 *   [1 byte: tag number] [1 byte: value length in BYTES] [N bytes: UTF-8 value]
 *
 *   Tag 1 — Seller name
 *   Tag 2 — VAT registration number
 *   Tag 3 — Invoice timestamp (ISO 8601, e.g. "2026-07-18T15:30:00Z")
 *   Tag 4 — Invoice total WITH VAT (decimal string, 2dp, e.g. "115.00")
 *   Tag 5 — VAT total (decimal string, 2dp, e.g. "15.00")
 *
 * All five TLV entries are concatenated into one buffer, then the WHOLE
 * buffer is Base64-encoded. That Base64 string is what actually gets
 * embedded as the QR code's scanned data payload — the QR image encodes
 * this string itself, not the raw TLV bytes (see qrcode usage in
 * src/components/invoices/invoice-qr.tsx).
 *
 * Length is the BYTE length of the UTF-8-encoded value, not the JS string
 * length — Arabic (and any non-ASCII) text is multi-byte, so this uses
 * Buffer.byteLength via Buffer.from(...).byteLength, never `.length`. The
 * one-byte length field caps any single tag's value at 255 bytes; seller
 * names/VAT numbers/timestamps/amounts are always far shorter than that in
 * practice, but encoding throws rather than silently truncating if it ever
 * isn't.
 */

const TAG_SELLER_NAME = 1;
const TAG_VAT_NUMBER = 2;
const TAG_TIMESTAMP = 3;
const TAG_TOTAL_WITH_VAT = 4;
const TAG_VAT_TOTAL = 5;

function tlvEncode(tag: number, value: string): Buffer {
  const valueBuf = Buffer.from(value, 'utf-8');
  if (valueBuf.byteLength > 255) {
    throw new Error(
      `ZATCA QR tag ${tag} value is ${valueBuf.byteLength} bytes — exceeds the 255-byte single-byte length field`,
    );
  }
  return Buffer.concat([Buffer.from([tag, valueBuf.byteLength]), valueBuf]);
}

export interface Phase1QrInput {
  sellerName: string;
  vatNumber: string;
  /** ISO 8601, e.g. "2026-07-18T15:30:00Z" */
  timestampISO: string;
  /** Decimal string, 2 places, e.g. "115.00" */
  totalWithVat: string;
  /** Decimal string, 2 places, e.g. "15.00" */
  vatTotal: string;
}

/** Builds the ZATCA Phase 1 5-tag TLV QR payload and returns it Base64-encoded. */
export function buildPhase1QrTlv(input: Phase1QrInput): string {
  const buffers = [
    tlvEncode(TAG_SELLER_NAME, input.sellerName),
    tlvEncode(TAG_VAT_NUMBER, input.vatNumber),
    tlvEncode(TAG_TIMESTAMP, input.timestampISO),
    tlvEncode(TAG_TOTAL_WITH_VAT, input.totalWithVat),
    tlvEncode(TAG_VAT_TOTAL, input.vatTotal),
  ];
  return Buffer.concat(buffers).toString('base64');
}

/**
 * Inverse of buildPhase1QrTlv — decodes a Base64 TLV payload back into its
 * 5 fields. Not part of the issuance path; exists for self-verification
 * (confirming a generated QR round-trips correctly) and for admin-side
 * debugging of an existing invoice's stored QR.
 */
export function decodePhase1QrTlv(base64: string): Phase1QrInput {
  const buf = Buffer.from(base64, 'base64');
  const fields: Record<number, string> = {};
  let offset = 0;
  while (offset < buf.length) {
    const tag = buf[offset];
    const length = buf[offset + 1];
    fields[tag] = buf.subarray(offset + 2, offset + 2 + length).toString('utf-8');
    offset += 2 + length;
  }
  return {
    sellerName: fields[TAG_SELLER_NAME] ?? '',
    vatNumber: fields[TAG_VAT_NUMBER] ?? '',
    timestampISO: fields[TAG_TIMESTAMP] ?? '',
    totalWithVat: fields[TAG_TOTAL_WITH_VAT] ?? '',
    vatTotal: fields[TAG_VAT_TOTAL] ?? '',
  };
}
