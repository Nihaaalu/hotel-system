import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Booking, Room } from '../types';
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus as PlusIcon,
  MoreVertical,
  X,
  Info,
  User,
  CheckCircle2,
  Download,
} from 'lucide-react';
import ExportOccupancyButton from './ExportOccupancyButton';
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
  // Zoom level state (0.75 to 2.0). Default 1.0 is "100% Fit to Screen"
  const [zoom, setZoom] = useState<number>(1.0);
  const zoomRef = useRef<number>(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Overflow Menu & Legend Sheet States
  const [showOverflowMenu, setShowOverflowMenu] = useState<boolean>(false);
  const [showLegendSheet, setShowLegendSheet] = useState<boolean>(false);

  // Selected cell & column highlight state
  const [selectedCell, setSelectedCell] = useState<{
    roomNumber: number;
    dateYMD: string;
  } | null>(null);
  const [selectedColumnRoom, setSelectedColumnRoom] = useState<number | null>(null);

  // Container & Table DOM refs
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // Initial screen dimensions fallback
  const initialW = typeof window !== 'undefined' ? window.innerWidth : 360;
  const initialH = typeof window !== 'undefined' ? window.innerHeight - 80 : 550;

  const [gridWidth, setGridWidth] = useState<number>(initialW);
  const [gridHeight, setGridHeight] = useState<number>(initialH);

  // Measure container viewport size accurately
  useEffect(() => {
    const updateDimensions = () => {
      if (gridContainerRef.current) {
        const rect = gridContainerRef.current.getBoundingClientRect();
        if (rect.height > 100) setGridHeight(rect.height);
        if (rect.width > 100) setGridWidth(rect.width);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    const observer = new ResizeObserver(updateDimensions);
    if (gridContainerRef.current) {
      observer.observe(gridContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateDimensions);
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

  // Days array: ALWAYS 31 rows allocated (1 to 31)
  const monthDays31 = useMemo(() => {
    const list = [];
    for (let d = 1; d <= 31; d++) {
      const isActive = d <= daysInMonth;
      if (isActive) {
        const dateObj = new Date(year, month, d);
        const ymd = formatYMD(year, month, d);
        const dayOfWeek = dateObj.getDay(); // 0 = Sun, 5 = Fri, 6 = Sat
        const isFriSatSun = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
        const isToday = ymd === todayYMD;
        const isPast = ymd < todayYMD;
        list.push({
          dayNum: d,
          formattedDayNum: String(d).padStart(2, '0'),
          ymd,
          isFriSatSun,
          isToday,
          isPast,
          isActive: true,
        });
      } else {
        // Disabled row for months with <31 days
        list.push({
          dayNum: d,
          formattedDayNum: String(d).padStart(2, '0'),
          ymd: `disabled_${d}`,
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
  const currentMonthFullTitle = currentMonth.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });

  const goToPrevMonth = () => onChangeMonth(prevMonthObj);
  const goToNextMonth = () => onChangeMonth(nextMonthObj);
  const goToToday = () => {
    const now = new Date();
    onChangeMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  // Zoom control helpers
  const zoomIn = () => setZoom((prev) => Math.min(2.0, Math.round((prev + 0.15) * 100) / 100));
  const zoomOut = () => setZoom((prev) => Math.max(0.75, Math.round((prev - 0.15) * 100) / 100));
  const resetZoom = () => setZoom(1.0);

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

  // Guest initials generator
  const getGuestInitials = (name?: string) => {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.trim().slice(0, 2).toUpperCase();
  };

  // Guest short name generator
  const getShortGuestName = (name?: string) => {
    if (!name) return '';
    const first = name.trim().split(/\s+/)[0];
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  };

  // Dynamic cell sizing:
  // 1. HEIGHT: ALWAYS fit 31 rows + header in available height at zoom = 1.0!
  const ROOM_ROW_HEIGHT = 28; // sticky room header row height (compact tabs)
  const bottomCardHeight = selectedCell ? 64 : 0;
  const availableHeightForCells = Math.max(220, gridHeight - ROOM_ROW_HEIGHT - bottomCardHeight - 36);
  const fitCellHeight = Math.max(16, Math.floor(availableHeightForCells / 31));

  // 2. WIDTH: ALWAYS fit date column + all rooms in available width at zoom = 1.0!
  const numRooms = rooms.length || 13;
  const dateColWidthBase = 32; // date column width (NO WEEKDAY TEXT)
  const availableWidthForRooms = Math.max(200, gridWidth - dateColWidthBase - 8);
  const fitCellWidth = Math.max(26, Math.floor(availableWidthForRooms / numRooms));

  // Actual cell dimensions scaled by zoom
  const cellHeight = Math.max(14, Math.round(fitCellHeight * zoom));
  const cellWidth = Math.max(22, Math.round(fitCellWidth * zoom));
  const dateColWidth = Math.max(28, Math.round(dateColWidthBase * Math.min(1.2, zoom)));

  // Touch gesture & focal point pinch zoom engine
  const lastTapTimeRef = useRef<number>(0);
  const pinchAnimationRef = useRef<number | null>(null);

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
    let currentTargetZoom = 1.0;

    let targetScrollLeft = 0;
    let targetScrollTop = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        isPinching = true;

        const t1 = e.touches[0];
        const t2 = e.touches[1];

        startDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        startZoom = zoomRef.current;
        currentTargetZoom = startZoom;

        const rect = container.getBoundingClientRect();
        focalX = (t1.clientX + t2.clientX) / 2 - rect.left;
        focalY = (t1.clientY + t2.clientY) / 2 - rect.top;

        startScrollLeft = container.scrollLeft;
        startScrollTop = container.scrollTop;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && isPinching && startDist > 0) {
        e.preventDefault();

        const t1 = e.touches[0];
        const t2 = e.touches[1];

        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (dist === 0) return;

        const ratio = dist / startDist;
        const rawZoom = startZoom * ratio;
        currentTargetZoom = Math.min(2.0, Math.max(0.75, rawZoom));

        const visualScale = currentTargetZoom / startZoom;

        targetScrollLeft = (startScrollLeft + focalX) * visualScale - focalX;
        targetScrollTop = (startScrollTop + focalY) * visualScale - focalY;

        if (pinchAnimationRef.current) {
          cancelAnimationFrame(pinchAnimationRef.current);
        }

        pinchAnimationRef.current = requestAnimationFrame(() => {
          if (!isPinching) return;

          const cHeight = Math.max(14, Math.round(fitCellHeight * currentTargetZoom));
          const cWidth = Math.max(22, Math.round(fitCellWidth * currentTargetZoom));
          const dWidth = Math.max(28, Math.round(dateColWidthBase * Math.min(1.2, currentTargetZoom)));

          if (tableRef.current) {
            tableRef.current.style.setProperty('--cell-w', `${cWidth}px`);
            tableRef.current.style.setProperty('--cell-h', `${cHeight}px`);
            tableRef.current.style.setProperty('--date-w', `${dWidth}px`);
          }

          container.scrollLeft = Math.max(0, targetScrollLeft);
          container.scrollTop = Math.max(0, targetScrollTop);
        });
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && isPinching) {
        isPinching = false;
        if (pinchAnimationRef.current) {
          cancelAnimationFrame(pinchAnimationRef.current);
          pinchAnimationRef.current = null;
        }

        const finalZoom = Number(currentTargetZoom.toFixed(2));
        setZoom(finalZoom);

        requestAnimationFrame(() => {
          container.scrollLeft = Math.max(0, targetScrollLeft);
          container.scrollTop = Math.max(0, targetScrollTop);
        });

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
      if (pinchAnimationRef.current) {
        cancelAnimationFrame(pinchAnimationRef.current);
      }
    };
  }, [fitCellHeight, fitCellWidth, dateColWidthBase]);

  // Double tap to reset zoom
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
    const isSameSelected = selectedCell?.roomNumber === roomNumber && selectedCell?.dateYMD === dateYMD;

    if (isSameSelected) {
      if (booking) {
        onSelectBooking(booking.id);
      } else {
        onSelectCell(roomNumber, dateYMD);
      }
    } else {
      setSelectedCell({ roomNumber, dateYMD });
    }
  };

  // Currently selected booking object
  const selectedCellBooking = useMemo(() => {
    if (!selectedCell) return null;
    return getBookingForRoomAndDate(selectedCell.roomNumber, selectedCell.dateYMD);
  }, [selectedCell, bookingList]);

  return (
    <div
      className="flex flex-col h-[calc(100dvh-54px)] sm:h-[calc(100vh-120px)] w-full bg-slate-950 text-slate-100 select-none overflow-hidden font-sans relative border-0 shadow-none"
      id="mobile_pms_board"
    >
      {/* 1. COMPACT TOOLBAR (Height <= 42px) */}
      <div className="shrink-0 bg-slate-900 border-b border-slate-800/80 px-2 py-0.5 flex items-center justify-between gap-1 z-40 h-[40px]">
        {/* Month Navigation & Today */}
        <div className="flex items-center gap-1">
          <button
            onClick={goToPrevMonth}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 cursor-pointer transition"
            aria-label="Previous Month"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <span className="text-[11px] font-black tracking-tight text-white px-0.5 font-mono uppercase whitespace-nowrap">
            {currentMonthFullTitle}
          </span>

          <button
            onClick={goToNextMonth}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 cursor-pointer transition"
            aria-label="Next Month"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={goToToday}
            className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-[10px] font-black rounded transition cursor-pointer ml-0.5 shadow-2xs"
          >
            Today
          </button>
        </div>

        {/* Compact Stepper Zoom & Overflow Menu */}
        <div className="flex items-center gap-1">
          {/* Stepper Zoom [-] 100% [+] */}
          <div className="flex items-center bg-slate-800/90 rounded border border-slate-700/80 text-[10px] font-bold overflow-hidden shadow-2xs">
            <button
              onClick={zoomOut}
              className="px-1.5 py-0.5 text-slate-300 hover:text-white hover:bg-slate-700 active:bg-slate-600 transition cursor-pointer"
              title="Zoom Out"
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              onClick={resetZoom}
              className="px-1.5 py-0.5 font-mono text-indigo-300 hover:text-white hover:bg-slate-700 transition cursor-pointer border-x border-slate-700/80 min-w-[34px] text-center"
              title="Reset Zoom to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={zoomIn}
              className="px-1.5 py-0.5 text-slate-300 hover:text-white hover:bg-slate-700 active:bg-slate-600 transition cursor-pointer"
              title="Zoom In"
            >
              <PlusIcon className="w-3 h-3" />
            </button>
          </div>

          {/* Overflow Menu Toggle (⋮) */}
          <div className="relative">
            <button
              onClick={() => setShowOverflowMenu(!showOverflowMenu)}
              className={`p-1 rounded transition cursor-pointer ${
                showOverflowMenu ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
              title="More Actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {/* Overflow Dropdown Popup */}
            {showOverflowMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowOverflowMenu(false)}
                />
                <div className="absolute right-0 top-8 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 min-w-[170px] text-xs animate-in fade-in slide-in-from-top-1 duration-100">
                  <button
                    onClick={() => {
                      setShowLegendSheet(true);
                      setShowOverflowMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 text-left cursor-pointer transition font-medium"
                  >
                    <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Occupancy Legend</span>
                  </button>

                  <div className="my-1 border-t border-slate-800" />

                  <div className="px-1 py-0.5">
                    <ExportOccupancyButton
                      rooms={rooms}
                      bookings={bookingList}
                      currentMonth={currentMonth}
                      variant="mobile"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. COLLAPSIBLE LEGEND BOTTOM SHEET */}
      {showLegendSheet && (
        <div className="absolute top-[42px] right-2 z-50 bg-slate-900/95 border border-slate-700 rounded-xl p-3 shadow-2xl text-[11px] text-slate-200 animate-in fade-in slide-in-from-top-2 duration-150 w-64 backdrop-blur-md">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 font-extrabold text-white">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Occupancy Legend</span>
            <button onClick={() => setShowLegendSheet(false)} className="text-slate-400 hover:text-white p-0.5 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1.5 rounded-lg border border-slate-700/60">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-100 border border-emerald-400"></span>
              <span className="font-bold text-emerald-300">Checked In</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1.5 rounded-lg border border-slate-700/60">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-100 border border-blue-400"></span>
              <span className="font-bold text-blue-300">Reserved</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1.5 rounded-lg border border-slate-700/60">
              <span className="w-2.5 h-2.5 rounded-xs bg-rose-100 border border-rose-400"></span>
              <span className="font-bold text-rose-300">Checked Out</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1.5 rounded-lg border border-slate-700/60">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 border border-blue-400"></span>
              <span className="font-bold text-white">Today Highlight</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1.5 rounded-lg border border-slate-700/60">
              <span className="w-2.5 h-2.5 rounded-xs bg-rose-50 border border-rose-200"></span>
              <span className="font-bold text-rose-300">Weekend (Red)</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1.5 rounded-lg border border-slate-700/60">
              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-500 border border-indigo-300"></span>
              <span className="font-bold text-indigo-300">Selected Cell</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. MATRIX GRID AREA (~85% of Viewport) */}
      <div
        ref={gridContainerRef}
        className="flex-1 overflow-auto relative touch-pan-x touch-pan-y bg-slate-950 scrollbar-none"
      >
        <table
          ref={tableRef}
          style={
            {
              '--cell-w': `${cellWidth}px`,
              '--cell-h': `${cellHeight}px`,
              '--date-w': `${dateColWidth}px`,
            } as React.CSSProperties
          }
          className="border-collapse table-fixed w-max bg-slate-950"
        >
          <thead>
            <tr>
              {/* Top-Left Freeze Corner (RM) */}
              <th
                style={{
                  width: 'var(--date-w)',
                  minWidth: 'var(--date-w)',
                  maxWidth: 'var(--date-w)',
                  height: `${ROOM_ROW_HEIGHT}px`,
                  backgroundColor: '#111827',
                  color: '#FFFFFF',
                  borderColor: '#374151',
                }}
                className="sticky top-0 left-0 z-30 border-r border-b p-0 font-extrabold text-center font-mono text-[8px] uppercase tracking-wider shadow-2xs"
              >
                RM
              </th>

              {/* Room Numbers Header Row - All Dark #111827 */}
              {rooms.map((room, idx) => {
                const rNum = Number(room.number);
                const isColumnSelected = selectedColumnRoom === rNum;
                const isFloorDivider =
                  rNum === 108 || (rNum < 200 && rooms[idx + 1] && Number(rooms[idx + 1].number) >= 200);

                return (
                  <th
                    key={room.number}
                    style={{
                      width: 'var(--cell-w)',
                      minWidth: 'var(--cell-w)',
                      maxWidth: 'var(--cell-w)',
                      height: `${ROOM_ROW_HEIGHT}px`,
                      backgroundColor: '#111827',
                      borderColor: '#374151',
                      borderRightColor: isFloorDivider ? '#CBD5E1' : '#374151',
                      borderRightWidth: '1px',
                    }}
                    className="sticky top-0 z-20 border-b p-0 text-center align-middle font-bold leading-none"
                  >
                    <div className="w-full h-full flex items-center justify-center p-0.5">
                      <button
                        onClick={() => setSelectedColumnRoom(selectedColumnRoom === rNum ? null : rNum)}
                        style={{
                          backgroundColor: isColumnSelected ? '#4F46E5' : '#111827',
                          color: '#FFFFFF',
                        }}
                        className={`w-full h-full rounded-t text-[10px] font-black transition cursor-pointer flex items-center justify-center ${
                          isColumnSelected ? 'shadow-2xs ring-1 ring-indigo-300' : 'hover:bg-slate-800 active:bg-slate-700'
                        }`}
                        title={`Select Room ${room.number}`}
                      >
                        {room.number}
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {monthDays31.map((day) => {
              if (!day.isActive) {
                // Disabled row beyond daysInMonth
                return (
                  <tr key={day.ymd} className="opacity-20 select-none">
                    <td
                      style={{
                        width: 'var(--date-w)',
                        minWidth: 'var(--date-w)',
                        maxWidth: 'var(--date-w)',
                        height: 'var(--cell-h)',
                        backgroundColor: '#090E1A',
                        color: '#334155',
                        borderColor: '#0F172A',
                      }}
                      className="sticky left-0 z-20 border-r border-b p-0 text-center align-middle font-bold font-mono text-[9px]"
                    >
                      <div className="w-full h-full flex items-center justify-center">
                        <span>{day.formattedDayNum}</span>
                      </div>
                    </td>

                    {rooms.map((room, idx) => {
                      const rNum = Number(room.number);
                      const isFloorDivider =
                        rNum === 108 || (rNum < 200 && rooms[idx + 1] && Number(rooms[idx + 1].number) >= 200);

                      return (
                        <td
                          key={`${room.number}_${day.ymd}`}
                          style={{
                            width: 'var(--cell-w)',
                            minWidth: 'var(--cell-w)',
                            maxWidth: 'var(--cell-w)',
                            height: 'var(--cell-h)',
                            borderColor: '#0F172A',
                            borderRightColor: isFloorDivider ? '#334155' : '#0F172A',
                            borderRightWidth: '1px',
                            backgroundColor: '#070B14',
                          }}
                          className="p-0 border-b align-middle text-center overflow-hidden pointer-events-none"
                        >
                          <div className="w-full h-full flex items-center justify-center text-[7px] text-slate-800">
                            -
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              }

              // Active Day Row
              const isToday = day.isToday;
              const isSelectedDate = selectedCell?.dateYMD === day.ymd;

              // Clean Date Column background & styling (NO WEEKDAY TEXT)
              let dateBgColor = '#FFFFFF';
              let dateTextColor = '#0F172A'; // Normal days: Dark text
              let dateBorderColor = '#E2E8F0';

              if (isToday) {
                dateBgColor = '#EFF6FF'; // Soft blue background
                dateTextColor = '#1D4ED8';
                dateBorderColor = '#93C5FD';
              } else if (day.isFriSatSun) {
                dateBgColor = '#FFF1F2'; // Soft rose
                dateTextColor = '#E11D48'; // Red text for weekend
                dateBorderColor = '#FECDD3';
              } else if (isSelectedDate) {
                dateBgColor = '#EEF2FF'; // Soft indigo
                dateTextColor = '#4338CA';
                dateBorderColor = '#A5B4FC';
              }

              return (
                <tr key={day.ymd} className={isToday ? 'relative z-10' : ''}>
                  {/* Clean Date Column: ONLY 01, 02, 03... (NO WEEKDAY TEXT) */}
                  <td
                    style={{
                      width: 'var(--date-w)',
                      minWidth: 'var(--date-w)',
                      maxWidth: 'var(--date-w)',
                      height: 'var(--cell-h)',
                      backgroundColor: dateBgColor,
                      color: dateTextColor,
                      borderColor: dateBorderColor,
                    }}
                    className="sticky left-0 z-20 border-r border-b p-0 text-center align-middle font-bold"
                  >
                    <div className="w-full h-full flex items-center justify-center leading-none text-center">
                      {isToday ? (
                        <span className="bg-blue-600 text-white rounded-full px-1 py-0.5 font-black text-[9px] shadow-2xs font-mono">
                          {day.formattedDayNum}
                        </span>
                      ) : (
                        <span
                          className={`font-black font-mono text-[10px] ${
                            day.isFriSatSun ? 'text-rose-600 font-extrabold' : 'text-slate-800'
                          }`}
                        >
                          {day.formattedDayNum}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Room Cells */}
                  {rooms.map((room, idx) => {
                    const rNum = Number(room.number);
                    const isFloor2 = rNum >= 200;
                    const isFloorDivider =
                      rNum === 108 || (rNum < 200 && rooms[idx + 1] && Number(rooms[idx + 1].number) >= 200);

                    const booking = getBookingForRoomAndDate(rNum, day.ymd);
                    const isCellSelected = selectedCell?.roomNumber === rNum && selectedCell?.dateYMD === day.ymd;
                    const isColumnSelected = selectedColumnRoom === rNum;

                    // Base empty cell column background tint:
                    // Group 1 (101-103): Warm Light Cream (#F7E8C6)
                    // Group 2 (104-108): Pure White (#FFFFFF)
                    // Group 3 (201-205): Warm Dark Cream (#EFD9A7)
                    let bg = '#FFFFFF';
                    let todayBg = '#F8FAFC';
                    let colSelectBg = '#F1F5F9';

                    if (rNum <= 103) {
                      bg = '#F7E8C6';
                      todayBg = '#EFE0BD';
                      colSelectBg = '#EAD7AC';
                    } else if (rNum >= 200) {
                      bg = '#EFD9A7';
                      todayBg = '#E7CF9B';
                      colSelectBg = '#DFC58E';
                    }

                    let textColor = '#334155';
                    let cellBorderColor = '#E5E7EB';
                    let statusTitle = 'Available';

                    if (booking) {
                      // Booking colors override column tint
                      if (booking.status === 'checked-in') {
                        bg = '#D1FAE5'; // Soft Emerald
                        textColor = '#065F46';
                        cellBorderColor = '#A7F3D0';
                        statusTitle = 'Checked In';
                      } else if (booking.status === 'checked-out') {
                        bg = '#FFE4E6'; // Soft Rose
                        textColor = '#9F1239';
                        cellBorderColor = '#FECDD3';
                        statusTitle = 'Checked Out';
                      } else {
                        // Reserved
                        bg = '#DBEAFE'; // Soft Blue
                        textColor = '#1E40AF';
                        cellBorderColor = '#BFDBFE';
                        statusTitle = 'Reserved';
                      }
                    } else if (isToday) {
                      bg = todayBg; // Soft tint for today row
                    } else if (isColumnSelected) {
                      bg = colSelectBg; // Highlight tint for selected room column
                    }

                    // Content inside cell based on Zoom level
                    let cellLabel = '';
                    if (booking) {
                      if (zoom > 1.1) {
                        cellLabel = getShortGuestName(booking.guestName);
                      } else if (zoom >= 0.9) {
                        cellLabel = getGuestInitials(booking.guestName);
                      } else {
                        cellLabel = ''; // Colored block chip only
                      }
                    }

                    return (
                      <td
                        key={`${room.number}_${day.ymd}`}
                        style={{
                          width: 'var(--cell-w)',
                          minWidth: 'var(--cell-w)',
                          maxWidth: 'var(--cell-w)',
                          height: 'var(--cell-h)',
                          borderColor: isCellSelected ? '#3B82F6' : cellBorderColor,
                          borderRightColor: isCellSelected
                            ? '#3B82F6'
                            : isFloorDivider
                            ? '#CBD5E1'
                            : cellBorderColor,
                          borderRightWidth: '1px',
                          backgroundColor: isCellSelected ? '#DBEAFE' : bg,
                        }}
                        className={`p-0 border-b align-middle text-center overflow-hidden transition-colors ${
                          isCellSelected ? 'ring-2 ring-blue-600 ring-offset-0 z-10' : 'border-r'
                        }`}
                      >
                        <div
                          onTouchStart={handleCellTouchStart}
                          onClick={() => handleCellClick(rNum, day.ymd, booking)}
                          title={`Room ${rNum} (${day.ymd}): ${statusTitle}${booking ? ' - ' + booking.guestName : ''}`}
                          style={{
                            width: 'var(--cell-w)',
                            height: 'var(--cell-h)',
                            color: textColor,
                          }}
                          className="w-full h-full cursor-pointer flex items-center justify-center text-center p-0.5 active:opacity-80"
                        >
                          {booking ? (
                            <div className="w-full h-full rounded-xs flex items-center justify-center px-0.5">
                              <span className="font-extrabold uppercase truncate text-center leading-none text-[9px] tracking-tight">
                                {cellLabel}
                              </span>
                            </div>
                          ) : isCellSelected ? (
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping"></div>
                          ) : null}
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

      {/* 4. COMPACT STICKY BOTTOM CARD (Shown ONLY when cell is selected) */}
      {selectedCell && (
        <div className="shrink-0 bg-slate-900 border-t border-slate-800 p-2 z-50 flex items-center justify-between gap-2 shadow-2xl animate-in slide-in-from-bottom-2 duration-150 h-[56px]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="bg-indigo-600 text-white px-2 py-1 rounded-md text-xs font-black shrink-0">
              {selectedCell.roomNumber}
            </span>
            <div className="flex flex-col min-w-0">
              <div className="text-xs font-black text-white truncate leading-tight">
                {selectedCellBooking ? selectedCellBooking.guestName || 'Guest' : 'Available Room'}
              </div>
              <div className="text-[10px] font-semibold text-slate-400 truncate">
                {formatDateHuman(selectedCell.dateYMD)}
                {selectedCellBooking ? ` • ${selectedCellBooking.status.toUpperCase()}` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {selectedCellBooking ? (
              <button
                type="button"
                onClick={() => onSelectBooking(selectedCellBooking.id)}
                className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-lg shadow-2xs transition flex items-center gap-1 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>View Booking</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSelectCell(selectedCell.roomNumber, selectedCell.dateYMD)}
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-lg shadow-2xs transition flex items-center gap-1 cursor-pointer"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                <span>New Booking</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedCell(null)}
              className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              aria-label="Close Selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
