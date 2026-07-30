import React, { useState, useRef, useCallback } from 'react';
import { Booking, Room } from '../types';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  X,
  User,
  Calendar as CalendarIcon,
  Plus,
  Clock,
} from 'lucide-react';
import { formatDateHuman } from '../utils/formatters';

interface MobileCalendarProps {
  rooms: Room[];
  bookingList: Booking[];
  currentMonth: Date;
  onChangeMonth: (date: Date) => void;
  onSelectCell: (roomNumber: number, dateStr: string) => void;
  onSelectBooking: (bookingId: string) => void;
  todayYMD: string;
}

export default function MobileCalendar({
  rooms,
  bookingList,
  currentMonth,
  onChangeMonth,
  onSelectCell,
  onSelectBooking,
  todayYMD,
}: MobileCalendarProps) {
  // Zoom level state (0.75 to 2.5)
  const [zoom, setZoom] = useState<number>(1.0);

  // Quick Action / Popup state
  const [selectedCellInfo, setSelectedCellInfo] = useState<{
    roomNumber: number;
    dateYMD: string;
    booking: Booking | null;
    isLongPress: boolean;
  } | null>(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth(); // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // YYYY-MM-DD formatter
  const formatYMD = (y: number, m: number, d: number) => {
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  };

  // Generate days array for current month
  const monthDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const ymd = formatYMD(year, month, d);
    const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'narrow' });
    const shortDayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const isToday = ymd === todayYMD;
    const isPast = ymd < todayYMD;
    monthDays.push({
      dayNum: d,
      ymd,
      dayOfWeek,
      shortDayName,
      isToday,
      isPast,
    });
  }

  // Month navigation helpers
  const prevMonthObj = new Date(year, month - 1, 1);
  const nextMonthObj = new Date(year, month + 1, 1);
  const currentMonthTitle = currentMonth.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });

  const goToPrevMonth = () => onChangeMonth(prevMonthObj);
  const goToNextMonth = () => onChangeMonth(nextMonthObj);
  const goToToday = () => {
    const now = new Date();
    onChangeMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  // Helper to find booking for a room and date
  const getBookingForRoomAndDate = (roomNumber: number, dateYMD: string): Booking | null => {
    return (
      bookingList.find((b) => {
        if (b.roomNumber !== roomNumber) return false;
        if (b.status === 'cancelled') return false;
        return dateYMD >= b.checkInDate && dateYMD < b.checkOutDate;
      }) || null
    );
  };

  // Cell sizing based on Zoom
  const BASE_CELL_WIDTH = 32;
  const BASE_CELL_HEIGHT = 28;
  const BASE_DATE_COL_WIDTH = 56;
  const BASE_ROOM_ROW_HEIGHT = 32;

  const cellWidth = Math.round(BASE_CELL_WIDTH * zoom);
  const cellHeight = Math.round(BASE_CELL_HEIGHT * zoom);
  const dateColWidth = Math.max(48, Math.round(BASE_DATE_COL_WIDTH * Math.min(1.2, zoom)));
  const roomRowHeight = Math.max(28, Math.round(BASE_ROOM_ROW_HEIGHT * Math.min(1.2, zoom)));

  // Gesture handling refs
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const startDistRef = useRef<number>(0);
  const startZoomRef = useRef<number>(1.0);
  const lastTapTimeRef = useRef<number>(0);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef<boolean>(false);

  // Handle Touch Start for Pinch / Double-Tap / Long Press
  const handleTouchStart = (
    e: React.TouchEvent<HTMLDivElement>,
    roomNumber?: number,
    dateYMD?: string,
    booking?: Booking | null
  ) => {
    if (e.touches.length === 2) {
      // Pinch gesture start
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      isLongPressRef.current = false;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      startDistRef.current = dist;
      startZoomRef.current = zoom;
      return;
    }

    if (e.touches.length === 1 && roomNumber && dateYMD !== undefined) {
      // Double tap check
      const now = Date.now();
      if (now - lastTapTimeRef.current < 280) {
        // Reset zoom
        setZoom(1.0);
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        isLongPressRef.current = false;
        lastTapTimeRef.current = 0;
        return;
      }
      lastTapTimeRef.current = now;

      // Long press check
      isLongPressRef.current = false;
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        setSelectedCellInfo({
          roomNumber,
          dateYMD,
          booking: booking || null,
          isLongPress: true,
        });
      }, 500);
    }
  };

  // Handle Touch Move
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    // Cancel long press on move
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (e.touches.length === 2 && startDistRef.current > 0) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / startDistRef.current;
      const newZoom = Math.min(2.5, Math.max(0.75, startZoomRef.current * ratio));
      setZoom(Number(newZoom.toFixed(2)));
    }
  };

  // Handle Touch End
  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    startDistRef.current = 0;
  };

  // Cell Click / Tap
  const handleCellClick = (roomNumber: number, dateYMD: string, booking: Booking | null) => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }

    if (booking) {
      setSelectedCellInfo({
        roomNumber,
        dateYMD,
        booking,
        isLongPress: false,
      });
    } else {
      onSelectCell(roomNumber, dateYMD);
    }
  };

  // Reset zoom
  const handleResetZoom = () => setZoom(1.0);
  const handleZoomIn = () => setZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))));

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] w-full bg-slate-900 text-slate-100 select-none overflow-hidden font-sans rounded-xl border border-slate-800 shadow-xl" id="mobile_fullscreen_calendar">
      {/* 1. TOP TOOLBAR / NAVIGATION */}
      <div className="shrink-0 bg-slate-900 px-2 py-1.5 border-b border-slate-800 flex items-center justify-between gap-1 z-40">
        <div className="flex items-center gap-1">
          <button
            onClick={goToPrevMonth}
            className="p-1 rounded-lg bg-slate-800 active:bg-slate-700 text-slate-200 cursor-pointer"
            aria-label="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-black tracking-tight text-white px-1 font-mono min-w-[78px] text-center">
            {currentMonthTitle}
          </span>
          <button
            onClick={goToNextMonth}
            className="p-1 rounded-lg bg-slate-800 active:bg-slate-700 text-slate-200 cursor-pointer"
            aria-label="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={goToToday}
            className="px-2 py-1 bg-indigo-600 active:bg-indigo-700 text-white text-[11px] font-extrabold rounded-md shadow-xs transition"
          >
            Today
          </button>

          {/* Zoom Controls */}
          <div className="flex items-center bg-slate-800 rounded-md p-0.5 ml-1 border border-slate-700">
            <button
              onClick={handleZoomOut}
              disabled={zoom <= 0.75}
              className="p-1 text-slate-300 disabled:opacity-30 active:text-white"
              title="Zoom Out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span
              onClick={handleResetZoom}
              className="text-[10px] font-mono font-bold px-1 text-slate-300 cursor-pointer hover:text-white"
              title="Double tap grid or click to reset zoom"
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              disabled={zoom >= 2.5}
              className="p-1 text-slate-300 disabled:opacity-30 active:text-white"
              title="Zoom In"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. COMPACT COLOR LEGEND */}
      <div className="shrink-0 bg-slate-950 px-2 py-1 flex items-center justify-between text-[9px] font-bold border-b border-slate-800 text-slate-300">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block border border-emerald-400"></span>
          Avail
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block"></span>
          Reserved
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block"></span>
          Checked In
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-xs bg-rose-600 inline-block"></span>
          Checked Out
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-xs bg-slate-700 inline-block border border-slate-600"></span>
          Past
        </span>
      </div>

      {/* 3. FREEZE PANES FULLSCREEN MATRIX GRID */}
      <div
        ref={gridContainerRef}
        onTouchStart={(e) => handleTouchStart(e)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex-1 overflow-auto relative touch-pan-x touch-pan-y bg-slate-950"
      >
        <table className="border-collapse table-fixed w-max">
          <thead>
            <tr>
              {/* Top-Left Freeze Corner: Date / Room Label */}
              <th
                style={{ width: `${dateColWidth}px`, height: `${roomRowHeight}px` }}
                className="sticky top-0 left-0 z-30 bg-slate-900 border-r border-b border-slate-700 p-0 text-[10px] font-black text-slate-300 text-center uppercase font-mono shadow-xs"
              >
                Date
              </th>

              {/* Room Numbers Top Header Row (Sticky Top) */}
              {rooms.map((room) => (
                <th
                  key={room.number}
                  style={{ width: `${cellWidth}px`, height: `${roomRowHeight}px` }}
                  className="sticky top-0 z-20 bg-slate-900 border-r border-b border-slate-700 p-0 text-center font-black text-[11px] text-white font-mono shadow-2xs"
                >
                  {room.number}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {monthDays.map((day) => (
              <tr key={day.ymd}>
                {/* Date Left Column (Sticky Left) */}
                <td
                  style={{ width: `${dateColWidth}px`, height: `${cellHeight}px` }}
                  className={`sticky left-0 z-20 border-r border-b border-slate-800 p-0 text-center align-middle shadow-2xs ${
                    day.isToday
                      ? 'bg-indigo-600 text-white font-black'
                      : day.isPast
                      ? 'bg-slate-900/90 text-slate-500 font-medium'
                      : 'bg-slate-900 text-slate-200 font-bold'
                  }`}
                >
                  <div className="flex items-center justify-center gap-0.5 leading-none">
                    <span className="text-[11px] font-extrabold font-mono">{day.dayNum}</span>
                    <span className="text-[8.5px] uppercase text-slate-400 font-mono">
                      {day.shortDayName}
                    </span>
                  </div>
                </td>

                {/* Room Status Cells */}
                {rooms.map((room) => {
                  const booking = getBookingForRoomAndDate(room.number, day.ymd);

                  // Determine Color Code
                  let colorBg = 'bg-emerald-500/90 hover:bg-emerald-400 border-emerald-600/50';
                  let statusTitle = 'Available';

                  if (booking) {
                    if (booking.status === 'checked-in') {
                      if (booking.checkOutDate === todayYMD) {
                        colorBg = 'bg-rose-600 hover:bg-rose-500 border-rose-700';
                        statusTitle = 'Departure Today';
                      } else {
                        colorBg = 'bg-blue-600 hover:bg-blue-500 border-blue-700';
                        statusTitle = 'Checked In';
                      }
                    } else if (booking.status === 'checked-out') {
                      colorBg = 'bg-rose-600 hover:bg-rose-500 border-rose-700';
                      statusTitle = 'Checked Out';
                    } else {
                      colorBg = 'bg-amber-500 hover:bg-amber-400 border-amber-600';
                      statusTitle = 'Reserved';
                    }
                  } else if (day.isPast) {
                    colorBg = 'bg-slate-800/80 hover:bg-slate-800 border-slate-700/60';
                    statusTitle = 'Past Date';
                  }

                  return (
                    <td
                      key={`${room.number}_${day.ymd}`}
                      style={{ width: `${cellWidth}px`, height: `${cellHeight}px` }}
                      className="p-0 border-r border-b border-slate-900 align-middle text-center"
                    >
                      <div
                        onTouchStart={(e) => handleTouchStart(e, room.number, day.ymd, booking)}
                        onClick={() => handleCellClick(room.number, day.ymd, booking)}
                        title={`Rm ${room.number} (${day.ymd}): ${statusTitle}`}
                        style={{ width: `${cellWidth}px`, height: `${cellHeight}px` }}
                        className={`w-full h-full border transition-transform active:scale-90 cursor-pointer flex items-center justify-center ${colorBg}`}
                      >
                        {/* Optional status indicator dot if zoomed in */}
                        {zoom >= 1.5 && booking && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white/90 shadow-2xs"></span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4. TAP / LONG-PRESS POPUP MODAL */}
      {selectedCellInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-2xs animate-fadeIn">
          <div className="bg-white text-slate-900 rounded-2xl max-w-xs w-full p-4 shadow-2xl border border-slate-100 space-y-3">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-900 font-black text-xs rounded-md">
                  Room {selectedCellInfo.roomNumber}
                </span>
                <span className="text-xs font-mono font-bold text-slate-500">
                  {selectedCellInfo.dateYMD}
                </span>
              </div>
              <button
                onClick={() => setSelectedCellInfo(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            {selectedCellInfo.booking ? (
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Guest Name
                  </span>
                  <span className="font-black text-sm text-slate-900">
                    {selectedCellInfo.booking.guestName}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                      Check In
                    </span>
                    <span className="font-bold text-slate-800">
                      {formatDateHuman(selectedCellInfo.booking.checkInDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                      Check Out
                    </span>
                    <span className="font-bold text-slate-800">
                      {formatDateHuman(selectedCellInfo.booking.checkOutDate)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Status
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded ${
                      selectedCellInfo.booking.status === 'checked-in'
                        ? 'bg-blue-100 text-blue-800'
                        : selectedCellInfo.booking.status === 'checked-out'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {selectedCellInfo.booking.status}
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-2 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <Plus className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-700">Room is available on this date</p>
                <p className="text-[11px] text-slate-500">Tap below to create a new reservation for Room {selectedCellInfo.roomNumber}.</p>
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t">
              <button
                onClick={() => setSelectedCellInfo(null)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Close
              </button>
              {selectedCellInfo.booking ? (
                <button
                  onClick={() => {
                    const id = selectedCellInfo.booking!.id;
                    setSelectedCellInfo(null);
                    onSelectBooking(id);
                  }}
                  className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg shadow-xs"
                >
                  View Details
                </button>
              ) : (
                <button
                  onClick={() => {
                    const rm = selectedCellInfo.roomNumber;
                    const dt = selectedCellInfo.dateYMD;
                    setSelectedCellInfo(null);
                    onSelectCell(rm, dt);
                  }}
                  className="px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg shadow-xs"
                >
                  New Booking
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
