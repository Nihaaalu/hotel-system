import React, { useState, useEffect } from 'react';
import { useHotelData } from '../context/HotelContext';
import { getISTDateStr } from '../utils/formatters';
import { RefreshCw, AlertCircle } from 'lucide-react';
import MobileCalendar from './MobileCalendar';

interface BookingCalendarProps {
  onSelectCell: (roomNumber: number, date: string) => void;
  onSelectBooking: (bookingId: string) => void;
  refreshTrigger?: number;
}

export default function BookingCalendar({
  onSelectCell,
  onSelectBooking,
}: BookingCalendarProps) {
  const { rooms, bookings: bookingList, isLoading, error: errorMsg, refreshData: loadCalendarData } = useHotelData();

  // Selected month (first day of month in IST)
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const istStr = getISTDateStr();
    const [y, m] = istStr.split('-').map(Number);
    return new Date(y, m - 1, 1);
  });

  const todayYMD = getISTDateStr();

  return (
    <div className="bg-slate-900 rounded-none sm:rounded-2xl sm:border sm:border-slate-800 sm:shadow-lg overflow-hidden w-full h-full" id="booking_calendar_panel">
      {/* Error State Banner */}
      {errorMsg && (
        <div className="p-2.5 bg-red-900/90 border-b border-red-800 text-red-100 text-xs font-semibold flex items-center justify-between px-3 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-300" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={loadCalendarData}
            className="px-2.5 py-1 bg-red-800 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {/* Syncing Loading Banner */}
      {isLoading && (
        <div className="p-2.5 bg-indigo-950/80 border-b border-indigo-900 text-indigo-200 text-xs font-medium flex items-center justify-center gap-2 shrink-0">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Syncing rooms and reservations...</span>
        </div>
      )}

      {/* Unified Mobile-First PMS Board */}
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
  );
}
