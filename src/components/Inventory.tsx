import React, { useState, useMemo, useRef } from 'react';
import { Expense, ExpenseCategory } from '../types';
import { useHotelData } from '../context/HotelContext';
import { formatDateDDMMYYYY } from '../utils/formatters';
import {
  Plus,
  Search,
  Trash2,
  Edit2,
  Copy,
  X,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  ChevronDown,
  Receipt,
  BookOpen,
} from 'lucide-react';

const ALLOWED_CATEGORIES: ExpenseCategory[] = [
  'Groceries',
  'Meat',
  'Cleaning',
  'Electricity Bill',
  'Laundry',
  'Raw Materials',
  'Electrical Items',
  'Furniture',
  'Improvement',
  'Miscellaneous',
  'Other',
];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Helper: Get today's YYYY-MM-DD string in Asia/Kolkata (Indian Standard Time)
const getTodayISTStr = (): string => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date()); // Outputs "YYYY-MM-DD" in Asia/Kolkata
  } catch {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
};

// Helper: Get weekday name (e.g., "Friday") for YYYY-MM-DD string
const getDayOfWeekName = (ymdStr: string): string => {
  try {
    const parts = ymdStr.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString('en-IN', { weekday: 'long' });
  } catch {
    return '';
  }
};

// Helper: Format time string from createdAt or default
const formatExpenseTime = (createdAtStr?: string): string => {
  if (!createdAtStr) return '10:00 AM';
  try {
    const d = new Date(createdAtStr);
    if (isNaN(d.getTime())) return '10:00 AM';
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '10:00 AM';
  }
};

