import React, { useState, useMemo, useRef } from 'react';
import { Expense, ExpenseCategory } from '../types';
import { useHotelData } from '../context/HotelContext';
import { formatDateDDMMYYYY, getISTDateStr, getISTMonthStr } from '../utils/formatters';
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
  ArrowUpDown,
  SlidersHorizontal,
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
const getTodayISTStr = (): string => getISTDateStr();

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

// Helper: Format YYYY-MM-DD into clean ledger header (e.g. "01 Aug 2026" and "Saturday")
const formatLedgerDateHeader = (ymdStr: string): { dateFormatted: string; weekday: string } => {
  try {
    const parts = ymdStr.split('-').map(Number);
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    const day = String(parts[2]).padStart(2, '0');
    const monthShort = MONTH_NAMES[parts[1] - 1]?.substring(0, 3) || 'Aug';
    const year = parts[0];
    const weekday = dateObj.toLocaleDateString('en-IN', { weekday: 'long' });
    return {
      dateFormatted: `${day} ${monthShort} ${year}`,
      weekday,
    };
  } catch {
    return { dateFormatted: ymdStr, weekday: '' };
  }
};

// Helper: Get week ranges for a given year and month (1-indexed month)
export interface WeekRange {
  weekNum: number;
  startDateStr: string; // YYYY-MM-DD
  endDateStr: string;   // YYYY-MM-DD
  label: string;
}

