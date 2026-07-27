import React, { useState, useEffect } from 'react';
import { Booking, Guest, Payment } from '../types';
import { RoomService, BookingService, PaymentService } from '../services/dbServices';
const { FIXED_ROOMS } = RoomService;
import { X, Calendar, User, Phone, MapPin, FileCheck, DollarSign, Tag, Check, CreditCard, Receipt, Clock } from 'lucide-react';

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
  const [groupBookingsSameGroup, setGroupBookingsSameGroup] = useState<Booking[]>([]);
  const isEditing = !!bookingId;

  // Form State for Guest
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestAddress, setGuestAddress] = useState('');
  const [guestIdProof, setGuestIdProof] = useState('');

  // Form State for Booking
  const [selectedRoomNumbers, setSelectedRoomNumbers] = useState<number[]>([]);
  const [roomNumber, setRoomNumber] = useState<number>(101);
  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [totalAmount, setTotalAmount] = useState<number | ''>('');
  const [advancePaid, setAdvancePaid] = useState<number | ''>('');
  const [remarks, setRemarks] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [isRoomDropdownOpen, setIsRoomDropdownOpen] = useState(false);
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

  const formatDateReadable = (dateStr: string) => {
    if (!dateStr) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const month = months[parseInt(parts[1], 10) - 1];
      const day = parseInt(parts[2], 10);
      return `${day} ${month} ${year}`;
    }
    return dateStr;
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
    switch (roomNo) {
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

  // Auto calculate Balance
  const computedBalanceStr = totalAmount === '' ? '—' : `₹${Math.max(0, Number(totalAmount) - (Number(advancePaid) || 0)).toLocaleString()}`;

  useEffect(() => {
    if (!isEditing) {
      if (initialRoomNumber) {
        setSelectedRoomNumbers([initialRoomNumber]);
      } else {
        setSelectedRoomNumbers([101]);
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
      setGuestPhone('');
      setRemarks('');
      setTotalAmount(0);
      setAdvancePaid(0);
    }
  }, [isEditing, initialRoomNumber, initialCheckInDate]);

  // Load existing booking
  useEffect(() => {
    if (isEditing && bookingId) {
      async function load() {
        const b = await BookingService.getBookingById(bookingId);
        if (b) {
          setLoadedBooking(b);
          setGuestName(b.guestName || '');
          setGuestPhone(b.guestPhone || '');
          setGuestAddress(b.guestPhone || ''); // Address loaded inside guest metadata
          setGuestIdProof(b.guestIdProof || '');

          setRoomNumber(b.roomNumber);
          setSelectedRoomNumbers([b.roomNumber]);
          setCheckInDate(b.checkInDate);
          setCheckOutDate(b.checkOutDate);
          setTotalAmount(b.totalAmount);
          setAdvancePaid(b.advancePaid);
          setRemarks(b.remarks || '');

          // Fetch associated payment breakdown
          const pList = await PaymentService.getPaymentsForBooking(b.id);
          setPayments(pList);

          if (b.bookingGroupId) {
            const allB = await BookingService.getBookings();
            const sameGroup = allB.filter(booking => booking.bookingGroupId === b.bookingGroupId);
            setGroupBookingsSameGroup(sameGroup);
          } else {
            setGroupBookingsSameGroup([]);
          }
        }
      }
      load();
    }
  }, [isEditing, bookingId]);

  // Auto check room availability based on check-in and check-out dates
  useEffect(() => {
    let isMounted = true;
    if (checkInDate && checkOutDate) {
      const start = new Date(checkInDate).getTime();
      const end = new Date(checkOutDate).getTime();
      if (!isNaN(start) && !isNaN(end) && end > start) {
        async function fetchAvailability() {
          const availabilityMap: Record<number, boolean> = {};
          for (const room of FIXED_ROOMS) {
            const isOverlapping = await BookingService.checkOverlappingBooking(
              room.number,
              checkInDate,
              checkOutDate,
              bookingId || undefined
            );
            availabilityMap[room.number] = !isOverlapping;
          }
          if (isMounted) {
            setRoomAvailability(availabilityMap);
          }
        }
        fetchAvailability();
      } else {
        setRoomAvailability({});
      }
    } else {
      setRoomAvailability({});
    }
    return () => {
      isMounted = false;
    };
  }, [checkInDate, checkOutDate, bookingId]);

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
      // 1. Check overlap for all selected rooms first to prevent double bookings
      for (const num of selectedRoomNumbers) {
        const isOverlapping = await BookingService.checkOverlappingBooking(num, checkInDate, checkOutDate);
        if (isOverlapping) {
          setErrorMsg(`Room ${num} is already booked for the selected dates.`);
          setIsSubmitting(false);
          return;
        }
      }

      // Generate a shared booking Group ID if multiple rooms are selected
      let sharedGroupId: string | undefined = undefined;
      if (selectedRoomNumbers.length > 1) {
        sharedGroupId = await BookingService.getNextBookingGroupId();
      }

      // 2. Loop to create individual room reservations with 0 pricing (billing managed later)
      for (let i = 0; i < selectedRoomNumbers.length; i++) {
        const num = selectedRoomNumbers[i];

        await BookingService.createBooking(
          {
            name: guestName.trim(),
            phone: guestPhone.trim(),
            address: '',
            idProof: '',
          },
          {
            roomNumber: num,
            checkInDate,
            checkOutDate,
            totalAmount: 0,
            advancePaid: 0,
            remarks: remarks.trim() + (selectedRoomNumbers.length > 1 ? ` (Group Booking: Rooms ${selectedRoomNumbers.join(', ')})` : ''),
            bookingGroupId: sharedGroupId,
          } as any
        );
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating booking');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusTransition = async (newStatus: 'checked-in' | 'checked-out') => {
    if (!loadedBooking) return;
    setErrorMsg(null);

    try {
      setIsSubmitting(true);
      if (loadedBooking.bookingGroupId && groupBookingsSameGroup.length > 1) {
        // One click only: immediately check-in/out ALL eligible rooms in this reservation group
        const targetBookings = groupBookingsSameGroup.filter(b => {
          if (newStatus === 'checked-in') {
            return b.status === 'booked';
          } else {
            return b.status === 'checked-in';
          }
        });

        // Ensure current is updated too
        const toUpdate = targetBookings.map(b => b.id);
        if (!toUpdate.includes(loadedBooking.id)) {
          if ((newStatus === 'checked-in' && loadedBooking.status === 'booked') ||
              (newStatus === 'checked-out' && loadedBooking.status === 'checked-in')) {
            toUpdate.push(loadedBooking.id);
          }
        }

        for (const bid of toUpdate) {
          await BookingService.updateBookingStatus(bid, newStatus);
        }
      } else {
        await BookingService.updateBookingStatus(loadedBooking.id, newStatus);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating status');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelBooking = async (entireGroup: boolean) => {
    if (!loadedBooking) return;
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      if (entireGroup && loadedBooking.bookingGroupId) {
        // Multi-room cancel: Cancel all bookings belonging to this reservation group
        const targetBookings = groupBookingsSameGroup.filter(b => b.status !== 'cancelled' && b.status !== 'checked-out');
        const toUpdate = targetBookings.map(b => b.id);
        if (!toUpdate.includes(loadedBooking.id)) {
          toUpdate.push(loadedBooking.id);
        }
        for (const bid of toUpdate) {
          await BookingService.updateBookingStatus(bid, 'cancelled');
        }
      } else {
        // Single-room cancel
        await BookingService.updateBookingStatus(loadedBooking.id, 'cancelled');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error cancelling booking');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBooking = async () => {
    if (!loadedBooking) return;
    const confirmDelete = window.confirm(
      `CRITICAL ACTION: Are you sure you want to PERMANENTLY DELETE booking for room ${loadedBooking.roomNumber} (${loadedBooking.guestName})?\nThis action cannot be undone and will erase all transaction records.`
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
    if (extraPaymentAmount > maxAllowed) {
      setErrorMsg(`Amount cannot exceed the pending balance of ₹${maxAllowed}`);
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

      // Reload lists
      const b = await BookingService.getBookingById(loadedBooking.id);
      if (b) {
        setLoadedBooking(b);
        setAdvancePaid(b.advancePaid);
        const pList = await PaymentService.getPaymentsForBooking(b.id);
        setPayments(pList);
      }

      setExtraPaymentAmount(0);
      setExtraPaymentRemarks('');
      setShowAddPaymentForm(false);
      
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed log payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm transition duration-200">
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]"
        id="booking_detail_modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {isEditing ? `Room Reservation - ${loadedBooking?.roomNumber}` : 'New Booking'}
            </h3>
            {isEditing && (
              <p className="text-xs text-gray-400 mt-1 uppercase font-mono tracking-wider">
                Booking ID: #{loadedBooking?.id}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 text-sm text-gray-700 space-y-6">
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
                      onClick={() => handleStatusTransition('checked-in')}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:cursor-not-allowed disabled:shadow-none"
                      id="btn_checkin_guest"
                    >
                      <Check className="w-4 h-4" />
                      Check-In Guest
                    </button>
                  )}

                  {loadedBooking.status === 'checked-in' && (
                    <button
                      type="button"
                      onClick={() => handleStatusTransition('checked-out')}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:cursor-not-allowed disabled:shadow-none"
                      id="btn_checkout_guest"
                    >
                      <Receipt className="w-4 h-4" />
                      Checkout & Close Room
                    </button>
                  )}

                  {/* Cancellation / Release options: Release This Room, Release All Rooms */}
                  {(loadedBooking.status === 'booked' || loadedBooking.status === 'checked-in') && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleCancelBooking(false)}
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
                          onClick={() => handleCancelBooking(true)}
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

                {/* Stay Stay details */}
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
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Row 1: Stay Dates (Check-In & Check-Out Inputs with optional Date Picker Popover) */}
              <div className="space-y-2 pb-3 border-b border-gray-100 relative">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold tracking-wide text-gray-500 uppercase block">Stay Dates</label>
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {showDatePicker ? 'Close Calendar' : 'Calendar View'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500 block mb-1">Check-In Date</label>
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
                      className="w-full rounded-lg border border-gray-200 bg-white p-2.5 text-xs font-bold text-gray-900 focus:ring-1 focus:ring-indigo-500 focus:outline-none shadow-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500 block mb-1">Check-Out Date</label>
                    <input
                      type="date"
                      required
                      value={checkOutDate}
                      min={checkInDate}
                      onChange={(e) => setCheckOutDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white p-2.5 text-xs font-bold text-gray-900 focus:ring-1 focus:ring-indigo-500 focus:outline-none shadow-xs"
                    />
                  </div>
                </div>

                {showDatePicker && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-50 animate-fade-in max-w-[320px] mx-auto" id="stay_dates_calendar_popover">
                    <div className="flex justify-between items-center pb-1.5 mb-1.5 border-b border-gray-100 select-none">
                      <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase block">Select Stay Range</span>
                      <button
                        type="button"
                        onClick={() => setShowDatePicker(false)}
                        className="text-[12px] font-black text-gray-400 hover:text-gray-700 cursor-pointer h-5 w-5 flex items-center justify-center p-0 rounded-full hover:bg-gray-100 transition-colors"
                        title="Close"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Month Picker Dropdowns & Buttons */}
                    <div className="flex items-center justify-between mb-2 select-none gap-1">
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-650 font-black cursor-pointer text-xs"
                      >
                        ‹
                      </button>
                      <div className="flex items-center gap-1">
                        <select
                          value={currentMonth}
                          onChange={(e) => setCurrentMonth(parseInt(e.target.value, 10))}
                          className="bg-gray-50 border border-gray-200 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          {monthsList.map((m, idx) => (
                            <option key={m} value={idx}>{m.substring(0, 3)}</option>
                          ))}
                        </select>
                        <select
                          value={currentYear}
                          onChange={(e) => setCurrentYear(parseInt(e.target.value, 10))}
                          className="bg-gray-50 border border-gray-200 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          {[2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={handleNextMonth}
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-650 font-black cursor-pointer text-xs"
                      >
                        ›
                      </button>
                    </div>

                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-extrabold text-gray-400 uppercase font-mono mb-1 select-none">
                      <div>Su</div>
                      <div>Mo</div>
                      <div>Tu</div>
                      <div>We</div>
                      <div>Th</div>
                      <div>Fr</div>
                      <div>Sa</div>
                    </div>

                    {/* Day cells grid */}
                    <div className="grid grid-cols-7 gap-0.5">
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

                          let cellStyle = "text-gray-800 hover:bg-gray-100 rounded-md";
                          if (isCheckIn || isCheckOut) {
                            cellStyle = "bg-indigo-600 text-white font-extrabold rounded-md shadow-2xs";
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
                              className={`aspect-square text-[10px] font-semibold flex items-center justify-center transition-all duration-100 cursor-pointer ${cellStyle}`}
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
              <div className="space-y-2 pb-3 border-b border-gray-100">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase block">Selected Room(s)</span>
                  <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase block">
                    Selected: <span className="text-indigo-650 font-black">{selectedRoomNumbers.length === 0 ? 'None' : selectedRoomNumbers.join(', ')}</span>
                  </div>
                </div>

                {!checkInDate || !checkOutDate ? (
                  <div className="text-center py-4 bg-slate-50 border border-dashed border-gray-200 rounded-xl">
                    <p className="text-xs font-bold text-gray-500">Please select check-in and check-out dates above</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5" id="available_rooms_grid">
                    {FIXED_ROOMS.map((room) => {
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
                              if (selectedRoomNumbers.length > 1) {
                                setSelectedRoomNumbers(selectedRoomNumbers.filter(n => n !== num));
                              }
                            } else {
                              setSelectedRoomNumbers([...selectedRoomNumbers, num]);
                            }
                          }}
                          className={`p-2.5 rounded-xl border font-bold text-xs text-center transition-all duration-150 cursor-pointer ${
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

              {/* Row 3: Guest Name & Mobile Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold tracking-wide text-gray-500 uppercase block mb-1">
                    Guest Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full rounded-lg border border-gray-200 bg-white p-2.5 text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold tracking-wide text-gray-500 uppercase block mb-1">
                    Mobile Number <span className="text-gray-400 font-normal lowercase">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full rounded-lg border border-gray-200 bg-white p-2.5 text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-xs"
                  />
                </div>
              </div>

              {/* Row 4: Remarks */}
              <div>
                <label className="text-xs font-semibold tracking-wide text-gray-500 uppercase block mb-1">
                  Remarks <span className="text-gray-400 font-normal lowercase">(optional)</span>
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Early check-in requested, extra bed"
                  className="w-full rounded-lg border border-gray-200 bg-white p-2.5 text-xs font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-xs"
                />
              </div>

              {/* Row 5: Action Buttons */}
              <div className="flex gap-2 justify-end border-t border-gray-100 pt-3 mt-4 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-650 hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !checkInDate || !checkOutDate || selectedRoomNumbers.length === 0 || !guestName.trim()}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {isSubmitting ? 'Saving...' : 'Save Booking'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
