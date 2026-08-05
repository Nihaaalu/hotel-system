import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { IrshadWalletService } from '../services/irshadWallet';
import { IrshadSettlement, IrshadWalletSummary } from '../types';
import { useHotelData } from '../context/HotelContext';
import { getISTDateStr, getISTMonthStr } from '../utils/formatters';
import { getCleanGuestRemarks } from '../utils/timeline';
import {
  Wallet,
  Receipt,
  Handshake,
  CheckCircle2,
  Plus,
  Search,
  X,
  Building2,
  DollarSign,
  User,
  ShoppingBag,
  Zap,
  Truck,
  Wrench,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Clock,
  FileText,
  Tag,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  Check,
} from 'lucide-react';

export default function Irshad({ refreshTrigger }: { refreshTrigger?: number }) {
  const { payments, refreshData } = useHotelData();

  // Summary State
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

  // Filter States
  const [activeTab, setActiveTab] = useState<'all' | 'expenses' | 'bookings' | 'settlements'>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Expandable Transaction State
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  // Derived Calculations (DO NOT CHANGE CALCULATION LOGIC)
  const personalExpenses = useMemo(() => {
    return summary.expense_by_irshad || expenses.reduce((s, e) => s + (e.amount || 0), 0);
  }, [summary, expenses]);

  const bookingDues = useMemo(() => {
    return summary.bookings_with_irshad || bookings.reduce((s, b) => s + (b.transferredToIrshad || b.amount || 0), 0);
  }, [summary, bookings]);

  const resortPaid = summary.resort_paid || 0;
  const irshadPaid = summary.irshad_paid || 0;
  const settlementPaid = resortPaid - irshadPaid;

  const totalExpenses = personalExpenses;
  const totalBookings = bookingDues;

  const netWalletBalance = useMemo(() => {
    return personalExpenses - bookingDues - settlementPaid;
  }, [personalExpenses, bookingDues, settlementPaid]);

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
        remarks:
          settlementRemarks.trim() ||
          (settlementType === 'resort_paid_irshad' ? 'Resort paid settlement to Irshad' : 'Irshad paid settlement to Resort'),
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
  const handleOpenPayModal = (b: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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

  // Category Icon Resolver
  const getCategoryIcon = (category: string, type: string) => {
    if (type === 'booking') return CreditCard;
    if (type === 'settlement') return Handshake;

    const lower = category.toLowerCase();
    if (lower.includes('rent')) return Building2;
    if (lower.includes('salary') || lower.includes('staff')) return User;
    if (lower.includes('grocery') || lower.includes('groceries')) return ShoppingBag;
    if (lower.includes('transport') || lower.includes('vehicle')) return Truck;
    if (lower.includes('electric') || lower.includes('power')) return Zap;
    if (lower.includes('mainten')) return Wrench;
    return Receipt;
  };

  // Available Months
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach((e) => {
      if (e.expenseDate) set.add(e.expenseDate.substring(0, 7));
    });
    settlements.forEach((s) => {
      if (s.transactionDate) set.add(s.transactionDate.substring(0, 7));
    });
    bookings.forEach((b) => {
      if (b.createdAt) set.add(b.createdAt.substring(0, 7));
    });
    set.add(getISTMonthStr());
    return Array.from(set).sort().reverse();
  }, [expenses, settlements, bookings]);

  // Unified Timeline Items
  const unifiedTimelineItems = useMemo(() => {
    const list: any[] = [];

    // 1. Personal Expenses
    expenses.forEach((e) => {
      list.push({
        id: `exp_${e.id}`,
        type: 'expense',
        date: e.expenseDate || '',
        title: e.itemName || e.category || 'Personal Expense',
        category: e.category || 'General',
        amount: e.amount || 0,
        paidBy: 'Irshad',
        walletEffect: e.amount || 0,
        remarks: e.remarks || '',
        createdAt: e.createdAt || '',
        raw: e,
      });
    });

    // 2. Booking Collections
    bookings.forEach((b) => {
      const amt = b.transferredToIrshad || b.remainingBalance || b.amount || 0;
      const dateKey = (b.createdAt || '').split('T')[0] || getISTDateStr();
      list.push({
        id: `book_${b.id}`,
        type: 'booking',
        date: dateKey,
        title: `Guest Collection (${b.guestName || 'Guest'})`,
        category: 'Guest Collection',
        amount: amt,
        amountCollected: b.amountCollected || 0,
        guestName: b.guestName,
        reservationId: b.reservationId,
        paidBy: 'Collected by Irshad',
        walletEffect: -amt,
        remarks: getCleanGuestRemarks(b.remarks) || 'Check-in balance assigned to Irshad',
        createdAt: b.createdAt || '',
        raw: b,
      });
    });

    // 3. Settlements
    settlements.forEach((s) => {
      const isResortPaid = s.transactionType === 'resort_paid_irshad';
      list.push({
        id: `set_${s.id}`,
        type: 'settlement',
        date: s.transactionDate || '',
        title: isResortPaid ? 'Settlement (Resort → Irshad)' : 'Settlement (Irshad → Resort)',
        category: 'Settlement',
        amount: s.amount || 0,
        paidBy: isResortPaid ? 'Resort' : 'Irshad',
        transactionType: s.transactionType,
        walletEffect: isResortPaid ? -s.amount : s.amount,
        remarks: s.remarks || 'Settlement payment',
        createdAt: s.createdAt || '',
        raw: s,
      });
    });

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, bookings, settlements]);

  // Compute Running Cumulative Balance for Each Date
  const dateWalletBalances = useMemo(() => {
    const sortedAsc = [...unifiedTimelineItems].sort((a, b) => a.date.localeCompare(b.date));
    const balanceMap = new Map<string, number>();
    let runningBalance = 0;

    sortedAsc.forEach((item) => {
      let effect = 0;
      if (item.type === 'expense') {
        effect = item.amount;
      } else if (item.type === 'booking') {
        effect = -item.amount;
      } else if (item.type === 'settlement') {
        effect = item.transactionType === 'resort_paid_irshad' ? -item.amount : item.amount;
      }
      runningBalance += effect;
      balanceMap.set(item.date, runningBalance);
    });

    return balanceMap;
  }, [unifiedTimelineItems]);

  // Helper: Get weekday name
  const getDayOfWeekName = (ymdStr: string): string => {
    try {
      const parts = ymdStr.split('-').map(Number);
      if (parts.length !== 3) return '';
      const date = new Date(parts[0], parts[1] - 1, parts[2]);
      return date.toLocaleDateString('en-IN', { weekday: 'long' });
    } catch {
      return '';
    }
  };

  // Helper: Get Left Accent Border color matching Expense Ledger spec
  const getLeftAccentBorder = (category: string, type: string) => {
    const catLower = (category || '').toLowerCase();
    if (catLower.includes('rent')) return 'border-l-4 border-l-purple-600';
    if (catLower.includes('salary') || catLower.includes('staff')) return 'border-l-4 border-l-emerald-600';
    if (type === 'booking') return 'border-l-4 border-l-blue-600';
    if (type === 'settlement') return 'border-l-4 border-l-indigo-600';
    return 'border-l-4 border-l-amber-500';
  };

  // Filtered Timeline
  const filteredTimeline = useMemo(() => {
    return unifiedTimelineItems.filter((item) => {
      // Month Filter
      if (selectedMonth !== 'ALL' && !item.date.startsWith(selectedMonth)) return false;

      // Date Filter
      if (dateFilter && item.date !== dateFilter) return false;

      // Filter Pill Selection
      if (categoryFilter !== 'ALL') {
        const c = categoryFilter.toLowerCase();
        const cat = (item.category || '').toLowerCase();
        const paidBy = (item.paidBy || '').toLowerCase();

        if (c === 'wallet_credit' || c === 'wallet credit') {
          if (item.walletEffect <= 0) return false;
        } else if (c === 'wallet_debit' || c === 'wallet debit') {
          if (item.walletEffect >= 0) return false;
        } else if (c === 'irshad_paid' || c === 'irshad paid') {
          if (!paidBy.includes('irshad') && item.walletEffect <= 0) return false;
        } else if (c === 'resort_paid' || c === 'resort paid') {
          if (!paidBy.includes('resort')) return false;
        } else if (c === 'salary') {
          if (!cat.includes('salary') && !cat.includes('staff')) return false;
        } else if (c === 'rent') {
          if (!cat.includes('rent')) return false;
        } else if (c === 'booking') {
          if (item.type !== 'booking') return false;
        } else if (c === 'expense') {
          if (item.type !== 'expense') return false;
        } else if (c === 'settlement') {
          if (item.type !== 'settlement') return false;
        } else {
          if (!cat.includes(c) && !paidBy.includes(c)) return false;
        }
      }

      // Search Query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchCat = (item.category || '').toLowerCase().includes(q);
        const matchRemarks = (item.remarks || '').toLowerCase().includes(q);
        const matchGuest = (item.guestName || '').toLowerCase().includes(q);
        const matchRes = (item.reservationId || '').toLowerCase().includes(q);
        const matchPaidBy = (item.paidBy || '').toLowerCase().includes(q);
        const matchAmt = String(item.amount).includes(q);
        if (!matchTitle && !matchCat && !matchRemarks && !matchGuest && !matchRes && !matchPaidBy && !matchAmt) {
          return false;
        }
      }

      return true;
    });
  }, [unifiedTimelineItems, selectedMonth, dateFilter, categoryFilter, searchTerm]);

  // Grouped Timeline by Date
  const groupedTimelineByDate = useMemo(() => {
    const map = new Map<string, typeof filteredTimeline>();
    filteredTimeline.forEach((item) => {
      const key = item.date || 'Undated';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredTimeline]);

  // Monthly Overview Statistics
  const monthlyStats = useMemo(() => {
    const itemsToSum = selectedMonth === 'ALL'
      ? unifiedTimelineItems
      : unifiedTimelineItems.filter((item) => item.date.startsWith(selectedMonth));

    let expSum = 0;
    let colSum = 0;
    let setSum = 0;

    itemsToSum.forEach((item) => {
      if (item.type === 'expense') expSum += item.amount;
      if (item.type === 'booking') colSum += item.amount;
      if (item.type === 'settlement') {
        if (item.transactionType === 'resort_paid_irshad') setSum += item.amount;
        else setSum -= item.amount;
      }
    });

    return {
      expenses: expSum,
      collections: colSum,
      settlements: setSum,
      count: itemsToSum.length,
    };
  }, [unifiedTimelineItems, selectedMonth]);

  // Date Formatter
  const formatDateHeader = (dateStr: string) => {
    if (!dateStr || dateStr === 'Undated') return 'Undated';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      if (!isNaN(dateObj.getTime())) {
        const day = String(parts[2]).padStart(2, '0');
        const monthShort = dateObj.toLocaleDateString('en-IN', { month: 'short' });
        const year = parts[0];
        return `${day} ${monthShort} ${year}`;
      }
    }
    return dateStr;
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-500 font-medium text-xs flex flex-col items-center justify-center space-y-2 min-h-[300px]">
        <div className="w-7 h-7 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <span className="font-bold text-slate-600">Loading Irshad Ledger...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans pb-24" id="irshad_ledger_viewport">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-3 right-3 left-3 sm:left-auto z-50 bg-emerald-800 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. SUMMARY CARDS (Identical to Expense Ledger) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white border border-slate-200/90 p-3 sm:p-3.5 rounded-2xl shadow-2xs">
          <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider block">Net Balance</span>
          <p className={`text-lg sm:text-xl font-mono font-extrabold tracking-tight mt-0.5 ${netWalletBalance > 0 ? 'text-emerald-600' : netWalletBalance < 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            ₹{Math.abs(netWalletBalance).toLocaleString('en-IN')}
          </p>
          <span className="text-[10px] font-medium text-slate-500 block truncate">
            {netWalletBalance > 0 ? 'Resort Owes Irshad' : netWalletBalance < 0 ? 'Irshad Owes Resort' : 'Accounts Settled'}
          </span>
        </div>

        <div className="bg-white border border-slate-200/90 p-3 sm:p-3.5 rounded-2xl shadow-2xs">
          <span className="text-[10px] font-extrabold uppercase text-purple-600 tracking-wider block">Expenses</span>
          <p className="text-lg sm:text-xl font-mono font-extrabold text-slate-900 mt-0.5">
            ₹{personalExpenses.toLocaleString('en-IN')}
          </p>
          <span className="text-[10px] font-medium text-slate-500 block truncate">Irshad Paid</span>
        </div>

        <div className="bg-white border border-slate-200/90 p-3 sm:p-3.5 rounded-2xl shadow-2xs">
          <span className="text-[10px] font-extrabold uppercase text-blue-600 tracking-wider block">Collections</span>
          <p className="text-lg sm:text-xl font-mono font-extrabold text-slate-900 mt-0.5">
            ₹{bookingDues.toLocaleString('en-IN')}
          </p>
          <span className="text-[10px] font-medium text-slate-500 block truncate">Guest Collections</span>
        </div>

        <div className="bg-white border border-slate-200/90 p-3 sm:p-3.5 rounded-2xl shadow-2xs">
          <span className="text-[10px] font-extrabold uppercase text-emerald-600 tracking-wider block">Settlements</span>
          <p className="text-lg sm:text-xl font-mono font-extrabold text-slate-900 mt-0.5">
            ₹{Math.abs(settlementPaid).toLocaleString('en-IN')}
          </p>
          <span className="text-[10px] font-medium text-slate-500 block truncate">Cleared Settlements</span>
        </div>
      </div>

      {/* 2. FILTERS & SEARCH (Identical to Expense Ledger) */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search amount, category, remarks, partner..."
              className="w-full pl-9 pr-7 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs min-h-[38px]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Month Selector Dropdown */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[38px] cursor-pointer shadow-2xs"
          >
            <option value="ALL">All Months</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* Date Picker Input */}
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[38px] shadow-2xs"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              title="Clear Date"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Horizontal Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none touch-pan-x">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'wallet_credit', label: 'Wallet Credit' },
            { id: 'wallet_debit', label: 'Wallet Debit' },
            { id: 'irshad_paid', label: 'Irshad Paid' },
            { id: 'resort_paid', label: 'Resort Paid' },
            { id: 'salary', label: 'Salary' },
            { id: 'rent', label: 'Rent' },
            { id: 'booking', label: 'Booking' },
            { id: 'expense', label: 'Expense' },
          ].map((pill) => {
            const isSelected = categoryFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setCategoryFilter(pill.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer min-h-[34px] ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-2xs font-extrabold'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. TIMELINE GROUPS & LEDGER PAGE (Identical Layout to Expense Ledger) */}
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden"
        id="irshad_ledger_notebook_page"
      >
        {/* Ledger Page Header Banner */}
        <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
          <div>
            <span className="text-xs font-black uppercase tracking-wider block text-slate-200">
              Irshad Wallet Ledger
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase">
              {selectedMonth === 'ALL' ? 'All Transactions' : selectedMonth}
            </span>
          </div>

          <div className="text-right">
            <span className={`text-sm sm:text-base font-extrabold font-mono block ${netWalletBalance >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              Wallet ₹{Math.abs(netWalletBalance).toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              {filteredTimeline.length} {filteredTimeline.length === 1 ? 'Entry' : 'Entries'}
            </span>
          </div>
        </div>

        {/* Ledger Body Content */}
        {groupedTimelineByDate.length === 0 ? (
          <div className="p-8 text-center my-6 space-y-1">
            <p className="text-sm font-bold text-slate-800">No transactions found for this selection.</p>
            <p className="text-xs text-slate-400">Try clearing search or selecting "All" filter.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200/80">
            {groupedTimelineByDate.map(([dateKey, items]) => {
              const dayWalletChange = items.reduce((sum, i) => sum + (i.walletEffect || 0), 0);

              return (
                <div key={dateKey} className="bg-white">
                  {/* Date Section Header (Exactly like Expense Ledger) */}
                  <div className="bg-slate-50 px-3.5 py-1.5 flex items-center justify-between border-y border-slate-200/80 text-slate-800">
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <span className="text-slate-900 font-extrabold">{formatDateHeader(dateKey)}</span>
                      <span className="text-slate-400 font-normal">•</span>
                      <span className="text-slate-500 font-medium text-[11px] capitalize">{getDayOfWeekName(dateKey)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-extrabold font-mono text-slate-900 block">
                        Wallet Change {dayWalletChange >= 0 ? '+' : ''}₹{dayWalletChange.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {items.length} {items.length === 1 ? 'Entry' : 'Entries'}
                      </span>
                    </div>
                  </div>

                  {/* Transaction Compact Rows (With Colored Left Accent) */}
                  <div className="divide-y divide-slate-100">
                    {items.map((item) => {
                      const isExpanded = expandedId === item.id;
                      const accentClass = getLeftAccentBorder(item.category, item.type);

                      // Compact Partner / Category metadata string
                      const metaText = `${item.category} • ${item.paidBy}`;

                      return (
                        <div
                          key={item.id}
                          className={`hover:bg-slate-50 transition cursor-pointer ${accentClass}`}
                        >
                          <div
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                            className="px-3.5 py-2.5 flex items-center justify-between gap-3 select-none"
                          >
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <div className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5 flex-wrap">
                                <span>{item.title}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                                <span className="text-slate-600 font-semibold">{metaText}</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-sm sm:text-base font-extrabold font-mono text-slate-900 block">
                                ₹{item.amount.toLocaleString('en-IN')}
                              </span>
                              <span className="text-[10px] text-slate-500 font-medium block">
                                {item.type === 'expense'
                                  ? `Paid by ${item.paidBy}`
                                  : item.type === 'booking'
                                  ? 'Collected'
                                  : item.paidBy}
                              </span>
                            </div>
                          </div>

                          {/* Expandable Details Drawer */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.15 }}
                                className="px-3.5 py-2.5 bg-slate-50/80 border-t border-slate-100 space-y-2 text-xs"
                              >
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-slate-600">
                                  <div>
                                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Payer / Partner</span>
                                    <span className="font-semibold text-slate-900">{item.paidBy}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Category</span>
                                    <span className="font-semibold text-slate-900">{item.category}</span>
                                  </div>
                                  {item.reservationId && (
                                    <div>
                                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Reservation ID</span>
                                      <span className="font-mono font-bold text-indigo-700">{item.reservationId}</span>
                                    </div>
                                  )}
                                  <div>
                                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Wallet Impact</span>
                                    <span className={`font-semibold ${item.walletEffect >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                                      {item.walletEffect >= 0 ? `+₹${item.walletEffect.toLocaleString('en-IN')}` : `-₹${Math.abs(item.walletEffect).toLocaleString('en-IN')}`}
                                    </span>
                                  </div>
                                </div>

                                {item.remarks && (
                                  <div className="pt-1 text-[11px] text-slate-600 italic">
                                    Remarks: {item.remarks}
                                  </div>
                                )}

                                {item.type === 'booking' && (
                                  <div className="pt-1 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={(e) => handleOpenPayModal(item.raw, e)}
                                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
                                    >
                                      Settle Booking Due
                                    </button>
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. FLOATING ACTION BUTTON */}
      <div className="fixed bottom-6 right-5 z-40">
        <button
          type="button"
          onClick={() => setIsSettlementModalOpen(true)}
          className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-extrabold text-xs rounded-full shadow-2xl transition flex items-center gap-2 cursor-pointer border-2 border-white active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Record Settlement</span>
        </button>
      </div>

      {/* ----------------------------------------------------
          RECORD SETTLEMENT POPUP MODAL
         ---------------------------------------------------- */}
      {isSettlementModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md my-auto overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
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

            <form onSubmit={handleRecordSettlement} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">
                  Transaction Type *
                </label>
                <select
                  value={settlementType}
                  onChange={(e) => setSettlementType(e.target.value as any)}
                  className="w-full rounded-2xl border border-slate-200 p-3 font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 min-h-[44px] cursor-pointer bg-white"
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
                  className="w-full rounded-2xl border border-slate-200 p-3 font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 min-h-[44px]"
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
                  placeholder="Enter settlement amount"
                  className="w-full rounded-2xl border border-slate-200 p-3 font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 min-h-[44px]"
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
                  placeholder="e.g. Bank transfer settlement payment"
                  className="w-full rounded-2xl border border-slate-200 p-3 font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 min-h-[44px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSettlementModalOpen(false)}
                  className="flex-1 py-3 border border-slate-200 font-bold text-slate-700 rounded-2xl hover:bg-slate-50 cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-2xl shadow-sm cursor-pointer min-h-[44px]"
                >
                  {isSubmitting ? 'Recording...' : 'Save Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          COLLECT BOOKING PAYMENT POPUP MODAL
         ---------------------------------------------------- */}
      {selectedBookingForPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md my-auto overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
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

            <form onSubmit={handleCollectBookingPayment} className="p-5 space-y-3.5 text-xs">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                <p className="font-extrabold text-slate-900 text-sm">
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
                  className="w-full rounded-2xl border border-slate-200 p-3 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
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
                  className="w-full rounded-2xl border border-slate-200 p-3 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">
                  Payment Method *
                </label>
                <select
                  value={payMethodInput}
                  onChange={(e) => setPayMethodInput(e.target.value as any)}
                  className="w-full rounded-2xl border border-slate-200 p-3 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px] cursor-pointer bg-white"
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
                  className="w-full rounded-2xl border border-slate-200 p-3 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedBookingForPayment(null)}
                  className="flex-1 py-3 border border-slate-200 font-bold text-slate-700 rounded-2xl hover:bg-slate-50 cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBookingPay}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-sm cursor-pointer min-h-[44px]"
                >
                  {isSubmittingBookingPay ? 'Processing...' : 'Collect Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
