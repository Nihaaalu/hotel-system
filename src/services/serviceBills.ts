import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { ServiceBill, ServiceBillPayment } from '../types';
import { getISTDateStr } from '../utils/formatters';

export const ServiceBillService = {
  /**
   * Fetch all service bills from Supabase
   */
  async getServiceBills(): Promise<ServiceBill[]> {
    if (!isSupabaseConfigured) return [];

    try {
      const { data: billsData, error: billsErr } = await supabase
        .from('service_bills')
        .select('*')
        .order('created_at', { ascending: false });

      if (billsErr) {
        console.error('Error fetching service_bills:', billsErr);
        return [];
      }

      if (!billsData || billsData.length === 0) return [];

      // Collect reservation IDs to get guest name & room numbers
      const resIds = Array.from(
        new Set(billsData.map((b: any) => String(b.reservation_id)).filter((id) => id && id !== 'null' && id !== 'undefined'))
      );

      const resMap = new Map<string, { guestName: string; roomNumber?: number }>();
      if (resIds.length > 0) {
        const [resRes, rrRes] = await Promise.all([
          supabase.from('reservations').select('id, booking_name').in('id', resIds),
          supabase.from('reservation_rooms').select('reservation_id, room_id, rooms(room_number)').in('reservation_id', resIds),
        ]);

        const roomMap = new Map<string, number>();
        (rrRes.data || []).forEach((rr: any) => {
          const rId = String(rr.reservation_id);
          const rNum = rr.rooms?.room_number ? Number(rr.rooms.room_number) : undefined;
          if (rNum && !roomMap.has(rId)) {
            roomMap.set(rId, rNum);
          }
        });

        (resRes.data || []).forEach((r: any) => {
          const id = String(r.id);
          resMap.set(id, {
            guestName: String(r.booking_name || 'Resort Guest'),
            roomNumber: roomMap.get(id),
          });
        });
      }

      return billsData.map((b: any) => {
        const resId = b.reservation_id ? String(b.reservation_id) : null;
        const resInfo = resId ? resMap.get(resId) : undefined;

        return {
          id: String(b.id),
          reservationId: resId,
          serviceType: (b.service_type || 'other') as ServiceBill['serviceType'],
          status: (b.status || 'pending') as ServiceBill['status'],
          remarks: b.remarks ? String(b.remarks) : '',
          createdAt: String(b.created_at || new Date().toISOString()),
          updatedAt: String(b.updated_at || new Date().toISOString()),
          totalAmount: Number(b.total_amount || 0),
          paidAmount: Number(b.paid_amount || 0),
          remainingBalance: Number(b.remaining_balance || 0),
          paymentMethod: b.payment_method ? String(b.payment_method) : undefined,
          balanceDueWallet: Boolean(b.balance_due_wallet),
          transferToIrshad: Boolean(b.transfer_to_irshad),
          customerName: b.customer_name ? String(b.customer_name) : undefined,
          isOutsideCustomer: Boolean(b.is_outside_customer),
          guestName: b.is_outside_customer ? String(b.customer_name || 'Outside Customer') : (resInfo?.guestName || 'Resort Guest'),
          roomNumber: resInfo?.roomNumber,
        };
      });
    } catch (err) {
      console.error('Exception fetching service_bills:', err);
      return [];
    }
  },

  /**
   * Create a new Food / Activity Service Bill
   */
  async createServiceBill(payload: {
    customerType: 'resort_guest' | 'outside_customer';
    reservationId?: string;
    customerName?: string;
    category: 'Food' | 'Swimming Pool' | 'Campfire' | 'Other';
    totalAmount: number;
    paidNow: number;
    paymentMethod?: string;
    balanceOption?: 'due' | 'irshad_wallet';
    remarks?: string;
  }): Promise<ServiceBill | null> {
    if (!isSupabaseConfigured) return null;

    try {
      const isOutside = payload.customerType === 'outside_customer';
      const tot = Math.max(0, Number(payload.totalAmount || 0));
      const paid = Math.min(tot, Math.max(0, Number(payload.paidNow || 0)));
      const rem = Math.max(0, tot - paid);

      let status: 'pending' | 'partial' | 'paid' = 'pending';
      if (tot > 0) {
        if (paid >= tot) {
          status = 'paid';
        } else if (paid > 0) {
          status = 'partial';
        } else {
          status = 'pending';
        }
      }

      // Map Category to service_type
      const serviceTypeMap: Record<string, string> = {
        'Food': 'food',
        'Swimming Pool': 'swimming_pool',
        'Campfire': 'campfire',
        'Other': 'other',
      };
      const serviceType = serviceTypeMap[payload.category] || 'other';

      const transferToIrshad = rem > 0 && payload.balanceOption === 'irshad_wallet';
      const balanceDueWallet = rem > 0 && payload.balanceOption === 'due';

      // Insert service_bills record
      const insertData = {
        reservation_id: !isOutside && payload.reservationId ? payload.reservationId : null,
        service_type: serviceType,
        status: status,
        remarks: payload.remarks || '',
        total_amount: tot,
        paid_amount: paid,
        remaining_balance: rem,
        payment_method: paid > 0 ? (payload.paymentMethod || 'Cash') : null,
        balance_due_wallet: balanceDueWallet,
        transfer_to_irshad: transferToIrshad,
        customer_name: isOutside ? payload.customerName || 'Outside Customer' : null,
        is_outside_customer: isOutside,
      };

      const { data: createdBill, error: billErr } = await supabase
        .from('service_bills')
        .insert(insertData)
        .select('*')
        .single();

      if (billErr || !createdBill) {
        console.error('Error creating service_bills record:', billErr);
        throw new Error(billErr?.message || 'Failed to create service bill');
      }

      const billId = createdBill.id;

      // 1. Record payment transaction if paidNow > 0
      if (paid > 0) {
        const { error: payErr } = await supabase.from('service_bill_payments').insert({
          bill_id: billId,
          amount: paid,
          payment_method: payload.paymentMethod || 'Cash',
          remarks: payload.remarks ? `Initial payment: ${payload.remarks}` : 'Initial charge payment',
        });

        if (payErr) {
          console.warn('Error recording service_bill_payments:', payErr);
        }
      }

      // 2. Record Irshad settlement if transfer_to_irshad = true
      if (transferToIrshad) {
        const todayDate = getISTDateStr();
        const { error: irshadErr } = await supabase.from('irshad_settlements').insert({
          transaction_date: todayDate,
          transaction_type: 'booking_to_irshad',
          amount: rem,
          reference_table: 'service_bills',
          reference_id: billId,
          remarks: `Food/Activity bill remaining balance transferred to Irshad wallet (Bill #${billId})`,
        });

        if (irshadErr) {
          console.warn('Error recording irshad_settlements for service bill:', irshadErr);
        }
      }

      return {
        id: String(createdBill.id),
        reservationId: createdBill.reservation_id ? String(createdBill.reservation_id) : null,
        serviceType: (createdBill.service_type || 'other') as ServiceBill['serviceType'],
        status: (createdBill.status || 'pending') as ServiceBill['status'],
        remarks: createdBill.remarks || '',
        createdAt: String(createdBill.created_at || new Date().toISOString()),
        updatedAt: String(createdBill.updated_at || new Date().toISOString()),
        totalAmount: Number(createdBill.total_amount || 0),
        paidAmount: Number(createdBill.paid_amount || 0),
        remainingBalance: Number(createdBill.remaining_balance || 0),
        paymentMethod: createdBill.payment_method ? String(createdBill.payment_method) : undefined,
        balanceDueWallet: Boolean(createdBill.balance_due_wallet),
        transferToIrshad: Boolean(createdBill.transfer_to_irshad),
        customerName: createdBill.customer_name ? String(createdBill.customer_name) : undefined,
        isOutsideCustomer: Boolean(createdBill.is_outside_customer),
      };
    } catch (err) {
      console.error('Exception in createServiceBill:', err);
      throw err;
    }
  },

  /**
   * Collect payment towards a pending or partial service bill
   */
  async collectPayment(
    billId: string | number,
    collectAmount: number,
    paymentMethod: string,
    remarks?: string
  ): Promise<void> {
    if (!isSupabaseConfigured) return;

    try {
      const numId = Number(billId);

      // Fetch current bill
      const { data: bill, error: fetchErr } = await supabase
        .from('service_bills')
        .select('*')
        .eq('id', numId)
        .single();

      if (fetchErr || !bill) {
        console.error('Service bill not found for id:', billId, fetchErr);
        throw new Error('Service bill not found');
      }

      const currentPaid = Number(bill.paid_amount || 0);
      const totalAmt = Number(bill.total_amount || 0);
      const addAmt = Number(collectAmount);

      const newPaid = currentPaid + addAmt;
      const newRem = Math.max(0, totalAmt - newPaid);
      const newStatus = newRem === 0 && totalAmt > 0 ? 'paid' : 'partial';

      // Update service_bills
      const { error: updateErr } = await supabase
        .from('service_bills')
        .update({
          paid_amount: newPaid,
          remaining_balance: newRem,
          status: newStatus,
          payment_method: paymentMethod || bill.payment_method || 'Cash',
          updated_at: new Date().toISOString(),
        })
        .eq('id', numId);

      if (updateErr) {
        console.error('Error updating service_bills:', updateErr);
        throw new Error('Failed to update service bill payment');
      }

      // Record transaction in service_bill_payments
      const { error: payErr } = await supabase.from('service_bill_payments').insert({
        bill_id: numId,
        amount: addAmt,
        payment_method: paymentMethod,
        remarks: remarks || 'Due settlement payment',
      });

      if (payErr) {
        console.warn('Error recording service_bill_payments transaction:', payErr);
      }
    } catch (err) {
      console.error('Exception in collectPayment for service bill:', err);
      throw err;
    }
  },

  /**
   * Delete or cancel a service bill
   */
  async deleteServiceBill(billId: string | number): Promise<void> {
    if (!isSupabaseConfigured) return;

    try {
      const numId = Number(billId);
      // Delete associated payments first to maintain referential integrity
      await supabase.from('service_bill_payments').delete().eq('bill_id', numId);
      await supabase.from('irshad_settlements').delete().eq('reference_table', 'service_bills').eq('reference_id', numId);
      const { error } = await supabase.from('service_bills').delete().eq('id', numId);

      if (error) {
        console.error('Error deleting service_bills:', error);
        throw new Error('Failed to delete service bill');
      }
    } catch (err) {
      console.error('Exception deleting service bill:', err);
      throw err;
    }
  },
};
