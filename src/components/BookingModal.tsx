import React, { useState, useEffect } from 'react';

const DEBUG = false;
import { Booking, Guest, Payment, Room } from '../types';
import { supabase } from '../lib/supabase';
import { BookingService, PaymentService } from '../services/dbServices';
import { ReservationService } from '../services/reservations';
import { updatePaymentSummary } from '../services/paymentSummary';
import { useHotelData } from '../context/HotelContext';
import { formatDateHuman, getISTDateStr } from '../utils/formatters';
import {
  addDaysYMD,
  parseRoomTimeline,
  parsePaymentMetadata,
  encodeRoomTimeline,
  buildCombinedRemarks,
  RoomTimelineSegment,
} from '../utils/timeline';
import {
  X,
  Calendar,
  User,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Clock,
  Trash2,
  Edit2,
  Plus,
  RefreshCw,
  AlertTriangle,
  CreditCard,
} from 'lucide-react';

interface ReplaceStep {
  roomBookingId: string;
  guestName: string;
  fromRoomNumber: number;
  checkInDate: string;
  checkOutDate: string;
  bookingGroupId: string;
}

interface ChainAssignment {
  roomBookingId: string;
  guestName: string;
  fromRoomNumber: number;
  toRoomNumber: number;
}

interface ConflictPrompt {
  targetRoomNumber: number;
  conflictingBooking: Booking;
}

interface BookingModalProps {
  bookingId?: string | null;           // If present, we view/edit this booking
  initialRoomNumber?: number | null;   // If present, default room for new booking
  initialCheckInDate?: string | null;  // If present, default check-in for new booking
  isAdminMode?: boolean;
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
  const {
    rooms: roomsList,
    bookings: contextBookings,
    payments: contextPayments,
    dueTransactions,
    checkOverlappingBooking,
    updateBookingPayment,
    refreshData,
  } = useHotelData();

  const [groupBookingsSameGroup, setGroupBookingsSameGroup] = useState<Booking[]>([]);
  const isEditing = !!bookingId;

  // Form State for Guest (New Booking)
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

  // Form State for Booking (New Booking)
  const [selectedRoomNumbers, setSelectedRoomNumbers] = useState<number[]>(
    initialRoomNumber ? [initialRoomNumber] : []
  );
  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [totalAmount, setTotalAmount] = useState<number | ''>('');
  const [advancePaid, setAdvancePaid] = useState<number | ''>('');
  const [remarks, setRemarks] = useState('');
  const [roomAvailability, setRoomAvailability] = useState<Record<number, boolean>>({});

  // Quick Additional Advance State
  const [quickAdvanceInput, setQuickAdvanceInput] = useState<number | ''>('');
  const [quickAdvanceMethod, setQuickAdvanceMethod] = useState<'cash' | 'card' | 'upi' | 'net_banking'>('cash');

  // Advanced Room Replacement States
  const [activeReplaceStep, setActiveReplaceStep] = useState<ReplaceStep | null>(null);
  const [pendingChain, setPendingChain] = useState<ChainAssignment[]>([]);
  const [conflictPrompt, setConflictPrompt] = useState<ConflictPrompt | null>(null);
  const [isChainReplaceMode, setIsChainReplaceMode] = useState<boolean>(false);

  // Stay Extension States
  const [isContinueStayOpen, setIsContinueStayOpen] = useState(false);
  const [extensionNewCheckOutDate, setExtensionNewCheckOutDate] = useState('');
  const [continueStayError, setContinueStayError] = useState<string | null>(null);
  const [extensionTargetNewCheckOut, setExtensionTargetNewCheckOut] = useState<string | null>(null);
  const [extensionPendingQueue, setExtensionPendingQueue] = useState<string[]>([]);

  // Stay Extension Room Replacement Modal States
  const [isExtensionRoomModalOpen, setIsExtensionRoomModalOpen] = useState(false);
  const [extensionRoomItems, setExtensionRoomItems] = useState<{
    originalRoomNumber: number;
    isAvailable: boolean;
    selectedRoomNumber: number | null;
  }[]>([]);
  const [extensionSelectedRooms, setExtensionSelectedRooms] = useState<number[]>([]);

  // Stay Extension Payment Dialog States
  const [isStayExtensionPaymentOpen, setIsStayExtensionPaymentOpen] = useState(false);
  const [extensionExtraStayAmount, setExtensionExtraStayAmount] = useState<number | ''>('');
  const [extensionPaymentNow, setExtensionPaymentNow] = useState<number | ''>('');
  const [extensionPaymentMethod, setExtensionPaymentMethod] = useState<'cash' | 'upi' | 'card' | 'net_banking'>('cash');
  const [extensionPaymentRemarks, setExtensionPaymentRemarks] = useState<string>('Stay Extension Payment');

  // Guest Information Edit State
  const [isEditingGuest, setIsEditingGuest] = useState(false);
  const [editGuestName, setEditGuestName] = useState('');
  const [editRemarks, setEditRemarks] = useState('');

  // Total Amount Edit State
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const [editTotalInput, setEditTotalInput] = useState<number | ''>('');

  // Release Confirmation Dialog State
  const [releaseConfirmTarget, setReleaseConfirmTarget] = useState<{
    type: 'single' | 'entire';
    roomBooking?: Booking;
  } | null>(null);

  // Add Extra Room Modal State
  const [isAddRoomModalOpen, setIsAddRoomModalOpen] = useState(false);
  const [addRoomSelectedNumbers, setAddRoomSelectedNumbers] = useState<number[]>([]);
  const [addRoomCustomTotal, setAddRoomCustomTotal] = useState<number | ''>('');
  const [addRoomErrorMsg, setAddRoomErrorMsg] = useState<string | null>(null);

  const getAvailableRoomsForAdd = () => {
    if (!loadedBooking) return [];
    const allocatedNums = allocatedRoomsList.map((r) => r.roomNumber);
    const cIn = loadedBooking.checkInDate;
    const cOut = loadedBooking.checkOutDate;
    const targetResId = loadedBooking.bookingGroupId || loadedBooking.id;

    return roomsList.filter((room) => {
      if (room.is_active === false) return false;
      if (allocatedNums.includes(room.number)) return false;
      const isOverlapping = checkOverlappingBooking(
        room.number,
        cIn,
        cOut,
        targetResId
      );
      return !isOverlapping;
    });
  };

