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

export interface IssueInvoiceForCartInput {
  tenantId: string;
  branchId: string;
  cartId: string;
  buyerName?: string;
  buyerVatNumber?: string;
  issuedBy?: string;
}

/**
 * Issue a ZATCA Phase 1 invoice for a settled cart. A split-payment
 * settlement can produce several `payments` rows (one per tender), so unlike
 * issueInvoiceForPayment this doesn't resolve a single payment — it reads
 * the cart's own line items and bills the cart total directly, tracing back
 * via source_cart_id instead of source_payment_id.
 *
 * Idempotent — the very first thing this does is look up any invoice
 * already on file for this cart and return it unchanged. That's the entire
 * double-invoice guard: settleCart calls this exactly once per settlement,
 * but even a retry (e.g. a caller re-running settleCart after a transient
 * error further down) can never produce a second invoice for the same cart.
 */
export async function issueInvoiceForCart(input: IssueInvoiceForCartInput): Promise<IssueInvoiceResult> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('invoices')
    .select('id, invoice_number, qr_tlv_base64')
    .eq('source_cart_id', input.cartId)
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

  const { data: cart, error: cartError } = await admin
    .from('carts')
    .select('label, subtotal_cents, discount_cents, total_cents')
    .eq('id', input.cartId)
    .maybeSingle();
  if (cartError || !cart) throw new Error('Cart not found');

  const { data: cartItemsRaw } = await admin
    .from('cart_items')
    .select('description, quantity, unit_price_cents, line_discount_cents, amount_cents')
    .eq('cart_id', input.cartId)
    .order('created_at', { ascending: true });
  const cartItems = cartItemsRaw ?? [];
  if (cartItems.length === 0) throw new Error('cart_has_no_items');

  const totalCents = cart.total_cents;

  // amount_cents is VAT-INCLUSIVE (see the note on issueInvoiceForPayment) —
  // ZATCA simplified-invoice guidance totals VAT at the invoice level, so
  // each line's VAT share is derived from its share of the invoice total
  // rather than rounded independently, then the whole invoice is rounded
  // once via subtotal = total / 1.15. Each item's own amount_cents already
  // nets out any per-LINE discount — a cart-LEVEL discount (applied on top
  // of the discounted subtotal) is not reflected in any single item's
  // amount, so it gets its own negative line here. Without it, the line
  // items would sum to cart.subtotal_cents (pre-cart-discount) instead of
  // cart.total_cents (the actual invoice total) — a real inconsistency this
  // fixes, not cosmetic.
  const lineItems: InvoiceLineItem[] = cartItems.map((item) => {
    const lineTotalCents = item.amount_cents;
    const lineSubtotalCents = Math.round(lineTotalCents / (1 + VAT_RATE / 100));
    return {
      description_en: item.description,
      description_ar: item.description,
      qty: item.quantity,
      unit_price_cents: item.quantity > 0 ? Math.round(lineSubtotalCents / item.quantity) : lineSubtotalCents,
      vat_cents: lineTotalCents - lineSubtotalCents,
      total_cents: lineTotalCents,
    };
  });

  if (cart.discount_cents > 0) {
    const discountTotalCents = -cart.discount_cents;
    const discountSubtotalCents = -Math.round(cart.discount_cents / (1 + VAT_RATE / 100));
    lineItems.push({
      description_en: 'Discount',
      description_ar: 'خصم',
      qty: 1,
      unit_price_cents: discountSubtotalCents,
      vat_cents: discountTotalCents - discountSubtotalCents,
      total_cents: discountTotalCents,
    });
  }

  const subtotalCents = Math.round(totalCents / (1 + VAT_RATE / 100));
  const vatAmountCents = totalCents - subtotalCents;

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
    p_source_cart_id: input.cartId,
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
    after: { invoice_number: invoice.invoice_number, total_cents: totalCents, invoice_type: invoiceType, source_cart_id: input.cartId },
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
  source_payment_id: string | null;
  source_cart_id: string | null;
  branch_id: string;
}

export interface InvoicePaymentBreakdownLine {
  method: 'cash' | 'card' | 'wallet' | 'mada' | 'visa' | 'mastercard' | 'apple_pay' | 'stc_pay';
  amountCents: number;
  cardReference: string | null;
}

