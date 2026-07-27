import React, { useState, useEffect } from 'react';
import { Booking, Payment, DashboardStats, Room } from '../types';
import { RoomService, BookingService, PaymentService } from '../services/dbServices';
const { FIXED_ROOMS } = RoomService;
import {
  BedSingle,
  DoorOpen,
  CalendarCheck,
  LogIn,
  LogOut,
  UserCheck,
  TrendingUp,
  AlertTriangle,
  Receipt,
  Users,
  BellRing,
  Plus,
  Search,
  Calendar,
  CreditCard,
  User
} from 'lucide-react';

interface DashboardProps {
  onSelectBooking: (id: string) => void;
  onSelectCell: (roomNumber: number, date: string) => void;
  onNavigateToCalendar: () => void;
  onNavigateToGuests: () => void;
  refreshTrigger: number;
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
  onNavigateToGuests,
  refreshTrigger,
}: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats>({
    availableRoomsCount: 13,
    occupiedRoomsCount: 0,
    futureBookingsCount: 0,
    todayCheckinsCount: 0,
    todayCheckoutsCount: 0,
    currentStayingCount: 0,
    todayCollection: 0,
    totalPendingBalance: 0,
  });

  const [bookingsList, setBookingsList] = useState<Booking[]>([]);
  const [roomStatuses, setRoomStatuses] = useState<RoomStatusMapping[]>([]);
  const [showPaymentSelection, setShowPaymentSelection] = useState(false);

  useEffect(() => {
    async function loadDashboardStats() {
      const bookings = await BookingService.getBookings();
      const payments = await PaymentService.getAllPayments();
      const todayStr = new Date().toISOString().split('T')[0];

      setBookingsList(bookings);

      // Calculations
      const future = bookings.filter((b) => b.status === 'booked' && b.checkInDate > todayStr);
      const checkinsToday = bookings.filter((b) => b.checkInDate === todayStr && (b.status === 'booked' || b.status === 'checked-in'));
      const checkoutsToday = bookings.filter((b) => b.checkOutDate === todayStr && (b.status === 'checked-in' || b.status === 'checked-out'));

      const staying = bookings.filter((b) => b.status === 'checked-in');

      const todayColl = payments
        .filter((p) => p.paymentDate.split('T')[0] === todayStr)
        .reduce((sum, p) => sum + Number(p.amount), 0);

      const pendingBalance = bookings
        .filter((b) => b.status !== 'checked-out' && b.status !== 'cancelled')
        .reduce((sum, b) => sum + (Number(b.totalAmount) - Number(b.advancePaid)), 0);

      // Build room statuses
      const statuses: RoomStatusMapping[] = FIXED_ROOMS.map((room) => {
        const activeBookings = bookings.filter(
          (b) => b.roomNumber === room.number && b.status !== 'checked-out' && b.status !== 'cancelled'
        );

        // 1. Checked-in booking
        const checkedInBooking = activeBookings.find(
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

        // 3. Arriving today reservation
        const bookedBooking = activeBookings.find(
          (b) => b.status === 'booked' && b.checkInDate === todayStr
        );

        if (bookedBooking) {
          return {
            room,
            status: 'CHECKIN_TODAY',
            booking: bookedBooking,
            colorClass: 'border-orange-500 bg-orange-50/10 hover:bg-orange-50/20 text-orange-950',
            badgeClass: 'bg-orange-100 text-orange-850 border-orange-200',
          };
        }

        // 4. Otherwise available
        return {
          room,
          status: 'AVAILABLE',
          booking: null,
          colorClass: 'border-green-500 bg-green-50/5 hover:bg-green-50/15 text-green-900',
          badgeClass: 'bg-green-100 text-green-800 border-green-200',
        };
      });

      const availableCount = statuses.filter((s) => s.status === 'AVAILABLE').length;
      const occupiedCount = statuses.filter((s) => s.status === 'OCCUPIED' || s.status === 'CHECKOUT_TODAY').length;

      setStats({
        availableRoomsCount: availableCount,
        occupiedRoomsCount: occupiedCount,
        futureBookingsCount: future.length,
        todayCheckinsCount: checkinsToday.length,
        todayCheckoutsCount: checkoutsToday.length,
        currentStayingCount: staying.length,
        todayCollection: todayColl,
        totalPendingBalance: pendingBalance,
      });

      setRoomStatuses(statuses);
    }

    loadDashboardStats();
  }, [refreshTrigger]);

  const todayStr = new Date().toISOString().split('T')[0];

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[2], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        return `${day} ${months[monthIndex]}`;
      }
    }
    return dateStr;
  };

  const getRoomConfig = (roomNumber: number): string => {
    switch (roomNumber) {
      case 101: return '4 Sharing';
      case 102: return '4 Sharing';
      case 103: return '6 Bed';
      case 104: return '6 Bed';
      case 105: return '2 Bed King';
      case 106: return '2 Bed King';
      case 107: return '3 Bed King';
      case 108: return '3 Bed King';
      case 201: return '2 Bed King';
      case 202: return '2 Bed King';
      case 203: return '3 Bed King';
      case 204: return '3 Bed King';
      case 205: return '4 Bed King';
      default: return '2 Bed King';
    }
  };

  // Filters for Operations List
  const checkinsToday = bookingsList.filter((b) => b.checkInDate === todayStr && b.status === 'booked');
  const checkoutsToday = bookingsList.filter((b) => b.checkOutDate === todayStr && b.status === 'checked-in');
  const pendingPayments = bookingsList.filter(
    (b) => b.status !== 'checked-out' && b.status !== 'cancelled' && b.totalAmount - b.advancePaid > 0
  );

  // Filter staying guests (currently checked-in)
  const currentlyStaying = bookingsList.filter((b) => b.status === 'checked-in');

  const handleRoomClick = (mapping: RoomStatusMapping) => {
    if (mapping.booking) {
      onSelectBooking(mapping.booking.id);
    } else {
      // Available room: open card pre-filled with this room & today's date so receptionist can book immediately
      onSelectCell(mapping.room.number, todayStr);
    }
  };

  return (
    <div className="space-y-6 pb-28" id="pms_dashboard_panel">
      
      {/* SECTION 1: TOP SUMMARY BAR (Max height 100px on desktop, compact cards) */}
      <section 
        className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 shrink-0"
        style={{ minHeight: '60px' }}
        id="dashboard_top_summary"
      >
        {/* Available Rooms */}
        <div className="py-2.5 px-4 bg-white border border-gray-150 rounded-xl flex items-center gap-3 shadow-2xs h-[72px] transition hover:border-green-300">
          <div className="p-2 bg-green-50 text-green-600 rounded-lg shrink-0">
            <BedSingle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Available</span>
            <span className="text-lg font-black text-gray-950 font-mono leading-none">{stats.availableRoomsCount} / 13</span>
          </div>
        </div>

        {/* Occupied Rooms */}
        <div className="py-2.5 px-4 bg-white border border-gray-150 rounded-xl flex items-center gap-3 shadow-2xs h-[72px] transition hover:border-blue-300">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
            <DoorOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Occupied</span>
            <span className="text-lg font-black text-gray-950 font-mono leading-none">{stats.occupiedRoomsCount} / 13</span>
          </div>
        </div>

        {/* Today's Checkins */}
        <div className="py-2.5 px-4 bg-white border border-gray-150 rounded-xl flex items-center gap-3 shadow-2xs h-[72px] transition hover:border-orange-300">
          <div className="p-2 bg-orange-50 text-orange-600 rounded-lg shrink-0">
            <LogIn className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Check-ins Today</span>
            <span className="text-lg font-black text-gray-950 font-mono leading-none">{stats.todayCheckinsCount}</span>
          </div>
        </div>

        {/* Today's Checkouts */}
        <div className="py-2.5 px-4 bg-white border border-gray-150 rounded-xl flex items-center gap-3 shadow-2xs h-[72px] transition hover:border-red-300">
          <div className="p-2 bg-red-50 text-red-600 rounded-lg shrink-0">
            <LogOut className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Check-outs Today</span>
            <span className="text-lg font-black text-gray-950 font-mono leading-none">{stats.todayCheckoutsCount}</span>
          </div>
        </div>

        {/* Pending Balance */}
        <div className="py-2.5 px-4 bg-white border border-gray-150 rounded-xl flex items-center gap-3 shadow-2xs h-[72px] col-span-2 lg:col-span-1 transition hover:border-red-300">
          <div className="p-2 bg-red-50 text-red-650 rounded-lg shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Pending Balance</span>
            <span className="text-base font-black text-red-700 font-mono leading-none truncate block">₹{stats.totalPendingBalance.toLocaleString()}</span>
          </div>
        </div>
      </section>      {/* SECTION 2: REAL-TIME ROOM STATUS (DOMINATES THE DASHBOARD) */}
      <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs flex-1" id="pms_realtime_status">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4 mb-4 select-none">
          <div>
            <h2 className="text-base font-black text-gray-950 tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
              Real-Time Room Board
            </h2>
            <p className="text-xs text-gray-400">Manage bookings, check-in, check-out, and billing directly from the room status cards.</p>
          </div>
        </div>        {/* GRID OF 13 ROOMS - Wider, cleaner, 4 cards per row */}
        <div 
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" 
          id="realtime_room_grid"
        >
          {roomStatuses.map((mapping) => {
            const hasBooking = !!mapping.booking;
            const balanceDue = hasBooking ? mapping.booking!.totalAmount - mapping.booking!.advancePaid : 0;

            if (mapping.status === 'AVAILABLE') {
              return (
                <div
                  key={mapping.room.number}
                  onClick={() => handleRoomClick(mapping)}
                  className="h-[144px] p-4 flex flex-col justify-between rounded-xl border-2 border-green-500 bg-white hover:border-green-600 hover:bg-green-50/5 cursor-pointer shadow-xs transition-all duration-200 select-none animate-[fadeIn_0.3s_ease-out]"
                  id={`room_card_${mapping.room.number}`}
                >
                  <div className="leading-none">
                    <span className="text-3xl font-black tracking-tight text-gray-950 font-sans block">Room {mapping.room.number}</span>
                    <span className="text-[11px] font-extrabold text-gray-650 mt-1.5 block uppercase tracking-tight whitespace-nowrap truncate">{getRoomConfig(mapping.room.number)}</span>
                  </div>
                </div>
              );
            }

            const borderClass = 
              mapping.status === 'CHECKIN_TODAY' ? 'border-orange-500 hover:border-orange-600' :
              mapping.status === 'CHECKOUT_TODAY' ? 'border-red-500 hover:border-red-655' :
              'border-blue-500 hover:border-blue-600';

            const outText = mapping.status === 'CHECKOUT_TODAY' ? 'Today' : formatDateShort(mapping.booking!.checkOutDate);

            return (
              <div
                key={mapping.room.number}
                onClick={() => handleRoomClick(mapping)}
                className={`h-[144px] p-4 flex flex-col justify-between rounded-xl border-2 ${borderClass} bg-white hover:bg-slate-50/10 cursor-pointer shadow-xs transition-all duration-150 select-none animate-[fadeIn_0.3s_ease-out]`}
                id={`room_card_${mapping.room.number}`}
              >
                <div className="leading-none">
                  <span className="text-3xl font-black tracking-tight text-gray-950 font-sans block">Room {mapping.room.number}</span>
                  <span className="text-[11px] font-extrabold text-gray-650 mt-1.5 block uppercase tracking-tight whitespace-nowrap truncate">{getRoomConfig(mapping.room.number)}</span>
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-black text-gray-950 truncate block leading-none">{mapping.booking!.guestName}</span>
                </div>
                <div className="text-xs space-y-0.5 leading-none">
                  <div className="text-[11px] text-gray-700 font-bold">
                    Balance: <span className="font-black text-indigo-950">₹{balanceDue.toLocaleString()}</span>
                  </div>
                  <div className="text-[11px] text-gray-700 font-bold">
                    Out: <span className="font-black text-gray-950">{outText}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FLOATING COMPACT QUICK ACTIONS CONTAINER */}
      <div 
        className="fixed bottom-6 right-6 z-40 bg-slate-900 border border-slate-950 text-white rounded-2xl shadow-2xl p-3 flex flex-row items-center gap-2.5 animate-fadeIn"
        id="floating_quick_actions"
      >
        {/* New Booking */}
        <button
          onClick={() => onSelectCell(101, todayStr)}
          className="p-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center gap-1.5 transition text-white outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer text-xs font-extrabold tracking-tight"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Booking</span>
        </button>

        {/* View Calendar */}
        <button
          onClick={onNavigateToCalendar}
          className="p-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-1.5 transition text-white outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer text-xs font-extrabold tracking-tight"
        >
          <Calendar className="w-4 h-4" />
          <span>Calendar</span>
        </button>

        {/* Search Guest */}
        <button
          onClick={onNavigateToGuests}
          className="p-2 py-1.5 bg-sky-600 hover:bg-sky-500 rounded-lg flex items-center gap-1.5 transition text-white outline-none focus:ring-2 focus:ring-sky-450 cursor-pointer text-xs font-extrabold tracking-tight"
        >
          <Search className="w-4 h-4" />
          <span>Guests</span>
        </button>

        {/* Add Payment */}
        <div className="relative">
          <button
            onClick={() => setShowPaymentSelection(!showPaymentSelection)}
            className="p-2 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg flex items-center gap-1.5 transition text-white outline-none focus:ring-2 focus:ring-slate-400 cursor-pointer text-xs font-extrabold tracking-tight"
          >
            <CreditCard className="w-4 h-4" />
            <span>Add Payment</span>
          </button>

          {/* Collapsible Popover to pick staying guest to add payment to */}
          {showPaymentSelection && (
            <div className="absolute right-0 bottom-full mb-3 w-56 bg-white border border-gray-200 text-gray-900 rounded-xl shadow-xl p-2.5 z-50 space-y-1.5 animate-fadeIn">
              <div className="text-3xs font-extrabold text-gray-400 uppercase font-mono tracking-widest px-1.5 py-0.5 border-b border-gray-50">
                Stayers with Balance
              </div>
              {currentlyStaying.filter(b => b.totalAmount - b.advancePaid > 0).length === 0 ? (
                <p className="text-[10px] text-gray-400 italic px-2 py-1 select-none">No active stayers have pending balance</p>
              ) : (
                <div className="max-h-[160px] overflow-y-auto space-y-1">
                  {currentlyStaying
                    .filter(b => b.totalAmount - b.advancePaid > 0)
                    .map((b) => (
                      <button
                        key={b.id}
                        onClick={() => {
                          onSelectBooking(b.id);
                          setShowPaymentSelection(false);
                        }}
                        className="w-full text-left p-1.5 rounded-lg hover:bg-gray-50 flex items-center justify-between text-2xs transition"
                      >
                        <span className="font-bold text-gray-800 truncate max-w-[100px]">{b.guestName}</span>
                        <span className="font-mono text-indigo-700 bg-indigo-50 font-extrabold px-1.5 py-0.5 rounded-sm">RM {b.roomNumber}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
