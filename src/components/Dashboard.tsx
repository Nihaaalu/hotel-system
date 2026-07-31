import React, { useMemo } from 'react';
import { Booking, DashboardStats, Room } from '../types';
import { useHotelData } from '../context/HotelContext';
import { formatDateDDMMYYYY } from '../utils/formatters';
import {
  BedSingle,
  DoorOpen,
  LogIn,
  LogOut,
  AlertTriangle,
  Plus,
  Calendar,
  LayoutDashboard,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

interface DashboardProps {
  onSelectBooking: (id: string) => void;
  onSelectCell: (roomNumber: number, date: string) => void;
  onNavigateToCalendar: () => void;
  refreshTrigger?: number;
}

interface RoomStatusMapping {
  room: Room;
  status: 'AVAILABLE' | 'OCCUPIED' | 'CHECKOUT_TODAY' | 'CHECKIN_TODAY';
  booking: Booking | null;
  colorClass: string;
  badgeClass: string;
}

export default function Dashboard({
  onSelectBooking,
  onSelectCell,
  onNavigateToCalendar,
}: DashboardProps) {
  const { rooms, bookings, payments, expenses, isLoading, error: errorMsg, refreshData: loadDashboardStats } = useHotelData();

  const { stats, roomStatuses } = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const currentYearMonth = todayStr.substring(0, 7);

    // Filter active bookings for TODAY (checkInDate <= todayStr)
    const todayActiveBookings = bookings.filter((b) => {
      if (b.status === 'cancelled') return false;
      if (b.checkInDate > todayStr) return false; // Ignore future bookings for today's dashboard!
      return true;
    });

    const future = bookings.filter((b) => b.status === 'booked' && b.checkInDate > todayStr);
    const checkinsToday = todayActiveBookings.filter((b) => b.status === 'checked-in' && b.checkInDate === todayStr);
    const checkoutsToday = bookings.filter((b) => b.checkOutDate === todayStr && (b.status === 'checked-in' || b.status === 'checked-out'));
    const staying = todayActiveBookings.filter((b) => b.status === 'checked-in');

    // Financial calculations grouped by unique reservation
    const uniqueTodayResMap = new Map<string, { totalAmount: number; advancePaid: number; paymentStatus: string; status: string }>();
    todayActiveBookings.forEach((b) => {
      const groupId = b.bookingGroupId || b.id;
      if (!uniqueTodayResMap.has(groupId)) {
        uniqueTodayResMap.set(groupId, {
          totalAmount: Number(b.totalAmount || 0),
          advancePaid: Number(b.advancePaid || 0),
          paymentStatus: b.paymentStatus,
          status: b.status,
        });
      } else {
        const existing = uniqueTodayResMap.get(groupId)!;
        if (b.status === 'checked-in') existing.status = 'checked-in';
        if (b.paymentStatus === 'paid') existing.paymentStatus = 'paid';
      }
    });

    let totalAmountSum = 0;
    let advancePaidSum = 0;
    let balanceSum = 0;

    uniqueTodayResMap.forEach((res) => {
      totalAmountSum += res.totalAmount;
      advancePaidSum += res.advancePaid;

      // When Guest is Checked In or payment_status === 'paid', remaining balance is 0
      if (res.status === 'checked-in' || res.status === 'checked-out' || res.paymentStatus === 'paid') {
        balanceSum += 0;
      } else {
        balanceSum += Math.max(0, res.totalAmount - res.advancePaid);
      }
    });

    const todayColl = payments
      .filter((p) => p.paymentDate.split('T')[0] === todayStr)
      .reduce((sum, p) => sum + Number(p.amount || p.advancePaid || 0), 0);

    const todayExp = (expenses || [])
      .filter((e) => e.expenseDate === todayStr)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const monthExp = (expenses || [])
      .filter((e) => e.expenseDate && e.expenseDate.startsWith(currentYearMonth))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // Build room statuses based on today's active bookings ONLY
    const statuses: RoomStatusMapping[] = rooms.map((room) => {
      const activeRoomBookings = todayActiveBookings.filter(
        (b) => b.roomNumber === room.number && b.status !== 'checked-out'
      );

      // 1. Checked-in booking
      const checkedInBooking = activeRoomBookings.find(
        (b) => b.status === 'checked-in'
      );

      if (checkedInBooking) {
        if (checkedInBooking.checkOutDate === todayStr) {
          return {
            room,
            status: 'CHECKOUT_TODAY',
            booking: checkedInBooking,
            colorClass: 'border-red-500 bg-red-50/10 hover:bg-red-50/20 text-red-950',
            badgeClass: 'bg-red-100 text-red-800 border-red-200',
          };
        }
        return {
          room,
          status: 'OCCUPIED',
          booking: checkedInBooking,
          colorClass: 'border-blue-500 bg-blue-50/5 hover:bg-blue-50/15 text-blue-900',
          badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
        };
      }

      // 2. Arriving TODAY (checkInDate === todayStr)
      const arrivingTodayBooking = activeRoomBookings.find(
        (b) => b.checkInDate === todayStr && (b.status === 'booked' || b.status === 'reserved')
      );

      if (arrivingTodayBooking) {
        return {
          room,
          status: 'CHECKIN_TODAY',
          booking: arrivingTodayBooking,
          colorClass: 'border-orange-500 bg-orange-50/10 hover:bg-orange-50/20 text-orange-950',
          badgeClass: 'bg-orange-100 text-orange-850 border-orange-200',
        };
      }

      // 3. Otherwise available (including future bookings)
      return {
        room,
        status: 'AVAILABLE',
        booking: null,
        colorClass: 'border-emerald-500 bg-emerald-50/5 hover:bg-emerald-50/15 text-emerald-900',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      };
    });

    const availableCount = statuses.filter((s) => s.status === 'AVAILABLE').length;
    const occupiedCount = statuses.filter((s) => s.status === 'OCCUPIED' || s.status === 'CHECKOUT_TODAY').length;

    const computedStats: DashboardStats = {
      availableRoomsCount: availableCount,
      occupiedRoomsCount: occupiedCount,
      futureBookingsCount: future.length,
      todayCheckinsCount: checkinsToday.length,
      todayCheckoutsCount: checkoutsToday.length,
      currentStayingCount: staying.length,
      todayCollection: todayColl,
      totalPendingBalance: balanceSum,
      totalBookingAmount: totalAmountSum,
      totalAdvancePaid: advancePaidSum,
      todayExpenses: todayExp,
      monthExpenses: monthExp,
    };

    return { stats: computedStats, roomStatuses: statuses };
  }, [rooms, bookings, payments, expenses]);


  const todayStr = new Date().toISOString().split('T')[0];

  const formatDateShort = (dateStr: string) => {
    return formatDateDDMMYYYY(dateStr);
  };

  const handleRoomClick = (mapping: RoomStatusMapping) => {
    if (mapping.booking) {
      onSelectBooking(mapping.booking.id);
    } else {
      // Available room: open modal pre-filled with this room & today's date
      onSelectCell(mapping.room.number, todayStr);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-6 pb-24" id="pms_dashboard_panel">
      {/* Top Notification Banner for Loading / Error */}
      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={loadDashboardStats}
            className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-2xs font-bold transition flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {isLoading && (
        <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-indigo-700 text-xs font-medium flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
          <span>Fetching live status from Supabase...</span>
        </div>
      )}

      {/* SECTION 1: COMPACT KPI CARDS */}
      <div className="space-y-2 sm:space-y-3">
        {/* Room Status & Balance Cards */}
        <section 
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3"
          id="dashboard_top_summary"
        >
          {/* Available Rooms */}
          <div className="py-2 px-3 sm:px-4 bg-white border border-gray-200 rounded-xl flex items-center justify-between shadow-2xs h-[52px] sm:h-[64px] transition hover:border-emerald-300">
            <div>
              <span className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Available</span>
              <span className="text-base sm:text-lg font-black text-emerald-700 font-mono leading-none">
                {stats.availableRoomsCount} / {rooms.length}
              </span>
            </div>
            <BedSingle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500 shrink-0" />
          </div>

          {/* Occupied Rooms */}
          <div className="py-2 px-3 sm:px-4 bg-white border border-gray-200 rounded-xl flex items-center justify-between shadow-2xs h-[52px] sm:h-[64px] transition hover:border-blue-300">
            <div>
              <span className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Occupied</span>
              <span className="text-base sm:text-lg font-black text-blue-700 font-mono leading-none">
                {stats.occupiedRoomsCount} / {rooms.length}
              </span>
            </div>
            <DoorOpen className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 shrink-0" />
          </div>

          {/* Today's Checkins */}
          <div className="py-2 px-3 sm:px-4 bg-white border border-gray-200 rounded-xl flex items-center justify-between shadow-2xs h-[52px] sm:h-[64px] transition hover:border-orange-300">
            <div>
              <span className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Check-in</span>
              <span className="text-base sm:text-lg font-black text-orange-700 font-mono leading-none">{stats.todayCheckinsCount}</span>
            </div>
            <LogIn className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 shrink-0" />
          </div>

          {/* Today's Checkouts */}
          <div className="py-2 px-3 sm:px-4 bg-white border border-gray-200 rounded-xl flex items-center justify-between shadow-2xs h-[52px] sm:h-[64px] transition hover:border-red-300">
            <div>
              <span className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Check-out</span>
              <span className="text-base sm:text-lg font-black text-red-700 font-mono leading-none">{stats.todayCheckoutsCount}</span>
            </div>
            <LogOut className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 shrink-0" />
          </div>

          {/* Balance Pending */}
          <div className="py-2 px-3 sm:px-4 bg-rose-50/30 border border-rose-200 rounded-xl flex items-center justify-between shadow-2xs h-[52px] sm:h-[64px] col-span-2 sm:col-span-1">
            <div>
              <span className="text-[9px] sm:text-[10px] text-rose-700 font-bold uppercase tracking-wider block">Balance</span>
              <span className="text-sm sm:text-base font-black text-rose-700 font-mono leading-none">₹{(stats.totalPendingBalance || 0).toLocaleString()}</span>
            </div>
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          </div>
        </section>
      </div>

      {/* SECTION 2: REAL-TIME ROOM BOARD */}
      <section className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-5 shadow-2xs flex-1" id="pms_realtime_status">
        <div className="flex items-center justify-between border-b border-gray-100 pb-2.5 mb-3 select-none">
          <h2 className="text-xs sm:text-sm font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
            Real-Time Room Board
          </h2>
          <span className="text-3xs font-mono text-gray-400 uppercase">{rooms.length} Total Rooms</span>
        </div>

        {/* 2 COLUMNS ON MOBILE, 4 COLUMNS ON DESKTOP */}
        <div 
          className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3" 
          id="realtime_room_grid"
        >
          {roomStatuses.map((mapping) => {
            const hasBooking = !!mapping.booking;

            if (mapping.status === 'AVAILABLE') {
              return (
                <div
                  key={mapping.room.number}
                  onClick={() => handleRoomClick(mapping)}
                  className="h-[95px] sm:h-[120px] p-2.5 sm:p-3.5 flex flex-col justify-between rounded-xl border-2 border-emerald-500 bg-white hover:border-emerald-600 hover:bg-emerald-50/10 cursor-pointer shadow-2xs transition-all duration-150 select-none"
                  id={`room_card_${mapping.room.number}`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-lg sm:text-2xl font-black text-gray-900 leading-none">Room {mapping.room.number}</span>
                    <span className="text-[9px] sm:text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">Available</span>
                  </div>
                  <div className="text-2xs text-gray-400 font-medium">Tap to book</div>
                </div>
              );
            }

            const borderClass = 
              mapping.status === 'CHECKIN_TODAY' ? 'border-orange-500 bg-orange-50/10' :
              mapping.status === 'CHECKOUT_TODAY' ? 'border-red-500 bg-red-50/10' :
              'border-blue-500 bg-blue-50/10';

            const tagColor = 
              mapping.status === 'CHECKIN_TODAY' ? 'bg-orange-100 text-orange-800' :
              mapping.status === 'CHECKOUT_TODAY' ? 'bg-red-100 text-red-800' :
              'bg-blue-100 text-blue-800';

            const statusLabel = 
              mapping.status === 'CHECKIN_TODAY' ? 'Arriving' :
              mapping.status === 'CHECKOUT_TODAY' ? 'Checkout' :
              'Occupied';

            const outText = formatDateShort(mapping.booking!.checkOutDate);

            return (
              <div
                key={mapping.room.number}
                onClick={() => handleRoomClick(mapping)}
                className={`h-[95px] sm:h-[120px] p-2.5 sm:p-3.5 flex flex-col justify-between rounded-xl border-2 ${borderClass} hover:shadow-xs cursor-pointer transition-all duration-150 select-none`}
                id={`room_card_${mapping.room.number}`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-lg sm:text-2xl font-black text-gray-900 leading-none">Room {mapping.room.number}</span>
                  <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${tagColor}`}>{statusLabel}</span>
                </div>
                
                <div className="min-w-0">
                  <span className="text-xs sm:text-sm font-extrabold text-gray-900 truncate block leading-tight">{mapping.booking!.guestName}</span>
                </div>

                <div className="flex items-center justify-between text-[10px] sm:text-xs text-gray-600 font-medium leading-none">
                  <span>Out {outText}</span>
                  <span className="font-bold text-gray-900">₹{mapping.booking!.totalAmount}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FLOATING COMPACT QUICK NAVIGATION BAR */}
      <div 
        className="fixed bottom-2.5 left-1/2 -translate-x-1/2 z-40 bg-slate-950/95 backdrop-blur-md border border-slate-800 text-white rounded-full shadow-2xl p-1 flex items-center gap-1"
        id="floating_quick_actions"
      >
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="px-2.5 py-1.5 min-h-[44px] bg-slate-800/90 hover:bg-slate-700 rounded-full flex items-center gap-1 text-slate-200 text-[11px] font-extrabold transition cursor-pointer"
        >
          <LayoutDashboard className="w-3.5 h-3.5 text-indigo-400" />
          <span>Dashboard</span>
        </button>

        <button
          onClick={onNavigateToCalendar}
          className="px-2.5 py-1.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-500 rounded-full flex items-center gap-1 text-white text-[11px] font-extrabold transition cursor-pointer shadow-xs"
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Calendar</span>
        </button>

        <button
          onClick={() => onSelectCell(rooms[0]?.number || 0, todayStr)}
          className="px-2.5 py-1.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-500 rounded-full flex items-center gap-1 text-white text-[11px] font-extrabold transition cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span>New Booking</span>
        </button>
      </div>
    </div>
  );
}
