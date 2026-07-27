import { ReservationService } from './reservations';
import { RoomService } from './rooms';
import { Booking, Room } from '../types';

export interface CalendarDayCell {
  dateYMD: string;
  booking: Booking | null;
  isCheckInDay: boolean;
  isCheckOutDay: boolean;
}

export const CalendarService = {
  /**
   * Fetches all rooms and current active reservations for the calendar view
   */
  async getCalendarData(): Promise<{ rooms: Room[]; bookings: Booking[] }> {
    const rooms = await RoomService.getRooms();
    const bookings = await ReservationService.getBookings();
    return { rooms, bookings };
  },

  /**
   * Finds matching booking for a specific room on a given YYYY-MM-DD date
   */
  getBookingForCell(
    bookings: Booking[],
    roomNumber: number,
    dateYMD: string
  ): Booking | null {
    return (
      bookings.find((b) => {
        if (b.roomNumber !== roomNumber) return false;
        if (b.status === 'cancelled') return false;
        return dateYMD >= b.checkInDate && dateYMD < b.checkOutDate;
      }) || null
    );
  },

  /**
   * Calculates occupancy count for a given date
   */
  getOccupancyForDate(bookings: Booking[], dateYMD: string): number {
    return bookings.filter(
      (b) =>
        b.status !== 'cancelled' &&
        b.status !== 'checked-out' &&
        dateYMD >= b.checkInDate &&
        dateYMD < b.checkOutDate
    ).length;
  },
};
