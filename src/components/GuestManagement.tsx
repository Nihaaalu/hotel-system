import React, { useState, useEffect } from 'react';
import { Guest, Booking } from '../types';
import { GuestService, BookingService } from '../services/dbServices';
import { formatDateHuman } from '../utils/formatters';
import { Search, User, Phone, MapPin, FileCheck, History, Calendar, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';

export default function GuestManagement() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGuestId, setExpandedGuestId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const gList = await GuestService.getGuests();
      const bList = await BookingService.getBookings();
      setGuests(gList);
      setBookings(bList);
    }
    load();
  }, []);

  // Filter guests instantly
  const filteredGuests = guests.filter((g) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    // Search by Name, Phone
    const matchesNameOrPhone =
      g.name.toLowerCase().includes(query) || g.phone.includes(query) || g.idProof.toLowerCase().includes(query);

    // Search by Room Number
    const guestBookings = bookings.filter((b) => b.guestId === g.id);
    const matchesRoom = guestBookings.some((b) => String(b.roomNumber) === query);

    return matchesNameOrPhone || matchesRoom;
  });

  const getGuestHistory = (guestId: string) => {
    return bookings.filter((b) => b.guestId === guestId);
  };

  const toggleExpand = (id: string) => {
    setExpandedGuestId(expandedGuestId === id ? null : id);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-hidden" id="guest_management_panel">
      {/* Header with Search */}
      <div className="p-6 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/50">
        <div>
          <h2 className="text-lg font-bold text-gray-900">CRM Guest Ledger</h2>
          <p className="text-xs text-gray-400 mt-1">Search or inspect profile logs, booking timelines, and previous invoices of checked-in guests</p>
        </div>

        {/* Input search */}
        <div className="relative w-full md:max-w-xs shrink-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by Name, Phone, or Room..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl py-2 pl-10 pr-4 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-gray-400 text-gray-900 shrink-0"
          />
        </div>
      </div>

      {/* Guests Table */}
      {filteredGuests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
          <User className="w-12 h-12 stroke-[1] mb-2" />
          <p className="font-semibold text-xs text-gray-700">No Guests found</p>
          <p className="text-2xs max-w-xs mt-1">Refine your criteria or check the search query spelling.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {filteredGuests.map((guest) => {
            const history = getGuestHistory(guest.id);
            const isExpanded = expandedGuestId === guest.id;

            return (
              <div key={guest.id} className="transition" id={`guest-card-${guest.id}`}>
                {/* Main guest row summary */}
                <div
                  onClick={() => toggleExpand(guest.id)}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-gray-50/30 transition duration-150"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-700 font-extrabold text-sm flex items-center justify-center shrink-0">
                      {guest.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                        {guest.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-gray-500 mt-1">
                        <span className="flex items-center gap-1.5 font-mono">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          {guest.phone}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <FileCheck className="w-3.5 h-3.5 text-gray-400" />
                          Doc: {guest.idProof}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-auto">
                    <div className="text-right">
                      <span className="text-3xs font-semibold text-gray-400 font-mono block uppercase">Total Stays</span>
                      <span className="text-xs font-bold text-gray-700">{history.length} booking(s)</span>
                    </div>
                    <div className="p-1 rounded-lg border border-gray-100 hover:bg-gray-50 text-gray-400 transition">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Historial Booking details */}
                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 bg-gray-50/50 border-t border-gray-50 space-y-4">
                    {/* Residential Address detail */}
                    <div className="flex items-center gap-2 text-xs text-gray-600 bg-white p-3 rounded-xl border border-gray-100 max-w-lg">
                      <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                      <span><strong>Permanent Home Address:</strong> {guest.address || 'Address is not recorded in files'}</span>
                    </div>

                    {/* Booking list */}
                    <div className="space-y-3">
                      <h4 className="text-2xs font-extrabold text-gray-400 uppercase font-mono tracking-wider flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5" />
                        Complete Booking Logs Timeline
                      </h4>

                      {history.length === 0 ? (
                        <p className="text-2xs text-gray-400 italic font-medium ml-5">No previous bookings found for this customer profile.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {history.map((booking) => (
                            <div
                              key={booking.id}
                              className="bg-white border border-gray-100 p-4 rounded-xl space-y-3 shadow-3xs"
                            >
                              <div className="flex justify-between items-center pb-2 border-b border-gray-50">
                                <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-2xs font-extrabold rounded font-mono">
                                  ROOM {booking.roomNumber}
                                </span>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-3xs font-extrabold rounded ${
                                  booking.status === 'booked'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : booking.status === 'checked-in'
                                    ? 'bg-red-50 text-red-700 border border-red-200'
                                    : booking.status === 'cancelled'
                                    ? 'bg-red-55 border border-red-200 text-red-650'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {booking.status === 'cancelled' ? 'CANCELLED' : booking.status.toUpperCase()}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-2xs text-gray-500">
                                <div>
                                  <span className="block font-medium">Check-In Date</span>
                                  <span className="font-semibold text-gray-800">{formatDateHuman(booking.checkInDate)}</span>
                                </div>
                                <div>
                                  <span className="block font-medium">Check-Out Date</span>
                                  <span className="font-semibold text-gray-800">{formatDateHuman(booking.checkOutDate)}</span>
                                </div>
                              </div>

                              <div className="text-2xs flex justify-between bg-gray-50 p-2 rounded-lg font-mono">
                                <div>
                                  <span className="block font-normal text-gray-450">Charge</span>
                                  <span className="font-extrabold text-gray-700">₹{booking.totalAmount.toLocaleString()}</span>
                                </div>
                                <div className="text-right">
                                  <span className="block font-normal text-gray-450">Paid</span>
                                  <span className="font-extrabold text-green-700">₹{booking.advancePaid.toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
