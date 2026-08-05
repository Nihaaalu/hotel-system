import { supabase, isSupabaseConfigured } from '../lib/supabase';

const DEBUG = false;

function logQuery(table: string, action: string, where: string, payload?: any) {
  if (DEBUG) console.log(`TABLE:\n${table}\n\nACTION:\n${action}\n\nWHERE:\n${where}\n\nPAYLOAD:\n${JSON.stringify(payload ?? {}, null, 2)}`);
}

function logResponse(data: any, error: any) {
  if (DEBUG) console.log(`Returned data:\n${JSON.stringify(data ?? null, null, 2)}`);
  if (DEBUG) console.log(`Returned error:\n${JSON.stringify(error ?? null, null, 2)}`);
}

function parsePaymentMetadata(remarksStr: string): { totalAmount: number; advancePaid: number; cleanRemarks: string } {
  let totalAmount = 0;
  let advancePaid = 0;
  let cleanRemarks = remarksStr || '';

  if (remarksStr && remarksStr.includes('[PAYMENT:')) {
    const match = remarksStr.match(/\[PAYMENT:total=(\d+(?:\.\d+)?),advance=(\d+(?:\.\d+)?)\]/);
    if (match) {
      totalAmount = parseFloat(match[1]);
      advancePaid = parseFloat(match[2]);
      cleanRemarks = remarksStr.replace(/\[PAYMENT:[^\]]+\]/, '').trim();
    }
  }

  return { totalAmount, advancePaid, cleanRemarks };
}

export interface PaymentUpdateParams {
  reservationId: string;
  paymentAmount: number; // amount of money collected in this transaction
  isAdvance?: boolean; // true if this collected payment counts towards advance_paid
  paymentMethod?: string;
  remarks?: string;
  paymentDate?: string;
  options?: {
    totalAmount?: number; // if modifying or setting total booking amount
    balanceDueWallet?: boolean;
    transferToIrshad?: boolean;
    transferredToIrshad?: number;
  };
}

/**
 * Reusable function updatePaymentSummary() that performs all payment calculations consistently.
 * Never overwrites amount_collected, advance_paid, remaining_balance with raw inputs.
 * Calculates paymentToApply capped by remaining_balance and updates payments table.
 * Creates a new row in due_payment_transactions for every customer payment.
 * NEVER updates payment fields on reservations table.
 */
