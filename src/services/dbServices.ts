import {
  getBookings as dbGetBookings,
  getBookingById as dbGetBookingById,
  createBooking as dbCreateBooking,
  updateBookingStatus as dbUpdateBookingStatus,
  checkOverlappingBooking as dbCheckOverlappingBooking,
  getGuests as dbGetGuests,
  getGuestById as dbGetGuestById,
  saveGuest as dbSaveGuest,
  searchGuests as dbSearchGuests,
  getPaymentsForBooking as dbGetPaymentsForBooking,
  addPayment as dbAddPayment,
  FIXED_ROOMS as dbFixedRooms,
  getAllFromStore as dbGetAllFromStore,
  deleteBooking as dbDeleteBooking,
  getNextBookingGroupId as dbGetNextBookingGroupId,
} from '../db/localDb';
import { Booking, Guest, Payment, Room } from '../types';

export const RoomService = {
  getRooms(): Room[] {
    return dbFixedRooms;
  },
  FIXED_ROOMS: dbFixedRooms,
};

export const BookingService = {
  async getBookings(): Promise<Booking[]> {
    return dbGetBookings();
  },
  async getBookingById(id: string): Promise<Booking | null> {
    return dbGetBookingById(id);
  },
  async getNextBookingGroupId(): Promise<string> {
    return dbGetNextBookingGroupId();
  },
  async createBooking(
    guestData: Omit<Guest, 'id' | 'createdAt' | 'updatedAt'>,
    bookingData: Omit<Booking, 'id' | 'guestId' | 'createdAt' | 'updatedAt' | 'status'> & { bookingGroupId?: string }
  ): Promise<Booking> {
    return dbCreateBooking(guestData, bookingData);
  },
  async updateBookingStatus(
    id: string,
    status: 'booked' | 'checked-in' | 'checked-out' | 'cancelled'
  ): Promise<Booking> {
    return dbUpdateBookingStatus(id, status);
  },
  async deleteBooking(id: string): Promise<void> {
    return dbDeleteBooking(id);
  },
  async checkOverlappingBooking(
    roomNumber: number,
    checkIn: string,
    checkOut: string,
    ignoreBookingId?: string
  ): Promise<boolean> {
    return dbCheckOverlappingBooking(roomNumber, checkIn, checkOut, ignoreBookingId);
  },
};

export const GuestService = {
  async getGuests(): Promise<Guest[]> {
    return dbGetGuests();
  },
  async getGuestById(id: string): Promise<Guest | null> {
    return dbGetGuestById(id);
  },
  async saveGuest(guest: Guest): Promise<void> {
    return dbSaveGuest(guest);
  },
  async searchGuests(query: string): Promise<Guest[]> {
    return dbSearchGuests(query);
  },
};

export const PaymentService = {
  async getPaymentsForBooking(bookingId: string): Promise<Payment[]> {
    return dbGetPaymentsForBooking(bookingId);
  },
  async addPayment(
    bookingId: string,
    amount: number,
    method: 'cash' | 'card' | 'upi' | 'net_banking',
    remarks: string
  ): Promise<Payment> {
    return dbAddPayment(bookingId, amount, method, remarks);
  },
  async getAllPayments(): Promise<Payment[]> {
    return dbGetAllFromStore<Payment>('payments');
  },
};
