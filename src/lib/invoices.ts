import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildPhase1QrTlv } from '@/lib/zatca/qr';

const VAT_RATE = 15.0;

export interface InvoiceLineItem {
  description_en: string;
  description_ar: string;
  qty: number;
  unit_price_cents: number;
  vat_cents: number;
  total_cents: number;
}

export interface IssueInvoiceForPaymentInput {
  tenantId: string;
  branchId: string;
  paymentId: string;
  sessionId?: string;
  /** Present => a standard B2B invoice; absent => simplified B2C. */
  buyerName?: string;
  buyerVatNumber?: string;
  issuedBy?: string;
}

export interface IssueInvoiceResult {
  invoiceId: string;
  invoiceNumber: number;
  qrBase64: string;
}

/**
 * Issue a ZATCA Phase 1 invoice for a completed, captured payment.
 * Idempotent — one invoice per payment, ever; calling this twice for the
 * same paymentId just returns the invoice already on file.
 */
export async function issueInvoiceForPayment(input: IssueInvoiceForPaymentInput): Promise<IssueInvoiceResult> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('invoices')
    .select('id, invoice_number, qr_tlv_base64')
    .eq('source_payment_id', input.paymentId)
    .maybeSingle();
  if (existing) {
    return { invoiceId: existing.id, invoiceNumber: existing.invoice_number, qrBase64: existing.qr_tlv_base64 };
  }

  // Seller snapshot — frozen into the invoice row, never read live again.
  const { data: branch, error: branchError } = await admin
    .from('branches')
    .select(
      'legal_name_ar, legal_name_en, vat_number, address_street, address_district, address_city, address_postal_code, address_building_no',
    )
    .eq('id', input.branchId)
    .maybeSingle();
  if (branchError || !branch) throw new Error('Branch not found');
  if (!branch.vat_number || !(branch.legal_name_ar || branch.legal_name_en)) {
    // Never issue a non-compliant invoice — this is the one thing Phase 1
    // absolutely requires (seller name + VAT number on every QR tag).
    throw new Error('venue_tax_details_not_configured');
  }

  const sellerName = branch.legal_name_ar || branch.legal_name_en!;
  const sellerAddress =
    [branch.address_building_no, branch.address_street, branch.address_district, branch.address_city, branch.address_postal_code]
      .filter(Boolean)
      .join(', ') || null;

  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .select('id, amount_cents, session_id, status')
    .eq('id', input.paymentId)
    .maybeSingle();
  if (paymentError || !payment) throw new Error('Payment not found');
  if (payment.status !== 'captured') throw new Error('payment_not_captured');

  const sessionId = input.sessionId ?? payment.session_id ?? undefined;
  const { descriptionEn, descriptionAr } = await describeLineItem(admin, sessionId);

  // amount_cents is VAT-INCLUSIVE — this app has always shown customers one
  // all-in price (e.g. "15 SAR/hr"), never a separate "+VAT" line anywhere
  // in booking/cashier/pricing, so the charged total is the VAT-inclusive
  // figure. Subtotal is back-calculated: subtotal = total / 1.15. Rounded
  // once at the invoice level, not per line — there is only ever one line
  // item per transaction in this system today, so the distinction is moot
  // in practice, but if multi-line invoices are added later, round the
  // invoice-level VAT total, not each line's VAT independently (ZATCA
  // simplified-invoice guidance totals VAT at the invoice level).
  const totalCents = payment.amount_cents;
  const subtotalCents = Math.round(totalCents / (1 + VAT_RATE / 100));
  const vatAmountCents = totalCents - subtotalCents;

  const lineItems: InvoiceLineItem[] = [
    {
      description_en: descriptionEn,
      description_ar: descriptionAr,
      qty: 1,
      unit_price_cents: subtotalCents,
      vat_cents: vatAmountCents,
      total_cents: totalCents,
    },
  ];

  const issuedAt = new Date();
  const qrBase64 = buildPhase1QrTlv({
    sellerName,
    vatNumber: branch.vat_number,
    timestampISO: issuedAt.toISOString(),
    totalWithVat: (totalCents / 100).toFixed(2),
    vatTotal: (vatAmountCents / 100).toFixed(2),
  });

  const invoiceType = input.buyerVatNumber ? 'standard' : 'simplified';

  const { data: invoiceRaw, error: issueError } = await admin.rpc('issue_invoice', {
    p_tenant_id: input.tenantId,
    p_branch_id: input.branchId,
    p_invoice_type: invoiceType,
    p_seller_name: sellerName,
    p_seller_vat_number: branch.vat_number,
    p_seller_address: sellerAddress,
    p_buyer_name: input.buyerName ?? null,
    p_buyer_vat_number: input.buyerVatNumber ?? null,
    p_subtotal_cents: subtotalCents,
    p_vat_rate: VAT_RATE,
    p_vat_amount_cents: vatAmountCents,
    p_total_cents: totalCents,
    p_line_items: lineItems,
    p_qr_tlv_base64: qrBase64,
    p_issued_by: input.issuedBy ?? null,
    p_source_payment_id: input.paymentId,
    p_source_session_id: sessionId ?? null,
    p_corrects_invoice_id: null,
  } as never);

  if (issueError || !invoiceRaw) throw issueError ?? new Error('Failed to issue invoice');
  const invoice = invoiceRaw as unknown as { id: string; invoice_number: number };

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    branch_id: input.branchId,
    actor_id: input.issuedBy ?? null,
    actor_role: null,
    action: 'invoice.issued',
    entity_type: 'invoice',
    entity_id: invoice.id,
    after: { invoice_number: invoice.invoice_number, total_cents: totalCents, invoice_type: invoiceType },
  });

  return { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, qrBase64 };
}

