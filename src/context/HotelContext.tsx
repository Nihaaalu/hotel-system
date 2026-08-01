import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Room, Booking, Payment, Guest, Expense, DueTransaction } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { ExpenseService } from '../services/expenses';
import { ReservationService } from '../services/reservations';

function parsePaymentMetadata(remarksStr: string): { totalAmount: number; advancePaid: number; cleanRemarks: string } {
  if (!remarksStr) return { totalAmount: 0, advancePaid: 0, cleanRemarks: '' };
  
  const match = remarksStr.match(/\[PAYMENT:total=([\d.]+),advance=([\d.]+)\]/);
  if (match) {
    const totalAmount = Number(match[1]) || 0;
    const advancePaid = Number(match[2]) || 0;
    const cleanRemarks = remarksStr.replace(/\[PAYMENT:total=[\d.]+,advance=[\d.]+\]\s*/, '').trim();
    return { totalAmount, advancePaid, cleanRemarks };
  }
  
  return { totalAmount: 0, advancePaid: 0, cleanRemarks: remarksStr };
}

interface HotelContextType {
  rooms: Room[];
  reservationRooms: any[];
  bookings: Booking[];
  payments: Payment[];
  dueTransactions: DueTransaction[];
  guests: Guest[];
  expenses: Expense[];
  isLoading: boolean;
  refreshData: () => Promise<void>;
  checkOverlappingBooking: (
    roomNumber: number,
    checkIn: string,
    checkOut: string,
    ignoreBookingId?: string
  ) => boolean;
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => Promise<Expense>;
  updateExpense: (id: string, expense: Partial<Omit<Expense, 'id' | 'createdAt'>>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  updateBookingPayment: (reservationId: string, totalAmount: number, advancePaid: number) => Promise<void>;
}

const HotelContext = createContext<HotelContextType | undefined>(undefined);

export const HotelDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservationRooms, setReservationRooms] = useState<any[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [dueTransactions, setDueTransactions] = useState<DueTransaction[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Perform a single batch fetch of all core tables concurrently
      const [roomsRes, rrRes, resRes, payRes, expList, dueTxRes] = await Promise.all([
        supabase.from('rooms').select('*').eq('is_active', true).order('room_number', { ascending: true }),
        supabase.from('reservation_rooms').select('*'),
        supabase.from('reservations').select('*'),
        supabase.from('payments').select('*'),
        ExpenseService.getExpenses(),
        supabase.from('due_payment_transactions').select('*'),
      ]);

      setExpenses(expList);

      if (roomsRes.error) {
        console.error('FULL SUPABASE ERROR fetching rooms in HotelContext:', roomsRes.error);
        throw new Error(`Rooms query failed: ${roomsRes.error.message || JSON.stringify(roomsRes.error)}`);
      }

      if (dueTxRes.data) {
        setDueTransactions(
          dueTxRes.data.map((tx: any) => ({
            id: String(tx.id || ''),
            payment_id: String(tx.payment_id || ''),
            reservation_id: String(tx.reservation_id || ''),
            amount: Number(tx.amount || 0),
            payment_method: String(tx.payment_method || 'cash'),
            remarks: String(tx.remarks || ''),
            created_at: String(tx.created_at || new Date().toISOString()),
          }))
        );
      } else {
        setDueTransactions([]);
      }

      // 1. Process Rooms
      let parsedRooms: Room[] = [];
      if (roomsRes.data && roomsRes.data.length > 0) {
        parsedRooms = roomsRes.data.map((item: any) => ({
          id: item.id,
          room_number: Number(item.room_number ?? item.id),
          floor: Number(item.floor ?? 1),
          room_type: String(item.room_type ?? 'Standard'),
          bed_type: item.bed_type ? String(item.bed_type) : undefined,
          capacity: item.capacity ? Number(item.capacity) : undefined,
          is_active: item.is_active !== false,
          created_at: item.created_at ? String(item.created_at) : undefined,
          number: Number(item.room_number ?? item.id),
          type: String(item.room_type ?? 'Standard'),
        }));
      }
      setRooms(parsedRooms);

      // Room ID -> Room Number map
      const roomIdToNumMap = new Map<string | number, number>();
      parsedRooms.forEach((r) => {
        roomIdToNumMap.set(r.id, r.number);
        roomIdToNumMap.set(String(r.id), r.number);
        roomIdToNumMap.set(r.number, r.number);
      });

      // 2. Process Payments
      let parsedPayments: Payment[] = [];
      const paymentByResId = new Map<
        string,
        { totalAmount: number; advancePaid: number; paymentStatus: 'paid' | 'pending' }
      >();

      if (payRes.data) {
        parsedPayments = payRes.data.map((p: any) => {
          const resId = String(p.reservation_id || p.booking_id || '');
          const totAmt = Number(p.total_amount || 0);
          const advPaid = Number(p.advance_paid ?? p.amount ?? 0);
          const pStatus: 'paid' | 'pending' =
            p.payment_status === 'paid' || p.status === 'paid'
              ? 'paid'
              : advPaid >= totAmt && totAmt > 0
              ? 'paid'
              : 'pending';

          if (resId) {
            const existing = paymentByResId.get(resId) || {
              totalAmount: 0,
              advancePaid: 0,
              paymentStatus: 'pending',
            };

            paymentByResId.set(resId, {
              totalAmount: totAmt > 0 ? totAmt : existing.totalAmount,
              advancePaid: existing.advancePaid + advPaid,
              paymentStatus: pStatus === 'paid' || existing.paymentStatus === 'paid' ? 'paid' : 'pending',
            });
          }

          return {
            id: String(p.id ?? p.payment_id ?? ''),
            bookingId: resId,
            reservationId: resId,
            amount: advPaid,
            totalAmount: totAmt,
            advancePaid: advPaid,
            amountCollected: p.amount_collected !== undefined && p.amount_collected !== null ? Number(p.amount_collected) : undefined,
            transferredToIrshad: p.transferred_to_irshad !== undefined && p.transferred_to_irshad !== null ? Number(p.transferred_to_irshad) : undefined,
            transferToIrshad: Boolean(p.transfer_to_irshad),
            balanceDueWallet: Boolean(p.balance_due_wallet),
            remainingBalance: Number(p.remaining_balance || 0),
            paymentStatus: pStatus,
            paymentMethod: (p.payment_method || 'cash') as Payment['paymentMethod'],
            paymentDate: String(p.payment_date || p.created_at || new Date().toISOString()),
            remarks: String(p.remarks || ''),
            createdAt: String(p.created_at || new Date().toISOString()),
          };
        });
      }
      setPayments(parsedPayments);

      // 3. Process Reservations & Reservation Rooms
      const fetchedReservationRooms = rrRes.data || [];
      setReservationRooms(fetchedReservationRooms);
      console.log('reservationRooms state after refresh:', fetchedReservationRooms);

      const resMap = new Map<string, any>();
      (resRes.data || []).forEach((r: any) => {
        resMap.set(String(r.id), r);
      });

      const parsedBookings: Booking[] = [];
      if (rrRes.data && rrRes.data.length > 0) {
        for (const rr of rrRes.data) {
          const parentRes = resMap.get(String(rr.reservation_id));
          if (!parentRes) continue;

          const isCancelled = rr.cancelled === true || rr.status === 'Cancelled' || rr.status === 'cancelled' || parentRes.status === 'Cancelled' || parentRes.status === 'cancelled';
          const rawStatus = isCancelled ? 'Cancelled' : String(rr.status || parentRes.status || 'Booked');
          const mappedStatus: Booking['status'] =
            rawStatus === 'Booked' || rawStatus === 'reserved' || rawStatus === 'booked'
              ? 'booked'
              : rawStatus === 'Checked In' || rawStatus === 'checked_in' || rawStatus === 'checked-in'
              ? 'checked-in'
              : rawStatus === 'Checked Out' || rawStatus === 'checked_out' || rawStatus === 'checked-out'
              ? 'checked-out'
              : rawStatus === 'Cancelled' || rawStatus === 'cancelled'
              ? 'cancelled'
              : 'booked';

          const roomNum =
            roomIdToNumMap.get(rr.room_id) ??
            roomIdToNumMap.get(String(rr.room_id)) ??
            Number(rr.room_id || 0);

          const { totalAmount: parsedTotal, advancePaid: parsedAdvance, cleanRemarks } = parsePaymentMetadata(String(parentRes.remarks || rr.remarks || ''));

          const payInfo = paymentByResId.get(String(parentRes.id)) || {
            totalAmount: Number(parentRes.total_amount || parsedTotal || 0),
            advancePaid: Number(parentRes.advance_paid || parsedAdvance || 0),
            paymentStatus: 'pending',
          };

          if (payInfo.totalAmount === 0 && parsedTotal > 0) payInfo.totalAmount = parsedTotal;
          if (payInfo.advancePaid === 0 && parsedAdvance > 0) payInfo.advancePaid = parsedAdvance;

          const effectivePaymentStatus: 'paid' | 'pending' =
            mappedStatus === 'checked-in' ||
            mappedStatus === 'checked-out' ||
            payInfo.paymentStatus === 'paid' ||
            (payInfo.advancePaid >= payInfo.totalAmount && payInfo.totalAmount > 0)
              ? 'paid'
              : 'pending';

          parsedBookings.push({
            id: String(rr.id || `${rr.reservation_id}_${roomNum}`),
            bookingGroupId: String(parentRes.id),
            guestId: String(parentRes.id),
            guestName: String(parentRes.booking_name || 'Guest'),
            guestPhone: '',
            guestIdProof: '',
            roomNumber: roomNum,
            checkInDate: String(parentRes.check_in_date || ''),
            checkOutDate: String(parentRes.check_out_date || ''),
            status: mappedStatus,
            totalAmount: payInfo.totalAmount,
            advancePaid: payInfo.advancePaid,
            paymentStatus: effectivePaymentStatus,
            remarks: cleanRemarks,
            createdAt: String(rr.created_at || parentRes.created_at || new Date().toISOString()),
            updatedAt: String(rr.created_at || parentRes.created_at || new Date().toISOString()),
          });
        }
      }
      setBookings(parsedBookings);

      // 4. Process Guests from Reservations
      const parsedGuests: Guest[] = (resRes.data || []).map((r: any) => ({
        id: String(r.id),
        name: String(r.booking_name || 'Guest'),
        phone: '',
        address: '',
        idProof: '',
        createdAt: String(r.created_at || new Date().toISOString()),
        updatedAt: String(r.created_at || new Date().toISOString()),
      }));
      setGuests(parsedGuests);

    } catch (err) {
      console.error('Error refreshing hotel data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const checkOverlappingBooking = useCallback(
    (
      roomNumber: number,
      checkIn: string,
      checkOut: string,
      ignoreBookingId?: string
    ): boolean => {
      const activeBookings = bookings.filter(
        (b) =>
          b.roomNumber === roomNumber &&
          b.status !== 'cancelled' &&
          b.status !== 'checked-out' &&
          b.id !== ignoreBookingId &&
          b.bookingGroupId !== ignoreBookingId
      );

      for (const b of activeBookings) {
        if (checkIn < b.checkOutDate && checkOut > b.checkInDate) {
          return true;
        }
      }
      return false;
    },
    [bookings]
  );

  const addExpense = useCallback(
    async (expense: Omit<Expense, 'id' | 'createdAt'>) => {
      try {
        const created = await ExpenseService.addExpense(expense);
        await refreshData();
        return created;
      } catch (err) {
        console.error('Error adding expense:', err);
        throw err;
      }
    },
    [refreshData]
  );

  const updateExpense = useCallback(
    async (id: string, expense: Partial<Omit<Expense, 'id' | 'createdAt'>>) => {
      try {
        await ExpenseService.updateExpense(id, expense);
        await refreshData();
      } catch (err) {
        console.error('Error updating expense:', err);
        throw err;
      }
    },
    [refreshData]
  );

  const deleteExpense = useCallback(
    async (id: string) => {
      try {
        await ExpenseService.deleteExpense(id);
        await refreshData();
      } catch (err) {
        console.error('Error deleting expense:', err);
        throw err;
      }
    },
    [refreshData]
  );

  const updateBookingPayment = useCallback(
    async (reservationId: string, totalAmount: number, advancePaid: number) => {
      try {
        await ReservationService.updateBookingPayment(reservationId, totalAmount, advancePaid);
        await refreshData();
      } catch (err) {
        console.error('Error updating booking payment:', err);
        throw err;
      }
    },
    [refreshData]
  );

  return (
    <HotelContext.Provider
      value={{
        rooms,
        reservationRooms,
        bookings,
        payments,
        dueTransactions,
        guests,
        expenses,
        isLoading,
        refreshData,
        checkOverlappingBooking,
        addExpense,
        updateExpense,
        deleteExpense,
        updateBookingPayment,
      }}
    >
      {children}
    </HotelContext.Provider>
  );
};

export const useHotelData = () => {
  const context = useContext(HotelContext);
  if (!context) {
    throw new Error('useHotelData must be used within a HotelDataProvider');
  }
  return context;
};
