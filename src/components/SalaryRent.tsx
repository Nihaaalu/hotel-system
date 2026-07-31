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
import { formatDateDDMMYYYY, getISTDateStr, getISTMonthStr } from '../utils/formatters';
import { calculatePayroll } from '../utils/payroll';
import {
  Building2,
  Users,
  Plus,
  Calendar,
  CheckCircle2,
  X,
  Edit2,
  Trash2,
  PlusCircle,
  CreditCard,
  History,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  UserPlus,
  Receipt,
  FileText,
  Wallet,
  SlidersHorizontal,
  MoreVertical,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';

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

const formatMonthName = (monthStr: string) => {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export default function SalaryRent() {
  // Always default to Indian Standard Time (IST) current date and month
  const todayIST = getISTDateStr();
  const currentMonthIST = getISTMonthStr();

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthIST);

  // Month Picker Modal State
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(() => Number(currentMonthIST.split('-')[0]) || 2026);

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

  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<'salary' | 'rent'>('salary');
  const [currentEmpIndex, setCurrentEmpIndex] = useState<number>(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // Bottom Sheet for Employee "More Options"
  const [isEmpMoreSheetOpen, setIsEmpMoreSheetOpen] = useState(false);
  const [selectedEmpForMore, setSelectedEmpForMore] = useState<SalaryEmployee | null>(null);

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
      if (safeEmpIndex < activeEmployees.length - 1) {
        setCurrentEmpIndex(safeEmpIndex + 1);
      }
    } else if (diff < -40) {
      if (safeEmpIndex > 0) {
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
  const [rentPayDateInput, setRentPayDateInput] = useState(todayIST);

  const [isAddEmpModalOpen, setIsAddEmpModalOpen] = useState(false);
  const [empNameInput, setEmpNameInput] = useState('');
  const [empRoleInput, setEmpRoleInput] = useState('');
  const [empSalaryInput, setEmpSalaryInput] = useState<number | ''>('');
  const [empEffectiveMonthInput, setEmpEffectiveMonthInput] = useState(selectedMonth);

  // Employee Edit Modal
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
  const [salaryPayDateInput, setSalaryPayDateInput] = useState(todayIST);

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
      })
      .sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
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
        setIsEmpMoreSheetOpen(false);
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

  const handleSelectMonthAndYear = (year: number, monthIdx: number) => {
    const monthStr = String(monthIdx + 1).padStart(2, '0');
    setSelectedMonth(`${year}-${monthStr}`);
    setIsMonthPickerOpen(false);
  };

  const handleJumpToCurrentMonth = () => {
    setSelectedMonth(currentMonthIST);
    showToast(`✓ Opened current month (${formatMonthName(currentMonthIST)})`);
  };

  return (
    <div className="space-y-4 pb-28 max-w-7xl mx-auto px-2 sm:px-4" id="pms_salary_rent_panel">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-semibold animate-fade-in border border-slate-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. TOP NAVIGATION - EXPENSE LEDGER STYLE */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white p-2.5 border border-slate-200/90 rounded-2xl shadow-2xs">
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
          {/* Previous Month */}
          <button
            onClick={() => changeMonth(-1)}
            className="w-9 h-9 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition active:scale-95 flex items-center justify-center shrink-0 cursor-pointer"
            title="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Month Selector Dropdown Trigger */}
          <button
            onClick={() => {
              setPickerYear(Number(selectedMonth.split('-')[0]) || 2026);
              setIsMonthPickerOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 bg-indigo-50/80 hover:bg-indigo-100/80 text-indigo-950 px-4 py-2 rounded-xl border border-indigo-200/80 font-black text-xs sm:text-sm transition cursor-pointer flex-1 sm:flex-none min-h-[36px]"
          >
            <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="uppercase tracking-tight">{formatMonthName(selectedMonth)}</span>
            <ChevronDown className="w-4 h-4 text-indigo-500 shrink-0" />
          </button>

          {/* Next Month */}
          <button
            onClick={() => changeMonth(1)}
            className="w-9 h-9 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition active:scale-95 flex items-center justify-center shrink-0 cursor-pointer"
            title="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Jump to Current Month Button */}
        {selectedMonth !== currentMonthIST && (
          <button
            onClick={handleJumpToCurrentMonth}
            className="w-full sm:w-auto h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Jump to Current Month ({formatMonthName(currentMonthIST)})</span>
          </button>
        )}
      </div>

      {/* 2. SUMMARY CARDS - 2 CARDS PER ROW, EXPENSE LEDGER STYLE */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {/* Card 1: Monthly Rent */}
        <div className="p-3 bg-amber-50/90 border border-amber-200/90 rounded-2xl shadow-2xs space-y-0.5">
          <span className="text-[10px] text-amber-900 font-bold uppercase tracking-wider block">
            Monthly Rent
          </span>
          <div className="text-xl sm:text-2xl font-black text-amber-950 tracking-tight">
            ₹{currentRentCalc.monthlyRent.toLocaleString()}
          </div>
          <span className={`text-[10px] font-bold block ${
            currentRentCalc.remainingBalance > 0 ? 'text-amber-800' : 'text-emerald-700'
          }`}>
            {currentRentCalc.remainingBalance > 0
              ? `Pending ₹${currentRentCalc.remainingBalance.toLocaleString()}`
              : `Paid ₹${currentRentCalc.paidThisMonth.toLocaleString()}`}
          </span>
        </div>

        {/* Card 2: Salary Balance */}
        <div className="p-3 bg-purple-50/90 border border-purple-200/90 rounded-2xl shadow-2xs space-y-0.5">
          <span className="text-[10px] text-purple-900 font-bold uppercase tracking-wider block">
            Salary Balance
          </span>
          <div className="text-xl sm:text-2xl font-black text-purple-950 tracking-tight">
            ₹{salaryAggregates.totalDue.toLocaleString()}
          </div>
          <span className={`text-[10px] font-bold block ${
            salaryAggregates.totalOutstanding > 0 ? 'text-rose-700' : 'text-emerald-700'
          }`}>
            {salaryAggregates.totalOutstanding > 0
              ? `Remaining ₹${salaryAggregates.totalOutstanding.toLocaleString()}`
              : `Fully Paid`}
          </span>
        </div>

        {/* Card 3: Rent Paid Status */}
        <div className="p-3 bg-emerald-50/90 border border-emerald-200/90 rounded-2xl shadow-2xs space-y-0.5">
          <span className="text-[10px] text-emerald-900 font-bold uppercase tracking-wider block">
            Rent Paid
          </span>
          <div className="text-xl sm:text-2xl font-black text-emerald-950 tracking-tight">
            ₹{currentRentCalc.paidThisMonth.toLocaleString()}
          </div>
          <span className="text-[10px] text-emerald-800 font-bold block">
            {currentRentCalc.remainingBalance > 0 ? 'Partial Payment' : '100% Paid'}
          </span>
        </div>

        {/* Card 4: Salary Paid Status */}
        <div className="p-3 bg-indigo-50/90 border border-indigo-200/90 rounded-2xl shadow-2xs space-y-0.5">
          <span className="text-[10px] text-indigo-900 font-bold uppercase tracking-wider block">
            Salary Paid
          </span>
          <div className="text-xl sm:text-2xl font-black text-indigo-950 tracking-tight">
            ₹{salaryAggregates.totalPaid.toLocaleString()}
          </div>
          <span className="text-[10px] text-indigo-800 font-bold block">
            {salaryAggregates.empCount} Staff Profiles
          </span>
        </div>
      </div>

      {/* 3. SEGMENTED CONTROL (SALARY vs RENT TABS) */}
      <div className="bg-slate-200/80 p-1 rounded-2xl flex items-center max-w-sm mx-auto shadow-2xs border border-slate-300/80">
        <button
          type="button"
          onClick={() => setActiveTab('salary')}
          className={`flex-1 py-2 px-4 rounded-xl text-xs sm:text-sm font-black transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'salary'
              ? 'bg-white text-indigo-600 shadow-2xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Salary</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rent')}
          className={`flex-1 py-2 px-4 rounded-xl text-xs sm:text-sm font-black transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'rent'
              ? 'bg-white text-indigo-600 shadow-2xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900'
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
          {/* Employee Navigation Header */}
          {activeEmployees.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-2.5 shadow-2xs flex items-center justify-between gap-2 max-w-lg mx-auto">
              <button
                type="button"
                onClick={() => setCurrentEmpIndex(Math.max(0, safeEmpIndex - 1))}
                disabled={safeEmpIndex === 0}
                className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition active:scale-95 shadow-2xs shrink-0"
                title="Previous Employee"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="text-center truncate px-2 min-w-0 flex-1">
                <span className="text-xs font-black text-slate-900 block truncate">
                  {activeEmployees[safeEmpIndex]?.name || 'Employee'}
                </span>
                <span className="text-[10px] font-bold text-slate-400 block">
                  Employee {safeEmpIndex + 1} of {activeEmployees.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setCurrentEmpIndex(Math.min(activeEmployees.length - 1, safeEmpIndex + 1))}
                disabled={safeEmpIndex >= activeEmployees.length - 1}
                className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition active:scale-95 shadow-2xs shrink-0"
                title="Next Employee"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Employee Card Container with Touch Swipe Support */}
          {activeEmployees.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white max-w-lg mx-auto p-6 space-y-2">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No active employees added yet.</p>
              <p className="text-xs text-slate-400">Tap the "+ Add Employee" button below to create your first employee profile.</p>
            </div>
          ) : (
            <div className="space-y-3 max-w-lg mx-auto">
              {(() => {
                const emp = activeEmployees[safeEmpIndex];
                if (!emp) return null;
                const calc = getEmployeeSalaryCalc(emp, selectedMonth);
                const walletBal = getEmployeeWalletBalance(emp.id);

                return (
                  <div
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-2xs space-y-3 select-none transition-all duration-200"
                  >
                    {/* Header: Name, Active Badge */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <div>
                        <h3 className="font-extrabold text-base text-slate-900 tracking-tight">
                          {emp.name}
                        </h3>
                        {emp.role && (
                          <span className="text-[11px] font-bold text-indigo-600 block">
                            {emp.role}
                          </span>
                        )}
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200/80 rounded-md text-[10px] font-extrabold text-emerald-700 uppercase">
                        ACTIVE
                      </span>
                    </div>

                    {/* Single Clean Breakdown Section (Merged Wallet + Salary) */}
                    <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-3 divide-y divide-slate-200/70 text-xs">
                      {/* Wallet */}
                      <div className="flex items-center justify-between pb-2">
                        <span className="font-bold text-slate-600">Wallet</span>
                        <span className={`font-extrabold text-sm ${walletBal >= 0 ? 'text-indigo-900' : 'text-rose-600'}`}>
                          ₹{walletBal.toLocaleString()}
                        </span>
                      </div>

                      {/* Salary */}
                      <div className="flex items-center justify-between py-2">
                        <span className="font-bold text-slate-600">Salary</span>
                        <span className="font-extrabold text-slate-900 text-sm">
                          ₹{calc.baseSalary.toLocaleString()}
                        </span>
                      </div>

                      {/* Adjustments (if any) */}
                      {(calc.totalBonus > 0 || calc.totalCut > 0) && (
                        <div className="flex items-center justify-between py-1.5 text-[11px] font-semibold text-slate-500">
                          <span>Adjustments</span>
                          <span>
                            {calc.totalBonus > 0 && <span className="text-emerald-600">+{calc.totalBonus} Bonus </span>}
                            {calc.totalCut > 0 && <span className="text-rose-600">-{calc.totalCut} Cut</span>}
                          </span>
                        </div>
                      )}

                      {/* Paid */}
                      <div className="flex items-center justify-between py-2">
                        <span className="font-bold text-slate-600">Paid</span>
                        <span className="font-extrabold text-emerald-700 text-sm">
                          ₹{calc.paidThisMonth.toLocaleString()}
                        </span>
                      </div>

                      {/* Remaining */}
                      <div className="flex items-center justify-between pt-2">
                        <span className="font-extrabold text-slate-800">Remaining</span>
                        <span className={`font-black text-base ${
                          calc.remainingBalance === 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          ₹{calc.remainingBalance.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Compact Action Buttons: Pay & More */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
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

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEmpForMore(emp);
                          setIsEmpMoreSheetOpen(true);
                        }}
                        className="h-10 bg-slate-100 border border-slate-200/90 hover:bg-slate-200 text-slate-800 font-extrabold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                      >
                        <MoreVertical className="w-4 h-4 text-slate-600" />
                        <span>More Options</span>
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Page Dots Indicator */}
              <div className="flex items-center justify-center gap-1.5 pt-1">
                {activeEmployees.map((e, idx) => (
                  <button
                    key={e.id}
                    type="button"
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

          {/* Salary Ledger Statement (Bank Statement Style) */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs mt-4">
            <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  {formatMonthName(selectedMonth)} Salary Ledger
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">Payment statement entries for this period</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const activeEmps = employees.filter((e) => e.isActive);
                  if (activeEmps.length === 0) {
                    alert('Please add an employee first.');
                    return;
                  }
                  const firstEmp = activeEmps[0];
                  const calc = getEmployeeSalaryCalc(firstEmp, selectedMonth);
                  setPayTargetEmp(firstEmp);
                  setSelectedPayEmpId(firstEmp.id);
                  setSalaryPayAmountInput(calc.remainingBalance > 0 ? calc.remainingBalance : '');
                  setSalaryPayRemarksInput('');
                  setIsSalaryPayModalOpen(true);
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Pay Salary</span>
              </button>
            </div>

            {selectedMonthSalaryPayments.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs font-medium">
                No salary payments recorded for {formatMonthName(selectedMonth)}.
              </div>
            ) : (
              <div className="divide-y divide-slate-200/80">
                {selectedMonthSalaryPayments.map((p) => (
                  <div key={p.id} className="p-3.5 hover:bg-slate-50 transition flex items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                        {p.employeeName}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                        <span className="text-indigo-600 font-bold uppercase text-[10px]">{p.paymentMethod}</span>
                        <span>•</span>
                        <span>{formatDateDDMMYYYY(p.paymentDate)}</span>
                      </div>
                      {p.remarks && (
                        <p className="text-[11px] text-slate-500 italic line-clamp-1">{p.remarks}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm sm:text-base font-black text-emerald-700 block">
                        ₹{p.amount.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-bold">Paid</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PAGE 2: RENT TAB */}
      {/* ========================================================= */}
      {activeTab === 'rent' && (
        <div className="space-y-4 animate-fade-in max-w-2xl mx-auto">
          {/* Rent Ledger Header */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                  {formatMonthName(selectedMonth)} Rent Ledger
                </h2>
                <p className="text-xs text-slate-500 font-medium">Property rental status & payments</p>
              </div>

              <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase ${
                currentRentCalc.remainingBalance > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}>
                {currentRentCalc.remainingBalance > 0 ? 'Pending' : 'Paid'}
              </span>
            </div>

            {/* Property Ledger Entry */}
            <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between font-bold text-slate-600 border-b border-slate-200/60 pb-1.5">
                <span>Expected Monthly Rent</span>
                <span className="text-slate-900 font-extrabold text-sm">₹{currentRentCalc.monthlyRent.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-600 border-b border-slate-200/60 pb-1.5">
                <span>Total Received</span>
                <span className="text-emerald-700 font-extrabold text-sm">₹{currentRentCalc.paidThisMonth.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-black text-slate-900 pt-0.5">
                <span>Balance Due</span>
                <span className={`text-base ${currentRentCalc.remainingBalance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  ₹{currentRentCalc.remainingBalance.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Rent Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setRentPayAmountInput(currentRentCalc.remainingBalance > 0 ? currentRentCalc.remainingBalance : '');
                  setRentPayRemarksInput('');
                  setIsRentPaymentModalOpen(true);
                }}
                className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-2xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Receipt className="w-4 h-4" />
                <span>Pay Rent</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setRentAmountInput(currentRentCalc.monthlyRent);
                  setRentEffectiveMonthInput(selectedMonth);
                  setIsEditRentModalOpen(true);
                }}
                className="h-10 bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs rounded-xl border border-slate-200 transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Edit2 className="w-4 h-4 text-slate-600" />
                <span>Update Rent</span>
              </button>
            </div>
          </div>

          {/* Rent Payment History Ledger */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-indigo-600" />
                  Rent Payment Statements
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">History for {formatMonthName(selectedMonth)}</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setRentPayAmountInput(currentRentCalc.remainingBalance > 0 ? currentRentCalc.remainingBalance : '');
                  setRentPayRemarksInput('');
                  setIsRentPaymentModalOpen(true);
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Pay Rent</span>
              </button>
            </div>

            {currentRentCalc.monthPayments.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs font-medium">
                No rent payments recorded for {formatMonthName(selectedMonth)}.
              </div>
            ) : (
              <div className="divide-y divide-slate-200/80">
                {currentRentCalc.monthPayments.map((p) => (
                  <div key={p.id} className="p-3.5 hover:bg-slate-50 transition flex items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-extrabold text-slate-900">
                        Property Rent
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                        <span className="text-indigo-600 font-bold uppercase text-[10px]">{p.paymentMethod}</span>
                        <span>•</span>
                        <span>{formatDateDDMMYYYY(p.paymentDate)}</span>
                      </div>
                      {p.remarks && (
                        <p className="text-[11px] text-slate-500 italic line-clamp-1">{p.remarks}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm sm:text-base font-black text-emerald-700 block">
                        ₹{p.amount.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-bold">Received</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SINGLE FLOATING ACTION BUTTON (FAB) */}
      {/* ========================================================= */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          type="button"
          onClick={() => {
            if (activeTab === 'salary') {
              setEmpNameInput('');
              setEmpRoleInput('');
              setEmpSalaryInput('');
              setEmpEffectiveMonthInput(selectedMonth);
              setIsAddEmpModalOpen(true);
            } else {
              setRentPayAmountInput(currentRentCalc.remainingBalance > 0 ? currentRentCalc.remainingBalance : '');
              setRentPayRemarksInput('');
              setIsRentPaymentModalOpen(true);
            }
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-4 py-3 rounded-full shadow-lg border border-indigo-500/30 flex items-center gap-2 text-xs sm:text-sm active:scale-95 transition-all duration-150 cursor-pointer"
        >
          <Plus className="w-5 h-5 stroke-[3]" />
          <span>{activeTab === 'salary' ? 'Add Employee' : 'Pay Rent'}</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* MODALS & BOTTOM SHEETS */}
      {/* ========================================================= */}

      {/* 1. MONTH PICKER MODAL */}
      {isMonthPickerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                Select Month
              </h3>
              <button
                type="button"
                onClick={() => setIsMonthPickerOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Year Navigator */}
            <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-200 font-bold text-sm">
              <button
                type="button"
                onClick={() => setPickerYear((y) => y - 1)}
                className="p-1.5 bg-white rounded-lg shadow-2xs text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-base text-slate-900 font-black">{pickerYear}</span>
              <button
                type="button"
                onClick={() => setPickerYear((y) => y + 1)}
                className="p-1.5 bg-white rounded-lg shadow-2xs text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Months Grid */}
            <div className="grid grid-cols-3 gap-2">
              {MONTH_NAMES.map((mName, idx) => {
                const isSelected =
                  pickerYear === Number(selectedMonth.split('-')[0]) &&
                  idx === Number(selectedMonth.split('-')[1]) - 1;

                return (
                  <button
                    key={mName}
                    type="button"
                    onClick={() => handleSelectMonthAndYear(pickerYear, idx)}
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-extrabold shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-100'
                    }`}
                  >
                    {mName.substring(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. EMPLOYEE MORE OPTIONS BOTTOM SHEET */}
      {isEmpMoreSheetOpen && selectedEmpForMore && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">{selectedEmpForMore.name}</h3>
                <p className="text-[11px] text-slate-400 font-medium">Employee Management Options</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEmpMoreSheetOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {/* Edit Employee */}
              <button
                type="button"
                onClick={() => {
                  const calc = getEmployeeSalaryCalc(selectedEmpForMore, selectedMonth);
                  setEditingEmp(selectedEmpForMore);
                  setEditEmpNameInput(selectedEmpForMore.name);
                  setEditEmpRoleInput(selectedEmpForMore.role || '');
                  setEditEmpSalaryInput(calc.baseSalary);
                  setEditEmpEffectiveMonthInput(selectedMonth);
                  setIsEmpMoreSheetOpen(false);
                  setIsEditEmpModalOpen(true);
                }}
                className="w-full p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 font-bold text-slate-800 flex items-center gap-2.5 transition cursor-pointer"
              >
                <Edit2 className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Edit Employee Info</span>
              </button>

              {/* Bonus / Cut */}
              <button
                type="button"
                onClick={() => {
                  setAdjTargetEmp(selectedEmpForMore);
                  setAdjType('bonus');
                  setAdjAmountInput('');
                  setAdjRemarksInput('');
                  setIsEmpMoreSheetOpen(false);
                  setIsSalaryAdjModalOpen(true);
                }}
                className="w-full p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 font-bold text-slate-800 flex items-center gap-2.5 transition cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Bonus / Salary Cut</span>
              </button>

              {/* Wallet Adjustment */}
              <button
                type="button"
                onClick={() => {
                  setManualAdjTargetEmp(selectedEmpForMore);
                  setManualAdjAmountInput('');
                  setManualAdjRemarksInput('');
                  setIsEmpMoreSheetOpen(false);
                  setIsManualAdjModalOpen(true);
                }}
                className="w-full p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 font-bold text-slate-800 flex items-center gap-2.5 transition cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4 text-purple-600 shrink-0" />
                <span>Wallet Balance Adjustment</span>
              </button>

              {/* View History */}
              <button
                type="button"
                onClick={() => {
                  setHistoryEmp(selectedEmpForMore);
                  setIsEmpMoreSheetOpen(false);
                  setIsEmpHistoryModalOpen(true);
                }}
                className="w-full p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 font-bold text-slate-800 flex items-center gap-2.5 transition cursor-pointer"
              >
                <History className="w-4 h-4 text-blue-600 shrink-0" />
                <span>View Statement & History</span>
              </button>

              {/* Delete Employee */}
              <button
                type="button"
                onClick={() => handleDeleteEmployee(selectedEmpForMore)}
                className="w-full p-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl font-bold text-rose-700 flex items-center gap-2.5 transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Delete Employee</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. PAY SALARY BOTTOM SHEET MODAL */}
      {isSalaryPayModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-black text-xs text-slate-900 uppercase">
                Pay Salary ({formatMonthName(selectedMonth)})
              </h3>
              <button type="button" onClick={() => setIsSalaryPayModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSalaryPayment} className="p-4 space-y-3 text-xs">
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
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-2xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. EDIT RENT MODAL */}
      {isEditRentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-black text-xs text-slate-900 uppercase">Update Monthly Rent</h3>
              <button type="button" onClick={() => setIsEditRentModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
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
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-2xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Update Rent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. PAY RENT MODAL */}
      {isRentPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-black text-xs text-slate-900 uppercase">Pay Rent ({formatMonthName(selectedMonth)})</h3>
              <button type="button" onClick={() => setIsRentPaymentModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
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
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-2xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Record Rent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. ADD EMPLOYEE MODAL */}
      {isAddEmpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-black text-xs text-slate-900 uppercase">+ Add New Employee</h3>
              <button type="button" onClick={() => setIsAddEmpModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
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
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-2xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. EDIT EMPLOYEE MODAL */}
      {isEditEmpModalOpen && editingEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-black text-xs text-slate-900 uppercase">Edit Employee Details</h3>
              <button type="button" onClick={() => setIsEditEmpModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
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
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-2xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. BONUS / SALARY CUT MODAL */}
      {isSalaryAdjModalOpen && adjTargetEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-black text-xs text-slate-900 uppercase">
                {adjType === 'bonus' ? 'Add Bonus' : 'Salary Cut'} • {adjTargetEmp.name}
              </h3>
              <button type="button" onClick={() => setIsSalaryAdjModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
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
                        ? 'bg-emerald-600 text-white border-emerald-600 font-black'
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
                        ? 'bg-rose-600 text-white border-rose-600 font-black'
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
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-2xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Save Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. MANUAL WALLET ADJUSTMENT MODAL */}
      {isManualAdjModalOpen && manualAdjTargetEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="font-black text-xs text-slate-900 uppercase">
                Wallet Adjustment • {manualAdjTargetEmp.name}
              </h3>
              <button type="button" onClick={() => setIsManualAdjModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualAdjustment} className="p-4 space-y-3.5 text-xs">
              <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between">
                <span className="text-[11px] font-bold text-indigo-900">Current Wallet Balance:</span>
                <span className="font-black text-sm text-indigo-950">
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
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-2xs cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Record Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 10. INDIVIDUAL EMPLOYEE HISTORY MODAL */}
      {isEmpHistoryModalOpen && historyEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div>
                <h3 className="font-black text-xs text-slate-900 uppercase">
                  Employee Ledger & History • {historyEmp.name}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">{historyEmp.role || 'Staff Employee'}</p>
              </div>
              <button type="button" onClick={() => setIsEmpHistoryModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[65vh] overflow-y-auto text-xs">
              {/* Wallet Balance Header */}
              <div className="p-3 bg-indigo-50/90 border border-indigo-100 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-indigo-600" />
                  <span className="font-extrabold text-indigo-900">Current Wallet Balance</span>
                </div>
                <span className="font-black text-base text-indigo-950">
                  ₹{getEmployeeWalletBalance(historyEmp.id).toLocaleString()}
                </span>
              </div>

              {/* Wallet Transactions Ledger */}
              <div className="space-y-2">
                <h4 className="font-black text-[11px] text-slate-500 uppercase tracking-wider">
                  Wallet Transactions Ledger
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
                                <span className={`px-2 py-0.5 rounded-md border text-[9px] font-bold uppercase ${typeColors[wt.transactionType] || 'bg-slate-100 text-slate-700'}`}>
                                  {wt.transactionType.replace('_', ' ')}
                                </span>
                                <span className="font-bold text-slate-800 text-[11px]">{formatMonthName(wt.salaryMonth)}</span>
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">{formatDateDDMMYYYY(wt.createdAt.substring(0, 10))} • {wt.remarks || '-'}</div>
                            </div>
                            <div className="text-right">
                              <div className={`font-black text-sm ${['salary_cut', 'payment'].includes(wt.transactionType) ? 'text-rose-600' : 'text-emerald-700'}`}>
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
                <h4 className="font-black text-[11px] text-slate-500 uppercase tracking-wider">
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
                            <div className="font-bold text-slate-900">{formatMonthName(p.month)}</div>
                            <div className="text-[10px] text-slate-500">{formatDateDDMMYYYY(p.paymentDate)} • {p.remarks || 'Salary Payment'}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-black text-emerald-700 text-sm">₹{p.amount.toLocaleString()}</div>
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
                type="button"
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