export interface IssueInvoiceForTabSettlementInput {
  tenantId: string;
  branchId: string;
  tabId: string;
  totalCents: number;
  buyerName?: string;
  buyerVatNumber?: string;
  issuedBy?: string;
}

/**
 * Issue a ZATCA Phase 1 invoice for a settled tab. A split-payment
 * settlement can produce several `payments` rows (one per tender), so unlike
 * issueInvoiceForPayment this doesn't resolve a single payment — it bills
 * the tab's total directly and traces back via source_tab_id instead of
 * source_payment_id. Idempotent — one invoice per tab, ever.
 */
export async function issueInvoiceForTabSettlement(input: IssueInvoiceForTabSettlementInput): Promise<IssueInvoiceResult> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('invoices')
    .select('id, invoice_number, qr_tlv_base64')
    .eq('source_tab_id', input.tabId)
    .maybeSingle();
  if (existing) {
    return { invoiceId: existing.id, invoiceNumber: existing.invoice_number, qrBase64: existing.qr_tlv_base64 };
  }

  const { data: branch, error: branchError } = await admin
    .from('branches')
    .select(
      'legal_name_ar, legal_name_en, vat_number, address_street, address_district, address_city, address_postal_code, address_building_no',
    )
    .eq('id', input.branchId)
    .maybeSingle();
  if (branchError || !branch) throw new Error('Branch not found');
  if (!branch.vat_number || !(branch.legal_name_ar || branch.legal_name_en)) {
    throw new Error('venue_tax_details_not_configured');
  }

  const sellerName = branch.legal_name_ar || branch.legal_name_en!;
  const sellerAddress =
    [branch.address_building_no, branch.address_street, branch.address_district, branch.address_city, branch.address_postal_code]
      .filter(Boolean)
      .join(', ') || null;

  const { data: tab } = await admin.from('tabs').select('label').eq('id', input.tabId).maybeSingle();
  const label = tab?.label ?? 'Tab';

  const totalCents = input.totalCents;
  const subtotalCents = Math.round(totalCents / (1 + VAT_RATE / 100));
  const vatAmountCents = totalCents - subtotalCents;

  const lineItems: InvoiceLineItem[] = [
    {
      description_en: `Tab settlement — ${label}`,
      description_ar: `تسوية حساب — ${label}`,
      qty: 1,
      unit_price_cents: subtotalCents,
      vat_cents: vatAmountCents,
      total_cents: totalCents,
    },
  ];

  const issuedAt = new Date();
  const qrBase64 = buildPhase1QrTlv({
    sellerName,
    vatNumber: branch.vat_number,
    timestampISO: issuedAt.toISOString(),
    totalWithVat: (totalCents / 100).toFixed(2),
    vatTotal: (vatAmountCents / 100).toFixed(2),
  });

  const invoiceType = input.buyerVatNumber ? 'standard' : 'simplified';

  const { data: invoiceRaw, error: issueError } = await admin.rpc('issue_invoice', {
    p_tenant_id: input.tenantId,
    p_branch_id: input.branchId,
    p_invoice_type: invoiceType,
    p_seller_name: sellerName,
    p_seller_vat_number: branch.vat_number,
    p_seller_address: sellerAddress,
    p_buyer_name: input.buyerName ?? null,
    p_buyer_vat_number: input.buyerVatNumber ?? null,
    p_subtotal_cents: subtotalCents,
    p_vat_rate: VAT_RATE,
    p_vat_amount_cents: vatAmountCents,
    p_total_cents: totalCents,
    p_line_items: lineItems,
    p_qr_tlv_base64: qrBase64,
    p_issued_by: input.issuedBy ?? null,
    p_source_payment_id: null,
    p_source_session_id: null,
    p_corrects_invoice_id: null,
    p_source_tab_id: input.tabId,
  } as never);

  if (issueError || !invoiceRaw) throw issueError ?? new Error('Failed to issue invoice');
  const invoice = invoiceRaw as unknown as { id: string; invoice_number: number };

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    branch_id: input.branchId,
    actor_id: input.issuedBy ?? null,
    actor_role: null,
    action: 'invoice.issued',
    entity_type: 'invoice',
    entity_id: invoice.id,
    after: { invoice_number: invoice.invoice_number, total_cents: totalCents, invoice_type: invoiceType, source_tab_id: input.tabId },
  });

  return { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, qrBase64 };
}

