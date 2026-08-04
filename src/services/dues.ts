import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { CustomerDue } from '../types';
import { getISTDateStr } from '../utils/formatters';
import { updatePaymentSummary, settleBookingDue } from './paymentSummary';

export const DuesService = {
  settleBookingDue,

  /**
   * Fetch dues list directly from payments INNER JOIN reservations
   * WHERE payments.remaining_balance > 0
   */
  async getDuesList(): Promise<{
    activeDues: CustomerDue[];
    collectedToday: number;
    historyDues: CustomerDue[];
  }> {
    if (!isSupabaseConfigured) {
      return { activeDues: [], collectedToday: 0, historyDues: [] };
    }

    try {
      // 1. Fetch payments where remaining_balance > 0
      const { data: paymentsData, error: payError } = await supabase
        .from('payments')
        .select('*')
        .gt('remaining_balance', 0)
        .order('created_at', { ascending: false });

      if (payError) {
        console.error('Error fetching payments for dues:', payError);
        return { activeDues: [], collectedToday: 0, historyDues: [] };
      }

      // Collect reservation IDs
      const resIds = Array.from(
        new Set((paymentsData || []).map((p: any) => String(p.reservation_id)).filter(Boolean))
      );

      const resMap = new Map<string, any>();
      if (resIds.length > 0) {
        const { data: resData } = await supabase
          .from('reservations')
          .select('id, booking_name, check_in_date, check_out_date, status')
          .in('id', resIds);

        (resData || []).forEach((r: any) => {
          resMap.set(String(r.id), r);
        });
      }

      // Calculate today's collections from due_payment_transactions
      const todayIST = getISTDateStr();
      let collectedToday = 0;
      try {
        const { data: dueTxData } = await supabase
          .from('due_payment_transactions')
          .select('amount, created_at');

        (dueTxData || []).forEach((tx: any) => {
          const txDate = (tx.created_at || '').split('T')[0];
          if (txDate === todayIST) {
            collectedToday += Number(tx.amount || 0);
          }
        });
      } catch (e) {
        console.warn('Error fetching due_payment_transactions:', e);
      }

      const activeDues: CustomerDue[] = (paymentsData || []).filter((p: any) => Number(p.remaining_balance || 0) > 0 && p.payment_status !== 'paid').map((p: any) => {
        const parentRes = resMap.get(String(p.reservation_id));
        return {
          id: String(p.id),
          reservationId: String(p.reservation_id || ''),
          bookingName: String(parentRes?.booking_name || 'Customer'),
          checkInDate: String(parentRes?.check_in_date || ''),
          checkOutDate: String(parentRes?.check_out_date || ''),
          status: String(parentRes?.status || 'checked-in'),
          totalAmount: Number(p.total_amount || 0),
          advancePaid: Number(p.amount_collected || p.advance_paid || 0),
          amountCollected: Number(p.amount_collected || 0),
          remainingBalance: Number(p.remaining_balance || 0),
          balanceDueWallet: Boolean(p.balance_due_wallet),
          transferToIrshad: Boolean(p.transfer_to_irshad || (p.transferred_to_irshad && Number(p.transferred_to_irshad) > 0)),
          transferredToIrshad: Number(p.transferred_to_irshad || 0),
          paymentStatus: p.payment_status || 'pending',
          createdAt: p.created_at || new Date().toISOString(),
        };
      });

      return { activeDues, collectedToday, historyDues: [] };
    } catch (err) {
      console.error('Exception in getDuesList:', err);
      return { activeDues: [], collectedToday: 0, historyDues: [] };
    }
  },

  /**
   * Collect payment against a customer due using single reusable settleBookingDue
   */
  async collectDuePayment(
    paymentId: string,
    collectAmount: number,
    paymentMethod: 'cash' | 'card' | 'upi' | 'net_banking',
    remarks: string,
    paymentDate: string
  ): Promise<void> {
    if (!isSupabaseConfigured) return;

    try {
      // 1. Fetch current payment row to get reservation_id
      const { data: payRow, error: fetchErr } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      if (fetchErr || !payRow) {
        console.error('Payment record not found for id:', paymentId, fetchErr);
        throw new Error('Payment record not found');
      }

      await settleBookingDue(
        String(payRow.reservation_id),
        Number(collectAmount),
        paymentMethod,
        remarks,
        paymentDate
      );
    } catch (err) {
      console.error('Exception in collectDuePayment:', err);
      throw err;
    }
  },
};
