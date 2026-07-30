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
      const isToday = ymd === todayYMD;
      const isPast = ymd < todayYMD;
      list.push({
        dayNum: d,
        formattedDayNum: String(d).padStart(2, '0'),
        ymd,
        shortDayName,
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
        if (b.status === 'cancelled') return false;
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
        <div className="absolute top-10 right-2 z-50 bg-slate-900 border border-slate-700 rounded-xl p-2.5 shadow-2xl text-[10px] text-slate-200 animate-fadeIn space-y-1.5 w-44 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1 font-bold text-white">
            <span>Color Legend</span>
            <button onClick={() => setShowLegendModal(false)} className="text-slate-400 hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs bg-emerald-500 border border-emerald-400"></span>
              <span>Available</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs bg-amber-500"></span>
              <span>Reserved</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs bg-blue-600"></span>
              <span>Checked In</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs bg-rose-600"></span>
              <span>Checked Out</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs bg-slate-800 border border-slate-700"></span>
              <span>Past Date</span>
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
                  borderColor: 'rgba(255, 255, 255, 0.25)',
                }}
                className="sticky top-0 left-0 z-30 bg-slate-900 border-r-2 border-b-2 p-0 text-[9px] font-black text-slate-200 text-center font-mono uppercase shadow-xs"
              >
                RM
              </th>

              {/* Room Numbers Header Row */}
              {rooms.map((room) => (
                <th
                  key={room.number}
                  style={{
                    width: `${cellWidth}px`,
                    height: `${ROOM_ROW_HEIGHT}px`,
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                  }}
                  className="sticky top-0 z-20 bg-slate-900 border-r border-b-2 p-0 text-center font-extrabold text-[10px] text-slate-100 font-mono"
                >
                  {room.number}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {monthDays.map((day) => {
              const isToday = day.isToday;
              const cellBorderColor =
                zoom > 1.2 ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.08)';

              return (
                <tr
                  key={day.ymd}
                  className={isToday ? 'relative z-10 bg-indigo-950/30' : ''}
                >
                  {/* Date Left Column (Compressed: 01, 02...) */}
                  <td
                    style={{
                      width: `${dateColWidth}px`,
                      height: `${cellHeight}px`,
                      borderColor: isToday ? 'rgba(99, 102, 241, 0.6)' : 'rgba(255, 255, 255, 0.18)',
                    }}
                    className={`sticky left-0 z-20 border-r-2 border-b p-0 text-center align-middle ${
                      isToday
                        ? 'bg-indigo-600 text-white font-black shadow-xs'
                        : day.isPast
                        ? 'bg-slate-900/95 text-slate-400 font-medium'
                        : 'bg-slate-900 text-slate-300 font-bold'
                    }`}
                  >
                    <div className="flex items-center justify-center leading-none">
                      <span className="text-[10px] font-extrabold font-mono">{day.formattedDayNum}</span>
                      {zoom >= 1.4 && (
                        <span className="text-[7.5px] uppercase text-slate-400 font-mono ml-0.5">
                          {day.shortDayName}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Room Status Cells */}
                  {rooms.map((room) => {
                    const booking = getBookingForRoomAndDate(room.number, day.ymd);

                    // Color mapping
                    let colorBg = 'bg-emerald-500 hover:bg-emerald-400';
                    let statusTitle = 'Available';

                    if (booking) {
                      if (booking.status === 'checked-in') {
                        if (booking.checkOutDate === todayYMD) {
                          colorBg = 'bg-rose-600 hover:bg-rose-500';
                          statusTitle = 'Checkout Today';
                        } else {
                          colorBg = 'bg-blue-600 hover:bg-blue-500';
                          statusTitle = 'Checked In';
                        }
                      } else if (booking.status === 'checked-out') {
                        colorBg = 'bg-rose-600 hover:bg-rose-500';
                        statusTitle = 'Checked Out';
                      } else {
                        colorBg = 'bg-amber-500 hover:bg-amber-400';
                        statusTitle = 'Reserved';
                      }
                    } else if (day.isPast) {
                      colorBg = 'bg-[#182338] hover:bg-[#1f2d47]';
                      statusTitle = 'Past Date';
                    }

                    return (
                      <td
                        key={`${room.number}_${day.ymd}`}
                        style={{
                          width: `${cellWidth}px`,
                          height: `${cellHeight}px`,
                          borderColor: isToday ? 'rgba(99, 102, 241, 0.4)' : cellBorderColor,
                        }}
                        className={`p-0 border-r border-b align-middle text-center ${
                          isToday ? 'bg-indigo-950/20' : ''
                        }`}
                      >
                        <div
                          onTouchStart={(e) => handleTouchStart(e, room.number, day.ymd, booking)}
                          onClick={() => handleCellClick(room.number, day.ymd, booking)}
                          title={`Rm ${room.number} (${day.ymd}): ${statusTitle}`}
                          style={{ width: `${cellWidth}px`, height: `${cellHeight}px` }}
                          className={`w-full h-full cursor-pointer flex items-center justify-center transition-all active:ring-2 active:ring-indigo-300 active:ring-inset active:z-10 ${colorBg}`}
                        >
                          {/* Dot indicator when zoomed in */}
                          {zoom >= 1.6 && booking && (
                            <span className="w-1.5 h-1.5 rounded-full bg-white shadow-2xs"></span>
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

      {/* 4. TAP / QUICK DETAILS MODAL */}
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
                <p className="text-xs font-bold text-slate-700">Room available on this date</p>
                <p className="text-[11px] text-slate-500">
                  Tap below to create a new reservation for Room {selectedCellInfo.roomNumber}.
                </p>
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
