import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  SalaryEmployee,
  SalaryHistory,
  EmployeeSalaryAdjustment,
  SalaryPayment,
  RentSetting,
  RentPayment,
} from '../types';
import { SalaryRentService } from '../services/salaryRent';
import {
  Building2,
  Users,
  Plus,
  DollarSign,
  TrendingUp,
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
  Check,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

export default function SalaryRent() {
  // Main Sub-Tab State
  const [activeTab, setActiveTab] = useState<'rent' | 'salary'>('rent');

  // Selected Month State (YYYY-MM)
  const todayDateStr = new Date().toISOString().substring(0, 10);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    () => new Date().toISOString().substring(0, 7)
  );

  // Raw Services Data State
  const [employees, setEmployees] = useState<SalaryEmployee[]>([]);
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistory[]>([]);
  const [adjustments, setAdjustments] = useState<EmployeeSalaryAdjustment[]>([]);
  const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([]);
  const [rentSettings, setRentSettings] = useState<RentSetting[]>([]);
  const [rentPayments, setRentPayments] = useState<RentPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const [editingEmp, setEditingEmp] = useState<SalaryEmployee | null>(null);
  const [isEditEmpSalaryModalOpen, setIsEditEmpSalaryModalOpen] = useState(false);
  const [newEmpSalaryInput, setNewEmpSalaryInput] = useState<number | ''>('');
  const [newEmpEffectiveMonthInput, setNewEmpEffectiveMonthInput] = useState(selectedMonth);

  const [isEditEmpNameModalOpen, setIsEditEmpNameModalOpen] = useState(false);
  const [editingEmpForName, setEditingEmpForName] = useState<SalaryEmployee | null>(null);
  const [editEmpNameInput, setEditEmpNameInput] = useState('');
  const [editEmpRoleInput, setEditEmpRoleInput] = useState('');

  const [isSalaryAdjModalOpen, setIsSalaryAdjModalOpen] = useState(false);
  const [adjTargetEmp, setAdjTargetEmp] = useState<SalaryEmployee | null>(null);
  const [adjType, setAdjType] = useState<'bonus' | 'cut'>('bonus');
  const [adjAmountInput, setAdjAmountInput] = useState<number | ''>('');
  const [adjRemarksInput, setAdjRemarksInput] = useState('');

  const [isSalaryPayModalOpen, setIsSalaryPayModalOpen] = useState(false);
  const [payTargetEmp, setPayTargetEmp] = useState<SalaryEmployee | null>(null);
  const [salaryPayAmountInput, setSalaryPayAmountInput] = useState<number | ''>('');
  const [salaryPayMethodInput, setSalaryPayMethodInput] = useState<'cash' | 'card' | 'upi' | 'net_banking'>('cash');
  const [salaryPayRemarksInput, setSalaryPayRemarksInput] = useState('');
  const [salaryPayDateInput, setSalaryPayDateInput] = useState(todayDateStr);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refresh All Data from Service
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
    } catch (err) {
      console.error('Error loading salary/rent data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  // Helper: List of last 6 months for history / graphs
  const monthList = useMemo(() => {
    const list: string[] = [];
    const [currY, currM] = selectedMonth.split('-').map(Number);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(currY, currM - 1 - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      list.push(`${y}-${m}`);
    }
    return list;
  }, [selectedMonth]);

  // --- RENT CALCULATIONS FOR SELECTED MONTH (NO CARRY FORWARD) ---
  const getRentDataForMonth = useCallback(
    (targetM: string) => {
      // Find effective rent setting for targetM
      const sortedSets = [...rentSettings]
        .filter((s) => s.effectiveMonth <= targetM)
        .sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth));

      const monthlyRent = sortedSets.length > 0 ? sortedSets[0].monthlyAmount : 160000;

      // Actual Payments recorded specifically in targetM
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

  // --- SALARY CALCULATIONS FOR EMPLOYEES FOR SELECTED MONTH (NO CARRY FORWARD) ---
  const getEmployeeSalaryCalc = useCallback(
    (emp: SalaryEmployee, targetM: string) => {
      // 1. Effective base salary for emp in targetM
      const empHist = salaryHistory
        .filter((h) => h.employeeId === emp.id && h.effectiveMonth <= targetM)
        .sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth));

      const baseSalary = empHist.length > 0 ? empHist[0].baseSalary : emp.baseSalary;

      // 2. Adjustments in targetM
      const monthAdjs = adjustments.filter(
        (a) => a.employeeId === emp.id && a.month === targetM
      );
      const totalBonus = monthAdjs
        .filter((a) => a.type === 'bonus')
        .reduce((sum, a) => sum + a.amount, 0);
      const totalCut = monthAdjs
        .filter((a) => a.type === 'cut')
        .reduce((sum, a) => sum + a.amount, 0);

      // 3. Payments in targetM
      const monthPays = salaryPayments.filter(
        (p) => p.employeeId === emp.id && p.month === targetM
      );
      const paidThisMonth = monthPays.reduce((sum, p) => sum + p.amount, 0);

      const totalDueThisMonth = baseSalary + totalBonus - totalCut;
      const remainingBalance = Math.max(0, totalDueThisMonth - paidThisMonth);

      return {
        baseSalary,
        totalBonus,
        totalCut,
        totalDueThisMonth,
        paidThisMonth,
        remainingBalance,
        monthPays,
        monthAdjs,
      };
    },
    [salaryHistory, adjustments, salaryPayments]
  );

  // Aggregate Salary Totals for Selected Month
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

  // Data for Charts over 6 months
  const chartData = useMemo(() => {
    return monthList.map((m) => {
      const rCalc = getRentDataForMonth(m);

      let sDue = 0;
      let sPaid = 0;
      employees.filter((e) => e.isActive).forEach((emp) => {
        const sc = getEmployeeSalaryCalc(emp, m);
        sDue += sc.totalDueThisMonth;
        sPaid += sc.paidThisMonth;
      });

      const label = new Date(`${m}-01`).toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
      });

      return {
        month: label,
        fullMonth: m,
        rentDue: rCalc.monthlyRent,
        rentPaid: rCalc.paidThisMonth,
        salaryDue: sDue,
        salaryPaid: sPaid,
        totalOutflow: rCalc.paidThisMonth + sPaid,
      };
    });
  }, [monthList, getRentDataForMonth, employees, getEmployeeSalaryCalc]);

  const pieChartData = useMemo(() => {
    return [
      { name: 'Rent Paid', value: currentRentCalc.paidThisMonth, color: '#4f46e5' },
      { name: 'Rent Remaining', value: currentRentCalc.remainingBalance, color: '#f59e0b' },
      { name: 'Salary Paid', value: salaryAggregates.totalPaid, color: '#10b981' },
      { name: 'Salary Remaining', value: salaryAggregates.totalOutstanding, color: '#ef4444' },
    ].filter((d) => d.value > 0);
  }, [currentRentCalc, salaryAggregates]);

  // --- HANDLERS ---
  const handleUpdateRentSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rentAmountInput || Number(rentAmountInput) <= 0) return;
    setIsSubmitting(true);
    try {
      await SalaryRentService.updateRentAmount(Number(rentAmountInput), rentEffectiveMonthInput);
      await loadData();
      setIsEditRentModalOpen(false);
      showToast('✓ Monthly rent updated successfully!');
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
      showToast('✓ Rent payment recorded!');
    } catch (err: any) {
      alert(err.message || 'Failed to record rent payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkRentFullPaid = async () => {
    if (currentRentCalc.remainingBalance <= 0) {
      showToast('✓ Rent for this month is already fully paid!');
      return;
    }
    setIsSubmitting(true);
    try {
      await SalaryRentService.addRentPayment(
        selectedMonth,
        currentRentCalc.remainingBalance,
        'cash',
        'Full Paid',
        todayDateStr
      );
      await loadData();
      showToast(`✓ Rent for ${formatMonthName(selectedMonth)} marked as FULL PAID!`);
    } catch (err: any) {
      alert(err.message || 'Failed to mark rent full paid');
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
      showToast('✓ Employee added successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to add employee');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateEmpSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmp || !newEmpSalaryInput || Number(newEmpSalaryInput) <= 0) return;
    setIsSubmitting(true);
    try {
      await SalaryRentService.updateEmployeeSalary(
        editingEmp.id,
        Number(newEmpSalaryInput),
        newEmpEffectiveMonthInput
      );
      await loadData();
      setIsEditEmpSalaryModalOpen(false);
      setEditingEmp(null);
      showToast('✓ Employee salary updated!');
    } catch (err: any) {
      alert(err.message || 'Failed to update employee salary');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateEmpName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmpForName || !editEmpNameInput.trim()) return;
    setIsSubmitting(true);
    try {
      await SalaryRentService.updateEmployeeName(
        editingEmpForName.id,
        editEmpNameInput.trim(),
        editEmpRoleInput.trim()
      );
      await loadData();
      setIsEditEmpNameModalOpen(false);
      setEditingEmpForName(null);
      showToast('✓ Employee details updated!');
    } catch (err: any) {
      alert(err.message || 'Failed to update employee name');
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
      showToast(`✓ Salary ${adjType} recorded!`);
    } catch (err: any) {
      alert(err.message || 'Failed to record adjustment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddSalaryPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTargetEmp || !salaryPayAmountInput || Number(salaryPayAmountInput) <= 0) return;
    setIsSubmitting(true);
    try {
      await SalaryRentService.addSalaryPayment(
        payTargetEmp.id,
        selectedMonth,
        Number(salaryPayAmountInput),
        salaryPayMethodInput,
        salaryPayRemarksInput,
        salaryPayDateInput
      );
      await loadData();
      setIsSalaryPayModalOpen(false);
      setPayTargetEmp(null);
      setSalaryPayAmountInput('');
      setSalaryPayRemarksInput('');
      showToast('✓ Salary payment recorded!');
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
        showToast('✓ Employee removed successfully!');
      } catch (err) {
        alert('Failed to delete employee');
      }
    }
  };

  // Month navigation helper
  const changeMonth = (offset: number) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + offset, 1);
    const newY = d.getFullYear();
    const newM = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${newY}-${newM}`);
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 relative" id="pms_salary_rent_panel">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-800 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP HEADER & MONTH NAVIGATION BAR */}
      <div className="bg-white p-4 border border-gray-200 rounded-2xl shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
            Salary & Rent Operations
          </h2>
          <p className="text-xs text-gray-500">
            Viewing records for <strong className="text-gray-900">{formatMonthName(selectedMonth)}</strong> only
          </p>
        </div>

        {/* Month Selector Controls */}
        <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200 shrink-0 select-none">
          <button
            onClick={() => changeMonth(-1)}
            className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-800 font-extrabold text-xs rounded-lg border border-gray-200 cursor-pointer transition active:scale-95 flex items-center gap-1"
            title="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev Month</span>
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-lg">
            <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent font-black text-xs text-gray-900 focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={() => changeMonth(1)}
            className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-800 font-extrabold text-xs rounded-lg border border-gray-200 cursor-pointer transition active:scale-95 flex items-center gap-1"
            title="Next Month"
          >
            <span>Next Month</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* OVERALL FINANCIAL HIGHLIGHT CARDS FOR SELECTED MONTH */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Monthly Rent */}
        <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-2xl flex flex-col justify-between shadow-2xs min-h-[80px]">
          <span className="text-[10px] text-indigo-800 font-extrabold uppercase tracking-wider">
            Monthly Rent ({formatMonthName(selectedMonth)})
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg sm:text-xl font-black text-indigo-950 font-mono">
              ₹{currentRentCalc.monthlyRent.toLocaleString()}
            </span>
            <span className="text-[10px] text-indigo-600 font-bold">
              Paid: ₹{currentRentCalc.paidThisMonth.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Rent Remaining */}
        <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-2xl flex flex-col justify-between shadow-2xs min-h-[80px]">
          <span className="text-[10px] text-amber-800 font-extrabold uppercase tracking-wider">Rent Remaining</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg sm:text-xl font-black text-amber-950 font-mono">
              ₹{currentRentCalc.remainingBalance.toLocaleString()}
            </span>
            <span className="text-[10px] font-bold text-amber-700">This Month</span>
          </div>
        </div>

        {/* Total Salary */}
        <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-2xl flex flex-col justify-between shadow-2xs min-h-[80px]">
          <span className="text-[10px] text-emerald-800 font-extrabold uppercase tracking-wider">
            Staff Salaries ({salaryAggregates.empCount})
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg sm:text-xl font-black text-emerald-950 font-mono">
              ₹{salaryAggregates.totalDue.toLocaleString()}
            </span>
            <span className="text-[10px] text-emerald-700 font-bold">
              Paid: ₹{salaryAggregates.totalPaid.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Salary Remaining */}
        <div className="p-3.5 bg-rose-50/60 border border-rose-200 rounded-2xl flex flex-col justify-between shadow-2xs min-h-[80px]">
          <span className="text-[10px] text-rose-800 font-extrabold uppercase tracking-wider">Salary Remaining</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg sm:text-xl font-black text-rose-950 font-mono">
              ₹{salaryAggregates.totalOutstanding.toLocaleString()}
            </span>
            <span className="text-[10px] font-bold text-rose-700">This Month</span>
          </div>
        </div>
      </div>

      {/* DASHBOARD CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Bar Chart: Rent vs Salary */}
        <div className="lg:col-span-2 bg-white p-4 border border-gray-200 rounded-2xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              Monthly Outflow Comparison (Last 6 Months)
            </h3>
          </div>
          <div className="h-56 sm:h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} tickFormatter={(v) => `₹${v/1000}k`} />
                <Tooltip
                  formatter={(value: any) => [`₹${Number(value).toLocaleString()}`, '']}
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                <Bar dataKey="rentPaid" name="Rent Paid" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="salaryPaid" name="Salary Paid" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart: Financial Distribution */}
        <div className="bg-white p-4 border border-gray-200 rounded-2xl shadow-2xs space-y-2 flex flex-col justify-between">
          <div className="border-b border-gray-100 pb-2">
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">
              {formatMonthName(selectedMonth)} Outflow Breakdown
            </h3>
          </div>
          <div className="h-48 sm:h-52 w-full my-auto flex items-center justify-center">
            {pieChartData.length === 0 ? (
              <span className="text-xs font-semibold text-gray-400">No transactions recorded this month</span>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={3}
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: any) => `₹${Number(val).toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px] font-bold border-t border-gray-100 pt-2">
            {pieChartData.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: p.color }} />
                <span className="text-gray-600 truncate">{p.name}:</span>
                <span className="font-mono font-black text-gray-900">₹{(p.value/1000).toFixed(1)}k</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* NAVIGATION SUB-TABS: RENT / SALARY */}
      <div className="bg-white border border-gray-200 rounded-2xl p-1.5 shadow-2xs flex items-center justify-between">
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('rent')}
            className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'rent'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Rent Management</span>
          </button>
          <button
            onClick={() => setActiveTab('salary')}
            className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'salary'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Salary Management ({employees.filter((e) => e.isActive).length})</span>
          </button>
        </div>

        {activeTab === 'salary' && (
          <button
            onClick={() => {
              setEmpNameInput('');
              setEmpRoleInput('');
              setEmpSalaryInput('');
              setEmpEffectiveMonthInput(selectedMonth);
              setIsAddEmpModalOpen(true);
            }}
            className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add Employee</span>
          </button>
        )}
      </div>

      {/* ========================================================= */}
      {/* 1. RENT TAB SECTION */}
      {/* ========================================================= */}
      {activeTab === 'rent' && (
        <div className="space-y-4">
          {/* Main Rent Card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div>
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">
                  Property Rent • {formatMonthName(selectedMonth)}
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-gray-900 font-mono mt-0.5">
                  ₹{currentRentCalc.monthlyRent.toLocaleString()}{' '}
                  <span className="text-xs font-bold text-gray-400 font-sans">/ month</span>
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Pay Button */}
                <button
                  onClick={() => {
                    setRentPayAmountInput(currentRentCalc.remainingBalance > 0 ? currentRentCalc.remainingBalance : '');
                    setRentPayRemarksInput('');
                    setIsRentPaymentModalOpen(true);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5 active:scale-95 min-h-[40px]"
                >
                  <DollarSign className="w-4 h-4 stroke-[3]" />
                  <span>Pay</span>
                </button>

                {/* Full Paid Button */}
                <button
                  onClick={handleMarkRentFullPaid}
                  disabled={currentRentCalc.remainingBalance <= 0 || isSubmitting}
                  className={`px-4 py-2 font-extrabold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 min-h-[40px] ${
                    currentRentCalc.remainingBalance <= 0
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 opacity-80 cursor-default'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                  }`}
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Full Paid</span>
                </button>

                {/* Edit Rent Button */}
                <button
                  onClick={() => {
                    setRentAmountInput(currentRentCalc.monthlyRent);
                    setRentEffectiveMonthInput(selectedMonth);
                    setIsEditRentModalOpen(true);
                  }}
                  className="px-3.5 py-2 bg-white border border-gray-200 text-gray-800 hover:bg-gray-50 font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5 min-h-[40px]"
                >
                  <Edit2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Edit Rent</span>
                </button>
              </div>
            </div>

            {/* Rent Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-150">
                <span className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Monthly Rent</span>
                <span className="text-lg font-black text-slate-900 font-mono">₹{currentRentCalc.monthlyRent.toLocaleString()}</span>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-150">
                <span className="text-[10px] font-bold text-emerald-800 uppercase block mb-0.5">Paid This Month</span>
                <span className="text-lg font-black text-emerald-950 font-mono">₹{currentRentCalc.paidThisMonth.toLocaleString()}</span>
              </div>

              <div className={`p-3 rounded-xl border ${
                currentRentCalc.remainingBalance === 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                <span className="text-[10px] font-bold uppercase block mb-0.5">Remaining This Month</span>
                <span className="text-lg font-black font-mono">₹{currentRentCalc.remainingBalance.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Rent Payment History Table for Selected Month */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-4 h-4 text-indigo-600" />
                Rent Payments for {formatMonthName(selectedMonth)} ({currentRentCalc.monthPayments.length})
              </h3>
            </div>

            {currentRentCalc.monthPayments.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs font-semibold">
                No rent payments recorded for {formatMonthName(selectedMonth)}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-gray-50 text-gray-400 font-mono text-[10px] uppercase">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4 text-right">Amount (₹)</th>
                      <th className="py-3 px-4">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                    {currentRentCalc.monthPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50/80">
                        <td className="py-3 px-4 font-mono font-bold text-gray-600">{p.paymentDate}</td>
                        <td className="py-3 px-4 uppercase font-bold text-indigo-700">{p.paymentMethod}</td>
                        <td className="py-3 px-4 text-right font-mono font-black text-emerald-700">₹{p.amount.toLocaleString()}</td>
                        <td className="py-3 px-4 text-gray-600">{p.remarks || '-'}</td>
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
      {/* 2. SALARY TAB SECTION */}
      {/* ========================================================= */}
      {activeTab === 'salary' && (
        <div className="space-y-4">
          {/* Mobile Add Employee Button */}
          <div className="sm:hidden flex justify-end">
            <button
              onClick={() => {
                setEmpNameInput('');
                setEmpRoleInput('');
                setEmpSalaryInput('');
                setEmpEffectiveMonthInput(selectedMonth);
                setIsAddEmpModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-3 bg-emerald-600 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add New Employee</span>
            </button>
          </div>

          {/* Employee Cards List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {employees.filter((e) => e.isActive).length === 0 ? (
              <div className="col-span-full bg-white p-8 border border-gray-200 rounded-2xl text-center text-gray-400 text-xs font-semibold">
                No active staff employees found. Click "Add Employee" to create one.
              </div>
            ) : (
              employees
                .filter((e) => e.isActive)
                .map((emp) => {
                  const calc = getEmployeeSalaryCalc(emp, selectedMonth);

                  return (
                    <div
                      key={emp.id}
                      className="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs space-y-3 flex flex-col justify-between"
                    >
                      <div>
                        {/* Name and Role */}
                        <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-3">
                          <div>
                            <h4 className="font-black text-base text-gray-900 tracking-tight">{emp.name}</h4>
                            {emp.role && (
                              <span className="text-[10px] font-bold text-gray-400 uppercase block">{emp.role}</span>
                            )}
                          </div>
                          <div className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded-lg text-[10px] font-extrabold text-indigo-700 font-mono">
                            Staff
                          </div>
                        </div>

                        {/* Financial Details */}
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center justify-between p-2 bg-slate-50 rounded-xl">
                            <span className="font-extrabold text-slate-500 uppercase text-[10px]">Monthly Salary</span>
                            <span className="font-mono font-black text-slate-900 text-sm">₹{calc.baseSalary.toLocaleString()}</span>
                          </div>

                          {(calc.totalBonus > 0 || calc.totalCut > 0) && (
                            <div className="flex items-center justify-between px-2 text-[10px] font-bold">
                              <span className="text-gray-400">Monthly Adjustments:</span>
                              <span className="font-mono">
                                {calc.totalBonus > 0 && <span className="text-emerald-600">+{calc.totalBonus} Bonus </span>}
                                {calc.totalCut > 0 && <span className="text-rose-600">-{calc.totalCut} Cut</span>}
                              </span>
                            </div>
                          )}

                          <div className="flex items-center justify-between p-2 bg-emerald-50 rounded-xl border border-emerald-100">
                            <span className="font-extrabold text-emerald-800 uppercase text-[10px]">Paid This Month</span>
                            <span className="font-mono font-black text-emerald-950 text-sm">₹{calc.paidThisMonth.toLocaleString()}</span>
                          </div>

                          <div className={`flex items-center justify-between p-2 rounded-xl border ${
                            calc.remainingBalance === 0
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              : 'bg-rose-50 border-rose-200 text-rose-900'
                          }`}>
                            <span className="font-extrabold uppercase text-[10px]">Remaining This Month</span>
                            <span className="font-mono font-black text-sm">₹{calc.remainingBalance.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-2 border-t border-gray-100 space-y-1.5">
                        <div className="grid grid-cols-3 gap-1.5">
                          {/* Pay */}
                          <button
                            onClick={() => {
                              setPayTargetEmp(emp);
                              setSalaryPayAmountInput(calc.remainingBalance > 0 ? calc.remainingBalance : '');
                              setSalaryPayRemarksInput('');
                              setIsSalaryPayModalOpen(true);
                            }}
                            className="px-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-2xs transition cursor-pointer flex items-center justify-center gap-1 active:scale-95"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Pay</span>
                          </button>

                          {/* Salary Cut */}
                          <button
                            onClick={() => {
                              setAdjTargetEmp(emp);
                              setAdjType('cut');
                              setAdjAmountInput('');
                              setAdjRemarksInput('');
                              setIsSalaryAdjModalOpen(true);
                            }}
                            className="px-2 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] rounded-xl transition cursor-pointer flex items-center justify-center gap-1 active:scale-95"
                          >
                            <MinusCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>Salary Cut</span>
                          </button>

                          {/* Bonus */}
                          <button
                            onClick={() => {
                              setAdjTargetEmp(emp);
                              setAdjType('bonus');
                              setAdjAmountInput('');
                              setAdjRemarksInput('');
                              setIsSalaryAdjModalOpen(true);
                            }}
                            className="px-2 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[11px] rounded-xl transition cursor-pointer flex items-center justify-center gap-1 active:scale-95"
                          >
                            <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Bonus</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                          {/* Edit Salary */}
                          <button
                            onClick={() => {
                              setEditingEmp(emp);
                              setNewEmpSalaryInput(calc.baseSalary);
                              setNewEmpEffectiveMonthInput(selectedMonth);
                              setIsEditEmpSalaryModalOpen(true);
                            }}
                            className="px-2 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Edit2 className="w-3 h-3 text-indigo-600" />
                            <span>Edit Salary</span>
                          </button>

                          {/* Edit Name */}
                          <button
                            onClick={() => {
                              setEditingEmpForName(emp);
                              setEditEmpNameInput(emp.name);
                              setEditEmpRoleInput(emp.role || '');
                              setIsEditEmpNameModalOpen(true);
                            }}
                            className="px-2 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Edit2 className="w-3 h-3 text-emerald-600" />
                            <span>Edit Name</span>
                          </button>

                          {/* Delete Employee */}
                          <button
                            onClick={() => handleDeleteEmployee(emp)}
                            className="px-2 py-1.5 bg-gray-50 hover:bg-rose-50 text-rose-600 border border-gray-200 hover:border-rose-200 font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Trash2 className="w-3 h-3 text-rose-500" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
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
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-extrabold text-xs text-gray-900 uppercase">Edit Monthly Rent Amount</h3>
              <button onClick={() => setIsEditRentModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateRentSetting} className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">New Monthly Rent (₹)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={rentAmountInput}
                  onChange={(e) => setRentAmountInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Apply From Month</label>
                <input
                  type="month"
                  required
                  value={rentEffectiveMonthInput}
                  onChange={(e) => setRentEffectiveMonthInput(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditRentModalOpen(false)}
                  className="flex-1 py-2.5 border border-gray-200 font-bold text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md cursor-pointer min-h-[42px]"
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
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-extrabold text-xs text-gray-900 uppercase">Pay Rent ({formatMonthName(selectedMonth)})</h3>
              <button onClick={() => setIsRentPaymentModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddRentPayment} className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Payment Date</label>
                <input
                  type="date"
                  required
                  value={rentPayDateInput}
                  onChange={(e) => setRentPayDateInput(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Amount Paid (₹)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={rentPayAmountInput}
                  onChange={(e) => setRentPayAmountInput(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 50000"
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Payment Method</label>
                <select
                  value={rentPayMethodInput}
                  onChange={(e) => setRentPayMethodInput(e.target.value as any)}
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px] cursor-pointer"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="net_banking">Net Banking</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Notes / Remarks</label>
                <input
                  type="text"
                  value={rentPayRemarksInput}
                  onChange={(e) => setRentPayRemarksInput(e.target.value)}
                  placeholder="e.g. Rent payment"
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRentPaymentModalOpen(false)}
                  className="flex-1 py-2.5 border border-gray-200 font-bold text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. ADD EMPLOYEE MODAL */}
      {isAddEmpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-extrabold text-xs text-gray-900 uppercase">Add New Staff Employee</h3>
              <button onClick={() => setIsAddEmpModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddEmployee} className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Employee Name *</label>
                <input
                  type="text"
                  required
                  value={empNameInput}
                  onChange={(e) => setEmpNameInput(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Role / Designation</label>
                <input
                  type="text"
                  value={empRoleInput}
                  onChange={(e) => setEmpRoleInput(e.target.value)}
                  placeholder="e.g. Front Desk, Housekeeping, Chef"
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Base Monthly Salary (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={empSalaryInput}
                  onChange={(e) => setEmpSalaryInput(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 35000"
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Effective Month</label>
                <input
                  type="month"
                  required
                  value={empEffectiveMonthInput}
                  onChange={(e) => setEmpEffectiveMonthInput(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddEmpModalOpen(false)}
                  className="flex-1 py-2.5 border border-gray-200 font-bold text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-md cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Add Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. EDIT EMPLOYEE SALARY RATE MODAL */}
      {isEditEmpSalaryModalOpen && editingEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-extrabold text-xs text-gray-900 uppercase">Edit Salary for {editingEmp.name}</h3>
              <button onClick={() => setIsEditEmpSalaryModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateEmpSalary} className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">New Base Salary (₹)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={newEmpSalaryInput}
                  onChange={(e) => setNewEmpSalaryInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Apply From Month</label>
                <input
                  type="month"
                  required
                  value={newEmpEffectiveMonthInput}
                  onChange={(e) => setNewEmpEffectiveMonthInput(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditEmpSalaryModalOpen(false)}
                  className="flex-1 py-2.5 border border-gray-200 font-bold text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Update Rate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. EDIT EMPLOYEE NAME / ROLE MODAL */}
      {isEditEmpNameModalOpen && editingEmpForName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-extrabold text-xs text-gray-900 uppercase">Edit Employee Details</h3>
              <button onClick={() => setIsEditEmpNameModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateEmpName} className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Employee Name *</label>
                <input
                  type="text"
                  required
                  value={editEmpNameInput}
                  onChange={(e) => setEditEmpNameInput(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Role / Designation</label>
                <input
                  type="text"
                  value={editEmpRoleInput}
                  onChange={(e) => setEditEmpRoleInput(e.target.value)}
                  placeholder="e.g. Senior Chef, Front Desk Manager"
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditEmpNameModalOpen(false)}
                  className="flex-1 py-2.5 border border-gray-200 font-bold text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-md cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Save Name'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. SALARY BONUS / CUT MODAL */}
      {isSalaryAdjModalOpen && adjTargetEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-extrabold text-xs text-gray-900 uppercase">
                {adjType === 'bonus' ? 'Add Bonus' : 'Salary Cut'} • {adjTargetEmp.name} ({formatMonthName(selectedMonth)})
              </h3>
              <button onClick={() => setIsSalaryAdjModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddAdjustment} className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Adjustment Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjType('bonus')}
                    className={`py-2 rounded-xl font-bold border transition cursor-pointer ${
                      adjType === 'bonus'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-gray-50 text-gray-700 border-gray-200'
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
                        : 'bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    - Salary Cut
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={adjAmountInput}
                  onChange={(e) => setAdjAmountInput(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 2000"
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Reason / Notes</label>
                <input
                  type="text"
                  value={adjRemarksInput}
                  onChange={(e) => setAdjRemarksInput(e.target.value)}
                  placeholder="e.g. Festival bonus / Uninformed leave cut"
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSalaryAdjModalOpen(false)}
                  className="flex-1 py-2.5 border border-gray-200 font-bold text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Save Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. PAY SALARY MODAL */}
      {isSalaryPayModalOpen && payTargetEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm my-auto overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-extrabold text-xs text-gray-900 uppercase">
                Pay Salary • {payTargetEmp.name} ({formatMonthName(selectedMonth)})
              </h3>
              <button onClick={() => setIsSalaryPayModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSalaryPayment} className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Payment Date</label>
                <input
                  type="date"
                  required
                  value={salaryPayDateInput}
                  onChange={(e) => setSalaryPayDateInput(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Amount Paid (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={salaryPayAmountInput}
                  onChange={(e) => setSalaryPayAmountInput(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 15000"
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Payment Method</label>
                <select
                  value={salaryPayMethodInput}
                  onChange={(e) => setSalaryPayMethodInput(e.target.value as any)}
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 min-h-[44px] cursor-pointer"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="net_banking">Net Banking</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-500 uppercase block mb-1">Notes / Remarks</label>
                <input
                  type="text"
                  value={salaryPayRemarksInput}
                  onChange={(e) => setSalaryPayRemarksInput(e.target.value)}
                  placeholder="e.g. Advance payment / Full settlement"
                  className="w-full rounded-xl border border-gray-200 p-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSalaryPayModalOpen(false)}
                  className="flex-1 py-2.5 border border-gray-200 font-bold text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer min-h-[42px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md cursor-pointer min-h-[42px]"
                >
                  {isSubmitting ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
