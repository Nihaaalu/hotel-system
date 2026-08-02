import React, { useState, useEffect, useMemo } from 'react';
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

  // Expanded days map for Booking Revenue Ledger
  const [expandedDaysMap, setExpandedDaysMap] = useState<Record<string, boolean>>({});

  const toggleDayExpansion = (dateKey: string) => {
    setExpandedDaysMap((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  };

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
        console.log("Analytics Summary", netSummary);
      } catch (err) {
        console.error('Error fetching Irshad wallet summary', err);
      }
    }
    async function loadOutstandingDues() {
      try {
        const { data: payData } = await supabase
          .from('payments')
          .select('remaining_balance')
          .eq('balance_due_wallet', true)
          .gt('remaining_balance', 0)
          .eq('payment_status', 'pending');

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

  // 5. Booking Revenue Ledger Data (grouped by day for selectedMonth)
  const bookingRevenueLedgerData = useMemo(() => {
    if (!selectedMonth || !selectedMonth.includes('-')) return [];

    const [yStr, mStr] = selectedMonth.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthShort = SHORT_MONTH_NAMES[month - 1] || '';

    const list = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateKey = `${selectedMonth}-${dayStr}`;

      const dayBookings = bookings.filter(
        (b) => b.status !== 'cancelled' && b.checkInDate === dateKey
      );

      const dayPayments = payments.filter((p) => {
        const pDate = (p.paymentDate || p.createdAt || '').split('T')[0];
        return pDate === dateKey;
      });

      // Group day bookings by reservation
      const resGroupMap = new Map<string, typeof dayBookings>();
      dayBookings.forEach((b) => {
        const key = b.bookingGroupId || b.id;
        if (!resGroupMap.has(key)) {
          resGroupMap.set(key, []);
        }
        resGroupMap.get(key)!.push(b);
      });

      const items: Array<{
        id: string;
        customerName: string;
        roomNumber: number | string;
        collectedAmount: number;
        remainingDue: number;
        paymentMethod: string;
        isIrshadWallet: boolean;
        isBalanceDueWallet: boolean;
        status: string;
      }> = [];

      const processedResIds = new Set<string>();

      resGroupMap.forEach((group, resId) => {
        processedResIds.add(resId);
        const primary = group[0];
        const roomNumbersStr = group
          .map((b) => b.roomNumber)
          .filter(Boolean)
          .sort((a, b) => Number(a) - Number(b))
          .join(', ');

        const p = payments.find((pay) => String(pay.reservationId || pay.bookingId) === resId);

        const collected = p
          ? Number(
              p.amountCollected !== undefined
                ? p.amountCollected
                : p.amount !== undefined
                ? p.amount
                : p.advancePaid || 0
            )
          : Number(primary.advancePaid || 0);

        const remaining = p ? Number(p.remainingBalance || 0) : Number(primary.remainingBalance || 0);
        const isIrshad = p ? Boolean(p.transferToIrshad) : Boolean(primary.transferToIrshad || primary.transferredToIrshad);
        const isDueWallet = p ? Boolean(p.balanceDueWallet) : Boolean(primary.balanceDueWallet || (remaining > 0));
        const paymentMethod = p ? p.paymentMethod : (primary.paymentMethod || 'cash');

        items.push({
          id: resId,
          customerName: primary.guestName || 'Guest',
          roomNumber: roomNumbersStr || primary.roomNumber,
          collectedAmount: collected,
          remainingDue: remaining,
          paymentMethod: paymentMethod || 'cash',
          isIrshadWallet: isIrshad,
          isBalanceDueWallet: isDueWallet,
          status: primary.status || 'checked_in',
        });
      });

      dayPayments.forEach((p) => {
        const pResId = String(p.reservationId || p.bookingId || p.id);
        if (p.paymentType === 'due_collection' && !processedResIds.has(pResId)) {
          const matchingBooking = bookings.find((b) => b.id === pResId || b.bookingGroupId === pResId);
          items.push({
            id: p.id,
            customerName: matchingBooking ? matchingBooking.guestName : 'Due Collection',
            roomNumber: matchingBooking ? matchingBooking.roomNumber : '-',
            collectedAmount: Number(p.amountCollected || p.amount || 0),
            remainingDue: Number(p.remainingBalance || 0),
            paymentMethod: p.paymentMethod || 'cash',
            isIrshadWallet: Boolean(p.transferToIrshad),
            isBalanceDueWallet: Boolean(p.balanceDueWallet),
            status: 'paid',
          });
        }
      });

      const dayCollected = items.reduce((sum, item) => sum + item.collectedAmount, 0);
      const dayDue = items.reduce((sum, item) => sum + item.remainingDue, 0);

      list.push({
        dayNum: day,
        dateKey,
        label: `${day} ${monthShort} ${year}`,
        shortLabel: String(day),
        bookingsCount: dayBookings.length,
        collectedAmount: dayCollected,
        outstandingBalance: dayDue,
        items,
      });
    }

    return list;
  }, [selectedMonth, bookings, payments]);

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

      {/* 5. BOOKING REVENUE LEDGER SECTION */}
      <div className="bg-white p-3 sm:p-5 border border-slate-200/80 rounded-2xl shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-2">
              <Receipt className="w-5 h-5 text-indigo-600 shrink-0" />
              Booking Revenue Ledger ({formatMonthLabel(selectedMonth)})
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Daily breakdown of bookings, collected revenue, and outstanding customer dues.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {bookingRevenueLedgerData.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
              No booking revenue records available for this month.
            </div>
          ) : (
            bookingRevenueLedgerData.map((dayData) => {
              const isExpanded = Boolean(expandedDaysMap[dayData.dateKey]);
              const hasActivity = dayData.bookingsCount > 0 || dayData.collectedAmount > 0 || dayData.items.length > 0;

              return (
                <div
                  key={dayData.dateKey}
                  className={`border rounded-xl transition-all ${
                    hasActivity
                      ? 'border-slate-200/90 bg-white hover:border-slate-300'
                      : 'border-slate-100 bg-slate-50/40 opacity-70'
                  }`}
                >
                  {/* Day Header Row */}
                  <div
                    onClick={() => toggleDayExpansion(dayData.dateKey)}
                    className="p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-[140px]">
                      <span className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg font-mono font-bold text-xs border border-indigo-100">
                        {dayData.shortLabel}
                      </span>
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs sm:text-sm">{dayData.label}</h4>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium mt-0.5">
                          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-semibold text-[10px]">
                            {dayData.bookingsCount} {dayData.bookingsCount === 1 ? 'Booking' : 'Bookings'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Summary Totals */}
                    <div className="flex items-center gap-4 sm:gap-6 ml-auto">
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Collected</span>
                        <span className="text-xs sm:text-sm font-black text-emerald-600">
                          ₹{dayData.collectedAmount.toLocaleString()}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Outstanding Due</span>
                        <span className={`text-xs sm:text-sm font-black ${dayData.outstandingBalance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                          ₹{dayData.outstandingBalance.toLocaleString()}
                        </span>
                      </div>

                      <button className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition">
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Expandable Details Drawer */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4 space-y-2">
                      {dayData.items.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-2">No bookings or collections recorded for this date.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500 pb-1">
                                <th className="pb-2">Customer</th>
                                <th className="pb-2">Room</th>
                                <th className="pb-2">Collected</th>
                                <th className="pb-2">Remaining Due</th>
                                <th className="pb-2">Method</th>
                                <th className="pb-2">Wallets / Badges</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {dayData.items.map((item) => (
                                <tr key={item.id} className="hover:bg-white/60">
                                  <td className="py-2.5 font-bold text-slate-900">{item.customerName}</td>
                                  <td className="py-2.5 text-slate-600 font-mono">
                                    {typeof item.roomNumber === 'number' ? `Room ${item.roomNumber}` : item.roomNumber}
                                  </td>
                                  <td className="py-2.5 font-extrabold text-emerald-600">₹{item.collectedAmount.toLocaleString()}</td>
                                  <td className={`py-2.5 font-extrabold ${item.remainingDue > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                    ₹{item.remainingDue.toLocaleString()}
                                  </td>
                                  <td className="py-2.5 text-slate-600 uppercase font-mono text-[10px]">{item.paymentMethod}</td>
                                  <td className="py-2.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {item.isIrshadWallet && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200">
                                          Irshad Wallet
                                        </span>
                                      )}
                                      {item.isBalanceDueWallet && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                                          Balance Due Wallet
                                        </span>
                                      )}
                                      {!item.isBalanceDueWallet && item.remainingDue === 0 && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                          Paid
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
