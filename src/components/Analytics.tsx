import React, { useState, useEffect, useMemo } from 'react';
import { useHotelData } from '../context/HotelContext';
import { SalaryRentService } from '../services/salaryRent';
import { SalaryPayment, RentPayment } from '../types';
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Receipt,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Building2,
  Users,
  Package,
  Calendar as CalendarIcon,
  RotateCcw,
  ArrowUpRight,
  ArrowDownRight,
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
  totalAmount: number;
  advancePaid: number;
  checkInDate: string;
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

export default function Analytics() {
  const { bookings, expenses, isLoading } = useHotelData();

  const today = useMemo(() => new Date(), []);
  const currentYearNum = today.getFullYear();
  const currentMonthNumStr = String(today.getMonth() + 1).padStart(2, '0');
  const defaultMonthStr = `${currentYearNum}-${currentMonthNumStr}`;

  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonthStr);
  const [selectedYear, setSelectedYear] = useState<number>(currentYearNum);

  const [allSalaryPayments, setAllSalaryPayments] = useState<SalaryPayment[]>([]);
  const [allRentPayments, setAllRentPayments] = useState<RentPayment[]>([]);

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
    loadSalaryRentAnalytics();
  }, []);

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

  const handlePrevYear = () => {
    const newY = selectedYear - 1;
    const m = selectedMonth.split('-')[1];
    setSelectedYear(newY);
    setSelectedMonth(`${newY}-${m}`);
  };

  const handleNextYear = () => {
    const newY = selectedYear + 1;
    const m = selectedMonth.split('-')[1];
    setSelectedYear(newY);
    setSelectedMonth(`${newY}-${m}`);
  };

  const handleCurrentMonth = () => {
    setSelectedYear(currentYearNum);
    setSelectedMonth(defaultMonthStr);
  };

  // 1. Process Unique Bookings (prevent duplicating group booking totals)
  const uniqueBookingsMap = useMemo(() => {
    const map = new Map<string, BookingSummaryItem>();

    bookings.forEach((b) => {
      if (b.status === 'cancelled') return;
      const key = b.bookingGroupId || b.id;
      if (!map.has(key)) {
        map.set(key, {
          totalAmount: Number(b.totalAmount || 0),
          advancePaid: Number(b.advancePaid || 0),
          checkInDate: b.checkInDate,
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
  const metrics = useMemo(() => {
    let monthRev = 0;
    let monthAdv = 0;

    uniqueBookingsMap.forEach((b) => {
      if (b.checkInDate && b.checkInDate.startsWith(selectedMonth)) {
        monthRev += b.totalAmount;
        monthAdv += b.advancePaid;
      }
    });

    let monthInventoryExp = 0;
    let monthSalaryInExp = 0;
    let monthRentInExp = 0;

    expenses.forEach((e) => {
      const amt = Number(e.amount || 0);
      if (e.expenseDate && e.expenseDate.startsWith(selectedMonth)) {
        if (e.category === 'Salary') monthSalaryInExp += amt;
        else if (e.category === 'Rent') monthRentInExp += amt;
        else monthInventoryExp += amt;
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

    const totalMonthAllExp = monthInventoryExp + effectiveSalaryMonthExp + effectiveRentMonthExp;
    const outstandingBalance = Math.max(0, monthRev - monthAdv);
    const netIncome = monthRev - totalMonthAllExp;

    return {
      monthRevenue: monthRev,
      advanceReceived: monthAdv,
      outstandingBalance,
      monthInventoryExp,
      monthSalaryExp: effectiveSalaryMonthExp,
      monthRentExp: effectiveRentMonthExp,
      totalMonthAllExp,
      netIncome,
    };
  }, [uniqueBookingsMap, expenses, selectedMonth, allSalaryPayments, allRentPayments]);

  // 3. Entire Year View Chart Data (12 Months Jan - Dec for selectedYear)
  const yearly12MonthsData = useMemo(() => {
    const list = [];

    for (let m = 1; m <= 12; m++) {
      const mStr = String(m).padStart(2, '0');
      const mKey = `${selectedYear}-${mStr}`;
      const monthLabel = SHORT_MONTH_NAMES[m - 1];

      let rev = 0;
      uniqueBookingsMap.forEach((b) => {
        if (b.checkInDate && b.checkInDate.startsWith(mKey)) {
          rev += b.totalAmount;
        }
      });

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
  }, [selectedYear, uniqueBookingsMap, expenses, allSalaryPayments, allRentPayments]);

  // 4. Daily Revenue & Expenses Data for Full Selected Month
  const dailyDataForMonth = useMemo(() => {
    if (!selectedMonth || !selectedMonth.includes('-')) return [];

    const [yStr, mStr] = selectedMonth.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);

    const daysInMonth = new Date(year, month, 0).getDate();
    const daysList = [];

    const monthShort = SHORT_MONTH_NAMES[month - 1] || '';

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateKey = `${selectedMonth}-${dayStr}`;

      let rev = 0;
      uniqueBookingsMap.forEach((b) => {
        if (b.checkInDate === dateKey) {
          rev += b.totalAmount;
        }
      });

      let invExp = 0;
      expenses.forEach((e) => {
        if (e.expenseDate === dateKey) {
          const amt = Number(e.amount || 0);
          if (e.category !== 'Salary' && e.category !== 'Rent') {
            invExp += amt;
          }
        }
      });

      daysList.push({
        dayNum: day,
        dateKey,
        label: `${day} ${monthShort}`,
        shortLabel: String(day),
        revenue: rev,
        expenses: invExp,
      });
    }

    return daysList;
  }, [selectedMonth, uniqueBookingsMap, expenses]);

  if (isLoading) {
    return (
      <div className="p-6 text-center text-slate-500 font-medium text-xs">
        Loading financial analytics data...
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-5 space-y-3.5 max-w-7xl mx-auto">
      {/* SYNCHRONIZED MONTH & YEAR CONTROLLER (NO HEADER BANNER) */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 sm:p-3 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        {/* Month Selector */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer transition"
            title="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg">
            <CalendarIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedMonth(e.target.value);
                  setSelectedYear(parseInt(e.target.value.split('-')[0], 10));
                }
              }}
              className="font-black text-slate-900 text-xs sm:text-sm bg-transparent cursor-pointer focus:outline-none"
            />
          </div>

          <button
            onClick={handleNextMonth}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer transition"
            title="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {selectedMonth !== defaultMonthStr && (
            <button
              onClick={handleCurrentMonth}
              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-[11px] cursor-pointer transition flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Current</span>
            </button>
          )}
        </div>

        {/* Year Controls */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-extrabold text-slate-400">Year:</span>
          <button
            onClick={handlePrevYear}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer transition"
            title="Previous Year"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono font-black text-xs sm:text-sm text-slate-900 px-2 py-1 bg-slate-100 rounded-lg">
            {selectedYear}
          </span>
          <button
            onClick={handleNextYear}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer transition"
            title="Next Year"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* THREE MAJOR EXPENSE PILLARS KPI GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        {/* Monthly Rent */}
        <div className="p-3 sm:p-3.5 bg-lime-50/90 border border-lime-200/80 rounded-xl shadow-2xs flex flex-col justify-between h-[115px] sm:h-[125px]">
          <div className="flex items-center justify-between text-lime-900">
            <span className="text-[11px] font-black uppercase tracking-wide flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-lime-700 shrink-0" /> Rent
            </span>
            <span className="text-[9px] font-mono bg-lime-200/80 text-lime-950 px-1.5 py-0.5 rounded-md font-extrabold">
              Property
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-lime-950 font-mono">₹{metrics.monthRentExp.toLocaleString()}</p>
          <p className="text-[10px] font-semibold text-lime-800/90 truncate">Property lease for {formatMonthLabel(selectedMonth)}</p>
        </div>

        {/* Monthly Salary */}
        <div className="p-3 sm:p-3.5 bg-indigo-50/90 border border-indigo-200/80 rounded-xl shadow-2xs flex flex-col justify-between h-[115px] sm:h-[125px]">
          <div className="flex items-center justify-between text-indigo-900">
            <span className="text-[11px] font-black uppercase tracking-wide flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-700 shrink-0" /> Salary
            </span>
            <span className="text-[9px] font-mono bg-indigo-200/80 text-indigo-950 px-1.5 py-0.5 rounded-md font-extrabold">
              Staff
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-indigo-950 font-mono">₹{metrics.monthSalaryExp.toLocaleString()}</p>
          <p className="text-[10px] font-semibold text-indigo-800/90 truncate">Staff payouts for {formatMonthLabel(selectedMonth)}</p>
        </div>

        {/* Monthly Inventory */}
        <div className="p-3 sm:p-3.5 bg-amber-50/90 border border-amber-200/80 rounded-xl shadow-2xs flex flex-col justify-between h-[115px] sm:h-[125px]">
          <div className="flex items-center justify-between text-amber-900">
            <span className="text-[11px] font-black uppercase tracking-wide flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-amber-700 shrink-0" /> Inventory & Ops
            </span>
            <span className="text-[9px] font-mono bg-amber-200/80 text-amber-950 px-1.5 py-0.5 rounded-md font-extrabold">
              Items
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-amber-950 font-mono">₹{metrics.monthInventoryExp.toLocaleString()}</p>
          <p className="text-[10px] font-semibold text-amber-800/90 truncate">Inventory & bills for {formatMonthLabel(selectedMonth)}</p>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Total Revenue */}
        <div className="p-3 sm:p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-2xs flex flex-col justify-between h-[115px] sm:h-[125px]">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider">Total Revenue</span>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-black text-slate-900 font-mono">₹{metrics.monthRevenue.toLocaleString()}</p>
          <p className="text-[10px] font-semibold text-slate-500 truncate">{formatMonthLabel(selectedMonth)} room bookings</p>
        </div>

        {/* Advance Received */}
        <div className="p-3 sm:p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-2xs flex flex-col justify-between h-[115px] sm:h-[125px]">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider">Advance Received</span>
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <CreditCard className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-black text-blue-700 font-mono">₹{metrics.advanceReceived.toLocaleString()}</p>
          <p className="text-[10px] font-semibold text-slate-500 truncate">Upfront collections</p>
        </div>

        {/* Outstanding Dues */}
        <div className="p-3 sm:p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-2xs flex flex-col justify-between h-[115px] sm:h-[125px]">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider">Outstanding Dues</span>
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-black text-amber-600 font-mono">₹{metrics.outstandingBalance.toLocaleString()}</p>
          <p className="text-[10px] font-semibold text-slate-500 truncate">Pending guest balance</p>
        </div>

        {/* Month Net Profit */}
        <div className="p-3 sm:p-3.5 bg-slate-900 text-white rounded-xl shadow-2xs flex flex-col justify-between h-[115px] sm:h-[125px]">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider">Month Net Profit</span>
            <div className="p-1.5 bg-slate-800 text-emerald-400 rounded-lg">
              <Receipt className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className={`text-lg sm:text-xl font-black font-mono ${metrics.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ₹{metrics.netIncome.toLocaleString()}
          </p>
          <p className="text-[10px] font-semibold text-slate-400 truncate">Revenue - All Expenses</p>
        </div>
      </div>

      {/* FULL YEAR 12-MONTH CHART (Span Full Width) */}
      <div className="bg-white p-3.5 sm:p-4 border border-slate-200/80 rounded-xl shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            Monthly Revenue vs Operating Expenses ({selectedYear})
          </h3>
          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
            <button
              onClick={handlePrevYear}
              className="p-1 hover:bg-slate-100 rounded cursor-pointer"
              title="Previous Year"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-slate-900">{selectedYear}</span>
            <button
              onClick={handleNextYear}
              className="p-1 hover:bg-slate-100 rounded cursor-pointer"
              title="Next Year"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="h-64 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={yearly12MonthsData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <Tooltip
                formatter={(value: any) => [`₹${Number(value).toLocaleString()}`, '']}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="revenue" name="Room Revenue" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="inventory" name="Inventory" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              <Bar dataKey="salary" name="Salary" fill="#6366F1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="rent" name="Rent" fill="#84CC16" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DAILY CHARTS SECTION FOR FULL SELECTED MONTH */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* Chart 1: Daily Revenue */}
        <div className="bg-white p-3.5 sm:p-4 border border-slate-200/80 rounded-xl shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              Daily Room Revenue ({formatMonthLabel(selectedMonth)})
            </h3>
            <span className="text-[10px] font-mono text-slate-400">{dailyDataForMonth.length} Days</span>
          </div>
          <div className="h-56 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyDataForMonth} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="shortLabel" tick={{ fontSize: 9 }} stroke="#94a3b8" interval={0} />
                <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" />
                <Tooltip
                  formatter={(val: any) => [`₹${Number(val).toLocaleString()}`, 'Revenue']}
                  labelFormatter={(label, items) => {
                    if (items && items[0] && items[0].payload) {
                      return items[0].payload.label;
                    }
                    return label;
                  }}
                  contentStyle={{ borderRadius: '10px', fontSize: '11px' }}
                />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#10B981" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Daily Inventory Expenses */}
        <div className="bg-white p-3.5 sm:p-4 border border-slate-200/80 rounded-xl shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
              <ArrowDownRight className="w-4 h-4 text-rose-600" />
              Daily Inventory Expenses ({formatMonthLabel(selectedMonth)})
            </h3>
            <span className="text-[10px] font-mono text-slate-400">{dailyDataForMonth.length} Days</span>
          </div>
          <div className="h-56 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyDataForMonth} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="shortLabel" tick={{ fontSize: 9 }} stroke="#94a3b8" interval={0} />
                <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" />
                <Tooltip
                  formatter={(val: any) => [`₹${Number(val).toLocaleString()}`, 'Inventory Expenses']}
                  labelFormatter={(label, items) => {
                    if (items && items[0] && items[0].payload) {
                      return items[0].payload.label;
                    }
                    return label;
                  }}
                  contentStyle={{ borderRadius: '10px', fontSize: '11px' }}
                />
                <Line type="monotone" dataKey="expenses" name="Inventory Expenses" stroke="#f43f5e" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

