import React, { useState, useMemo } from 'react';
import { Expense, ExpenseCategory } from '../types';
import { useHotelData } from '../context/HotelContext';
import {
  Package,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  Calendar,
  DollarSign,
  Tag,
  FileText,
  X,
  Check,
  ChevronDown,
} from 'lucide-react';

const CATEGORIES: ExpenseCategory[] = ['Meat', 'Groceries', 'Cleaning', 'Miscellaneous'];

export default function Inventory() {
  const { expenses, addExpense, updateExpense, deleteExpense, isLoading } = useHotelData();

  // Search, Filter & Sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Form Fields
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<ExpenseCategory>('Groceries');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [unit, setUnit] = useState('kg');
  const [amount, setAmount] = useState<number | ''>('');
  const [remarks, setRemarks] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonthStr = todayStr.substring(0, 7);

  // Computed Summaries
  const { todayTotal, monthTotal, categoryTotals } = useMemo(() => {
    let todaySum = 0;
    let monthSum = 0;
    const catSums: Record<ExpenseCategory, number> = {
      Meat: 0,
      Groceries: 0,
      Cleaning: 0,
      Miscellaneous: 0,
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
        // Search filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = exp.itemName.toLowerCase().includes(q);
          const matchRemarks = exp.remarks.toLowerCase().includes(q);
          if (!matchName && !matchRemarks) return false;
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
    setItemName('');
    setQuantity(1);
    setUnit('kg');
    setAmount('');
    setRemarks('');
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (exp: Expense) => {
    setEditingExpense(exp);
    setExpenseDate(exp.expenseDate);
    setCategory(exp.category);
    setItemName(exp.itemName);
    setQuantity(exp.quantity);
    setUnit(exp.unit);
    setAmount(exp.amount);
    setRemarks(exp.remarks || '');
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) {
      setErrorMsg('Item Name is required');
      return;
    }
    if (amount === '' || Number(amount) < 0) {
      setErrorMsg('Please enter a valid amount');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, {
          expenseDate,
          category,
          itemName: itemName.trim(),
          quantity: Number(quantity || 1),
          unit: unit.trim() || 'pcs',
          amount: Number(amount),
          remarks: remarks.trim(),
        });
      } else {
        await addExpense({
          expenseDate,
          category,
          itemName: itemName.trim(),
          quantity: Number(quantity || 1),
          unit: unit.trim() || 'pcs',
          amount: Number(amount),
          remarks: remarks.trim(),
        });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save expense entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete expense "${name}"?`)) {
      try {
        await deleteExpense(id);
      } catch (err: any) {
        alert('Failed to delete expense');
      }
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-24" id="pms_inventory_panel">
      {/* Top Banner & Quick Add */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 border border-gray-200 rounded-2xl shadow-2xs">
        <div>
          <h2 className="text-base sm:text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            Inventory & Expenses
          </h2>
          <p className="text-xs text-gray-500">Track kitchen, grocery, and operational expenses in real-time</p>
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
              placeholder="Search item name or remarks..."
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
            <p className="text-xs font-semibold">No expense records found matching criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-gray-50 text-gray-400 font-mono text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Item Name</th>
                  <th className="py-3 px-4">Qty / Unit</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Remarks</th>
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
                        'bg-gray-100 text-gray-700 border border-gray-200'
                      }`}>
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-gray-900">{exp.itemName}</td>
                    <td className="py-3 px-4 font-mono text-gray-600">{exp.quantity} {exp.unit}</td>
                    <td className="py-3 px-4 text-right font-black font-mono text-gray-900">₹{exp.amount.toLocaleString()}</td>
                    <td className="py-3 px-4 text-gray-500 italic truncate max-w-[180px]">{exp.remarks || '-'}</td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(exp)}
                          className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                          title="Edit Expense"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(exp.id, exp.itemName)}
                          className="p-1.5 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
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

      {/* EXPENSE FORM MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600" />
                {editingExpense ? 'Edit Expense Record' : 'Add New Expense'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold">
                  {errorMsg}
                </div>
              )}

              {/* Expense Date */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Expense Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              {/* Category Dropdown (STRICTLY ONLY Meat, Groceries, Cleaning, Miscellaneous) */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Category <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px] cursor-pointer"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Item Name */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Item Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="e.g. Chicken, Rice, Detergent, Bulbs"
                  className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              {/* Quantity & Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={quantity === '' ? '' : quantity}
                    onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Unit</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="kg, ltr, pcs, packet"
                    className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                  />
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
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
                  className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Remarks (Optional)</label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Purchased from local market"
                  className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-xs font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2.5 pt-2">
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
