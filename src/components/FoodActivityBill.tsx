import React, { useState, useMemo } from 'react';
import {
  Utensils,
  Receipt,
  Search,
  Plus,
  Filter,
  Calendar,
  Clock,
  CheckCircle2,
  Sparkles,
  Waves,
  Flame,
  Trash2,
  DollarSign,
  X,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useHotelData } from '../context/HotelContext';
import FoodActivityBillModal from './FoodActivityBillModal';
import { ServiceBill } from '../types';
import { getISTDateStr, formatDateDDMMYYYY } from '../utils/formatters';

interface FoodActivityBillProps {
  refreshTrigger?: number;
}

export default function FoodActivityBill({ refreshTrigger }: FoodActivityBillProps) {
  const { bookings, serviceBills, collectServiceBillPayment, deleteServiceBill } = useHotelData();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Collect Payment Modal State
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<ServiceBill | null>(null);
  const [collectAmountInput, setCollectAmountInput] = useState<number | ''>('');
  const [collectMethodInput, setCollectMethodInput] = useState<'Cash' | 'UPI' | 'Bank' | 'Card'>('Cash');
  const [collectRemarksInput, setCollectRemarksInput] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Delete Confirmation State
  const [deletingBillId, setDeletingBillId] = useState<string | null>(null);

  // Filter UI states
  const [selectedBooking, setSelectedBooking] = useState('');
  const [guestSearch, setGuestSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [chargeTypeFilter, setChargeTypeFilter] = useState('All');

  // Summary Metrics Calculations
  const todayStr = getISTDateStr();

  const metrics = useMemo(() => {
    let pendingBillsAmt = 0;
    let todaysChargesAmt = 0;
    let collectedAmt = 0;
    let outstandingAmt = 0;

    serviceBills.forEach((bill) => {
      if (bill.status !== 'cancelled') {
        if (bill.remainingBalance > 0) {
          pendingBillsAmt += bill.remainingBalance;
        }
        if (bill.createdAt && bill.createdAt.slice(0, 10) === todayStr) {
          todaysChargesAmt += bill.totalAmount;
        }
        collectedAmt += bill.paidAmount;
        outstandingAmt += bill.remainingBalance;
      }
    });

    return {
      pendingBillsAmt,
      todaysChargesAmt,
      collectedAmt,
      outstandingAmt,
    };
  }, [serviceBills, todayStr]);

  // Filtered Bills List
  const filteredBills = useMemo(() => {
    return serviceBills.filter((bill) => {
      if (bill.status === 'cancelled') return false;

      // Filter by selected booking
      if (selectedBooking && bill.reservationId !== selectedBooking) {
        return false;
      }

      // Filter by guest search
      if (guestSearch.trim()) {
        const q = guestSearch.toLowerCase().trim();
        const guestName = (bill.guestName || bill.customerName || '').toLowerCase();
        const roomStr = bill.roomNumber ? `room ${bill.roomNumber}` : '';
        const remarksStr = (bill.remarks || '').toLowerCase();
        if (!guestName.includes(q) && !roomStr.includes(q) && !remarksStr.includes(q)) {
          return false;
        }
      }

      // Filter by date
      if (dateFilter && bill.createdAt && !bill.createdAt.startsWith(dateFilter)) {
        return false;
      }

      // Filter by status
      if (statusFilter === 'Pending' && bill.remainingBalance <= 0) {
        return false;
      }
      if (statusFilter === 'Paid' && bill.remainingBalance > 0) {
        return false;
      }

      // Filter by charge type
      if (chargeTypeFilter !== 'All') {
        const catMap: Record<string, string> = {
          'Food': 'food',
          'Restaurant': 'food',
          'Swimming Pool': 'swimming_pool',
          'Campfire': 'campfire',
          'Other': 'other',
        };
        const targetType = catMap[chargeTypeFilter] || chargeTypeFilter.toLowerCase();
        if (bill.serviceType !== targetType) {
          return false;
        }
      }

      return true;
    });
  }, [serviceBills, selectedBooking, guestSearch, dateFilter, statusFilter, chargeTypeFilter]);

  // Handle Open Collect Modal
  const handleOpenCollectModal = (bill: ServiceBill) => {
    setSelectedBillForPayment(bill);
    setCollectAmountInput(bill.remainingBalance);
    setCollectMethodInput('Cash');
    setCollectRemarksInput('');
    setPaymentError(null);
  };

  // Handle Submit Collect Payment
  const handleCollectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBillForPayment) return;

    const amt = Number(collectAmountInput || 0);
    if (amt <= 0) {
      setPaymentError('Please enter a valid amount (> 0)');
      return;
    }

    if (amt > selectedBillForPayment.remainingBalance) {
      setPaymentError(`Amount cannot exceed remaining balance (₹${selectedBillForPayment.remainingBalance.toLocaleString()})`);
      return;
    }

    try {
      setIsSubmittingPayment(true);
      setPaymentError(null);

      await collectServiceBillPayment(
        selectedBillForPayment.id,
        amt,
        collectMethodInput,
        collectRemarksInput
      );

      setSelectedBillForPayment(null);
    } catch (err: any) {
      console.error('Error collecting bill payment:', err);
      setPaymentError(err?.message || 'Failed to record payment');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Handle Delete Bill
  const handleDelete = async (id: string) => {
    try {
      setDeletingBillId(id);
      await deleteServiceBill(id);
    } catch (err) {
      console.error('Error deleting service bill:', err);
    } finally {
      setDeletingBillId(null);
    }
  };

  // Helper for Category Icon & Colors
  const getCategoryBadge = (type: ServiceBill['serviceType']) => {
    switch (type) {
      case 'food':
        return {
          label: 'Food / Restaurant',
          icon: Utensils,
          color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        };
      case 'swimming_pool':
        return {
          label: 'Swimming Pool',
          icon: Waves,
          color: 'bg-cyan-100 text-cyan-800 border-cyan-200',
        };
      case 'campfire':
        return {
          label: 'Campfire',
          icon: Flame,
          color: 'bg-amber-100 text-amber-800 border-amber-200',
        };
      default:
        return {
          label: 'Other Charge',
          icon: Sparkles,
          color: 'bg-slate-100 text-slate-800 border-slate-200',
        };
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-20" id="food_activity_bill_module">
      {/* SECTION 1: HEADER */}
      <div className="bg-slate-900 text-white p-4 sm:p-6 rounded-2xl shadow-sm space-y-2 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/90 text-white flex items-center justify-center shadow-md shadow-indigo-900/40 shrink-0">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white">
              Food / Activity Bill
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-medium">
              Manage restaurant, swimming pool and other guest service charges.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 2: SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Pending Bills */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Pending Bills</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            ₹{metrics.pendingBillsAmt.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">Uncollected balance</div>
        </div>

        {/* Card 2: Today's Charges */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Today's Charges</span>
            <Utensils className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            ₹{metrics.todaysChargesAmt.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 font-medium">Recorded today</div>
        </div>

        {/* Card 3: Collected */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Collected</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600 font-mono">
            ₹{metrics.collectedAmt.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-600/80 font-medium">Total received</div>
        </div>

        {/* Card 4: Outstanding */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Outstanding</span>
            <Receipt className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 font-mono">
            ₹{metrics.outstandingAmt.toLocaleString()}
          </div>
          <div className="text-[11px] text-amber-600/80 font-medium">Total due</div>
        </div>
      </div>

      {/* SECTION 3: FILTERS */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5 text-indigo-600" />
          <span>Filter Charges</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* Booking Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Booking
            </label>
            <select
              value={selectedBooking}
              onChange={(e) => setSelectedBooking(e.target.value)}
              className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white min-h-[38px] cursor-pointer"
            >
              <option value="">All Bookings</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  Room {b.roomNumber} - {b.guestName || 'Guest'}
                </option>
              ))}
            </select>
          </div>

          {/* Guest Search */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Guest
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search guest..."
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-250 rounded-xl pl-8 pr-2 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white min-h-[38px]"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Date
            </label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white min-h-[38px] cursor-pointer"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white min-h-[38px] cursor-pointer"
            >
              <option value="All">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
            </select>
          </div>

          {/* Charge Type */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Charge Category
            </label>
            <select
              value={chargeTypeFilter}
              onChange={(e) => setChargeTypeFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-250 rounded-xl p-2 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white min-h-[38px] cursor-pointer"
            >
              <option value="All">All Categories</option>
              <option value="Food">Food / Restaurant</option>
              <option value="Swimming Pool">Swimming Pool</option>
              <option value="Campfire">Campfire</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 4: SERVICE BILLS LIST / CARDS */}
      {filteredBills.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden min-h-[280px] flex flex-col justify-center items-center p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mb-4 shadow-2xs">
            <Utensils className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-base font-extrabold text-slate-800 tracking-tight">
            No Food / Activity Bills Found
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
            Restaurant charges, Swimming pool, Campfire, and other guest services will appear here once created.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredBills.map((bill) => {
            const catBadge = getCategoryBadge(bill.serviceType);
            const Icon = catBadge.icon;
            const isOutstanding = bill.remainingBalance > 0;

            return (
              <div
                key={bill.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition p-4 flex flex-col justify-between space-y-3"
              >
                <div>
                  {/* Top Header: Badge & Date */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`px-2.5 py-1 rounded-xl border font-extrabold text-[10px] flex items-center gap-1.5 ${catBadge.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                      <span>{catBadge.label}</span>
                    </span>

                    <span className="text-[10px] font-bold text-slate-400">
                      {bill.createdAt ? formatDateDDMMYYYY(bill.createdAt) : ''}
                    </span>
                  </div>

                  {/* Guest Info */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900 leading-snug">
                        {bill.isOutsideCustomer
                          ? bill.customerName || 'Outside Customer'
                          : bill.guestName || 'Resort Guest'}
                      </h4>
                      <p className="text-[11px] font-semibold text-slate-500">
                        {bill.isOutsideCustomer ? (
                          <span className="text-indigo-600 font-bold">Outside Customer</span>
                        ) : (
                          <span>Room {bill.roomNumber || '—'}</span>
                        )}
                      </p>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full font-black text-[10px] border tracking-wider ${
                      !isOutstanding
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : bill.paidAmount > 0
                        ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                    }`}>
                      {!isOutstanding ? 'PAID' : bill.paidAmount > 0 ? 'PARTIAL' : 'PENDING'}
                    </span>
                  </div>

                  {bill.remarks && (
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-150 mt-2 italic">
                      "{bill.remarks}"
                    </p>
                  )}
                </div>

                {/* Amount Breakdown */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 text-xs">
                  <div className="flex items-center justify-between text-slate-600 font-medium">
                    <span>Total Charge:</span>
                    <span className="font-mono font-bold text-slate-900">₹{bill.totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 font-medium">
                    <span>Paid So Far:</span>
                    <span className="font-mono font-bold text-emerald-600">₹{bill.paidAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 font-bold">
                    <span className="text-slate-800">Remaining Balance:</span>
                    <span className={`font-mono text-sm font-black ${isOutstanding ? 'text-amber-600' : 'text-slate-400'}`}>
                      ₹{bill.remainingBalance.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Transfer / Due Option Badge */}
                {bill.transferToIrshad && (
                  <div className="text-[10px] font-bold text-purple-900 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200 text-center">
                    Remaining Balance Transferred to Irshad Wallet
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  {isOutstanding && (
                    <button
                      onClick={() => handleOpenCollectModal(bill)}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-1"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>Collect Payment</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(bill.id)}
                    disabled={deletingBillId === bill.id}
                    className="p-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition cursor-pointer"
                    title="Delete Bill"
                  >
                    {deletingBillId === bill.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FLOATING BUTTON (BOTTOM RIGHT) */}
      <div className="fixed bottom-5 right-5 z-40">
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold text-xs rounded-full shadow-xl transition-all flex items-center gap-2 cursor-pointer border border-indigo-500"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>+ Add Bill</span>
        </button>
      </div>

      {/* ADD BILL MODAL */}
      {isModalOpen && (
        <FoodActivityBillModal
          bookings={bookings}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      {/* COLLECT PAYMENT MODAL */}
      {selectedBillForPayment && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 animate-scale-up space-y-0">
            {/* Modal Header */}
            <div className="bg-slate-900 px-4 py-3.5 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <h3 className="font-black text-xs uppercase tracking-tight">Collect Service Bill Payment</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBillForPayment(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCollectSubmit} className="p-4 space-y-3 text-xs">
              {paymentError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-bold flex items-center gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Remaining Balance</span>
                  <p className="text-xs font-semibold text-slate-800">Bill #{selectedBillForPayment.id}</p>
                </div>
                <span className="text-lg font-black text-amber-600 font-mono">
                  ₹{selectedBillForPayment.remainingBalance.toLocaleString()}
                </span>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 uppercase block mb-1 text-[10px]">
                  Amount Collected (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 font-bold text-slate-400">₹</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={collectAmountInput}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setCollectAmountInput(raw === '' ? '' : Number(raw));
                    }}
                    placeholder="Enter amount"
                    className="w-full rounded-xl border border-slate-250 pl-7 pr-3 py-2 font-black text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 min-h-[42px]"
                  />
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 uppercase block mb-1 text-[10px]">
                  Payment Method
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['Cash', 'UPI', 'Bank', 'Card'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setCollectMethodInput(method)}
                      className={`py-2 px-1 rounded-xl border text-xs font-bold transition cursor-pointer text-center ${
                        collectMethodInput === method
                          ? 'bg-slate-900 border-slate-900 text-white font-extrabold'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-extrabold text-slate-700 uppercase block mb-1 text-[10px]">
                  Remarks (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Notes..."
                  value={collectRemarksInput}
                  onChange={(e) => setCollectRemarksInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-250 px-3 py-2 font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedBillForPayment(null)}
                  disabled={isSubmittingPayment}
                  className="flex-1 py-2.5 border border-slate-200 font-bold text-slate-700 rounded-xl hover:bg-slate-50 cursor-pointer min-h-[42px] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-xs cursor-pointer min-h-[42px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmittingPayment ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Confirm Payment</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

