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
  PieChart as PieChartIcon,
  Tag,
} from 'lucide-react';

const CATEGORIES: ExpenseCategory[] = [
  'Meat',
  'Groceries',
  'Cleaning',
  'Electricity Bill',
  'Laundry',
  'Raw Materials',
  'Electrical Items',
  'Furniture',
  'Improvement',
  'Miscellaneous',
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

  // Form Fields: Expense Date, Category, Name (optional), Amount, Notes
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<ExpenseCategory>('Groceries');
  const [itemNameInput, setItemNameInput] = useState('');
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
  const { todayTotal, monthTotal, categoryTotals, topCategories } = useMemo(() => {
    let todaySum = 0;
    let monthSum = 0;
    const catSums: Record<string, number> = {};
    CATEGORIES.forEach((c) => (catSums[c] = 0));

    expenses.forEach((exp) => {
      const expAmt = Number(exp.amount || 0);
      if (exp.expenseDate === todayStr) {
        todaySum += expAmt;
      }
      if (exp.expenseDate && exp.expenseDate.startsWith(currentMonthStr)) {
        monthSum += expAmt;
      }
      const catKey = exp.category || 'Miscellaneous';
      if (catSums[catKey] !== undefined) {
        catSums[catKey] += expAmt;
      } else {
        catSums.Miscellaneous = (catSums.Miscellaneous || 0) + expAmt;
      }
    });

    // Top categories sorted by expense amount
    const sortedCats = Object.entries(catSums)
      .map(([catName, total]) => ({ catName, total }))
      .sort((a, b) => b.total - a.total);

    return {
      todayTotal: todaySum,
      monthTotal: monthSum,
      categoryTotals: catSums,
      topCategories: sortedCats.slice(0, 4),
    };
  }, [expenses, todayStr, currentMonthStr]);

  // Filtered & Sorted Expenses List
  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((exp) => {
        const displayName = exp.itemName || exp.category;
        // Search filter (name, category, remarks)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchRemarks = (exp.remarks || '').toLowerCase().includes(q);
          const matchCategory = exp.category.toLowerCase().includes(q);
          const matchName = displayName.toLowerCase().includes(q);
          if (!matchRemarks && !matchCategory && !matchName) return false;
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
    setItemNameInput('');
    setAmount('');
    setRemarks('');
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (exp: Expense) => {
    setEditingExpense(exp);
    setExpenseDate(exp.expenseDate || todayStr);
    setCategory(exp.category || 'Groceries');
    setItemNameInput(exp.itemName || '');
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

    // If itemName is empty, automatically save itemName = category
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
        showToast('✓ Inventory expense updated!');
      } else {
        await addExpense({
          expenseDate,
          category,
          itemName: finalItemName,
          amount: Number(amount),
          remarks: remarks.trim(),
        });
        showToast('✓ Inventory expense saved!');
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
            Inventory & Operations Expenses
          </h2>
          <p className="text-xs text-gray-500">Track raw materials, groceries, cleaning, and maintenance items</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md transition active:scale-95 cursor-pointer min-h-[44px]"
          id="btn_add_expense"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Add Expense Item</span>
        </button>
      </div>

      {/* DASHBOARD CARDS: Today, Month, Top Categories */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Today's Expense */}
        <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-2xl flex flex-col justify-between shadow-2xs">
          <span className="text-[10px] text-amber-800 font-extrabold uppercase tracking-wider block">
            Today's Inventory Expense
          </span>
          <span className="text-xl sm:text-2xl font-black text-amber-950 font-mono mt-1">
            ₹{todayTotal.toLocaleString()}
          </span>
        </div>

        {/* This Month's Expense */}
        <div className="p-4 bg-purple-50/60 border border-purple-200 rounded-2xl flex flex-col justify-between shadow-2xs">
          <span className="text-[10px] text-purple-800 font-extrabold uppercase tracking-wider block">
            This Month Inventory Expense
          </span>
          <span className="text-xl sm:text-2xl font-black text-purple-950 font-mono mt-1">
            ₹{monthTotal.toLocaleString()}
          </span>
        </div>

        {/* Category Breakdown Summary */}
        <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-2xs col-span-1 sm:col-span-2 space-y-2">
          <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
            <span className="text-[10px] font-black text-gray-900 uppercase tracking-wider flex items-center gap-1">
              <PieChartIcon className="w-3.5 h-3.5 text-indigo-600" /> Top Spending Categories
            </span>
            <span className="text-[10px] font-bold text-gray-400 font-mono">Overall</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            {topCategories.map((c) => (
              <div key={c.catName} className="p-2 bg-gray-50 rounded-xl border border-gray-150">
                <span className="text-[9px] font-bold text-gray-500 uppercase block truncate">{c.catName}</span>
                <span className="text-xs font-black text-gray-900 font-mono">₹{c.total.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CATEGORY BREAKDOWN PILLS */}
      <div className="bg-white p-3 border border-gray-200 rounded-2xl shadow-2xs space-y-2">
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Category Breakdown</span>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            const catTotal = categoryTotals[cat] || 0;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200'
                }`}
              >
                <span>{cat}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                  isSelected ? 'bg-indigo-700 text-white' : 'bg-gray-200 text-gray-800'
                }`}>
                  ₹{catTotal.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
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
              placeholder="Search items, notes, categories..."
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
              <span>Sort: {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* EXPENSE TABLE (SHOWS ITEM NAME NOT CATEGORY AS MAIN HEADING) */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="p-3 sm:p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-extrabold text-gray-900 uppercase tracking-wider">
            Inventory Items ({filteredExpenses.length})
          </h3>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs font-semibold">No inventory items found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-gray-50 text-gray-400 font-mono text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Item Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Amount (₹)</th>
                  <th className="py-3 px-4">Notes</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {filteredExpenses.map((exp) => {
                  const displayName = exp.itemName || exp.category;
                  return (
                    <tr key={exp.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-gray-600 whitespace-nowrap">{exp.expenseDate}</td>
                      <td className="py-3 px-4 font-black text-gray-900 whitespace-nowrap flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span>{displayName}</span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-gray-100 text-gray-600 border border-gray-200">
                          {exp.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-black font-mono text-gray-900">₹{exp.amount.toLocaleString()}</td>
                      <td className="py-3 px-4 text-gray-600 font-medium">{exp.remarks || '-'}</td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(exp)}
                            className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                            title="Edit Item"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(exp.id)}
                            className="p-1.5 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                            title="Delete Item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD / EDIT INVENTORY EXPENSE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm sm:max-w-md my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600" />
                {editingExpense ? 'Edit Inventory Record' : 'Add Inventory Item'}
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

              {/* 3. Name (optional) */}
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Item Name <span className="text-gray-400 font-normal lowercase">(optional, e.g. Glass)</span>
                </label>
                <input
                  type="text"
                  value={itemNameInput}
                  onChange={(e) => setItemNameInput(e.target.value)}
                  placeholder={`Leave empty to default to "${category}"`}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              {/* 4. Amount (₹) */}
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

              {/* 5. Notes */}
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Notes / Remarks <span className="text-gray-400 font-normal lowercase">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Purchased from local market"
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
                  {isSubmitting ? 'Saving...' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
