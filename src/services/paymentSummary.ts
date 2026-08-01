import { supabase, isSupabaseConfigured } from '../lib/supabase';

function logQuery(table: string, action: string, where: string, payload?: any) {
  console.log(`TABLE:\n${table}\n\nACTION:\n${action}\n\nWHERE:\n${where}\n\nPAYLOAD:\n${JSON.stringify(payload ?? {}, null, 2)}`);
}

function logResponse(data: any, error: any) {
  console.log(`Returned data:\n${JSON.stringify(data ?? null, null, 2)}`);
  console.log(`Returned error:\n${JSON.stringify(error ?? null, null, 2)}`);
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
 * Never overwrites amount_collected, advance_paid, remaining_balance.
 * Always adds new payment to existing amount_collected.
 * Creates a new row in due_payment_transactions for every customer payment.
 */
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

  // 1. Fetch current payment record for reservationId
  logQuery('payments', 'SELECT', `reservation_id = ${reservationId}`);
  const { data: existingPayments, error: fetchErr } = await supabase
    .from('payments')
    .select('*')
    .eq('reservation_id', reservationId);

  if (fetchErr) {
    console.error('Error fetching payment record:', fetchErr);
    throw fetchErr;
  }

  const existing = existingPayments && existingPayments.length > 0 ? existingPayments[0] : null;

  // Also fetch reservations table row if options.totalAmount is not provided
  let resTotalAmount = 0;
  if (options?.totalAmount === undefined) {
    const { data: resRow } = await supabase
      .from('reservations')
      .select('total_amount, advance_paid')
      .eq('id', reservationId)
      .maybeSingle();
    if (resRow?.total_amount) {
      resTotalAmount = Number(resRow.total_amount);
    }
  }

  // 2. Read existing values
  const currentTotalAmount = options?.totalAmount !== undefined
    ? Number(options.totalAmount)
    : Number(existing?.total_amount || resTotalAmount || 0);

  const currentAdvancePaid = Number(existing?.advance_paid || 0);
  const currentAmountCollected = Number(existing?.amount_collected || existing?.collected_amount || 0);

  const collectedNow = Number(paymentAmount || 0);

  // 3. Perform calculations
  const newAdvancePaid = currentAdvancePaid + (isAdvance ? collectedNow : 0);
  const newAmountCollected = currentAmountCollected + collectedNow;
  const newRemainingBalance = Math.max(0, currentTotalAmount - newAmountCollected);

  let newPaymentStatus: 'pending' | 'partial' | 'paid' = 'pending';
  if (newAmountCollected >= currentTotalAmount && currentTotalAmount > 0) {
    newPaymentStatus = 'paid';
  } else if (newAmountCollected > 0) {
    newPaymentStatus = 'partial';
  } else {
    newPaymentStatus = 'pending';
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

  // 4. Create new transaction row in due_payment_transactions if money was collected
  let txRecord = null;
  if (collectedNow > 0) {
    const txPayload = {
      payment_id: existing?.id || null,
      reservation_id: reservationId,
      amount: collectedNow,
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
      console.error('Failed to insert due_payment_transactions:', txErr);
      throw txErr;
    }
    if (!txData || txData.length !== 1) {
      throw new Error(`INSERT into due_payment_transactions failed: returned row count ${txData ? txData.length : 0}, expected 1.`);
    }
    txRecord = txData[0];
  }

  // 5. Update or insert into payments table
  const paymentPayload = {
    reservation_id: reservationId,
    total_amount: currentTotalAmount,
    advance_paid: newAdvancePaid,
    amount_collected: newAmountCollected,
    collected_amount: newAmountCollected,
    remaining_balance: newRemainingBalance,
    payment_status: newPaymentStatus,
    balance_due_wallet: isBalanceDue,
    transfer_to_irshad: transferToIrshad,
    transferred_to_irshad: transferredToIrshad,
    remarks: finalRemarks,
  };

  let paymentRecord = null;
  if (existing) {
    logQuery('payments', 'UPDATE', `id = ${existing.id}`, paymentPayload);
    const { data: updatedPay, error: payErr } = await supabase
      .from('payments')
      .update(paymentPayload)
      .eq('id', existing.id)
      .select();

    logResponse(updatedPay, payErr);
    if (payErr) {
      console.error('Failed to update payments table:', payErr);
      throw payErr;
    }
    if (!updatedPay || updatedPay.length !== 1) {
      throw new Error(`UPDATE on payments table failed: returned row count ${updatedPay ? updatedPay.length : 0}, expected 1.`);
    }
    paymentRecord = updatedPay[0];
  } else {
    logQuery('payments', 'INSERT', 'N/A', paymentPayload);
    const { data: insertedPay, error: payErr } = await supabase
      .from('payments')
      .insert(paymentPayload)
      .select();

    logResponse(insertedPay, payErr);
    if (payErr) {
      console.error('Failed to insert payments table:', payErr);
      throw payErr;
    }
    if (!insertedPay || insertedPay.length !== 1) {
      throw new Error(`INSERT into payments table failed: returned row count ${insertedPay ? insertedPay.length : 0}, expected 1.`);
    }
    paymentRecord = insertedPay[0];

    // If transaction was created prior to payment insertion, link payment_id on transaction
    if (txRecord && txRecord.id && paymentRecord.id) {
      await supabase
        .from('due_payment_transactions')
        .update({ payment_id: paymentRecord.id })
        .eq('id', txRecord.id);
    }
  }

  // 6. Keep reservations table total_amount, advance_paid, payment_status in sync
  logQuery('reservations', 'UPDATE', `id = ${reservationId}`, {
    total_amount: currentTotalAmount,
    advance_paid: newAdvancePaid,
    payment_status: newPaymentStatus,
  });
  const { data: resUpdated, error: resErr } = await supabase
    .from('reservations')
    .update({
      total_amount: currentTotalAmount,
      advance_paid: newAdvancePaid,
      payment_status: newPaymentStatus,
    })
    .eq('id', reservationId)
    .select();

  if (resErr) {
    console.error('Failed to update reservations table:', resErr);
  }

  return paymentRecord;
}
