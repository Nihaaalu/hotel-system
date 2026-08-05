import React, { useState } from 'react';
import { X, Utensils, Waves, Flame, Sparkles, Loader2 } from 'lucide-react';
import { Booking } from '../types';
import { useHotelData } from '../context/HotelContext';

interface FoodActivityBillModalProps {
  bookingId?: string | null;
  bookings?: Booking[];
  onClose: () => void;
  onSuccess?: () => void;
}

export default function FoodActivityBillModal({
  bookingId,
  bookings = [],
  onClose,
  onSuccess,
}: FoodActivityBillModalProps) {
  const { addServiceBill } = useHotelData();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Customer Type State
  const [customerType, setCustomerType] = useState<'resort_guest' | 'outside_customer'>('resort_guest');

  // Filter ONLY occupied / active bookings (not checked-out or cancelled)
  const activeBookings = bookings.filter(
    (b) => b.status !== 'checked-out' && b.status !== 'cancelled'
  );

  // Selected Booking State
  const [selectedBookingId, setSelectedBookingId] = useState<string>(() => {
    if (bookingId) return bookingId;
    return activeBookings[0]?.id || '';
  });

  // Outside Customer Fields
  const [outsideCustomerName, setOutsideCustomerName] = useState<string>('');
  const [outsideCustomerPhone, setOutsideCustomerPhone] = useState<string>('');

  // 2. Category Chips State ('Food' | 'Swimming Pool' | 'Campfire' | 'Other')
  const [category, setCategory] = useState<'Food' | 'Swimming Pool' | 'Campfire' | 'Other'>('Food');

  // 3. Simple Charges State
  const [totalCharge, setTotalCharge] = useState<number | ''>('');
  const [paidNow, setPaidNow] = useState<number | ''>('');

  // 4. Payment Method & Balance Logic
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Bank' | 'Card'>('Cash');
  const [balanceOption, setBalanceOption] = useState<'due' | 'irshad_wallet'>('due');

  // Remarks
  const [remarks, setRemarks] = useState<string>('');

  // Derived Calculations
  const totalVal = Math.max(0, Number(totalCharge || 0));
  const paidVal = Math.min(totalVal, Math.max(0, Number(paidNow || 0)));
  const balance = Math.max(0, totalVal - paidVal);

  // Derived Payment Status
  let paymentStatus: 'PAID' | 'PARTIAL' | 'PENDING' = 'PENDING';
  if (totalVal > 0) {
    if (paidVal >= totalVal) {
      paymentStatus = 'PAID';
    } else if (paidVal > 0) {
      paymentStatus = 'PARTIAL';
    } else {
      paymentStatus = 'PENDING';
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (totalVal <= 0) {
      setErrorMessage('Please enter a valid Total Charge amount (> 0)');
      return;
    }

    if (customerType === 'outside_customer' && !outsideCustomerName.trim()) {
      setErrorMessage('Please enter the customer name');
      return;
    }

    // Resolve reservationId UUID from selectedBookingId
    let reservationUuid: string | undefined = undefined;
    if (customerType === 'resort_guest') {
      const match = bookings.find((b) => b.id === selectedBookingId || b.bookingGroupId === selectedBookingId);
      reservationUuid = match?.bookingGroupId || selectedBookingId;
    }

    try {
      setIsSubmitting(true);
      await addServiceBill({
        customerType,
        reservationId: reservationUuid,
        customerName: customerType === 'outside_customer' ? outsideCustomerName.trim() : undefined,
        category,
        totalAmount: totalVal,
        paidNow: paidVal,
        paymentMethod: paidVal > 0 ? paymentMethod : undefined,
        balanceOption: balance > 0 ? balanceOption : undefined,
        remarks: remarks.trim() || undefined,
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save service bill charge:', err);
      setErrorMessage(err?.message || 'Failed to save charge. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs transition duration-150 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-xs">
              <Utensils className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight text-white uppercase">Add Food / Activity Charge</h3>
              <p className="text-[10px] text-slate-300 font-medium">Quick Guest Services & Billing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 transition text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto flex-1 space-y-4 text-xs text-slate-800">
          
          {/* 1. CUSTOMER TYPE SELECTION */}
          <div>
            <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
              Customer Type
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setCustomerType('resort_guest')}
                className={`py-2 px-3 rounded-lg font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  customerType === 'resort_guest'
                    ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200/80 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${customerType === 'resort_guest' ? 'bg-indigo-600' : 'bg-slate-400'}`}></span>
                <span>Resort Guest</span>
              </button>

              <button
                type="button"
                onClick={() => setCustomerType('outside_customer')}
                className={`py-2 px-3 rounded-lg font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  customerType === 'outside_customer'
                    ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200/80 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${customerType === 'outside_customer' ? 'bg-indigo-600' : 'bg-slate-400'}`}></span>
                <span>Outside Customer</span>
              </button>
            </div>
          </div>

          {/* BOOKING SELECTION (Resort Guest) OR OUTSIDE CUSTOMER DETAILS */}
          {customerType === 'resort_guest' ? (
            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1">
                Select Active Booking
              </label>
              <select
                value={selectedBookingId}
                onChange={(e) => setSelectedBookingId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white min-h-[42px] cursor-pointer"
              >
                {activeBookings.length > 0 ? (
                  activeBookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      Room {b.roomNumber} • {b.guestName || 'Guest'}
                    </option>
                  ))
                ) : (
                  <option value="">No Active Occupied Bookings Found</option>
                )}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <label className="block text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  placeholder="Enter customer name..."
                  value={outsideCustomerName}
                  onChange={(e) => setOutsideCustomerName(e.target.value)}
                  className="w-full bg-white border border-slate-250 rounded-lg p-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Phone (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Enter phone number..."
                  value={outsideCustomerPhone}
                  onChange={(e) => setOutsideCustomerPhone(e.target.value)}
                  className="w-full bg-white border border-slate-250 rounded-lg p-2 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {/* 2. CHARGE CATEGORY CHIPS */}
          <div>
            <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
              Charge Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'Food', label: 'Food', icon: Utensils },
                { id: 'Swimming Pool', label: 'Swimming Pool', icon: Waves },
                { id: 'Campfire', label: 'Campfire', icon: Flame },
                { id: 'Other', label: 'Other', icon: Sparkles },
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = category === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCategory(item.id as any)}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[42px] ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200'
                        : 'bg-slate-50 border-slate-250 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3 & 4. SIMPLE CHARGES: TOTAL & PAID NOW */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-1">
                  Total Charge (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2.5 font-bold text-slate-400">₹</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    value={totalCharge}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setTotalCharge(raw === '' ? '' : Number(raw));
                    }}
                    className="w-full bg-white border border-slate-250 rounded-xl pl-6 pr-2 py-2 text-sm font-black text-slate-900 focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-1">
                  Paid Now (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2.5 font-bold text-slate-400">₹</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    value={paidNow}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setPaidNow(raw === '' ? '' : Number(raw));
                    }}
                    className="w-full bg-white border border-slate-250 rounded-xl pl-6 pr-2 py-2 text-sm font-black text-slate-900 focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* BALANCE & AUTOMATIC STATUS DISPLAY */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Remaining Balance</span>
                <span className={`text-sm font-black font-mono ${balance === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  ₹{balance.toLocaleString()}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Status</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide border ${
                  paymentStatus === 'PAID'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : paymentStatus === 'PARTIAL'
                    ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                    : 'bg-amber-100 text-amber-800 border-amber-300'
                }`}>
                  {paymentStatus}
                </span>
              </div>
            </div>
          </div>

          {/* 7. PAYMENT METHOD (Only if Paid Now > 0) */}
          {paidVal > 0 && (
            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                Payment Method
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['Cash', 'UPI', 'Bank', 'Card'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`py-2 px-2 rounded-xl border text-xs font-bold transition cursor-pointer text-center ${
                      paymentMethod === method
                        ? 'bg-slate-900 border-slate-900 text-white shadow-2xs font-extrabold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 6. BALANCE HANDLING LOGIC (Only if Balance > 0) */}
          {balance > 0 && (
            <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200 space-y-1.5">
              <label className="block text-[10px] font-extrabold text-amber-900 uppercase tracking-wider">
                Remaining Balance Handling
              </label>
              <div className="space-y-1.5 pt-0.5">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="balanceOption"
                    checked={balanceOption === 'due'}
                    onChange={() => setBalanceOption('due')}
                    className="w-3.5 h-3.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Balance Due</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="balanceOption"
                    checked={balanceOption === 'irshad_wallet'}
                    onChange={() => setBalanceOption('irshad_wallet')}
                    className="w-3.5 h-3.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Transfer Remaining to Irshad Wallet</span>
                </label>
              </div>
            </div>
          )}

          {/* 8. COMPACT SUMMARY CARD */}
          <div className="bg-slate-900 text-white p-3.5 rounded-xl space-y-2 border border-slate-800">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Charge Summary</span>
              <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                paymentStatus === 'PAID' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {paymentStatus}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-slate-800">
              <div>
                <span className="text-[10px] text-slate-400 block">Total Charge</span>
                <span className="text-xs font-black font-mono">₹{totalVal.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Paid</span>
                <span className="text-xs font-black font-mono text-emerald-400">₹{paidVal.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Remaining</span>
                <span className="text-xs font-black font-mono text-amber-400">₹{balance.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* REMARKS (OPTIONAL) */}
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Remarks (Optional)
            </label>
            <input
              type="text"
              placeholder="Add optional notes..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
          </div>

          {/* ERROR ALERT */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">
              {errorMessage}
            </div>
          )}

          {/* 9. BOTTOM ACTION BUTTONS */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold text-xs rounded-xl transition cursor-pointer shadow-md shadow-indigo-200 flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Charge</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
