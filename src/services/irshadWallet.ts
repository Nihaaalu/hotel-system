import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { IrshadSettlement, IrshadWalletSummary } from '../types';

export const IrshadWalletService = {
  /**
   * Reads the irshad_wallet_summary view.
   * Provides: expense_by_irshad, bookings_with_irshad, resort_paid, irshad_paid.
   */
  async getWalletSummary(): Promise<IrshadWalletSummary> {
    if (!isSupabaseConfigured) {
      return {
        expense_by_irshad: 0,
        bookings_with_irshad: 0,
        resort_paid: 0,
        irshad_paid: 0,
      };
    }

    try {
      // Fetch concurrently from base tables
      const [invRes, salRes, rentRes, setRes, payRes] = await Promise.all([
        supabase.from('inventory_expenses').select('amount').eq('paid_by', 'irshad'),
        supabase.from('salary_transactions').select('amount').eq('paid_by', 'irshad'),
        supabase.from('rent_transactions').select('amount').eq('paid_by', 'irshad'),
        supabase.from('irshad_settlements').select('amount, transaction_type'),
        supabase.from('payments').select('transferred_to_irshad, amount_collected').or('transfer_to_irshad.eq.true,transferred_to_irshad.gt.0'),
      ]);

      let expenseByIrshad = 0;
      (invRes.data || []).forEach((r: any) => { expenseByIrshad += Number(r.amount || 0); });
      (salRes.data || []).forEach((r: any) => { expenseByIrshad += Number(r.amount || 0); });
      (rentRes.data || []).forEach((r: any) => { expenseByIrshad += Number(r.amount || 0); });

      let bookingsWithIrshad = 0;
      (payRes.data || []).forEach((r: any) => {
        bookingsWithIrshad += Number(r.transferred_to_irshad ?? r.amount_collected ?? 0);
      });

      let resortPaid = 0;
      let irshadPaid = 0;

      (setRes.data || []).forEach((s: any) => {
        const amt = Number(s.amount || 0);
        const type = String(s.transaction_type || '');
        if (type === 'expense_by_irshad') {
          expenseByIrshad += amt;
        } else if (type === 'booking_to_irshad') {
          bookingsWithIrshad += amt;
        } else if (type === 'resort_paid_irshad') {
          resortPaid += amt;
        } else if (type === 'irshad_paid_resort') {
          irshadPaid += amt;
        }
      });

      return {
        expense_by_irshad: expenseByIrshad,
        bookings_with_irshad: bookingsWithIrshad,
        resort_paid: resortPaid,
        irshad_paid: irshadPaid,
      };
    } catch (err) {
      console.error('Exception reading Irshad wallet summary from base tables:', err);
      return {
        expense_by_irshad: 0,
        bookings_with_irshad: 0,
        resort_paid: 0,
        irshad_paid: 0,
      };
    }
  },

  /**
   * Reads history of settlements from irshad_settlements table.
   */
  async getSettlements(): Promise<IrshadSettlement[]> {
    if (!isSupabaseConfigured) return [];

    try {
      const { data, error } = await supabase
        .from('irshad_settlements')
        .select('*')
        .order('transaction_date', { ascending: false });

      if (error) {
        console.warn('Error reading irshad_settlements:', error.message || error);
        return [];
      }

      if (!data) return [];

      return data.map((item: any) => ({
        id: String(item.id),
        transactionDate: String(item.transaction_date || ''),
        transactionType: item.transaction_type as 'resort_paid_irshad' | 'irshad_paid_resort',
        amount: Number(item.amount || 0),
        remarks: String(item.remarks || ''),
        createdAt: String(item.created_at || ''),
      }));
    } catch (err) {
      console.error('Exception reading irshad_settlements:', err);
      return [];
    }
  },

  /**
   * Reads expenses paid by Irshad from inventory_expenses table.
   */
  async getIrshadExpenses(): Promise<any[]> {
    if (!isSupabaseConfigured) return [];

    try {
      const { data, error } = await supabase
        .from('inventory_expenses')
        .select('*')
        .eq('paid_by', 'irshad')
        .order('expense_date', { ascending: false });

      if (error) {
        console.warn('Error reading Irshad expenses:', error.message || error);
        return [];
      }

      if (!data) return [];

      return data.map((e: any) => ({
        id: String(e.id),
        expenseDate: String(e.expense_date || ''),
        category: String(e.category || 'General'),
        amount: Number(e.amount || 0),
        remarks: String(e.remarks || ''),
        itemName: String(e.item_name || ''),
        paidBy: 'irshad',
        createdAt: String(e.created_at || ''),
      }));
    } catch (err) {
      console.error('Exception reading Irshad expenses:', err);
      return [];
    }
  },

  /**
   * Reads payments transferred to Irshad from payments table.
   */
  async getIrshadBookings(): Promise<any[]> {
    if (!isSupabaseConfigured) return [];

    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*, reservations(booking_name)')
        .or('transfer_to_irshad.eq.true,transferred_to_irshad.gt.0')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error reading Irshad bookings:', error.message || error);
        // Fallback without join
        const { data: rawData } = await supabase
          .from('payments')
          .select('*')
          .or('transfer_to_irshad.eq.true,transferred_to_irshad.gt.0')
          .order('created_at', { ascending: false });
        if (!rawData) return [];
        return rawData.map((p: any) => ({
          id: String(p.id),
          reservationId: String(p.reservation_id || ''),
          guestName: 'Booking Guest',
          amount: Number(p.amount || 0),
          amountCollected: Number(p.amount_collected || 0),
          transferredToIrshad: Number(p.transferred_to_irshad || 0),
          paymentStatus: String(p.payment_status || 'pending'),
          remarks: String(p.remarks || ''),
          createdAt: String(p.created_at || ''),
        }));
      }

      if (!data) return [];

      return data.map((p: any) => ({
        id: String(p.id),
        reservationId: String(p.reservation_id || ''),
        guestName: String(p.reservations?.booking_name || 'Booking Guest'),
        amount: Number(p.amount || 0),
        amountCollected: Number(p.amount_collected || 0),
        transferredToIrshad: Number(p.transferred_to_irshad || 0),
        paymentStatus: String(p.payment_status || 'pending'),
        remarks: String(p.remarks || ''),
        createdAt: String(p.created_at || ''),
      }));
    } catch (err) {
      console.error('Exception reading Irshad bookings:', err);
      return [];
    }
  },

  /**
   * Inserts a new settlement row into irshad_settlements table.
   * Never overwrites history. Always inserts a new row.
   */
  async addSettlement(settlement: {
    transactionDate: string;
    transactionType: 'resort_paid_irshad' | 'irshad_paid_resort';
    amount: number;
    remarks?: string;
  }): Promise<void> {
    if (!isSupabaseConfigured) return;

    const payload = {
      transaction_date: settlement.transactionDate,
      transaction_type: settlement.transactionType,
      amount: Number(settlement.amount),
      remarks: settlement.remarks || '',
    };

    const { error } = await supabase.from('irshad_settlements').insert(payload);

    if (error) {
      console.error('Error adding settlement:', error);
      throw new Error(error.message || 'Failed to record settlement in irshad_settlements');
    }
  },
};
