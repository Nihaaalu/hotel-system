import React, { useMemo } from 'react';
import { useHotelData } from '../context/HotelContext';
import { ExpenseCategory } from '../types';
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

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Meat: '#EF4444',
  Groceries: '#10B981',
  Cleaning: '#3B82F6',
  Salary: '#8B5CF6',
  'Electricity Bill': '#F59E0B',
  Laundry: '#06B6D4',
  Miscellaneous: '#6B7280',
};

export default function Analytics() {
  const { bookings, expenses, payments, isLoading } = useHotelData();

  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonthStr = todayStr.substring(0, 7);

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

    let totalExp = 0;
    let todayExp = 0;
    let monthExp = 0;

    expenses.forEach((e) => {
      const amt = Number(e.amount || 0);
      totalExp += amt;
      if (e.expenseDate === todayStr) {
        todayExp += amt;
      }
      if (e.expenseDate && e.expenseDate.startsWith(currentMonthStr)) {
        monthExp += amt;
      }
    });

    const outstandingBalance = Math.max(0, totalRev - totalAdv);
    const netIncome = totalRev - totalExp;

    return {
      totalRevenue: totalRev,
      advanceReceived: totalAdv,
      outstandingBalance,
      totalExpenses: totalExp,
      netIncome,
      todayRevenue: todayRev,
      todayExpenses: todayExp,
      currentMonthRevenue: monthRev,
      currentMonthExpenses: monthExp,
    };
  }, [uniqueBookingsMap, expenses, todayStr, currentMonthStr]);

  // 3. Revenue vs Expenses Monthly Chart Data
  const monthlyChartData = useMemo(() => {
    const monthsMap = new Map<string, { month: string; revenue: number; expenses: number }>();

    // Seed last 6 months
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mKey = d.toISOString().substring(0, 7);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      monthsMap.set(mKey, { month: label, revenue: 0, expenses: 0 });
    }

    uniqueBookingsMap.forEach((b) => {
      if (b.checkInDate) {
        const mKey = b.checkInDate.substring(0, 7);
        if (monthsMap.has(mKey)) {
          monthsMap.get(mKey)!.revenue += b.totalAmount;
        } else {
          const d = new Date(b.checkInDate);
          const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          monthsMap.set(mKey, { month: label, revenue: b.totalAmount, expenses: 0 });
        }
      }
    });

    expenses.forEach((e) => {
      if (e.expenseDate) {
        const mKey = e.expenseDate.substring(0, 7);
        if (monthsMap.has(mKey)) {
          monthsMap.get(mKey)!.expenses += Number(e.amount || 0);
        } else {
          const d = new Date(e.expenseDate);
          const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          monthsMap.set(mKey, { month: label, revenue: 0, expenses: Number(e.amount || 0) });
        }
      }
    });

    return Array.from(monthsMap.values());
  }, [uniqueBookingsMap, expenses]);

  // 4. Expense Category Pie Chart Data
  const categoryPieData = useMemo(() => {
    const catMap: Record<string, number> = {
      Meat: 0,
      Groceries: 0,
      Cleaning: 0,
      Salary: 0,
      'Electricity Bill': 0,
      Laundry: 0,
      Miscellaneous: 0,
    };

    expenses.forEach((e) => {
      const amt = Number(e.amount || 0);
      if (catMap[e.category] !== undefined) {
        catMap[e.category] += amt;
      } else {
        catMap.Miscellaneous += amt;
      }
    });

    return Object.entries(catMap)
      .map(([name, value]) => ({ name: name as ExpenseCategory, value }))
      .filter((item) => item.value > 0);
  }, [expenses]);

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

  // 6. Recent Payments / Bookings Table
  const recentBookingsList = useMemo(() => {
    const list: BookingSummaryItem[] = Array.from(uniqueBookingsMap.values());
    return list
      .sort((a, b) => b.checkInDate.localeCompare(a.checkInDate))
      .slice(0, 5);
  }, [uniqueBookingsMap]);

  // 7. Recent Expenses Table
  const recentExpensesList = useMemo(() => {
    return [...expenses]
      .sort((a, b) => (b.expenseDate || '').localeCompare(a.expenseDate || ''))
      .slice(0, 5);
  }, [expenses]);

  if (isLoading) {
    return (
      <div className="p-6 text-center text-gray-500 font-medium">
        Loading financial analytics data...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-indigo-600" />
            Financial Analytics
          </h1>
          <p className="text-xs font-semibold text-gray-500 mt-1">
            Real-time financial performance, revenue tracking, and expense breakdowns
          </p>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold rounded-full">
            <Calendar className="w-3.5 h-3.5" />
            Live DB Synchronized
          </span>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Revenue</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900">₹{metrics.totalRevenue.toLocaleString()}</p>
          <p className="text-2xs font-semibold text-gray-500 flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3 text-emerald-500" />
            Cumulative database bookings
          </p>
        </div>

        {/* Advance Received */}
        <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-bold uppercase tracking-wider">Advance Received</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-blue-700">₹{metrics.advanceReceived.toLocaleString()}</p>
          <p className="text-2xs font-semibold text-gray-500">
            Total upfront collections
          </p>
        </div>

        {/* Outstanding Balance */}
        <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-bold uppercase tracking-wider">Outstanding Balance</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600">₹{metrics.outstandingBalance.toLocaleString()}</p>
          <p className="text-2xs font-semibold text-gray-500">
            Total pending guest dues
          </p>
        </div>

        {/* Total Expenses */}
        <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Expenses</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600">₹{metrics.totalExpenses.toLocaleString()}</p>
          <p className="text-2xs font-semibold text-gray-500">
            Cumulative inventory & ops cost
          </p>
        </div>
      </div>

      {/* Secondary KPI Row: Net Income, Today's & Monthly Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Net Income */}
        <div className="p-4 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl shadow-sm space-y-1 sm:col-span-2 lg:col-span-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block">Net Income</span>
          <p className={`text-xl font-black ${metrics.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ₹{metrics.netIncome.toLocaleString()}
          </p>
          <span className="text-[10px] text-slate-400 block font-medium">Revenue - Expenses</span>
        </div>

        {/* Today's Revenue */}
        <div className="p-4 bg-white border border-gray-100 rounded-2xl space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Today's Revenue</span>
          <p className="text-lg font-black text-gray-900">₹{metrics.todayRevenue.toLocaleString()}</p>
          <span className="text-[10px] text-emerald-600 font-semibold block">{todayStr}</span>
        </div>

        {/* Today's Expenses */}
        <div className="p-4 bg-white border border-gray-100 rounded-2xl space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Today's Expenses</span>
          <p className="text-lg font-black text-rose-600">₹{metrics.todayExpenses.toLocaleString()}</p>
          <span className="text-[10px] text-gray-400 font-semibold block">{todayStr}</span>
        </div>

        {/* Current Month Revenue */}
        <div className="p-4 bg-white border border-gray-100 rounded-2xl space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">This Month Revenue</span>
          <p className="text-lg font-black text-indigo-600">₹{metrics.currentMonthRevenue.toLocaleString()}</p>
          <span className="text-[10px] text-indigo-500 font-semibold block">{currentMonthStr}</span>
        </div>

        {/* Current Month Expenses */}
        <div className="p-4 bg-white border border-gray-100 rounded-2xl space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">This Month Expenses</span>
          <p className="text-lg font-black text-amber-600">₹{metrics.currentMonthExpenses.toLocaleString()}</p>
          <span className="text-[10px] text-gray-400 font-semibold block">{currentMonthStr}</span>
        </div>
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Revenue vs Expenses (2 Cols) */}
        <div className="lg:col-span-2 bg-white p-5 border border-gray-100 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-50 pb-3">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              Monthly Revenue vs Expenses
            </h3>
            <span className="text-2xs font-semibold text-gray-400 uppercase">Monthly Comparison</span>
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
                <Bar dataKey="revenue" name="Revenue" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Expense Breakdown (Pie Chart) */}
        <div className="bg-white p-5 border border-gray-100 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-50 pb-3">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-emerald-600" />
              Expense Breakdown
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

      {/* Trends Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 3: Daily Revenue Trend */}
        <div className="bg-white p-5 border border-gray-100 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-50 pb-3">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-indigo-600" />
              Daily Revenue Trend (14 Days)
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
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Daily Expense Trend */}
        <div className="bg-white p-5 border border-gray-100 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-50 pb-3">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <ArrowDownRight className="w-4 h-4 text-rose-600" />
              Daily Expense Trend (14 Days)
            </h3>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrendsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip
                  formatter={(val: any) => [`₹${Number(val).toLocaleString()}`, 'Expenses']}
                  contentStyle={{ borderRadius: '12px', fontSize: '11px' }}
                />
                <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Bookings Table */}
        <div className="bg-white p-5 border border-gray-100 rounded-2xl shadow-xs space-y-3">
          <h3 className="font-bold text-gray-900 text-sm border-b border-gray-50 pb-2">
            Recent Bookings Ledger
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 uppercase text-[10px] font-bold">
                  <th className="py-2 px-2">Date</th>
                  <th className="py-2 px-2">Guest</th>
                  <th className="py-2 px-2">Room</th>
                  <th className="py-2 px-2 text-right">Total</th>
                  <th className="py-2 px-2 text-right">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentBookingsList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-gray-400 italic">No bookings recorded</td>
                  </tr>
                ) : (
                  recentBookingsList.map((b, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      <td className="py-2.5 px-2 font-mono font-medium text-gray-600">{b.checkInDate}</td>
                      <td className="py-2.5 px-2 font-semibold text-gray-800">{b.guestName}</td>
                      <td className="py-2.5 px-2 text-gray-600">Rm {b.roomNumber}</td>
                      <td className="py-2.5 px-2 text-right font-bold text-gray-900">₹{b.totalAmount.toLocaleString()}</td>
                      <td className="py-2.5 px-2 text-right font-bold text-emerald-600">₹{b.advancePaid.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Expenses Table */}
        <div className="bg-white p-5 border border-gray-100 rounded-2xl shadow-xs space-y-3">
          <h3 className="font-bold text-gray-900 text-sm border-b border-gray-50 pb-2">
            Recent Inventory Expenses
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 uppercase text-[10px] font-bold">
                  <th className="py-2 px-2">Date</th>
                  <th className="py-2 px-2">Category</th>
                  <th className="py-2 px-2">Remarks</th>
                  <th className="py-2 px-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentExpensesList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-gray-400 italic">No expenses recorded</td>
                  </tr>
                ) : (
                  recentExpensesList.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50/50">
                      <td className="py-2.5 px-2 font-mono font-medium text-gray-600">{e.expenseDate}</td>
                      <td className="py-2.5 px-2">
                        <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 text-gray-700">
                          {e.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-gray-600 truncate max-w-[120px]">{e.remarks || '-'}</td>
                      <td className="py-2.5 px-2 text-right font-bold text-rose-600">₹{e.amount.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
