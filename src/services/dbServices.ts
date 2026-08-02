import { RoomService as SupabaseRoomService } from './rooms';
import { ReservationService } from './reservations';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Booking, Guest, Payment, Room } from '../types';
import { updatePaymentSummary } from './paymentSummary';

export { supabase, isSupabaseConfigured } from '../lib/supabase';
export { RoomService as SupabaseRoomService } from './rooms';
export { ReservationService } from './reservations';
export { CalendarService } from './calendar';

function logQuery(table: string, action: string, where: string, payload?: any) {
  console.log(`TABLE:\n${table}\n\nACTION:\n${action}\n\nWHERE:\n${where}\n\nPAYLOAD:\n${JSON.stringify(payload ?? {}, null, 2)}`);
}

function logResponse(data: any, error: any) {
  console.log(`Returned data:\n${JSON.stringify(data ?? null, null, 2)}`);
  console.log(`Returned error:\n${JSON.stringify(error ?? null, null, 2)}`);
}

export const RoomService = {
  async getRooms(): Promise<Room[]> {
    return SupabaseRoomService.getRooms();
  },
};

export const BookingService = {
  async getBookings(): Promise<Booking[]> {
    return ReservationService.getBookings();
  },
  async getBookingById(id: string): Promise<Booking | null> {
    return ReservationService.getBookingById(id);
  },
  async getNextBookingGroupId(): Promise<string> {
    return ReservationService.getNextBookingGroupId();
  },
  async createMultiRoomBooking(
    guestData: { name: string; phone?: string; address?: string; idProof?: string },
    selectedRoomNumbers: number[],
    bookingDetails: {
      checkInDate: string;
      checkOutDate: string;
      totalAmount?: number;
      advancePaid?: number;
      remarks?: string;
      bookingGroupId?: string;
    }
  ): Promise<void> {
    return ReservationService.createMultiRoomBooking(guestData, selectedRoomNumbers, bookingDetails);
  },
  async createBooking(
    guestData: Omit<Guest, 'id' | 'createdAt' | 'updatedAt'>,
    bookingData: Omit<Booking, 'id' | 'guestId' | 'createdAt' | 'updatedAt' | 'status'> & { bookingGroupId?: string }
  ): Promise<void> {
    return ReservationService.createBooking(guestData, bookingData);
  },
  async updateBookingStatus(
    id: string,
    status: 'booked' | 'checked-in' | 'checked-out' | 'cancelled'
  ): Promise<void> {
    return ReservationService.updateBookingStatus(id, status);
  },
  async checkInGuest(id: string, remarks?: string, checkedInBy?: string): Promise<void> {
    return ReservationService.checkInGuest(id, remarks, checkedInBy);
  },
  async recordCheckInPayment(
    id: string,
    paymentData: {
      amountCollected: number;
      transferredToIrshad: number;
      transferToIrshad: boolean;
      balanceDueWallet?: boolean;
      remainingBalance?: number;
      remarks?: string;
    }
  ): Promise<void> {
    return ReservationService.recordCheckInPayment(id, paymentData);
  },
  async checkoutGuest(id: string, remarks?: string): Promise<void> {
    return ReservationService.checkoutGuest(id, remarks);
  },
  async releaseRoom(id: string): Promise<void> {
    return ReservationService.releaseRoom(id);
  },
  async cancelEntireReservation(reservationId: string): Promise<void> {
    return ReservationService.cancelEntireReservation(reservationId);
  },
  async cancelSingleRoom(reservationRoomId: string): Promise<void> {
    return ReservationService.cancelSingleRoom(reservationRoomId);
  },
  async deleteBooking(id: string): Promise<void> {
    return ReservationService.deleteBooking(id);
  },
  async replaceRoom(reservationRoomId: string, newRoomNumber: number): Promise<any> {
    return ReservationService.replaceRoom(reservationRoomId, newRoomNumber);
  },
  async updateBookingDetails(
    reservationId: string,
    data: {
      guestName?: string;
      checkInDate?: string;
      checkOutDate?: string;
      remarks?: string;
      totalAmount?: number;
      advancePaid?: number;
    }
  ): Promise<void> {
    return ReservationService.updateBookingDetails(reservationId, data);
  },
  async checkOverlappingBooking(
    roomNumber: number,
    checkIn: string,
    checkOut: string,
    ignoreBookingId?: string
  ): Promise<boolean> {
    return ReservationService.checkOverlappingBooking(roomNumber, checkIn, checkOut, ignoreBookingId);
  },
};

