import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useHotelData } from '../context/HotelContext';
import {
  SalaryEmployee,
  SalaryHistory,
  EmployeeSalaryAdjustment,
  SalaryPayment,
  RentSetting,
  RentPayment,
  EmployeeWalletBalance,
  EmployeeWalletTransaction,
} from '../types';
import { SalaryRentService } from '../services/salaryRent';
import { formatDateDDMMYYYY } from '../utils/formatters';
import { calculatePayroll } from '../utils/payroll';
import {
  Building2,
  Users,
  Plus,
  DollarSign,
  Calendar,
  CheckCircle2,
  X,
  Edit2,
  Trash2,
  PlusCircle,
  MinusCircle,
  CreditCard,
  History,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  UserPlus,
  Receipt,
  FileText,
  Wallet,
  SlidersHorizontal,
} from 'lucide-react';

export default function SalaryRent() {
  // Selected Month State (YYYY-MM)
  const todayDateStr = new Date().toISOString().substring(0, 10);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    () => new Date().toISOString().substring(0, 7)
  );

  // Raw Data State
  const [employees, setEmployees] = useState<SalaryEmployee[]>([]);
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistory[]>([]);
  const [adjustments, setAdjustments] = useState<EmployeeSalaryAdjustment[]>([]);
  const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([]);
  const [rentSettings, setRentSettings] = useState<RentSetting[]>([]);
  const [rentPayments, setRentPayments] = useState<RentPayment[]>([]);
  const [walletBalances, setWalletBalances] = useState<EmployeeWalletBalance[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<EmployeeWalletTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Navigation & Carousel State
  const [activeTab, setActiveTab] = useState<'salary' | 'rent'>('salary');
  const [currentEmpIndex, setCurrentEmpIndex] = useState<number>(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.isActive),
    [employees]
  );

  const safeEmpIndex = Math.min(
    currentEmpIndex,
    Math.max(0, activeEmployees.length - 1)
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (diff > 40) {
      // Swipe left -> next employee or switch to rent if on last employee
      if (safeEmpIndex < activeEmployees.length - 1) {
        setCurrentEmpIndex(safeEmpIndex + 1);
      } else if (activeTab === 'salary') {
        setActiveTab('rent');
      }
    } else if (diff < -40) {
      // Swipe right -> prev employee or switch to salary if on rent
      if (activeTab === 'rent') {
        setActiveTab('salary');
      } else if (safeEmpIndex > 0) {
        setCurrentEmpIndex(safeEmpIndex - 1);
      }
    }
    setTouchStartX(null);
  };

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Modals & Form States
  const [isEditRentModalOpen, setIsEditRentModalOpen] = useState(false);
  const [rentAmountInput, setRentAmountInput] = useState<number | ''>(160000);
  const [rentEffectiveMonthInput, setRentEffectiveMonthInput] = useState(selectedMonth);

  const [isRentPaymentModalOpen, setIsRentPaymentModalOpen] = useState(false);
  const [rentPayAmountInput, setRentPayAmountInput] = useState<number | ''>('');
  const [rentPayMethodInput, setRentPayMethodInput] = useState<'cash' | 'card' | 'upi' | 'net_banking'>('cash');
  const [rentPayRemarksInput, setRentPayRemarksInput] = useState('');
  const [rentPayDateInput, setRentPayDateInput] = useState(todayDateStr);

  const [isAddEmpModalOpen, setIsAddEmpModalOpen] = useState(false);
  const [empNameInput, setEmpNameInput] = useState('');
  const [empRoleInput, setEmpRoleInput] = useState('');
  const [empSalaryInput, setEmpSalaryInput] = useState<number | ''>('');
  const [empEffectiveMonthInput, setEmpEffectiveMonthInput] = useState(selectedMonth);

  // Employee Edit Modal (Combined Name, Role, Salary)
  const [isEditEmpModalOpen, setIsEditEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<SalaryEmployee | null>(null);
  const [editEmpNameInput, setEditEmpNameInput] = useState('');
  const [editEmpRoleInput, setEditEmpRoleInput] = useState('');
  const [editEmpSalaryInput, setEditEmpSalaryInput] = useState<number | ''>('');
  const [editEmpEffectiveMonthInput, setEditEmpEffectiveMonthInput] = useState(selectedMonth);

  // Employee History Modal
  const [isEmpHistoryModalOpen, setIsEmpHistoryModalOpen] = useState(false);
  const [historyEmp, setHistoryEmp] = useState<SalaryEmployee | null>(null);

  // Salary Adjustment Modal (Bonus / Cut)
  const [isSalaryAdjModalOpen, setIsSalaryAdjModalOpen] = useState(false);
  const [adjTargetEmp, setAdjTargetEmp] = useState<SalaryEmployee | null>(null);
  const [adjType, setAdjType] = useState<'bonus' | 'cut'>('bonus');
  const [adjAmountInput, setAdjAmountInput] = useState<number | ''>('');
  const [adjRemarksInput, setAdjRemarksInput] = useState('');

  // Manual Adjustment Modal
  const [isManualAdjModalOpen, setIsManualAdjModalOpen] = useState(false);
  const [manualAdjTargetEmp, setManualAdjTargetEmp] = useState<SalaryEmployee | null>(null);
  const [manualAdjAmountInput, setManualAdjAmountInput] = useState<number | ''>('');
  const [manualAdjRemarksInput, setManualAdjRemarksInput] = useState('');

  // Pay Salary Modal
  const [isSalaryPayModalOpen, setIsSalaryPayModalOpen] = useState(false);
  const [payTargetEmp, setPayTargetEmp] = useState<SalaryEmployee | null>(null);
  const [selectedPayEmpId, setSelectedPayEmpId] = useState<string>('');
  const [salaryPayAmountInput, setSalaryPayAmountInput] = useState<number | ''>('');
  const [salaryPayMethodInput, setSalaryPayMethodInput] = useState<'cash' | 'card' | 'upi' | 'net_banking'>('cash');
  const [salaryPayRemarksInput, setSalaryPayRemarksInput] = useState('');
  const [salaryPayDateInput, setSalaryPayDateInput] = useState(todayDateStr);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const { refreshData } = useHotelData();

  // Load All Data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await SalaryRentService.fetchAllData();
      setEmployees(res.employees);
      setSalaryHistory(res.salaryHistory);
      setAdjustments(res.salaryAdjustments);
      setSalaryPayments(res.salaryPayments);
      setRentSettings(res.rentSettings);
      setRentPayments(res.rentPayments);
      setWalletBalances(res.walletBalances || []);
      setWalletTransactions(res.walletTransactions || []);
      await refreshData();
    } catch (err) {
      console.error('Error loading salary/rent data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [refreshData]);

  // Fetch employee_wallet_balance matched by employee_id
  const getEmployeeWalletBalance = useCallback(
    (empId: string): number => {
      const matched = walletBalances.find((w) => String(w.employeeId) === String(empId));
      return matched ? matched.walletBalance : 0;
    },
    [walletBalances]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Helper: Format Month YYYY-MM to Long Month Name
  const formatMonthName = (monthStr: string) => {
    if (!monthStr) return '';
    const [y, m] = monthStr.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // --- RENT CALCULATIONS FOR SELECTED MONTH ---
  const getRentDataForMonth = useCallback(
    (targetM: string) => {
      const sortedSets = [...rentSettings]
        .filter((s) => s.effectiveMonth <= targetM)
        .sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth));

      const monthlyRent = sortedSets.length > 0 ? sortedSets[0].monthlyAmount : 160000;
      const monthPayments = rentPayments.filter((p) => p.month === targetM);
      const paidThisMonth = monthPayments.reduce((sum, p) => sum + p.amount, 0);
      const remainingBalance = Math.max(0, monthlyRent - paidThisMonth);

      return {
        monthlyRent,
        paidThisMonth,
        remainingBalance,
        monthPayments,
      };
    },
    [rentSettings, rentPayments]
  );

  const currentRentCalc = useMemo(
    () => getRentDataForMonth(selectedMonth),
    [getRentDataForMonth, selectedMonth]
  );

  // --- SALARY CALCULATIONS FOR EMPLOYEES FOR SELECTED MONTH ---
  const getEmployeeSalaryCalc = useCallback(
    (emp: SalaryEmployee, targetM: string) => {
      const empHist = salaryHistory
        .filter((h) => h.employeeId === emp.id && h.effectiveMonth <= targetM)
        .sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth));

      const baseSalary = empHist.length > 0 ? empHist[0].baseSalary : emp.baseSalary;

      const monthAdjs = adjustments.filter(
        (a) => a.employeeId === emp.id && a.month === targetM
      );
      const totalBonus = monthAdjs
        .filter((a) => a.type === 'bonus')
        .reduce((sum, a) => sum + a.amount, 0);
      const totalCut = monthAdjs
        .filter((a) => a.type === 'cut')
        .reduce((sum, a) => sum + a.amount, 0);

      const monthPays = salaryPayments.filter(
        (p) => p.employeeId === emp.id && p.month === targetM
      );
      const paidThisMonth = monthPays.reduce((sum, p) => sum + p.amount, 0);

      // Shared payroll formula calculation
      const payroll = calculatePayroll({
        monthlySalary: baseSalary,
        bonus: totalBonus,
        salaryCut: totalCut,
        payments: paidThisMonth,
        previousWallet: 0,
      });

      return {
        baseSalary: payroll.monthlySalary,
        totalBonus: payroll.bonus,
        totalCut: payroll.salaryCut,
        totalDueThisMonth: payroll.finalSalary,
        paidThisMonth: payroll.payments,
        remainingBalance: Math.max(0, payroll.finalSalary - payroll.payments),
        inventoryExpense: payroll.inventoryExpense,
        monthPays,
        monthAdjs,
      };
    },
    [salaryHistory, adjustments, salaryPayments]
  );

  // Aggregate Salary Totals
  const salaryAggregates = useMemo(() => {
    let totalBase = 0;
    let totalBonus = 0;
    let totalCut = 0;
    let totalDue = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;

    const activeEmps = employees.filter((e) => e.isActive);

    activeEmps.forEach((emp) => {
      const calc = getEmployeeSalaryCalc(emp, selectedMonth);
      totalBase += calc.baseSalary;
      totalBonus += calc.totalBonus;
      totalCut += calc.totalCut;
      totalDue += calc.totalDueThisMonth;
      totalPaid += calc.paidThisMonth;
      totalOutstanding += calc.remainingBalance;
    });

    return {
      totalBase,
      totalBonus,
      totalCut,
      totalDue,
      totalPaid,
      totalOutstanding,
      empCount: activeEmps.length,
    };
  }, [employees, getEmployeeSalaryCalc, selectedMonth]);

  // Selected Month's Salary Payments List with Employee Details
  const selectedMonthSalaryPayments = useMemo(() => {
    return salaryPayments
      .filter((p) => p.month === selectedMonth)
      .map((p) => {
        const emp = employees.find((e) => e.id === p.employeeId);
        const empAdjs = adjustments.filter(
          (a) => a.employeeId === p.employeeId && a.month === selectedMonth
        );
        const bonus = empAdjs.filter((a) => a.type === 'bonus').reduce((sum, a) => sum + a.amount, 0);
        const cut = empAdjs.filter((a) => a.type === 'cut').reduce((sum, a) => sum + a.amount, 0);

        return {
          ...p,
          employeeName: emp ? emp.name : 'Staff Employee',
          employeeRole: emp ? emp.role : '',
          bonus,
          cut,
        };
      });
  }, [salaryPayments, selectedMonth, employees, adjustments]);

  // HANDLERS
  const handleUpdateRentSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rentAmountInput || Number(rentAmountInput) <= 0) return;
    setIsSubmitting(true);
    try {
      await SalaryRentService.updateRentAmount(Number(rentAmountInput), rentEffectiveMonthInput);
      await loadData();
      setIsEditRentModalOpen(false);
      showToast('✓ Monthly rent updated successfully');
    } catch (err: any) {
      alert(err.message || 'Failed to update rent');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddRentPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rentPayAmountInput || Number(rentPayAmountInput) <= 0) return;
    setIsSubmitting(true);
    try {
      await SalaryRentService.addRentPayment(
        selectedMonth,
        Number(rentPayAmountInput),
        rentPayMethodInput,
        rentPayRemarksInput,
        rentPayDateInput
      );
      await loadData();
      setIsRentPaymentModalOpen(false);
      setRentPayAmountInput('');
      setRentPayRemarksInput('');
      showToast('✓ Rent payment recorded');
    } catch (err: any) {
      alert(err.message || 'Failed to record rent payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empNameInput.trim() || !empSalaryInput || Number(empSalaryInput) <= 0) return;
    setIsSubmitting(true);
    try {
      await SalaryRentService.addEmployee(
        empNameInput,
        empRoleInput,
        Number(empSalaryInput),
        empEffectiveMonthInput
      );
      await loadData();
      setIsAddEmpModalOpen(false);
      setEmpNameInput('');
      setEmpRoleInput('');
      setEmpSalaryInput('');
      showToast('✓ Employee added successfully');
    } catch (err: any) {
      alert(err.message || 'Failed to add employee');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEmpEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmp) return;
    setIsSubmitting(true);
    try {
      if (editEmpNameInput.trim() !== editingEmp.name || editEmpRoleInput.trim() !== (editingEmp.role || '')) {
        await SalaryRentService.updateEmployeeName(
          editingEmp.id,
          editEmpNameInput.trim(),
          editEmpRoleInput.trim()
        );
      }
      if (editEmpSalaryInput && Number(editEmpSalaryInput) > 0) {
        await SalaryRentService.updateEmployeeSalary(
          editingEmp.id,
          Number(editEmpSalaryInput),
          editEmpEffectiveMonthInput
        );
      }
      await loadData();
      setIsEditEmpModalOpen(false);
      setEditingEmp(null);
      showToast('✓ Employee updated successfully');
    } catch (err: any) {
      alert(err.message || 'Failed to update employee');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjTargetEmp || !adjAmountInput || Number(adjAmountInput) <= 0) return;
    setIsSubmitting(true);
    try {
      await SalaryRentService.addSalaryAdjustment(
        adjTargetEmp.id,
        selectedMonth,
        adjType,
        Number(adjAmountInput),
        adjRemarksInput
      );
      await loadData();
      setIsSalaryAdjModalOpen(false);
      setAdjTargetEmp(null);
      setAdjAmountInput('');
      setAdjRemarksInput('');
      showToast(`✓ Salary ${adjType} recorded`);
    } catch (err: any) {
      alert(err.message || 'Failed to record adjustment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAdjTargetEmp || !manualAdjAmountInput || Number(manualAdjAmountInput) === 0) return;
    setIsSubmitting(true);
    try {
      await SalaryRentService.addManualAdjustment(
        manualAdjTargetEmp.id,
        selectedMonth,
        Number(manualAdjAmountInput),
        manualAdjRemarksInput
      );
      await loadData();
      setIsManualAdjModalOpen(false);
      setManualAdjTargetEmp(null);
      setManualAdjAmountInput('');
      setManualAdjRemarksInput('');
      showToast('✓ Manual wallet adjustment recorded');
    } catch (err: any) {
      alert(err.message || 'Failed to record manual adjustment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddSalaryPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmp = payTargetEmp || employees.find((emp) => emp.id === selectedPayEmpId);
    if (!targetEmp || !salaryPayAmountInput || Number(salaryPayAmountInput) <= 0) return;
    setIsSubmitting(true);
    try {
      await SalaryRentService.addSalaryPayment(
        targetEmp.id,
        selectedMonth,
        Number(salaryPayAmountInput),
        salaryPayMethodInput,
        salaryPayRemarksInput,
        salaryPayDateInput
      );
      await loadData();
      setIsSalaryPayModalOpen(false);
      setPayTargetEmp(null);
      setSelectedPayEmpId('');
      setSalaryPayAmountInput('');
      setSalaryPayRemarksInput('');
      showToast('✓ Salary payment recorded');
    } catch (err: any) {
      alert(err.message || 'Failed to record salary payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEmployee = async (emp: SalaryEmployee) => {
    if (window.confirm(`Are you sure you want to remove employee "${emp.name}"?`)) {
      try {
        await SalaryRentService.deleteEmployee(emp.id);
        await loadData();
        showToast('✓ Employee removed successfully');
      } catch (err) {
        alert('Failed to delete employee');
      }
    }
  };

  const changeMonth = (offset: number) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + offset, 1);
    const newY = d.getFullYear();
    const newM = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${newY}-${newM}`);
  };

  // Open Quick Pay Salary Modal
  const openQuickPaySalaryModal = () => {
    const activeEmps = employees.filter((e) => e.isActive);
    if (activeEmps.length === 0) {
      alert('Please add an employee first before paying salary.');
      return;
    }
    const firstEmp = activeEmps[0];
    const calc = getEmployeeSalaryCalc(firstEmp, selectedMonth);
    setPayTargetEmp(firstEmp);
    setSelectedPayEmpId(firstEmp.id);
    setSalaryPayAmountInput(calc.remainingBalance > 0 ? calc.remainingBalance : '');
    setSalaryPayRemarksInput('');
    setIsSalaryPayModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-24 max-w-7xl mx-auto px-2 sm:px-4" id="pms_salary_rent_panel">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-semibold animate-fade-in border border-slate-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. MONTH SELECTOR */}
      <div className="bg-white p-2.5 border border-slate-200/80 rounded-2xl shadow-xs flex items-center justify-between gap-2 max-w-md mx-auto">
        <button
          onClick={() => changeMonth(-1)}
          className="h-9 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200/80 transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
          title="Previous Month"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>

        <div className="flex-1 flex items-center justify-center gap-2 px-3 h-9 bg-indigo-50/60 border border-indigo-100/80 rounded-xl text-xs font-bold text-slate-900">
          <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="font-extrabold text-slate-900 font-mono tracking-tight text-xs sm:text-sm">
            {formatMonthName(selectedMonth)}
          </span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="sr-only"
            id="month_picker_input"
          />
          <label htmlFor="month_picker_input" className="cursor-pointer text-[10px] uppercase font-bold text-indigo-600 hover:underline ml-0.5">
            Change
          </label>
        </div>

        <button
          onClick={() => changeMonth(1)}
          className="h-9 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200/80 transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
          title="Next Month"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 2. SUMMARY CARDS (4) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Monthly Rent */}
        <div className="bg-white p-4 border border-slate-200/80 rounded-2xl shadow-xs flex flex-col justify-between h-full min-h-[96px]">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Monthly Rent</span>
            <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-tight">
              ₹{currentRentCalc.monthlyRent.toLocaleString()}
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] mt-2">
            <span className="text-slate-400 font-medium">Target Month</span>
            <span className="font-extrabold text-indigo-600 font-mono">Paid: ₹{currentRentCalc.paidThisMonth.toLocaleString()}</span>
          </div>
        </div>

        {/* Rent Remaining */}
        <div className="bg-white p-4 border border-slate-200/80 rounded-2xl shadow-xs flex flex-col justify-between h-full min-h-[96px]">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Rent Remaining</span>
            <div className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
              currentRentCalc.remainingBalance > 0 ? 'text-amber-600' : 'text-emerald-600'
            }`}>
              ₹{currentRentCalc.remainingBalance.toLocaleString()}
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] mt-2">
            <span className="text-slate-400 font-medium">Due Status</span>
            <span className={`font-bold font-mono ${currentRentCalc.remainingBalance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {currentRentCalc.remainingBalance > 0 ? 'Pending' : 'Fully Paid'}
            </span>
          </div>
        </div>

        {/* Staff Salaries */}
        <div className="bg-white p-4 border border-slate-200/80 rounded-2xl shadow-xs flex flex-col justify-between h-full min-h-[96px]">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Staff Salaries</span>
            <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-tight">
              ₹{salaryAggregates.totalDue.toLocaleString()}
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] mt-2">
            <span className="text-slate-400 font-medium">{salaryAggregates.empCount} Staff</span>
            <span className="font-extrabold text-emerald-600 font-mono">Paid: ₹{salaryAggregates.totalPaid.toLocaleString()}</span>
          </div>
        </div>

        {/* Salary Remaining */}
        <div className="bg-white p-4 border border-slate-200/80 rounded-2xl shadow-xs flex flex-col justify-between h-full min-h-[96px]">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Salary Remaining</span>
            <div className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
              salaryAggregates.totalOutstanding > 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}>
              ₹{salaryAggregates.totalOutstanding.toLocaleString()}
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] mt-2">
            <span className="text-slate-400 font-medium">Pending Due</span>
            <span className={`font-bold font-mono ${salaryAggregates.totalOutstanding > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              Due: ₹{salaryAggregates.totalOutstanding.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* 3. SEGMENTED CONTROL (TABS) */}
      <div className="bg-slate-100/90 p-1 rounded-2xl flex items-center max-w-md mx-auto shadow-inner border border-slate-200/80">
        <button
          onClick={() => setActiveTab('salary')}
          className={`flex-1 py-2 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'salary'
              ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Salary</span>
        </button>
        <button
          onClick={() => setActiveTab('rent')}
          className={`flex-1 py-2 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'rent'
              ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Rent</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* PAGE 1: SALARY TAB */}
      {/* ========================================================= */}
      {activeTab === 'salary' && (
        <div className="space-y-4 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                Employee Salary ({activeEmployees.length})
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Swipe left/right to view employee cards
              </p>
            </div>

            <button
              onClick={() => {
                setEmpNameInput('');
                setEmpRoleInput('');
                setEmpSalaryInput('');
                setEmpEffectiveMonthInput(selectedMonth);
                setIsAddEmpModalOpen(true);
              }}
              className="h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Add Employee</span>
            </button>
          </div>

          {/* Employee Slider / Carousel */}
          {activeEmployees.length === 0 ? (
            <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-500">No active employees added yet.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Click "+ Add Employee" above to create your first employee profile.</p>
            </div>
          ) : (
            <div className="space-y-3 max-w-lg mx-auto">
              {/* Slider Header / Navigation */}
              <div className="flex items-center justify-between px-1">
                <button
                  onClick={() => setCurrentEmpIndex(Math.max(0, safeEmpIndex - 1))}
                  disabled={safeEmpIndex === 0}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition active:scale-95 shadow-2xs"
                  title="Previous Employee"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="text-xs font-extrabold text-slate-800 bg-white px-3.5 py-1.5 rounded-full border border-slate-200/80 shadow-2xs font-mono flex items-center gap-1.5">
                  <span className="text-indigo-600">&lt;</span>
                  <span className="text-slate-900 font-bold">{activeEmployees[safeEmpIndex]?.name || 'Employee'}</span>
                  <span className="text-slate-400">({safeEmpIndex + 1} / {activeEmployees.length})</span>
                  <span className="text-indigo-600">&gt;</span>
                </div>

                <button
                  onClick={() => setCurrentEmpIndex(Math.min(activeEmployees.length - 1, safeEmpIndex + 1))}
                  disabled={safeEmpIndex >= activeEmployees.length - 1}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition active:scale-95 shadow-2xs"
                  title="Next Employee"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Employee Card Container with Touch Swipe Support */}
              {(() => {
                const emp = activeEmployees[safeEmpIndex];
                if (!emp) return null;
                const calc = getEmployeeSalaryCalc(emp, selectedMonth);

                return (
                  <div
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    className="bg-white border-2 border-indigo-100/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5 select-none transition-all duration-200 hover:border-indigo-200"
                  >
                    {/* Header: Name, Role, Status */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="font-black text-base text-slate-900 tracking-tight flex items-center gap-2">
                          {emp.name}
                        </h3>
                        {emp.role && (
                          <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide block mt-0.5">
                            {emp.role}
                          </span>
                        )}
                      </div>
                      <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-lg text-[10px] font-mono font-bold text-emerald-700 uppercase">
                        Active
                      </span>
                    </div>

                    {/* Salary & Wallet Details Grid */}
                    <div className="space-y-2 text-xs">
                      {/* Wallet Balance (Derived directly from employee_wallet_balance view) */}
                      {(() => {
                        const walletBal = getEmployeeWalletBalance(emp.id);
                        return (
                          <div className="flex items-center justify-between p-2.5 bg-indigo-50/90 rounded-xl border border-indigo-100">
                            <div className="flex items-center gap-1.5 font-bold text-indigo-900 text-[11px]">
                              <Wallet className="w-4 h-4 text-indigo-600 shrink-0" />
                              <span>Wallet Balance</span>
                            </div>
                            <span className={`font-mono font-black text-sm ${walletBal >= 0 ? 'text-indigo-950' : 'text-rose-600'}`}>
                              ₹{walletBal.toLocaleString()}
                            </span>
                          </div>
                        );
                      })()}

                      <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="font-semibold text-slate-500 text-[11px]">Monthly Salary</span>
                        <span className="font-mono font-black text-slate-900 text-sm">₹{calc.baseSalary.toLocaleString()}</span>
                      </div>

                      {(calc.totalBonus > 0 || calc.totalCut > 0) && (
                        <div className="flex items-center justify-between px-2.5 py-1.5 text-[10px] font-bold bg-slate-100/70 rounded-xl">
                          <span className="text-slate-500">Month Adjustments:</span>
                          <span className="font-mono">
                            {calc.totalBonus > 0 && <span className="text-emerald-600">+{calc.totalBonus} Bonus </span>}
                            {calc.totalCut > 0 && <span className="text-rose-600">-{calc.totalCut} Cut</span>}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between p-2.5 bg-emerald-50/80 rounded-xl border border-emerald-100">
                        <span className="font-semibold text-emerald-800 text-[11px]">Paid This Month</span>
                        <span className="font-mono font-black text-emerald-950 text-sm">₹{calc.paidThisMonth.toLocaleString()}</span>
                      </div>

                      <div className={`flex items-center justify-between p-2.5 rounded-xl border ${
                        calc.remainingBalance === 0
                          ? 'bg-emerald-50/80 border-emerald-200/80 text-emerald-900'
                          : 'bg-rose-50/80 border-rose-200/80 text-rose-900'
                      }`}>
                        <span className="font-semibold text-[11px]">Remaining</span>
                        <span className="font-mono font-black text-sm">₹{calc.remainingBalance.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        {/* Pay */}
                        <button
                          onClick={() => {
                            setPayTargetEmp(emp);
                            setSelectedPayEmpId(emp.id);
                            setSalaryPayAmountInput(calc.remainingBalance > 0 ? calc.remainingBalance : '');
                            setSalaryPayRemarksInput('');
                            setIsSalaryPayModalOpen(true);
                          }}
                          className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-2xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>Pay</span>
                        </button>

                        {/* History */}
                        <button
                          onClick={() => {
                            setHistoryEmp(emp);
                            setIsEmpHistoryModalOpen(true);
                          }}
                          className="h-10 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <History className="w-4 h-4 text-indigo-600" />
                          <span>History</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 text-xs">
                        {/* Edit */}
                        <button
                          onClick={() => {
                            setEditingEmp(emp);
                            setEditEmpNameInput(emp.name);
                            setEditEmpRoleInput(emp.role || '');
                            setEditEmpSalaryInput(calc.baseSalary);
                            setEditEmpEffectiveMonthInput(selectedMonth);
                            setIsEditEmpModalOpen(true);
                          }}
                          className="h-8 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1 text-[10px]"
                        >
                          <Edit2 className="w-3 h-3 text-slate-500 shrink-0" />
                          <span>Edit</span>
                        </button>

                        {/* Bonus / Cut */}
                        <button
                          onClick={() => {
                            setAdjTargetEmp(emp);
                            setAdjType('bonus');
                            setAdjAmountInput('');
                            setAdjRemarksInput('');
                            setIsSalaryAdjModalOpen(true);
                          }}
                          className="h-8 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1 text-[10px]"
                        >
                          <PlusCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>Bonus/Cut</span>
                        </button>

                        {/* Manual Adj */}
                        <button
                          onClick={() => {
                            setManualAdjTargetEmp(emp);
                            setManualAdjAmountInput('');
                            setManualAdjRemarksInput('');
                            setIsManualAdjModalOpen(true);
                          }}
                          className="h-8 bg-slate-50 border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 text-indigo-700 font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1 text-[10px]"
                          title="Manual Wallet Adjustment"
                        >
                          <SlidersHorizontal className="w-3 h-3 text-indigo-600 shrink-0" />
                          <span>Adj</span>
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteEmployee(emp)}
                          className="h-8 bg-slate-50 border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-rose-600 font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1 text-[10px]"
                        >
                          <Trash2 className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Page Dots Indicator */}
              <div className="flex items-center justify-center gap-1.5 pt-1">
                {activeEmployees.map((e, idx) => (
                  <button
                    key={e.id}
                    onClick={() => setCurrentEmpIndex(idx)}
                    className={`h-2 rounded-full transition-all duration-200 cursor-pointer ${
                      idx === safeEmpIndex
                        ? 'w-6 bg-indigo-600'
                        : 'w-2 bg-slate-300 hover:bg-slate-400'
                    }`}
                    title={`View ${e.name}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Salary Payment History */}
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs mt-4">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  Salary Payment History ({formatMonthName(selectedMonth)})
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Staff payroll ledger for current selected month</p>
              </div>

              <button
                onClick={openQuickPaySalaryModal}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs rounded-xl border border-indigo-200 transition cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Pay Salary</span>
              </button>
            </div>

            {selectedMonthSalaryPayments.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs font-medium">
                No salary payments recorded for this month.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 text-slate-400 font-mono text-[10px] uppercase">
                    <tr>
                      <th className="py-3 px-4 font-bold">Employee</th>
                      <th className="py-3 px-4 text-right font-bold">Amount Paid (₹)</th>
                      <th className="py-3 px-4 text-center font-bold">Bonus</th>
                      <th className="py-3 px-4 text-center font-bold">Salary Cut</th>
                      <th className="py-3 px-4 font-bold">Remarks</th>
                      <th className="py-3 px-4 font-bold">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {selectedMonthSalaryPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-extrabold text-slate-900">
                          <div>{p.employeeName}</div>
                          {p.employeeRole && <div className="text-[10px] font-normal text-slate-400">{p.employeeRole}</div>}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-emerald-700 text-sm">₹{p.amount.toLocaleString()}</td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-emerald-600">
                          {p.bonus > 0 ? `+₹${p.bonus.toLocaleString()}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-rose-600">
                          {p.cut > 0 ? `-₹${p.cut.toLocaleString()}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{p.remarks || '-'}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-600">{formatDateDDMMYYYY(p.paymentDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PAGE 2: RENT TAB */}
      {/* ========================================================= */}
      {activeTab === 'rent' && (
        <div className="space-y-4 animate-fade-in">
          {/* Section Header */}
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              Property Rent
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Manage monthly property rent and ledger
            </p>
          </div>

          {/* Dedicated Rent Summary Card */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Monthly Rent</span>
                <span className="text-lg sm:text-xl font-black font-mono text-slate-900">₹{currentRentCalc.monthlyRent.toLocaleString()}</span>
              </div>

              <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-100">
                <span className="text-[10px] font-bold text-emerald-700 uppercase block mb-1">Paid Amount</span>
                <span className="text-lg sm:text-xl font-black font-mono text-emerald-900">₹{currentRentCalc.paidThisMonth.toLocaleString()}</span>
              </div>

              <div className={`p-3 rounded-xl border ${
                currentRentCalc.remainingBalance > 0
                  ? 'bg-amber-50/70 border-amber-100 text-amber-900'
                  : 'bg-emerald-50/70 border-emerald-100 text-emerald-900'
              }`}>
                <span className="text-[10px] font-bold uppercase block mb-1">Remaining</span>
                <span className="text-lg sm:text-xl font-black font-mono">₹{currentRentCalc.remainingBalance.toLocaleString()}</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Due Status</span>
                <span className={`text-sm font-extrabold uppercase font-mono ${
                  currentRentCalc.remainingBalance > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`}>
                  {currentRentCalc.remainingBalance > 0 ? 'Pending' : 'Fully Paid'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
              <button
                onClick={() => {
                  setRentAmountInput(currentRentCalc.monthlyRent);
                  setRentEffectiveMonthInput(selectedMonth);
                  setIsEditRentModalOpen(true);
                }}
                className="h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Edit2 className="w-3.5 h-3.5 text-slate-300" />
                <span>Update Rent</span>
              </button>

              <button
                onClick={() => {
                  setRentPayAmountInput(currentRentCalc.remainingBalance > 0 ? currentRentCalc.remainingBalance : '');
                  setRentPayRemarksInput('');
                  setIsRentPaymentModalOpen(true);
                }}
                className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Pay Rent</span>
              </button>
            </div>
          </div>

          {/* Rent Payment History */}
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-indigo-600" />
                  Recent Rent Payments ({formatMonthName(selectedMonth)})
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Rent ledger for current selected month</p>
              </div>

              <button
                onClick={() => {
                  setRentPayAmountInput(currentRentCalc.remainingBalance > 0 ? currentRentCalc.remainingBalance : '');
                  setRentPayRemarksInput('');
                  setIsRentPaymentModalOpen(true);
                }}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-xs rounded-xl border border-indigo-200 transition cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Pay Rent</span>
              </button>
            </div>

            {currentRentCalc.monthPayments.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs font-medium">
                No rent payments recorded for this month.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 text-slate-400 font-mono text-[10px] uppercase">
                    <tr>
                      <th className="py-3 px-4 font-bold">Date</th>
                      <th className="py-3 px-4 font-bold">Payment Method</th>
                    <th className="py-3 px-4 text-right font-bold">Amount Paid (₹)</th>
                    <th className="py-3 px-4 font-bold">Remarks / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {currentRentCalc.monthPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-600">{formatDateDDMMYYYY(p.paymentDate)}</td>
                      <td className="py-3 px-4 uppercase font-extrabold text-indigo-700 text-[11px]">{p.paymentMethod}</td>
                      <td className="py-3 px-4 text-right font-mono font-black text-emerald-700 text-sm">₹{p.amount.toLocaleString()}</td>
                      <td className="py-3 px-4 text-slate-600">{p.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      )}

      {/* ========================================================= */}
      {/* MODALS */}
      {/* ========================================================= */}

      {/* 1. EDIT RENT MODAL */}
      {isEditRentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-extrabold text-xs text-slate-900 uppercase">Update Monthly Rent</h3>
              <button onClick={() => setIsEditRentModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateRentSetting} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">New Monthly Rent (₹)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={rentAmountInput}
                  onChange={(e) => setRentAmountInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Apply From Month</label>
                <input
                  type="month"
                  required
                  value={rentEffectiveMonthInput}
                  onChange={(e) => setRentEffectiveMonthInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditRentModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 font-bold text-slate-700 rounded-xl hover:bg-slate-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Update Rent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. PAY RENT MODAL */}
      {isRentPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-extrabold text-xs text-slate-900 uppercase">Pay Rent ({formatMonthName(selectedMonth)})</h3>
              <button onClick={() => setIsRentPaymentModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddRentPayment} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Payment Date</label>
                <input
                  type="date"
                  required
                  value={rentPayDateInput}
                  onChange={(e) => setRentPayDateInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Amount Paid (₹)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={rentPayAmountInput}
                  onChange={(e) => setRentPayAmountInput(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 160000"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Payment Method</label>
                <select
                  value={rentPayMethodInput}
                  onChange={(e) => setRentPayMethodInput(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px] cursor-pointer"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="net_banking">Net Banking</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Notes / Remarks</label>
                <input
                  type="text"
                  value={rentPayRemarksInput}
                  onChange={(e) => setRentPayRemarksInput(e.target.value)}
                  placeholder="e.g. Full Rent Payment"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRentPaymentModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 font-bold text-slate-700 rounded-xl hover:bg-slate-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Record Rent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. ADD EMPLOYEE MODAL */}
      {isAddEmpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-extrabold text-xs text-slate-900 uppercase">+ Add New Employee</h3>
              <button onClick={() => setIsAddEmpModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddEmployee} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Employee Name *</label>
                <input
                  type="text"
                  required
                  value={empNameInput}
                  onChange={(e) => setEmpNameInput(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Role / Designation</label>
                <input
                  type="text"
                  value={empRoleInput}
                  onChange={(e) => setEmpRoleInput(e.target.value)}
                  placeholder="e.g. Housekeeping, Receptionist, Chef"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Base Monthly Salary (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={empSalaryInput}
                  onChange={(e) => setEmpSalaryInput(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 25000"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Effective Month</label>
                <input
                  type="month"
                  required
                  value={empEffectiveMonthInput}
                  onChange={(e) => setEmpEffectiveMonthInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddEmpModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 font-bold text-slate-700 rounded-xl hover:bg-slate-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. EDIT EMPLOYEE MODAL (Name, Role, Base Salary) */}
      {isEditEmpModalOpen && editingEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-extrabold text-xs text-slate-900 uppercase">Edit Employee Details</h3>
              <button onClick={() => setIsEditEmpModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEmpEdit} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Employee Name *</label>
                <input
                  type="text"
                  required
                  value={editEmpNameInput}
                  onChange={(e) => setEditEmpNameInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Role / Designation</label>
                <input
                  type="text"
                  value={editEmpRoleInput}
                  onChange={(e) => setEditEmpRoleInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Monthly Salary (₹)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={editEmpSalaryInput}
                  onChange={(e) => setEditEmpSalaryInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Effective Month</label>
                <input
                  type="month"
                  required
                  value={editEmpEffectiveMonthInput}
                  onChange={(e) => setEditEmpEffectiveMonthInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditEmpModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 font-bold text-slate-700 rounded-xl hover:bg-slate-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. PAY SALARY MODAL */}
      {isSalaryPayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-extrabold text-xs text-slate-900 uppercase">
                Pay Salary ({formatMonthName(selectedMonth)})
              </h3>
              <button onClick={() => setIsSalaryPayModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSalaryPayment} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Select Employee *</label>
                <select
                  value={payTargetEmp ? payTargetEmp.id : selectedPayEmpId}
                  onChange={(e) => {
                    const empId = e.target.value;
                    setSelectedPayEmpId(empId);
                    const found = employees.find((emp) => emp.id === empId);
                    setPayTargetEmp(found || null);
                    if (found) {
                      const calc = getEmployeeSalaryCalc(found, selectedMonth);
                      setSalaryPayAmountInput(calc.remainingBalance > 0 ? calc.remainingBalance : '');
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px] cursor-pointer"
                >
                  {employees
                    .filter((e) => e.isActive)
                    .map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} {emp.role ? `(${emp.role})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Payment Date</label>
                <input
                  type="date"
                  required
                  value={salaryPayDateInput}
                  onChange={(e) => setSalaryPayDateInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Amount Paid (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={salaryPayAmountInput}
                  onChange={(e) => setSalaryPayAmountInput(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 20000"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Payment Method</label>
                <select
                  value={salaryPayMethodInput}
                  onChange={(e) => setSalaryPayMethodInput(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px] cursor-pointer"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="net_banking">Net Banking</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Notes / Remarks</label>
                <input
                  type="text"
                  value={salaryPayRemarksInput}
                  onChange={(e) => setSalaryPayRemarksInput(e.target.value)}
                  placeholder="e.g. Monthly salary payout"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSalaryPayModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 font-bold text-slate-700 rounded-xl hover:bg-slate-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. BONUS / SALARY CUT MODAL */}
      {isSalaryAdjModalOpen && adjTargetEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-extrabold text-xs text-slate-900 uppercase">
                {adjType === 'bonus' ? 'Add Bonus' : 'Salary Cut'} • {adjTargetEmp.name}
              </h3>
              <button onClick={() => setIsSalaryAdjModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddAdjustment} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Adjustment Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjType('bonus')}
                    className={`py-2 rounded-xl font-bold border transition cursor-pointer ${
                      adjType === 'bonus'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    + Bonus
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjType('cut')}
                    className={`py-2 rounded-xl font-bold border transition cursor-pointer ${
                      adjType === 'cut'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    - Salary Cut
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={adjAmountInput}
                  onChange={(e) => setAdjAmountInput(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 2000"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Reason / Notes</label>
                <input
                  type="text"
                  value={adjRemarksInput}
                  onChange={(e) => setAdjRemarksInput(e.target.value)}
                  placeholder="e.g. Festival bonus / Uninformed leave"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSalaryAdjModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 font-bold text-slate-700 rounded-xl hover:bg-slate-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Save Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MANUAL WALLET ADJUSTMENT MODAL */}
      {isManualAdjModalOpen && manualAdjTargetEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-extrabold text-xs text-slate-900 uppercase">
                Manual Wallet Adjustment • {manualAdjTargetEmp.name}
              </h3>
              <button onClick={() => setIsManualAdjModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualAdjustment} className="p-4 space-y-3.5 text-xs">
              <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between">
                <span className="text-[11px] font-bold text-indigo-900">Current Wallet Balance:</span>
                <span className="font-mono font-black text-sm text-indigo-950">
                  ₹{getEmployeeWalletBalance(manualAdjTargetEmp.id).toLocaleString()}
                </span>
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Adjustment Amount (₹) *</label>
                <input
                  type="number"
                  required
                  value={manualAdjAmountInput}
                  onChange={(e) => setManualAdjAmountInput(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 500 or -500"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
                <p className="text-[10px] text-slate-400 mt-1">Positive adds to wallet balance, negative reduces it.</p>
              </div>

              <div>
                <label className="font-bold text-slate-500 uppercase block mb-1 text-[10px]">Remarks / Reason *</label>
                <input
                  type="text"
                  required
                  value={manualAdjRemarksInput}
                  onChange={(e) => setManualAdjRemarksInput(e.target.value)}
                  placeholder="e.g. Opening balance adjustment"
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsManualAdjModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 font-bold text-slate-700 rounded-xl hover:bg-slate-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Record Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. INDIVIDUAL EMPLOYEE HISTORY MODAL */}
      {isEmpHistoryModalOpen && historyEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div>
                <h3 className="font-extrabold text-xs text-slate-900 uppercase">
                  Employee Ledger & History • {historyEmp.name}
                </h3>
                <p className="text-[11px] text-slate-500">{historyEmp.role || 'Staff Employee'}</p>
              </div>
              <button onClick={() => setIsEmpHistoryModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[65vh] overflow-y-auto text-xs">
              {/* Wallet Balance Header */}
              <div className="p-3 bg-indigo-50/90 border border-indigo-100 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-indigo-900">Current Wallet Balance</span>
                </div>
                <span className="font-mono font-black text-base text-indigo-950">
                  ₹{getEmployeeWalletBalance(historyEmp.id).toLocaleString()}
                </span>
              </div>

              {/* Wallet Transactions Ledger */}
              <div className="space-y-2">
                <h4 className="font-extrabold text-[11px] text-slate-500 uppercase tracking-wider">
                  Wallet Transactions Ledger (employee_wallet_transactions)
                </h4>
                {walletTransactions.filter((wt) => String(wt.employeeId) === String(historyEmp.id)).length === 0 ? (
                  <p className="text-slate-400 italic py-2 text-center">No ledger transactions found.</p>
                ) : (
                  <div className="space-y-1.5">
                    {walletTransactions
                      .filter((wt) => String(wt.employeeId) === String(historyEmp.id))
                      .map((wt) => {
                        const typeColors: Record<string, string> = {
                          monthly_salary: 'bg-blue-50 text-blue-700 border-blue-200',
                          bonus: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                          salary_cut: 'bg-rose-50 text-rose-700 border-rose-200',
                          payment: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                          manual_adjustment: 'bg-purple-50 text-purple-700 border-purple-200',
                        };

                        return (
                          <div key={wt.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-md border text-[9px] font-mono font-bold uppercase ${typeColors[wt.transactionType] || 'bg-slate-100 text-slate-700'}`}>
                                  {wt.transactionType.replace('_', ' ')}
                                </span>
                                <span className="font-mono font-bold text-slate-800 text-[11px]">{formatMonthName(wt.salaryMonth)}</span>
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">{formatDateDDMMYYYY(wt.createdAt.substring(0, 10))} • {wt.remarks || '-'}</div>
                            </div>
                            <div className="text-right">
                              <div className={`font-mono font-black text-sm ${['salary_cut', 'payment'].includes(wt.transactionType) ? 'text-rose-600' : 'text-emerald-700'}`}>
                                {['salary_cut', 'payment'].includes(wt.transactionType) ? '-' : '+'}₹{wt.amount.toLocaleString()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Salary Payment History */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h4 className="font-extrabold text-[11px] text-slate-500 uppercase tracking-wider">
                  Payment History
                </h4>
                {salaryPayments.filter((p) => p.employeeId === historyEmp.id).length === 0 ? (
                  <p className="text-slate-400 italic py-2 text-center">No payment history recorded for {historyEmp.name}.</p>
                ) : (
                  <div className="space-y-1.5">
                    {salaryPayments
                      .filter((p) => p.employeeId === historyEmp.id)
                      .map((p) => (
                        <div key={p.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between gap-3">
                          <div>
                            <div className="font-mono font-bold text-slate-900">{formatMonthName(p.month)}</div>
                            <div className="text-[10px] text-slate-500">{formatDateDDMMYYYY(p.paymentDate)} • {p.remarks || 'Salary Payment'}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-black text-emerald-700 text-sm">₹{p.amount.toLocaleString()}</div>
                            <div className="text-[10px] uppercase font-extrabold text-indigo-600">{p.paymentMethod}</div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsEmpHistoryModalOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
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
