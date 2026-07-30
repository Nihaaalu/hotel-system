import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Booking, Room } from '../types';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  X,
  Plus,
  Info,
} from 'lucide-react';
import { formatDateHuman } from '../utils/formatters';
import ExportOccupancyButton from './ExportOccupancyButton';

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
  // Zoom level state (0.25 to 2.5). Default 1.0 is "Fit to Screen"
  const [zoom, setZoom] = useState<number>(1.0);
  const [showLegendModal, setShowLegendModal] = useState<boolean>(false);

  // Dynamic height measurement for auto-fit calculations
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [gridHeight, setGridHeight] = useState<number>(500);

  // Measure container size
  useEffect(() => {
    const updateHeight = () => {
      if (gridContainerRef.current) {
        const rect = gridContainerRef.current.getBoundingClientRect();
        if (rect.height > 100) {
          setGridHeight(rect.height);
        }
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    const observer = new ResizeObserver(updateHeight);
    if (gridContainerRef.current) {
      observer.observe(gridContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateHeight);
      observer.disconnect();
    };
  }, []);

  // Selected cell popover / modal state
  const [selectedCellInfo, setSelectedCellInfo] = useState<{
    roomNumber: number;
    dateYMD: string;
    booking: Booking | null;
    isLongPress: boolean;
  } | null>(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth(); // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const COUPLE_ROOMS = useMemo(() => new Set([101, 102, 103, 201, 202, 203, 204, 205]), []);

  // Format YYYY-MM-DD
  const formatYMD = (y: number, m: number, d: number) => {
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  };

  // Days array for current month
  const monthDays = useMemo(() => {
    const list = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const ymd = formatYMD(year, month, d);
      const shortDayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const dayOfWeek = dateObj.getDay(); // 0 = Sun, 5 = Fri, 6 = Sat
      const isFriSatSun = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
      const isToday = ymd === todayYMD;
      const isPast = ymd < todayYMD;
      list.push({
        dayNum: d,
        formattedDayNum: String(d).padStart(2, '0'),
        ymd,
        shortDayName,
        isFriSatSun,
        isToday,
        isPast,
      });
    }
    return list;
  }, [year, month, daysInMonth, todayYMD]);

  // Month navigation helpers
  const prevMonthObj = new Date(year, month - 1, 1);
  const nextMonthObj = new Date(year, month + 1, 1);
  const currentMonthTitle = currentMonth.toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
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
        if (b.status === 'cancelled' || b.status === 'checked-out') return false;
        return dateYMD >= b.checkInDate && dateYMD < b.checkOutDate;
      }) || null
    );
  };

  // Dynamic cell sizing:
  // At zoom = 1.0 (Fit view), calculate cellHeight so ALL daysInMonth fit inside gridHeight without vertical scrollbar!
  const ROOM_ROW_HEIGHT = 22; // sticky header height
  const availableHeightForCells = Math.max(200, gridHeight - ROOM_ROW_HEIGHT - 2);
  const fitCellHeight = Math.max(14, Math.floor(availableHeightForCells / daysInMonth));

  // Actual cell dimensions
  const cellHeight = Math.round(fitCellHeight * zoom);
  const cellWidth = Math.max(20, Math.round(24 * zoom));
  const dateColWidth = Math.max(30, Math.round(34 * Math.min(1.2, zoom)));

  // Gesture handling refs
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
      // Double tap check to reset zoom
      const now = Date.now();
      if (now - lastTapTimeRef.current < 280) {
        setZoom(1.0); // Reset to 100% Fit
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
      }, 450);
    }
  };

  // Handle Touch Move
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
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
      const newZoom = Math.min(2.5, Math.max(0.25, startZoomRef.current * ratio));
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

  // Cell Tap
  const handleCellClick = (roomNumber: number, dateYMD: string, booking: Booking | null) => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }

    if (booking) {
      onSelectBooking(booking.id);
    } else {
      onSelectCell(roomNumber, dateYMD);
    }
  };

  // Zoom preset handlers
  const handleResetZoom = () => setZoom(1.0);
  const handleZoomIn = () => setZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))));

  return (
    <div
      className="flex flex-col h-[calc(100vh-68px)] w-full bg-slate-950 text-slate-100 select-none overflow-hidden font-sans border-0 shadow-none relative"
      id="mobile_fullscreen_calendar"
    >
      {/* 1. COLLAPSED SINGLE-ROW TOOLBAR (Height ~34px) */}
      <div className="shrink-0 bg-slate-900 px-1.5 py-1 border-b border-slate-800 flex items-center justify-between gap-1 z-40 h-9">
        {/* Month Switcher */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={goToPrevMonth}
            className="p-1 rounded bg-slate-800 active:bg-slate-700 text-slate-200 cursor-pointer"
            aria-label="Previous Month"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-black tracking-tight text-white px-1 font-mono uppercase">
            {currentMonthTitle}
          </span>
          <button
            onClick={goToNextMonth}
            className="p-1 rounded bg-slate-800 active:bg-slate-700 text-slate-200 cursor-pointer"
            aria-label="Next Month"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={goToToday}
            className="px-1.5 py-0.5 bg-indigo-600 active:bg-indigo-700 text-white text-[10px] font-extrabold rounded shadow-xs transition"
          >
            Today
          </button>

          <ExportOccupancyButton
            rooms={rooms}
            bookings={bookingList}
            currentMonth={currentMonth}
            variant="mobile"
          />

          {/* Compact Zoom Control */}
          <div className="flex items-center bg-slate-800 rounded p-0.5 border border-slate-700">
            <button
              onClick={handleZoomOut}
              disabled={zoom <= 0.25}
              className="p-0.5 text-slate-300 disabled:opacity-30 active:text-white"
              title="Zoom Out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              onClick={handleResetZoom}
              className="text-[9.5px] font-mono font-bold px-1 text-indigo-300 hover:text-white"
              title="Double tap or click to reset to 100% Fit"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              disabled={zoom >= 2.5}
              className="p-0.5 text-slate-300 disabled:opacity-30 active:text-white"
              title="Zoom In"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>

          {/* Tiny Floating Legend Trigger Button */}
          <button
            onClick={() => setShowLegendModal(!showLegendModal)}
            className="p-1 bg-slate-800 active:bg-slate-700 text-amber-400 rounded border border-slate-700 flex items-center justify-center"
            title="Calendar Legend"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. FLOATING LEGEND POPUP (Does NOT take permanent vertical space) */}
      {showLegendModal && (
        <div className="absolute top-10 right-2 z-50 bg-slate-900 border border-slate-700 rounded-xl p-2.5 shadow-2xl text-[10px] text-slate-200 animate-fadeIn space-y-1.5 w-48 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1 font-bold text-white">
            <span>Color Legend (Mobile)</span>
            <button onClick={() => setShowLegendModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs border border-[#D6D6D6] bg-white"></span>
              <span>Available (White)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs border border-[#C79A00] bg-[#FFD54F]"></span>
              <span className="text-amber-300">Reserved (Yellow)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs border border-[#B71C1C] bg-[#E53935]"></span>
              <span className="text-red-400">Checked In (Red)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs border border-[#8A8A8A] bg-[#BDBDBD]"></span>
              <span className="text-slate-300">Checked Out (Grey)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs border border-[#BDBDBD] bg-[#ECECEC]"></span>
              <span className="text-slate-400">Cancelled (Light Grey)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs border border-[#3A3A3A] bg-[#FFF4D6]"></span>
              <span className="text-amber-200">Couple Room (Cream)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs border border-[#B71C1C] bg-[#D32F2F]"></span>
              <span className="text-red-300">Fri - Sun Date (Red)</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. FULLSCREEN AUTO-FIT MATRIX GRID (Spreadsheet Style) */}
      <div
        ref={gridContainerRef}
        onTouchStart={(e) => handleTouchStart(e)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex-1 overflow-auto relative touch-pan-x touch-pan-y bg-slate-950 scrollbar-none"
      >
        <table className="border-collapse table-fixed w-max bg-slate-950">
          <thead>
            <tr>
              {/* Top-Left Freeze Corner */}
              <th
                style={{
                  width: `${dateColWidth}px`,
                  height: `${ROOM_ROW_HEIGHT}px`,
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  borderColor: '#3A3A3A',
                }}
                className="sticky top-0 left-0 z-30 border-r-2 border-b-2 p-0 text-[9px] font-black text-center font-mono uppercase shadow-xs flex items-center justify-center"
              >
                RM
              </th>

              {/* Room Numbers Header Row */}
              {rooms.map((room) => {
                const isCouple = COUPLE_ROOMS.has(Number(room.number));
                return (
                  <th
                    key={room.number}
                    style={{
                      width: `${cellWidth}px`,
                      height: `${ROOM_ROW_HEIGHT}px`,
                      backgroundColor: isCouple ? '#FFF4D6' : '#1E293B',
                      color: isCouple ? '#000000' : '#FFFFFF',
                      borderColor: '#3A3A3A',
                    }}
                    className="sticky top-0 z-20 border-r border-b-2 p-0 text-center align-middle font-extrabold text-[10px] font-mono"
                  >
                    <div className="w-full h-full flex items-center justify-center font-bold">
                      {room.number}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {monthDays.map((day) => {
              const isToday = day.isToday;
              // Date column: Friday, Saturday, Sunday -> Red background (#D32F2F) with white text; Mon-Thu -> White with black text
              const dateBgColor = day.isFriSatSun ? '#D32F2F' : '#FFFFFF';
              const dateTextColor = day.isFriSatSun ? '#FFFFFF' : '#000000';

              return (
                <tr
                  key={day.ymd}
                  className={isToday ? 'relative z-10' : ''}
                >
                  {/* Date Left Column */}
                  <td
                    style={{
                      width: `${dateColWidth}px`,
                      height: `${cellHeight}px`,
                      backgroundColor: dateBgColor,
                      color: dateTextColor,
                      borderColor: isToday ? '#EF4444' : '#3A3A3A',
                      outline: isToday ? '1.5px solid #EF4444' : 'none',
                    }}
                    className="sticky left-0 z-20 border-r-2 border-b p-0 text-center align-middle font-bold"
                  >
                    <div className="w-full h-full flex items-center justify-center leading-none text-center">
                      <span className="text-[10px] font-extrabold font-mono">{day.formattedDayNum}</span>
                      {zoom >= 1.4 && (
                        <span
                          style={{ color: day.isFriSatSun ? '#FFCDD2' : '#555555' }}
                          className="text-[7.5px] uppercase font-mono ml-0.5 font-bold"
                        >
                          {day.shortDayName}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Room Status Cells */}
                  {rooms.map((room) => {
                    const booking = getBookingForRoomAndDate(room.number, day.ymd);
                    const isCouple = COUPLE_ROOMS.has(Number(room.number));

                    // Default available styling (Couple room gets light cream #FFF4D6, normal gets #FFFFFF)
                    let bg = isCouple ? '#FFF4D6' : '#FFFFFF';
                    let textColor = '#444444';
                    let cellBorderColor = '#3A3A3A';
                    let textDecoration = 'none';
                    let statusTitle = 'Available';

                    if (booking) {
                      if (booking.status === 'checked-in') {
                        bg = '#E53935'; // Red
                        textColor = '#FFFFFF';
                        cellBorderColor = '#B71C1C';
                        statusTitle = 'Checked In';
                      } else if (booking.status === 'checked-out') {
                        bg = '#BDBDBD'; // Grey
                        textColor = '#FFFFFF';
                        cellBorderColor = '#8A8A8A';
                        statusTitle = 'Checked Out';
                      } else if (booking.status === 'cancelled') {
                        bg = '#ECECEC'; // Light Grey
                        textColor = '#666666';
                        cellBorderColor = '#BDBDBD';
                        statusTitle = 'Cancelled';
                      } else {
                        // Reserved (booked)
                        bg = '#FFD54F'; // Yellow
                        textColor = '#000000';
                        cellBorderColor = '#C79A00';
                        statusTitle = 'Reserved';
                      }
                    }

                    const guestText = booking?.guestName ? booking.guestName.trim().toUpperCase() : '';

                    return (
                      <td
                        key={`${room.number}_${day.ymd}`}
                        style={{
                          width: `${cellWidth}px`,
                          height: `${cellHeight}px`,
                          borderColor: cellBorderColor,
                          backgroundColor: bg,
                        }}
                        className="p-0 border-r border-b align-middle text-center overflow-hidden"
                      >
                        <div
                          onTouchStart={(e) => handleTouchStart(e, room.number, day.ymd, booking)}
                          onClick={() => handleCellClick(room.number, day.ymd, booking)}
                          title={`Rm ${room.number} (${day.ymd}): ${statusTitle}${booking ? ' - ' + booking.guestName : ''}`}
                          style={{
                            width: `${cellWidth}px`,
                            height: `${cellHeight}px`,
                            backgroundColor: bg,
                            color: textColor,
                            textDecoration,
                          }}
                          className="w-full h-full cursor-pointer flex items-center justify-center text-center transition-all active:opacity-80 p-0"
                        >
                          {booking && (
                            <span className="text-[8.5px] font-black uppercase truncate px-0.5 text-center leading-none w-full block select-none">
                              {zoom < 1.2 && cellWidth < 30
                                ? guestText.charAt(0)
                                : guestText}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
