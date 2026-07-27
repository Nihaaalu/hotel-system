import React, { useState, useEffect } from 'react';
import { Booking, Guest, Payment, Room } from '../types';
import { BookingService, PaymentService } from '../services/dbServices';
import { useHotelData } from '../context/HotelContext';
import { formatDateHuman } from '../utils/formatters';
import { X, Calendar, User, Check, ChevronDown, Receipt, Clock, Trash2, ArrowUpRight } from 'lucide-react';

interface BookingModalProps {
  bookingId?: string | null;           // If present, we view/edit this booking
  initialRoomNumber?: number | null;   // If present, default room for new booking
  initialCheckInDate?: string | null;  // If present, default check-in for new booking
  isAdminMode?: boolean;               // If true, shows Admin Delete option
  onClose: () => void;
  onSuccess: () => void;
}

export default function BookingModal({
  bookingId,
  initialRoomNumber,
  initialCheckInDate,
  isAdminMode = false,
  onClose,
  onSuccess,
}: BookingModalProps) {
  const { rooms: roomsList, bookings: contextBookings, payments: contextPayments, checkOverlappingBooking } = useHotelData();
  const [groupBookingsSameGroup, setGroupBookingsSameGroup] = useState<Booking[]>([]);
  const isEditing = !!bookingId;

  // Form State for Guest
  const [guestName, setGuestName] = useState('');

  const [savedGuestNames, setSavedGuestNames] = useState<string[]>(() => {
    const defaults = ['Ansari', 'Irshad'];
    try {
      const local = localStorage.getItem('pms_saved_guest_names');
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          return Array.from(new Set([...defaults, ...parsed]));
        }
      }
    } catch (e) {
      // ignore
    }
    return defaults;
  });
  const [isNameDropdownOpen, setIsNameDropdownOpen] = useState(false);

  // Form State for Booking
  const [selectedRoomNumbers, setSelectedRoomNumbers] = useState<number[]>(
    initialRoomNumber ? [initialRoomNumber] : []
  );
  const [roomNumber, setRoomNumber] = useState<number>(initialRoomNumber || 0);
  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [totalAmount, setTotalAmount] = useState<number | ''>('');
  const [advancePaid, setAdvancePaid] = useState<number | ''>('');
  const [remarks, setRemarks] = useState('');
  const [roomAvailability, setRoomAvailability] = useState<Record<number, boolean>>({});

  // Custom Date Picker calendar states
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return today.getMonth();
  });
  const [currentYear, setCurrentYear] = useState(() => {
    const today = new Date();
    return today.getFullYear();
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const toYYYYMMDD = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const handleDaySelect = (dayObj: Date) => {
    const clickedStr = toYYYYMMDD(dayObj);

    if (!checkInDate || (checkInDate && checkOutDate)) {
      setCheckInDate(clickedStr);
      setCheckOutDate('');
    } else {
      if (clickedStr <= checkInDate) {
        setCheckInDate(clickedStr);
      } else {
        setCheckOutDate(clickedStr);
        setShowDatePicker(false);
      }
    }
  };

  const handleDayHover = (dayObj: Date | null) => {
    if (!dayObj) {
      setHoveredDate(null);
      return;
    }
    setHoveredDate(toYYYYMMDD(dayObj));
  };

  const getRoomConfig = (roomNo: number): string => {
    const matched = roomsList.find((r) => r.number === roomNo);
    return matched ? matched.type : 'Standard';
  };

  // Loaded Booking State for View Mode
  const [loadedBooking, setLoadedBooking] = useState<Booking | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);

  // Extra Payment State inside View mode
  const [extraPaymentAmount, setExtraPaymentAmount] = useState<number>(0);
  const [extraPaymentMethod, setExtraPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'net_banking'>('cash');
  const [extraPaymentRemarks, setExtraPaymentRemarks] = useState('');
  const [showAddPaymentForm, setShowAddPaymentForm] = useState(false);

  // General Status
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize new booking form defaults
  useEffect(() => {
    if (!isEditing) {
      if (initialRoomNumber) {
        setSelectedRoomNumbers([initialRoomNumber]);
      } else if (roomsList.length > 0) {
        setSelectedRoomNumbers([roomsList[0].number]);
      } else {
        setSelectedRoomNumbers([]);
      }

      if (initialCheckInDate) {
        setCheckInDate(initialCheckInDate);
        const baseDate = new Date(initialCheckInDate);
        const nextDay = new Date(baseDate);
        nextDay.setDate(nextDay.getDate() + 1);
        setCheckOutDate(toYYYYMMDD(nextDay));

        setCurrentMonth(baseDate.getMonth());
        setCurrentYear(baseDate.getFullYear());
      } else {
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);
        setCheckInDate(toYYYYMMDD(today));
        setCheckOutDate(toYYYYMMDD(tomorrow));
      }

      setGuestName('');
      setRemarks('');
      setTotalAmount(0);
      setAdvancePaid(0);
    }
  }, [isEditing, initialRoomNumber, initialCheckInDate, roomsList]);

  // Load existing booking from cached context
  useEffect(() => {
    if (isEditing && bookingId) {
      const b = contextBookings.find(
        (item) => item.id === bookingId || item.bookingGroupId === bookingId
      );
      if (b) {
        setLoadedBooking(b);
        setGuestName(b.guestName || '');
        setRoomNumber(b.roomNumber);
        setSelectedRoomNumbers([b.roomNumber]);
        setCheckInDate(b.checkInDate);
        setCheckOutDate(b.checkOutDate);
        setTotalAmount(b.totalAmount);
        setAdvancePaid(b.advancePaid);
        setRemarks(b.remarks || '');

        // Match associated payments from context
        const pList = contextPayments.filter(
          (p) => p.bookingId === b.id || (b.bookingGroupId && p.bookingId === b.bookingGroupId)
        );
        setPayments(pList);

        if (b.bookingGroupId) {
          const sameGroup = contextBookings.filter(
            (booking) => booking.bookingGroupId === b.bookingGroupId
          );
          setGroupBookingsSameGroup(sameGroup);
        } else {
          setGroupBookingsSameGroup([]);
        }
      }
    }
  }, [isEditing, bookingId, contextBookings, contextPayments]);

  // Auto check room availability based on check-in and check-out dates using in-memory context check
  useEffect(() => {
    if (checkInDate && checkOutDate && roomsList.length > 0) {
      const start = new Date(checkInDate).getTime();
      const end = new Date(checkOutDate).getTime();
      if (!isNaN(start) && !isNaN(end) && end > start) {
        const availabilityMap: Record<number, boolean> = {};
        for (const room of roomsList) {
          const isOverlapping = checkOverlappingBooking(
            room.number,
            checkInDate,
            checkOutDate,
            bookingId || undefined
          );
          availabilityMap[room.number] = !isOverlapping;
        }
        setRoomAvailability(availabilityMap);
      } else {
        setRoomAvailability({});
      }
    } else {
      setRoomAvailability({});
    }
  }, [checkInDate, checkOutDate, bookingId, roomsList, checkOverlappingBooking]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validation
    if (!guestName.trim()) {
      setErrorMsg('Guest Name is required');
      return;
    }
    if (!checkInDate || !checkOutDate) {
      setErrorMsg('Check-In and Check-Out Dates are required');
      return;
    }
    if (new Date(checkOutDate) <= new Date(checkInDate)) {
      setErrorMsg('Check-Out Date must be strictly after Check-In Date');
      return;
    }
    if (selectedRoomNumbers.length === 0) {
      setErrorMsg('Please select at least one room');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Check overlap for all selected rooms first
      for (const num of selectedRoomNumbers) {
        const isOverlapping = checkOverlappingBooking(num, checkInDate, checkOutDate);
        if (isOverlapping) {
          setErrorMsg(`Room ${num} is already booked for the selected dates.`);
          setIsSubmitting(false);
          return;
        }
      }

      // Persist newly entered guest name in combobox defaults
      const trimmedName = guestName.trim();
      if (trimmedName && !savedGuestNames.includes(trimmedName)) {
        const updatedNames = [...savedGuestNames, trimmedName];
        setSavedGuestNames(updatedNames);
        try {
          localStorage.setItem('pms_saved_guest_names', JSON.stringify(updatedNames));
        } catch (e) {
          // ignore
        }
      }

      // Create booking via service (inserts into reservations & reservation_rooms)
      await BookingService.createMultiRoomBooking(
        { name: trimmedName },
        selectedRoomNumbers,
        {
          checkInDate,
          checkOutDate,
          totalAmount: Number(totalAmount || 0),
          advancePaid: Number(advancePaid || 0),
          remarks: remarks.trim(),
        }
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating booking');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckInGuest = async () => {
    if (!loadedBooking) return;
    setErrorMsg(null);

    try {
      setIsSubmitting(true);
      if (loadedBooking.bookingGroupId && groupBookingsSameGroup.length > 1) {
        const targetBookings = groupBookingsSameGroup.filter((b) => b.status === 'booked');
        const toUpdate = targetBookings.map((b) => b.id);
        if (!toUpdate.includes(loadedBooking.id) && loadedBooking.status === 'booked') {
          toUpdate.push(loadedBooking.id);
        }
        for (const bid of toUpdate) {
          await BookingService.checkInGuest(bid, loadedBooking.remarks);
        }
      } else {
        await BookingService.checkInGuest(loadedBooking.id, loadedBooking.remarks);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error checking in guest');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReleaseRoom = async (entireGroup: boolean = false) => {
    if (!loadedBooking) return;
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      if (entireGroup && loadedBooking.bookingGroupId) {
        await BookingService.cancelEntireReservation(loadedBooking.bookingGroupId);
      } else {
        await BookingService.releaseRoom(loadedBooking.id);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error releasing room');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBooking = async () => {
    if (!loadedBooking) return;
    const confirmDelete = window.confirm(
      `CRITICAL ACTION: Are you sure you want to PERMANENTLY DELETE booking for room ${loadedBooking.roomNumber} (${loadedBooking.guestName})?\nThis action cannot be undone.`
    );
    if (!confirmDelete) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await BookingService.deleteBooking(loadedBooking.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error permanently deleting booking');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddExtraPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loadedBooking) return;
    setErrorMsg(null);

    const maxAllowed = loadedBooking.totalAmount - loadedBooking.advancePaid;
    if (extraPaymentAmount <= 0) {
      setErrorMsg('Payment amount must be greater than zero');
      return;
    }

    try {
      setIsSubmitting(true);
      await PaymentService.addPayment(
        loadedBooking.id,
        extraPaymentAmount,
        extraPaymentMethod,
        extraPaymentRemarks || 'Extra payment logged dynamically'
      );

      setExtraPaymentAmount(0);
      setExtraPaymentRemarks('');
      setShowAddPaymentForm(false);
      
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to log payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-gray-900/40 backdrop-blur-sm transition duration-200">
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[94vh]"
        id="booking_detail_modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-5 border-b border-gray-100 bg-gray-50/50 shrink-0">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900">
              {isEditing ? `Room Reservation - Room ${loadedBooking?.roomNumber}` : 'New Booking'}
            </h3>
            {isEditing && (
              <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1 uppercase font-mono tracking-wider">
                Booking ID: #{loadedBooking?.id}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition text-gray-400 hover:text-gray-600 min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-3.5 sm:p-6 overflow-y-auto flex-1 text-sm text-gray-700 space-y-3 sm:space-y-6">
          {errorMsg && (
            <div className="p-3.5 bg-red-50 text-red-600 text-xs rounded-xl border border-red-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
              {errorMsg}
            </div>
          )}

          {isEditing && loadedBooking ? (
            /* VIEW/EDIT DETAIL MODE */
            <div className="space-y-6">
              {/* Status Header Badge */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 border border-gray-100 bg-gray-50/50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="px-4 py-2 bg-white border border-gray-100 rounded-xl">
                    <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide block">Room</span>
                    <span className="text-lg font-extrabold text-indigo-700">{loadedBooking.roomNumber}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide block">Current Booking Status</span>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg mt-1 ${
                      loadedBooking.status === 'booked'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : loadedBooking.status === 'checked-in'
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : loadedBooking.status === 'cancelled'
                        ? 'bg-red-55 border border-red-200 text-red-650 font-bold'
                        : 'bg-gray-50 text-gray-650 border border-gray-200'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        loadedBooking.status === 'booked'
                          ? 'bg-blue-500'
                          : loadedBooking.status === 'checked-in'
                          ? 'bg-red-500'
                          : loadedBooking.status === 'cancelled'
                          ? 'bg-red-600'
                          : 'bg-gray-500'
                      }`}></span>
                      {loadedBooking.status === 'booked' ? 'CONFIRMED' : loadedBooking.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Booking Actions Section */}
              <div className="p-5 border border-gray-150 rounded-2xl bg-white space-y-3.5 shadow-xs" id="booking_actions_section">
                <h4 className="font-extrabold text-xs text-gray-400 font-mono uppercase tracking-wider">
                  Booking Actions
                </h4>

                <div className="flex flex-wrap gap-2.5">
                  {loadedBooking.status === 'booked' && (
                    <button
                      type="button"
                      onClick={() => handleCheckInGuest()}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:cursor-not-allowed disabled:shadow-none"
                      id="btn_checkin_guest"
                    >
                      <Check className="w-4 h-4" />
                      Check-In Guest
                    </button>
                  )}

                  {loadedBooking.status === 'checked-in' && (
                    <button
                      type="button"
                      onClick={() => handleReleaseRoom(false)}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:cursor-not-allowed disabled:shadow-none"
                      id="btn_checkout_guest"
                    >
                      <Receipt className="w-4 h-4" />
                      Checkout & Close Room
                    </button>
                  )}

                  {/* Release Options */}
                  {(loadedBooking.status === 'booked' || loadedBooking.status === 'checked-in') && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleReleaseRoom(false)}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-red-200 text-red-650 hover:bg-red-50 font-bold text-xs rounded-xl shadow-xs transition cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:cursor-not-allowed disabled:shadow-none"
                        id="btn_release_this_room"
                      >
                        <X className="w-4 h-4" />
                        Release This Room
                      </button>

                      {groupBookingsSameGroup.length > 1 && loadedBooking.bookingGroupId && (
                        <button
                          type="button"
                          onClick={() => handleReleaseRoom(true)}
                          disabled={isSubmitting}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-50 border border-red-250 text-red-700 hover:bg-red-100 font-bold text-xs rounded-xl shadow-xs transition cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:cursor-not-allowed disabled:shadow-none"
                          id="btn_release_all_rooms"
                        >
                          <X className="w-4 h-4" />
                          Release All Rooms
                        </button>
                      )}
                    </>
                  )}

                  {loadedBooking.status === 'checked-out' && (
                    <p className="text-xs text-gray-500 font-medium italic">
                      This guest has successfully checked out. No further actions are available.
                    </p>
                  )}

                  {loadedBooking.status === 'cancelled' && (
                    <p className="text-xs text-rose-600 font-bold italic">
                      This booking has been cancelled and the room has been released.
                    </p>
                  )}

                  {isAdminMode && (
                    <button
                      type="button"
                      onClick={handleDeleteBooking}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 font-bold text-xs rounded-xl shadow-xs transition cursor-pointer md:ml-auto disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:cursor-not-allowed disabled:shadow-none"
                      title="Permanently remove from database (Admin Only)"
                      id="btn_delete_permanently"
                    >
                      Delete Permanently
                    </button>
                  )}
                </div>
              </div>

              {/* Guest & Stay Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Guest Details Cards */}
                <div className="p-4 border border-gray-100 rounded-2xl flex flex-col gap-3">
                  <h4 className="font-semibold text-gray-900 border-b border-gray-50 pb-2 flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    Booking Details
                  </h4>
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase block mb-1">Booking Name</span>
                      <span className="text-sm font-semibold text-gray-800">{loadedBooking.guestName}</span>
                    </div>
                    {loadedBooking.guestPhone && (
                      <div>
                        <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase block mb-1">Mobile Number</span>
                        <span className="text-sm font-semibold text-gray-800">{loadedBooking.guestPhone}</span>
                      </div>
                    )}
                    {loadedBooking.remarks && (
                      <div>
                        <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase block mb-1">Remarks</span>
                        <p className="text-xs text-gray-500 italic mt-0.5">"{loadedBooking.remarks}"</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stay details */}
                <div className="p-4 border border-gray-100 rounded-2xl flex flex-col gap-3">
                  <h4 className="font-semibold text-gray-900 border-b border-gray-50 pb-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    Stay Dimensions
                  </h4>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div>
                        <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase block mb-1">Check-In</span>
                        <span className="text-sm font-semibold text-gray-800">{loadedBooking.checkInDate}</span>
                      </div>
                      <div>
                        <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase block mb-1">Check-Out</span>
                        <span className="text-sm font-semibold text-gray-800">{loadedBooking.checkOutDate}</span>
                      </div>
                    </div>

                    <div className="border-t border-gray-50 pt-2 shrink-0">
                      <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase block mb-1">Financial State Ledger</span>
                      <div className="grid grid-cols-3 gap-2 text-center mt-2">
                        <div className="p-2 bg-gray-50 rounded-xl">
                          <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider block">Total</span>
                          <span className="text-xs font-extrabold text-gray-800">₹{loadedBooking.totalAmount.toLocaleString()}</span>
                        </div>
                        <div className="p-2 bg-green-50/50 rounded-xl">
                          <span className="text-[10px] text-green-700 font-semibold uppercase tracking-wider block">Paid</span>
                          <span className="text-xs font-extrabold text-green-700">₹{loadedBooking.advancePaid.toLocaleString()}</span>
                        </div>
                        <div className={`p-2 rounded-xl ${loadedBooking.totalAmount - loadedBooking.advancePaid > 0 ? 'bg-red-50/50' : 'bg-gray-50'}`}>
                          <span className="text-[10px] text-red-700 font-semibold uppercase tracking-wider block">Balance</span>
                          <span className="text-xs font-extrabold text-red-700">₹{(loadedBooking.totalAmount - loadedBooking.advancePaid).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payments log & entry */}
              <div className="p-4 border border-gray-100 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-gray-55 pb-2">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-gray-400" />
                    Payment Ledger Receipts ({payments.length})
                  </h4>
                  {loadedBooking.status !== 'checked-out' && (loadedBooking.totalAmount - loadedBooking.advancePaid > 0) && (
                    <button
                      type="button"
                      onClick={() => setShowAddPaymentForm(!showAddPaymentForm)}
                      className="px-3 py-1 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition"
                    >
                      {showAddPaymentForm ? 'Cancel Payment Form' : 'Log Extra Payment'}
                    </button>
                  )}
                </div>

                {/* Additional Payment Form */}
                {showAddPaymentForm && (
                  <form onSubmit={handleAddExtraPayment} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-semibold tracking-wide text-gray-500 uppercase block mb-1">Payment Amount (₹)</label>
                        <input
                          type="number"
                          required
                          value={extraPaymentAmount || ''}
                          onChange={(e) => setExtraPaymentAmount(Number(e.target.value))}
                          placeholder="Amount in Rupees"
                          className="w-full rounded-lg border border-gray-200 bg-white p-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold tracking-wide text-gray-500 uppercase block mb-1">Method</label>
                        <select
                          value={extraPaymentMethod}
                          onChange={(e) => setExtraPaymentMethod(e.target.value as any)}
                          className="w-full rounded-lg border border-gray-200 bg-white p-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Credit/Debit Card</option>
                          <option value="upi">UPI/QR Code</option>
                          <option value="net_banking">Net Banking</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:bg-gray-100 disabled:text-gray-500 disabled:border disabled:border-gray-300 disabled:opacity-100 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
                        >
                          Add Receipt
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Payments Table */}
                {payments.length === 0 ? (
                  <p className="text-2xs text-gray-400 font-medium italic text-center py-2">No individual receipts have been loaded for this card yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-center border divide-y divide-gray-100 rounded-lg text-2xs overflow-hidden font-mono text-gray-600">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Method</th>
                          <th className="py-2.5 px-3">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white font-medium">
                        {payments.map((p) => (
                          <tr key={p.id}>
                            <td className="py-2 px-3 text-gray-400">{new Date(p.paymentDate).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</td>
                            <td className="py-2 px-3 uppercase text-indigo-700">{p.paymentMethod.replace('_', ' ')}</td>
                            <td className="py-2 px-3 text-gray-900 font-bold">₹{p.amount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <form id="new_booking_form" onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
              {/* Row 1: Stay Dates */}
              <div className="space-y-1.5 sm:space-y-2 pb-2.5 sm:pb-3 border-b border-gray-100 relative">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] sm:text-xs font-bold tracking-wide text-gray-500 uppercase block">1. Stay Dates</label>
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer py-0.5"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {showDatePicker ? 'Close Calendar' : 'Calendar View'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 block mb-0.5 sm:mb-1">Check-In Date</label>
                    <input
                      type="date"
                      required
                      value={checkInDate}
                      onChange={(e) => {
                        const newIn = e.target.value;
                        setCheckInDate(newIn);
                        if (checkOutDate && newIn >= checkOutDate) {
                          const nextDay = new Date(newIn);
                          nextDay.setDate(nextDay.getDate() + 1);
                          setCheckOutDate(toYYYYMMDD(nextDay));
                        }
                      }}
                      className="w-full rounded-xl border border-gray-200 bg-white p-2 sm:p-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-xs min-h-[44px]"
                    />
                    {checkInDate && (
                      <span className="text-[10px] sm:text-[11px] text-indigo-600 font-extrabold block mt-0.5">
                        {formatDateHuman(checkInDate)}
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] sm:text-[11px] font-semibold text-gray-400 block mb-0.5 sm:mb-1">Check-Out Date</label>
                    <input
                      type="date"
                      required
                      value={checkOutDate}
                      min={checkInDate}
                      onChange={(e) => setCheckOutDate(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white p-2 sm:p-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-xs min-h-[44px]"
                    />
                    {checkOutDate && (
                      <span className="text-[10px] sm:text-[11px] text-indigo-600 font-extrabold block mt-0.5">
                        {formatDateHuman(checkOutDate)}
                      </span>
                    )}
                  </div>
                </div>

                {showDatePicker && (
                  <div className="fixed sm:absolute inset-x-3 sm:inset-x-0 top-16 sm:top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl p-3 sm:p-4 z-50 animate-fade-in max-w-[340px] mx-auto" id="stay_dates_calendar_popover">
                    <div className="flex justify-between items-center pb-2 mb-2 border-b border-gray-100 select-none">
                      <span className="text-xs font-bold tracking-wide text-gray-700 uppercase block">Select Stay Range</span>
                      <button
                        type="button"
                        onClick={() => setShowDatePicker(false)}
                        className="text-[12px] font-black text-gray-400 hover:text-gray-700 cursor-pointer h-6 w-6 flex items-center justify-center p-0 rounded-full hover:bg-gray-100 transition-colors"
                        title="Close"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Month Picker Navigation */}
                    <div className="flex items-center justify-between mb-2 select-none gap-1">
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-650 font-black cursor-pointer text-xs min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        ‹
                      </button>
                      <div className="flex items-center gap-1">
                        <select
                          value={currentMonth}
                          onChange={(e) => setCurrentMonth(parseInt(e.target.value, 10))}
                          className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          {monthsList.map((m, idx) => (
                            <option key={m} value={idx}>{m.substring(0, 3)}</option>
                          ))}
                        </select>
                        <select
                          value={currentYear}
                          onChange={(e) => setCurrentYear(parseInt(e.target.value, 10))}
                          className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          {[2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={handleNextMonth}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-650 font-black cursor-pointer text-xs min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        ›
                      </button>
                    </div>

                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold text-gray-400 uppercase font-mono mb-1 select-none">
                      <div>Su</div>
                      <div>Mo</div>
                      <div>Tu</div>
                      <div>We</div>
                      <div>Th</div>
                      <div>Fr</div>
                      <div>Sa</div>
                    </div>

                    {/* Day cells grid */}
                    <div className="grid grid-cols-7 gap-1">
                      {(() => {
                        const daysInMonthVal = new Date(currentYear, currentMonth + 1, 0).getDate();
                        const firstDayIndexVal = new Date(currentYear, currentMonth, 1).getDay();
                        const todayStr = toYYYYMMDD(new Date());

                        const cells = [];
                        for (let i = 0; i < firstDayIndexVal; i++) {
                          cells.push(<div key={`empty-${i}`} className="aspect-square"></div>);
                        }

                        for (let day = 1; day <= daysInMonthVal; day++) {
                          const dateObj = new Date(currentYear, currentMonth, day);
                          const dateStr = toYYYYMMDD(dateObj);

                          const isCheckIn = dateStr === checkInDate;
                          const isCheckOut = dateStr === checkOutDate;
                          const isToday = dateStr === todayStr;
                          
                          let isInRange = false;
                          if (checkInDate && checkOutDate) {
                            isInRange = dateStr > checkInDate && dateStr < checkOutDate;
                          } else if (checkInDate && hoveredDate) {
                            isInRange = dateStr > checkInDate && dateStr < hoveredDate;
                          }

                          let cellStyle = "text-gray-800 hover:bg-gray-100 rounded-lg";
                          if (isCheckIn || isCheckOut) {
                            cellStyle = "bg-indigo-600 text-white font-extrabold rounded-lg shadow-2xs";
                          } else if (isInRange) {
                            cellStyle = "bg-indigo-50 text-indigo-900 font-bold rounded-none border-y border-indigo-100";
                          } else if (isToday) {
                            cellStyle = "bg-gray-100 border border-gray-300 text-gray-900 font-extrabold rounded-full shadow-3xs";
                          }

                          cells.push(
                            <button
                              key={`day-${day}`}
                              type="button"
                              onClick={() => handleDaySelect(dateObj)}
                              onMouseEnter={() => handleDayHover(dateObj)}
                              onMouseLeave={() => handleDayHover(null)}
                              className={`aspect-square min-h-[36px] text-xs font-semibold flex items-center justify-center transition-all duration-100 cursor-pointer ${cellStyle}`}
                            >
                              {day}
                            </button>
                          );
                        }
                        return cells;
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Row 2: Selected Rooms */}
              <div className="space-y-1.5 sm:space-y-2 pb-2.5 sm:pb-3 border-b border-gray-100">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] sm:text-xs font-bold tracking-wide text-gray-500 uppercase block">2. Room Selection</span>
                  <div className="text-[10px] sm:text-xs font-bold tracking-wide text-gray-500 uppercase block">
                    Selected: <span className="text-indigo-650 font-black">{selectedRoomNumbers.length === 0 ? 'None' : selectedRoomNumbers.join(', ')}</span>
                  </div>
                </div>

                {!checkInDate || !checkOutDate ? (
                  <div className="text-center py-3 sm:py-4 bg-slate-50 border border-dashed border-gray-200 rounded-xl">
                    <p className="text-xs font-bold text-gray-500">Please select check-in and check-out dates above</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 sm:gap-2" id="available_rooms_grid">
                    {roomsList.map((room) => {
                      const num = room.number;
                      const isSelected = selectedRoomNumbers.includes(num);
                      const isAvailable = roomAvailability[num] !== false;

                      return (
                        <button
                          key={num}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedRoomNumbers(selectedRoomNumbers.filter(n => n !== num));
                            } else {
                              setSelectedRoomNumbers([...selectedRoomNumbers, num]);
                            }
                          }}
                          className={`min-h-[44px] p-2 sm:p-2.5 rounded-xl border font-bold text-xs text-center transition-all duration-150 cursor-pointer flex items-center justify-center active:scale-95 select-none ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-700 text-white shadow-xs font-extrabold ring-2 ring-indigo-400'
                              : isAvailable
                              ? 'bg-white hover:bg-gray-100 border-gray-200 text-gray-800'
                              : 'bg-gray-100 border-gray-200 text-gray-400 line-through cursor-not-allowed opacity-50'
                          }`}
                          title={isAvailable ? `Room ${num} (${getRoomConfig(num)})` : `Room ${num} is already booked`}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Row 3: Booking Name (Searchable Combobox) */}
              <div className="relative">
                <label className="text-[11px] sm:text-xs font-bold tracking-wide text-gray-500 uppercase block mb-1">
                  3. Guest Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    autoFocus
                    value={guestName}
                    onFocus={() => setIsNameDropdownOpen(true)}
                    onChange={(e) => {
                      setGuestName(e.target.value);
                      setIsNameDropdownOpen(true);
                    }}
                    placeholder="Search or enter guest name (e.g. Ansari, Irshad)"
                    className="w-full rounded-xl border border-gray-200 bg-white p-2.5 sm:p-3 pr-9 text-xs sm:text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-xs min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => setIsNameDropdownOpen(!isNameDropdownOpen)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${isNameDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {isNameDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-20" 
                      onClick={() => setIsNameDropdownOpen(false)} 
                    />
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto py-1 animate-fade-in">
                      {savedGuestNames
                        .filter(name => name.toLowerCase().includes(guestName.toLowerCase()))
                        .map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => {
                              setGuestName(name);
                              setIsNameDropdownOpen(false);
                            }}
                            className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-gray-800 hover:bg-indigo-50 hover:text-indigo-700 transition cursor-pointer flex items-center justify-between min-h-[40px]"
                          >
                            <span>{name}</span>
                            {guestName === name && <Check className="w-4 h-4 text-indigo-600" />}
                          </button>
                        ))}
                      {guestName.trim() && !savedGuestNames.some(n => n.toLowerCase() === guestName.trim().toLowerCase()) && (
                        <div className="px-3.5 py-2 text-xs font-medium text-indigo-600 bg-indigo-50/50 border-t border-gray-100 flex items-center justify-between">
                          <span>Create new entry: <strong>"{guestName.trim()}"</strong></span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Row 4: Financial Inputs */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <label className="text-[10px] sm:text-xs font-bold tracking-wide text-gray-500 uppercase block mb-0.5 sm:mb-1">
                    Total Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={totalAmount === '' ? '' : totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0"
                    className="w-full rounded-xl border border-gray-200 bg-white p-2.5 sm:p-3 text-xs sm:text-sm font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-xs min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="text-[10px] sm:text-xs font-bold tracking-wide text-gray-500 uppercase block mb-0.5 sm:mb-1">
                    Advance Paid (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={advancePaid === '' ? '' : advancePaid}
                    onChange={(e) => setAdvancePaid(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0"
                    className="w-full rounded-xl border border-gray-200 bg-white p-2.5 sm:p-3 text-xs sm:text-sm font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-xs min-h-[44px]"
                  />
                </div>
              </div>

              {/* Row 5: Remarks */}
              <div>
                <label className="text-[10px] sm:text-xs font-bold tracking-wide text-gray-500 uppercase block mb-0.5 sm:mb-1">
                  Remarks <span className="text-gray-400 font-normal lowercase">(optional)</span>
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Early check-in requested, extra bed"
                  className="w-full rounded-xl border border-gray-200 bg-white p-2.5 sm:p-3 text-xs sm:text-sm font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-xs"
                />
              </div>

              {/* Action Buttons: Fixed/Sticky Save Booking button on Mobile */}
              <div className="flex gap-2.5 justify-end border-t border-gray-100 pt-3 sm:pt-4 mt-3 sm:mt-4 sticky bottom-0 bg-white z-20 pb-1 sm:pb-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-4 sm:px-5 py-3 sm:py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer min-h-[48px] sm:min-h-[44px] flex items-center justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-none px-6 sm:px-7 py-3 sm:py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl shadow-md transition cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:cursor-not-allowed disabled:shadow-none min-h-[48px] sm:min-h-[44px] flex items-center justify-center"
                >
                  {isSubmitting ? 'Saving...' : '4. Save Booking'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