async function describeLineItem(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string | undefined,
): Promise<{ descriptionEn: string; descriptionAr: string }> {
  if (!sessionId) return { descriptionEn: 'Session', descriptionAr: 'جلسة لعب' };

  const { data: session } = await admin.from('sessions').select('station_id').eq('id', sessionId).maybeSingle();
  if (!session?.station_id) return { descriptionEn: 'Session', descriptionAr: 'جلسة لعب' };

  const { data: station } = await admin
    .from('stations')
    .select('display_name, game_type_id')
    .eq('id', session.station_id)
    .maybeSingle();
  if (!station) return { descriptionEn: 'Session', descriptionAr: 'جلسة لعب' };

  const { data: gameType } = await admin
    .from('game_types')
    .select('display_name_en, display_name_ar')
    .eq('id', station.game_type_id)
    .maybeSingle();

  return {
    descriptionEn: `${gameType?.display_name_en ?? 'Session'} — ${station.display_name}`,
    descriptionAr: `${gameType?.display_name_ar ?? 'جلسة'} — ${station.display_name}`,
  };
}

export interface IssueCreditNoteInput {
  tenantId: string;
  branchId: string;
  originalInvoiceId: string;
  issuedBy?: string;
}

/**
 * PART 6 stub — the mechanism for corrections, not a full refund workflow.
 * Invoices are immutable (DB triggers enforce it), so a correction is
 * always a NEW invoice of type 'credit_note' pointing at the original via
 * corrects_invoice_id — the original row is never touched. Mirrors the
 * original's amounts as negative (ZATCA convention for a full credit note);
 * partial credits, reason codes, and wiring an actual wallet refund are
 * future work, not built here.
 */
