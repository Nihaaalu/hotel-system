import { supabase, isSupabaseConfigured } from '../lib/supabase';

function logQuery(table: string, action: string, where: string, payload?: any) {
  console.log(`TABLE:\n${table}\n\nACTION:\n${action}\n\nWHERE:\n${where}\n\nPAYLOAD:\n${JSON.stringify(payload ?? {}, null, 2)}`);
}

function logResponse(data: any, error: any) {
  console.log(`Returned data:\n${JSON.stringify(data ?? null, null, 2)}`);
  console.log(`Returned error:\n${JSON.stringify(error ?? null, null, 2)}`);
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

  const isNumeric = (s: string) => /^\d+$/.test(s);

  const findInReservations = async (num: number): Promise<string | null> => {
    try {
      const { data } = await supabase
        .from('reservations')
        .select('id')
        .eq('id', num)
        .maybeSingle();
      return data?.id ? String(data.id) : null;
    } catch {
      return null;
    }
  };

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
    const resId = await findInReservations(num);
    if (resId) return resId;

    const parentResId = await findInReservationRooms(num);
    if (parentResId) return parentResId;

    return str;
  }

  const parts = str.split('_');
  for (const part of parts) {
    if (isNumeric(part)) {
      const num = Number(part);
      const resId = await findInReservations(num);
      if (resId) return resId;

      const parentResId = await findInReservationRooms(num);
      if (parentResId) return parentResId;
    }
  }

  const match = str.match(/\d+/);
  return match ? match[0] : str;
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

  const match = str.match(/\d+/);
  return match ? match[0] : str;
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

  // Check if targetResId is valid number
  const numericResId = Number(targetResId);
  if (!targetResId || isNaN(numericResId)) {
    console.error('Invalid reservation ID for payment summary:', reservationId);
    return null;
  }

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

  const currentAdvancePaid = Number(existing?.advance_paid || 0);
  const currentAmountCollected = Number(existing?.amount_collected || existing?.collected_amount || 0);

  // remaining = total_amount - amount_collected
  const currentRemaining = currentTotalAmount > 0 ? Math.max(0, currentTotalAmount - currentAmountCollected) : 0;

  // 4. Already Paid Protection:
  // If remaining_balance == 0 (and currentTotalAmount > 0)
  // Skip payment processing completely. Do not update payments. Do not insert due_payment_transactions.
  if (existing && currentTotalAmount > 0 && currentRemaining === 0) {
    console.log('[PAYMENT LOG] remaining_balance is 0. Skipping payment processing completely.');
    return existing;
  }

  // 3. Check-In / Payment Calculation:
  // paymentToApply = Math.min(paymentEntered, remaining)
  const paymentEntered = Number(paymentAmount || 0);
  const remainingForCalc = currentTotalAmount > 0 ? (existing ? currentRemaining : currentTotalAmount) : paymentEntered;
  const paymentToApply = Math.min(paymentEntered, remainingForCalc);

  // amount_collected = amount_collected + paymentToApply
  const newAmountCollected = currentAmountCollected + paymentToApply;
  // Never allow amount_collected > total_amount
  const finalAmountCollected = currentTotalAmount > 0 ? Math.min(newAmountCollected, currentTotalAmount) : newAmountCollected;

  // remaining_balance = total_amount - amount_collected
  const newRemainingBalance = currentTotalAmount > 0 ? Math.max(0, currentTotalAmount - finalAmountCollected) : 0;

  const newAdvancePaid = currentAdvancePaid + (isAdvance ? paymentToApply : 0);

  // payment_status =
  // remaining_balance == 0 ? "paid"
  // : amount_collected == 0 ? "pending"
  // : "partial"
  let newPaymentStatus: 'pending' | 'partial' | 'paid' = 'pending';
  if (newRemainingBalance === 0 && currentTotalAmount > 0) {
    newPaymentStatus = 'paid';
  } else if (finalAmountCollected === 0) {
    newPaymentStatus = 'pending';
  } else {
    newPaymentStatus = 'partial';
  }

  const isBalanceDue = options?.balanceDueWallet !== undefined
    ? options.balanceDueWallet
    : (newRemainingBalance > 0);

  const transferToIrshad = options?.transferToIrshad !== undefined
    ? options.transferToIrshad
    : Boolean(existing?.transfer_to_irshad);

  const transferredToIrshad = options?.transferredToIrshad !== undefined
    ? Number(options.transferredToIrshad)
    : Number(existing?.transferred_to_irshad || 0);

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
  console.log('[PAYMENT LOG] 1. Existing payment row before update:', existing);
  // LOG 2: Payload sent to Supabase
  console.log('[PAYMENT LOG] 2. Payload sent to Supabase:', paymentPayload);

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

  // LOG 3: Returned payment row
  console.log('[PAYMENT LOG] 3. Returned payment row:', paymentRecord);
  // LOG 4: Any Supabase error
  console.log('[PAYMENT LOG] 4. Any Supabase error:', payErrOut || 'None');
  // LOG 5: amount_collected before and after
  console.log(`[PAYMENT LOG] 5. amount_collected before: ${currentAmountCollected}, after: ${finalAmountCollected}`);
  // LOG 6: advance_paid before and after
  console.log(`[PAYMENT LOG] 6. advance_paid before: ${currentAdvancePaid}, after: ${newAdvancePaid}`);
  // LOG 7: remaining_balance before and after
  console.log(`[PAYMENT LOG] 7. remaining_balance before: ${existing?.remaining_balance ?? (currentTotalAmount - currentAmountCollected)}, after: ${newRemainingBalance}`);
  // LOG 8: payment_status before and after
  console.log(`[PAYMENT LOG] 8. payment_status before: ${existing?.payment_status ?? 'N/A'}, after: ${newPaymentStatus}`);

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
      console.log('[PAYMENT LOG] 9. Whether due_payment_transactions insertion succeeded: FALSE');
      throw txErr;
    }
    if (!txData || txData.length !== 1) {
      const txCountErr = new Error(`INSERT into due_payment_transactions failed: returned row count ${txData ? txData.length : 0}, expected 1.`);
      console.error('[PAYMENT LOG ERROR] 4. Supabase due_payment_transactions error:', txCountErr);
      console.log('[PAYMENT LOG] 9. Whether due_payment_transactions insertion succeeded: FALSE');
      throw txCountErr;
    }
    console.log('[PAYMENT LOG] 9. Whether due_payment_transactions insertion succeeded: TRUE');
  } else {
    console.log('[PAYMENT LOG] 9. Whether due_payment_transactions insertion succeeded: N/A (no new money collected in this transaction)');
  }

  // DO NOT UPDATE RESERVATIONS TABLE WITH PAYMENT FIELDS!
  return paymentRecord;
}