export const getWeeksOfMonth = (year: number, month1Indexed: number): WeekRange[] => {
  const daysInMonth = new Date(year, month1Indexed, 0).getDate();
  const weeks: WeekRange[] = [];

  let currentDay = 1;
  let weekNum = 1;

  while (currentDay <= daysInMonth) {
    const startDay = currentDay;
    const startDateObj = new Date(year, month1Indexed - 1, startDay);
    const dayOfWeek = startDateObj.getDay(); // 0 = Sun, 1 = Mon... 6 = Sat

    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const endDay = Math.min(daysInMonth, startDay + daysUntilSunday);

    const mm = String(month1Indexed).padStart(2, '0');
    const startStr = `${year}-${mm}-${String(startDay).padStart(2, '0')}`;
    const endStr = `${year}-${mm}-${String(endDay).padStart(2, '0')}`;

    const mNameShort = MONTH_NAMES[month1Indexed - 1]?.substring(0, 3) || 'Aug';
    const label = `Week ${weekNum} (${String(startDay).padStart(2, '0')} ${mNameShort} - ${String(endDay).padStart(2, '0')} ${mNameShort})`;

    weeks.push({
      weekNum,
      startDateStr: startStr,
      endDateStr: endStr,
      label,
    });

    currentDay = endDay + 1;
    weekNum++;
  }

  return weeks;
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

export type ViewMode = 'daily' | 'weekly' | 'monthly' | 'custom';

export type SortOption =
  | 'newest'
  | 'oldest'
  | 'amount_desc'
  | 'amount_asc'
  | 'name_asc'
  | 'name_desc';

export type AmountFilterOption =
  | 'ALL'
  | '0-500'
  | '500-2000'
  | '2000-5000'
  | '5000+'
  | 'custom';

export type DateFilterOption =
  | 'ALL'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'custom_range';

export type StatusFilterOption = 'ALL' | 'with_notes' | 'without_notes';

export default function Inventory() {
  const { expenses, addExpense, updateExpense, deleteExpense } = useHotelData();

  // 1. Single Source of Truth for Date Engine (Default = IST Today e.g., 01/08/2026)
  const todayStr = useMemo(() => getTodayISTStr(), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // View Mode (Daily, Weekly, Full Month, Custom Range) - persisted in localStorage
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('expense_ledger_view_mode');
    return (saved === 'weekly' || saved === 'monthly' || saved === 'custom') ? saved : 'daily';
  });

  const handleViewModeChange = (newMode: ViewMode) => {
    if (newMode === 'custom' && viewMode === 'custom') {
      setIsCustomRangeModalOpen(true);
      return;
    }
    setViewMode(newMode);
    localStorage.setItem('expense_ledger_view_mode', newMode);
    if (newMode === 'custom') {
      setIsCustomRangeModalOpen(true);
    }
  };

  // Custom Range State
  const [customFromDate, setCustomFromDate] = useState<string>(() => {
    const savedFrom = localStorage.getItem('expense_ledger_custom_from');
    if (savedFrom) return savedFrom;
    const parts = todayStr.split('-');
    return `${parts[0]}-${parts[1]}-01`;
  });
  const [customToDate, setCustomToDate] = useState<string>(() => {
    const savedTo = localStorage.getItem('expense_ledger_custom_to');
    if (savedTo) return savedTo;
    return todayStr;
  });
  const [isCustomRangeModalOpen, setIsCustomRangeModalOpen] = useState(false);
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);

  // Sorting & Filtering State
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [isSortOpen, setIsSortOpen] = useState(false);

  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterAmountType, setFilterAmountType] = useState<AmountFilterOption>('ALL');
  const [filterMinAmount, setFilterMinAmount] = useState<number | ''>('');
  const [filterMaxAmount, setFilterMaxAmount] = useState<number | ''>('');
  const [filterDateShortcut, setFilterDateShortcut] = useState<DateFilterOption>('ALL');
  const [filterEntryStatus, setFilterEntryStatus] = useState<StatusFilterOption>('ALL');

  // Derived Month (YYYY-MM)
  const selectedMonthStr = useMemo(() => selectedDate.substring(0, 7), [selectedDate]);

  // Derived Week Range for Weekly mode
  const activeWeek = useMemo(() => {
    const parts = selectedDate.split('-').map(Number);
    const year = parts[0] || 2026;
    const month = parts[1] || 8;
    const weeks = getWeeksOfMonth(year, month);

    const found = weeks.find(
      (w) => selectedDate >= w.startDateStr && selectedDate <= w.endDateStr
    );
    return found || weeks[0];
  }, [selectedDate]);

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
  const [paidBy, setPaidBy] = useState<'resort' | 'irshad'>('resort');

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

  // Dynamic Categories (includes custom ones)
  const allCategories = useMemo(() => {
    const set = new Set<string>(ALLOWED_CATEGORIES);
    inventoryExpensesOnly.forEach((exp) => {
      if (exp.category) set.add(exp.category);
    });
    return Array.from(set);
  }, [inventoryExpensesOnly]);

  // 3. DAILY, WEEKLY, MONTHLY & CUSTOM RANGE DERIVED EXPENSES
  const dailyExpenses = useMemo(() => {
    return inventoryExpensesOnly.filter((exp) => exp.expenseDate === selectedDate);
  }, [inventoryExpensesOnly, selectedDate]);

  const weeklyExpenses = useMemo(() => {
    return inventoryExpensesOnly.filter(
      (exp) => exp.expenseDate >= activeWeek.startDateStr && exp.expenseDate <= activeWeek.endDateStr
    );
  }, [inventoryExpensesOnly, activeWeek]);

  const monthlyExpenses = useMemo(() => {
    return inventoryExpensesOnly.filter((exp) => exp.expenseDate && exp.expenseDate.startsWith(selectedMonthStr));
  }, [inventoryExpensesOnly, selectedMonthStr]);

  const customExpenses = useMemo(() => {
    if (!customFromDate || !customToDate) return [];
    return inventoryExpensesOnly.filter(
      (exp) => exp.expenseDate >= customFromDate && exp.expenseDate <= customToDate
    );
  }, [inventoryExpensesOnly, customFromDate, customToDate]);

  // Totals
  const dailyTotal = useMemo(() => {
    return dailyExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  }, [dailyExpenses]);

  const dailyCount = dailyExpenses.length;

  const weeklyTotal = useMemo(() => {
    return weeklyExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  }, [weeklyExpenses]);

  const weeklyCount = weeklyExpenses.length;

  const monthTotal = useMemo(() => {
    return monthlyExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  }, [monthlyExpenses]);

  const customTotal = useMemo(() => {
    return customExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  }, [customExpenses]);

  const totalDaysInCustomRange = useMemo(() => {
    if (!customFromDate || !customToDate || customFromDate > customToDate) return 1;
    const parts1 = customFromDate.split('-').map(Number);
    const parts2 = customToDate.split('-').map(Number);
    const d1 = new Date(parts1[0], parts1[1] - 1, parts1[2]);
    const d2 = new Date(parts2[0], parts2[1] - 1, parts2[2]);
    const diffMs = d2.getTime() - d1.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diffDays);
  }, [customFromDate, customToDate]);

  const customAvgPerDay = useMemo(() => {
    return Math.round(customTotal / totalDaysInCustomRange);
  }, [customTotal, totalDaysInCustomRange]);

  // Days list for Weekly View
  const weekDays = useMemo(() => {
    const days: string[] = [];
    let cur = activeWeek.startDateStr;
    while (cur <= activeWeek.endDateStr) {
      days.push(cur);
      cur = addDays(cur, 1);
    }
    return days;
  }, [activeWeek]);

  // Days list for Full Month View
  const monthDays = useMemo(() => {
    const parts = selectedDate.split('-').map(Number);
    const year = parts[0] || 2026;
    const month = parts[1] || 8;
    const daysInMonth = new Date(year, month, 0).getDate();
    const days: string[] = [];
    const mm = String(month).padStart(2, '0');
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(`${year}-${mm}-${String(d).padStart(2, '0')}`);
    }
    return days;
  }, [selectedDate]);

  // Days list for Custom Range View
  const customDays = useMemo(() => {
    if (viewMode !== 'custom' || !customFromDate || !customToDate || customFromDate > customToDate) return [];
    const days: string[] = [];
    let cur = customFromDate;
    let safety = 0;
    while (cur <= customToDate && safety < 366) {
      days.push(cur);
      cur = addDays(cur, 1);
      safety++;
    }
    return days;
  }, [viewMode, customFromDate, customToDate]);

  // 4. VISIBLE LEDGER ROWS WITH COMBINED FILTERING & SORTING
  const visibleExpenses = useMemo(() => {
    let source = inventoryExpensesOnly;

    if (filterDateShortcut !== 'ALL') {
      if (filterDateShortcut === 'today') {
        source = source.filter((exp) => exp.expenseDate === todayStr);
      } else if (filterDateShortcut === 'yesterday') {
        const yest = addDays(todayStr, -1);
        source = source.filter((exp) => exp.expenseDate === yest);
      } else if (filterDateShortcut === 'this_week') {
        source = source.filter(
          (exp) => exp.expenseDate >= activeWeek.startDateStr && exp.expenseDate <= activeWeek.endDateStr
        );
      } else if (filterDateShortcut === 'last_week') {
        const startLastWk = addDays(activeWeek.startDateStr, -7);
        const endLastWk = addDays(activeWeek.endDateStr, -7);
        source = source.filter(
          (exp) => exp.expenseDate >= startLastWk && exp.expenseDate <= endLastWk
        );
      } else if (filterDateShortcut === 'this_month') {
        const currMonth = todayStr.substring(0, 7);
        source = source.filter((exp) => exp.expenseDate && exp.expenseDate.startsWith(currMonth));
      } else if (filterDateShortcut === 'last_month') {
        const parts = todayStr.split('-').map(Number);
        const prevDate = new Date(parts[0], parts[1] - 2, 1);
        const lastMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
        source = source.filter((exp) => exp.expenseDate && exp.expenseDate.startsWith(lastMonthStr));
      } else if (filterDateShortcut === 'this_year') {
        const currYear = todayStr.substring(0, 4);
        source = source.filter((exp) => exp.expenseDate && exp.expenseDate.startsWith(currYear));
      } else if (filterDateShortcut === 'custom_range') {
        source = source.filter(
          (exp) => exp.expenseDate >= customFromDate && exp.expenseDate <= customToDate
        );
      }
    } else {
      source =
        viewMode === 'daily'
          ? dailyExpenses
          : viewMode === 'weekly'
          ? weeklyExpenses
          : viewMode === 'monthly'
          ? monthlyExpenses
          : customExpenses;
    }

    const activeCat = filterCategory !== 'ALL' ? filterCategory : selectedCategory;

    return source
      .filter((exp) => {
        if (activeCat !== 'ALL' && exp.category !== activeCat) {
          return false;
        }

        if (filterAmountType === '0-500') {
          if (exp.amount < 0 || exp.amount > 500) return false;
        } else if (filterAmountType === '500-2000') {
          if (exp.amount < 500 || exp.amount > 2000) return false;
        } else if (filterAmountType === '2000-5000') {
          if (exp.amount < 2000 || exp.amount > 5000) return false;
        } else if (filterAmountType === '5000+') {
          if (exp.amount < 5000) return false;
        } else if (filterAmountType === 'custom') {
          if (filterMinAmount !== '' && exp.amount < Number(filterMinAmount)) return false;
          if (filterMaxAmount !== '' && exp.amount > Number(filterMaxAmount)) return false;
        }

        if (filterEntryStatus === 'with_notes') {
          if (!exp.remarks || !exp.remarks.trim()) return false;
        } else if (filterEntryStatus === 'without_notes') {
          if (exp.remarks && exp.remarks.trim()) return false;
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
      .sort((a, b) => {
        if (sortOption === 'newest') {
          return b.expenseDate.localeCompare(a.expenseDate) || (b.createdAt || '').localeCompare(a.createdAt || '');
        } else if (sortOption === 'oldest') {
          return a.expenseDate.localeCompare(b.expenseDate) || (a.createdAt || '').localeCompare(b.createdAt || '');
        } else if (sortOption === 'amount_desc') {
          return b.amount - a.amount;
        } else if (sortOption === 'amount_asc') {
          return a.amount - b.amount;
        } else if (sortOption === 'name_asc') {
          return (a.itemName || a.category).localeCompare(b.itemName || b.category);
        } else if (sortOption === 'name_desc') {
          return (a.itemName || a.category).localeCompare(b.itemName || b.category);
        }
        return b.expenseDate.localeCompare(a.expenseDate);
      });
  }, [
    inventoryExpensesOnly,
    dailyExpenses,
    weeklyExpenses,
    monthlyExpenses,
    customExpenses,
    viewMode,
    filterDateShortcut,
    filterCategory,
    selectedCategory,
    filterAmountType,
    filterMinAmount,
    filterMaxAmount,
    filterEntryStatus,
    searchQuery,
    sortOption,
    todayStr,
    activeWeek,
    customFromDate,
    customToDate,
  ]);

  const groupedExpensesByDate = useMemo(() => {
    const map = new Map<string, Expense[]>();
    visibleExpenses.forEach((exp) => {
      const dateKey = exp.expenseDate || todayStr;
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(exp);
    });
    const groups: { dateStr: string; items: Expense[]; total: number }[] = [];
    map.forEach((items, dateStr) => {
      const total = items.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      groups.push({ dateStr, items, total });
    });
    return groups;
  }, [visibleExpenses, todayStr]);

  const hasActiveFilters = useMemo(() => {
    return (
      filterCategory !== 'ALL' ||
      selectedCategory !== 'ALL' ||
      filterAmountType !== 'ALL' ||
      filterDateShortcut !== 'ALL' ||
      filterEntryStatus !== 'ALL' ||
      sortOption !== 'newest' ||
      Boolean(searchQuery.trim())
    );
  }, [
    filterCategory,
    selectedCategory,
    filterAmountType,
    filterDateShortcut,
    filterEntryStatus,
    sortOption,
    searchQuery,
  ]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterCategory !== 'ALL' || selectedCategory !== 'ALL') count++;
    if (filterAmountType !== 'ALL') count++;
    if (filterDateShortcut !== 'ALL') count++;
    if (filterEntryStatus !== 'ALL') count++;
    if (sortOption !== 'newest') count++;
    return count;
  }, [filterCategory, selectedCategory, filterAmountType, filterDateShortcut, filterEntryStatus, sortOption]);

  const handleClearAllFilters = () => {
    setFilterCategory('ALL');
    setSelectedCategory('ALL');
    setFilterAmountType('ALL');
    setFilterMinAmount('');
    setFilterMaxAmount('');
    setFilterDateShortcut('ALL');
    setFilterEntryStatus('ALL');
    setSortOption('newest');
    setSearchQuery('');
  };

  // 5. DATE NAVIGATION & SWIPE ENGINE
  const triggerSlideAnimation = (dir: 'left' | 'right') => {
    setSlideAnim(dir);
    setTimeout(() => setSlideAnim(null), 200);
  };

  const handlePrevPage = () => {
    triggerSlideAnimation('right');
    if (viewMode === 'daily') {
      setSelectedDate((prev) => addDays(prev, -1));
    } else if (viewMode === 'weekly') {
      setSelectedDate(addDays(activeWeek.startDateStr, -1));
    } else if (viewMode === 'custom') {
      const shiftDays = totalDaysInCustomRange;
      setCustomFromDate((prev) => addDays(prev, -shiftDays));
      setCustomToDate((prev) => addDays(prev, -shiftDays));
    } else {
      // Monthly: Go to 1st of previous month
      const parts = selectedDate.split('-').map(Number);
      const y = parts[0] || 2026;
      const m = parts[1] || 8;
      const prevDate = new Date(y, m - 2, 1);
      const year = prevDate.getFullYear();
      const month = String(prevDate.getMonth() + 1).padStart(2, '0');
      setSelectedDate(`${year}-${month}-01`);
    }
  };

  const handleNextPage = () => {
    triggerSlideAnimation('left');
    if (viewMode === 'daily') {
      setSelectedDate((prev) => addDays(prev, 1));
    } else if (viewMode === 'weekly') {
      setSelectedDate(addDays(activeWeek.endDateStr, 1));
    } else if (viewMode === 'custom') {
      const shiftDays = totalDaysInCustomRange;
      setCustomFromDate((prev) => addDays(prev, shiftDays));
      setCustomToDate((prev) => addDays(prev, shiftDays));
    } else {
      // Monthly: Go to 1st of next month
      const parts = selectedDate.split('-').map(Number);
      const y = parts[0] || 2026;
      const m = parts[1] || 8;
      const nextDate = new Date(y, m, 1);
      const year = nextDate.getFullYear();
      const month = String(nextDate.getMonth() + 1).padStart(2, '0');
      setSelectedDate(`${year}-${month}-01`);
    }
  };

  const handleGoToToday = () => {
    triggerSlideAnimation('left');
    setSelectedDate(todayStr);
    if (viewMode === 'custom') {
      const parts = todayStr.split('-');
      setCustomFromDate(`${parts[0]}-${parts[1]}-01`);
      setCustomToDate(todayStr);
    }
  };

  const handleSelectMonthAndYear = (yearNum: number, monthIndex0: number) => {
    const mm = String(monthIndex0 + 1).padStart(2, '0');
    const daysInTargetMonth = new Date(yearNum, monthIndex0 + 1, 0).getDate();

    if (viewMode === 'custom') {
      setCustomFromDate(`${yearNum}-${mm}-01`);
      setCustomToDate(`${yearNum}-${mm}-${String(daysInTargetMonth).padStart(2, '0')}`);
    } else {
      const currentDay = Number(selectedDate.split('-')[2]) || 1;
      const targetDay = Math.min(currentDay, daysInTargetMonth);
      const dd = String(targetDay).padStart(2, '0');
      setSelectedDate(`${yearNum}-${mm}-${dd}`);
    }
    setIsMonthPickerOpen(false);
  };

  // Touch Swipe Gesture for Page Turning
  const touchStartXRef = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (viewMode === 'custom') return;
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (viewMode === 'custom') return;
    if (touchStartXRef.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchEndX - touchStartXRef.current;
    touchStartXRef.current = null;

    if (Math.abs(diffX) > 45) {
      if (diffX > 0) {
        handlePrevPage(); // Swipe right -> Previous Page
      } else {
        handleNextPage(); // Swipe left -> Next Page
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
    setPaidBy('resort');
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
    setPaidBy(exp.paidBy || 'resort');
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
    setPaidBy(exp.paidBy || 'resort');
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
          paidBy,
        });
        showToast('✓ Ledger entry updated!');
      } else {
        await addExpense({
          expenseDate,
          category,
          itemName: finalItemName,
          amount: Number(amount),
          remarks: remarks.trim(),
          paidBy,
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

      {/* 1. STICKY TOP SUMMARY */}
      <div className="grid grid-cols-2 gap-2 sticky top-0 z-20 bg-slate-100/90 backdrop-blur-md pt-1 pb-2">
        {/* Card 1 */}
        <div className="p-3 bg-amber-50 border border-amber-200/90 rounded-2xl shadow-2xs space-y-0.5">
          <span className="text-[10px] text-amber-900 font-bold uppercase tracking-wider block">
            {viewMode === 'daily'
              ? "Today's Expense"
              : viewMode === 'weekly'
              ? 'This Week Expense'
              : viewMode === 'custom'
              ? 'Selected Range Expense'
              : 'This Month Expense'}
          </span>
          <div className="text-xl font-black text-amber-950 tracking-tight">
            ₹
            {(
              viewMode === 'daily'
                ? dailyTotal
                : viewMode === 'weekly'
                ? weeklyTotal
                : viewMode === 'custom'
                ? customTotal
                : monthTotal
            ).toLocaleString()}
          </div>
          <span className="text-[10px] text-amber-800 font-bold block">
            {viewMode === 'daily'
              ? `${dailyCount} ${dailyCount === 1 ? 'Entry' : 'Entries'}`
              : viewMode === 'weekly'
              ? `${weeklyCount} ${weeklyCount === 1 ? 'Entry' : 'Entries'}`
              : viewMode === 'custom'
              ? `${formatDateDDMMYYYY(customFromDate)} → ${formatDateDDMMYYYY(customToDate)} • ${customExpenses.length} ${customExpenses.length === 1 ? 'Entry' : 'Entries'}`
              : `${monthlyExpenses.length} ${
                  monthlyExpenses.length === 1 ? 'Entry' : 'Entries'
                }`}
          </span>
        </div>

        {/* Card 2 */}
        <div className="p-3 bg-purple-50 border border-purple-200/90 rounded-2xl shadow-2xs space-y-0.5">
          <span className="text-[10px] text-purple-900 font-bold uppercase tracking-wider block">
            {viewMode === 'monthly'
              ? 'Selected Month Total'
              : viewMode === 'custom'
              ? 'Average / Day'
              : 'This Month Expense'}
          </span>
          <div className="text-xl font-black text-purple-950 tracking-tight">
            ₹{(viewMode === 'custom' ? customAvgPerDay : monthTotal).toLocaleString()}
          </div>
          <span className="text-[10px] text-purple-800 font-extrabold uppercase tracking-wider block">
            {viewMode === 'custom'
              ? `Over ${totalDaysInCustomRange} ${totalDaysInCustomRange === 1 ? 'Day' : 'Days'}`
              : `${monthTitle.split(' ')[0]} Total`}
          </span>
        </div>
      </div>

      {/* 2. COMPACT MONTH & VIEW MODE SELECTOR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 sm:pb-0 scrollbar-none max-w-full">
          <button
            onClick={() => {
              setPickerYear(Number(selectedDate.split('-')[0]) || 2026);
              setIsMonthPickerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-2xs text-gray-900 font-black text-xs hover:bg-gray-50 active:bg-gray-100 transition cursor-pointer shrink-0 min-h-[36px]"
          >
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
            <span className="uppercase text-indigo-950 font-black">{monthTitle}</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>

          {/* Segmented View Mode Control */}
          <div className="bg-gray-100/90 p-1 rounded-xl flex items-center gap-0.5 border border-gray-200/80 shadow-2xs shrink-0">
            {[
              { id: 'daily', label: 'Daily' },
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Month' },
              { id: 'custom', label: 'Custom' },
            ].map((tab) => {
              const isActive = viewMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleViewModeChange(tab.id as ViewMode)}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-indigo-700 shadow-2xs font-black'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/50 font-bold'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {selectedDate !== todayStr && (
          <button
            onClick={handleGoToToday}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-black text-xs rounded-xl shadow-2xs transition active:scale-95 cursor-pointer shrink-0 self-end sm:self-auto"
          >
            Go to Today
          </button>
        )}
      </div>

      {/* 3. DATE NAVIGATION (Directly Above Ledger Entries) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-2xs text-center space-y-1">
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrevPage}
            className="p-2.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl text-gray-800 transition active:scale-95 cursor-pointer flex items-center justify-center min-h-[42px] min-w-[42px]"
            title={
              viewMode === 'daily'
                ? 'Previous Day'
                : viewMode === 'weekly'
                ? 'Previous Week'
                : viewMode === 'custom'
                ? 'Previous Range'
                : 'Previous Month'
            }
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div
            onClick={() => {
              if (viewMode === 'custom') setIsCustomRangeModalOpen(true);
            }}
            className={`space-y-0.5 min-w-0 px-2 ${viewMode === 'custom' ? 'cursor-pointer hover:opacity-80' : ''}`}
          >
            <div className="text-sm sm:text-base font-black text-gray-900 tracking-tight truncate">
              {viewMode === 'daily' && formatDateDDMMYYYY(selectedDate)}
              {viewMode === 'weekly' && activeWeek.label}
              {viewMode === 'monthly' && monthTitle}
              {viewMode === 'custom' && `${formatDateDDMMYYYY(customFromDate)} ↓ ${formatDateDDMMYYYY(customToDate)}`}
            </div>
            <div className="text-xs font-bold text-indigo-600 uppercase tracking-widest truncate">
              {viewMode === 'daily' && weekdayName}
              {viewMode === 'weekly' && monthTitle}
              {viewMode === 'monthly' && 'Full Month Ledger'}
              {viewMode === 'custom' && 'Tap to edit date range'}
            </div>
          </div>

          <button
            onClick={handleNextPage}
            className="p-2.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-xl text-gray-800 transition active:scale-95 cursor-pointer flex items-center justify-center min-h-[42px] min-w-[42px]"
            title={
              viewMode === 'daily'
                ? 'Next Day'
                : viewMode === 'weekly'
                ? 'Next Week'
                : viewMode === 'custom'
                ? 'Next Range'
                : 'Next Month'
            }
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* 4. SEARCH BAR, SORT & FILTER CONTROLS */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search expenses..."
              className="w-full pl-9 pr-7 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs min-h-[38px]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Button */}
          <div className="relative">
            <button
              onClick={() => setIsSortOpen(!isSortOpen)}
              className={`px-3 py-2 rounded-xl border text-xs font-bold transition flex items-center gap-1 min-h-[38px] cursor-pointer ${
                sortOption !== 'newest'
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600" />
              <span>Sort</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {/* Sort Dropdown Menu */}
            {isSortOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-40 bg-white border border-gray-200 rounded-2xl shadow-xl p-1.5 w-48 space-y-0.5 animate-in fade-in zoom-in-95">
                {[
                  { id: 'newest', label: 'Newest First' },
                  { id: 'oldest', label: 'Oldest First' },
                  { id: 'amount_desc', label: 'Amount High → Low' },
                  { id: 'amount_asc', label: 'Amount Low → High' },
                  { id: 'name_asc', label: 'A → Z' },
                  { id: 'name_desc', label: 'Z → A' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setSortOption(opt.id as SortOption);
                      setIsSortOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-between ${
                      sortOption === opt.id
                        ? 'bg-indigo-600 text-white font-black'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {sortOption === opt.id && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filter Button */}
          <button
            onClick={() => setIsFilterModalOpen(true)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold transition flex items-center gap-1 min-h-[38px] cursor-pointer ${
              hasActiveFilters
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 text-[9px] bg-white text-indigo-700 rounded-full font-black">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Active Filters Bar */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Active:</span>

            {(filterCategory !== 'ALL' || selectedCategory !== 'ALL') && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg text-xs font-bold">
                Category: {filterCategory !== 'ALL' ? filterCategory : selectedCategory}
                <button
                  onClick={() => {
                    setFilterCategory('ALL');
                    setSelectedCategory('ALL');
                  }}
                  className="hover:text-indigo-950 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {filterAmountType !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg text-xs font-bold">
                Amount:{' '}
                {filterAmountType === '0-500'
                  ? '₹0 – ₹500'
                  : filterAmountType === '500-2000'
                  ? '₹500 – ₹2,000'
                  : filterAmountType === '2000-5000'
                  ? '₹2,000 – ₹5,000'
                  : filterAmountType === '5000+'
                  ? '₹5,000+'
                  : `Custom (₹${filterMinAmount || 0} - ₹${filterMaxAmount || '∞'})`}
                <button onClick={() => setFilterAmountType('ALL')} className="hover:text-indigo-950 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {filterDateShortcut !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg text-xs font-bold">
                Date:{' '}
                {filterDateShortcut === 'today'
                  ? 'Today'
                  : filterDateShortcut === 'yesterday'
                  ? 'Yesterday'
                  : filterDateShortcut === 'this_week'
                  ? 'This Week'
                  : filterDateShortcut === 'last_week'
                  ? 'Last Week'
                  : filterDateShortcut === 'this_month'
                  ? 'This Month'
                  : filterDateShortcut === 'last_month'
                  ? 'Last Month'
                  : filterDateShortcut === 'this_year'
                  ? 'This Year'
                  : 'Custom Range'}
                <button onClick={() => setFilterDateShortcut('ALL')} className="hover:text-indigo-950 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {filterEntryStatus !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg text-xs font-bold">
                Status: {filterEntryStatus === 'with_notes' ? 'With Notes' : 'Without Notes'}
                <button onClick={() => setFilterEntryStatus('ALL')} className="hover:text-indigo-950 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {sortOption !== 'newest' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 border border-purple-200 text-purple-800 rounded-lg text-xs font-bold">
                Sort:{' '}
                {sortOption === 'oldest'
                  ? 'Oldest First'
                  : sortOption === 'amount_desc'
                  ? 'Amount High → Low'
                  : sortOption === 'amount_asc'
                  ? 'Amount Low → High'
                  : sortOption === 'name_asc'
                  ? 'A → Z'
                  : 'Z → A'}
                <button onClick={() => setSortOption('newest')} className="hover:text-purple-950 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <button
              onClick={handleClearAllFilters}
              className="text-xs font-black text-rose-600 hover:text-rose-800 underline ml-1 cursor-pointer"
            >
              Clear All
            </button>
          </div>
        )}

        {/* Category Horizontal Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none touch-pan-x">
          <button
            onClick={() => {
              setSelectedCategory('ALL');
              setFilterCategory('ALL');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer min-h-[34px] ${
              selectedCategory === 'ALL' && filterCategory === 'ALL'
                ? 'bg-indigo-600 text-white shadow-2xs font-extrabold'
                : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
            }`}
          >
            All
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                const next = (selectedCategory === cat || filterCategory === cat) ? 'ALL' : cat;
                setSelectedCategory(next);
                setFilterCategory(next);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer min-h-[34px] ${
                selectedCategory === cat || filterCategory === cat
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
        className={`bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden transition-all duration-200 ease-out transform ${
          slideAnim === 'left'
            ? '-translate-x-3 opacity-70'
            : slideAnim === 'right'
            ? 'translate-x-3 opacity-70'
            : 'translate-x-0 opacity-100'
        }`}
        id="ledger_notebook_page"
      >
        {/* Ledger Page Header Banner */}
        <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
          <div>
            <span className="text-xs font-black uppercase tracking-wider block text-slate-200">
              {viewMode === 'daily' && formatDateDDMMYYYY(selectedDate)}
              {viewMode === 'weekly' && activeWeek.label}
              {viewMode === 'monthly' && monthTitle}
              {viewMode === 'custom' && `${formatDateDDMMYYYY(customFromDate)} → ${formatDateDDMMYYYY(customToDate)}`}
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase">
              {viewMode === 'daily' && weekdayName}
              {viewMode === 'weekly' && 'Weekly Register'}
              {viewMode === 'monthly' && 'Full Month Register'}
              {viewMode === 'custom' && `Custom Range Register (${totalDaysInCustomRange} Days)`}
            </span>
          </div>

          <div className="text-right">
            <span className="text-sm sm:text-base font-extrabold text-amber-400 block">
              ₹
              {(
                viewMode === 'daily'
                  ? dailyTotal
                  : viewMode === 'weekly'
                  ? weeklyTotal
                  : viewMode === 'custom'
                  ? customTotal
                  : monthTotal
              ).toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              {viewMode === 'daily' && `${dailyCount} ${dailyCount === 1 ? 'Entry' : 'Entries'}`}
              {viewMode === 'weekly' && `${weeklyCount} ${weeklyCount === 1 ? 'Entry' : 'Entries'}`}
              {viewMode === 'custom' && `${customExpenses.length} ${customExpenses.length === 1 ? 'Entry' : 'Entries'}`}
              {viewMode === 'monthly' && `${monthlyExpenses.length} ${monthlyExpenses.length === 1 ? 'Entry' : 'Entries'}`}
            </span>
          </div>
        </div>

        {/* Ledger Body Content */}
        {groupedExpensesByDate.length === 0 ? (
          <div className="p-8 text-center my-6 space-y-1">
            <p className="text-sm font-bold text-slate-800">No expenses found for this period.</p>
            <p className="text-xs text-slate-400">Tap + below to add a new expense entry.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200/80">
            {groupedExpensesByDate.map((group) => {
              const { dateFormatted, weekday } = formatLedgerDateHeader(group.dateStr);

              return (
                <div key={group.dateStr} className="bg-white">
                  {/* Compact Ledger Date Header */}
                  <div className="bg-slate-50 px-3.5 py-1.5 flex items-center justify-between border-y border-slate-200/80 text-slate-800">
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <span className="text-slate-900 font-extrabold">{dateFormatted}</span>
                      <span className="text-slate-400 font-normal">•</span>
                      <span className="text-slate-500 font-medium text-[11px] capitalize">{weekday}</span>
                    </div>
                    <span className="text-xs font-extrabold text-slate-900">
                      ₹{group.total.toLocaleString()}
                    </span>
                  </div>

                  {/* Ledger Rows */}
                  <div className="divide-y divide-slate-100">
                    {group.items.map((exp) => (
                      <div
                        key={exp.id}
                        onClick={() => setSelectedExpenseDetail(exp)}
                        className={`px-3.5 py-2.5 hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer flex items-center justify-between gap-3 ${
                          exp.paidBy === 'irshad' ? 'border-l-4 border-l-purple-600 bg-purple-50/20' : ''
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5 flex-wrap">
                            <span>{exp.itemName || exp.category}</span>
                            {exp.paidBy === 'irshad' && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-black rounded-md border border-purple-200 shrink-0">
                                Paid by Irshad
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                            <span className="text-slate-600 font-semibold">{exp.category}</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-400">{formatExpenseTime(exp.createdAt)}</span>
                          </div>
                          {exp.remarks && (
                            <p className="text-[11px] text-slate-500 italic line-clamp-1">
                              {exp.remarks}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm sm:text-base font-extrabold text-slate-900 block">
                            ₹{exp.amount.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
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
            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-2xl border border-gray-200 font-bold text-sm">
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
                  <p className="text-[10px] text-gray-500 font-medium">
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
                <span className="text-lg font-black text-gray-900">
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
                <span className="text-xs font-extrabold text-gray-800">
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

              {/* Paid By */}
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Paid By <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaidBy('resort')}
                    className={`py-2.5 px-3 rounded-xl font-extrabold text-xs transition cursor-pointer border ${
                      paidBy === 'resort'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Resort
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaidBy('irshad')}
                    className={`py-2.5 px-3 rounded-xl font-extrabold text-xs transition cursor-pointer border ${
                      paidBy === 'irshad'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Irshad (Personal)
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Amount (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  value={amount === '' ? '' : amount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    if (raw === '') {
                      setAmount('');
                    } else {
                      const clean = raw.replace(/^0+(?=\d)/, '');
                      setAmount(clean === '' ? '' : Number(clean));
                    }
                  }}
                  placeholder="Enter amount"
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

      {/* 10. CUSTOM RANGE PICKER MODAL */}
      {isCustomRangeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-sm p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                Custom Date Range
              </h3>
              <button
                onClick={() => setIsCustomRangeModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {customRangeError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold">
                {customRangeError}
              </div>
            )}

            <div className="space-y-3 font-mono">
              <div>
                <label className="text-[10px] font-black text-gray-600 uppercase tracking-wider block mb-1">
                  FROM
                </label>
                <input
                  type="date"
                  value={customFromDate}
                  onChange={(e) => {
                    setCustomFromDate(e.target.value);
                    setCustomRangeError(null);
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
                <span className="text-[10px] text-indigo-600 font-extrabold mt-0.5 block">
                  [ {formatDateDDMMYYYY(customFromDate)} ]
                </span>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-600 uppercase tracking-wider block mb-1">
                  TO
                </label>
                <input
                  type="date"
                  value={customToDate}
                  onChange={(e) => {
                    setCustomToDate(e.target.value);
                    setCustomRangeError(null);
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
                <span className="text-[10px] text-indigo-600 font-extrabold mt-0.5 block">
                  [ {formatDateDDMMYYYY(customToDate)} ]
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCustomRangeModalOpen(false)}
                className="flex-1 py-3 border border-gray-200 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-50 cursor-pointer min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!customFromDate || !customToDate) {
                    setCustomRangeError('Please select both From and To dates.');
                    return;
                  }
                  if (customFromDate > customToDate) {
                    setCustomRangeError('From date cannot be after To date.');
                    return;
                  }
                  const parts1 = customFromDate.split('-').map(Number);
                  const parts2 = customToDate.split('-').map(Number);
                  const d1 = new Date(parts1[0], parts1[1] - 1, parts1[2]);
                  const d2 = new Date(parts2[0], parts2[1] - 1, parts2[2]);
                  const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                  if (diffDays > 365) {
                    setCustomRangeError('Maximum range allowed is 365 days.');
                    return;
                  }
                  setViewMode('custom');
                  localStorage.setItem('expense_ledger_view_mode', 'custom');
                  localStorage.setItem('expense_ledger_custom_from', customFromDate);
                  localStorage.setItem('expense_ledger_custom_to', customToDate);
                  setIsCustomRangeModalOpen(false);
                }}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-md cursor-pointer min-h-[44px]"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. ADVANCED FILTER MODAL */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl border border-gray-200 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                Filter Ledger
              </h3>
              <button
                onClick={() => setIsFilterModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Category Filter */}
              <div>
                <label className="font-black text-gray-900 uppercase tracking-wider block mb-2 text-[10px]">
                  Category
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setFilterCategory('ALL')}
                    className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                      filterCategory === 'ALL'
                        ? 'bg-indigo-600 text-white font-black'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    All Categories
                  </button>
                  {allCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFilterCategory(filterCategory === cat ? 'ALL' : cat)}
                      className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                        filterCategory === cat
                          ? 'bg-indigo-600 text-white font-black'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Filter */}
              <div>
                <label className="font-black text-gray-900 uppercase tracking-wider block mb-2 text-[10px]">
                  Amount Range (₹)
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'ALL', label: 'All Amounts' },
                    { id: '0-500', label: '₹0 – ₹500' },
                    { id: '500-2000', label: '₹500 – ₹2,000' },
                    { id: '2000-5000', label: '₹2,000 – ₹5,000' },
                    { id: '5000+', label: '₹5,000+' },
                    { id: 'custom', label: 'Custom Range' },
                  ].map((amt) => (
                    <button
                      key={amt.id}
                      onClick={() => setFilterAmountType(amt.id as AmountFilterOption)}
                      className={`py-2 px-2.5 rounded-xl font-bold transition text-center cursor-pointer ${
                        filterAmountType === amt.id
                          ? 'bg-indigo-600 text-white font-black'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {amt.label}
                    </button>
                  ))}
                </div>

                {filterAmountType === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div>
                      <span className="text-[10px] font-bold text-gray-500 block mb-1">Min Amount (₹)</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Min amount"
                        value={filterMinAmount === '' ? '' : filterMinAmount}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          if (raw === '') {
                            setFilterMinAmount('');
                          } else {
                            const clean = raw.replace(/^0+(?=\d)/, '');
                            setFilterMinAmount(clean === '' ? '' : Number(clean));
                          }
                        }}
                        className="w-full rounded-xl border border-gray-200 p-2 text-xs font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-500 block mb-1">Max Amount (₹)</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Max amount"
                        value={filterMaxAmount === '' ? '' : filterMaxAmount}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          if (raw === '') {
                            setFilterMaxAmount('');
                          } else {
                            const clean = raw.replace(/^0+(?=\d)/, '');
                            setFilterMaxAmount(clean === '' ? '' : Number(clean));
                          }
                        }}
                        className="w-full rounded-xl border border-gray-200 p-2 text-xs font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Date Shortcut Filter */}
              <div>
                <label className="font-black text-gray-900 uppercase tracking-wider block mb-2 text-[10px]">
                  Date Filter Preset
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'ALL', label: 'Default' },
                    { id: 'today', label: 'Today' },
                    { id: 'yesterday', label: 'Yesterday' },
                    { id: 'this_week', label: 'This Week' },
                    { id: 'last_week', label: 'Last Week' },
                    { id: 'this_month', label: 'This Month' },
                    { id: 'last_month', label: 'Last Month' },
                    { id: 'this_year', label: 'This Year' },
                    { id: 'custom_range', label: 'Custom Range' },
                  ].map((dt) => (
                    <button
                      key={dt.id}
                      onClick={() => {
                        setFilterDateShortcut(dt.id as DateFilterOption);
                        if (dt.id === 'custom_range') {
                          setIsCustomRangeModalOpen(true);
                        }
                      }}
                      className={`py-2 px-2 rounded-xl font-bold transition text-center cursor-pointer ${
                        filterDateShortcut === dt.id
                          ? 'bg-indigo-600 text-white font-black'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {dt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Entry Status Filter */}
              <div>
                <label className="font-black text-gray-900 uppercase tracking-wider block mb-2 text-[10px]">
                  Entry Status (Notes)
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'ALL', label: 'All Entries' },
                    { id: 'with_notes', label: 'With Notes' },
                    { id: 'without_notes', label: 'Without Notes' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setFilterEntryStatus(st.id as StatusFilterOption)}
                      className={`py-2 px-2 rounded-xl font-bold transition text-center cursor-pointer ${
                        filterEntryStatus === st.id
                          ? 'bg-indigo-600 text-white font-black'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="flex-1 py-3 border border-gray-200 text-rose-600 font-bold text-xs rounded-xl hover:bg-rose-50 cursor-pointer min-h-[44px]"
              >
                Reset Filters
              </button>
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-md cursor-pointer min-h-[44px]"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
