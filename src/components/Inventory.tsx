import React, { useState, useMemo } from 'react';
import { Expense, ExpenseCategory } from '../types';
import { useHotelData } from '../context/HotelContext';
import {
  Package,
  Plus,
  Search,
  Trash2,
  Edit2,
  X,
  CheckCircle2,
} from 'lucide-react';

const CATEGORIES: ExpenseCategory[] = [
  'Meat',
  'Groceries',
  'Cleaning',
  'Miscellaneous',
  'Salary',
  'Electricity Bill',
  'Laundry',
];

export default function Inventory() {
  const { expenses, addExpense, updateExpense, deleteExpense } = useHotelData();

  // Search, Filter & Sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Simplified Form Fields: ONLY Expense Date, Category, Amount, Notes
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<ExpenseCategory>('Groceries');
  const [amount, setAmount] = useState<number | ''>('');
  const [remarks, setRemarks] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Success Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonthStr = todayStr.substring(0, 7);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Computed Summaries
  const { todayTotal, monthTotal, categoryTotals } = useMemo(() => {
    let todaySum = 0;
    let monthSum = 0;
    const catSums: Record<ExpenseCategory, number> = {
      Meat: 0,
      Groceries: 0,
      Cleaning: 0,
      Miscellaneous: 0,
      Salary: 0,
      'Electricity Bill': 0,
      Laundry: 0,
    };

    expenses.forEach((exp) => {
      const expAmt = Number(exp.amount || 0);
      if (exp.expenseDate === todayStr) {
        todaySum += expAmt;
      }
      if (exp.expenseDate && exp.expenseDate.startsWith(currentMonthStr)) {
        monthSum += expAmt;
      }
      if (catSums[exp.category] !== undefined) {
        catSums[exp.category] += expAmt;
      } else {
        catSums.Miscellaneous += expAmt;
      }
    });

    return {
      todayTotal: todaySum,
      monthTotal: monthSum,
      categoryTotals: catSums,
    };
  }, [expenses, todayStr, currentMonthStr]);

  // Filtered & Sorted Expenses List
  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((exp) => {
        // Search filter (only category and remarks)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchRemarks = (exp.remarks || '').toLowerCase().includes(q);
          const matchCategory = exp.category.toLowerCase().includes(q);
          if (!matchRemarks && !matchCategory) return false;
        }
        // Category filter
        if (selectedCategory !== 'ALL' && exp.category !== selectedCategory) {
          return false;
        }
        // Date range filter
        if (startDate && exp.expenseDate < startDate) return false;
        if (endDate && exp.expenseDate > endDate) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortOrder === 'desc') {
          return b.expenseDate.localeCompare(a.expenseDate);
        } else {
          return a.expenseDate.localeCompare(b.expenseDate);
        }
      });
  }, [expenses, searchQuery, selectedCategory, startDate, endDate, sortOrder]);

  const handleOpenAddModal = () => {
    setEditingExpense(null);
    setExpenseDate(todayStr);
    setCategory('Groceries');
    setAmount('');
    setRemarks('');
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (exp: Expense) => {
    setEditingExpense(exp);
    setExpenseDate(exp.expenseDate || todayStr);
    setCategory(exp.category || 'Groceries');
    setAmount(exp.amount || '');
    setRemarks(exp.remarks || '');
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount === '' || Number(amount) <= 0 || isNaN(Number(amount))) {
      setErrorMsg('Please enter a valid amount (₹)');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, {
          expenseDate,
          category,
          amount: Number(amount),
          remarks: remarks.trim(),
        });
        showToast('✓ Expense updated successfully!');
      } else {
        await addExpense({
          expenseDate,
          category,
          amount: Number(amount),
          remarks: remarks.trim(),
        });
        showToast('✓ Expense saved successfully!');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save expense record');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this expense record?')) {
      try {
        await deleteExpense(id);
        showToast('✓ Expense deleted successfully!');
      } catch (err: any) {
        alert('Failed to delete expense record');
      }
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 relative" id="pms_inventory_panel">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-800 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner & Quick Add */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 border border-gray-200 rounded-2xl shadow-2xs">
        <div>
          <h2 className="text-base sm:text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            Expenses Tracker
          </h2>
          <p className="text-xs text-gray-500">Log bill payments, groceries, and hotel operational costs</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md transition active:scale-95 cursor-pointer min-h-[44px]"
          id="btn_add_expense"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Add Expense</span>
        </button>
      </div>

      {/* KPI STATS CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-6 gap-2 sm:gap-3">
        {/* Today's Expenses */}
        <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl flex flex-col justify-between shadow-2xs min-h-[70px]">
          <span className="text-[10px] text-amber-800 font-bold uppercase tracking-wider">Today's Expense</span>
          <span className="text-base sm:text-lg font-black text-amber-900 font-mono">₹{todayTotal.toLocaleString()}</span>
        </div>

        {/* Monthly Expenses */}
        <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-xl flex flex-col justify-between shadow-2xs min-h-[70px]">
          <span className="text-[10px] text-purple-800 font-bold uppercase tracking-wider">Monthly Expense</span>
          <span className="text-base sm:text-lg font-black text-purple-900 font-mono">₹{monthTotal.toLocaleString()}</span>
        </div>

        {/* Category Totals */}
        {CATEGORIES.map((cat) => (
          <div key={cat} className="p-3 bg-white border border-gray-200 rounded-xl flex flex-col justify-between shadow-2xs min-h-[70px]">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{cat}</span>
            <span className="text-sm sm:text-base font-bold text-gray-800 font-mono">₹{(categoryTotals[cat] || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* SEARCH, FILTER & SORT CONTROLS */}
      <div className="p-3 sm:p-4 bg-white border border-gray-200 rounded-2xl space-y-3 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes or categories..."
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[42px]"
            />
          </div>

          {/* Category Filter */}
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[42px] cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Date Filter Range */}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              title="From Date"
              className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[42px]"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              title="To Date"
              className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[42px]"
            />
          </div>

          {/* Sort Order */}
          <div className="flex gap-2">
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="w-full px-3 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer min-h-[42px]"
            >
              <span>Sort Date: {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* RECENT EXPENSES TABLE / LIST */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="p-3 sm:p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-extrabold text-gray-900 uppercase tracking-wider">
            Expense Records ({filteredExpenses.length})
          </h3>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs font-semibold">No expense records found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-gray-50 text-gray-400 font-mono text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Amount (₹)</th>
                  <th className="py-3 px-4">Notes</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-gray-600 whitespace-nowrap">{exp.expenseDate}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        exp.category === 'Meat' ? 'bg-red-50 text-red-700 border border-red-200' :
                        exp.category === 'Groceries' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        exp.category === 'Cleaning' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        exp.category === 'Salary' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                        exp.category === 'Electricity Bill' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        exp.category === 'Laundry' ? 'bg-cyan-50 text-cyan-700 border border-cyan-200' :
                        'bg-gray-100 text-gray-700 border border-gray-200'
                      }`}>
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-black font-mono text-gray-900">₹{exp.amount.toLocaleString()}</td>
                    <td className="py-3 px-4 text-gray-700 font-medium">{exp.remarks || '-'}</td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(exp)}
                          className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                          title="Edit Expense"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(exp.id)}
                          className="p-1.5 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* COMPACT & MOBILE TOUCH-FRIENDLY ADD / EDIT EXPENSE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm sm:max-w-md my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600" />
                {editingExpense ? 'Edit Expense Record' : 'Add Expense'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
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

              {/* 1. Expense Date */}
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

              {/* 2. Category Dropdown */}
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
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* 3. Amount (₹) */}
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

              {/* 4. Notes (Multi-line Textarea) */}
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Notes <span className="text-gray-400 font-normal lowercase">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder='e.g. "Weekly vegetables", "Cleaning chemicals", "Chicken from local market", "Electrician"'
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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
