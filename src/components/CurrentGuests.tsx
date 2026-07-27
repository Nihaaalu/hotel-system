import React, { useState, useEffect } from 'react';
import { Booking } from '../types';
import { BookingService } from '../services/dbServices';
import { Users, Phone, ArrowUpRight, DollarSign, Loader2, KeyRound } from 'lucide-react';

interface CurrentGuestsProps {
  onSelectBooking: (id: string) => void;
  refreshTrigger: number;
}

export default function CurrentGuests({ onSelectBooking, refreshTrigger }: CurrentGuestsProps) {
  const [stayingList, setStayingList] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const bList = await BookingService.getBookings();
      // "guests currently staying" -> bookings with status === 'checked-in'
      const staying = bList.filter((b) => b.status === 'checked-in');
      setStayingList(staying);
      setLoading(false);
    }
    load();
  }, [refreshTrigger]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-hidden" id="current_guests_panel">
      {/* Header */}
      <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Current Onsite Guests ({stayingList.length})</h2>
          <p className="text-xs text-gray-400 mt-1">Live active keys in rooms right now. Click on any record to record payment or checkout.</p>
        </div>
        <Users className="w-5 h-5 text-gray-400" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-xs text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
          Loading active guests...
        </div>
      ) : stayingList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400 gap-2">
          <KeyRound className="w-10 h-10 stroke-[1] text-gray-350" />
          <p className="font-semibold text-xs text-gray-700">No Guests checked-in right now</p>
          <p className="text-2xs max-w-xs leading-normal">
            All rooms are currently vacant or reserved for future dates. Complete a Check-In inside the Calendar Grid.
          </p>
        </div>
      ) : (
        /* Table Listing */
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px] text-xs">
            <thead>
              <tr className="bg-gray-50/80 text-gray-500 uppercase tracking-wider font-mono text-3xs border-b border-gray-100 font-semibold">
                <th className="py-3 px-5">Room</th>
                <th className="py-3 px-5">Guest Name</th>
                <th className="py-3 px-5">Phone Number</th>
                <th className="py-3 px-5">Check-In Date</th>
                <th className="py-3 px-5">Check-Out Date</th>
                <th className="py-3 px-5 text-right">Balance Due</th>
                <th className="py-3 px-5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-150">
              {stayingList.map((booking) => {
                const balance = Number(booking.totalAmount) - Number(booking.advancePaid);
                const hasPendingBalance = balance > 0;

                return (
                  <tr
                    key={booking.id}
                    onClick={() => onSelectBooking(booking.id)}
                    className="hover:bg-gray-50/50 cursor-pointer transition divide-x divide-transparent group duration-150"
                  >
                    {/* Room Badge */}
                    <td className="py-4 px-5">
                      <span className="inline-block px-3 py-1 bg-red-50 text-red-700 font-extrabold rounded-lg font-mono">
                        {booking.roomNumber}
                      </span>
                    </td>

                    {/* Guest Name */}
                    <td className="py-4 px-5 font-bold text-gray-900 group-hover:text-indigo-600 transition">
                      {booking.guestName}
                    </td>

                    {/* Phone Number */}
                    <td className="py-4 px-5 font-mono text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-gray-405" />
                        {booking.guestPhone}
                      </span>
                    </td>

                    {/* Checkin Date */}
                    <td className="py-4 px-5 text-gray-600">{booking.checkInDate}</td>

                    {/* Checkout Date */}
                    <td className="py-4 px-5 text-gray-650">{booking.checkOutDate}</td>

                    {/* Balance Due */}
                    <td className="py-4 px-5 text-right font-semibold">
                      <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold leading-none ${
                        hasPendingBalance
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        ₹{balance.toLocaleString()}
                      </span>
                    </td>

                    {/* Action button */}
                    <td className="py-4 px-5 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onSelectBooking(booking.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-indigo-600 hover:text-white rounded-lg font-semibold font-sans text-gray-600 transition"
                      >
                        Checkout Desk
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