/**
 * How an invoice was actually paid. Read live from cart_payments/payments
 * rather than duplicated onto the invoice at issue time — the invoice's
 * immutable line_items already snapshot what was sold; how it was paid is a
 * separate, still-queryable fact, so there's no need to freeze a second copy
 * of it onto the invoice row itself.
 */
export async function getInvoicePaymentBreakdown(invoice: InvoiceRow): Promise<InvoicePaymentBreakdownLine[]> {
  const admin = createAdminClient();

  if (invoice.source_cart_id) {
    const { data } = await admin
      .from('cart_payments')
      .select('method, amount_cents, card_reference')
      .eq('cart_id', invoice.source_cart_id)
      .order('created_at', { ascending: true });
    return (data ?? []).map((r) => ({ method: r.method, amountCents: r.amount_cents, cardReference: r.card_reference }));
  }

  if (invoice.source_payment_id) {
    const { data } = await admin.from('payments').select('method, amount_cents').eq('id', invoice.source_payment_id).maybeSingle();
    if (!data?.method) return [];
    return [{ method: data.method as InvoicePaymentBreakdownLine['method'], amountCents: data.amount_cents, cardReference: null }];
  }

  return [];
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

export interface InvoiceSummary {
  id: string;
  invoiceNumber: number;
  invoiceType: 'standard' | 'simplified' | 'credit_note' | 'debit_note';
  totalCents: number;
  issuedAt: string;
  customerName: string | null;
  customerPhone: string | null;
}

/**
 * Search invoices for the cashier's in-flow invoice-history panel — by
 * invoice number, customer name/phone, optionally scoped to a shift and/or
 * date range. Invoices don't store a customer_id directly (only carts and
 * payments do), so the customer is resolved via whichever of
 * source_cart_id/source_payment_id the invoice has.
 */
export async function searchInvoices(input: {
  tenantId: string;
  branchId: string;
  query?: string;
  shiftId?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<InvoiceSummary[]> {
  const admin = createAdminClient();

  let invoiceQuery = admin
    .from('invoices')
    .select('id, invoice_number, invoice_type, total_cents, issued_at, source_cart_id, source_payment_id')
    .eq('tenant_id', input.tenantId)
    .eq('branch_id', input.branchId)
    .order('issued_at', { ascending: false })
    .limit(200);
  if (input.fromDate) invoiceQuery = invoiceQuery.gte('issued_at', input.fromDate);
  if (input.toDate) invoiceQuery = invoiceQuery.lte('issued_at', input.toDate);

  const { data: invoicesRaw, error } = await invoiceQuery;
  if (error) throw error;
  let invoices = invoicesRaw ?? [];
  if (invoices.length === 0) return [];

  if (input.shiftId) {
    const [{ data: shiftCarts }, { data: shiftPayments }] = await Promise.all([
      admin.from('carts').select('id').eq('shift_id', input.shiftId),
      admin.from('payments').select('id').eq('shift_id', input.shiftId),
    ]);
    const cartIds = new Set((shiftCarts ?? []).map((c) => c.id));
    const paymentIds = new Set((shiftPayments ?? []).map((p) => p.id));
    invoices = invoices.filter(
      (inv) => (inv.source_cart_id && cartIds.has(inv.source_cart_id)) || (inv.source_payment_id && paymentIds.has(inv.source_payment_id))
    );
  }
  if (invoices.length === 0) return [];

  const cartIds = [...new Set(invoices.map((i) => i.source_cart_id).filter((id): id is string => !!id))];
  const paymentIds = [...new Set(invoices.map((i) => i.source_payment_id).filter((id): id is string => !!id))];

  const [{ data: cartsRaw }, { data: paymentsRaw }] = await Promise.all([
    cartIds.length ? admin.from('carts').select('id, customer_id').in('id', cartIds) : Promise.resolve({ data: [] as Array<{ id: string; customer_id: string | null }> }),
    paymentIds.length
      ? admin.from('payments').select('id, customer_id').in('id', paymentIds)
      : Promise.resolve({ data: [] as Array<{ id: string; customer_id: string | null }> }),
  ]);
  const cartCustomerMap = new Map((cartsRaw ?? []).map((c) => [c.id, c.customer_id]));
  const paymentCustomerMap = new Map((paymentsRaw ?? []).map((p) => [p.id, p.customer_id]));

  const customerIds = [
    ...new Set(
      invoices
        .map((inv) => (inv.source_cart_id ? cartCustomerMap.get(inv.source_cart_id) : inv.source_payment_id ? paymentCustomerMap.get(inv.source_payment_id) : null))
        .filter((id): id is string => !!id)
    ),
  ];
  const { data: profilesRaw } = customerIds.length
    ? await admin.from('profiles').select('id, full_name, phone').in('id', customerIds)
    : { data: [] as Array<{ id: string; full_name: string | null; phone: string | null }> };
  const profileMap = new Map((profilesRaw ?? []).map((p) => [p.id, p]));

  let summaries: InvoiceSummary[] = invoices.map((inv) => {
    const customerId = inv.source_cart_id ? cartCustomerMap.get(inv.source_cart_id) : inv.source_payment_id ? paymentCustomerMap.get(inv.source_payment_id) : null;
    const profile = customerId ? profileMap.get(customerId) : undefined;
    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      invoiceType: inv.invoice_type,
      totalCents: inv.total_cents,
      issuedAt: inv.issued_at,
      customerName: profile?.full_name ?? null,
      customerPhone: profile?.phone ?? null,
    };
  });

  const q = input.query?.trim();
  if (q) {
    const qLower = q.toLowerCase();
    const qNumber = Number.parseInt(q, 10);
    summaries = summaries.filter(
      (s) =>
        (Number.isFinite(qNumber) && s.invoiceNumber === qNumber) ||
        (s.customerName?.toLowerCase().includes(qLower) ?? false) ||
        (s.customerPhone?.includes(q) ?? false)
    );
  }

  return summaries;
}

/** Most recent invoice on this branch (optionally scoped to a shift) — powers "reprint last invoice". */
export async function getLastInvoice(tenantId: string, branchId: string, shiftId?: string): Promise<InvoiceRow | null> {
  const admin = createAdminClient();

  if (!shiftId) {
    const { data, error } = await admin
      .from('invoices')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .order('issued_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as InvoiceRow) ?? null;
  }

  const [{ data: shiftCarts }, { data: shiftPayments }] = await Promise.all([
    admin.from('carts').select('id').eq('shift_id', shiftId),
    admin.from('payments').select('id').eq('shift_id', shiftId),
  ]);
  const cartIds = (shiftCarts ?? []).map((c) => c.id);
  const paymentIds = (shiftPayments ?? []).map((p) => p.id);
  if (cartIds.length === 0 && paymentIds.length === 0) return null;

  const orFilter = [
    cartIds.length ? `source_cart_id.in.(${cartIds.join(',')})` : null,
    paymentIds.length ? `source_payment_id.in.(${paymentIds.join(',')})` : null,
  ]
    .filter(Boolean)
    .join(',');

  const { data, error } = await admin
    .from('invoices')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .or(orFilter)
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as InvoiceRow) ?? null;
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
 *
 * Excludes cart-settlement tender rows (payments that show up in
 * cart_payments) — a split cart settlement can produce several payments
 * rows (one per tender: cash/card/wallet), and NONE of those are ever meant
 * to be invoiced individually. The single invoice for the whole cart is
 * issued via issueInvoiceForCart (source_cart_id), synchronously at
 * settlement, same as issueInvoiceForPayment is for a plain session. Before
 * this exclusion, every cart tender surfaced here as "uninvoiced" (since no
 * invoice's source_payment_id ever pointed at them) and a manual retry
 * created one MORE invoice per tender — e.g. a 42 SAR cart split as 2 cash +
 * 40 card produced two extra invoices (2 SAR and 40 SAR) on top of (or
 * instead of, if the cart invoice itself had failed) the correct one.
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

  const [{ data: invoiced }, { data: cartTenders }] = await Promise.all([
    admin.from('invoices').select('source_payment_id').in('source_payment_id', payments.map((p) => p.id)),
    admin.from('cart_payments').select('payment_id').in('payment_id', payments.map((p) => p.id)),
  ]);
  const invoicedIds = new Set((invoiced ?? []).map((i) => i.source_payment_id));
  const cartTenderIds = new Set((cartTenders ?? []).map((c) => c.payment_id));

  return payments
    .filter((p) => !invoicedIds.has(p.id) && !cartTenderIds.has(p.id))
    .map((p) => ({ paymentId: p.id, amountCents: p.amount_cents, capturedAt: p.captured_at, sessionId: p.session_id }));
}
