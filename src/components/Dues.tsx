import React, { useState, useEffect, useMemo } from 'react';
import { CustomerDue } from '../types';
import { DuesService } from '../services/dues';
import { useHotelData } from '../context/HotelContext';
import { getISTDateStr, formatDateDDMMYYYY } from '../utils/formatters';
import {
  Wallet,
  Receipt,
  Users,
  Search,
  SlidersHorizontal,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  PlusCircle,
  X,
  CreditCard,
  DollarSign,
  Filter,
  ArrowUpDown,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

export default function Dues() {
  const { payments, bookings, refreshData } = useHotelData();
  const [activeDues, setActiveDues] = useState<CustomerDue[]>([]);
  const [historyDues, setHistoryDues] = useState<CustomerDue[]>([]);
  const [collectedTodayAmount, setCollectedTodayAmount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTabFilter, setActiveTabFilter] = useState<'outstanding' | 'partially_paid' | 'collected' | 'all'>('outstanding');
  const [sortBy, setSortBy] = useState<'highest' | 'lowest' | 'newest' | 'oldest'>('highest');

  // Collect Payment Modal State
  const [selectedDueForPayment, setSelectedDueForPayment] = useState<CustomerDue | null>(null);
  const [collectAmountInput, setCollectAmountInput] = useState<number | ''>('');
  const [collectMethodInput, setCollectMethodInput] = useState<'cash' | 'card' | 'upi' | 'net_banking'>('cash');
  const [collectRemarksInput, setCollectRemarksInput] = useState<string>('');
  const [collectDateInput, setCollectDateInput] = useState<string>(getISTDateStr());
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await DuesService.getDuesList();
      setActiveDues(res.activeDues);
      setHistoryDues(res.historyDues);
      setCollectedTodayAmount(res.collectedToday);
    } catch (err) {
      console.error('Error loading dues data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [payments, bookings]);

  // Calculate Metrics
  const totalOutstandingBalance = useMemo(() => {
    return activeDues.reduce((sum, item) => sum + (item.remainingBalance || 0), 0);
  }, [activeDues]);

  const uniqueCustomersCount = useMemo(() => {
    const names = new Set(activeDues.map((d) => d.bookingName.trim().toLowerCase()));
    return names.size;
  }, [activeDues]);

  // Combined List Filtering & Sorting
  const filteredDuesList = useMemo(() => {
    let list: CustomerDue[] = [];

    if (activeTabFilter === 'outstanding') {
      list = activeDues.filter((d) => d.remainingBalance > 0);
    } else if (activeTabFilter === 'partially_paid') {
      list = activeDues.filter((d) => d.amountCollected > 0 && d.remainingBalance > 0);
    } else if (activeTabFilter === 'collected') {
      list = historyDues;
    } else {
      list = [...activeDues, ...historyDues];
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.bookingName.toLowerCase().includes(q) ||
          item.reservationId.toLowerCase().includes(q) ||
          (item.checkInDate && item.checkInDate.includes(q))
      );
    }

    // Sort
    return list.sort((a, b) => {
      if (sortBy === 'highest') {
        return b.remainingBalance - a.remainingBalance;
      }
      if (sortBy === 'lowest') {
        return a.remainingBalance - b.remainingBalance;
      }
      if (sortBy === 'newest') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return 0;
    });
  }, [activeDues, historyDues, activeTabFilter, searchQuery, sortBy]);

  // Open Collect Modal
  const handleOpenCollectModal = (due: CustomerDue) => {
    setSelectedDueForPayment(due);
    setCollectAmountInput(due.remainingBalance);
    setCollectMethodInput('cash');
    setCollectRemarksInput('');
    setCollectDateInput(getISTDateStr());
    setFeedbackMsg(null);
  };

  // Submit Collect Payment
  const handleCollectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDueForPayment) return;

    const amount = Number(collectAmountInput || 0);
    if (amount <= 0) {
      setFeedbackMsg({ type: 'error', text: 'Please enter a valid collection amount (> 0).' });
      return;
    }

    if (amount > selectedDueForPayment.remainingBalance) {
      setFeedbackMsg({
        type: 'error',
        text: `Collection amount cannot exceed remaining balance (₹${selectedDueForPayment.remainingBalance.toLocaleString()}).`,
      });
      return;
    }

    try {
      setIsSubmittingPayment(true);
      setFeedbackMsg(null);

      await DuesService.collectDuePayment(
        selectedDueForPayment.id,
        amount,
        collectMethodInput,
        collectRemarksInput,
        collectDateInput
      );

      setSelectedDueForPayment(null);
      await refreshData();
      await loadData();
    } catch (err: any) {
      console.error('Error submitting due payment:', err);
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to record payment collection.' });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-12">
      {/* Top Header Banner */}
      <div className="p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl shadow-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 bg-indigo-600/30 rounded-xl border border-indigo-500/30 text-indigo-400">
              <Receipt className="w-5 h-5" />
            </span>
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">Customer Dues Ledger</h2>
          </div>
          <p className="text-xs text-slate-300 font-medium">
            Manage customer outstanding balances, partial payments, and due collections.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5"
          >
            <Clock className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Top 3 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Outstanding Balance */}
        <div className="p-4 bg-gradient-to-br from-amber-500/10 via-amber-50/40 to-white rounded-2xl border border-amber-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-800 mb-2">
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-amber-600" /> Outstanding Balance
            </span>
            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
              Active Dues
            </span>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-amber-900 tracking-tight">
              ₹{totalOutstandingBalance.toLocaleString()}
            </p>
            <p className="text-[11px] text-amber-700 font-semibold mt-0.5">
              Total pending receivables across all customers
            </p>
          </div>
        </div>

        {/* Pending Customers */}
        <div className="p-4 bg-gradient-to-br from-blue-500/10 via-blue-50/40 to-white rounded-2xl border border-blue-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-blue-800 mb-2">
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-4 h-4 text-blue-600" /> Pending Customers
            </span>
            <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
              Count
            </span>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-blue-900 tracking-tight">
              {uniqueCustomersCount} {uniqueCustomersCount === 1 ? 'Guest' : 'Guests'}
            </p>
            <p className="text-[11px] text-blue-700 font-semibold mt-0.5">
              {activeDues.length} active reservation dues recorded
            </p>
          </div>
        </div>

        {/* Collected Today */}
        <div className="p-4 bg-gradient-to-br from-emerald-500/10 via-emerald-50/40 to-white rounded-2xl border border-emerald-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-800 mb-2">
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Collected Today
            </span>
            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
              IST Today
            </span>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-900 tracking-tight">
              ₹{collectedTodayAmount.toLocaleString()}
            </p>
            <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
              Dues collected on {formatDateDDMMYYYY(getISTDateStr())}
            </p>
          </div>
        </div>
      </div>

      {/* Controls Bar: Search & Filter Tabs */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Customer Name, Reservation ID, or Date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 shrink-0 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" /> Sort:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 min-h-[40px] cursor-pointer"
            >
              <option value="highest">Highest Due First</option>
              <option value="lowest">Lowest Due First</option>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <button
            onClick={() => setActiveTabFilter('outstanding')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTabFilter === 'outstanding'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Outstanding</span>
            <span className="px-1.5 py-0.2 bg-white/20 text-[10px] rounded-full">
              {activeDues.filter((d) => d.remainingBalance > 0).length}
            </span>
          </button>

          <button
            onClick={() => setActiveTabFilter('partially_paid')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTabFilter === 'partially_paid'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Partially Paid</span>
            <span className="px-1.5 py-0.2 bg-white/20 text-[10px] rounded-full">
              {activeDues.filter((d) => d.amountCollected > 0 && d.remainingBalance > 0).length}
            </span>
          </button>

          <button
            onClick={() => setActiveTabFilter('collected')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTabFilter === 'collected'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Collected / Cleared</span>
            <span className="px-1.5 py-0.2 bg-white/20 text-[10px] rounded-full">
              {historyDues.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTabFilter('all')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTabFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>All Records</span>
            <span className="px-1.5 py-0.2 bg-white/20 text-[10px] rounded-full">
              {activeDues.length + historyDues.length}
            </span>
          </button>
        </div>
      </div>

      {/* Pending Ledger (Mobile-First Cards Layout) */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 space-y-2">
            <Clock className="w-6 h-6 animate-spin mx-auto text-indigo-500" />
            <p className="text-xs font-bold">Loading Customer Dues Ledger...</p>
          </div>
        ) : filteredDuesList.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="text-sm font-extrabold text-slate-800">No Customer Dues Found</p>
            <p className="text-xs text-slate-500">
              {searchQuery
                ? 'No dues matching your search filters.'
                : 'All customer outstanding dues have been cleared or none are recorded.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredDuesList.map((due) => {
              const isOutstanding = due.remainingBalance > 0;

              return (
                <div
                  key={due.id}
                  className={`p-4 bg-white rounded-2xl border shadow-2xs transition flex flex-col justify-between space-y-3 ${
                    isOutstanding ? 'border-amber-200 hover:border-amber-400' : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  {/* Card Header: Guest Name & Status Badge */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <h3 className="font-extrabold text-sm text-slate-900 tracking-tight leading-snug">
                          {due.bookingName}
                        </h3>
                        <p className="text-[11px] font-mono text-slate-500 font-semibold">
                          Res #{due.reservationId.slice(0, 12)}
                        </p>
                      </div>

                      {isOutstanding ? (
                        <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 font-black text-[10px] rounded-md shrink-0">
                          Outstanding
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 font-black text-[10px] rounded-md shrink-0 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Paid
                        </span>
                      )}
                    </div>

                    {/* Dates & Details */}
                    <div className="grid grid-cols-2 gap-2 mt-2.5 pt-2.5 border-t border-slate-100 text-[11px]">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Check-In</span>
                        <span className="font-semibold text-slate-700">
                          {due.checkInDate ? formatDateDDMMYYYY(due.checkInDate) : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Check-Out</span>
                        <span className="font-semibold text-slate-700">
                          {due.checkOutDate ? formatDateDDMMYYYY(due.checkOutDate) : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Financial Breakdown Block */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-150 space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold text-slate-600">
                      <span>Total Booking:</span>
                      <span className="font-bold text-slate-900">₹{due.totalAmount.toLocaleString()}</span>
                    </div>

                    <div className="flex justify-between text-xs font-semibold text-slate-600">
                      <span>Collected So Far:</span>
                      <span className="font-bold text-emerald-600">
                        ₹{(due.advancePaid || due.amountCollected).toLocaleString()}
                      </span>
                    </div>

                    <div className="pt-1.5 border-t border-slate-200/80 flex justify-between items-baseline">
                      <span className="text-xs font-black text-slate-800">Remaining Due:</span>
                      <span
                        className={`text-lg font-black tracking-tight ${
                          isOutstanding ? 'text-amber-700' : 'text-slate-400 line-through'
                        }`}
                      >
                        ₹{due.remainingBalance.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Action Button */}
                  {isOutstanding && (
                    <button
                      onClick={() => handleOpenCollectModal(due)}
                      className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-700 hover:to-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5 min-h-[42px]"
                    >
                      <DollarSign className="w-4 h-4" /> Collect Payment
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Collect Payment Modal Popup */}
      {selectedDueForPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden text-slate-900 animate-scale-up space-y-0">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-amber-600 to-indigo-600 px-4 py-3.5 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-amber-200" />
                  Collect Customer Due
                </h3>
                <p className="text-[11px] text-amber-100 font-medium">
                  {selectedDueForPayment.bookingName} • Res #{selectedDueForPayment.reservationId.slice(0, 10)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDueForPayment(null)}
                className="p-1 hover:bg-white/10 rounded-lg text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCollectSubmit} className="p-4 space-y-3.5 text-xs">
              {feedbackMsg && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                    feedbackMsg.type === 'error'
                      ? 'bg-rose-50 text-rose-800 border border-rose-200'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{feedbackMsg.text}</span>
                </div>
              )}

              {/* Outstanding Balance Banner */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">Outstanding Due</span>
                  <p className="text-xs text-amber-900 font-medium">Current balance to be collected</p>
                </div>
                <span className="text-xl font-black text-amber-800">
                  ₹{selectedDueForPayment.remainingBalance.toLocaleString()}
                </span>
              </div>

              {/* Payment Date */}
              <div>
                <label className="font-bold text-slate-700 uppercase block mb-1 text-[10px]">
                  Collection Date (IST)
                </label>
                <input
                  type="date"
                  value={collectDateInput}
                  onChange={(e) => setCollectDateInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[42px]"
                />
              </div>

              {/* Amount Collected Input */}
              <div>
                <label className="font-bold text-slate-700 uppercase block mb-1 text-[10px]">
                  Amount Collected (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 font-bold text-slate-400">₹</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={collectAmountInput === '' ? '' : collectAmountInput}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      if (raw === '') {
                        setCollectAmountInput('');
                      } else {
                        const clean = raw.replace(/^0+(?=\d)/, '');
                        setCollectAmountInput(clean === '' ? '' : Number(clean));
                      }
                    }}
                    placeholder="Enter amount"
                    className="w-full rounded-xl border border-slate-200 pl-7 pr-3 py-2.5 font-black text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                  />
                </div>
                {typeof collectAmountInput === 'number' && (
                  <p className="text-[10px] text-slate-500 font-medium mt-1">
                    New Remaining Due after collection: ₹
                    {Math.max(0, selectedDueForPayment.remainingBalance - collectAmountInput).toLocaleString()}
                  </p>
                )}
              </div>

              {/* Payment Method */}
              <div>
                <label className="font-bold text-slate-700 uppercase block mb-1 text-[10px]">
                  Payment Method
                </label>
                <select
                  value={collectMethodInput}
                  onChange={(e) => setCollectMethodInput(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[42px] cursor-pointer"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / GooglePay / PhonePe</option>
                  <option value="card">Credit / Debit Card</option>
                  <option value="net_banking">Net Banking</option>
                </select>
              </div>

              {/* Remarks */}
              <div>
                <label className="font-bold text-slate-700 uppercase block mb-1 text-[10px]">
                  Remarks / Reference Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paid remaining balance via UPI"
                  value={collectRemarksInput}
                  onChange={(e) => setCollectRemarksInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[42px]"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedDueForPayment(null)}
                  className="flex-1 py-2.5 border border-slate-200 font-bold text-slate-700 rounded-xl hover:bg-slate-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-700 hover:to-indigo-700 text-white font-extrabold rounded-xl shadow-xs cursor-pointer min-h-[42px]"
                >
                  {isSubmittingPayment ? 'Saving Collection...' : 'Confirm & Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
