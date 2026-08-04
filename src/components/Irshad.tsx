import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { IrshadWalletService } from '../services/irshadWallet';
import { IrshadSettlement, IrshadWalletSummary } from '../types';
import { useHotelData } from '../context/HotelContext';
import { getISTDateStr } from '../utils/formatters';
import {
  Wallet,
  Receipt,
  Calendar,
  Handshake,
  CheckCircle2,
  Plus,
  Search,
  Filter,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

export default function Irshad({ refreshTrigger }: { refreshTrigger?: number }) {
  const { payments, refreshData } = useHotelData();
  const [summary, setSummary] = useState<IrshadWalletSummary>({
    expense_by_irshad: 0,
    bookings_with_irshad: 0,
    resort_paid: 0,
    irshad_paid: 0,
  });

  const [settlements, setSettlements] = useState<IrshadSettlement[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'expenses' | 'bookings' | 'settlements'>('expenses');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Settlement Modal State
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [settlementType, setSettlementType] = useState<'resort_paid_irshad' | 'irshad_paid_resort'>('resort_paid_irshad');
  const [settlementAmount, setSettlementAmount] = useState<number | ''>('');
  const [settlementDate, setSettlementDate] = useState(getISTDateStr());
  const [settlementRemarks, setSettlementRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Booking Pay Modal State
  const [selectedBookingForPayment, setSelectedBookingForPayment] = useState<any | null>(null);
  const [payAmountInput, setPayAmountInput] = useState<number | ''>('');
  const [payMethodInput, setPayMethodInput] = useState<'cash' | 'card' | 'upi' | 'net_banking'>('cash');
  const [payRemarksInput, setPayRemarksInput] = useState<string>('');
  const [payDateInput, setPayDateInput] = useState<string>(getISTDateStr());
  const [isSubmittingBookingPay, setIsSubmittingBookingPay] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sumRes, setRes, expRes, bookRes] = await Promise.all([
        IrshadWalletService.getWalletSummary(),
        IrshadWalletService.getSettlements(),
        IrshadWalletService.getIrshadExpenses(),
        IrshadWalletService.getIrshadBookings(),
      ]);

      setSummary(sumRes);
      setSettlements(setRes);
      setExpenses(expRes);
      setBookings(bookRes);
    } catch (err) {
      console.error('Error loading Irshad data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData, refreshTrigger, payments]);

  // Derived Calculations
  const totalExpenses = useMemo(() => {
    return summary.expense_by_irshad || expenses.reduce((s, e) => s + (e.amount || 0), 0);
  }, [summary, expenses]);

  const totalBookings = useMemo(() => {
    return summary.bookings_with_irshad || bookings.reduce((s, b) => s + (b.transferredToIrshad || b.amount || 0), 0);
  }, [summary, bookings]);

  const resortPaid = summary.resort_paid || 0;
  const irshadPaid = summary.irshad_paid || 0;

  // net = booking_due_to_resort - expense_due_to_irshad
  // booking_due_to_resort = totalBookings - irshadPaid
  // expense_due_to_irshad = totalExpenses - resortPaid
  const netWalletBalance = useMemo(() => {
    const bookingDueToResort = totalBookings - irshadPaid;
    const expenseDueToIrshad = totalExpenses - resortPaid;
    return bookingDueToResort - expenseDueToIrshad;
  }, [totalBookings, totalExpenses, resortPaid, irshadPaid]);

  // Handle Record Settlement Submission
  const handleRecordSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlementAmount || Number(settlementAmount) <= 0) return;

    try {
      setIsSubmitting(true);
      await IrshadWalletService.addSettlement({
        transactionDate: settlementDate,
        transactionType: settlementType,
        amount: Number(settlementAmount),
        remarks: settlementRemarks.trim() || (settlementType === 'resort_paid_irshad' ? 'Resort paid settlement to Irshad' : 'Irshad paid settlement to Resort'),
      });

      showToast('Settlement recorded successfully!');
      setIsSettlementModalOpen(false);
      setSettlementAmount('');
      setSettlementRemarks('');
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to record settlement');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Pay Modal for a Booking transferred to Irshad
  const handleOpenPayModal = (b: any) => {
    setSelectedBookingForPayment(b);
    setPayAmountInput(b.transferredToIrshad || b.remainingBalance || b.amount || 0);
    setPayMethodInput('cash');
    setPayRemarksInput('');
    setPayDateInput(getISTDateStr());
  };

  // Submit Payment for Booking from Irshad page
  const handleCollectBookingPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookingForPayment) return;

    const amt = Number(payAmountInput || 0);
    if (amt <= 0) {
      alert('Please enter a valid payment amount (> 0).');
      return;
    }

    try {
      setIsSubmittingBookingPay(true);
      await IrshadWalletService.settleBookingDue(
        selectedBookingForPayment.reservationId,
        amt,
        payMethodInput,
        payRemarksInput,
        payDateInput
      );

      showToast('Payment collected successfully! Ledger updated.');
      setSelectedBookingForPayment(null);
      await refreshData();
      await loadAllData();
    } catch (err: any) {
      console.error('Error submitting booking payment:', err);
      alert(err.message || 'Failed to record payment collection.');
    } finally {
      setIsSubmittingBookingPay(false);
    }
  };

  // Expense categories for filtering
  const expenseCategories = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach((e) => { if (e.category) set.add(e.category); });
    return Array.from(set);
  }, [expenses]);

  // Filtered lists
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchesCategory = categoryFilter === 'ALL' || e.category === categoryFilter;
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch = !q || (e.itemName || '').toLowerCase().includes(q) || (e.remarks || '').toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [expenses, categoryFilter, searchTerm]);

  const filteredBookings = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return bookings.filter((b) => {
      if (!q) return true;
      return (b.guestName || '').toLowerCase().includes(q) || (b.reservationId || '').toLowerCase().includes(q) || (b.remarks || '').toLowerCase().includes(q);
    });
  }, [bookings, searchTerm]);

  const filteredSettlements = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return settlements.filter((s) => {
      if (!q) return true;
      return (s.remarks || '').toLowerCase().includes(q) || (s.transactionDate || '').includes(q);
    });
  }, [settlements, searchTerm]);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-500 font-medium text-xs flex flex-col items-center justify-center space-y-2">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <span>Loading Irshad Wallet &amp; Ledger data...</span>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 space-y-3.5 max-w-7xl mx-auto font-sans" id="irshad_wallet_module">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-3 right-3 left-3 sm:left-auto sm:w-auto z-50 bg-emerald-800 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP HEADER CARD */}
      <div className="bg-slate-900 text-white p-3.5 sm:p-4 rounded-2xl shadow-md border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-purple-500/20 border border-purple-400/30 text-purple-300 rounded-xl">
              <Handshake className="w-5 h-5" />
            </span>
            <h2 className="text-base sm:text-lg font-black tracking-tight text-white uppercase">
              Irshad Wallet &amp; Settlement Ledger
            </h2>
          </div>
          <p className="text-xs text-slate-300 font-medium pl-9">
            Track expenses paid personally by Irshad, transferred booking dues, and settlement balances.
          </p>
        </div>

        <button
          onClick={() => setIsSettlementModalOpen(true)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer shrink-0 min-h-[40px]"
        >
          <Plus className="w-4 h-4" />
          <span>Record Settlement</span>
        </button>
      </div>

      {/* 1. SUMMARY CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Card 1: Expense by Irshad */}
        <div className="p-3.5 bg-purple-50/90 border border-purple-200/90 rounded-2xl shadow-2xs flex flex-col justify-between min-h-[96px]">
          <div className="flex items-center justify-between text-purple-900">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-purple-700 shrink-0" /> Expense by Irshad
            </span>
            <span className="text-[9px] font-extrabold bg-purple-200/80 text-purple-950 px-2 py-0.5 rounded-md">
              Personal Paid
            </span>
          </div>
          <p className="text-2xl font-black tracking-tight text-purple-950 my-1">
            ₹{totalExpenses.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] font-semibold text-purple-800/90 truncate">
            {expenses.length} personal expense {expenses.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>

        {/* Card 2: Bookings with Irshad */}
        <div className="p-3.5 bg-blue-50/90 border border-blue-200/90 rounded-2xl shadow-2xs flex flex-col justify-between min-h-[96px]">
          <div className="flex items-center justify-between text-blue-900">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-blue-700 shrink-0" /> Bookings with Irshad
            </span>
            <span className="text-[9px] font-extrabold bg-blue-200/80 text-blue-950 px-2 py-0.5 rounded-md">
              Transferred
            </span>
          </div>
          <p className="text-2xl font-black tracking-tight text-blue-950 my-1">
            ₹{totalBookings.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] font-semibold text-blue-800/90 truncate">
            {bookings.length} booking dues assigned
          </p>
        </div>

        {/* Card 3: Settlement Paid */}
        <div className="p-3.5 bg-emerald-50/90 border border-emerald-200/90 rounded-2xl shadow-2xs flex flex-col justify-between min-h-[96px]">
          <div className="flex items-center justify-between text-emerald-900">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-700 shrink-0" /> Settlement Paid
            </span>
            <span className="text-[9px] font-extrabold bg-emerald-200/80 text-emerald-950 px-2 py-0.5 rounded-md">
              Cleared
            </span>
          </div>
          <p className="text-2xl font-black tracking-tight text-emerald-950 my-1">
            ₹{Math.abs(resortPaid - irshadPaid).toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] font-semibold text-emerald-800/90 truncate">
            {settlements.length} settlement transaction {settlements.length === 1 ? 'record' : 'records'}
          </p>
        </div>

        {/* Card 4: Net Wallet Balance */}
        <div className="p-3.5 bg-slate-900 text-white border border-slate-800 rounded-2xl shadow-md flex flex-col justify-between min-h-[96px]">
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-purple-400 shrink-0" /> Net Wallet Balance
            </span>
            <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${netWalletBalance > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : netWalletBalance < 0 ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
              {netWalletBalance > 0 ? 'Irshad Owes Resort' : netWalletBalance < 0 ? 'Resort Owes Irshad' : 'All Settled'}
            </span>
          </div>
          <p className="text-2xl font-black tracking-tight text-white my-1">
            ₹{Math.abs(netWalletBalance).toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] font-medium text-slate-400 truncate">
            {netWalletBalance > 0
              ? `Irshad should pay Resort: ₹${netWalletBalance.toLocaleString('en-IN')}`
              : netWalletBalance < 0
              ? `Resort should pay Irshad: ₹${Math.abs(netWalletBalance).toLocaleString('en-IN')}`
              : 'All Settled ₹0'}
          </p>
        </div>
      </div>

      {/* 2. SEGMENTED TABS & SEARCH BAR */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Segmented Tabs */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200 shrink-0">
            <button
              onClick={() => setActiveTab('expenses')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'expenses'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Expense Ledger ({expenses.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('bookings')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'bookings'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Booking Ledger ({bookings.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('settlements')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'settlements'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Handshake className="w-3.5 h-3.5" />
              <span>Settlement History ({settlements.length})</span>
            </button>
          </div>

          {/* Search & Category Filters */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search ledger entries..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none min-h-[38px]"
              />
            </div>

            {activeTab === 'expenses' && expenseCategories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-purple-500 min-h-[38px] cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                {expenseCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* TAB CONTENT TABLES / LISTS */}
        {/* TAB 1: EXPENSE LEDGER */}
        {activeTab === 'expenses' && (
          <div className="space-y-2">
            {filteredExpenses.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs font-bold">
                No personal expenses recorded for Irshad.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="bg-slate-50 px-3.5 py-2 text-[10px] font-black uppercase text-slate-500 grid grid-cols-12 gap-2">
                  <span className="col-span-3 sm:col-span-2">Date</span>
                  <span className="col-span-3 sm:col-span-2">Category</span>
                  <span className="col-span-4 sm:col-span-5">Item / Remarks</span>
                  <span className="col-span-2 sm:col-span-3 text-right">Amount</span>
                </div>
                {filteredExpenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="px-3.5 py-2.5 hover:bg-purple-50/30 transition grid grid-cols-12 gap-2 items-center text-xs font-semibold text-slate-800 border-l-4 border-l-purple-600"
                  >
                    <span className="col-span-3 sm:col-span-2 font-bold text-slate-900 truncate">
                      {exp.expenseDate}
                    </span>
                    <span className="col-span-3 sm:col-span-2">
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-extrabold rounded-md border border-purple-200">
                        {exp.category}
                      </span>
                    </span>
                    <div className="col-span-4 sm:col-span-5 min-w-0">
                      <span className="font-extrabold text-slate-900 block truncate">
                        {exp.itemName || exp.category}
                      </span>
                      {exp.remarks && (
                        <span className="text-[11px] text-slate-400 italic block truncate">
                          {exp.remarks}
                        </span>
                      )}
                    </div>
                    <span className="col-span-2 sm:col-span-3 text-right font-black text-slate-900 text-sm">
                      ₹{exp.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: BOOKING LEDGER */}
        {activeTab === 'bookings' && (
          <div className="space-y-2">
            {filteredBookings.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs font-bold">
                No booking dues transferred to Irshad.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="bg-slate-50 px-3.5 py-2 text-[10px] font-black uppercase text-slate-500 grid grid-cols-12 gap-2">
                  <span className="col-span-4 sm:col-span-3">Guest Name</span>
                  <span className="col-span-4 sm:col-span-4">Details / Remarks</span>
                  <span className="col-span-4 sm:col-span-5 text-right">Transferred Amount</span>
                </div>
                {filteredBookings.map((b) => (
                  <div
                    key={b.id}
                    className="px-3.5 py-2.5 hover:bg-blue-50/30 transition grid grid-cols-12 gap-2 items-center text-xs font-semibold text-slate-800 border-l-4 border-l-blue-600"
                  >
                    <div className="col-span-4 sm:col-span-3 min-w-0">
                      <span className="font-extrabold text-slate-900 block truncate">
                        {b.guestName}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Res ID: {b.reservationId.substring(0, 8)}
                      </span>
                    </div>
                    <div className="col-span-4 sm:col-span-4 min-w-0">
                      <span className="text-[11px] text-slate-600 font-medium block truncate">
                        {b.remarks || 'Check-in balance assigned to Irshad'}
                      </span>
                    </div>
                    <div className="col-span-4 sm:col-span-5 flex items-center justify-end gap-2.5">
                      <div className="text-right min-w-0">
                        <span className="font-black text-blue-900 text-sm block">
                          ₹{(b.transferredToIrshad || b.remainingBalance || b.amount || 0).toLocaleString('en-IN')}
                        </span>
                        {b.amountCollected > 0 && (
                          <span className="text-[10px] text-slate-400 block font-medium">
                            Customer Paid: ₹{b.amountCollected.toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenPayModal(b)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-black rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1 shrink-0 min-h-[34px]"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Pay</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SETTLEMENT HISTORY */}
        {activeTab === 'settlements' && (
          <div className="space-y-2">
            {filteredSettlements.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs font-bold">
                No settlement history recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="bg-slate-50 px-3.5 py-2 text-[10px] font-black uppercase text-slate-500 grid grid-cols-12 gap-2">
                  <span className="col-span-3 sm:col-span-2">Date</span>
                  <span className="col-span-4 sm:col-span-3">Type</span>
                  <span className="col-span-3 sm:col-span-4">Notes</span>
                  <span className="col-span-2 sm:col-span-3 text-right">Amount</span>
                </div>
                {filteredSettlements.map((st) => (
                  <div
                    key={st.id}
                    className={`px-3.5 py-2.5 hover:bg-emerald-50/30 transition grid grid-cols-12 gap-2 items-center text-xs font-semibold text-slate-800 border-l-4 ${
                      st.transactionType === 'resort_paid_irshad' ? 'border-l-emerald-600' : 'border-l-indigo-600'
                    }`}
                  >
                    <span className="col-span-3 sm:col-span-2 font-bold text-slate-900 truncate">
                      {st.transactionDate}
                    </span>
                    <span className="col-span-4 sm:col-span-3">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md border ${
                          st.transactionType === 'resort_paid_irshad'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                        }`}
                      >
                        {st.transactionType === 'resort_paid_irshad' ? 'Resort → Irshad' : 'Irshad → Resort'}
                      </span>
                    </span>
                    <span className="col-span-3 sm:col-span-4 text-[11px] text-slate-600 font-medium truncate">
                      {st.remarks || 'Settlement payment'}
                    </span>
                    <span className="col-span-2 sm:col-span-3 text-right font-black text-slate-900 text-sm">
                      ₹{st.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* RECORD SETTLEMENT POPUP MODAL */}
      {isSettlementModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-black text-xs text-slate-900 uppercase flex items-center gap-2">
                <Handshake className="w-4 h-4 text-purple-600" />
                Record Settlement Transaction
              </h3>
              <button
                type="button"
                onClick={() => setIsSettlementModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordSettlement} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">
                  Transaction Type *
                </label>
                <select
                  value={settlementType}
                  onChange={(e) => setSettlementType(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 min-h-[44px] cursor-pointer bg-white"
                >
                  <option value="resort_paid_irshad">Resort Paid Money to Irshad</option>
                  <option value="irshad_paid_resort">Irshad Paid Money to Resort</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">
                  Transaction Date *
                </label>
                <input
                  type="date"
                  required
                  value={settlementDate}
                  onChange={(e) => setSettlementDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">
                  Amount (₹) *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  value={settlementAmount === '' ? '' : settlementAmount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    if (raw === '') {
                      setSettlementAmount('');
                    } else {
                      const clean = raw.replace(/^0+(?=\d)/, '');
                      setSettlementAmount(clean === '' ? '' : Number(clean));
                    }
                  }}
                  placeholder="Enter amount"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">
                  Notes / Remarks
                </label>
                <input
                  type="text"
                  value={settlementRemarks}
                  onChange={(e) => setSettlementRemarks(e.target.value)}
                  placeholder="e.g. Settlement payment via bank transfer"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 min-h-[44px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSettlementModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 font-bold text-slate-700 rounded-xl hover:bg-slate-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl shadow-2xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Recording...' : 'Save Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COLLECT BOOKING PAYMENT POPUP MODAL */}
      {selectedBookingForPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-black text-xs text-slate-900 uppercase flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                Collect Booking Payment
              </h3>
              <button
                type="button"
                onClick={() => setSelectedBookingForPayment(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCollectBookingPayment} className="p-4 space-y-3.5 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <p className="font-bold text-slate-900 text-sm">
                  {selectedBookingForPayment.guestName}
                </p>
                <p className="text-[10px] text-slate-500 font-mono">
                  Reservation ID: {selectedBookingForPayment.reservationId}
                </p>
                <p className="text-xs text-indigo-900 font-black pt-1">
                  Transferred Balance: ₹{(selectedBookingForPayment.transferredToIrshad || selectedBookingForPayment.remainingBalance || selectedBookingForPayment.amount || 0).toLocaleString('en-IN')}
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">
                  Payment Date *
                </label>
                <input
                  type="date"
                  required
                  value={payDateInput}
                  onChange={(e) => setPayDateInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">
                  Amount Collected (₹) *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  value={payAmountInput === '' ? '' : payAmountInput}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    if (raw === '') {
                      setPayAmountInput('');
                    } else {
                      const clean = raw.replace(/^0+(?=\d)/, '');
                      setPayAmountInput(clean === '' ? '' : Number(clean));
                    }
                  }}
                  placeholder="Enter collected amount"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">
                  Payment Method *
                </label>
                <select
                  value={payMethodInput}
                  onChange={(e) => setPayMethodInput(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px] cursor-pointer bg-white"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / GPay</option>
                  <option value="card">Credit/Debit Card</option>
                  <option value="net_banking">Net Banking / NEFT</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">
                  Remarks / Ref
                </label>
                <input
                  type="text"
                  value={payRemarksInput}
                  onChange={(e) => setPayRemarksInput(e.target.value)}
                  placeholder="e.g. Paid in full via UPI"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedBookingForPayment(null)}
                  className="flex-1 py-2.5 border border-slate-200 font-bold text-slate-700 rounded-xl hover:bg-slate-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBookingPay}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-2xs cursor-pointer min-h-[42px]"
                >
                  {isSubmittingBookingPay ? 'Processing...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