export const GuestService = {
  async getGuests(): Promise<Guest[]> {
    if (!isSupabaseConfigured) return [];

    logQuery('reservations', 'SELECT', 'ALL');
    const { data, error } = await supabase.from('reservations').select('id, booking_name, created_at');
    logResponse(data, error);

    if (error) {
      console.error('Error fetching guests from reservations:', error);
      return [];
    }

    if (!data) return [];
    return data.map((g: any) => ({
      id: String(g.id),
      name: String(g.booking_name || 'Guest'),
      phone: '',
      address: '',
      idProof: '',
      createdAt: String(g.created_at || new Date().toISOString()),
      updatedAt: String(g.created_at || new Date().toISOString()),
    }));
  },

  async saveGuest(guest: Guest): Promise<void> {
    // Guest info is stored directly on reservations table
  },

  async searchGuests(query: string): Promise<Guest[]> {
    const guests = await this.getGuests();
    const q = query.toLowerCase().trim();
    return guests.filter(
      (g) => g.name.toLowerCase().includes(q) || g.phone.includes(q)
    );
  },
};

export const PaymentService = {
  async getPaymentsForBooking(bookingId: string): Promise<Payment[]> {
    if (!isSupabaseConfigured) return [];

    try {
      logQuery('payments', 'SELECT', `reservation_id = ${bookingId}`);
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('reservation_id', bookingId);
      logResponse(data, error);

      if (error) {
        console.warn('Error fetching payments for booking:', error.message || error);
        return [];
      }

      if (!data) return [];

      return data.map((p: any) => ({
        id: String(p.id ?? p.payment_id ?? ''),
        bookingId: String(p.reservation_id || p.booking_id || bookingId),
        amount: Number(p.amount_collected || p.collected_amount || p.advance_paid || p.amount || 0),
        paymentMethod: (p.payment_method || 'cash') as Payment['paymentMethod'],
        paymentDate: String(p.payment_date || p.created_at || new Date().toISOString()),
        remarks: String(p.remarks || ''),
        createdAt: String(p.created_at || new Date().toISOString()),
      }));
    } catch (err: any) {
      console.warn('Exception fetching payments for booking:', err?.message || err);
      return [];
    }
  },

  async addPayment(
    bookingId: string,
    amount: number,
    method: 'cash' | 'card' | 'upi' | 'net_banking',
    remarks: string
  ): Promise<Payment> {
    const id = `pay_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const nowIso = new Date().toISOString();
    const paymentRecord: Payment = {
      id,
      bookingId,
      amount,
      paymentMethod: method,
      paymentDate: nowIso,
      remarks,
      createdAt: nowIso,
    };

    if (isSupabaseConfigured) {
      try {
        await updatePaymentSummary({
          reservationId: bookingId,
          paymentAmount: Number(amount),
          isAdvance: true,
          paymentMethod: method,
          remarks,
        });
      } catch (err: any) {
        console.error('Exception updating payment row in addPayment:', err?.message || err);
        throw err;
      }
    }

    return paymentRecord;
  },

  async getAllPayments(): Promise<Payment[]> {
    if (!isSupabaseConfigured) return [];

    try {
      logQuery('payments', 'SELECT', 'ALL');
      const { data, error } = await supabase.from('payments').select('*');
      logResponse(data, error);

      if (error) {
        console.warn('Error fetching all payments:', error.message || error);
        return [];
      }

      if (!data) return [];

      return data.map((p: any) => ({
        id: String(p.id ?? p.payment_id ?? ''),
        bookingId: String(p.reservation_id || p.booking_id || ''),
        amount: Number(p.amount_collected || p.collected_amount || p.advance_paid || p.amount || 0),
        paymentMethod: (p.payment_method || 'cash') as Payment['paymentMethod'],
        paymentDate: String(p.payment_date || p.created_at || new Date().toISOString()),
        remarks: String(p.remarks || ''),
        createdAt: String(p.created_at || new Date().toISOString()),
      }));
    } catch (err: any) {
      console.warn('Exception fetching all payments:', err?.message || err);
      return [];
    }
  },
};