  const handleAddRoomsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loadedBooking || addRoomSelectedNumbers.length === 0) return;

    setIsSubmitting(true);
    setAddRoomErrorMsg(null);

    try {
      const resId = loadedBooking.bookingGroupId || loadedBooking.id;
      const oldRoomCount = allocatedRoomsList.length;
      const currentTotal = loadedBooking.totalAmount || 0;
      const avgPricePerRoom = oldRoomCount > 0 ? Math.round(currentTotal / oldRoomCount) : 0;
      const addedCount = addRoomSelectedNumbers.length;
      const calculatedNewTotal = addRoomCustomTotal !== '' 
        ? Number(addRoomCustomTotal) 
        : currentTotal + (avgPricePerRoom * addedCount);

      await BookingService.addRoomsToReservation(
        resId,
        addRoomSelectedNumbers,
        calculatedNewTotal
      );

      await refreshData();
      setIsAddRoomModalOpen(false);
      setAddRoomSelectedNumbers([]);
      setAddRoomCustomTotal('');
      onSuccess();
    } catch (err: any) {
      console.error('Error adding rooms:', err);
      setAddRoomErrorMsg(err.message || 'Failed to add rooms to reservation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Custom Date Picker calendar states
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
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

  const bookingTransactions = React.useMemo(() => {
    if (!loadedBooking || !dueTransactions) return [];
    const targetResId = String(loadedBooking.bookingGroupId || loadedBooking.id);

    return dueTransactions
      .filter((tx) => String(tx.reservation_id) === targetResId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [loadedBooking, dueTransactions]);

  // Check-In Payment Confirmation State
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [checkInPaidNowInput, setCheckInPaidNowInput] = useState<number | ''>('');
  const [transferToIrshad, setTransferToIrshad] = useState(false);
  const [balanceDueWallet, setBalanceDueWallet] = useState(false);

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
        setSelectedRoomNumbers([b.roomNumber]);
        setCheckInDate(b.checkInDate);
        setCheckOutDate(b.checkOutDate);
        setTotalAmount(b.totalAmount);
        setAdvancePaid(b.advancePaid);
        setRemarks(b.remarks || '');

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

  // Auto check room availability based on check-in and check-out dates
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

  const allocatedRoomsList = groupBookingsSameGroup.length > 0
    ? groupBookingsSameGroup
    : loadedBooking
    ? [loadedBooking]
    : [];

  const balanceRemaining = loadedBooking
    ? Math.max(0, (loadedBooking.totalAmount || 0) - (loadedBooking.advancePaid || 0))
    : 0;

  // Handler for New Booking Form Submit
  const handleSubmitNewBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

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
      for (const num of selectedRoomNumbers) {
        const isOverlapping = checkOverlappingBooking(num, checkInDate, checkOutDate);
        if (isOverlapping) {
          setErrorMsg(`Room ${num} is already booked for the selected dates.`);
          setIsSubmitting(false);
          return;
        }
      }

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

      await refreshData();
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating booking');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Additional Advance Handler
  const handleQuickAddAdvance = async () => {
    if (!loadedBooking || !quickAdvanceInput || Number(quickAdvanceInput) <= 0) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const addAmount = Number(quickAdvanceInput);
      const resId = loadedBooking.bookingGroupId || loadedBooking.id;

      await PaymentService.addPayment(
        resId,
        addAmount,
        quickAdvanceMethod,
        'Additional advance payment'
      );

      setQuickAdvanceInput('');
      await refreshData();
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record advance payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Paid Full Handler
  const handlePaidFull = async () => {
    if (!loadedBooking) return;
    const remaining = Math.max(0, (loadedBooking.totalAmount || 0) - (loadedBooking.advancePaid || 0));
    if (remaining <= 0) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const resId = loadedBooking.bookingGroupId || loadedBooking.id;
      await updatePaymentSummary({
        reservationId: resId,
        paymentAmount: remaining,
        isAdvance: false,
        paymentMethod: 'cash',
        remarks: 'Paid in Full',
      });

      await refreshData();
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to process Paid Full');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate status for each room in the replacement dialog
  const getRoomReplacementStatus = (roomNumber: number) => {
    if (!activeReplaceStep) return { type: 'available', booking: null };

    // 1. Current room being replaced for the active step
    if (roomNumber === activeReplaceStep.fromRoomNumber) {
      return { type: 'current', booking: null };
    }

    const checkIn = activeReplaceStep.checkInDate;
    const checkOut = activeReplaceStep.checkOutDate;

    let conflictingBooking: Booking | null = null;

    for (const b of contextBookings) {
      if (b.status === 'cancelled' || b.status === 'checked-out') continue;

      const datesOverlap = checkIn < b.checkOutDate && checkOut > b.checkInDate;
      if (!datesOverlap) continue;

      // Determine b's effective room number accounting for pendingChain
      const chainItem = pendingChain.find((p) => p.roomBookingId === b.id);
      const wasDisplaced = pendingChain.some((p) => p.roomBookingId === b.id);

      let effectiveRoom = b.roomNumber;
      if (chainItem) {
        effectiveRoom = chainItem.toRoomNumber;
      } else if (wasDisplaced) {
        // Displaced from old room and not given a new room yet
        continue;
      }

      if (effectiveRoom === roomNumber) {
        conflictingBooking = b;
        break;
      }
    }

    if (conflictingBooking) {
      const sameGroup =
        (conflictingBooking.bookingGroupId &&
          conflictingBooking.bookingGroupId === activeReplaceStep.bookingGroupId) ||
        conflictingBooking.id === activeReplaceStep.roomBookingId ||
        conflictingBooking.guestName.toLowerCase().trim() ===
          activeReplaceStep.guestName.toLowerCase().trim();

      if (sameGroup) {
        return { type: 'disabled_same_booking', booking: conflictingBooking };
      } else {
        return { type: 'allocated', booking: conflictingBooking };
      }
    }

    return { type: 'available', booking: null };
  };

  // Execute all accumulated replacement steps in batch
  const executeBatchReplacement = async (chain: ChainAssignment[]) => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      for (const item of chain) {
        await BookingService.replaceRoom(item.roomBookingId, item.toRoomNumber);
      }

      setActiveReplaceStep(null);
      setPendingChain([]);
      setConflictPrompt(null);
      setIsChainReplaceMode(false);

      if (extensionTargetNewCheckOut && loadedBooking) {
        if (extensionPendingQueue.length > 0) {
          const nextId = extensionPendingQueue[0];
          setExtensionPendingQueue((prev) => prev.slice(1));
          const nextAlloc = allocatedRoomsList.find((a) => a.id === nextId);
          if (nextAlloc) {
            setActiveReplaceStep({
              roomBookingId: nextAlloc.id,
              guestName: loadedBooking.guestName || 'Guest',
              fromRoomNumber: nextAlloc.roomNumber,
              checkInDate: (loadedBooking.checkOutDate || '').split('T')[0].trim(),
              checkOutDate: extensionTargetNewCheckOut,
              bookingGroupId: loadedBooking.bookingGroupId || loadedBooking.id,
            });
            setIsSubmitting(false);
            return;
          }
        }

        // All unavailable room replacements completed for extension! Open Payment Dialog
        const oldCheckOut = (loadedBooking.checkOutDate || '').split('T')[0].trim();
        const oldCheckIn = (loadedBooking.checkInDate || '').split('T')[0].trim();
        const oldNights = Math.max(1, Math.round((new Date(oldCheckOut).getTime() - new Date(oldCheckIn).getTime()) / 86400000));
        const extraNights = Math.max(1, Math.round((new Date(extensionTargetNewCheckOut).getTime() - new Date(oldCheckOut).getTime()) / 86400000));
        const prevTotal = Number(loadedBooking.totalAmount || 0);
        const avgRatePerNight = Math.round(prevTotal / oldNights);
        const defaultExtraAmt = avgRatePerNight * extraNights;

        setExtensionExtraStayAmount(defaultExtraAmt > 0 ? defaultExtraAmt : '');
        setExtensionPaymentNow('');
        setExtensionPaymentMethod('cash');
        setExtensionPaymentRemarks('Stay Extension Payment');
        setIsStayExtensionPaymentOpen(true);
        setIsSubmitting(false);
        return;
      }

      await refreshData();
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to replace room(s)');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Stay Extension Handlers
  const handleOpenContinueStay = () => {
    if (!loadedBooking) return;
    const defaultNewCheckOut = addDaysYMD(loadedBooking.checkOutDate, 1);
    setExtensionNewCheckOutDate(defaultNewCheckOut);
    setContinueStayError(null);
    setIsContinueStayOpen(true);
  };

  const handleExecuteStayExtension = async () => {
    if (!loadedBooking) return;
    setContinueStayError(null);

    const oldCheckOut = (loadedBooking.checkOutDate || '').split('T')[0].trim();
    const newCheckOut = (extensionNewCheckOutDate || '').split('T')[0].trim();
    const targetResId = String(loadedBooking.bookingGroupId || loadedBooking.id);

    if (!newCheckOut || newCheckOut <= oldCheckOut) {
      setContinueStayError('New checkout date must be after current checkout date.');
      return;
    }

    // Determine current allocated rooms for departure date from timeline or allocatedRoomsList
    const { timeline } = parseRoomTimeline(loadedBooking.remarks || '');
    const rawCurrentRooms = timeline && timeline.length > 0
      ? [...timeline[timeline.length - 1].rooms]
      : Array.from(new Set(allocatedRoomsList.map((r) => r.roomNumber)));
    const currentRooms: number[] = rawCurrentRooms.map((n) => Number(n));

    const roomItems: { originalRoomNumber: number; isAvailable: boolean; selectedRoomNumber: number | null }[] = [];
    let unavailableCount = 0;

    for (const rNum of currentRooms) {
      const isOccupied = checkOverlappingBooking(rNum, oldCheckOut, newCheckOut, targetResId);
      if (!isOccupied) {
        roomItems.push({
          originalRoomNumber: rNum,
          isAvailable: true,
          selectedRoomNumber: rNum,
        });
      } else {
        unavailableCount++;
        roomItems.push({
          originalRoomNumber: rNum,
          isAvailable: false,
          selectedRoomNumber: null,
        });
      }
    }

    const oldCheckIn = (loadedBooking.checkInDate || '').split('T')[0].trim();
    const oldNights = Math.max(1, Math.round((new Date(oldCheckOut).getTime() - new Date(oldCheckIn).getTime()) / 86400000));
    const extraNights = Math.max(1, Math.round((new Date(newCheckOut).getTime() - new Date(oldCheckOut).getTime()) / 86400000));
    const prevTotal = Number(loadedBooking.totalAmount || 0);
    const avgRatePerNight = Math.round(prevTotal / oldNights);
    const defaultExtraAmt = avgRatePerNight * extraNights;

    setExtensionTargetNewCheckOut(newCheckOut);
    setExtensionExtraStayAmount(defaultExtraAmt > 0 ? defaultExtraAmt : '');
    setExtensionPaymentNow('');
    setExtensionPaymentMethod('cash');
    setExtensionPaymentRemarks('Stay Extension Payment');

    if (unavailableCount === 0) {
      // CASE 1: All rooms available -> Proceed to Payment Dialog
      setExtensionSelectedRooms(currentRooms);
      setIsContinueStayOpen(false);
      setIsStayExtensionPaymentOpen(true);
    } else {
      // CASE 2: One or more rooms unavailable -> Proceed to Replace Rooms Modal
      setExtensionRoomItems(roomItems);
      setIsContinueStayOpen(false);
      setIsExtensionRoomModalOpen(true);
    }
  };

  // Finalize Stay Extension after Payment confirmation
  const handleFinalizeExtensionWithPayment = async () => {
    if (!loadedBooking || !extensionTargetNewCheckOut) return;
    setIsSubmitting(true);
    setContinueStayError(null);

    try {
      const extraStayAmt = Number(extensionExtraStayAmount) || 0;
      const payNow = Number(extensionPaymentNow) || 0;

      const previousTotal = Number(loadedBooking.totalAmount || 0);
      const alreadyPaid = Number(loadedBooking.advancePaid || 0);

      const newBookingTotal = previousTotal + extraStayAmt;
      const newTotalPaid = alreadyPaid + payNow;

      const oldCheckOut = (loadedBooking.checkOutDate || '').split('T')[0].trim();
      const newCheckOut = extensionTargetNewCheckOut.split('T')[0].trim();
      const targetResId = String(loadedBooking.bookingGroupId || loadedBooking.id);

      // Determine original rooms allocation
      const { timeline: origTimeline } = parseRoomTimeline(loadedBooking.remarks || '');
      const origRooms = origTimeline && origTimeline.length > 0
        ? origTimeline[0].rooms
        : Array.from(new Set(allocatedRoomsList.map((r) => r.roomNumber)));

      // Determine new extension allocation rooms
      const currentAllocated = extensionSelectedRooms.length > 0
        ? extensionSelectedRooms
        : origRooms;

      // Count new allocation rows being inserted (rooms not already in original allocation)
      const existingAllocatedNums = new Set(allocatedRoomsList.map((r) => r.roomNumber));
      const newRoomsToInsert = currentAllocated.filter((num) => !existingAllocatedNums.has(num));
      const insertedCount = newRoomsToInsert.length;

      // Log before saving strictly as required
      if (DEBUG) {
        console.log('Original allocation:', origRooms);
        console.log('New extension allocation:', currentAllocated);
        console.log('Rows being inserted:', insertedCount);
        console.log('Rows being updated:', 0);
        console.log('Expected result');
        console.log('Updated rows = 0');
        console.log(`Inserted rows = ${insertedCount}`);
      }

      // 1. Update Payment Record & Add Transaction to due_payment_transactions (if payNow > 0)
      await updatePaymentSummary({
        reservationId: targetResId,
        paymentAmount: payNow,
        isAdvance: true,
        paymentMethod: extensionPaymentMethod,
        remarks: extensionPaymentRemarks.trim() || 'Stay Extension Payment',
        options: {
          totalAmount: newBookingTotal,
        },
      });

      // 2. Ensure extension rooms are inserted into reservation_rooms in Supabase (INSERT only)
      if (currentAllocated.length > 0) {
        await ReservationService.addRoomsToReservation(targetResId, currentAllocated);
      }

      // 3. Build updated timeline JSON and combined remarks
      const { timeline, cleanRemarks } = parseRoomTimeline(loadedBooking.remarks || '');

      if (timeline.length === 0) {
        timeline.push({
          startDate: (loadedBooking.checkInDate || '').split('T')[0].trim(),
          endDate: oldCheckOut,
          rooms: allocatedRoomsList.map((r) => r.roomNumber),
        });
        timeline.push({
          startDate: oldCheckOut,
          endDate: newCheckOut,
          rooms: currentAllocated,
        });
      } else {
        const lastSeg = timeline[timeline.length - 1];
        if (lastSeg && lastSeg.endDate === oldCheckOut) {
          if (JSON.stringify([...lastSeg.rooms].sort()) === JSON.stringify([...currentAllocated].sort())) {
            lastSeg.endDate = newCheckOut;
          } else {
            timeline.push({
              startDate: oldCheckOut,
              endDate: newCheckOut,
              rooms: currentAllocated,
            });
          }
        } else {
          timeline.push({
            startDate: oldCheckOut,
            endDate: newCheckOut,
            rooms: currentAllocated,
          });
        }
      }

      const newRemarks = buildCombinedRemarks(cleanRemarks, timeline, {
        totalAmount: newBookingTotal,
        advancePaid: newTotalPaid,
      });

      // 4. Update reservation check_out_date and remarks in Supabase
      await BookingService.extendReservation(targetResId, newCheckOut, newRemarks);

      // 5. Reset states & refresh
      setIsStayExtensionPaymentOpen(false);
      setIsExtensionRoomModalOpen(false);
      setIsContinueStayOpen(false);
      setExtensionTargetNewCheckOut(null);
      setExtensionPendingQueue([]);

      await refreshData();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Error finalizing stay extension:', err);
      setContinueStayError(err.message || 'Failed to extend stay.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // User selects a room in the replacement grid
  const handleSelectRoomForReplacement = (roomNumber: number) => {
    if (!activeReplaceStep) return;

    const status = getRoomReplacementStatus(roomNumber);

    if (status.type === 'current' || status.type === 'disabled_same_booking') {
      return;
    }

    if (status.type === 'available') {
      const finalChain = [
        ...pendingChain,
        {
          roomBookingId: activeReplaceStep.roomBookingId,
          guestName: activeReplaceStep.guestName,
          fromRoomNumber: activeReplaceStep.fromRoomNumber,
          toRoomNumber: roomNumber,
        },
      ];
      executeBatchReplacement(finalChain);
    } else if (status.type === 'allocated' && status.booking) {
      if (!isChainReplaceMode) {
        // First conflict: ask the admin [ Switch Rooms ] or [ Replace Room ]
        setConflictPrompt({
          targetRoomNumber: roomNumber,
          conflictingBooking: status.booking,
        });
      } else {
        // Already in Replace Mode: automatically continue Replace Mode without asking
        const targetRoom = roomNumber;
        const conflicting = status.booking;

        const newChain = [
          ...pendingChain,
          {
            roomBookingId: activeReplaceStep.roomBookingId,
            guestName: activeReplaceStep.guestName,
            fromRoomNumber: activeReplaceStep.fromRoomNumber,
            toRoomNumber: targetRoom,
          },
        ];
        setPendingChain(newChain);

        setActiveReplaceStep({
          roomBookingId: conflicting.id,
          guestName: conflicting.guestName,
          fromRoomNumber: targetRoom,
          checkInDate: conflicting.checkInDate,
          checkOutDate: conflicting.checkOutDate,
          bookingGroupId: conflicting.bookingGroupId || conflicting.id,
        });
      }
    }
  };

  // Option 1: Switch Rooms
  const handleSwitchRooms = async () => {
    if (!activeReplaceStep || !conflictPrompt) return;

    const targetRoom = conflictPrompt.targetRoomNumber;
    const conflicting = conflictPrompt.conflictingBooking;

    const finalChain = [
      ...pendingChain,
      {
        roomBookingId: activeReplaceStep.roomBookingId,
        guestName: activeReplaceStep.guestName,
        fromRoomNumber: activeReplaceStep.fromRoomNumber,
        toRoomNumber: targetRoom,
      },
      {
        roomBookingId: conflicting.id,
        guestName: conflicting.guestName,
        fromRoomNumber: targetRoom,
        toRoomNumber: activeReplaceStep.fromRoomNumber,
      },
    ];

    setConflictPrompt(null);
    await executeBatchReplacement(finalChain);
  };

  // Option 2: Replace Room (Chain Replacement)
  const handleChainReplaceRoom = () => {
    if (!activeReplaceStep || !conflictPrompt) return;

    const targetRoom = conflictPrompt.targetRoomNumber;
    const conflicting = conflictPrompt.conflictingBooking;

    const newChain = [
      ...pendingChain,
      {
        roomBookingId: activeReplaceStep.roomBookingId,
        guestName: activeReplaceStep.guestName,
        fromRoomNumber: activeReplaceStep.fromRoomNumber,
        toRoomNumber: targetRoom,
      },
    ];
    setPendingChain(newChain);
    setIsChainReplaceMode(true); // Enter Replace Mode

    setActiveReplaceStep({
      roomBookingId: conflicting.id,
      guestName: conflicting.guestName,
      fromRoomNumber: targetRoom,
      checkInDate: conflicting.checkInDate,
      checkOutDate: conflicting.checkOutDate,
      bookingGroupId: conflicting.bookingGroupId || conflicting.id,
    });

    setConflictPrompt(null);
  };

  // Room Timeline calculation
  const computedTimeline = React.useMemo(() => {
    if (!loadedBooking) return [];
    const { timeline } = parseRoomTimeline(loadedBooking.remarks || '');
    if (timeline && timeline.length > 0) return timeline;

    const currentAllocated = allocatedRoomsList.map((r) => r.roomNumber);
    if (currentAllocated.length === 0) return [];

    return [
      {
        startDate: (loadedBooking.checkInDate || '').split('T')[0].trim(),
        endDate: (loadedBooking.checkOutDate || '').split('T')[0].trim(),
        rooms: currentAllocated,
      },
    ];
  }, [loadedBooking, allocatedRoomsList]);

  // Open Check-In Payment Confirmation Modal
  const handleOpenCheckInModal = () => {
    if (!loadedBooking) return;

    const todayStr = getISTDateStr();
    const cInYMD = (loadedBooking.checkInDate || '').split('T')[0].split(' ')[0].trim();
    if (cInYMD && cInYMD > todayStr) {
      setErrorMsg('Check-in is not allowed before the reservation date.');
      return;
    }

    const remaining = Math.max(0, loadedBooking.totalAmount - loadedBooking.advancePaid);
    setCheckInPaidNowInput(remaining);
    setTransferToIrshad(false);
    setBalanceDueWallet(false);
    setIsCheckInModalOpen(true);
  };

  // Submit Check-In Payment & Complete Check-In
  const handleConfirmCheckInWithPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loadedBooking) return;
    setErrorMsg(null);

    const todayStr = getISTDateStr();
    const cInYMD = (loadedBooking.checkInDate || '').split('T')[0].split(' ')[0].trim();
    if (cInYMD && cInYMD > todayStr) {
      setErrorMsg('Check-in is not allowed before the reservation date.');
      setIsCheckInModalOpen(false);
      return;
    }

    const paidNow = Number(checkInPaidNowInput || 0);
    const remainingAfterPayment = Math.max(0, loadedBooking.totalAmount - (loadedBooking.advancePaid + paidNow));
    const isTransferred = transferToIrshad && remainingAfterPayment > 0;
    const isBalanceDue = balanceDueWallet && remainingAfterPayment > 0;
    const transferredAmount = isTransferred ? remainingAfterPayment : 0;
    const remBal = isBalanceDue ? remainingAfterPayment : 0;

    try {
      setIsSubmitting(true);

      const targetResId = String(loadedBooking.bookingGroupId || loadedBooking.id);

      // 1. Record check-in payment details
      await BookingService.recordCheckInPayment(targetResId, {
        amountCollected: paidNow,
        transferredToIrshad: transferredAmount,
        transferToIrshad: isTransferred,
        balanceDueWallet: isBalanceDue,
        remainingBalance: remBal,
        remarks: isBalanceDue
          ? 'Customer outstanding balance due recorded'
          : isTransferred
          ? 'Transferred remaining balance to Irshad Wallet'
          : 'Check-in payment',
      });

      // 2. Execute check-in for this booking (or group)
      await BookingService.checkInGuest(targetResId, loadedBooking.remarks);

      setIsCheckInModalOpen(false);
      await refreshData();
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error checking in guest');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check Out Handler (Checkout & Close Room)
  const handleCheckoutGuest = async () => {
    if (!loadedBooking) return;
    setErrorMsg(null);

    try {
      setIsSubmitting(true);
      const targetResId = loadedBooking.bookingGroupId || loadedBooking.id;
      await BookingService.checkoutGuest(targetResId, loadedBooking.remarks);
      await refreshData();
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error checking out guest');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirmed Release Handler (Step 2)
  const handleConfirmRelease = async () => {
    if (!loadedBooking || !releaseConfirmTarget) return;
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      if (releaseConfirmTarget.type === 'entire') {
        const targetGroup = loadedBooking.bookingGroupId || loadedBooking.id;
        await BookingService.cancelEntireReservation(targetGroup);
      } else {
        const targetId = releaseConfirmTarget.roomBooking?.id || loadedBooking.id;
        await BookingService.releaseRoom(targetId);
      }
      setReleaseConfirmTarget(null);
      await refreshData();
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error releasing room');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save Guest Info Edit
  const handleSaveGuestEdit = async () => {
    if (!loadedBooking) return;
    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const resId = loadedBooking.bookingGroupId || loadedBooking.id;
      await BookingService.updateBookingDetails(resId, {
        guestName: editGuestName.trim(),
        remarks: editRemarks.trim(),
      });

      setLoadedBooking((prev) =>
        prev
          ? {
              ...prev,
              guestName: editGuestName.trim(),
              remarks: editRemarks.trim(),
            }
          : null
      );

      setIsEditingGuest(false);
      await refreshData();
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save guest details');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save Total Amount Edit
  const handleSaveTotalAmountEdit = async () => {
    if (!loadedBooking || editTotalInput === '') return;
    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const newTotal = Number(editTotalInput);
      const resId = loadedBooking.bookingGroupId || loadedBooking.id;

      await updateBookingPayment(resId, newTotal, loadedBooking.advancePaid);

      setLoadedBooking((prev) =>
        prev
          ? {
              ...prev,
              totalAmount: newTotal,
              paymentStatus: prev.advancePaid >= newTotal && newTotal > 0 ? 'paid' : 'pending',
            }
          : null
      );

      setIsEditingTotal(false);
      await refreshData();
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save total amount');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-gray-950/60 backdrop-blur-xs transition duration-150">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-150 flex flex-col max-h-[92vh]"
        id="booking_detail_modal"
      >
        {/* Modal Top Control Bar */}
        <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 border-b border-gray-100 bg-gray-50/80 shrink-0">
          <h3 className="text-xs sm:text-sm font-extrabold text-gray-900 uppercase tracking-wide">
            {isEditing ? 'Booking Details' : 'New Room Booking'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg border border-gray-200 hover:bg-gray-100 transition text-gray-500 hover:text-gray-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 space-y-3 text-xs text-gray-800">
          {errorMsg && (
            <div className="p-2.5 bg-red-50 text-red-600 text-xs font-semibold rounded-xl border border-red-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
              {errorMsg}
            </div>
          )}

          {isEditing && loadedBooking ? (
            /* VIEW / EDIT SINGLE COMPACT SCREEN */
            <div className="space-y-3">
              {/* 1. HEADER (Rooms, Dates, Status) */}
              <div className="bg-indigo-950 text-white p-3 rounded-xl flex items-center justify-between shadow-xs">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                    Rooms: <span className="text-white font-extrabold">{allocatedRoomsList.map((r) => r.roomNumber).join(', ')}</span>
                  </div>
                  <div className="text-xs font-black flex items-center gap-1.5 mt-0.5 text-indigo-100">
                    <span>{formatDateHuman(loadedBooking.checkInDate)}</span>
                    <span className="text-indigo-400 font-mono">→</span>
                    <span>{formatDateHuman(loadedBooking.checkOutDate)}</span>
                  </div>
                </div>
                <span className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-lg shadow-xs ${
                  loadedBooking.status === 'booked'
                    ? 'bg-blue-500 text-white'
                    : loadedBooking.status === 'checked-in'
                    ? 'bg-emerald-500 text-white'
                    : loadedBooking.status === 'checked-out'
                    ? 'bg-gray-600 text-white'
                    : 'bg-rose-600 text-white'
                }`}>
                  {loadedBooking.status === 'booked' ? 'CONFIRMED' : loadedBooking.status.toUpperCase()}
                </span>
              </div>

              {/* 2. GUEST INFORMATION */}
              <div className="p-3 bg-gray-50/80 border border-gray-150 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Guest Information</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditGuestName(loadedBooking.guestName || '');
                      setEditRemarks(loadedBooking.remarks || '');
                      setIsEditingGuest(true);
                    }}
                    className="p-1 rounded-lg text-indigo-600 hover:bg-indigo-50 transition cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                    title="Edit Guest Info"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Guest Name</span>
                  <span className="font-extrabold text-sm text-gray-900">{loadedBooking.guestName || 'GUEST'}</span>
                </div>
                <div className="border-t border-gray-100 pt-1.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Remarks</span>
                  <p className="font-medium text-gray-700 italic text-xs mt-0.5">
                    {loadedBooking.remarks ? `"${loadedBooking.remarks}"` : 'No special remarks recorded.'}
                  </p>
                </div>
              </div>

              {/* 3. PAYMENT SUMMARY */}
              <div className="p-3 border border-gray-150 rounded-xl bg-white space-y-2.5">
                <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Payment Summary</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {balanceRemaining > 0 && (
                      <button
                        type="button"
                        onClick={handlePaidFull}
                        disabled={isSubmitting}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase rounded-lg shadow-2xs transition cursor-pointer flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        <span>Paid Full</span>
                      </button>
                    )}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${balanceRemaining > 0 ? 'bg-red-50 text-red-700 font-extrabold' : 'bg-emerald-50 text-emerald-700 font-extrabold'}`}>
                      {balanceRemaining > 0 ? `Balance: ₹${balanceRemaining.toLocaleString()}` : 'Fully Paid'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-50 p-2 rounded-lg border border-gray-100 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase text-gray-400">Total</span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditTotalInput(loadedBooking.totalAmount);
                          setIsEditingTotal(true);
                        }}
                        className="p-0.5 text-indigo-600 hover:bg-indigo-100 rounded transition cursor-pointer"
                        title="Edit Total Amount"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-xs font-black text-gray-900 mt-0.5">₹{loadedBooking.totalAmount.toLocaleString()}</div>
                  </div>

                  <div className="bg-emerald-50/60 p-2 rounded-lg border border-emerald-100">
                    <div className="text-[9px] font-bold uppercase text-emerald-600">Advance Paid</div>
                    <div className="text-xs font-black text-emerald-700 mt-0.5">₹{loadedBooking.advancePaid.toLocaleString()}</div>
                  </div>

                  <div className={`p-2 rounded-lg border ${balanceRemaining > 0 ? 'bg-rose-50/60 border-rose-100' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="text-[9px] font-bold uppercase text-rose-500">Balance</div>
                    <div className="text-xs font-black text-rose-700 mt-0.5">₹{balanceRemaining.toLocaleString()}</div>
                  </div>
                </div>

                {/* Quick Additional Advance Box */}
                {loadedBooking.status !== 'checked-out' && (
                  <div className="bg-indigo-50/60 border border-indigo-100 p-2 rounded-lg space-y-1.5">
                    <div className="text-[10px] font-extrabold uppercase text-indigo-800 flex items-center justify-between">
                      <span>Add Additional Advance</span>
                      <span className="text-[9px] text-gray-400 font-normal lowercase">(increases advance paid)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Amount (₹)"
                        value={quickAdvanceInput}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          if (raw === '') {
                            setQuickAdvanceInput('');
                          } else {
                            const clean = raw.replace(/^0+(?=\d)/, '');
                            setQuickAdvanceInput(clean === '' ? '' : Number(clean));
                          }
                        }}
                        className="w-24 bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold text-gray-900 focus:ring-1 focus:ring-indigo-500 min-h-[36px]"
                      />
                      <select
                        value={quickAdvanceMethod}
                        onChange={(e) => setQuickAdvanceMethod(e.target.value as any)}
                        className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-semibold text-gray-700 focus:ring-1 focus:ring-indigo-500 min-h-[36px] cursor-pointer"
                      >
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="upi">UPI</option>
                        <option value="net_banking">Net Banking</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleQuickAddAdvance}
                        disabled={!quickAdvanceInput || Number(quickAdvanceInput) <= 0 || isSubmitting}
                        className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-2xs transition disabled:opacity-40 min-h-[36px] cursor-pointer"
                      >
                        Add Advance
                      </button>
                    </div>
                  </div>
                )}

                {/* Payment History List */}
                {bookingTransactions.length > 0 && (
                  <div className="pt-2 border-t border-gray-150 space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase text-gray-500 block">
                      Payment Transactions ({bookingTransactions.length})
                    </span>
                    <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                      {bookingTransactions.map((tx) => (
                        <div key={tx.id} className="p-1.5 bg-gray-50 border border-gray-150 rounded-lg flex items-center justify-between text-xs">
                          <div>
                            <span className="font-extrabold text-gray-800">{formatDateHuman(tx.created_at)}</span>
                            <span className="text-gray-500 block text-[10px] font-medium">
                              {tx.remarks || 'Payment'} ({tx.payment_method?.toUpperCase() || 'CASH'})
                            </span>
                          </div>
                          <span className="font-black text-emerald-700">₹{Number(tx.amount || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 4. ROOMS SECTION (Allocated Rooms) */}
              <div className="p-3 border border-gray-150 rounded-xl bg-white space-y-2">
                <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Allocated Rooms ({allocatedRoomsList.length})</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddRoomModalOpen(true);
                      setAddRoomSelectedNumbers([]);
                      setAddRoomErrorMsg(null);
                      setAddRoomCustomTotal('');
                    }}
                    className="px-2 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-bold text-[11px] rounded-lg transition cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Room</span>
                  </button>
                </div>
                <div className="space-y-1.5">
                  {allocatedRoomsList.map((roomBooking) => (
                    <div key={roomBooking.id} className="p-2 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between gap-2">
                      <div>
                        <span className="font-extrabold text-xs text-indigo-950">Room {roomBooking.roomNumber}</span>
                        <span className="text-[10px] text-gray-500 block font-medium">{getRoomConfig(roomBooking.roomNumber)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveReplaceStep({
                              roomBookingId: roomBooking.id,
                              guestName: loadedBooking?.guestName || 'Guest',
                              fromRoomNumber: roomBooking.roomNumber,
                              checkInDate: roomBooking.checkInDate || loadedBooking?.checkInDate || '',
                              checkOutDate: roomBooking.checkOutDate || loadedBooking?.checkOutDate || '',
                              bookingGroupId: loadedBooking?.bookingGroupId || loadedBooking?.id || roomBooking.id,
                            });
                            setPendingChain([]);
                            setConflictPrompt(null);
                            setIsChainReplaceMode(false);
                          }}
                          className="px-2 py-1 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold text-[11px] rounded-lg transition cursor-pointer flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Replace Room</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setReleaseConfirmTarget({ type: 'single', roomBooking })}
                          className="px-2 py-1 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold text-[11px] rounded-lg transition cursor-pointer"
                        >
                          Remove Room
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ROOM TIMELINE (HISTORY) */}
              <div className="p-3 border border-gray-150 rounded-xl bg-white space-y-2">
                <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                    Room Timeline
                  </span>
                </div>
                <div className="space-y-2">
                  {computedTimeline.map((seg, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="text-xs font-extrabold text-slate-800 flex items-center justify-between">
                        <span>
                          {formatDateHuman(seg.startDate)} → {formatDateHuman(seg.endDate)}
                        </span>
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-150">
                          {seg.rooms.length} {seg.rooms.length === 1 ? 'Room' : 'Rooms'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {seg.rooms.map((rn) => (
                          <span
                            key={rn}
                            className="px-2 py-0.5 bg-white border border-slate-250 text-slate-900 font-extrabold text-xs rounded-md shadow-2xs"
                          >
                            Room {rn}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 5. ACTIONS */}
              <div className="p-3 border border-gray-150 rounded-xl bg-white space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Actions</span>
                <div className="flex flex-wrap gap-1.5">
                  {loadedBooking.status === 'booked' && (
                    <button
                      type="button"
                      onClick={handleOpenCheckInModal}
                      disabled={isSubmitting}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-lg shadow-2xs transition cursor-pointer"
                    >
                      Check In
                    </button>
                  )}
                  {loadedBooking.status === 'checked-in' && (
                    <>
                      <button
                        type="button"
                        onClick={handleCheckoutGuest}
                        disabled={isSubmitting}
                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white font-extrabold text-xs rounded-lg shadow-2xs transition cursor-pointer"
                      >
                        Checkout & Close Room
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenContinueStay}
                        disabled={isSubmitting}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-lg shadow-2xs transition cursor-pointer flex items-center gap-1"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Continue Stay</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setReleaseConfirmTarget({ type: 'single', roomBooking: loadedBooking })}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold text-xs rounded-lg transition cursor-pointer"
                  >
                    Release This Room
                  </button>
                  {allocatedRoomsList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setReleaseConfirmTarget({ type: 'entire' })}
                      disabled={isSubmitting}
                      className="px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 font-bold text-xs rounded-lg transition cursor-pointer"
                    >
                      Release Entire Booking
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* NEW BOOKING FORM MODE */
            <form id="new_booking_form" onSubmit={handleSubmitNewBooking} className="space-y-3">
              {/* Row 1: Stay Dates */}
              <div className="space-y-1.5 pb-2.5 border-b border-gray-100 relative">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold tracking-wide text-gray-500 uppercase block">1. Stay Dates</label>
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer py-0.5"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {showDatePicker ? 'Close Calendar' : 'Calendar View'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 block mb-0.5">Check-In Date</label>
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
                      className="w-full rounded-xl border border-gray-200 bg-white p-2 text-xs font-bold text-gray-900 focus:ring-1 focus:ring-indigo-500 min-h-[40px]"
                    />
                    {checkInDate && (
                      <span className="text-[10px] text-indigo-600 font-extrabold block mt-0.5">
                        {formatDateHuman(checkInDate)}
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 block mb-0.5">Check-Out Date</label>
                    <input
                      type="date"
                      required
                      value={checkOutDate}
                      min={checkInDate}
                      onChange={(e) => setCheckOutDate(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white p-2 text-xs font-bold text-gray-900 focus:ring-1 focus:ring-indigo-500 min-h-[40px]"
                    />
                    {checkOutDate && (
                      <span className="text-[10px] text-indigo-600 font-extrabold block mt-0.5">
                        {formatDateHuman(checkOutDate)}
                      </span>
                    )}
                  </div>
                </div>

                {showDatePicker && (
                  <div className="fixed sm:absolute inset-x-3 sm:inset-x-0 top-16 sm:top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl p-3 z-50 animate-fade-in max-w-[320px] mx-auto">
                    <div className="flex justify-between items-center pb-2 mb-2 border-b border-gray-100 select-none">
                      <span className="text-xs font-bold tracking-wide text-gray-700 uppercase block">Select Stay Range</span>
                      <button
                        type="button"
                        onClick={() => setShowDatePicker(false)}
                        className="text-xs font-black text-gray-400 hover:text-gray-700 cursor-pointer h-6 w-6 flex items-center justify-center p-0 rounded-full hover:bg-gray-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between mb-2 select-none gap-1">
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        className="p-1 rounded-lg hover:bg-gray-100 text-gray-650 font-black cursor-pointer text-xs min-h-[32px] min-w-[32px] flex items-center justify-center"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="flex items-center gap-1">
                        <select
                          value={currentMonth}
                          onChange={(e) => setCurrentMonth(parseInt(e.target.value, 10))}
                          className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold text-gray-700 cursor-pointer"
                        >
                          {monthsList.map((m, idx) => (
                            <option key={m} value={idx}>{m.substring(0, 3)}</option>
                          ))}
                        </select>
                        <select
                          value={currentYear}
                          onChange={(e) => setCurrentYear(parseInt(e.target.value, 10))}
                          className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold text-gray-700 cursor-pointer"
                        >
                          {[2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={handleNextMonth}
                        className="p-1 rounded-lg hover:bg-gray-100 text-gray-650 font-black cursor-pointer text-xs min-h-[32px] min-w-[32px] flex items-center justify-center"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold text-gray-400 uppercase font-mono mb-1 select-none">
                      <div>Su</div>
                      <div>Mo</div>
                      <div>Tu</div>
                      <div>We</div>
                      <div>Th</div>
                      <div>Fr</div>
                      <div>Sa</div>
                    </div>

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
                            cellStyle = "bg-gray-100 border border-gray-300 text-gray-900 font-extrabold rounded-full";
                          }

                          cells.push(
                            <button
                              key={`day-${day}`}
                              type="button"
                              onClick={() => handleDaySelect(dateObj)}
                              onMouseEnter={() => handleDayHover(dateObj)}
                              onMouseLeave={() => handleDayHover(null)}
                              className={`aspect-square min-h-[32px] text-xs font-semibold flex items-center justify-center transition-all duration-100 cursor-pointer ${cellStyle}`}
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
              <div className="space-y-1.5 pb-2.5 border-b border-gray-100">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold tracking-wide text-gray-500 uppercase block">2. Room Selection</span>
                  <div className="text-[10px] font-bold tracking-wide text-gray-500 uppercase block">
                    Selected: <span className="text-indigo-650 font-black">{selectedRoomNumbers.length === 0 ? 'None' : selectedRoomNumbers.join(', ')}</span>
                  </div>
                </div>

                {!checkInDate || !checkOutDate ? (
                  <div className="text-center py-3 bg-slate-50 border border-dashed border-gray-200 rounded-xl">
                    <p className="text-xs font-bold text-gray-500">Please select check-in and check-out dates above</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5" id="available_rooms_grid">
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
                          className={`min-h-[40px] p-2 rounded-xl border font-bold text-xs text-center transition-all duration-150 cursor-pointer flex items-center justify-center active:scale-95 select-none ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-700 text-white shadow-2xs font-extrabold ring-2 ring-indigo-400'
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

              {/* Row 3: Guest Name */}
              <div className="relative">
                <label className="text-[10px] font-bold tracking-wide text-gray-500 uppercase block mb-1">
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
                    className="w-full rounded-xl border border-gray-200 bg-white p-2.5 pr-9 text-xs font-semibold text-gray-900 focus:ring-1 focus:ring-indigo-500 min-h-[42px]"
                  />
                  <button
                    type="button"
                    onClick={() => setIsNameDropdownOpen(!isNameDropdownOpen)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
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
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 max-h-40 overflow-y-auto py-1">
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
                            className="w-full text-left px-3 py-2 text-xs font-bold text-gray-800 hover:bg-indigo-50 hover:text-indigo-700 transition cursor-pointer flex items-center justify-between"
                          >
                            <span>{name}</span>
                            {guestName === name && <Check className="w-4 h-4 text-indigo-600" />}
                          </button>
                        ))}
                    </div>
                  </>
                )}
              </div>

              {/* Row 4: Financial Inputs */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold tracking-wide text-gray-500 uppercase block mb-0.5">
                    Total Amount (₹)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={totalAmount === '' ? '' : totalAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      if (raw === '') {
                        setTotalAmount('');
                      } else {
                        const clean = raw.replace(/^0+(?=\d)/, '');
                        setTotalAmount(clean === '' ? '' : Number(clean));
                      }
                    }}
                    placeholder="Enter amount"
                    className="w-full rounded-xl border border-gray-200 bg-white p-2 text-xs font-bold text-gray-900 focus:ring-1 focus:ring-indigo-500 min-h-[42px]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-wide text-gray-500 uppercase block mb-0.5">
                    Advance Paid (₹)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={advancePaid === '' ? '' : advancePaid}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      if (raw === '') {
                        setAdvancePaid('');
                      } else {
                        const clean = raw.replace(/^0+(?=\d)/, '');
                        setAdvancePaid(clean === '' ? '' : Number(clean));
                      }
                    }}
                    placeholder="Enter amount"
                    className="w-full rounded-xl border border-gray-200 bg-white p-2 text-xs font-bold text-gray-900 focus:ring-1 focus:ring-indigo-500 min-h-[42px]"
                  />
                </div>
              </div>

              {/* Row 5: Remarks */}
              <div>
                <label className="text-[10px] font-bold tracking-wide text-gray-500 uppercase block mb-0.5">
                  Remarks <span className="text-gray-400 font-normal lowercase">(optional)</span>
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Early check-in requested, extra bed"
                  className="w-full rounded-xl border border-gray-200 bg-white p-2 text-xs font-medium text-gray-900 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Save New Booking Button */}
              <div className="flex gap-2 justify-end border-t border-gray-100 pt-3 mt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-md transition cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 min-h-[44px]"
                >
                  {isSubmitting ? 'Saving...' : 'Save Booking'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* MODAL FOR EDITING GUEST INFO */}
      {isEditingGuest && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/60 backdrop-blur-2xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-xs w-full p-4 shadow-2xl border border-gray-200 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h4 className="font-extrabold text-xs text-gray-900 uppercase">Edit Guest Info</h4>
              <button
                type="button"
                onClick={() => setIsEditingGuest(false)}
                className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2.5 text-xs">
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400 block mb-0.5">Guest Name</label>
                <input
                  type="text"
                  required
                  value={editGuestName}
                  onChange={(e) => setEditGuestName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-2 text-xs font-bold text-gray-900 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400 block mb-0.5">Remarks</label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  placeholder="Remarks..."
                  className="w-full rounded-xl border border-gray-200 p-2 text-xs font-medium text-gray-900 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsEditingGuest(false)}
                className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveGuestEdit}
                disabled={isSubmitting || !editGuestName.trim()}
                className="px-4 py-1.5 text-xs font-extrabold bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg shadow-2xs cursor-pointer disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FOR EDITING TOTAL AMOUNT */}
      {isEditingTotal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/60 backdrop-blur-2xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-xs w-full p-4 shadow-2xl border border-gray-200 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h4 className="font-extrabold text-xs text-gray-900 uppercase">Edit Total Amount</h4>
              <button
                type="button"
                onClick={() => setIsEditingTotal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <label className="text-[10px] font-bold uppercase text-gray-400 block mb-0.5">Total Amount (₹)</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                value={editTotalInput === '' ? '' : editTotalInput}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  if (raw === '') {
                    setEditTotalInput('');
                  } else {
                    const clean = raw.replace(/^0+(?=\d)/, '');
                    setEditTotalInput(clean === '' ? '' : Number(clean));
                  }
                }}
                placeholder="Enter amount"
                className="w-full rounded-xl border border-gray-200 p-2 text-xs font-bold text-gray-900 focus:ring-1 focus:ring-indigo-500"
              />
              <div className="text-[10px] text-gray-500 font-medium">
                New Balance will automatically recalculate as: ₹{Math.max(0, (Number(editTotalInput) || 0) - (loadedBooking?.advancePaid || 0)).toLocaleString()}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsEditingTotal(false)}
                className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTotalAmountEdit}
                disabled={isSubmitting || editTotalInput === ''}
                className="px-4 py-1.5 text-xs font-extrabold bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg shadow-2xs cursor-pointer disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG FOR RELEASING ROOM */}
      {releaseConfirmTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/60 backdrop-blur-2xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-xs w-full p-4 shadow-2xl border border-gray-200 space-y-3">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-xs text-gray-900 uppercase">
                  {releaseConfirmTarget.type === 'entire' ? 'Release Entire Booking?' : 'Release This Room?'}
                </h4>
              </div>
            </div>
            <p className="text-xs font-medium text-gray-600 leading-relaxed">
              {releaseConfirmTarget.type === 'entire'
                ? 'This will cancel all allocated rooms for this booking.'
                : 'This will remove only this room from the booking.'}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setReleaseConfirmTarget(null)}
                className="px-3.5 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRelease}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-black bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-2xs cursor-pointer disabled:opacity-40"
              >
                {releaseConfirmTarget.type === 'entire' ? 'Release All' : 'Release'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTION PROMPT DIALOG FOR CONFLICTING ALLOCATION */}
      {conflictPrompt && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-3 bg-black/60 backdrop-blur-2xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-xs w-full p-4 shadow-2xl border border-gray-200 space-y-3">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
              <div className="p-1.5 bg-amber-50 text-amber-700 rounded-lg">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <h4 className="font-extrabold text-xs text-gray-900 uppercase">Conflicting Allocation</h4>
            </div>
            <div className="text-xs font-medium text-gray-700 leading-relaxed">
              Room <span className="font-extrabold text-gray-900">{conflictPrompt.targetRoomNumber}</span> is currently allocated to{' '}
              <span className="font-extrabold text-indigo-700">{conflictPrompt.conflictingBooking.guestName}</span>.
            </div>
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Choose an action</div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleSwitchRooms}
                disabled={isSubmitting}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-2xs cursor-pointer transition text-center"
              >
                Switch Rooms
              </button>
              <button
                type="button"
                onClick={handleChainReplaceRoom}
                disabled={isSubmitting}
                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow-2xs cursor-pointer transition text-center"
              >
                Replace Room
              </button>
            </div>
            <div className="text-right pt-1 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setConflictPrompt(null)}
                className="text-xs font-bold text-gray-500 hover:text-gray-800 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FOR ADVANCED ROOM REPLACEMENT */}
      {activeReplaceStep && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/60 backdrop-blur-2xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-4 shadow-2xl border border-gray-200 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <div className="flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-indigo-600" />
                <div>
                  <h4 className="font-extrabold text-xs text-gray-900 uppercase">
                    Replace Room {activeReplaceStep.fromRoomNumber}
                  </h4>
                  <div className="text-[10px] font-bold text-indigo-600">
                    Guest: <span className="text-gray-900 font-extrabold">{activeReplaceStep.guestName}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveReplaceStep(null);
                  setPendingChain([]);
                  setConflictPrompt(null);
                  setIsChainReplaceMode(false);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {/* Color Legend */}
              <div className="flex items-center justify-center gap-3 text-[10px] font-bold text-gray-700 py-1.5 bg-gray-50 rounded-xl border border-gray-200 select-none">
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-amber-400 border border-amber-500 inline-block shrink-0" />
                  <span>Yellow: Current</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-red-600 border border-red-700 inline-block shrink-0" />
                  <span>Red: Allocated</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-white border border-gray-300 inline-block shrink-0" />
                  <span>White: Available</span>
                </div>
              </div>

              {/* Pending Chain Summary */}
              {pendingChain.length > 0 && (
                <div className="p-2 bg-indigo-50 border border-indigo-150 rounded-xl space-y-1">
                  <div className="text-[10px] font-extrabold uppercase text-indigo-800">
                    Pending Reassignments ({pendingChain.length}):
                  </div>
                  {pendingChain.map((p, idx) => (
                    <div key={idx} className="text-[11px] font-bold text-indigo-900 flex items-center justify-between">
                      <span>{p.guestName}</span>
                      <span className="font-mono">{p.fromRoomNumber} → {p.toRoomNumber}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-[10px] font-bold uppercase text-gray-400 block pt-0.5">
                Select replacement room for {activeReplaceStep.guestName}:
              </div>

              {/* Room Grid */}
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 max-h-56 overflow-y-auto p-1.5 bg-gray-50 rounded-xl border border-gray-150">
                {roomsList.map((room) => {
                  const num = room.number;
                  const status = getRoomReplacementStatus(num);

                  let btnStyle = '';
                  let labelText = getRoomConfig(num);
                  let isDisabled = false;

                  if (status.type === 'current') {
                    btnStyle = 'bg-amber-400 text-amber-950 border-amber-500 font-extrabold cursor-not-allowed opacity-90 shadow-2xs';
                    labelText = 'Current';
                    isDisabled = true;
                  } else if (status.type === 'disabled_same_booking') {
                    btnStyle = 'bg-gray-100 border-gray-200 text-gray-400 line-through cursor-not-allowed opacity-50';
                    labelText = 'Owned';
                    isDisabled = true;
                  } else if (status.type === 'allocated') {
                    btnStyle = 'bg-red-600 hover:bg-red-700 text-white border-red-700 font-black shadow-2xs';
                    labelText = status.booking ? status.booking.guestName : 'Allocated';
                    isDisabled = false;
                  } else {
                    btnStyle = 'bg-white hover:bg-indigo-50 text-gray-900 border-gray-300 hover:border-indigo-400 font-extrabold shadow-2xs';
                    labelText = getRoomConfig(num);
                    isDisabled = false;
                  }

                  return (
                    <button
                      key={num}
                      type="button"
                      disabled={isDisabled || isSubmitting}
                      onClick={() => handleSelectRoomForReplacement(num)}
                      title={
                        status.type === 'allocated' && status.booking
                          ? `Allocated to ${status.booking.guestName}`
                          : status.type === 'disabled_same_booking'
                          ? `Already owned by ${activeReplaceStep.guestName}`
                          : `Room ${num}`
                      }
                      className={`min-h-[44px] p-1 rounded-xl border text-xs text-center transition-all duration-150 cursor-pointer flex flex-col items-center justify-center select-none ${btnStyle}`}
                    >
                      <span className="font-extrabold">{num}</span>
                      <span className="text-[8px] font-bold leading-none opacity-90 mt-0.5 truncate max-w-[52px]">
                        {labelText}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setActiveReplaceStep(null);
                  setPendingChain([]);
                  setConflictPrompt(null);
                  setIsChainReplaceMode(false);
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              {isSubmitting && (
                <span className="text-xs font-bold text-indigo-600 animate-pulse">Processing...</span>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Check-In Payment Modal */}
      {isCheckInModalOpen && loadedBooking && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden text-slate-900 animate-scale-up">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3.5 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  Check-In Payment & Wallet Assignment
                </h3>
                <p className="text-[11px] text-blue-100 font-medium">
                  {loadedBooking.guestName} • Room #{loadedBooking.roomNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckInModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmCheckInWithPayment} className="p-4 space-y-4 text-xs">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-150">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Room Total</span>
                  <span className="text-base font-black text-slate-900">₹{loadedBooking.totalAmount.toLocaleString()}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-150">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Advance Paid</span>
                  <span className="text-base font-black text-emerald-600">₹{loadedBooking.advancePaid.toLocaleString()}</span>
                </div>
              </div>

              {/* Customer Paid Now Input */}
              <div>
                <label className="font-bold text-slate-700 uppercase block mb-1 text-[10px]">
                  Customer Paid Now (at Check-In)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 font-bold text-slate-400">₹</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={checkInPaidNowInput === '' ? '' : checkInPaidNowInput}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      if (raw === '') {
                        setCheckInPaidNowInput('');
                      } else {
                        const clean = raw.replace(/^0+(?=\d)/, '');
                        setCheckInPaidNowInput(clean === '' ? '' : Number(clean));
                      }
                    }}
                    placeholder="Enter amount paid"
                    className="w-full rounded-xl border border-slate-200 pl-7 pr-3 py-2.5 font-black text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                  />
                </div>
              </div>

              {/* Remaining Balance Calculation */}
              {(() => {
                const paidNow = Number(checkInPaidNowInput || 0);
                const remaining = Math.max(0, loadedBooking.totalAmount - (loadedBooking.advancePaid + paidNow));
                return (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 flex items-center justify-between">
                      <span className="font-extrabold text-amber-900">Remaining Balance Dues</span>
                      <span className="text-base font-black text-amber-700">₹{remaining.toLocaleString()}</span>
                    </div>

                    {/* Wallet Options for Remaining Balance */}
                    {remaining > 0 && (
                      <div className="space-y-2 pt-1">
                        <label className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider block">
                          Assign Remaining Balance (₹{remaining.toLocaleString()})
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {/* Option 1: Irshad Wallet */}
                          <label
                            className={`p-3 rounded-xl border-2 flex items-start gap-2.5 cursor-pointer transition ${
                              transferToIrshad
                                ? 'border-purple-600 bg-purple-50'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={transferToIrshad}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setTransferToIrshad(checked);
                                if (checked) setBalanceDueWallet(false);
                              }}
                              className="mt-0.5 w-4 h-4 text-purple-600 rounded border-purple-300 focus:ring-purple-500 cursor-pointer"
                            />
                            <div className="space-y-0.5">
                              <span className="font-black text-purple-900 text-xs block leading-tight">
                                Irshad Wallet
                              </span>
                              <p className="text-[10px] text-slate-600 font-medium leading-normal">
                                Assigns this remaining balance to Irshad's account ledger.
                              </p>
                            </div>
                          </label>

                          {/* Option 2: Balance Due Wallet */}
                          <label
                            className={`p-3 rounded-xl border-2 flex items-start gap-2.5 cursor-pointer transition ${
                              balanceDueWallet
                                ? 'border-amber-600 bg-amber-50'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={balanceDueWallet}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setBalanceDueWallet(checked);
                                if (checked) setTransferToIrshad(false);
                              }}
                              className="mt-0.5 w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                            />
                            <div className="space-y-0.5">
                              <span className="font-black text-amber-900 text-xs block leading-tight">
                                Balance Due Wallet
                              </span>
                              <p className="text-[10px] text-slate-600 font-medium leading-normal">
                                Keep this remaining balance as customer outstanding due.
                              </p>
                            </div>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCheckInModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 font-bold text-slate-700 rounded-xl hover:bg-slate-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-2xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Checking In...' : 'Confirm Check-In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD EXTRA ROOM MODAL */}
      {isAddRoomModalOpen && loadedBooking && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-gray-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-600" />
                  Add Extra Room(s)
                </h3>
                <p className="text-xs text-gray-500 font-medium">
                  Guest: <span className="font-extrabold text-gray-900">{loadedBooking.guestName}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddRoomModalOpen(false);
                  setAddRoomSelectedNumbers([]);
                  setAddRoomErrorMsg(null);
                }}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {addRoomErrorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{addRoomErrorMsg}</span>
              </div>
            )}

            {/* Dates info */}
            <div className="p-2.5 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs flex items-center justify-between font-bold text-indigo-950">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>Dates: {formatDateHuman(loadedBooking.checkInDate)} → {formatDateHuman(loadedBooking.checkOutDate)}</span>
              </div>
              <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold">
                {loadedBooking.status}
              </span>
            </div>

            <form onSubmit={handleAddRoomsSubmit} className="space-y-4">
              {/* Room Selection Grid */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold tracking-wide text-gray-500 uppercase block">
                    Select Available Rooms
                  </label>
                  <span className="text-xs font-extrabold text-indigo-600">
                    Selected ({addRoomSelectedNumbers.length}): {addRoomSelectedNumbers.length > 0 ? addRoomSelectedNumbers.join(', ') : 'None'}
                  </span>
                </div>

                {(() => {
                  const availableRooms = getAvailableRoomsForAdd();
                  if (availableRooms.length === 0) {
                    return (
                      <div className="text-center py-6 bg-slate-50 border border-dashed border-gray-200 rounded-xl">
                        <p className="text-xs font-bold text-gray-500">No available rooms found for these dates.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-48 overflow-y-auto p-1">
                      {availableRooms.map((room) => {
                        const isSelected = addRoomSelectedNumbers.includes(room.number);
                        return (
                          <button
                            key={room.number}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setAddRoomSelectedNumbers(addRoomSelectedNumbers.filter((n) => n !== room.number));
                              } else {
                                setAddRoomSelectedNumbers([...addRoomSelectedNumbers, room.number]);
                              }
                            }}
                            className={`p-2.5 rounded-xl border text-xs font-extrabold text-center transition-all cursor-pointer select-none active:scale-95 ${
                              isSelected
                                ? 'bg-indigo-600 border-indigo-700 text-white shadow-2xs ring-2 ring-indigo-400'
                                : 'bg-white hover:bg-indigo-50 border-gray-200 text-gray-800'
                            }`}
                          >
                            <div>Room {room.number}</div>
                            <div className={`text-[9px] font-medium ${isSelected ? 'text-indigo-100' : 'text-gray-400'}`}>
                              {getRoomConfig(room.number)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Financial Recalculation Preview */}
              {addRoomSelectedNumbers.length > 0 && (() => {
                const oldRoomCount = allocatedRoomsList.length;
                const currentTotal = loadedBooking.totalAmount || 0;
                const avgPricePerRoom = oldRoomCount > 0 ? Math.round(currentTotal / oldRoomCount) : 0;
                const addedCount = addRoomSelectedNumbers.length;
                const autoCalculatedTotal = currentTotal + (avgPricePerRoom * addedCount);
                const activeNewTotal = addRoomCustomTotal !== '' ? Number(addRoomCustomTotal) : autoCalculatedTotal;
                const advancePaid = loadedBooking.advancePaid || 0;
                const newRemaining = Math.max(0, activeNewTotal - advancePaid);

                return (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 block">
                      Updated Summary Preview
                    </span>

                    <div className="grid grid-cols-2 gap-2 text-xs font-medium text-gray-700">
                      <div>Current Rooms: <span className="font-extrabold text-gray-900">{oldRoomCount}</span></div>
                      <div>New Room Count: <span className="font-extrabold text-indigo-600">{oldRoomCount + addedCount}</span></div>
                      <div>Already Collected: <span className="font-extrabold text-emerald-600">₹{advancePaid.toLocaleString()}</span></div>
                      <div>New Remaining: <span className="font-extrabold text-rose-600">₹{newRemaining.toLocaleString()}</span></div>
                    </div>

                    <div className="pt-2 border-t border-gray-200">
                      <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                        Recalculated Total Booking Amount (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={addRoomCustomTotal === '' ? autoCalculatedTotal : addRoomCustomTotal}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAddRoomCustomTotal(val === '' ? '' : Number(val));
                        }}
                        className="w-full rounded-xl border border-gray-200 bg-white p-2 text-xs font-black text-gray-900 focus:ring-1 focus:ring-indigo-500"
                      />
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">
                        Auto-calculated from average room rate (₹{avgPricePerRoom.toLocaleString()}/room). You can adjust this total if needed.
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddRoomModalOpen(false);
                    setAddRoomSelectedNumbers([]);
                    setAddRoomErrorMsg(null);
                  }}
                  className="flex-1 py-2.5 border border-gray-200 font-bold text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || addRoomSelectedNumbers.length === 0}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-2xs cursor-pointer text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Adding Room(s)...' : `Confirm & Add ${addRoomSelectedNumbers.length} Room(s)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* STAY EXTENSION MODAL DIALOG */}
      {isContinueStayOpen && loadedBooking && (
        <div className="fixed inset-0 z-90 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-100 text-indigo-800 rounded-xl">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Stay Extension</h3>
                  <span className="text-[11px] text-slate-500 block font-medium">
                    Current Checkout: {formatDateHuman(loadedBooking.checkOutDate)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsContinueStayOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {continueStayError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{continueStayError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 block">
                Choose New Checkout Date
              </label>
              <input
                type="date"
                value={extensionNewCheckOutDate}
                min={addDaysYMD(loadedBooking.checkOutDate, 1)}
                onChange={(e) => {
                  setExtensionNewCheckOutDate(e.target.value);
                  setContinueStayError(null);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={handleExecuteStayExtension}
                disabled={isSubmitting || !extensionNewCheckOutDate}
                className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-extrabold text-xs rounded-xl shadow-md transition disabled:opacity-40 cursor-pointer text-center"
              >
                {isSubmitting ? 'Extending...' : 'Extend Stay'}
              </button>
              <button
                type="button"
                onClick={() => setIsContinueStayOpen(false)}
                className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPLACE ROOMS FOR EXTENSION MODAL DIALOG */}
      {isExtensionRoomModalOpen && loadedBooking && (
        <div className="fixed inset-0 z-90 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">REPLACE ROOM FOR EXTENSION</h3>
                  <span className="text-xs text-slate-500 font-medium block">
                    Guest: {loadedBooking.guestName || 'Guest'} • Extension: {loadedBooking.checkOutDate?.split('T')[0]} → {extensionTargetNewCheckOut}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExtensionRoomModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-amber-900 text-xs font-medium space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-950">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>Some rooms are unavailable for the extended dates.</span>
              </div>
              <p className="text-[11px] text-amber-800">
                Available rooms remain selected. Please choose a replacement for unavailable rooms.
              </p>
            </div>

            <div className="space-y-3">
              {extensionRoomItems.map((item, idx) => {
                const oldCheckOut = (loadedBooking.checkOutDate || '').split('T')[0].trim();
                const targetResId = String(loadedBooking.bookingGroupId || loadedBooking.id);

                // Find valid available replacement rooms
                const selectedOthers = extensionRoomItems
                  .filter((_, i) => i !== idx)
                  .map((i) => i.selectedRoomNumber)
                  .filter((num): num is number => num !== null);

                const validReplacements = roomsList.filter((r) => {
                  // Must not be currently selected for another item in this modal
                  if (selectedOthers.includes(r.number)) return false;
                  // Must be available for the extension date range
                  const isOccupied = checkOverlappingBooking(
                    r.number,
                    oldCheckOut,
                    extensionTargetNewCheckOut!,
                    targetResId
                  );
                  return !isOccupied;
                });

                return (
                  <div
                    key={item.originalRoomNumber}
                    className={`p-3.5 rounded-xl border text-xs space-y-2 transition ${
                      item.isAvailable
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                        <span>Original Room {item.originalRoomNumber}</span>
                      </div>
                      {item.isAvailable ? (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[10px] uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Available / Selected
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-extrabold text-[10px] uppercase tracking-wider flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          Needs Replacement
                        </span>
                      )}
                    </div>

                    {item.isAvailable ? (
                      <p className="text-[11px] text-emerald-700 font-medium">
                        Room {item.originalRoomNumber} is available and remains allocated for the extension period.
                      </p>
                    ) : (
                      <div className="space-y-1.5 pt-1">
                        <label className="text-[11px] font-bold text-slate-700 block">
                          Select Replacement Room:
                        </label>
                        <select
                          value={item.selectedRoomNumber || ''}
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : null;
                            setExtensionRoomItems((prev) =>
                              prev.map((curr, i) =>
                                i === idx ? { ...curr, selectedRoomNumber: val } : curr
                              )
                            );
                          }}
                          className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          <option value="">-- Select Available Room --</option>
                          {validReplacements.map((r) => (
                            <option key={r.number} value={r.number}>
                              Room {r.number} ({r.type} • ₹{r.price}/night)
                            </option>
                          ))}
                        </select>
                        {item.selectedRoomNumber === null && (
                          <span className="text-[10px] font-bold text-rose-600 block">
                            No replacement selected yet.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Actions */}
            {(() => {
              const allReplaced = extensionRoomItems.every(
                (item) => item.selectedRoomNumber !== null
              );

              return (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      const chosen = extensionRoomItems
                        .map((item) => item.selectedRoomNumber!)
                        .filter(Boolean);
                      setExtensionSelectedRooms(chosen);
                      setIsExtensionRoomModalOpen(false);
                      setIsStayExtensionPaymentOpen(true);
                    }}
                    disabled={!allReplaced}
                    className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-extrabold text-xs rounded-xl shadow-md transition disabled:opacity-40 cursor-pointer text-center"
                  >
                    Next: Payment →
                  </button>
                  {!allReplaced && (
                    <p className="text-[11px] font-semibold text-rose-600 text-center">
                      Please select a replacement for all unavailable rooms to continue.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsExtensionRoomModalOpen(false)}
                    className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer text-center"
                  >
                    Cancel
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* STAY EXTENSION PAYMENT MODAL DIALOG */}
      {isStayExtensionPaymentOpen && loadedBooking && (
        <div className="fixed inset-0 z-90 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">STAY EXTENSION PAYMENT</h3>
                  <span className="text-xs text-slate-500 font-medium block">
                    Guest: {loadedBooking.guestName || 'Guest'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsStayExtensionPaymentOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {continueStayError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{continueStayError}</span>
              </div>
            )}

            {/* Previous Booking Section */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Previous Booking Summary
              </span>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <div className="text-[9px] font-bold uppercase text-slate-500">Previous Booking</div>
                  <div className="text-xs font-black text-slate-900 mt-0.5">
                    ₹{(loadedBooking.totalAmount || 0).toLocaleString()}
                  </div>
                </div>
                <div className="bg-emerald-50/70 p-2 rounded-lg border border-emerald-200">
                  <div className="text-[9px] font-bold uppercase text-emerald-700">Already Paid</div>
                  <div className="text-xs font-black text-emerald-800 mt-0.5">
                    ₹{(loadedBooking.advancePaid || 0).toLocaleString()}
                  </div>
                </div>
                <div className="bg-rose-50/70 p-2 rounded-lg border border-rose-200">
                  <div className="text-[9px] font-bold uppercase text-rose-600">Remaining Due</div>
                  <div className="text-xs font-black text-rose-800 mt-0.5">
                    ₹{Math.max(0, (loadedBooking.totalAmount || 0) - (loadedBooking.advancePaid || 0)).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Editable Inputs Section */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-extrabold text-slate-800 block mb-1">
                    Extra Stay Amount (editable)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">₹</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={extensionExtraStayAmount}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        if (raw === '') setExtensionExtraStayAmount('');
                        else setExtensionExtraStayAmount(Number(raw));
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-7 pr-3 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-extrabold text-slate-800 block mb-1">
                    Payment Now
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">₹</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={extensionPaymentNow}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        if (raw === '') setExtensionPaymentNow('');
                        else setExtensionPaymentNow(Number(raw));
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-7 pr-3 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'cash', label: 'Cash' },
                    { id: 'upi', label: 'UPI' },
                    { id: 'card', label: 'Card' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setExtensionPaymentMethod(m.id as any)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer text-center ${
                        extensionPaymentMethod === m.id
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1">
                  Remarks <span className="text-[10px] text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={extensionPaymentRemarks}
                  onChange={(e) => setExtensionPaymentRemarks(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
                  placeholder="e.g. Stay Extension Payment"
                />
              </div>
            </div>

            {/* Updated Summary Section */}
            <div className="bg-indigo-50/80 border border-indigo-150 rounded-xl p-3.5 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 block">
                Updated Summary
              </span>

              {(() => {
                const prevTotal = Number(loadedBooking.totalAmount || 0);
                const prevPaid = Number(loadedBooking.advancePaid || 0);
                const extraAmt = Number(extensionExtraStayAmount || 0);
                const payNowAmt = Number(extensionPaymentNow || 0);

                const newTotal = prevTotal + extraAmt;
                const totalPaid = prevPaid + payNowAmt;
                const remainingDue = Math.max(0, newTotal - totalPaid);

                return (
                  <div className="space-y-1.5 text-xs font-medium text-slate-700">
                    <div className="flex items-center justify-between">
                      <span>Original Booking</span>
                      <span className="font-extrabold text-slate-900">₹{prevTotal.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-indigo-700 font-semibold">
                      <span>Extra Stay</span>
                      <span>+₹{extraAmt.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between font-extrabold text-slate-900 pt-1 border-t border-indigo-200/60">
                      <span>New Booking Total</span>
                      <span className="text-sm text-indigo-950">₹{newTotal.toLocaleString()}</span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span>Previously Paid</span>
                      <span className="font-extrabold text-slate-900">₹{prevPaid.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-emerald-700 font-semibold">
                      <span>Paid Now</span>
                      <span>+₹{payNowAmt.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between font-extrabold text-slate-900 pt-1 border-t border-indigo-200/60">
                      <span>Total Paid</span>
                      <span className="text-emerald-800">₹{totalPaid.toLocaleString()}</span>
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t border-indigo-200 text-sm font-extrabold">
                      <span className="text-slate-900">Remaining Due</span>
                      <span className={remainingDue > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                        ₹{remainingDue.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleFinalizeExtensionWithPayment}
                disabled={isSubmitting}
                className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-extrabold text-xs rounded-xl shadow-md transition disabled:opacity-40 cursor-pointer text-center"
              >
                {isSubmitting ? 'Confirming Extension...' : 'Confirm Extension'}
              </button>
              <button
                type="button"
                onClick={() => setIsStayExtensionPaymentOpen(false)}
                disabled={isSubmitting}
                className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