export async function issueCreditNote(input: IssueCreditNoteInput): Promise<IssueInvoiceResult> {
  const admin = createAdminClient();

  const { data: original, error } = await admin
    .from('invoices')
    .select('*')
    .eq('id', input.originalInvoiceId)
    .maybeSingle();
  if (error || !original) throw new Error('Original invoice not found');
  if (original.invoice_type === 'credit_note' || original.invoice_type === 'debit_note') {
    throw new Error('cannot_correct_a_correction');
  }

  const qrBase64 = buildPhase1QrTlv({
    sellerName: original.seller_name,
    vatNumber: original.seller_vat_number,
    timestampISO: new Date().toISOString(),
    totalWithVat: (original.total_cents / 100).toFixed(2),
    vatTotal: (original.vat_amount_cents / 100).toFixed(2),
  });

  const { data: invoiceRaw, error: issueError } = await admin.rpc('issue_invoice', {
    p_tenant_id: input.tenantId,
    p_branch_id: input.branchId,
    p_invoice_type: 'credit_note',
    p_seller_name: original.seller_name,
    p_seller_vat_number: original.seller_vat_number,
    p_seller_address: original.seller_address,
    p_buyer_name: original.buyer_name,
    p_buyer_vat_number: original.buyer_vat_number,
    p_subtotal_cents: -original.subtotal_cents,
    p_vat_rate: original.vat_rate,
    p_vat_amount_cents: -original.vat_amount_cents,
    p_total_cents: -original.total_cents,
    p_line_items: original.line_items,
    p_qr_tlv_base64: qrBase64,
    p_issued_by: input.issuedBy ?? null,
    p_source_payment_id: original.source_payment_id,
    p_source_session_id: original.source_session_id,
    p_corrects_invoice_id: original.id,
  } as never);
  if (issueError || !invoiceRaw) throw issueError ?? new Error('Failed to issue credit note');
  const invoice = invoiceRaw as unknown as { id: string; invoice_number: number };

  await admin.from('activity_log').insert({
    tenant_id: input.tenantId,
    branch_id: input.branchId,
    actor_id: input.issuedBy ?? null,
    actor_role: null,
    action: 'invoice.credit_note_issued',
    entity_type: 'invoice',
    entity_id: invoice.id,
    after: { corrects_invoice_id: original.id, invoice_number: invoice.invoice_number },
  });

  return { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, qrBase64 };
}

export interface InvoiceRow {
  id: string;
  invoice_number: number;
  invoice_type: 'standard' | 'simplified' | 'credit_note' | 'debit_note';
  seller_name: string;
  seller_vat_number: string;
  seller_address: string | null;
  buyer_name: string | null;
  buyer_vat_number: string | null;
  subtotal_cents: number;
  vat_rate: number;
  vat_amount_cents: number;
  total_cents: number;
  line_items: InvoiceLineItem[];
  qr_tlv_base64: string;
  issued_at: string;
  corrects_invoice_id: string | null;
  branch_id: string;
}

export async function getInvoiceById(invoiceId: string, tenantId: string): Promise<InvoiceRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as InvoiceRow) ?? null;
}

export async function listInvoices(tenantId: string, limit = 100): Promise<InvoiceRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('invoices')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('issued_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as InvoiceRow[];
}

export interface UninvoicedPayment {
  paymentId: string;
  amountCents: number;
  capturedAt: string | null;
  sessionId: string | null;
}

/**
 * Captured payments with no invoice on file — the retry surface for
 * issuances that failed (issueInvoiceForPayment is called synchronously
 * right after payment capture, never fire-and-forget, but a transient
 * failure — e.g. tax details briefly misconfigured — must not vanish
 * silently, so admin can find and retry it here).
 */
export async function listUninvoicedPayments(tenantId: string, branchId: string): Promise<UninvoicedPayment[]> {
  const admin = createAdminClient();
  const { data: payments, error } = await admin
    .from('payments')
    .select('id, amount_cents, captured_at, session_id')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('status', 'captured')
    .eq('purpose', 'session')
    .order('captured_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  if (!payments || payments.length === 0) return [];

  const { data: invoiced } = await admin
    .from('invoices')
    .select('source_payment_id')
    .in('source_payment_id', payments.map((p) => p.id));
  const invoicedIds = new Set((invoiced ?? []).map((i) => i.source_payment_id));

  return payments
    .filter((p) => !invoicedIds.has(p.id))
    .map((p) => ({ paymentId: p.id, amountCents: p.amount_cents, capturedAt: p.captured_at, sessionId: p.session_id }));
}
