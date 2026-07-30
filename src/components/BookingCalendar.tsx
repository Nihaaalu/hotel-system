import React, { useState, useEffect, useRef } from 'react';
import { Booking } from '../types';
import { useHotelData } from '../context/HotelContext';
import { formatDateHuman } from '../utils/formatters';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, X, RefreshCw, AlertCircle } from 'lucide-react';
import MobileCalendar from './MobileCalendar';
import ExportOccupancyButton from './ExportOccupancyButton';

interface BookingCalendarProps {
  onSelectCell: (roomNumber: number, date: string) => void;
  onSelectBooking: (bookingId: string) => void;
  refreshTrigger?: number;
}

const COL_WIDTH = 52; // width in px for each day column on desktop
const ROOM_COL_WIDTH = 176; // width in px for room label column on desktop

export default function BookingCalendar({
  onSelectCell,
  onSelectBooking,
}: BookingCalendarProps) {
  const { rooms, bookings: bookingList, isLoading, error: errorMsg, refreshData: loadCalendarData } = useHotelData();

  // Selected month (first day of month)
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Mobile synchronized scroll refs for room columns
  const mobileHeaderRoomScrollRef = useRef<HTMLDivElement>(null);
  const mobileBodyRoomScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef<boolean>(false);

  const handleHeaderScroll = () => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    if (mobileBodyRoomScrollRef.current && mobileHeaderRoomScrollRef.current) {
      mobileBodyRoomScrollRef.current.scrollLeft = mobileHeaderRoomScrollRef.current.scrollLeft;
    }
    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  };

  const handleBodyScroll = () => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    if (mobileHeaderRoomScrollRef.current && mobileBodyRoomScrollRef.current) {
      mobileHeaderRoomScrollRef.current.scrollLeft = mobileBodyRoomScrollRef.current.scrollLeft;
    }
    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  };

  // Selected mobile cell popup state
  const [selectedMobileCellBooking, setSelectedMobileCellBooking] = useState<{
    booking: Booking;
    roomNumber: number;
    dateYMD: string;
  } | null>(null);


  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth(); // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Helper YYYY-MM-DD
  const formatYMD = (y: number, m: number, d: number) => {
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  };

  const todayObj = new Date();
  const todayYMD = formatYMD(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());

  // Generate days array for current month
  const monthDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const ymd = formatYMD(year, month, d);
    const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const isToday = ymd === todayYMD;
    const isPast = ymd < todayYMD;
    monthDays.push({
      dayNum: d,
      ymd,
      dayOfWeek,
      isToday,
      isPast,
    });
  }

  // Month navigation
  const prevMonthObj = new Date(year, month - 1, 1);
  const nextMonthObj = new Date(year, month + 1, 1);

  const prevMonthName = prevMonthObj.toLocaleDateString('en-US', { month: 'short' });
  const nextMonthName = nextMonthObj.toLocaleDateString('en-US', { month: 'short' });
  const currentMonthTitle = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const goToPrevMonth = () => setCurrentMonth(prevMonthObj);
  const goToNextMonth = () => setCurrentMonth(nextMonthObj);
  const goToToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  // Helper to find booking for a room on a specific YYYY-MM-DD date
  const getBookingForRoomAndDate = (roomNumber: number, dateYMD: string): Booking | null => {
    return (
      bookingList.find((b) => {
        if (b.roomNumber !== roomNumber) return false;
        if (b.status === 'cancelled' || b.status === 'checked-out') return false;
        return dateYMD >= b.checkInDate && dateYMD < b.checkOutDate;
      }) || null
    );
  };

  // Auto-scroll to today if current month is selected (Desktop)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        todayObj.getFullYear() === year &&
        todayObj.getMonth() === month &&
        scrollContainerRef.current
      ) {
        const todayNum = todayObj.getDate();
        const targetX = (todayNum - 1) * COL_WIDTH;
        const containerWidth = scrollContainerRef.current.clientWidth - ROOM_COL_WIDTH;
        scrollContainerRef.current.scrollTo({
          left: Math.max(0, targetX - containerWidth / 2 + COL_WIDTH / 2),
          behavior: 'smooth',
        });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [currentMonth, year, month]);

  // Compute booking bar placement for desktop
  const getRoomBookingsForMonth = (roomNumber: number) => {
    const monthStartStr = formatYMD(year, month, 1);
    const monthEndStr = formatYMD(year, month, daysInMonth);

    return bookingList
      .filter((b) => {
        if (b.roomNumber !== roomNumber) return false;
        if (b.status === 'cancelled' || b.status === 'checked-out') return false;
        return b.checkInDate <= monthEndStr && b.checkOutDate >= monthStartStr;
      })
      .map((b) => {
        let startDay = 1;
        let extendsLeft = false;

        if (b.checkInDate < monthStartStr) {
          startDay = 1;
          extendsLeft = true;
        } else {
          startDay = parseInt(b.checkInDate.split('-')[2], 10);
        }

        let endDay = daysInMonth;
        let extendsRight = false;

        const checkOutParts = b.checkOutDate.split('-').map(Number);
        const checkOutYear = checkOutParts[0];
        const checkOutMonth = checkOutParts[1] - 1;
        const checkOutDayNum = checkOutParts[2];

        if (checkOutYear > year || (checkOutYear === year && checkOutMonth > month)) {
          endDay = daysInMonth;
          extendsRight = true;
        } else if (checkOutYear === year && checkOutMonth === month) {
          endDay = Math.max(startDay, checkOutDayNum - 1);
        }

        const spanCols = Math.max(1, endDay - startDay + 1);
        const leftPx = (startDay - 1) * COL_WIDTH;
        const widthPx = spanCols * COL_WIDTH;

        let colorClass = 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600';
        let statusLabel = 'Reserved';

        if (b.status === 'checked-in') {
          if (b.checkOutDate === todayYMD) {
            colorClass = 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 font-black animate-pulse';
            statusLabel = 'Departure Day';
          } else {
            colorClass = 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700 font-bold';
            statusLabel = 'Checked In';
          }
        } else if (b.status === 'checked-out') {
          colorClass = 'bg-slate-600 hover:bg-slate-700 text-white border-slate-700';
          statusLabel = 'Checked Out';
        } else if (b.status === 'booked') {
          colorClass = 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 font-bold';
          statusLabel = b.checkInDate === todayYMD ? 'Arrival Day' : 'Reserved';
        }

        return {
          booking: b,
          leftPx,
          widthPx,
          extendsLeft,
          extendsRight,
          colorClass,
          statusLabel,
        };
      });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden" id="booking_calendar_panel">
      {/* Top Banner for Error/Loading State */}
      {errorMsg && (
        <div className="p-3 bg-red-50 border-b border-red-200 text-red-700 text-xs font-semibold flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={loadCalendarData}
            className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-2xs font-bold transition flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {isLoading && (
        <div className="p-4 bg-indigo-50/50 border-b border-indigo-100 text-indigo-700 text-xs font-medium flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
          <span>Syncing rooms and reservations from Supabase...</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* 1. DEDICATED MOBILE FULLSCREEN CALENDAR (Shown strictly on sm:hidden) */}
      {/* ========================================================= */}
      <div className="block sm:hidden select-none" id="mobile_pms_calendar">
        <MobileCalendar
          rooms={rooms}
          bookingList={bookingList}
          currentMonth={currentMonth}
          onChangeMonth={setCurrentMonth}
          onSelectCell={onSelectCell}
          onSelectBooking={onSelectBooking}
          todayYMD={todayYMD}
        />
      </div>

      {/* ========================================================= */}
      {/* 2. DESKTOP SPREADSHEET CALENDAR (Shown strictly on sm:block) */}
      {/* ========================================================= */}
      <div className="hidden sm:block" id="desktop_pms_calendar">
        {/* Header Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 border-b border-gray-100 gap-4 bg-white select-none">
          <div>
            <h2 className="text-lg font-black text-gray-950 flex items-center gap-2 tracking-tight">
              <CalendarIcon className="w-5 h-5 text-indigo-600" />
              Booking Calendar
            </h2>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Monthly occupancy chart for resort rooms & reservations
            </p>
          </div>

          {/* Month Navigation & Today */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 shadow-2xs select-none">
              <button
                onClick={goToPrevMonth}
                className="px-3 py-1.5 hover:bg-white hover:text-indigo-600 text-slate-700 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"
                title={`Go to ${prevMonthName}`}
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{prevMonthName}</span>
              </button>

              <span className="px-4 py-1.5 text-sm font-black text-slate-900 min-w-[130px] text-center tracking-tight">
                {currentMonthTitle}
              </span>

              <button
                onClick={goToNextMonth}
                className="px-3 py-1.5 hover:bg-white hover:text-indigo-600 text-slate-700 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"
                title={`Go to ${nextMonthName}`}
              >
                <span>{nextMonthName}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={goToToday}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
            >
              Today
            </button>

            <ExportOccupancyButton
              rooms={rooms}
              bookings={bookingList}
              currentMonth={currentMonth}
              variant="desktop"
            />
          </div>
        </div>

        {/* Grid Viewport (Scrollable horizontally) */}
        <div ref={scrollContainerRef} className="overflow-x-auto w-full relative">
          <div style={{ width: `${ROOM_COL_WIDTH + daysInMonth * COL_WIDTH}px` }} className="min-w-full">
            {/* Header Row: Days of Month */}
            <div className="flex border-b border-slate-300 bg-slate-50 sticky top-0 z-30 select-none">
              {/* Room Column Label */}
              <div
                style={{ width: `${ROOM_COL_WIDTH}px` }}
                className="shrink-0 py-3 px-3 font-extrabold text-xs text-slate-700 uppercase tracking-wider sticky left-0 z-40 bg-slate-100 border-r border-slate-300 shadow-[2px_0_5px_rgba(0,0,0,0.04)] flex items-center justify-between"
              >
                <span>Room</span>
                <span className="text-[10px] text-slate-400 font-normal lowercase">{rooms.length} total</span>
              </div>

              {/* Day Columns */}
              <div className="flex">
                {monthDays.map((day) => (
                  <div
                    key={day.ymd}
                    style={{ width: `${COL_WIDTH}px` }}
                    className={`shrink-0 py-2 text-center border-r border-slate-300 flex flex-col justify-center ${
                      day.isToday
                        ? 'bg-purple-600 text-white font-black shadow-xs ring-2 ring-purple-600 z-10'
                        : day.isPast
                        ? 'bg-slate-100 text-slate-400 font-medium'
                        : 'bg-slate-50 text-slate-700 font-semibold'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-bold tracking-tight opacity-80 leading-none">
                      {day.dayOfWeek}
                    </span>
                    <span className="text-xs font-black mt-1 leading-none">
                      {day.dayNum}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Room Rows */}
            <div className="divide-y divide-slate-300 text-xs text-slate-700">
              {rooms.map((room) => {
                const bars = getRoomBookingsForMonth(room.number);

                return (
                  <div key={room.number} className="flex h-14 group hover:bg-slate-50/40 relative">
                    {/* Sticky Left Room Number */}
                    <div
                      style={{ width: `${ROOM_COL_WIDTH}px` }}
                      className="shrink-0 px-3 font-semibold sticky left-0 z-30 bg-white group-hover:bg-slate-50 border-r border-slate-300 flex flex-col justify-center shadow-[2px_0_5px_rgba(0,0,0,0.04)] select-none"
                    >
                      <span className="text-sm font-black text-slate-900 leading-tight">Room {room.number}</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mt-0.5">
                        Fl {room.floor} • {room.type}
                      </span>
                    </div>

                    {/* Days Timeline Relative Container */}
                    <div
                      style={{ width: `${daysInMonth * COL_WIDTH}px` }}
                      className="relative flex shrink-0 h-14"
                    >
                      {/* Background Day Cells */}
                      {monthDays.map((day) => (
                        <div
                          key={day.ymd}
                          style={{ width: `${COL_WIDTH}px` }}
                          onClick={() => onSelectCell(room.number, day.ymd)}
                          title={`Book Room ${room.number} on ${day.ymd}`}
                          className={`shrink-0 h-14 border-r border-slate-300 flex flex-col justify-between p-1 cursor-pointer transition relative group/cell ${
                            day.isToday
                              ? 'bg-purple-50/70 border-x border-purple-400 ring-1 ring-purple-300 z-10'
                              : day.isPast
                              ? 'bg-slate-100/60 hover:bg-slate-200/60'
                              : 'bg-white hover:bg-emerald-50/80'
                          }`}
                        >
                          <span className="text-[10px] text-gray-400 font-normal leading-none select-none pointer-events-none block pt-0.5 pl-0.5">
                            {day.dayNum}
                          </span>
                          <div className="flex-1 flex items-center justify-center">
                            <Plus className="w-3.5 h-3.5 text-emerald-600 opacity-0 group-hover/cell:opacity-100 transition stroke-[2.5]" />
                          </div>
                        </div>
                      ))}

                      {/* Overlaid Booking Bars */}
                      {bars.map(({ booking, leftPx, widthPx, extendsLeft, extendsRight, colorClass, statusLabel }) => {
                        const roundedClass = `${extendsLeft ? 'rounded-l-none' : 'rounded-l-md'} ${extendsRight ? 'rounded-r-none' : 'rounded-r-md'}`;
                        const tooltipText = `Guest: ${booking.guestName}\nRoom: ${booking.roomNumber}\nStay: ${formatDateHuman(booking.checkInDate)} – ${formatDateHuman(booking.checkOutDate)}\nStatus: ${statusLabel}`;

                        return (
                          <div
                            key={booking.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectBooking(booking.id);
                            }}
                            style={{
                              left: `${leftPx + 1}px`,
                              width: `${Math.max(COL_WIDTH - 2, widthPx - 2)}px`,
                            }}
                            title={tooltipText}
                            className={`absolute top-2.5 bottom-1.5 z-20 flex items-center px-1.5 transition cursor-pointer font-sans shadow-2xs border select-none overflow-hidden ${colorClass} ${roundedClass}`}
                          >
                            <span className="text-[11px] font-semibold leading-tight truncate w-full tracking-tight">
                              {booking.guestName}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-700 select-none">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-emerald-100 border border-emerald-300 inline-block"></span>
              <span>Available</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-blue-600 inline-block"></span>
              <span>Checked In / Occupied</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-amber-500 inline-block"></span>
              <span>Arrival / Booked</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-rose-600 inline-block"></span>
              <span>Departure / Checked Out</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-slate-200 inline-block"></span>
              <span>Past Dates</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded bg-purple-600 ring-2 ring-purple-400 inline-block"></span>
              <span>Today</span>
            </div>
          </div>

          <div className="text-[11px] font-mono font-bold text-slate-400">
            {rooms.length} ROOMS • SUPABASE SPREADSHEET
          </div>
        </div>
      </div>
    </div>
  );
}