// Local date arithmetic helper
const addDays = (ymdStr: string, deltaDays: number): string => {
  const parts = ymdStr.split('-').map(Number);
  const y = parts[0] || 2026;
  const m = parts[1] || 8;
  const d = parts[2] || 1;
  const date = new Date(y, m - 1, d + deltaDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function Inventory() {
  const { expenses, addExpense, updateExpense, deleteExpense } = useHotelData();

  // 1. Single Source of Truth for Date Engine (Default = IST Today e.g., 01/08/2026)
  const todayStr = useMemo(() => getTodayISTStr(), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Derived Month (YYYY-MM)
  const selectedMonthStr = useMemo(() => selectedDate.substring(0, 7), [selectedDate]);

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Month Picker Bottom Sheet State
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(Number(selectedDate.split('-')[0]) || 2026);

  // Detail Modal / Sheet
  const [selectedExpenseDetail, setSelectedExpenseDetail] = useState<Expense | null>(null);

  // Add/Edit Form Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Form Fields
  const [expenseDate, setExpenseDate] = useState(selectedDate);
  const [category, setCategory] = useState<ExpenseCategory>('Groceries');
  const [itemNameInput, setItemNameInput] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [remarks, setRemarks] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Animation effect state on page flip
  const [slideAnim, setSlideAnim] = useState<'left' | 'right' | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // 2. STRICT DATA ISOLATION (Only Inventory & Operations; NO Salary, NO Rent)
  const inventoryExpensesOnly = useMemo(() => {
    return expenses.filter((exp) => {
      const catLower = (exp.category || '').toLowerCase();
      const nameLower = (exp.itemName || '').toLowerCase();
      const remarksLower = (exp.remarks || '').toLowerCase();

      if (catLower === 'salary' || catLower === 'rent') return false;
      if (nameLower.includes('salary') || nameLower.includes('rent') || nameLower.includes('salman')) return false;
      if (remarksLower.includes('salary') || remarksLower.includes('rent')) return false;

      return true;
    });
  }, [expenses]);

  // 3. DAILY & MONTHLY DERIVED EXPENSES
  const dailyExpenses = useMemo(() => {
    return inventoryExpensesOnly.filter((exp) => exp.expenseDate === selectedDate);
  }, [inventoryExpensesOnly, selectedDate]);

  const monthlyExpenses = useMemo(() => {
    return inventoryExpensesOnly.filter((exp) => exp.expenseDate && exp.expenseDate.startsWith(selectedMonthStr));
  }, [inventoryExpensesOnly, selectedMonthStr]);

  // Daily & Month Totals
  const dailyTotal = useMemo(() => {
    return dailyExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  }, [dailyExpenses]);

  const dailyCount = dailyExpenses.length;

  const monthTotal = useMemo(() => {
    return monthlyExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  }, [monthlyExpenses]);

  // 4. VISIBLE LEDGER ROWS
  const visibleExpenses = useMemo(() => {
    // Search searches within currently selected month; category filters visible day
    const source = searchQuery.trim() ? monthlyExpenses : dailyExpenses;
    return source
      .filter((exp) => {
        if (selectedCategory !== 'ALL' && exp.category !== selectedCategory) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const displayName = (exp.itemName || exp.category).toLowerCase();
          const expCat = (exp.category || '').toLowerCase();
          const expNotes = (exp.remarks || '').toLowerCase();
          if (!displayName.includes(q) && !expCat.includes(q) && !expNotes.includes(q)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt));
  }, [dailyExpenses, monthlyExpenses, searchQuery, selectedCategory]);

  // 5. DATE NAVIGATION & SWIPE ENGINE
  const triggerSlideAnimation = (dir: 'left' | 'right') => {
    setSlideAnim(dir);
    setTimeout(() => setSlideAnim(null), 200);
  };

  const handlePrevDay = () => {
    triggerSlideAnimation('right');
    setSelectedDate((prev) => addDays(prev, -1));
  };

  const handleNextDay = () => {
    triggerSlideAnimation('left');
    setSelectedDate((prev) => addDays(prev, 1));
  };

  const handleGoToToday = () => {
    triggerSlideAnimation('left');
    setSelectedDate(todayStr);
  };

  const handleSelectMonthAndYear = (yearNum: number, monthIndex0: number) => {
    const currentDay = Number(selectedDate.split('-')[2]) || 1;
    const daysInTargetMonth = new Date(yearNum, monthIndex0 + 1, 0).getDate();
    const targetDay = Math.min(currentDay, daysInTargetMonth);
    const mm = String(monthIndex0 + 1).padStart(2, '0');
    const dd = String(targetDay).padStart(2, '0');
    setSelectedDate(`${yearNum}-${mm}-${dd}`);
    setIsMonthPickerOpen(false);
  };

  // Touch Swipe Gesture for Page Turning
  const touchStartXRef = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchEndX - touchStartXRef.current;
    touchStartXRef.current = null;

    if (Math.abs(diffX) > 45) {
      if (diffX > 0) {
        handlePrevDay(); // Swipe right -> Previous Day Page
      } else {
        handleNextDay(); // Swipe left -> Next Day Page
      }
    }
  };

  // FORM & MODAL HANDLERS
  const handleOpenAddModal = (presetDate?: string) => {
    setEditingExpense(null);
    setExpenseDate(presetDate || selectedDate);
    setCategory('Groceries');
    setItemNameInput('');
    setAmount('');
    setRemarks('');
    setErrorMsg(null);
    setSelectedExpenseDetail(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (exp: Expense) => {
    setEditingExpense(exp);
    setExpenseDate(exp.expenseDate || selectedDate);
    setCategory((exp.category as ExpenseCategory) || 'Groceries');
    setItemNameInput(exp.itemName || '');
    setAmount(exp.amount || '');
    setRemarks(exp.remarks || '');
    setErrorMsg(null);
    setSelectedExpenseDetail(null);
    setIsFormModalOpen(true);
  };

  const handleDuplicate = (exp: Expense) => {
    setEditingExpense(null);
    setExpenseDate(selectedDate);
    setCategory((exp.category as ExpenseCategory) || 'Groceries');
    setItemNameInput(exp.itemName || '');
    setAmount(exp.amount || '');
    setRemarks(exp.remarks ? `${exp.remarks} (Copy)` : '');
    setErrorMsg(null);
    setSelectedExpenseDetail(null);
    setIsFormModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount === '' || Number(amount) <= 0 || isNaN(Number(amount))) {
      setErrorMsg('Please enter a valid amount (₹)');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const finalItemName = itemNameInput.trim() || category;

    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, {
          expenseDate,
          category,
          itemName: finalItemName,
          amount: Number(amount),
          remarks: remarks.trim(),
        });
        showToast('✓ Ledger entry updated!');
      } else {
        await addExpense({
          expenseDate,
          category,
          itemName: finalItemName,
          amount: Number(amount),
          remarks: remarks.trim(),
        });
        showToast('✓ Expense added to ledger!');
      }
      setIsFormModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this ledger expense record?')) {
      try {
        await deleteExpense(id);
        setSelectedExpenseDetail(null);
        showToast('✓ Expense deleted!');
      } catch (err: any) {
        alert('Failed to delete expense');
      }
    }
  };

  // Month Title (e.g. "August 2026")
  const monthTitle = useMemo(() => {
    const parts = selectedDate.split('-').map(Number);
    const mIdx = (parts[1] || 8) - 1;
    const yearNum = parts[0] || 2026;
    return `${MONTH_NAMES[mIdx]} ${yearNum}`;
  }, [selectedDate]);

  // Weekday Name (e.g. "Friday")
  const weekdayName = useMemo(() => getDayOfWeekName(selectedDate), [selectedDate]);

  return (
    <div className="space-y-3 pb-24 relative select-none font-sans" id="indian_accounting_ledger">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-3 right-3 left-3 sm:left-auto sm:w-auto z-50 bg-emerald-800 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. STICKY TOP SUMMARY (Today's Expense & Month Total) */}
      <div className="grid grid-cols-2 gap-2 sticky top-0 z-20 bg-slate-100/90 backdrop-blur-md pt-1 pb-2">
        {/* Today's Expense Card */}
        <div className="p-3 bg-amber-50 border border-amber-200/90 rounded-2xl shadow-2xs space-y-0.5">
          <span className="text-[10px] text-amber-900 font-black uppercase tracking-wider font-mono block">
            Today's Expense
          </span>
          <div className="text-xl font-black text-amber-950 font-mono tracking-tight">
            ₹{dailyTotal.toLocaleString()}
          </div>
          <span className="text-[10px] text-amber-800 font-extrabold font-mono block">
            {dailyCount} {dailyCount === 1 ? 'Entry' : 'Entries'}
          </span>
        </div>

        {/* This Month Expense Card */}
        <div className="p-3 bg-purple-50 border border-purple-200/90 rounded-2xl shadow-2xs space-y-0.5">
          <span className="text-[10px] text-purple-900 font-black uppercase tracking-wider font-mono block">
            This Month Expense
          </span>
          <div className="text-xl font-black text-purple-950 font-mono tracking-tight">
            ₹{monthTotal.toLocaleString()}
          </div>
          <span className="text-[10px] text-purple-800 font-extrabold uppercase tracking-wider block">
            {monthTitle.split(' ')[0]} Total
          </span>
        </div>
      </div>

      {/* 2. COMPACT MONTH SELECTOR */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            setPickerYear(Number(selectedDate.split('-')[0]) || 2026);
            setIsMonthPickerOpen(true);
          }}
          className="inline-flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-gray-200 shadow-2xs text-gray-900 font-black text-xs hover:bg-gray-50 active:bg-gray-100 transition cursor-pointer min-h-[38px]"
        >
          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
          <span className="uppercase font-mono text-indigo-950 font-black">{monthTitle}</span>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        </button>

        {selectedDate !== todayStr && (
          <button
            onClick={handleGoToToday}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-black text-xs rounded-xl shadow-2xs transition active:scale-95 cursor-pointer"
          >
            Go to Today
          </button>
        )}
      </div>

      {/* 3. DATE NAVIGATION (Directly Above Ledger Entries) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-2xs text-center space-y-1">
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrevDay}
            className="p-2.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl text-gray-800 transition active:scale-95 cursor-pointer flex items-center justify-center min-h-[42px] min-w-[42px]"
            title="Previous Day Page"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="space-y-0.5">
            <div className="text-base sm:text-lg font-black text-gray-900 font-mono tracking-tight">
              {formatDateDDMMYYYY(selectedDate)}
            </div>
            <div className="text-xs font-bold text-indigo-600 uppercase tracking-widest font-mono">
              {weekdayName}
            </div>
          </div>

          <button
            onClick={handleNextDay}
            className="p-2.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl text-gray-800 transition active:scale-95 cursor-pointer flex items-center justify-center min-h-[42px] min-w-[42px]"
            title="Next Day Page"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* 4. SEARCH BAR & CATEGORY FILTERS */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search month's expenses..."
            className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs min-h-[38px]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Horizontal Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none touch-pan-x">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer min-h-[34px] ${
              selectedCategory === 'ALL'
                ? 'bg-indigo-600 text-white shadow-2xs font-extrabold'
                : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
            }`}
          >
            All
          </button>
          {ALLOWED_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? 'ALL' : cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer min-h-[34px] ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-2xs font-extrabold'
                  : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 5. INDIAN ACCOUNTING REGISTER LEDGER PAGE */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`bg-white border-2 border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all duration-200 ease-out transform ${
          slideAnim === 'left'
            ? '-translate-x-3 opacity-70'
            : slideAnim === 'right'
            ? 'translate-x-3 opacity-70'
            : 'translate-x-0 opacity-100'
        }`}
        id="ledger_notebook_page"
      >
        {/* Ledger Page Header Banner */}
        <div className="bg-slate-950 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800">
          <div>
            <span className="text-xs font-black uppercase tracking-wider font-mono block text-slate-300">
              {formatDateDDMMYYYY(selectedDate)}
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase">{weekdayName}</span>
          </div>

          <div className="text-right">
            <span className="text-sm font-black font-mono text-amber-400 block">
              ₹{dailyTotal.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {dailyCount} {dailyCount === 1 ? 'Entry' : 'Entries'}
            </span>
          </div>
        </div>

        {/* Ledger Entries List */}
        {visibleExpenses.length === 0 ? (
          /* DAILY EMPTY STATE */
          <div className="p-8 text-center space-y-2 text-slate-500 my-4">
            <div className="text-xs font-black font-mono text-slate-900">
              {formatDateDDMMYYYY(selectedDate)} ({weekdayName})
            </div>
            <p className="text-xs font-medium text-slate-600">No expenses recorded.</p>
            <p className="text-[11px] text-slate-400 font-mono">Tap + to add an expense.</p>
          </div>
        ) : (
          /* STACKED LEDGER ROWS WITH REGISTER DIVIDERS */
          <div className="divide-y divide-slate-200">
            {visibleExpenses.map((exp) => (
              <div
                key={exp.id}
                onClick={() => setSelectedExpenseDetail(exp)}
                className="p-3.5 sm:p-4 hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer flex items-center justify-between gap-3"
              >
                {/* Left: Item Name & Category */}
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="text-sm sm:text-base font-black text-slate-900 tracking-tight truncate">
                    {exp.itemName || exp.category}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 font-mono flex-wrap">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md border border-slate-200 font-sans uppercase text-[9px]">
                      {exp.category}
                    </span>
                    <span>•</span>
                    <span>{formatExpenseTime(exp.createdAt)}</span>
                  </div>
                  {exp.remarks && (
                    <p className="text-xs text-slate-600 font-medium italic line-clamp-1">
                      {exp.remarks}
                    </p>
                  )}
                </div>

                {/* Right: Amount */}
                <div className="text-right shrink-0">
                  <span className="text-base sm:text-lg font-black text-slate-950 font-mono block">
                    ₹{exp.amount.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. FLOATING ADD EXPENSE (+) FAB */}
      <button
        onClick={() => handleOpenAddModal(selectedDate)}
        className="fixed bottom-6 right-5 z-40 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white p-4 rounded-full shadow-2xl flex items-center justify-center transition active:scale-95 cursor-pointer border-2 border-white min-h-[56px] min-w-[56px]"
        title="Add Expense"
        id="fab_add_expense_bottom_right"
      >
        <Plus className="w-6 h-6 stroke-[3]" />
      </button>

      {/* 7. MONTH PICKER BOTTOM SHEET */}
      {isMonthPickerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl border border-gray-200 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                Select Month
              </h3>
              <button
                onClick={() => setIsMonthPickerOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Year Navigation */}
            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-2xl border border-gray-200 font-mono font-black text-sm">
              <button
                onClick={() => setPickerYear((y) => y - 1)}
                className="p-2 bg-white rounded-xl shadow-2xs text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-base text-gray-900 font-black">{pickerYear}</span>
              <button
                onClick={() => setPickerYear((y) => y + 1)}
                className="p-2 bg-white rounded-xl shadow-2xs text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* 12 Months Grid */}
            <div className="grid grid-cols-3 gap-2">
              {MONTH_NAMES.map((mName, idx) => {
                const isSelected =
                  pickerYear === Number(selectedDate.split('-')[0]) &&
                  idx === Number(selectedDate.split('-')[1]) - 1;

                return (
                  <button
                    key={mName}
                    onClick={() => handleSelectMonthAndYear(pickerYear, idx)}
                    className={`py-3 px-2 rounded-xl text-xs font-bold transition text-center cursor-pointer min-h-[44px] ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-extrabold shadow-sm'
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-100'
                    }`}
                  >
                    {mName}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 8. EXPENSE DETAIL MODAL */}
      {selectedExpenseDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white w-full max-w-sm sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Receipt className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-extrabold text-sm text-gray-900">
                    {selectedExpenseDetail.itemName || selectedExpenseDetail.category}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-mono">
                    {formatDateDDMMYYYY(selectedExpenseDetail.expenseDate)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedExpenseDetail(null)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Info Body */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2 border border-gray-100">
              <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                <span className="text-xs font-bold text-gray-500">Amount:</span>
                <span className="text-lg font-black text-gray-900 font-mono">
                  ₹{selectedExpenseDetail.amount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                <span className="text-xs font-bold text-gray-500">Category:</span>
                <span className="text-xs font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100">
                  {selectedExpenseDetail.category}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                <span className="text-xs font-bold text-gray-500">Date:</span>
                <span className="text-xs font-extrabold text-gray-800 font-mono">
                  {formatDateDDMMYYYY(selectedExpenseDetail.expenseDate)}
                </span>
              </div>
              {selectedExpenseDetail.remarks && (
                <div className="pt-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                    Notes / Remarks:
                  </span>
                  <p className="text-xs font-medium text-gray-700 bg-white p-2.5 rounded-xl border border-gray-200">
                    {selectedExpenseDetail.remarks}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleDuplicate(selectedExpenseDetail)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
              >
                <Copy className="w-4 h-4 text-gray-600" />
                <span>Duplicate</span>
              </button>

              <button
                onClick={() => handleOpenEditModal(selectedExpenseDetail)}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs min-h-[44px]"
              >
                <Edit2 className="w-4 h-4" />
                <span>Edit</span>
              </button>

              <button
                onClick={() => handleDelete(selectedExpenseDetail.id)}
                className="p-3 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl flex items-center justify-center cursor-pointer min-h-[44px] min-w-[44px]"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. ADD / EDIT EXPENSE FORM MODAL */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-sm sm:max-w-md my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                {editingExpense ? 'Edit Ledger Record' : 'Add Ledger Expense'}
              </h3>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer transition min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              {errorMsg && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold">
                  {errorMsg}
                </div>
              )}

              {/* Expense Date */}
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Expense Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Category <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px] cursor-pointer"
                >
                  {ALLOWED_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Item Name */}
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Item Name <span className="text-gray-400 font-normal lowercase">(e.g. Milk, Chicken, Paint)</span>
                </label>
                <input
                  type="text"
                  value={itemNameInput}
                  onChange={(e) => setItemNameInput(e.target.value)}
                  placeholder={`Default to "${category}"`}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Amount (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  value={amount === '' ? '' : amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Notes / Remarks <span className="text-gray-400 font-normal lowercase">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Purchased 5 liters"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* Submit / Cancel */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="flex-1 py-3 border border-gray-200 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-50 cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-md cursor-pointer disabled:bg-gray-200 min-h-[44px]"
                >
                  {isSubmitting ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
