import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { IrshadSettlement, IrshadWalletSummary, IrshadWalletNetSummary } from '../types';
import { settleBookingDue } from './paymentSummary';

const DEBUG = false;

export const IrshadWalletService = {
  settleBookingDue,

  /**
   * Reads the irshad_wallet_summary view or calculates from base tables.
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
        supabase.from('inventory_expenses').select('*').eq('paid_by', 'irshad'),
        supabase.from('salary_transactions').select('*').eq('paid_by', 'irshad'),
        supabase.from('rent_transactions').select('*').eq('paid_by', 'irshad'),
        supabase.from('irshad_settlements').select('amount, transaction_type'),
        supabase.from('payments').select('transferred_to_irshad, amount_collected, amount, remaining_balance, payment_status, transfer_to_irshad').or('transfer_to_irshad.eq.true,transferred_to_irshad.gt.0'),
      ]);

      const seenIds = new Set<string>();
      const seenSignatures = new Set<string>();
      let expenseByIrshad = 0;

      // 1. Process inventory_expenses
      (invRes.data || []).forEach((r: any) => {
        const id = String(r.id);
        if (seenIds.has(id)) return;
        seenIds.add(id);

        const amt = Number(r.amount || 0);
        expenseByIrshad += amt;

        const date = String(r.expense_date || r.date || '').split('T')[0];
        const cat = String(r.category || '').toLowerCase();
        const item = String(r.item_name || r.name || '').toLowerCase();
        const rem = String(r.remarks || '').toLowerCase();

        if (cat.includes('rent') || item.includes('rent') || rem.includes('rent')) {
          seenSignatures.add(`rent_${date}_${amt}`);
        }
        if (cat.includes('salary') || item.includes('salary') || rem.includes('salary')) {
          seenSignatures.add(`salary_${date}_${amt}`);
        }
      });

      // 2. Process salary_transactions (deduplicate against inventory_expenses)
      (salRes.data || []).forEach((r: any) => {
        const id = String(r.id);
        if (seenIds.has(id)) return;

        const amt = Number(r.amount || 0);
        const date = String(r.payment_date || r.created_at || '').split('T')[0];
        const sig = `salary_${date}_${amt}`;

        if (seenSignatures.has(sig)) return;

        seenIds.add(id);
        seenSignatures.add(sig);
        expenseByIrshad += amt;
      });

      // 3. Process rent_transactions (deduplicate against inventory_expenses)
      (rentRes.data || []).forEach((r: any) => {
        const id = String(r.id);
        if (seenIds.has(id)) return;

        const amt = Number(r.amount || 0);
        const date = String(r.payment_date || r.created_at || '').split('T')[0];
        const sig = `rent_${date}_${amt}`;

        if (seenSignatures.has(sig)) return;

        seenIds.add(id);
        seenSignatures.add(sig);
        expenseByIrshad += amt;
      });

      let bookingsWithIrshad = 0;
      (payRes.data || []).forEach((r: any) => {
        const remBal = Number(r.remaining_balance || 0);
        const pStatus = String(r.payment_status || '');
        const isPaid = remBal === 0 || pStatus === 'paid';
        if (!isPaid) {
          const val = Number(r.transferred_to_irshad || remBal || 0);
          if (val > 0) {
            bookingsWithIrshad += val;
          }
        }
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
   * Single shared function returning unified wallet net summary:
   * bookingTransferred, expenseByIrshad, settlementPaid, walletNet
   */
  async getIrshadWalletNetSummary(): Promise<IrshadWalletNetSummary> {
    const summary = await this.getWalletSummary();
    const bookings = await this.getIrshadBookings();
    const bookingTransferred = bookings.reduce((s, b) => s + (b.transferredToIrshad || b.remainingBalance || 0), 0);

    const expenseByIrshad = summary.expense_by_irshad || 0;
    const settlementPaid = (summary.resort_paid || 0) - (summary.irshad_paid || 0);
    const walletNet = expenseByIrshad - bookingTransferred - settlementPaid;

    const result = {
      bookingTransferred,
      expenseByIrshad,
      settlementPaid,
      walletNet,
    };

    if (DEBUG) console.log("Wallet Summary", result);
    return result;
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
      const [invRes, salRes, rentRes] = await Promise.all([
        supabase
          .from('inventory_expenses')
          .select('*')
          .eq('paid_by', 'irshad')
          .order('expense_date', { ascending: false }),
        supabase.from('salary_transactions').select('*').eq('paid_by', 'irshad'),
        supabase.from('rent_transactions').select('*').eq('paid_by', 'irshad'),
      ]);

      const seenIds = new Set<string>();
      const seenSignatures = new Set<string>();
      const result: any[] = [];

      (invRes.data || []).forEach((e: any) => {
        const id = String(e.id);
        if (seenIds.has(id)) return;
        seenIds.add(id);

        const amt = Number(e.amount || 0);
        const date = String(e.expense_date || e.date || '').split('T')[0];
        const cat = String(e.category || 'General');
        const item = String(e.item_name || '');
        const rem = String(e.remarks || '');

        if (
          cat.toLowerCase().includes('rent') ||
          item.toLowerCase().includes('rent') ||
          rem.toLowerCase().includes('rent')
        ) {
          seenSignatures.add(`rent_${date}_${amt}`);
        }
        if (
          cat.toLowerCase().includes('salary') ||
          item.toLowerCase().includes('salary') ||
          rem.toLowerCase().includes('salary')
        ) {
          seenSignatures.add(`salary_${date}_${amt}`);
        }

        result.push({
          id,
          expenseDate: date,
          category: cat,
          amount: amt,
          remarks: rem,
          itemName: item || cat,
          paidBy: 'irshad',
          createdAt: String(e.created_at || ''),
        });
      });

      (salRes.data || []).forEach((s: any) => {
        const id = String(s.id);
        if (seenIds.has(id)) return;
        const amt = Number(s.amount || 0);
        const date = String(s.payment_date || s.created_at || '').split('T')[0];
        const sig = `salary_${date}_${amt}`;
        if (seenSignatures.has(sig)) return;

        seenIds.add(id);
        seenSignatures.add(sig);
        result.push({
          id,
          expenseDate: date,
          category: 'Salary',
          amount: amt,
          remarks: String(s.remarks || 'Salary Payment'),
          itemName: 'Staff Salary',
          paidBy: 'irshad',
          createdAt: String(s.created_at || ''),
        });
      });

      (rentRes.data || []).forEach((r: any) => {
        const id = String(r.id);
        if (seenIds.has(id)) return;
        const amt = Number(r.amount || 0);
        const date = String(r.payment_date || r.created_at || '').split('T')[0];
        const sig = `rent_${date}_${amt}`;
        if (seenSignatures.has(sig)) return;

        seenIds.add(id);
        seenSignatures.add(sig);
        result.push({
          id,
          expenseDate: date,
          category: 'Rent',
          amount: amt,
          remarks: String(r.remarks || 'Rent Payment'),
          itemName: 'Monthly Rent',
          paidBy: 'irshad',
          createdAt: String(r.created_at || ''),
        });
      });

      return result.sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
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
        .gt('remaining_balance', 0)
        .neq('payment_status', 'paid')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error reading Irshad bookings:', error.message || error);
        // Fallback without join
        const { data: rawData } = await supabase
          .from('payments')
          .select('*')
          .or('transfer_to_irshad.eq.true,transferred_to_irshad.gt.0')
          .gt('remaining_balance', 0)
          .neq('payment_status', 'paid')
          .order('created_at', { ascending: false });
        if (!rawData) return [];
        return rawData
          .filter((p: any) => Number(p.remaining_balance || 0) > 0 && p.payment_status !== 'paid')
          .map((p: any) => ({
            id: String(p.id),
            reservationId: String(p.reservation_id || ''),
            guestName: 'Booking Guest',
            amount: Number(p.total_amount || p.amount || 0),
            amountCollected: Number(p.amount_collected || 0),
            transferredToIrshad: Number(p.transferred_to_irshad || p.remaining_balance || 0),
            remainingBalance: Number(p.remaining_balance || 0),
            paymentStatus: String(p.payment_status || 'pending'),
            remarks: String(p.remarks || ''),
            createdAt: String(p.created_at || ''),
          }));
      }

      if (!data) return [];

      return data
        .filter((p: any) => Number(p.remaining_balance || 0) > 0 && p.payment_status !== 'paid')
        .map((p: any) => ({
          id: String(p.id),
          reservationId: String(p.reservation_id || ''),
          guestName: String(p.reservations?.booking_name || 'Booking Guest'),
          amount: Number(p.total_amount || p.amount || 0),
          amountCollected: Number(p.amount_collected || 0),
          transferredToIrshad: Number(p.transferred_to_irshad || p.remaining_balance || 0),
          remainingBalance: Number(p.remaining_balance || 0),
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
