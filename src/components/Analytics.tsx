import React, { useState, useEffect, useMemo } from 'react';
import { useHotelData } from '../context/HotelContext';
import { ExpenseCategory } from '../types';
import { SalaryRentService } from '../services/salaryRent';
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  PieChart as PieChartIcon,
  Receipt,
  Wallet,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  Users,
  Package,
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
  PieChart,
  Pie,
  Cell,
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

const CATEGORY_COLORS: Record<string, string> = {
  Meat: '#EF4444',
  Groceries: '#10B981',
  Cleaning: '#3B82F6',
  'Electricity Bill': '#F59E0B',
  Laundry: '#06B6D4',
  'Raw Materials': '#8B5CF6',
  'Electrical Items': '#EC4899',
  Furniture: '#14B8A6',
  Improvement: '#F97316',
  Miscellaneous: '#6B7280',
  Salary: '#6366F1',
  Rent: '#84CC16',
};

export default function Analytics() {
  const { bookings, expenses, isLoading } = useHotelData();
  const [salaryTotalThisMonth, setSalaryTotalThisMonth] = useState(0);
  const [rentTotalThisMonth, setRentTotalThisMonth] = useState(0);

  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonthStr = todayStr.substring(0, 7);

  // Load Salary & Rent totals for analytics
  useEffect(() => {
    async function loadSalaryRentAnalytics() {
      try {
        const { salaryPayments, rentPayments } = await SalaryRentService.fetchAllData();
        
        // Rent payments paid in current month
        const rentPaidSum = rentPayments
          .filter((p) => p.month === currentMonthStr)
          .reduce((sum, p) => sum + p.amount, 0);
        setRentTotalThisMonth(rentPaidSum);

        // Salary payments paid in current month
        const salaryPaidSum = salaryPayments
          .filter((p) => p.month === currentMonthStr)
          .reduce((sum, p) => sum + p.amount, 0);
        setSalaryTotalThisMonth(salaryPaidSum);
      } catch (err) {
        console.error('Error fetching salary/rent analytics', err);
      }
    }
    loadSalaryRentAnalytics();
  }, [currentMonthStr]);

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

  // 2. Calculate Core Metrics
  const metrics = useMemo(() => {
    let totalRev = 0;
    let totalAdv = 0;
    let todayRev = 0;
    let monthRev = 0;

    uniqueBookingsMap.forEach((b) => {
      totalRev += b.totalAmount;
      totalAdv += b.advancePaid;

      if (b.checkInDate === todayStr) {
        todayRev += b.totalAmount;
      }
      if (b.checkInDate && b.checkInDate.startsWith(currentMonthStr)) {
        monthRev += b.totalAmount;
      }
    });

    let totalInventoryExp = 0;
    let todayExp = 0;
    let monthInventoryExp = 0;

    expenses.forEach((e) => {
      const amt = Number(e.amount || 0);
      totalInventoryExp += amt;
      if (e.expenseDate === todayStr) {
        todayExp += amt;
      }
      if (e.expenseDate && e.expenseDate.startsWith(currentMonthStr)) {
        monthInventoryExp += amt;
      }
    });

    const totalMonthAllExp = monthInventoryExp + salaryTotalThisMonth + rentTotalThisMonth;
    const outstandingBalance = Math.max(0, totalRev - totalAdv);
    const netIncome = monthRev - totalMonthAllExp;

    return {
      totalRevenue: totalRev,
      advanceReceived: totalAdv,
      outstandingBalance,
      totalInventoryExpenses: totalInventoryExp,
      monthInventoryExp,
      monthSalaryExp: salaryTotalThisMonth,
      monthRentExp: rentTotalThisMonth,
      totalMonthAllExp,
      netIncome,
      todayRevenue: todayRev,
      todayExpenses: todayExp,
      currentMonthRevenue: monthRev,
    };
  }, [uniqueBookingsMap, expenses, todayStr, currentMonthStr, salaryTotalThisMonth, rentTotalThisMonth]);

  // 3. Monthly Revenue vs All Expenses Chart
  const monthlyChartData = useMemo(() => {
    const monthsMap = new Map<string, { month: string; revenue: number; inventory: number; salary: number; rent: number }>();

    // Seed last 6 months
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mKey = d.toISOString().substring(0, 7);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      monthsMap.set(mKey, { month: label, revenue: 0, inventory: 0, salary: 0, rent: 0 });
    }

    uniqueBookingsMap.forEach((b) => {
      if (b.checkInDate) {
        const mKey = b.checkInDate.substring(0, 7);
        if (monthsMap.has(mKey)) {
          monthsMap.get(mKey)!.revenue += b.totalAmount;
        }
      }
    });

    expenses.forEach((e) => {
      if (e.expenseDate) {
        const mKey = e.expenseDate.substring(0, 7);
        if (monthsMap.has(mKey)) {
          monthsMap.get(mKey)!.inventory += Number(e.amount || 0);
        }
      }
    });

    // Inject salary & rent into current month
    if (monthsMap.has(currentMonthStr)) {
      monthsMap.get(currentMonthStr)!.salary = salaryTotalThisMonth;
      monthsMap.get(currentMonthStr)!.rent = rentTotalThisMonth;
    }

    return Array.from(monthsMap.values());
  }, [uniqueBookingsMap, expenses, currentMonthStr, salaryTotalThisMonth, rentTotalThisMonth]);

  // 4. Expense Breakdown Pie Chart (Includes Inventory Categories + Salary + Rent)
  const categoryPieData = useMemo(() => {
    const catMap: Record<string, number> = {};

    expenses.forEach((e) => {
      const amt = Number(e.amount || 0);
      const catKey = e.category || 'Miscellaneous';
      catMap[catKey] = (catMap[catKey] || 0) + amt;
    });

    if (salaryTotalThisMonth > 0) {
      catMap['Salary'] = salaryTotalThisMonth;
    }
    if (rentTotalThisMonth > 0) {
      catMap['Rent'] = rentTotalThisMonth;
    }

    return Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .filter((item) => item.value > 0);
  }, [expenses, salaryTotalThisMonth, rentTotalThisMonth]);

  // 5. Daily Trends Chart Data (Last 14 days)
  const dailyTrendsData = useMemo(() => {
    const daysMap = new Map<string, { date: string; revenue: number; expenses: number }>();

    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      daysMap.set(dateStr, { date: label, revenue: 0, expenses: 0 });
    }

    uniqueBookingsMap.forEach((b) => {
      if (b.checkInDate && daysMap.has(b.checkInDate)) {
        daysMap.get(b.checkInDate)!.revenue += b.totalAmount;
      }
    });

    expenses.forEach((e) => {
      if (e.expenseDate && daysMap.has(e.expenseDate)) {
        daysMap.get(e.expenseDate)!.expenses += Number(e.amount || 0);
      }
    });

    return Array.from(daysMap.values());
  }, [uniqueBookingsMap, expenses]);

  if (isLoading) {
    return (
      <div className="p-6 text-center text-gray-500 font-medium">
        Loading financial analytics data...
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-indigo-600" />
            Financial Analytics & Expense Breakdown
          </h1>
          <p className="text-xs font-semibold text-gray-500 mt-1">
            Real-time financial dashboard tracking Room Revenue, Rent, Salary, and Inventory Expenses
          </p>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold rounded-full">
            <Calendar className="w-3.5 h-3.5" />
            Live DB Synchronized
          </span>
        </div>
      </div>

      {/* THREE MAJOR EXPENSE PILLARS KPI GRID: Rent, Salary, Inventory */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 1. Monthly Rent */}
        <div className="p-4 bg-lime-50/80 border border-lime-200 rounded-2xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-lime-900">
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-lime-700" /> Monthly Rent
            </span>
            <span className="text-[10px] font-mono bg-lime-200 text-lime-900 px-2 py-0.5 rounded-full font-extrabold">
              Property
            </span>
          </div>
          <p className="text-2xl font-black text-lime-950 font-mono">₹{metrics.monthRentExp.toLocaleString()}</p>
          <p className="text-2xs font-semibold text-lime-800">Paid property lease for {currentMonthStr}</p>
        </div>

        {/* 2. Monthly Salary */}
        <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-2xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-indigo-900">
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-700" /> Employee Salary
            </span>
            <span className="text-[10px] font-mono bg-indigo-200 text-indigo-900 px-2 py-0.5 rounded-full font-extrabold">
              Staff
            </span>
          </div>
          <p className="text-2xl font-black text-indigo-950 font-mono">₹{metrics.monthSalaryExp.toLocaleString()}</p>
          <p className="text-2xs font-semibold text-indigo-800">Staff payouts logged for {currentMonthStr}</p>
        </div>

        {/* 3. Monthly Inventory */}
        <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-amber-900">
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <Package className="w-4 h-4 text-amber-700" /> Inventory & Ops
            </span>
            <span className="text-[10px] font-mono bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-extrabold">
              Items
            </span>
          </div>
          <p className="text-2xl font-black text-amber-950 font-mono">₹{metrics.monthInventoryExp.toLocaleString()}</p>
          <p className="text-2xs font-semibold text-amber-800">Groceries, bills & materials for {currentMonthStr}</p>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Revenue</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">₹{metrics.totalRevenue.toLocaleString()}</p>
          <p className="text-2xs font-semibold text-gray-500 flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3 text-emerald-500" />
            Cumulative room bookings
          </p>
        </div>

        {/* Advance Received */}
        <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-bold uppercase tracking-wider">Advance Received</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-blue-700">₹{metrics.advanceReceived.toLocaleString()}</p>
          <p className="text-2xs font-semibold text-gray-500">Total upfront collections</p>
        </div>

        {/* Outstanding Balance */}
        <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-bold uppercase tracking-wider">Outstanding Dues</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600">₹{metrics.outstandingBalance.toLocaleString()}</p>
          <p className="text-2xs font-semibold text-gray-500">Pending guest balance</p>
        </div>

        {/* This Month Net Profit */}
        <div className="p-5 bg-slate-900 text-white rounded-2xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Month Net Profit</span>
            <div className="p-2 bg-slate-800 text-emerald-400 rounded-xl">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <p className={`text-2xl font-black ${metrics.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ₹{metrics.netIncome.toLocaleString()}
          </p>
          <p className="text-2xs font-semibold text-slate-400">Revenue - (Rent + Salary + Inventory)</p>
        </div>
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Revenue vs All Expense Streams (2 Cols) */}
        <div className="lg:col-span-2 bg-white p-5 border border-gray-100 rounded-2xl shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-50 pb-3">
            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              Monthly Revenue vs Operating Expenses
            </h3>
            <span className="text-2xs font-semibold text-gray-400 uppercase">Monthly Breakdown</span>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip
                  formatter={(value: any) => [`₹${Number(value).toLocaleString()}`, '']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="revenue" name="Room Revenue" fill="#10B981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="inventory" name="Inventory" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                <Bar dataKey="salary" name="Salary" fill="#6366F1" radius={[6, 6, 0, 0]} />
                <Bar dataKey="rent" name="Rent" fill="#84CC16" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: All Expenses Breakdown (Pie Chart) */}
        <div className="bg-white p-5 border border-gray-100 rounded-2xl shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-50 pb-3">
            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-emerald-600" />
              Expense Distribution
            </h3>
            <span className="text-2xs font-semibold text-gray-400 uppercase">By Category</span>
          </div>
          <div className="h-72 w-full flex items-center justify-center">
            {categoryPieData.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No expenses logged yet</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={45}
                    paddingAngle={3}
                  >
                    {categoryPieData.map((entry) => (
                      <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || '#6B7280'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [`₹${Number(val).toLocaleString()}`, 'Amount']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Daily Trends Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 3: Daily Revenue Trend */}
        <div className="bg-white p-5 border border-gray-100 rounded-2xl shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-50 pb-3">
            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-indigo-600" />
              Daily Room Revenue Trend (14 Days)
            </h3>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrendsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip
                  formatter={(val: any) => [`₹${Number(val).toLocaleString()}`, 'Revenue']}
                  contentStyle={{ borderRadius: '12px', fontSize: '11px' }}
                />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Daily Inventory Expense Trend */}
        <div className="bg-white p-5 border border-gray-100 rounded-2xl shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-50 pb-3">
            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-2">
              <ArrowDownRight className="w-4 h-4 text-rose-600" />
              Daily Inventory Expenses Trend (14 Days)
            </h3>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrendsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip
                  formatter={(val: any) => [`₹${Number(val).toLocaleString()}`, 'Inventory Expenses']}
                  contentStyle={{ borderRadius: '12px', fontSize: '11px' }}
                />
                <Line type="monotone" dataKey="expenses" name="Inventory Expenses" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