export async function getCleanReservationId(rawId: string | number): Promise<string> {
  if (!rawId) return '';
  const str = String(rawId).trim();
  if (!str) return '';

  // 1. Check if str contains a valid UUID directly
  const uuidMatch = str.match(/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
  if (uuidMatch && uuidMatch[1]) {
    return uuidMatch[1];
  }

  // 2. If numeric or composite with integer parts (like reservation_rooms.id = 5), look up in reservation_rooms
  const isNumeric = (s: string) => /^\d+$/.test(s);

  const findInReservationRooms = async (num: number): Promise<string | null> => {
    try {
      const { data } = await supabase
        .from('reservation_rooms')
        .select('reservation_id')
        .eq('id', num)
        .maybeSingle();
      return data?.reservation_id ? String(data.reservation_id) : null;
    } catch {
      return null;
    }
  };

  if (isNumeric(str)) {
    const num = Number(str);
    const parentResId = await findInReservationRooms(num);
    if (parentResId) return parentResId;
    return str;
  }

  const parts = str.split('_');
  for (const part of parts) {
    if (isNumeric(part)) {
      const num = Number(part);
      const parentResId = await findInReservationRooms(num);
      if (parentResId) return parentResId;
    }
  }

  return str;
}

export async function getCleanRoomRowId(rawId: string | number): Promise<string> {
  if (!rawId) return '';
  const str = String(rawId).trim();
  if (!str) return '';

  const isNumeric = (s: string) => /^\d+$/.test(s);

  const checkRoomRowExists = async (num: number): Promise<string | null> => {
    try {
      const { data } = await supabase
        .from('reservation_rooms')
        .select('id')
        .eq('id', num)
        .maybeSingle();
      return data?.id ? String(data.id) : null;
    } catch {
      return null;
    }
  };

  if (isNumeric(str)) {
    const num = Number(str);
    const rowId = await checkRoomRowExists(num);
    if (rowId) return rowId;
    return str;
  }

  const parts = str.split('_');
  for (const part of parts) {
    if (isNumeric(part)) {
      const num = Number(part);
      const rowId = await checkRoomRowExists(num);
      if (rowId) return rowId;
    }
  }

  return str;
}

export async function updatePaymentSummary(params: PaymentUpdateParams): Promise<any> {
  if (!isSupabaseConfigured) return null;

  const {
    reservationId,
    paymentAmount = 0,
    isAdvance = false,
    paymentMethod = 'cash',
    remarks = '',
    paymentDate,
    options,
  } = params;

  if (!reservationId) {
    throw new Error('updatePaymentSummary failed: reservationId is required.');
  }

  let targetResId = await getCleanReservationId(reservationId);

  if (!targetResId) {
    console.error('Invalid reservation ID for payment summary:', reservationId);
    return null;
  }

  console.log("Reservation UUID:", reservationId);
  console.log("Reservation UUID Used:", targetResId);

  // 1. Fetch current payment record for targetResId
  logQuery('payments', 'SELECT', `reservation_id = ${targetResId}`);
  const { data: existingPayments, error: fetchErr } = await supabase
    .from('payments')
    .select('*')
    .eq('reservation_id', targetResId);

  if (fetchErr) {
    console.error('Error fetching payment record:', fetchErr);
    throw fetchErr;
  }

  const existing = existingPayments && existingPayments.length > 0 ? existingPayments[0] : null;

  // 2. Fetch all payment transactions for targetResId from due_payment_transactions
  const { data: dueTxRows } = await supabase
    .from('due_payment_transactions')
    .select('amount')
    .eq('reservation_id', targetResId);

  const txSum = (dueTxRows || []).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  // Base collected amount: prioritize payment ledger sum from due_payment_transactions
  let baseCollected = 0;
  if (dueTxRows && dueTxRows.length > 0) {
    baseCollected = txSum;
  } else if (existing) {
    baseCollected = Number(existing.amount_collected ?? existing.collected_amount ?? existing.advance_paid ?? 0);
  }

  // Determine current total amount
  let currentTotalAmount = options?.totalAmount !== undefined && options?.totalAmount > 0
    ? Number(options.totalAmount)
    : 0;

  if (!currentTotalAmount) {
    if (existing?.total_amount) {
      currentTotalAmount = Number(existing.total_amount);
    } else {
      const { data: resRow } = await supabase
        .from('reservations')
        .select('remarks')
        .eq('id', targetResId)
        .maybeSingle();

      if (resRow?.remarks) {
        const { totalAmount: parsedTotal } = parsePaymentMetadata(resRow.remarks);
        if (parsedTotal > 0) {
          currentTotalAmount = parsedTotal;
        }
      }
    }
  }

  // 3. Payment Calculation:
  // paymentToApply applies ONLY to new money collected in this action
  const paymentEntered = Number(paymentAmount || 0);
  let paymentToApply = 0;
  if (paymentEntered > 0) {
    const currentRemaining = currentTotalAmount > 0 ? Math.max(0, currentTotalAmount - baseCollected) : paymentEntered;
    paymentToApply = Math.min(paymentEntered, currentRemaining);
  }

  // Collected amount = baseCollected + paymentToApply
  const newAmountCollected = baseCollected + paymentToApply;
  const finalAmountCollected = currentTotalAmount > 0 ? Math.min(newAmountCollected, currentTotalAmount) : newAmountCollected;

  // remaining_balance = max(0, total_amount - collected_amount)
  const newRemainingBalance = currentTotalAmount > 0 ? Math.max(0, currentTotalAmount - finalAmountCollected) : 0;
  const newAdvancePaid = finalAmountCollected;

  // payment_status:
  // Balance == 0 -> Fully Paid ('paid')
  // Collected == 0 -> Unpaid ('pending')
  // Otherwise -> Partial Payment ('partial')
  let newPaymentStatus: 'pending' | 'partial' | 'paid' = 'pending';
  if (newRemainingBalance === 0 && currentTotalAmount > 0) {
    newPaymentStatus = 'paid';
  } else if (finalAmountCollected === 0) {
    newPaymentStatus = 'pending';
  } else {
    newPaymentStatus = 'partial';
  }

  let isBalanceDue = options?.balanceDueWallet !== undefined
    ? options.balanceDueWallet
    : (newRemainingBalance > 0);

  let transferToIrshad = options?.transferToIrshad !== undefined
    ? options.transferToIrshad
    : Boolean(existing?.transfer_to_irshad);

  let transferredToIrshad = options?.transferredToIrshad !== undefined
    ? Number(options.transferredToIrshad)
    : Number(existing?.transferred_to_irshad || 0);

  if (newRemainingBalance === 0 || newPaymentStatus === 'paid') {
    isBalanceDue = false;
    transferToIrshad = false;
    transferredToIrshad = 0;
  } else if (transferToIrshad) {
    transferredToIrshad = newRemainingBalance;
  }

  const finalRemarks = remarks.trim()
    ? remarks.trim()
    : (existing?.remarks || (isAdvance ? 'Advance payment' : 'Payment collected'));

  // Payload sent to Supabase
  const paymentPayload = {
    reservation_id: targetResId,
    total_amount: currentTotalAmount,
    advance_paid: newAdvancePaid,
    amount_collected: finalAmountCollected,
    collected_amount: finalAmountCollected,
    remaining_balance: newRemainingBalance,
    payment_status: newPaymentStatus,
    balance_due_wallet: isBalanceDue,
    transfer_to_irshad: transferToIrshad,
    transferred_to_irshad: transferredToIrshad,
    remarks: finalRemarks,
  };

  // LOG 1: Existing payment row before update
  if (DEBUG) console.log('[PAYMENT LOG] 1. Existing payment row before update:', existing);
  // LOG 2: Payload sent to Supabase
  if (DEBUG) console.log('[PAYMENT LOG] 2. Payload sent to Supabase:', paymentPayload);

  let paymentRecord = null;
  let payErrOut: any = null;

  if (existing) {
    logQuery('payments', 'UPDATE', `id = ${existing.id}`, paymentPayload);
    const { data: updatedPay, error: payErr } = await supabase
      .from('payments')
      .update(paymentPayload)
      .eq('id', existing.id)
      .select();

    logResponse(updatedPay, payErr);
    payErrOut = payErr;

    if (payErr) {
      console.error('[PAYMENT LOG ERROR] 4. Supabase payment update error:', payErr);
      throw payErr;
    }
    if (!updatedPay || updatedPay.length !== 1) {
      const err = new Error(`UPDATE on payments table failed: returned row count ${updatedPay ? updatedPay.length : 0}, expected 1.`);
      console.error('[PAYMENT LOG ERROR] 4. Supabase payment update error:', err);
      throw err;
    }
    paymentRecord = updatedPay[0];
  } else {
    logQuery('payments', 'INSERT', 'N/A', paymentPayload);
    const { data: insertedPay, error: payErr } = await supabase
      .from('payments')
      .insert(paymentPayload)
      .select();

    logResponse(insertedPay, payErr);
    payErrOut = payErr;

    if (payErr) {
      console.error('[PAYMENT LOG ERROR] 4. Supabase payment insert error:', payErr);
      throw payErr;
    }
    if (!insertedPay || insertedPay.length !== 1) {
      const err = new Error(`INSERT into payments table failed: returned row count ${insertedPay ? insertedPay.length : 0}, expected 1.`);
      console.error('[PAYMENT LOG ERROR] 4. Supabase payment insert error:', err);
      throw err;
    }
    paymentRecord = insertedPay[0];
  }

  // Synchronize payment metadata tag on reservations table
  try {
    const { data: resRow } = await supabase
      .from('reservations')
      .select('remarks')
      .eq('id', targetResId)
      .maybeSingle();

    if (resRow) {
      const { cleanRemarks } = parsePaymentMetadata(resRow.remarks || '');
      const newMeta = `[PAYMENT:total=${currentTotalAmount},advance=${finalAmountCollected}]`;
      const updatedRemarks = `${newMeta} ${cleanRemarks}`.trim();
      await supabase
        .from('reservations')
        .update({ remarks: updatedRemarks })
        .eq('id', targetResId);
    }
  } catch (metaErr) {
    console.warn('Warning: Failed to update reservation payment metadata tag:', metaErr);
  }

  // LOG 3: Returned payment row
  if (DEBUG) console.log('[PAYMENT LOG] 3. Returned payment row:', paymentRecord);
  // LOG 4: Any Supabase error
  if (DEBUG) console.log('[PAYMENT LOG] 4. Any Supabase error:', payErrOut || 'None');
  // LOG 5: amount_collected before and after
  if (DEBUG) console.log(`[PAYMENT LOG] 5. amount_collected before: ${baseCollected}, after: ${finalAmountCollected}`);
  // LOG 6: advance_paid before and after
  if (DEBUG) console.log(`[PAYMENT LOG] 6. advance_paid before: ${baseCollected}, after: ${newAdvancePaid}`);
  // LOG 7: remaining_balance before and after
  if (DEBUG) console.log(`[PAYMENT LOG] 7. remaining_balance before: ${existing?.remaining_balance ?? Math.max(0, currentTotalAmount - baseCollected)}, after: ${newRemainingBalance}`);
  // LOG 8: payment_status before and after
  if (DEBUG) console.log(`[PAYMENT LOG] 8. payment_status before: ${existing?.payment_status ?? 'N/A'}, after: ${newPaymentStatus}`);

  // Validate paymentId is NOT null
  const paymentId = paymentRecord?.id;
  if (!paymentId) {
    const missingErr = new Error('Payment row missing before inserting transaction');
    console.error('[PAYMENT LOG ERROR] 4. Supabase error:', missingErr);
    throw missingErr;
  }

  // Insert ONE due_payment_transactions record ONLY for the money collected in the current action
  if (paymentToApply > 0) {
    const txPayload = {
      payment_id: paymentId,
      reservation_id: targetResId,
      amount: paymentToApply,
      payment_method: paymentMethod,
      remarks: finalRemarks,
      created_at: paymentDate || new Date().toISOString(),
    };

    logQuery('due_payment_transactions', 'INSERT', 'N/A', txPayload);
    const { data: txData, error: txErr } = await supabase
      .from('due_payment_transactions')
      .insert(txPayload)
      .select();

    logResponse(txData, txErr);
    if (txErr) {
      console.error('[PAYMENT LOG ERROR] 4. Supabase due_payment_transactions error:', txErr);
      if (DEBUG) console.log('[PAYMENT LOG] 9. Whether due_payment_transactions insertion succeeded: FALSE');
      throw txErr;
    }
    if (!txData || txData.length !== 1) {
      const txCountErr = new Error(`INSERT into due_payment_transactions failed: returned row count ${txData ? txData.length : 0}, expected 1.`);
      console.error('[PAYMENT LOG ERROR] 4. Supabase due_payment_transactions error:', txCountErr);
      if (DEBUG) console.log('[PAYMENT LOG] 9. Whether due_payment_transactions insertion succeeded: FALSE');
      throw txCountErr;
    }
    if (DEBUG) console.log('[PAYMENT LOG] 9. Whether due_payment_transactions insertion succeeded: TRUE');
  } else {
    if (DEBUG) console.log('[PAYMENT LOG] 9. Whether due_payment_transactions insertion succeeded: N/A (no new money collected in this transaction)');
  }

  // DO NOT UPDATE RESERVATIONS TABLE WITH PAYMENT FIELDS!
  return paymentRecord;
}

/**
 * Single reusable function settleBookingDue(reservationId, amount, paymentMethod, remarks, paymentDate)
 * Settles booking dues consistently across Customer Dues page and Irshad Wallet page.
 */
export async function settleBookingDue(
  reservationId: string,
  amount: number,
  paymentMethod: string = 'cash',
  remarks: string = '',
  paymentDate?: string
): Promise<any> {
  if (!reservationId) {
    throw new Error('settleBookingDue failed: reservationId is required.');
  }

  const numericAmount = Number(amount || 0);
  if (numericAmount <= 0) {
    throw new Error('settleBookingDue failed: amount must be greater than 0.');
  }

  const cleanRemarks = remarks.trim() ? remarks.trim() : 'Customer outstanding due collected';

  return await updatePaymentSummary({
    reservationId,
    paymentAmount: numericAmount,
    isAdvance: false,
    paymentMethod,
    remarks: cleanRemarks,
    paymentDate,
  });
}

