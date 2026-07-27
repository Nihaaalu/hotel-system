import React, { useState, useEffect, useRef } from 'react';
import { Room, Booking } from '../types';
import { RoomService, BookingService } from '../services/dbServices';
const { FIXED_ROOMS } = RoomService;
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, User, Plus } from 'lucide-react';

interface BookingCalendarProps {
  onSelectCell: (roomNumber: number, date: string) => void;
  onSelectBooking: (bookingId: string) => void;
  refreshTrigger: number;
}

export default function BookingCalendar({
  onSelectCell,
  onSelectBooking,
  refreshTrigger,
}: BookingCalendarProps) {
  // We want to render a sequence of dates.
  // The system spans -12 months to +5 months.
  // We can let the user slide/navigate. Let's display a 15-day or 30-day view, and let them easily scroll or jump.
  // Starting with "Today" centered so it feels extremely fast and intuitive.
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3); // center today by showing 3 days ago initially
    return d;
  });

  const [bookingList, setBookingList] = useState<Booking[]>([]);
  const [daysCount, setDaysCount] = useState<number>(18); // Show 18 columns initially

  useEffect(() => {
    async function load() {
      const data = await BookingService.getBookings();
      setBookingList(data);
    }
    load();
  }, [refreshTrigger]);

  // Generate date array for columns
  const dates: Date[] = [];
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    dates.push(d);
  }

  // Format date to ISO string (YYYY-MM-DD) local
  const formatLocalDate = (date: Date) => {
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60 * 1000);
    return local.toISOString().split('T')[0];
  };

  const formattedDates = dates.map(d => formatLocalDate(d));

  // Shift start date left or right
  const shiftDays = (count: number) => {
    const limitMin = new Date();
    limitMin.setMonth(limitMin.getMonth() - 12); // -12 months boundary
    const limitMax = new Date();
    limitMax.setMonth(limitMax.getMonth() + 5);  // +5 months boundary

    const newStart = new Date(startDate);
    newStart.setDate(startDate.getDate() + count);

    if (newStart < limitMin) {
      setStartDate(limitMin);
    } else if (newStart > limitMax) {
      setStartDate(limitMax);
    } else {
      setStartDate(newStart);
    }
  };

  const jumpToToday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    setStartDate(d);
  };

  const getDayLabel = (date: Date) => {
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      dayNum: date.getDate(),
      dayName: weekdays[date.getDay()],
      monthName: date.toLocaleString('default', { month: 'short' }),
      yearNum: date.getFullYear(),
      isToday: new Date().toDateString() === date.toDateString(),
    };
  };

  // Check if there is an active booking on a specific date + room
  const getBookingForCell = (roomNumber: number, dateStr: string) => {
    return bookingList.find((b) => {
      if (b.roomNumber !== roomNumber) return false;
      if (b.status === 'cancelled') return false;
      // booking spans from checkInDate to checkOutDate (exclusive or inclusive depending on check-out check-in time)
      // Usually in hotels, check-out day room becomes available, but the grid shows overnight stay.
      // So booking spans: checkInDate <= dateStr < checkOutDate
      return dateStr >= b.checkInDate && dateStr < b.checkOutDate;
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" id="booking_calendar_panel">
      {/* Calendar Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 border-b border-gray-50 gap-4 bg-gray-50/50">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-gray-400" />
            Live Room Booking Grid
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Click available (green) cells to book, or booked/occupied cells to update check-ins, check-outs, and payments.
          </p>
        </div>

        {/* Calendar Nav Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftDays(-7)}
            className="p-2 border border-gray-200 rounded-lg hover:bg-white text-gray-600 transition h-9 flex items-center justify-center text-xs font-medium gap-1 px-3"
            title="Backward 1 week"
          >
            <ChevronLeft className="w-4 h-4" />
            Prev Week
          </button>
          
          <button
            onClick={jumpToToday}
            className="px-4 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg hover:bg-indigo-100 transition whitespace-nowrap h-9 flex items-center justify-center"
          >
            Today
          </button>
          
          <button
            onClick={() => shiftDays(7)}
            className="p-2 border border-gray-200 rounded-lg hover:bg-white text-gray-600 transition h-9 flex items-center justify-center text-xs font-medium gap-1 px-3"
            title="Forward 1 week"
          >
            Next Week
            <ChevronRight className="w-4 h-4" />
          </button>

          <span className="text-xs font-semibold text-gray-400 px-2 select-none">|</span>

          {/* View size switcher */}
          <div className="flex bg-gray-200/60 p-0.5 rounded-lg border border-gray-200">
            {[10, 18, 30].map((size) => (
              <button
                key={size}
                onClick={() => setDaysCount(size)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                  daysCount === size
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {size}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid Container */}
      <div className="overflow-x-auto w-full">
        <table className="w-full border-collapse border-spacing-0 divide-y divide-gray-100 min-w-[700px]">
          {/* Header Rows */}
          <thead>
            {/* Months Header */}
            <tr className="bg-gray-50/50 divide-x divide-gray-100 text-gray-400 text-2xs uppercase tracking-wider font-mono">
              <th className="w-28 py-1 px-2 text-left sticky left-0 bg-gray-50 font-semibold border-b border-gray-100 z-10 select-none">
                Month
              </th>
              {dates.map((date, idx) => {
                const label = getDayLabel(date);
                // Only show month name when it shifts or is first
                const showMonth = idx === 0 || date.getDate() === 1;
                return (
                  <th key={idx} className="py-2 px-1 text-center font-medium border-b border-gray-100 text-gray-500 min-w-[40px]">
                    {showMonth ? label.monthName : ''}
                  </th>
                );
              })}
            </tr>
            {/* Days Header */}
            <tr className="divide-x divide-gray-100 text-xs font-mono text-gray-500 bg-gray-50/80">
              <th className="w-28 py-3 px-3 text-left font-semibold sticky left-0 bg-gray-50 border-b border-gray-100 z-10 select-none shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                Room Number
              </th>
              {dates.map((date, idx) => {
                const label = getDayLabel(date);
                return (
                  <th
                    key={idx}
                    className={`py-2 px-1 text-center border-b border-gray-100 min-w-[40px] select-none ${
                      label.isToday
                        ? 'bg-indigo-600 text-white font-bold rounded-t-md'
                        : 'text-gray-700'
                    }`}
                  >
                    <div className="text-2xs font-light">{label.dayName}</div>
                    <div className="text-sm font-semibold">{label.dayNum}</div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Room Grid Rows */}
          <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
            {FIXED_ROOMS.map((room) => (
              <tr key={room.number} className="group hover:bg-gray-50/40 transition divide-x divide-gray-100">
                {/* Room Number Label Cell */}
                <td className="w-28 py-3.5 px-3 font-semibold sticky left-0 bg-white z-10 select-none shadow-[2px_0_5px_rgba(0,0,0,0.02)] group-hover:bg-gray-50 transition">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-800">Room {room.number}</span>
                    <span className="text-[9px] text-gray-650 font-bold tracking-wide uppercase mt-0.5">
                      Fl {room.floor} • {room.type}
                    </span>
                  </div>
                </td>

                {/* Calendar Cells */}
                {formattedDates.map((dateStr, idx) => {
                  const booking = getBookingForCell(room.number, dateStr);
                  const isTodayStr = formatLocalDate(new Date()) === dateStr;

                  if (booking) {
                    // Check if this date is the check-in date of the booking block to draw the booking tag or text
                    const isCheckInDay = booking.checkInDate === dateStr;

                    // Compute color codes for block
                    let bgClass = 'bg-orange-100 hover:bg-orange-150 border-orange-200 text-orange-850';
                    let badgeColor = 'bg-orange-500';
                    const isTodayLocal = formatLocalDate(new Date()) === dateStr;

                    if (booking.status === 'checked-in') {
                      if (booking.checkOutDate === dateStr && isTodayLocal) {
                        bgClass = 'bg-red-100 hover:bg-red-150 border-red-300 text-red-800 font-black animate-pulse';
                        badgeColor = 'bg-red-600';
                      } else {
                        bgClass = 'bg-blue-100 hover:bg-blue-150 border-blue-300 text-blue-800 font-bold';
                        badgeColor = 'bg-blue-600';
                      }
                    } else if (booking.status === 'checked-out') {
                      bgClass = 'bg-gray-100 hover:bg-gray-150 border-gray-200 text-gray-500';
                      badgeColor = 'bg-gray-400';
                    }

                    return (
                      <td
                        key={idx}
                        onClick={() => onSelectBooking(booking.id)}
                        className={`p-1 cursor-pointer transition border border-dashed text-center min-w-[40px] relative h-12 ${bgClass}`}
                        title={`${booking.guestName} (${booking.status}) - ${booking.checkInDate} to ${booking.checkOutDate}`}
                        id={`cell-${room.number}-${dateStr}`}
                      >
                        {isCheckInDay ? (
                          <div className="absolute inset-y-1 left-1 right-1 flex flex-col justify-between text-left leading-tight overflow-hidden z-10">
                            <span className="font-semibold text-2xs truncate select-none">
                              {booking.guestName}
                            </span>
                            <span className="text-3xs opacity-85 select-none font-medium truncate">
                              Bal: ₹{(booking.totalAmount - booking.advancePaid).toLocaleString()}
                            </span>
                          </div>
                        ) : (
                          <span className="block w-full h-full min-h-[25px] opacity-25"></span>
                        )}
                        <span className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${badgeColor}`}></span>
                      </td>
                    );
                  }

                  // Empty Cell (Available Room)
                  return (
                    <td
                      key={idx}
                      onClick={() => onSelectCell(room.number, dateStr)}
                      className={`relative hover:bg-green-50 transition border border-gray-50 text-center min-w-[40px] cursor-pointer h-12 ${
                        isTodayStr ? 'bg-indigo-50/20' : ''
                      }`}
                      title={`Book Room ${room.number} starting ${dateStr}`}
                      id={`cell-${room.number}-${dateStr}`}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition duration-150">
                        <Plus className="w-4 h-4 text-green-600 stroke-[3]" />
                      </div>
                      <span className="block text-3xs font-mono text-green-300 opacity-60">₹</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Map Legend */}
      <div className="p-4 bg-gray-50 flex flex-wrap items-center justify-end text-xs text-gray-500 border-t border-gray-100 gap-3">
        <div className="text-3xs text-gray-400 font-mono">
          PMS GRID VERSION 1.0.0
        </div>
      </div>
    </div>
  );
}
