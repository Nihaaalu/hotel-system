import React, { useState, useEffect } from 'react';
import { Clock, LogOut, LogIn, ArrowRight } from 'lucide-react';
import { Booking } from '../types';
import { getISTDateStr } from '../utils/formatters';

interface ReminderModalProps {
  bookings: Booking[];
  onSelectBooking: (bookingId: string) => void;
  refreshTrigger: number;
}

interface GroupedReservation {
  resId: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  status: Booking['status'];
  roomNumbers: number[];
}

interface ActiveReminder {
  key: string;
  type: 'checkout' | 'checkin';
  resId: string;
  guestName: string;
  roomNumbers: number[];
  scheduledTime: string;
  title: string;
  questionText: string;
}

export default function ReminderModal({
  bookings,
  onSelectBooking,
  refreshTrigger,
}: ReminderModalProps) {
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());

  // Reset dismissed keys whenever Refresh button is pressed
  useEffect(() => {
    setDismissedKeys(new Set());
  }, [refreshTrigger]);

  const todayStr = getISTDateStr();
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const isAfter11AM = currentHour > 11 || (currentHour === 11 && currentMinute >= 0);
  const isAfter12PM = currentHour >= 12;

  // Group bookings by reservation ID
  const groupedMap = new Map<string, GroupedReservation>();

  for (const b of bookings) {
    if (b.status === 'cancelled') continue;

    const resId = b.bookingGroupId || b.id;
    const existing = groupedMap.get(resId);

    if (existing) {
      if (!existing.roomNumbers.includes(b.roomNumber)) {
        existing.roomNumbers.push(b.roomNumber);
      }
      // Status priority: if any is checked-in, reservation is checked-in
      if (b.status === 'checked-in') {
        existing.status = 'checked-in';
      }
    } else {
      groupedMap.set(resId, {
        resId,
        guestName: b.guestName || 'Guest',
        checkInDate: (b.checkInDate || '').split('T')[0].split(' ')[0].trim(),
        checkOutDate: (b.checkOutDate || '').split('T')[0].split(' ')[0].trim(),
        status: b.status,
        roomNumbers: [b.roomNumber],
      });
    }
  }

  const activeReminders: ActiveReminder[] = [];

  groupedMap.forEach((res) => {
    // 1. Checkout Reminder
    if (
      res.checkOutDate === todayStr &&
      isAfter11AM &&
      res.status !== 'checked-out' &&
      res.status !== 'cancelled'
    ) {
      const key = `checkout_${res.resId}`;
      if (!dismissedKeys.has(key)) {
        activeReminders.push({
          key,
          type: 'checkout',
          resId: res.resId,
          guestName: res.guestName,
          roomNumbers: res.roomNumbers.sort((a, b) => a - b),
          scheduledTime: 'Today 11:00 AM',
          title: "Today's Checkout Reminder",
          questionText: 'Has this guest checked out?',
        });
      }
    }

    // 2. Check-In Reminder
    if (
      res.checkInDate === todayStr &&
      isAfter12PM &&
      (res.status === 'booked' || (res.status as string) === 'reserved')
    ) {
      const key = `checkin_${res.resId}`;
      if (!dismissedKeys.has(key)) {
        activeReminders.push({
          key,
          type: 'checkin',
          resId: res.resId,
          guestName: res.guestName,
          roomNumbers: res.roomNumbers.sort((a, b) => a - b),
          scheduledTime: 'Today 12:00 PM',
          title: "Today's Check-In Reminder",
          questionText: 'Ready to Check In?',
        });
      }
    }
  });

  if (activeReminders.length === 0) {
    return null;
  }

  const currentReminder = activeReminders[0];

  const handleDismiss = () => {
    setDismissedKeys((prev) => new Set(prev).add(currentReminder.key));
  };

  const handleOpenBooking = () => {
    setDismissedKeys((prev) => new Set(prev).add(currentReminder.key));
    onSelectBooking(currentReminder.resId);
  };

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-fade-in">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-scale-up">
        {/* Header Badge */}
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div
            className={`p-2 rounded-xl flex items-center justify-center ${
              currentReminder.type === 'checkout'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-indigo-100 text-indigo-800'
            }`}
          >
            {currentReminder.type === 'checkout' ? (
              <LogOut className="w-5 h-5" />
            ) : (
              <LogIn className="w-5 h-5" />
            )}
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-900 tracking-tight">
              {currentReminder.title}
            </h3>
            {activeReminders.length > 1 && (
              <span className="text-[10px] font-bold text-slate-400">
                Reminder 1 of {activeReminders.length}
              </span>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="space-y-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
              Guest
            </span>
            <div className="text-sm font-black text-slate-900">
              {currentReminder.guestName}
            </div>
          </div>

          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
              Rooms
            </span>
            <div className="flex flex-wrap gap-1.5">
              {currentReminder.roomNumbers.map((rn) => (
                <span
                  key={rn}
                  className="px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-900 font-extrabold text-xs rounded-lg shadow-2xs"
                >
                  {rn}
                </span>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
              Scheduled {currentReminder.type === 'checkout' ? 'Checkout' : 'Check-In'}
            </span>
            <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{currentReminder.scheduledTime}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 text-xs font-black text-slate-800">
            {currentReminder.questionText}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleOpenBooking}
            className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>Open Booking</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer text-center"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
