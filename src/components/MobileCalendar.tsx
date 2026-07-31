import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Booking, Room } from '../types';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  X,
  Info,
} from 'lucide-react';
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
  // Zoom level state (0.75 to 2.5). Default 1.0 is "100% Fit to Screen"
  const [zoom, setZoom] = useState<number>(1.0);
  const zoomRef = useRef<number>(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

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

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth(); // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Format YYYY-MM-DD
  const formatYMD = (y: number, m: number, d: number) => {
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  };

  // Days array: ALWAYS 31 rows allocated (1 to 31) regardless of month
  const monthDays31 = useMemo(() => {
    const list = [];
    for (let d = 1; d <= 31; d++) {
      const isActive = d <= daysInMonth;
      if (isActive) {
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
          isActive: true,
        });
      } else {
        // Disabled row for months with <31 days (e.g. Feb 29-31, Apr 31)
        list.push({
          dayNum: d,
          formattedDayNum: String(d).padStart(2, '0'),
          ymd: `disabled_${d}`,
          shortDayName: '-',
          isFriSatSun: false,
          isToday: false,
          isPast: false,
          isActive: false,
        });
      }
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
        if (b.status === 'cancelled') return false;
        return dateYMD >= b.checkInDate && dateYMD < b.checkOutDate;
      }) || null
    );
  };

  // Dynamic cell sizing: ALWAYS fit 31 rows in available height at zoom = 1.0!
  const ROOM_ROW_HEIGHT = 20; // sticky room header row height
  const availableHeightForCells = Math.max(180, gridHeight - ROOM_ROW_HEIGHT - 2);
  const fitCellHeight = Math.max(12, Math.floor(availableHeightForCells / 31));

  // Actual cell dimensions scaled by zoom
  const cellHeight = Math.max(10, Math.round(fitCellHeight * zoom));
  const cellWidth = Math.max(22, Math.round(26 * zoom));
  const dateColWidth = Math.max(28, Math.round(32 * Math.min(1.2, zoom)));

  // Touch gesture & focal point pinch zoom logic
  const lastTapTimeRef = useRef<number>(0);

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;

    let startDist = 0;
    let startZoom = 1.0;
    let startScrollLeft = 0;
    let startScrollTop = 0;
    let focalX = 0;
    let focalY = 0;
    let isPinching = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault(); // Prevent native browser screen zoom
        isPinching = true;

        const t1 = e.touches[0];
        const t2 = e.touches[1];

        startDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        startZoom = zoomRef.current;

        const rect = container.getBoundingClientRect();
        focalX = (t1.clientX + t2.clientX) / 2 - rect.left;
        focalY = (t1.clientY + t2.clientY) / 2 - rect.top;

        startScrollLeft = container.scrollLeft;
        startScrollTop = container.scrollTop;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && isPinching && startDist > 0) {
        e.preventDefault(); // Prevent browser zoom while pinching

        const t1 = e.touches[0];
        const t2 = e.touches[1];

        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (dist === 0) return;

        const ratio = dist / startDist;
        const rawZoom = startZoom * ratio;
        // Strictly enforce 75% min zoom, 250% max zoom
        const newZoom = Math.min(2.5, Math.max(0.75, rawZoom));

        if (Math.abs(newZoom - zoomRef.current) > 0.005) {
          setZoom(Number(newZoom.toFixed(2)));

          // Preserve visible scroll position around the focal point under fingers
          const scale = newZoom / startZoom;
          const targetScrollLeft = (startScrollLeft + focalX) * scale - focalX;
          const targetScrollTop = (startScrollTop + focalY) * scale - focalY;

          container.scrollLeft = Math.max(0, targetScrollLeft);
          container.scrollTop = Math.max(0, targetScrollTop);
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        isPinching = false;
        startDist = 0;
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', onTouchEnd);

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  // Double tap to reset zoom to 1.0 (100% Fit)
  const handleCellTouchStart = () => {
    const now = Date.now();
    if (now - lastTapTimeRef.current < 280) {
      setZoom(1.0);
      lastTapTimeRef.current = 0;
      return;
    }
    lastTapTimeRef.current = now;
  };

  // Cell Click / Tap
  const handleCellClick = (roomNumber: number, dateYMD: string, booking: Booking | null) => {
    if (booking) {
      onSelectBooking(booking.id);
    } else {
      onSelectCell(roomNumber, dateYMD);
    }
  };

  // Zoom preset handlers
  const handleResetZoom = () => setZoom(1.0);
  const handleZoomIn = () => setZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))));

  return (
    <div
      className="flex flex-col h-[calc(100vh-68px)] w-full bg-slate-950 text-slate-100 select-none overflow-hidden font-sans border-0 shadow-none relative"
      id="mobile_fullscreen_calendar"
    >
      {/* 1. COMPACT TOOLBAR (Height ~32px, reduced 15-20%) */}
      <div className="shrink-0 bg-slate-900 px-1 py-0.5 border-b border-slate-800 flex items-center justify-between gap-1 z-40 h-8">
        {/* Month Switcher */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={goToPrevMonth}
            className="p-0.5 rounded bg-slate-800 active:bg-slate-700 text-slate-200 cursor-pointer"
            aria-label="Previous Month"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <span className="text-[10px] font-black tracking-tight text-white px-0.5 font-mono uppercase">
            {currentMonthTitle}
          </span>
          <button
            onClick={goToNextMonth}
            className="p-0.5 rounded bg-slate-800 active:bg-slate-700 text-slate-200 cursor-pointer"
            aria-label="Next Month"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={goToToday}
            className="px-1.5 py-0.5 bg-indigo-600 active:bg-indigo-700 text-white text-[9.5px] font-black rounded shadow-2xs transition"
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
              disabled={zoom <= 0.75}
              className="p-0.5 text-slate-300 disabled:opacity-30 active:text-white"
              title="Zoom Out (Min 75%)"
            >
              <ZoomOut className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={handleResetZoom}
              className="text-[9px] font-mono font-bold px-1 text-indigo-300 hover:text-white"
              title="Double tap or click to reset to 100% Fit"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              disabled={zoom >= 2.5}
              className="p-0.5 text-slate-300 disabled:opacity-30 active:text-white"
              title="Zoom In (Max 250%)"
            >
              <ZoomIn className="w-2.5 h-2.5" />
            </button>
          </div>

          {/* Legend Trigger Button */}
          <button
            onClick={() => setShowLegendModal(!showLegendModal)}
            className="p-0.5 bg-slate-800 active:bg-slate-700 text-amber-400 rounded border border-slate-700 flex items-center justify-center"
            title="Calendar Legend"
          >
            <Info className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 2. FLOATING LEGEND POPUP */}
      {showLegendModal && (
        <div className="absolute top-9 right-1 z-50 bg-slate-900 border border-slate-700 rounded-xl p-2 shadow-2xl text-[9.5px] text-slate-200 animate-fadeIn space-y-1 w-44 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1 font-bold text-white">
            <span>Color Legend</span>
            <button onClick={() => setShowLegendModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs border border-[#D6D6D6] bg-white"></span>
              <span>Available (White)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs border border-[#C79A00] bg-[#FFD54F]"></span>
              <span className="text-amber-300">Reserved (Yellow)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs border border-[#1565C0] bg-[#1E88E5]"></span>
              <span className="text-blue-400">Checked In (Blue)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs border border-[#B71C1C] bg-[#E53935]"></span>
              <span className="text-red-400">Checked Out (Red)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs border border-[#3A3A3A] bg-[#FFF4D6]"></span>
              <span className="text-amber-200">First Fl Cream</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs border border-[#3A3A3A] bg-[#EDE0D4]"></span>
              <span className="text-amber-100">Second Fl Coffee</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs border border-[#B71C1C] bg-[#D32F2F]"></span>
              <span className="text-red-300">Fri - Sun Date (Red)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs border border-slate-700 bg-slate-900/60"></span>
              <span className="text-slate-400">Disabled (31-day pad)</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. FULLSCREEN MATRIX GRID (Always 31 Rows Fit on Screen) */}
      <div
        ref={gridContainerRef}
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
                  fontSize: `${Math.min(10, Math.max(7.5, 8.5 * Math.sqrt(zoom)))}px`,
                }}
                className="sticky top-0 left-0 z-30 border-r-2 border-b-2 p-0 font-black text-center font-mono uppercase shadow-xs"
              >
                RM
              </th>

              {/* Room Numbers Header Row */}
              {rooms.map((room) => {
                const rNum = Number(room.number);
                let headerBg = '#1E293B';
                let headerColor = '#FFFFFF';

                if ([101, 102, 103].includes(rNum)) {
                  headerBg = '#FFF4D6'; // First Floor Cream
                  headerColor = '#000000';
                } else if ([201, 202, 203, 204, 205].includes(rNum)) {
                  headerBg = '#EDE0D4'; // Second Floor Coffee
                  headerColor = '#000000';
                }

                return (
                  <th
                    key={room.number}
                    style={{
                      width: `${cellWidth}px`,
                      height: `${ROOM_ROW_HEIGHT}px`,
                      backgroundColor: headerBg,
                      color: headerColor,
                      borderColor: '#3A3A3A',
                      fontSize: `${Math.min(12, Math.max(8, 9.5 * Math.sqrt(zoom)))}px`,
                    }}
                    className="sticky top-0 z-20 border-r border-b-2 p-0 text-center align-middle font-black font-mono leading-none"
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
            {monthDays31.map((day) => {
              if (!day.isActive) {
                // Disabled row beyond daysInMonth (e.g. Days 29..31 in Feb, Day 31 in Apr)
                return (
                  <tr key={day.ymd} className="opacity-40 select-none">
                    {/* Date Left Column (Disabled) */}
                    <td
                      style={{
                        width: `${dateColWidth}px`,
                        height: `${cellHeight}px`,
                        backgroundColor: '#090E1A',
                        color: '#475569',
                        borderColor: '#1E293B',
                        fontSize: `${Math.min(10, Math.max(7, 8.5 * Math.sqrt(zoom)))}px`,
                      }}
                      className="sticky left-0 z-20 border-r-2 border-b p-0 text-center align-middle font-bold font-mono"
                    >
                      <div className="w-full h-full flex items-center justify-center leading-none text-center">
                        <span>{day.formattedDayNum}</span>
                      </div>
                    </td>

                    {/* Room Status Cells (Disabled) */}
                    {rooms.map((room) => (
                      <td
                        key={`${room.number}_${day.ymd}`}
                        style={{
                          width: `${cellWidth}px`,
                          height: `${cellHeight}px`,
                          borderColor: '#1E293B',
                          backgroundColor: '#070B14',
                        }}
                        className="p-0 border-r border-b align-middle text-center overflow-hidden pointer-events-none"
                      >
                        <div className="w-full h-full flex items-center justify-center text-[7px] text-slate-700">
                          -
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              }

              // Active Day Row (Days 1 to daysInMonth)
              const isToday = day.isToday;
              const dateBgColor = day.isFriSatSun ? '#D32F2F' : '#FFFFFF';
              const dateTextColor = day.isFriSatSun ? '#FFFFFF' : '#000000';

              return (
                <tr
                  key={day.ymd}
                  className={isToday ? 'relative z-10' : ''}
                >
                  {/* Date Left Column (Frozen Sticky) */}
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
                      <span
                        style={{ fontSize: `${Math.min(11, Math.max(7.5, 9 * Math.sqrt(zoom)))}px` }}
                        className="font-black font-mono"
                      >
                        {day.formattedDayNum}
                      </span>
                      {zoom >= 1.4 && (
                        <span
                          style={{
                            color: day.isFriSatSun ? '#FFCDD2' : '#555555',
                            fontSize: `${Math.min(9, Math.max(6.5, 7.5 * Math.sqrt(zoom)))}px`,
                          }}
                          className="uppercase font-mono ml-0.5 font-bold"
                        >
                          {day.shortDayName}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Room Status Cells */}
                  {rooms.map((room) => {
                    const booking = getBookingForRoomAndDate(room.number, day.ymd);

                    let bg = '#FFFFFF';
                    let textColor = '#444444';
                    let cellBorderColor = '#3A3A3A';
                    let statusTitle = 'Available';

                    if (booking) {
                      if (booking.status === 'checked-in') {
                        bg = '#1E88E5'; // Blue
                        textColor = '#FFFFFF';
                        cellBorderColor = '#1565C0';
                        statusTitle = 'Checked In';
                      } else if (booking.status === 'checked-out') {
                        bg = '#E53935'; // Red
                        textColor = '#FFFFFF';
                        cellBorderColor = '#B71C1C';
                        statusTitle = 'Checked Out';
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
                          onTouchStart={handleCellTouchStart}
                          onClick={() => handleCellClick(room.number, day.ymd, booking)}
                          title={`Rm ${room.number} (${day.ymd}): ${statusTitle}${booking ? ' - ' + booking.guestName : ''}`}
                          style={{
                            width: `${cellWidth}px`,
                            height: `${cellHeight}px`,
                            backgroundColor: bg,
                            color: textColor,
                          }}
                          className="w-full h-full cursor-pointer flex items-center justify-center text-center transition-all active:opacity-80 p-0"
                        >
                          {booking && (
                            <span
                              style={{
                                fontSize: `${Math.min(10, Math.max(6.5, 8 * Math.sqrt(zoom)))}px`,
                              }}
                              className="font-black uppercase truncate px-0.2 text-center leading-none w-full block select-none"
                            >
                              {zoom < 1.2 && cellWidth < 28
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

