import React, { useState, useEffect, useMemo } from 'react';

const DEBUG = false;
import { supabase } from '../lib/supabase';
import { useHotelData } from '../context/HotelContext';
import { SalaryRentService } from '../services/salaryRent';
import { IrshadWalletService } from '../services/irshadWallet';
import { DuesService } from '../services/dues';
import { getISTDateStr, getISTMonthStr } from '../utils/formatters';
import { SalaryPayment, RentPayment, IrshadWalletSummary, IrshadWalletNetSummary } from '../types';
import {
  DollarSign,
  TrendingUp,
  Receipt,
  Wallet,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Building2,
  Users,
  Package,
  Calendar as CalendarIcon,
  RotateCcw,
  ArrowUpRight,
  ArrowDownRight,
  ZoomIn,
  ZoomOut,
  Info,
  Search,
  X,
  Clock,
  Filter,
  User,
  BarChart3,
  CreditCard,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from 'recharts';

interface BookingSummaryItem {
  id: string;
  bookingGroupId?: string;
  totalAmount: number;
  advancePaid: number;
  amountCollected: number;
  remainingBalance: number;
  balanceDueWallet: boolean;
  transferToIrshad: boolean;
  transferredToIrshad: number;
  paymentMethod: string;
  checkInDate: string;
  checkOutDate?: string;
  createdAt: string;
  status: string;
  guestName: string;
  roomNumber: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function formatMonthLabel(monthStr: string) {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [y, m] = monthStr.split('-');
  const monthIdx = parseInt(m, 10) - 1;
  return `${MONTH_NAMES[monthIdx] || ''} ${y}`;
}

const addDaysToDate = (ymdStr: string, deltaDays: number): string => {
  try {
    const parts = ymdStr.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    date.setDate(date.getDate() + deltaDays);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return ymdStr;
  }
};

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

// Number counting animation component (using clean, modern sans-serif typography)
const AnimatedNumber = React.memo(({ value, prefix = '₹', className = '' }: { value: number; prefix?: string; className?: string }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 600;
    const startValue = displayValue;
    const endValue = value;

    if (startValue === endValue) {
      setDisplayValue(endValue);
      return;
    }

    let animId: number;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(startValue + (endValue - startValue) * easeProgress);
      setDisplayValue(current);

      if (progress < 1) {
        animId = requestAnimationFrame(step);
      }
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [value]);

  const isNegative = displayValue < 0;
  const formatted = `${prefix}${isNegative ? '-' : ''}${Math.abs(displayValue).toLocaleString('en-IN')}`;
  return <span className={className}>{formatted}</span>;
});

// Custom Tooltip for 12-Month Yearly Chart
const YearlyChartTooltip = React.memo(({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const monthFull = formatMonthLabel(data.monthKey);
  const rev = data.revenue || 0;
  const inv = data.inventory || 0;
  const sal = data.salary || 0;
  const rnt = data.rent || 0;
  const netProfit = rev - (inv + sal + rnt);

  if (typeof window !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(8); } catch {}
  }

  return (
    <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700/80 text-xs min-w-[210px] space-y-2.5 z-50">
      <div className="font-extrabold text-slate-100 border-b border-slate-800 pb-1.5 flex items-center justify-between">
        <span className="text-sm tracking-tight">{monthFull}</span>
      </div>
      <div className="space-y-1.5 font-sans">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400 font-medium">Room Revenue</span>
          <span className="font-extrabold text-emerald-400 font-sans">₹{rev.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400 font-medium">Inventory</span>
          <span className="font-extrabold text-amber-400 font-sans">₹{inv.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400 font-medium">Salary</span>
          <span className="font-extrabold text-indigo-400 font-sans">₹{sal.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400 font-medium">Rent</span>
          <span className="font-extrabold text-lime-400 font-sans">₹{rnt.toLocaleString('en-IN')}</span>
        </div>
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-3">
          <span className="text-slate-200 font-black">Net Profit</span>
          <span className={`font-black font-sans text-xs sm:text-sm ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ₹{netProfit.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
    </div>
  );
});

// Custom Tooltip for Daily Charts
const DailyChartTooltip = React.memo(({ active, payload, metrics, chartType }: any) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  if (!data || !data.hasValue || data.revenue === null) return null;

  const rev = data.revenue || 0;
  const inv = data.expenses || 0;
  const daysInMonth = data.totalDaysInMonth || 30;
  const sal = metrics.monthSalaryExp > 0 ? Math.round(metrics.monthSalaryExp / daysInMonth) : 0;
  const rnt = metrics.monthRentExp > 0 ? Math.round(metrics.monthRentExp / daysInMonth) : 0;
  const netProfit = rev - inv;

  const prevVal = chartType === 'revenue' ? data.previousDayRevenue : data.previousDayExpenses;
  const currentVal = chartType === 'revenue' ? rev : inv;
  const diff = currentVal - prevVal;

  if (typeof window !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(8); } catch {}
  }

  return (
    <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700/80 text-xs min-w-[210px] space-y-2 z-50">
      <div className="font-black text-slate-100 border-b border-slate-800 pb-1.5 flex items-center justify-between">
        <span className="text-sm tracking-tight">{data.label}</span>
      </div>
      <div className="space-y-1.5 font-sans">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400 font-medium">Revenue</span>
          <span className="font-extrabold text-emerald-400 font-sans">₹{rev.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400 font-medium">Inventory</span>
          <span className="font-extrabold text-amber-400 font-sans">₹{inv.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400 font-medium">Salary (Avg Day)</span>
          <span className="font-extrabold text-indigo-400 font-sans">₹{sal.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-400 font-medium">Rent (Avg Day)</span>
          <span className="font-extrabold text-lime-400 font-sans">₹{rnt.toLocaleString('en-IN')}</span>
        </div>
        <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between gap-3">
          <span className="text-slate-200 font-bold">Profit (Rev - Inv)</span>
          <span className={`font-black font-sans ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ₹{netProfit.toLocaleString('en-IN')}
          </span>
        </div>
        <div className="pt-1.5 border-t border-slate-800 space-y-1 text-[11px]">
          <div className="flex items-center justify-between gap-3 text-slate-400">
            <span>Previous Day</span>
            <span className="font-bold text-slate-300 font-sans">₹{prevVal.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Difference</span>
            <span className={`font-black font-sans ${diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {diff >= 0 ? '+' : ''}₹{diff.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default function Analytics({ refreshTrigger }: { refreshTrigger?: number }) {
  const { bookings, expenses, payments, dueTransactions, isLoading } = useHotelData();

  const currentISTDateStr = useMemo(() => getISTDateStr(), []);
  const defaultMonthStr = useMemo(() => getISTMonthStr(), []);
  const currentYearNum = useMemo(() => Number(defaultMonthStr.split('-')[0]) || 2026, [defaultMonthStr]);

  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonthStr);
  const [selectedYear, setSelectedYear] = useState<number>(currentYearNum);

  const [allSalaryPayments, setAllSalaryPayments] = useState<SalaryPayment[]>([]);
  const [allRentPayments, setAllRentPayments] = useState<RentPayment[]>([]);
  const [walletNetSummary, setWalletNetSummary] = useState<IrshadWalletNetSummary>({
    bookingTransferred: 0,
    expenseByIrshad: 0,
    settlementPaid: 0,
    walletNet: 0,
  });
  const [irshadWalletBalance, setIrshadWalletBalance] = useState<number>(0);
  const [outstandingDuesBalance, setOutstandingDuesBalance] = useState<number>(0);

  // Zoom levels for Daily Charts (1x, 1.5x, 2x)
  const [revChartZoom, setRevChartZoom] = useState<number>(1);
  const [invChartZoom, setInvChartZoom] = useState<number>(1);

  // Booking Revenue Ledger State
  const [ledgerSelectedDate, setLedgerSelectedDate] = useState<string>(currentISTDateStr);
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState<string>('');
  const [ledgerFilterType, setLedgerFilterType] = useState<'ALL' | 'advance' | 'balance' | 'extension' | 'additional'>('ALL');
  const [selectedRevenueDetail, setSelectedRevenueDetail] = useState<any | null>(null);

  // Sync ledgerSelectedDate if top month picker changes and selected date is outside selected month
  useEffect(() => {
    if (selectedMonth && ledgerSelectedDate.substring(0, 7) !== selectedMonth) {
      if (currentISTDateStr.substring(0, 7) === selectedMonth) {
        setLedgerSelectedDate(currentISTDateStr);
      } else {
        setLedgerSelectedDate(`${selectedMonth}-01`);
      }
    }
  }, [selectedMonth, currentISTDateStr]);

  useEffect(() => {
    async function loadSalaryRentAnalytics() {
      try {
        const { salaryPayments, rentPayments } = await SalaryRentService.fetchAllData();
        setAllSalaryPayments(salaryPayments || []);
        setAllRentPayments(rentPayments || []);
      } catch (err) {
        console.error('Error fetching salary/rent analytics', err);
      }
    }
    async function loadIrshadWallet() {
      try {
        const netSummary = await IrshadWalletService.getIrshadWalletNetSummary();
        setWalletNetSummary(netSummary);
        setIrshadWalletBalance(netSummary.walletNet);
        if (DEBUG) console.log("Analytics Summary", netSummary);
      } catch (err) {
        console.error('Error fetching Irshad wallet summary', err);
      }
    }
    async function loadOutstandingDues() {
      try {
        const { data: payData } = await supabase
          .from('payments')
          .select('remaining_balance')
          .gt('remaining_balance', 0)
          .neq('payment_status', 'paid');

        const sum = (payData || []).reduce((acc: any, p: any) => acc + Number(p.remaining_balance || 0), 0);
        setOutstandingDuesBalance(sum);
      } catch (err) {
        console.error('Error fetching outstanding dues', err);
      }
    }
    loadSalaryRentAnalytics();
    loadIrshadWallet();
    loadOutstandingDues();
  }, [selectedMonth, payments, bookings]);

  // Controls for Month & Year switching
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const newY = d.getFullYear();
    const newM = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${newY}-${newM}`);
    setSelectedYear(newY);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    const newY = d.getFullYear();
    const newM = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${newY}-${newM}`);
    setSelectedYear(newY);
  };

  const handleCurrentMonth = () => {
    setSelectedYear(currentYearNum);
    setSelectedMonth(defaultMonthStr);
  };

  // Dynamic list of years for selector
  const yearOptions = useMemo(() => {
    const startYr = currentYearNum - 2;
    return [startYr, startYr + 1, startYr + 2, startYr + 3, startYr + 4];
  }, [currentYearNum]);

  // 1. Process Unique Bookings
  const uniqueBookingsMap = useMemo(() => {
    const map = new Map<string, BookingSummaryItem>();

    bookings.forEach((b) => {
      if (b.status === 'cancelled') return;
      const key = b.bookingGroupId || b.id;
      if (!map.has(key)) {
        map.set(key, {
          id: b.id,
          bookingGroupId: b.bookingGroupId,
          totalAmount: Number(b.totalAmount || 0),
          advancePaid: Number(b.advancePaid || 0),
          amountCollected: Number(b.amountCollected !== undefined ? b.amountCollected : b.advancePaid || 0),
          remainingBalance: Number(b.remainingBalance || 0),
          balanceDueWallet: Boolean(b.balanceDueWallet),
          transferToIrshad: Boolean(b.transferToIrshad),
          transferredToIrshad: Number(b.transferredToIrshad || 0),
          paymentMethod: b.paymentMethod || 'cash',
          checkInDate: b.checkInDate,
          checkOutDate: b.checkOutDate,
          createdAt: b.createdAt ? b.createdAt.split('T')[0] : b.checkInDate,
          status: b.status,
          guestName: b.guestName || 'Guest',
          roomNumber: b.roomNumber,
        });
      }
    });

    return map;
  }, [bookings]);

  // 2. Calculate Metrics for Selected Month
  // Revenue = SUM(payments.amount_collected) for selected month
  // ONLY money actually collected counts as Revenue!
  const metrics = useMemo(() => {
    let monthRev = 0;
    let monthAdv = 0;

    // Sum actual money collected from payments
    if (payments && payments.length > 0) {
      payments.forEach((p) => {
        const pDate = (p.paymentDate || p.createdAt || '').split('T')[0];
        if (pDate.startsWith(selectedMonth)) {
          const amt = Number(
            p.amountCollected !== undefined
              ? p.amountCollected
              : p.amount !== undefined
              ? p.amount
              : p.advancePaid || 0
          );
          monthRev += amt;
        }
      });
    } else {
      // Fallback
      uniqueBookingsMap.forEach((b) => {
        if (b.checkInDate && b.checkInDate.startsWith(selectedMonth)) {
          monthRev += b.advancePaid;
          monthAdv += b.advancePaid;
        }
      });
    }

    let monthInventoryExpTotal = 0;
    let monthSalaryInExp = 0;
    let monthRentInExp = 0;

    expenses.forEach((e) => {
      const amt = Number(e.amount || 0);
      if (e.expenseDate && e.expenseDate.startsWith(selectedMonth)) {
        if (e.category === 'Salary') monthSalaryInExp += amt;
        else if (e.category === 'Rent') monthRentInExp += amt;
        else monthInventoryExpTotal += amt;
      }
    });

    const salaryPaidThisMonth = allSalaryPayments
      .filter((p) => p.month === selectedMonth)
      .reduce((sum, p) => sum + p.amount, 0);

    const rentPaidThisMonth = allRentPayments
      .filter((p) => p.month === selectedMonth)
      .reduce((sum, p) => sum + p.amount, 0);

    const effectiveSalaryMonthExp = monthSalaryInExp > 0 ? monthSalaryInExp : salaryPaidThisMonth;
    const effectiveRentMonthExp = monthRentInExp > 0 ? monthRentInExp : rentPaidThisMonth;

    // Step 1: Calculate Business Profit = Revenue - Inventory - Salary - Rent
    const totalMonthAllExp = monthInventoryExpTotal + effectiveSalaryMonthExp + effectiveRentMonthExp;
    const netIncome = monthRev - totalMonthAllExp;

    return {
      monthRevenue: monthRev,
      advanceReceived: monthAdv,
      outstandingBalance: outstandingDuesBalance,
      monthInventoryExp: monthInventoryExpTotal,
      monthSalaryExp: effectiveSalaryMonthExp,
      monthRentExp: effectiveRentMonthExp,
      totalMonthAllExp,
      netIncome,
    };
  }, [payments, uniqueBookingsMap, expenses, selectedMonth, allSalaryPayments, allRentPayments, outstandingDuesBalance]);

  // 3. Entire Year View Chart Data (12 Months Jan - Dec for selectedYear)
  const yearly12MonthsData = useMemo(() => {
    const list = [];

    for (let m = 1; m <= 12; m++) {
      const mStr = String(m).padStart(2, '0');
      const mKey = `${selectedYear}-${mStr}`;
      const monthLabel = SHORT_MONTH_NAMES[m - 1];

      let rev = 0;
      if (payments && payments.length > 0) {
        payments.forEach((p) => {
          const pDate = (p.paymentDate || p.createdAt || '').split('T')[0];
          if (pDate.startsWith(mKey)) {
            rev += Number(
              p.amountCollected !== undefined
                ? p.amountCollected
                : p.amount !== undefined
                ? p.amount
                : p.advancePaid || 0
            );
          }
        });
      } else {
        uniqueBookingsMap.forEach((b) => {
          if (b.checkInDate && b.checkInDate.startsWith(mKey)) {
            rev += b.advancePaid;
          }
        });
      }

      let invExp = 0;
      let salExpFromCat = 0;
      let rentExpFromCat = 0;

      expenses.forEach((e) => {
        const amt = Number(e.amount || 0);
        if (e.expenseDate && e.expenseDate.startsWith(mKey)) {
          if (e.category === 'Salary') salExpFromCat += amt;
          else if (e.category === 'Rent') rentExpFromCat += amt;
          else invExp += amt;
        }
      });

      const salPaid = allSalaryPayments
        .filter((p) => p.month === mKey)
        .reduce((sum, p) => sum + p.amount, 0);

      const rentPaid = allRentPayments
        .filter((p) => p.month === mKey)
        .reduce((sum, p) => sum + p.amount, 0);

      const finalSal = salExpFromCat > 0 ? salExpFromCat : salPaid;
      const finalRent = rentExpFromCat > 0 ? rentExpFromCat : rentPaid;

      list.push({
        monthKey: mKey,
        month: monthLabel,
        revenue: rev,
        inventory: invExp,
        salary: finalSal,
        rent: finalRent,
      });
    }

    return list;
  }, [selectedYear, payments, uniqueBookingsMap, expenses, allSalaryPayments, allRentPayments]);

  // 4. Progressive Daily Data for Full Selected Month (ONLY plots collected payments per day)
  const dailyDataForMonth = useMemo(() => {
    if (!selectedMonth || !selectedMonth.includes('-')) {
      return {
        daysList: [],
        isFutureMonth: false,
        isCurrentMonth: false,
        completedDays: 0,
        totalDaysInMonth: 0,
        todayFormatted: '',
        totalRevMonth: 0,
        totalExpMonth: 0,
      };
    }

    const [yStr, mStr] = selectedMonth.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);

    const daysInMonth = new Date(year, month, 0).getDate();
    const monthShort = SHORT_MONTH_NAMES[month - 1] || '';

    const isFutureMonth = selectedMonth > defaultMonthStr;
    const isCurrentMonth = selectedMonth === defaultMonthStr;

    let maxCompletedDay = daysInMonth;
    if (isFutureMonth) {
      maxCompletedDay = 0;
    } else if (isCurrentMonth) {
      const todayDayNum = parseInt(currentISTDateStr.split('-')[2], 10);
      maxCompletedDay = Math.min(daysInMonth, todayDayNum);
    }

    const daysList = [];
    let prevRevenue = 0;
    let prevExpenses = 0;
    let totalRevMonth = 0;
    let totalExpMonth = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateKey = `${selectedMonth}-${dayStr}`;

      if (day <= maxCompletedDay) {
        let rev = 0;
        if (payments && payments.length > 0) {
          payments.forEach((p) => {
            const pDate = (p.paymentDate || p.createdAt || '').split('T')[0];
            if (pDate === dateKey) {
              rev += Number(
                p.amountCollected !== undefined
                  ? p.amountCollected
                  : p.amount !== undefined
                  ? p.amount
                  : p.advancePaid || 0
              );
            }
          });
        } else {
          uniqueBookingsMap.forEach((b) => {
            if (b.checkInDate === dateKey) {
              rev += Number(b.advancePaid || 0);
            }
          });
        }

        let invExp = 0;
        expenses.forEach((e) => {
          if (e.expenseDate === dateKey) {
            const amt = Number(e.amount || 0);
            if (e.category !== 'Salary' && e.category !== 'Rent') {
              invExp += amt;
            }
          }
        });

        totalRevMonth += rev;
        totalExpMonth += invExp;

        const revDiff = day === 1 ? rev : rev - prevRevenue;
        const expDiff = day === 1 ? invExp : invExp - prevExpenses;

        daysList.push({
          dayNum: day,
          dateKey,
          label: `${day} ${monthShort} ${year}`,
          shortLabel: String(day),
          revenue: rev,
          expenses: invExp,
          previousDayRevenue: prevRevenue,
          previousDayExpenses: prevExpenses,
          revenueDiff: revDiff,
          expensesDiff: expDiff,
          totalDaysInMonth: daysInMonth,
          hasValue: true,
        });

        prevRevenue = rev;
        prevExpenses = invExp;
      } else {
        daysList.push({
          dayNum: day,
          dateKey,
          label: `${day} ${monthShort} ${year}`,
          shortLabel: String(day),
          revenue: null,
          expenses: null,
          previousDayRevenue: 0,
          previousDayExpenses: 0,
          revenueDiff: 0,
          expensesDiff: 0,
          totalDaysInMonth: daysInMonth,
          hasValue: false,
        });
      }
    }

    const [tY, tM, tD] = currentISTDateStr.split('-');
    const todayFormatted = `${tD}/${tM}/${tY}`;

    return {
      daysList,
      isFutureMonth,
      isCurrentMonth,
      completedDays: maxCompletedDay,
      totalDaysInMonth: daysInMonth,
      todayFormatted,
      totalRevMonth,
      totalExpMonth,
    };
  }, [selectedMonth, defaultMonthStr, currentISTDateStr, payments, uniqueBookingsMap, expenses]);

  // 5. Unified Revenue Collection Transactions (Source of Truth)
  const allRevenueTransactions = useMemo(() => {
    const resMetadataMap = new Map<string, { guestName: string; roomNumbers: string; checkInDate: string; checkOutDate: string }>();

    // Group bookings by reservation / bookingGroupId
    const bookingGroups = new Map<string, typeof bookings>();
    bookings.forEach((b) => {
      const key = String(b.bookingGroupId || b.id);
      if (!bookingGroups.has(key)) {
        bookingGroups.set(key, []);
      }
      bookingGroups.get(key)!.push(b);
    });

    bookingGroups.forEach((group, resId) => {
      const primary = group[0];
      const roomsStr = group
        .map((b) => b.roomNumber)
        .filter(Boolean)
        .sort((a, b) => Number(a) - Number(b))
        .map((r) => `Room ${r}`)
        .join(', ');

      resMetadataMap.set(resId, {
        guestName: primary.guestName || 'Guest',
        roomNumbers: roomsStr || (primary.roomNumber ? `Room ${primary.roomNumber}` : '-'),
        checkInDate: primary.checkInDate || '-',
        checkOutDate: primary.checkOutDate || '-',
      });
    });

    const resIdsInDueTx = new Set<string>();

    const txList: Array<{
      id: string;
      paymentId: string;
      reservationId: string;
      guestName: string;
      roomNumbers: string;
      checkInDate: string;
      checkOutDate: string;
      collectedAmount: number;
      collectionDate: string; // YYYY-MM-DD
      collectionTime: string; // e.g. "02:30 PM"
      paymentMethod: string;
      remarks: string;
      badgeType: 'advance' | 'balance' | 'extension' | 'additional' | 'paid';
      badgeLabel: string;
      badgeClass: string;
      collector: string;
      rawTimestamp: string;
    }> = [];

    const formatTimeStr = (isoOrDateStr?: string) => {
      if (!isoOrDateStr) return '10:00 AM';
      try {
        const d = new Date(isoOrDateStr);
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

    const getBadgeInfo = (
      remarks: string,
      isFirstTx: boolean,
      resRemainingBalance: number
    ): { badgeType: 'advance' | 'balance' | 'extension' | 'additional' | 'paid'; badgeLabel: string; badgeClass: string } => {
      const lower = (remarks || '').toLowerCase();
      if (lower.includes('extension') || lower.includes('extended stay') || lower.includes('extend')) {
        return {
          badgeType: 'extension',
          badgeLabel: 'Extended Stay',
          badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
        };
      }
      if (lower.includes('additional advance') || lower.includes('extra advance')) {
        return {
          badgeType: 'additional',
          badgeLabel: 'Additional Advance',
          badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
        };
      }
      if (lower.includes('advance') || lower.includes('initial')) {
        return {
          badgeType: 'advance',
          badgeLabel: 'Advance',
          badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
        };
      }
      if (lower.includes('due') || lower.includes('balance') || lower.includes('settlement')) {
        return {
          badgeType: 'balance',
          badgeLabel: 'Balance',
          badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        };
      }
      if (isFirstTx) {
        return {
          badgeType: 'advance',
          badgeLabel: 'Advance',
          badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
        };
      }
      if (resRemainingBalance === 0) {
        return {
          badgeType: 'paid',
          badgeLabel: 'Paid',
          badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        };
      }
      return {
        badgeType: 'balance',
        badgeLabel: 'Balance',
        badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      };
    };

    if (dueTransactions && dueTransactions.length > 0) {
      const sortedDueTx = [...dueTransactions].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      const seenResMap = new Map<string, number>();

      sortedDueTx.forEach((dt) => {
        const amt = Number(dt.amount || 0);
        if (amt <= 0) return;

        const resId = String(dt.reservation_id || '');
        if (resId) resIdsInDueTx.add(resId);

        const count = (seenResMap.get(resId) || 0) + 1;
        seenResMap.set(resId, count);

        const meta = resMetadataMap.get(resId) || {
          guestName: 'Guest',
          roomNumbers: '-',
          checkInDate: '-',
          checkOutDate: '-',
        };

        const paymentRow = payments.find((p) => String(p.reservationId || p.bookingId) === resId);
        const remBal = paymentRow ? Number(paymentRow.remainingBalance || 0) : 0;

        const dateStr = dt.created_at ? dt.created_at.split('T')[0] : getISTDateStr();
        const timeStr = formatTimeStr(dt.created_at);
        const badge = getBadgeInfo(dt.remarks, count === 1, remBal);
        const collector = (dt as any).collector_name || (dt as any).staff_name || (dt as any).created_by || 'Front Desk Staff';

        txList.push({
          id: dt.id || `dt_${Math.random()}`,
          paymentId: dt.payment_id || '',
          reservationId: resId,
          guestName: meta.guestName,
          roomNumbers: meta.roomNumbers,
          checkInDate: meta.checkInDate,
          checkOutDate: meta.checkOutDate,
          collectedAmount: amt,
          collectionDate: dateStr,
          collectionTime: timeStr,
          paymentMethod: dt.payment_method || 'cash',
          remarks: dt.remarks || '',
          badgeType: badge.badgeType,
          badgeLabel: badge.badgeLabel,
          badgeClass: badge.badgeClass,
          collector,
          rawTimestamp: dt.created_at || new Date().toISOString(),
        });
      });
    }

    payments.forEach((p) => {
      const resId = String(p.reservationId || p.bookingId || p.id);
      if (resIdsInDueTx.has(resId)) return;

      const amt = Number(p.amountCollected ?? p.advancePaid ?? p.amount ?? 0);
      if (amt <= 0) return;

      const meta = resMetadataMap.get(resId) || {
        guestName: 'Guest',
        roomNumbers: '-',
        checkInDate: '-',
        checkOutDate: '-',
      };

      const dateStr = (p.paymentDate || p.createdAt || getISTDateStr()).split('T')[0];
      const timeStr = formatTimeStr(p.createdAt || p.paymentDate);
      const remBal = Number(p.remainingBalance || 0);
      const badge = getBadgeInfo(p.remarks, true, remBal);
      const collector = (p as any).collector_name || (p as any).staff_name || (p as any).collectedBy || 'Front Desk Staff';

      txList.push({
        id: p.id || `p_${Math.random()}`,
        paymentId: p.id || '',
        reservationId: resId,
        guestName: meta.guestName,
        roomNumbers: meta.roomNumbers,
        checkInDate: meta.checkInDate,
        checkOutDate: meta.checkOutDate,
        collectedAmount: amt,
        collectionDate: dateStr,
        collectionTime: timeStr,
        paymentMethod: p.paymentMethod || 'cash',
        remarks: p.remarks || '',
        badgeType: badge.badgeType,
        badgeLabel: badge.badgeLabel,
        badgeClass: badge.badgeClass,
        collector,
        rawTimestamp: p.createdAt || p.paymentDate || new Date().toISOString(),
      });
    });

    return txList;
  }, [bookings, payments, dueTransactions]);

  // Helper to format dates to DD MMM YYYY (e.g. 04 Aug 2026)
  const formatDisplayDate = (dStr?: string) => {
    if (!dStr || dStr === '-') return '-';
    const clean = dStr.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      const y = parts[0];
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      const mShort = SHORT_MONTH_NAMES[m - 1] || '';
      if (mShort) {
        return `${d.toString().padStart(2, '0')} ${mShort} ${y}`;
      }
    }
    return dStr;
  };

  // Selected Day Reservations Ledger (Grouped by Reservation Check-in Date)
  const selectedDayReservationLedgerData = useMemo(() => {
    const allResIds = new Set<string>();
    bookings.forEach((b) => {
      const idStr = String(b.bookingGroupId || b.id || '');
      if (idStr) allResIds.add(idStr);
    });
    allRevenueTransactions.forEach((tx) => {
      const idStr = String(tx.reservationId || '');
      if (idStr) allResIds.add(idStr);
    });

    const result: Array<{
      reservationId: string;
      guestName: string;
      roomNumbers: string;
      checkInDate: string;
      checkOutDate: string;
      dayCollectedAmount: number;
      totalCollected: number;
      totalBookingAmount: number;
      remainingBalance: number;
      status: 'paid' | 'partial' | 'pending';
      statusLabel: string;
      statusClass: string;
      paymentBadgeLabel: string;
      paymentBadgeClass: string;
      badgeTypes: string[];
      lastCollectionTime: string;
      latestTimestamp: string;
      dayTransactionsCount: number;
      dayTransactions: typeof allRevenueTransactions;
      allTransactions: typeof allRevenueTransactions;
    }> = [];

    allResIds.forEach((resId) => {
      const allResTxs = allRevenueTransactions
        .filter((tx) => String(tx.reservationId) === resId)
        .sort((a, b) => new Date(a.rawTimestamp).getTime() - new Date(b.rawTimestamp).getTime());

      const matchingBookingGroup = bookings.filter(
        (b) => String(b.id) === resId || String(b.bookingGroupId) === resId
      );
      const matchingBooking = matchingBookingGroup[0];
      const matchingPayment = payments.find((p) => String(p.reservationId || p.bookingId) === resId);

      const checkInDateRaw = matchingBooking?.checkInDate || allResTxs[0]?.checkInDate || '-';
      const checkInDateKey = checkInDateRaw.split('T')[0];

      // GROUP BY CHECK-IN DATE: Only include reservations checking in on ledgerSelectedDate
      if (checkInDateKey !== ledgerSelectedDate) return;

      const guestName = matchingBooking?.guestName || allResTxs[0]?.guestName || 'Guest';

      let roomsStr = '-';
      if (matchingBookingGroup.length > 0) {
        roomsStr = matchingBookingGroup
          .map((b) => b.roomNumber)
          .filter(Boolean)
          .sort((a, b) => Number(a) - Number(b))
          .map((r) => `Room ${r}`)
          .join(', ');
      } else if (allResTxs[0]?.roomNumbers) {
        roomsStr = allResTxs[0].roomNumbers;
      }

      const checkOutDate = matchingBooking?.checkOutDate || allResTxs[0]?.checkOutDate || '-';
      const totalCollected = allResTxs.reduce((sum, tx) => sum + tx.collectedAmount, 0);

      const originalBookingTotal = Number(
        matchingPayment?.totalAmount || matchingBooking?.totalAmount || 0
      );
      const totalBookingAmount = originalBookingTotal > 0
        ? Math.max(originalBookingTotal, totalCollected)
        : totalCollected;

      const remainingBalance = Math.max(0, totalBookingAmount - totalCollected);

      // Status Badge logic
      let status: 'paid' | 'partial' | 'pending' = 'pending';
      let statusLabel = 'Pending';
      let statusClass = 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold';

      if (totalCollected >= totalBookingAmount && totalBookingAmount > 0) {
        status = 'paid';
        statusLabel = 'Paid';
        statusClass = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-extrabold';
      } else if (totalCollected > 0) {
        status = 'partial';
        statusLabel = 'Partial';
        statusClass = 'bg-amber-100 text-amber-800 border-amber-300 font-extrabold';
      }

      // Payment Type Badges
      const badgeTypes: string[] = Array.from(new Set(allResTxs.map((tx) => tx.badgeType)));
      let paymentBadgeLabel = 'Advance';
      let paymentBadgeClass = 'bg-blue-50 text-blue-700 border-blue-200 font-bold';

      if (badgeTypes.length > 1) {
        paymentBadgeLabel = 'Combined';
        paymentBadgeClass = 'bg-purple-50 text-purple-700 border-purple-200 font-bold';
      } else if (badgeTypes[0] === 'advance') {
        paymentBadgeLabel = 'Advance';
        paymentBadgeClass = 'bg-blue-50 text-blue-700 border-blue-200 font-bold';
      } else if (badgeTypes[0] === 'balance') {
        paymentBadgeLabel = 'Balance';
        paymentBadgeClass = 'bg-sky-50 text-sky-700 border-sky-200 font-bold';
      } else if (badgeTypes[0] === 'extension') {
        paymentBadgeLabel = 'Extension';
        paymentBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200 font-bold';
      } else if (badgeTypes[0] === 'additional') {
        paymentBadgeLabel = 'Additional';
        paymentBadgeClass = 'bg-teal-50 text-teal-700 border-teal-200 font-bold';
      }

      const latestTx = allResTxs[allResTxs.length - 1];

      result.push({
        reservationId: resId,
        guestName,
        roomNumbers: roomsStr,
        checkInDate: checkInDateRaw,
        checkOutDate,
        dayCollectedAmount: totalCollected,
        totalCollected,
        totalBookingAmount,
        remainingBalance,
        status,
        statusLabel,
        statusClass,
        paymentBadgeLabel,
        paymentBadgeClass,
        badgeTypes,
        lastCollectionTime: latestTx?.collectionTime || '-',
        latestTimestamp: latestTx?.rawTimestamp || new Date().toISOString(),
        dayTransactionsCount: allResTxs.length,
        dayTransactions: allResTxs,
        allTransactions: allResTxs,
      });
    });

    return result;
  }, [allRevenueTransactions, ledgerSelectedDate, bookings, payments]);

  // Day Summary Metrics
  const dayTotalRevenue = useMemo(() => {
    return selectedDayReservationLedgerData.reduce((sum, res) => sum + res.dayCollectedAmount, 0);
  }, [selectedDayReservationLedgerData]);

  const dayBookingCount = selectedDayReservationLedgerData.length;

  const dayCollectionCount = useMemo(() => {
    return selectedDayReservationLedgerData.reduce((sum, res) => sum + res.dayTransactionsCount, 0);
  }, [selectedDayReservationLedgerData]);

  // Filtered & Searched Reservation Cards for Selected Day
  const filteredReservationLedgerData = useMemo(() => {
    let result = [...selectedDayReservationLedgerData];

    if (ledgerSearchQuery.trim()) {
      const q = ledgerSearchQuery.toLowerCase().trim();
      result = result.filter(
        (res) =>
          res.guestName.toLowerCase().includes(q) ||
          res.reservationId.toLowerCase().includes(q) ||
          res.roomNumbers.toLowerCase().includes(q)
      );
    }

    if (ledgerFilterType !== 'ALL') {
      if (['paid', 'partial', 'pending'].includes(ledgerFilterType)) {
        result = result.filter((res) => res.status === ledgerFilterType);
      } else if (ledgerFilterType === 'combined') {
        result = result.filter((res) => res.badgeTypes.length > 1);
      } else {
        result = result.filter((res) => res.badgeTypes.includes(ledgerFilterType));
      }
    }

    // Newest reservation activity first
    result.sort((a, b) => new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime());

    return result;
  }, [selectedDayReservationLedgerData, ledgerSearchQuery, ledgerFilterType]);

  // Date Header Info
  const ledgerDateHeader = useMemo(() => {
    return formatLedgerDateHeader(ledgerSelectedDate);
  }, [ledgerSelectedDate]);

  const handleLedgerPrevDay = () => {
    const prev = addDaysToDate(ledgerSelectedDate, -1);
    setLedgerSelectedDate(prev);
    const m = prev.substring(0, 7);
    if (m !== selectedMonth) {
      setSelectedMonth(m);
    }
  };

  const handleLedgerNextDay = () => {
    const next = addDaysToDate(ledgerSelectedDate, 1);
    setLedgerSelectedDate(next);
    const m = next.substring(0, 7);
    if (m !== selectedMonth) {
      setSelectedMonth(m);
    }
  };

  const handleOpenRevenueDetailModal = (item: any) => {
    const resId = item.reservationId;
    const matchingBooking = bookings.find((b) => String(b.id) === resId || String(b.bookingGroupId) === resId);
    const matchingPayment = payments.find((p) => String(p.reservationId || p.bookingId) === String(resId));

    const historyToUse = item.allTransactions && item.allTransactions.length > 0
      ? item.allTransactions
      : allRevenueTransactions
          .filter((tx) => String(tx.reservationId) === String(resId))
          .sort((a, b) => new Date(a.rawTimestamp).getTime() - new Date(b.rawTimestamp).getTime());

    // Sum of all payment transactions collected
    const currentTotalPaid = historyToUse.reduce((s: number, tx: any) => s + (Number(tx.collectedAmount) || 0), 0);

    // Single source of truth for the final booking payable amount
    const rawTotalFromSystem = Number(
      matchingPayment?.totalAmount || matchingBooking?.totalAmount || item.totalBookingAmount || 0
    );
    const currentTotalBookingAmount = rawTotalFromSystem > 0
      ? Math.max(rawTotalFromSystem, currentTotalPaid)
      : currentTotalPaid;

    const extensionTotal = historyToUse
      .filter((tx: any) => tx.badgeType === 'extension')
      .reduce((s: number, tx: any) => s + (Number(tx.collectedAmount) || 0), 0);

    const additionalAdvanceTotal = historyToUse
      .filter((tx: any) => tx.badgeType === 'additional')
      .reduce((s: number, tx: any) => s + (Number(tx.collectedAmount) || 0), 0);

    // Derive original booking amount by subtracting extensions from final current booking total
    const originalBookingAmount = Math.max(0, currentTotalBookingAmount - extensionTotal);

    // Remaining balance = Current Booking Total - Collected
    const remainingBalance = Math.max(0, currentTotalBookingAmount - currentTotalPaid);

    setSelectedRevenueDetail({
      guestName: item.guestName,
      roomNumbers: item.roomNumbers,
      checkInDate: item.checkInDate,
      checkOutDate: item.checkOutDate,
      reservationId: resId,
      summary: {
        originalBookingAmount,
        extensionTotal,
        additionalAdvanceTotal,
        currentTotalBookingAmount,
        currentTotalPaid,
        remainingBalance,
      },
      history: historyToUse,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 text-center text-slate-500 font-medium text-xs flex flex-col items-center justify-center space-y-2">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <span>Loading financial analytics data...</span>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 space-y-3.5 max-w-7xl mx-auto overflow-hidden">
      {/* 1. THUMB-FRIENDLY MONTH & YEAR SELECTOR (Directly at top, saving mobile screen space) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-2.5 sm:p-3 shadow-2xs space-y-2">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2">
          {/* Previous Month */}
          <button
            onClick={handlePrevMonth}
            className="p-2 sm:p-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 rounded-xl cursor-pointer transition touch-manipulation min-w-[38px] min-h-[38px] flex items-center justify-center shrink-0"
            title="Previous Month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Month Picker / Label Overlay */}
          <div className="relative flex-1 flex items-center justify-center px-2.5 py-2 bg-indigo-50/80 border border-indigo-200/90 rounded-xl cursor-pointer hover:bg-indigo-100/80 transition text-center min-h-[38px] touch-manipulation">
            <CalendarIcon className="w-4 h-4 text-indigo-600 shrink-0 mr-1.5" />
            <span className="font-extrabold text-slate-900 text-xs sm:text-base tracking-tight truncate">
              {formatMonthLabel(selectedMonth)}
            </span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedMonth(e.target.value);
                  setSelectedYear(parseInt(e.target.value.split('-')[0], 10));
                }
              }}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
          </div>

          {/* Next Month */}
          <button
            onClick={handleNextMonth}
            className="p-2 sm:p-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 rounded-xl cursor-pointer transition touch-manipulation min-w-[38px] min-h-[38px] flex items-center justify-center shrink-0"
            title="Next Month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Year Dropdown */}
          <div className="relative flex items-center shrink-0">
            <select
              value={selectedYear}
              onChange={(e) => {
                const newY = parseInt(e.target.value, 10);
                const m = selectedMonth.split('-')[1];
                setSelectedYear(newY);
                setSelectedMonth(`${newY}-${m}`);
              }}
              className="appearance-none font-sans font-extrabold text-xs sm:text-sm text-slate-900 bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-2 pr-6 cursor-pointer hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[38px] touch-manipulation"
            >
              {yearOptions.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 pointer-events-none" />
          </div>
        </div>

        {/* Return to Current Month Shortcut */}
        {selectedMonth !== defaultMonthStr && (
          <div className="flex justify-center pt-0.5">
            <button
              onClick={handleCurrentMonth}
              className="px-3 py-1 bg-indigo-600 active:bg-indigo-700 text-white font-bold rounded-lg text-[11px] cursor-pointer shadow-2xs transition flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Back to Current Month</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. SUMMARY CARDS (Strict 4-Row Layout & Clean Modern Typography) */}
      <div className="space-y-2 sm:space-y-3">
        {/* Row 1: Rent & Salary (Equal Width) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {/* Rent */}
          <div className="p-3 sm:p-3.5 bg-lime-50/90 border border-lime-200/80 rounded-2xl shadow-2xs flex flex-col justify-between min-h-[88px]">
            <div className="flex items-center justify-between text-lime-900">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wide flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-lime-700 shrink-0" /> Rent
              </span>
              <span className="text-[9px] font-sans font-extrabold bg-lime-200/80 text-lime-950 px-1.5 py-0.5 rounded-md">
                Lease
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-extrabold font-sans tracking-tight text-lime-950 my-0.5">
              <AnimatedNumber value={metrics.monthRentExp} />
            </p>
            <p className="text-[10px] font-semibold text-lime-800/90 truncate">
              {formatMonthLabel(selectedMonth)} property
            </p>
          </div>

          {/* Salary */}
          <div className="p-3 sm:p-3.5 bg-indigo-50/90 border border-indigo-200/80 rounded-2xl shadow-2xs flex flex-col justify-between min-h-[88px]">
            <div className="flex items-center justify-between text-indigo-900">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wide flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-indigo-700 shrink-0" /> Salary
              </span>
              <span className="text-[9px] font-sans font-extrabold bg-indigo-200/80 text-indigo-950 px-1.5 py-0.5 rounded-md">
                Staff
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-extrabold font-sans tracking-tight text-indigo-950 my-0.5">
              <AnimatedNumber value={metrics.monthSalaryExp} />
            </p>
            <p className="text-[10px] font-semibold text-indigo-800/90 truncate">
              {formatMonthLabel(selectedMonth)} staff
            </p>
          </div>
        </div>

        {/* Row 2: Inventory & Ops (Full Width) */}
        <div className="p-3 sm:p-3.5 bg-amber-50/90 border border-amber-200/80 rounded-2xl shadow-2xs flex flex-col justify-between min-h-[88px]">
          <div className="flex items-center justify-between text-amber-900">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wide flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-amber-700 shrink-0" /> Inventory &amp; Ops
            </span>
            <span className="text-[9px] font-sans font-extrabold bg-amber-200/80 text-amber-950 px-1.5 py-0.5 rounded-md">
              Operations
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-extrabold font-sans tracking-tight text-amber-950 my-0.5">
            <AnimatedNumber value={metrics.monthInventoryExp} />
          </p>
          <p className="text-[10px] font-semibold text-amber-800/90 truncate">
            Inventory &amp; operational expenses for {formatMonthLabel(selectedMonth)}
          </p>
        </div>

        {/* Row 3: Total Revenue & Outstanding Dues (Equal Width) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {/* Total Revenue */}
          <div className="p-3 sm:p-3.5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs flex flex-col justify-between min-h-[88px]">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider">Total Revenue</span>
              <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <DollarSign className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-extrabold font-sans tracking-tight text-slate-900 my-0.5">
              <AnimatedNumber value={metrics.monthRevenue} />
            </p>
            <p className="text-[10px] font-semibold text-slate-500 truncate">
              {formatMonthLabel(selectedMonth)} bookings
            </p>
          </div>

          {/* Outstanding Dues */}
          <div className="p-3 sm:p-3.5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs flex flex-col justify-between min-h-[88px]">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider">Outstanding Dues</span>
              <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                <Wallet className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-extrabold font-sans tracking-tight text-amber-600 my-0.5">
              <AnimatedNumber value={metrics.outstandingBalance} />
            </p>
            <p className="text-[10px] font-semibold text-slate-500 truncate">Pending guest balance</p>
          </div>
        </div>

        {/* Row 4: Month Net Profit (Full Width - Most Prominent Card with Partner Split) */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white rounded-2xl shadow-xl border border-slate-800 space-y-4">
          {/* Main Net Profit Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-slate-300 pb-3 border-b border-slate-800 gap-2">
            <div>
              <span className="text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-1.5 text-slate-200">
                <Receipt className="w-4 h-4 text-emerald-400 shrink-0" /> Business Net Profit
              </span>
              <p className="text-[10px] text-slate-400 font-medium">
                Revenue (₹{metrics.monthRevenue.toLocaleString('en-IN')}) - Operating Expenses (₹{metrics.totalMonthAllExp.toLocaleString('en-IN')}) ({formatMonthLabel(selectedMonth)})
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-2xl sm:text-3xl font-black font-sans tracking-tight">
                <AnimatedNumber
                  value={metrics.netIncome}
                  className={metrics.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}
                />
              </p>
            </div>
          </div>

          {/* 50/50 Profit Share Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Ansari Share (50%) */}
            <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/80 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">Ansari Share (50%)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-indigo-950/60 text-indigo-300 rounded border border-indigo-800/60">Partner</span>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-400 mb-0.5">Profit Share (50%):</p>
                <p className="text-2xl font-black text-white">
                  <AnimatedNumber value={metrics.netIncome * 0.5} className={metrics.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
                </p>
              </div>
              <p className="text-[10px] text-slate-400">Direct 50% Profit Share</p>
            </div>

            {/* Irshad Share (50%) & Settlement */}
            {(() => {
              const irshadProfitShare = metrics.netIncome * 0.5;
              const { bookingTransferred, expenseByIrshad, settlementPaid, walletNet } = walletNetSummary;

              const irshadFinal = irshadProfitShare - walletNet;

              return (
                <div className="p-3.5 bg-purple-950/40 rounded-xl border border-purple-800/60 space-y-2.5">
                  <div className="flex items-center justify-between text-purple-300">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Irshad Share &amp; Settlement</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-purple-900/60 text-purple-200 rounded border border-purple-700/60">Partner</span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Irshad Profit Share:</span>
                      <span className="font-extrabold text-emerald-400">
                        <AnimatedNumber value={irshadProfitShare} />
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span>Booking Dues:</span>
                      <span className="font-extrabold text-rose-400">
                        -₹{bookingTransferred.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span>Expense Credit:</span>
                      <span className="font-extrabold text-emerald-400">
                        +₹{expenseByIrshad.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span>Settlement Paid:</span>
                      <span className={`font-extrabold ${settlementPaid >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {settlementPaid >= 0 ? `+₹${settlementPaid.toLocaleString('en-IN')}` : `-₹${Math.abs(settlementPaid).toLocaleString('en-IN')}`}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-purple-800/60 flex items-center justify-between">
                      <span className="font-extrabold text-white">Final Settlement:</span>
                      <span className={`text-base font-black ${irshadFinal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        <AnimatedNumber value={irshadFinal} />
                      </span>
                    </div>
                  </div>

                  <div className="pt-1">
                    {irshadFinal < 0 ? (
                      <div className="p-2 bg-rose-950/80 border border-rose-800/80 rounded-lg text-rose-200 text-[11px] font-bold text-center">
                        Status: Irshad should pay Resort ₹{Math.abs(irshadFinal).toLocaleString('en-IN')}
                      </div>
                    ) : (
                      <div className="p-2 bg-emerald-950/80 border border-emerald-800/80 rounded-lg text-emerald-200 text-[11px] font-bold text-center">
                        Status: Irshad receives ₹{irshadFinal.toLocaleString('en-IN')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* 3. FULL YEAR 12-MONTH CHART (All 12 Months Always Present) */}
      <div className="bg-white p-3 sm:p-4 border border-slate-200/80 rounded-2xl shadow-2xs space-y-2">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2 gap-2">
          <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-indigo-600 shrink-0" />
            Monthly Revenue vs Operating Expenses ({selectedYear})
          </h3>
          <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
            <Info className="w-3 h-3 text-slate-400" />
            <span>Swipe horizontally to view all months</span>
          </div>
        </div>

        <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 pb-1">
          <div className="min-w-[580px] sm:min-w-full h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearly12MonthsData} margin={{ top: 12, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 700 }} stroke="#475569" interval={0} />
                <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip content={<YearlyChartTooltip />} wrapperStyle={{ zIndex: 50 }} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="revenue" name="Room Revenue" fill="#10B981" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={900} />
                <Bar dataKey="inventory" name="Inventory" fill="#F59E0B" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={900} />
                <Bar dataKey="salary" name="Salary" fill="#6366F1" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={900} />
                <Bar dataKey="rent" name="Rent" fill="#84CC16" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. PROGRESSIVE DAILY CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* CHART 1: DAILY ROOM REVENUE */}
        <div className="bg-white p-3 sm:p-4 border border-slate-200/80 rounded-2xl shadow-2xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2 gap-2">
            <div>
              <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                <ArrowUpRight className="w-4 h-4 text-emerald-600 shrink-0" />
                Daily Room Revenue ({formatMonthLabel(selectedMonth)})
              </h3>
              <div className="text-[11px] font-medium text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                <span>Today: {dailyDataForMonth.todayFormatted}</span>
                <span className="text-slate-300">•</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
                  {dailyDataForMonth.isFutureMonth
                    ? 'Future Month'
                    : `Completed: ${dailyDataForMonth.completedDays} of ${dailyDataForMonth.totalDaysInMonth} days`}
                </span>
              </div>
            </div>

            {/* Zoom Controls */}
            {!dailyDataForMonth.isFutureMonth && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setRevChartZoom((z) => Math.min(2.5, z + 0.5))}
                  className="p-1 hover:bg-white rounded text-slate-600 cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-sans font-extrabold text-slate-700 px-1">
                  {revChartZoom}x
                </span>
                <button
                  onClick={() => setRevChartZoom((z) => Math.max(1, z - 0.5))}
                  className="p-1 hover:bg-white rounded text-slate-600 cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                {revChartZoom > 1 && (
                  <button
                    onClick={() => setRevChartZoom(1)}
                    className="p-1 hover:bg-white rounded text-indigo-600 font-bold text-[10px] cursor-pointer"
                    title="Reset Zoom"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Chart Body or Clean Empty States */}
          {dailyDataForMonth.isFutureMonth ? (
            <div className="h-56 sm:h-64 w-full flex flex-col items-center justify-center p-6 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200 space-y-2">
              <CalendarIcon className="w-8 h-8 text-slate-300" />
              <p className="font-bold text-slate-700 text-xs sm:text-sm">No bookings recorded yet</p>
              <p className="text-[11px] text-slate-400">Start creating bookings to generate analytics.</p>
            </div>
          ) : dailyDataForMonth.totalRevMonth === 0 ? (
            <div className="h-56 sm:h-64 w-full flex flex-col items-center justify-center p-6 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200 space-y-2">
              <Package className="w-8 h-8 text-slate-300" />
              <p className="font-bold text-slate-700 text-xs sm:text-sm">No bookings recorded yet</p>
              <p className="text-[11px] text-slate-400">Start creating bookings to generate analytics.</p>
            </div>
          ) : (
            <div
              className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 pb-1"
              onDoubleClick={() => setRevChartZoom(1)}
            >
              <div
                className="h-56 sm:h-64 transition-all duration-300"
                style={{ width: `${revChartZoom * 100}%`, minWidth: '100%' }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={dailyDataForMonth.daysList}
                    margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="shortLabel"
                      tick={{ fontSize: 10, fontWeight: 700 }}
                      stroke="#64748b"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip
                      content={<DailyChartTooltip metrics={metrics} chartType="revenue" />}
                      wrapperStyle={{ zIndex: 50 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="#10B981"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#10B981', strokeWidth: 2, stroke: '#ffffff' }}
                      activeDot={{ r: 7, fill: '#059669', stroke: '#ffffff', strokeWidth: 2.5 }}
                      connectNulls={false}
                      isAnimationActive={true}
                      animationDuration={1200}
                      animationEasing="ease-in-out"
                      key={`rev-line-${selectedMonth}-${revChartZoom}`}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* CHART 2: DAILY INVENTORY EXPENSES */}
        <div className="bg-white p-3 sm:p-4 border border-slate-200/80 rounded-2xl shadow-2xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2 gap-2">
            <div>
              <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                <ArrowDownRight className="w-4 h-4 text-rose-600 shrink-0" />
                Daily Inventory Expenses ({formatMonthLabel(selectedMonth)})
              </h3>
              <div className="text-[11px] font-medium text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                <span>Today: {dailyDataForMonth.todayFormatted}</span>
                <span className="text-slate-300">•</span>
                <span className="font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded text-[10px]">
                  {dailyDataForMonth.isFutureMonth
                    ? 'Future Month'
                    : `Completed: ${dailyDataForMonth.completedDays} of ${dailyDataForMonth.totalDaysInMonth} days`}
                </span>
              </div>
            </div>

            {/* Zoom Controls */}
            {!dailyDataForMonth.isFutureMonth && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setInvChartZoom((z) => Math.min(2.5, z + 0.5))}
                  className="p-1 hover:bg-white rounded text-slate-600 cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-sans font-extrabold text-slate-700 px-1">
                  {invChartZoom}x
                </span>
                <button
                  onClick={() => setInvChartZoom((z) => Math.max(1, z - 0.5))}
                  className="p-1 hover:bg-white rounded text-slate-600 cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                {invChartZoom > 1 && (
                  <button
                    onClick={() => setInvChartZoom(1)}
                    className="p-1 hover:bg-white rounded text-indigo-600 font-bold text-[10px] cursor-pointer"
                    title="Reset Zoom"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Chart Body or Clean Empty States */}
          {dailyDataForMonth.isFutureMonth ? (
            <div className="h-56 sm:h-64 w-full flex flex-col items-center justify-center p-6 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200 space-y-2">
              <CalendarIcon className="w-8 h-8 text-slate-300" />
              <p className="font-bold text-slate-700 text-xs sm:text-sm">No inventory expenses recorded yet.</p>
              <p className="text-[11px] text-slate-400">Future dates have not occurred yet.</p>
            </div>
          ) : dailyDataForMonth.totalExpMonth === 0 ? (
            <div className="h-56 sm:h-64 w-full flex flex-col items-center justify-center p-6 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200 space-y-2">
              <Receipt className="w-8 h-8 text-slate-300" />
              <p className="font-bold text-slate-700 text-xs sm:text-sm">No inventory expenses recorded yet.</p>
              <p className="text-[11px] text-slate-400">Log expenses in Inventory to track daily usage.</p>
            </div>
          ) : (
            <div
              className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 pb-1"
              onDoubleClick={() => setInvChartZoom(1)}
            >
              <div
                className="h-56 sm:h-64 transition-all duration-300"
                style={{ width: `${invChartZoom * 100}%`, minWidth: '100%' }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={dailyDataForMonth.daysList}
                    margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="shortLabel"
                      tick={{ fontSize: 10, fontWeight: 700 }}
                      stroke="#64748b"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip
                      content={<DailyChartTooltip metrics={metrics} chartType="expenses" />}
                      wrapperStyle={{ zIndex: 50 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="expenses"
                      name="Inventory Expenses"
                      stroke="#f43f5e"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#f43f5e', strokeWidth: 2, stroke: '#ffffff' }}
                      activeDot={{ r: 7, fill: '#e11d48', stroke: '#ffffff', strokeWidth: 2.5 }}
                      connectNulls={false}
                      isAnimationActive={true}
                      animationDuration={1200}
                      animationEasing="ease-in-out"
                      key={`exp-line-${selectedMonth}-${invChartZoom}`}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 5. BOOKING REVENUE LEDGER SECTION (Redesigned Single-Day Expense Ledger Style) */}
      <div id="booking-revenue-ledger" className="bg-white p-3.5 sm:p-5 border border-slate-200/80 rounded-2xl shadow-2xs space-y-4">
        {/* Top Title */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-3">
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-2">
              <Receipt className="w-5 h-5 text-indigo-600 shrink-0" />
              Reservation Revenue Ledger
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Daily reservation revenue ledger grouped cleanly by Reservation ID.
            </p>
          </div>
        </div>

        {/* Date Navigation Bar (Identical to Expense Ledger) */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-2.5 sm:p-3 rounded-2xl border border-slate-200/80">
          <div className="flex items-center gap-2">
            <button
              onClick={handleLedgerPrevDay}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-extrabold text-slate-700 shadow-2xs flex items-center gap-1.5 hover:bg-slate-50 transition cursor-pointer active:scale-95"
            >
              <ChevronLeft className="w-4 h-4 text-slate-500" />
              <span className="hidden sm:inline">Previous Day</span>
            </button>

            {/* Center Date Card */}
            <div className="relative flex items-center bg-white border border-indigo-200/90 rounded-xl px-3.5 py-1.5 shadow-2xs hover:border-indigo-400 transition cursor-pointer">
              <CalendarIcon className="w-4 h-4 text-indigo-600 mr-2 shrink-0" />
              <div className="text-center">
                <span className="font-mono font-black text-xs sm:text-sm text-slate-900 block">
                  {ledgerDateHeader.dateFormatted}
                </span>
                <span className="block text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                  {ledgerDateHeader.weekday}
                </span>
              </div>
              <input
                type="date"
                value={ledgerSelectedDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setLedgerSelectedDate(e.target.value);
                    const m = e.target.value.substring(0, 7);
                    if (m !== selectedMonth) setSelectedMonth(m);
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>

            <button
              onClick={handleLedgerNextDay}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-extrabold text-slate-700 shadow-2xs flex items-center gap-1.5 hover:bg-slate-50 transition cursor-pointer active:scale-95"
            >
              <span className="hidden sm:inline">Next Day</span>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {/* Go to Today Button */}
          {ledgerSelectedDate !== currentISTDateStr && (
            <button
              onClick={() => {
                setLedgerSelectedDate(currentISTDateStr);
                const m = currentISTDateStr.substring(0, 7);
                if (m !== selectedMonth) setSelectedMonth(m);
              }}
              className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-xl text-xs font-extrabold text-indigo-700 transition cursor-pointer active:scale-95 ml-auto"
            >
              Go to Today
            </button>
          )}
        </div>

        {/* Dark Navy Summary Header (Selected Day Revenue & Booking Count) */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest block">
              {ledgerDateHeader.dateFormatted}
            </span>
            <h4 className="text-xl sm:text-2xl font-black text-emerald-400 tracking-tight mt-0.5">
              Revenue ₹{dayTotalRevenue.toLocaleString()}
            </h4>
          </div>
          <div className="text-right">
            <span className="px-3.5 py-1.5 bg-slate-800 border border-slate-700/80 rounded-xl text-xs sm:text-sm font-extrabold text-slate-200 shadow-2xs">
              {dayBookingCount} {dayBookingCount === 1 ? 'Booking' : 'Bookings'}
            </span>
          </div>
        </div>

        {/* Sticky Search & Scrollable Filter Chips Toolbar */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md py-2 space-y-2 border-b border-slate-100 shadow-3xs">
          {/* Full width rounded search */}
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Guest Name, Reservation ID, or Room..."
              value={ledgerSearchQuery}
              onChange={(e) => setLedgerSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 text-xs sm:text-sm bg-slate-50/90 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium transition"
            />
            {ledgerSearchQuery && (
              <button
                onClick={() => setLedgerSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Scrollable Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-xs">
            {[
              { id: 'ALL', label: 'All' },
              { id: 'paid', label: 'Paid' },
              { id: 'partial', label: 'Partial' },
              { id: 'pending', label: 'Pending' },
              { id: 'advance', label: 'Advance' },
              { id: 'balance', label: 'Balance' },
              { id: 'extension', label: 'Extension' },
              { id: 'additional', label: 'Additional' },
              { id: 'combined', label: 'Combined' },
            ].map((chip) => {
              const isActive = ledgerFilterType === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => setLedgerFilterType(chip.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/60'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Booking Entries Ledger List */}
        <div className="pt-1">
          {filteredReservationLedgerData.length === 0 ? (
            <div className="p-8 text-center bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 space-y-2">
              <Receipt className="w-8 h-8 text-slate-300 mx-auto stroke-1" />
              <p className="font-bold text-slate-700 text-xs sm:text-sm">No collections recorded</p>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                {selectedDayReservationLedgerData.length === 0
                  ? `No reservation revenue records found for ${ledgerDateHeader.dateFormatted}.`
                  : 'No reservations match your search or filter criteria.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-2xl bg-white overflow-hidden shadow-2xs">
              {filteredReservationLedgerData.map((item) => {
                const formattedRooms = item.roomNumbers
                  .replace(/Room\s*/gi, '')
                  .split(/[\s,]+/)
                  .filter(Boolean)
                  .join(' • ') || item.roomNumbers;

                return (
                  <div
                    key={item.reservationId}
                    className="px-3.5 sm:px-5 py-3 hover:bg-slate-50/90 transition-colors duration-150 flex items-center justify-between gap-3 min-h-[80px]"
                  >
                    {/* Left Side: Guest Name, Rooms & Badges */}
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-black text-slate-900 text-lg sm:text-[22px] leading-tight truncate">
                          {item.guestName}
                        </h4>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono font-bold text-xs sm:text-[14px] rounded-md border border-slate-200/70 shrink-0">
                          {formattedRooms}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Status Badge */}
                        <span className={`px-2 py-0.5 rounded-full text-[11px] sm:text-[13px] font-black uppercase border ${item.statusClass}`}>
                          {item.statusLabel}
                        </span>

                        {/* Payment Type Badge */}
                        <span className={`px-2 py-0.5 rounded-full text-[11px] sm:text-[13px] font-black border ${item.paymentBadgeClass}`}>
                          {item.paymentBadgeLabel}
                        </span>
                      </div>
                    </div>

                    {/* Right Side: Collected Amount & View Details */}
                    <div className="text-right shrink-0 flex flex-col items-end justify-center gap-1">
                      <span className="text-xl sm:text-[28px] font-black text-emerald-600 font-sans tracking-tight">
                        ₹{item.totalCollected.toLocaleString()}
                      </span>

                      <button
                        onClick={() => handleOpenRevenueDetailModal(item)}
                        className="text-xs sm:text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:bg-indigo-50/80 px-2.5 py-1 rounded-lg transition cursor-pointer"
                      >
                        <span>View Details</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* VIEW DETAILS MODAL FOR REVENUE LEDGER */}
      {selectedRevenueDetail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-3.5 sm:p-4 shadow-2xl border border-slate-100 space-y-3 max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-indigo-600" />
                Reservation Details
              </h3>
              <button
                onClick={() => setSelectedRevenueDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Compact Guest, Rooms & Dates */}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-slate-900 text-sm sm:text-base">{selectedRevenueDetail.guestName}</span>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Rooms</span>
                  <span className="px-2 py-0.5 bg-slate-200/80 text-slate-800 font-mono font-bold text-xs rounded-md border border-slate-300/60 inline-block">
                    {selectedRevenueDetail.roomNumbers.replace(/Room\s*/gi, '').split(/[\s,]+/).filter(Boolean).join(' • ') || selectedRevenueDetail.roomNumbers}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600 pt-1 border-t border-slate-200/60">
                <span>{formatDisplayDate(selectedRevenueDetail.checkInDate)}</span>
                <span className="text-slate-400 font-normal">→</span>
                <span>{formatDisplayDate(selectedRevenueDetail.checkOutDate)}</span>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-slate-900 text-white p-3 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between items-center pb-1 border-b border-slate-800">
                <span className="font-extrabold uppercase text-[10px] text-slate-400 tracking-wider">Financial Breakdown</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                  selectedRevenueDetail.summary.remainingBalance === 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {selectedRevenueDetail.summary.remainingBalance === 0 ? 'Paid' : 'Partial'}
                </span>
              </div>

              <div className="flex justify-between text-slate-300">
                <span>Original Booking:</span>
                <span className="font-mono font-bold">₹{selectedRevenueDetail.summary.originalBookingAmount.toLocaleString()}</span>
              </div>

              {selectedRevenueDetail.summary.extensionTotal > 0 && (
                <div className="flex justify-between text-amber-300">
                  <span>Extended Stay:</span>
                  <span className="font-mono font-bold">+₹{selectedRevenueDetail.summary.extensionTotal.toLocaleString()}</span>
                </div>
              )}

              {selectedRevenueDetail.summary.additionalAdvanceTotal > 0 && (
                <div className="flex justify-between text-teal-300">
                  <span>Additional Advance:</span>
                  <span className="font-mono font-bold">+₹{selectedRevenueDetail.summary.additionalAdvanceTotal.toLocaleString()}</span>
                </div>
              )}

              <div className="border-t border-slate-800 pt-1 flex justify-between font-bold text-slate-100">
                <span>Current Total:</span>
                <span className="font-mono text-xs sm:text-sm">₹{selectedRevenueDetail.summary.currentTotalBookingAmount.toLocaleString()}</span>
              </div>

              <div className="flex justify-between font-extrabold text-emerald-400">
                <span>Collected:</span>
                <span className="font-mono text-xs sm:text-sm">₹{selectedRevenueDetail.summary.currentTotalPaid.toLocaleString()}</span>
              </div>

              <div className="border-t border-slate-800 pt-1 flex justify-between font-extrabold">
                <span>Remaining:</span>
                <span className={`font-mono text-xs sm:text-sm ${selectedRevenueDetail.summary.remainingBalance > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                  ₹{selectedRevenueDetail.summary.remainingBalance.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Payment Timeline */}
            <div className="space-y-1.5">
              <h4 className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">Payment Timeline</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {selectedRevenueDetail.history.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-2">No payment transactions recorded.</p>
                ) : (
                  selectedRevenueDetail.history.map((tx: any, idx: number) => {
                    const badgeTypeUpper = (tx.badgeLabel || tx.badgeType || 'Payment').toUpperCase();
                    const paidOnStr = `${formatDisplayDate(tx.collectionDate)} ${tx.collectionTime || ''}`.trim();

                    return (
                      <div key={tx.id || idx} className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-900 text-white tracking-wider">
                            {badgeTypeUpper}
                          </span>
                          <span className="font-black text-emerald-600 font-mono text-sm">₹{tx.collectedAmount.toLocaleString()}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600 pt-1 border-t border-slate-200/60">
                          <div>
                            <span className="text-slate-400 font-medium block text-[9px] uppercase tracking-wider">Paid On</span>
                            <span className="font-bold text-slate-800">{paidOnStr}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-medium block text-[9px] uppercase tracking-wider">Method</span>
                            <span className="font-bold text-slate-800 capitalize">{tx.paymentMethod || 'Cash'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400 font-medium block text-[9px] uppercase tracking-wider">Collector</span>
                            <span className="font-bold text-slate-800">{tx.collector || 'Front Desk'}</span>
                          </div>
                        </div>

                        {tx.remarks && (
                          <div className="pt-1 border-t border-slate-200/40">
                            <span className="text-slate-400 font-medium block text-[9px] uppercase tracking-wider">Remarks</span>
                            <span className="text-slate-700 italic text-[11px]">"{tx.remarks}"</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="pt-1.5 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedRevenueDetail(null)}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
