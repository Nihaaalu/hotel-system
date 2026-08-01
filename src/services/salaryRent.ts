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
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { ExpenseService } from './expenses';
import { getISTDateStr, getISTMonthStr } from '../utils/formatters';

export const SalaryRentService = {
  // --- WALLET METHODS ---
  async getWalletBalances(): Promise<EmployeeWalletBalance[]> {
    return [];
  },

  async getWalletTransactions(_employeeId?: string): Promise<EmployeeWalletTransaction[]> {
    return [];
  },

  async recordWalletTransaction(_tx: any): Promise<void> {
    // No-op
  },

  async addManualAdjustment(
    _employeeId: string,
    _month: string,
    _amount: number,
    _remarks: string
  ): Promise<void> {
    // No-op
  },

  // --- EMPLOYEES ---
  async getEmployees(): Promise<SalaryEmployee[]> {
    if (!isSupabaseConfigured) return [];

    try {
      const { data, error } = await supabase
        .from('salary_employees')
        .select('*')
        .order('id', { ascending: true });

      if (error || !data) return [];

      return data
        .filter((e: any) => e.is_active !== false)
        .map((e: any) => ({
          id: String(e.id),
          name: String(e.employee_name || e.name || 'Employee'),
          role: String(e.role || ''),
          baseSalary: Number(e.monthly_salary || 0),
          effectiveMonth: '2026-07',
          isActive: Boolean(e.is_active !== false),
          createdAt: String(e.created_at || new Date().toISOString()),
        }));
    } catch (err) {
      console.error('Error fetching salary_employees:', err);
      return [];
    }
  },

  async addEmployee(
    name: string,
    role: string,
    baseSalary: number,
    effectiveMonth: string
  ): Promise<SalaryEmployee> {
    const monthStr = effectiveMonth || getISTMonthStr();
    const payload = {
      employee_name: name.trim(),
      monthly_salary: Number(baseSalary || 0),
      is_active: true,
    };

    const { data, error } = await supabase
      .from('salary_employees')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error adding employee to Supabase:', error);
      throw new Error(error.message || 'Failed to add employee to Supabase');
    }

    const empId = String(data.id);

    return {
      id: empId,
      name: String(data.employee_name || name.trim()),
      role: role.trim(),
      baseSalary: Number(data.monthly_salary || baseSalary),
      effectiveMonth: monthStr,
      isActive: true,
      createdAt: String(data.created_at || new Date().toISOString()),
    };
  },

  async updateEmployeeName(id: string, name: string, _role?: string): Promise<void> {
    const numId = Number(id);
    const targetId = !isNaN(numId) ? numId : id;

    const { error } = await supabase
      .from('salary_employees')
      .update({ employee_name: name.trim() })
      .eq('id', targetId);

    if (error) {
      console.error('Error updating employee name:', error);
      throw new Error(error.message || 'Failed to update employee name');
    }
  },

  async updateEmployeeSalary(id: string, newBaseSalary: number, _effectiveMonth: string): Promise<void> {
    const numId = Number(id);
    const targetId = !isNaN(numId) ? numId : id;

    const { error } = await supabase
      .from('salary_employees')
      .update({
        monthly_salary: Number(newBaseSalary),
      })
      .eq('id', targetId);

    if (error) {
      console.error('Error updating employee salary:', error);
      throw new Error(error.message || 'Failed to update employee salary');
    }
  },

  async deleteEmployee(id: string): Promise<void> {
    const numId = Number(id);
    const targetId = !isNaN(numId) ? numId : id;

    const { error } = await supabase
      .from('salary_employees')
      .update({ is_active: false })
      .eq('id', targetId);

    if (error) {
      await supabase.from('salary_employees').delete().eq('id', targetId);
    }
  },

  // --- SALARY ADJUSTMENTS (Bonus / Cut) ---
  async addSalaryAdjustment(
    employeeId: string,
    month: string,
    type: 'bonus' | 'cut',
    amount: number,
    remarks: string
  ): Promise<EmployeeSalaryAdjustment> {
    const adjAmount = Number(amount || 0);
    const cleanRemarks = remarks.trim();

    // Log as an expense in inventory_expenses if bonus so analytics registers it
    if (type === 'bonus' && adjAmount > 0) {
      await ExpenseService.addExpense({
        category: 'Salary',
        itemName: `Bonus Payment`,
        amount: adjAmount,
        expenseDate: getISTDateStr(),
        remarks: cleanRemarks || `Bonus for ${month}`,
      }).catch((e) => console.warn('Could not auto-log expense for bonus:', e));
    }

    return {
      id: `adj_${Date.now()}`,
      employeeId,
      month,
      type,
      amount: adjAmount,
      remarks: cleanRemarks,
      createdAt: new Date().toISOString(),
    };
  },

  // --- SALARY PAYMENTS ---
  async addSalaryPayment(
    employeeId: string,
    month: string,
    amount: number,
    paymentMethod: 'cash' | 'card' | 'upi' | 'net_banking',
    remarks: string,
    paymentDate: string,
    paidBy: 'resort' | 'irshad' = 'resort'
  ): Promise<SalaryPayment> {
    const payAmount = Number(amount || 0);
    const pDate = paymentDate || getISTDateStr();
    const cleanRemarks = remarks.trim();
    const targetEmpId = !isNaN(Number(employeeId)) ? Number(employeeId) : employeeId;

    const payload = {
      employee_id: targetEmpId,
      payment_date: pDate,
      amount: payAmount,
      paid_by: paidBy || 'resort',
      remarks: cleanRemarks || 'Salary Payment',
    };

    const { data: newTx, error: insErr } = await supabase
      .from('salary_transactions')
      .insert(payload)
      .select()
      .single();

    if (insErr) {
      console.error('Error inserting salary_transaction:', insErr);
      throw new Error(insErr.message || 'Failed to record salary transaction');
    }

    const txId = String(newTx.id);

    // Auto-log into inventory_expenses as Salary expense for Analytics
    await ExpenseService.addExpense({
      category: 'Salary',
      itemName: 'Staff Salary',
      amount: payAmount,
      expenseDate: pDate,
      paidBy: paidBy,
      remarks: cleanRemarks || `Salary Payment for ${month}`,
    }).catch((e) => console.warn('Could not auto-log inventory expense for salary:', e));

    return {
      id: txId,
      employeeId,
      month,
      amount: payAmount,
      paymentMethod,
      remarks: cleanRemarks,
      paymentDate: pDate,
      createdAt: new Date().toISOString(),
    };
  },

  // --- RENT SETTINGS ---
  async updateRentAmount(monthlyAmount: number, effectiveMonth: string): Promise<RentSetting> {
    const monthStr = effectiveMonth || getISTMonthStr();
    return {
      id: `rent_${Date.now()}`,
      monthlyAmount: Number(monthlyAmount || 0),
      effectiveMonth: monthStr,
      createdAt: new Date().toISOString(),
    };
  },

  // --- RENT PAYMENTS ---
  async addRentPayment(
    month: string,
    amount: number,
    paymentMethod: 'cash' | 'card' | 'upi' | 'net_banking',
    remarks: string,
    paymentDate: string,
    paidBy: 'resort' | 'irshad' = 'resort'
  ): Promise<RentPayment> {
    const payAmount = Number(amount || 0);
    const pDate = paymentDate || getISTDateStr();
    const cleanRemarks = remarks.trim();

    const payload = {
      payment_date: pDate,
      amount: payAmount,
      paid_by: paidBy || 'resort',
      remarks: cleanRemarks || 'Rent Payment',
    };

    const { data: newRt, error: insErr } = await supabase
      .from('rent_transactions')
      .insert(payload)
      .select()
      .single();

    if (insErr) {
      console.error('Error inserting rent_transaction:', insErr);
      throw new Error(insErr.message || 'Failed to record rent transaction');
    }

    const rtId = String(newRt.id);

    // Auto-log into inventory_expenses as Rent expense for Analytics
    await ExpenseService.addExpense({
      category: 'Rent',
      itemName: 'Monthly Rent',
      amount: payAmount,
      expenseDate: pDate,
      paidBy: paidBy,
      remarks: cleanRemarks || `Rent Payment for ${month}`,
    }).catch((e) => console.warn('Could not auto-log inventory expense for rent:', e));

    return {
      id: rtId,
      month,
      amount: payAmount,
      paymentMethod,
      remarks: cleanRemarks,
      paymentDate: pDate,
      createdAt: new Date().toISOString(),
    };
  },

  // --- FETCH ALL DATA FROM SUPABASE ---
  async fetchAllData() {
    if (!isSupabaseConfigured) {
      return {
        employees: [],
        salaryHistory: [],
        salaryAdjustments: [],
        salaryPayments: [],
        rentSettings: [],
        rentPayments: [],
        walletBalances: [],
        walletTransactions: [],
      };
    }

    try {
      const [eRes, stRes, rtRes] = await Promise.all([
        supabase.from('salary_employees').select('*').order('id', { ascending: true }),
        supabase.from('salary_transactions').select('*').order('created_at', { ascending: true }),
        supabase.from('rent_transactions').select('*').order('created_at', { ascending: true }),
      ]);

      const employees: SalaryEmployee[] = [];
      const salaryHistory: SalaryHistory[] = [];

      if (eRes.data) {
        eRes.data
          .filter((e: any) => e.is_active !== false)
          .forEach((e: any) => {
            const empId = String(e.id);
            const name = String(e.employee_name || e.name || 'Employee');
            const role = String(e.role || '');
            const baseSalary = Number(e.monthly_salary || 0);

            employees.push({
              id: empId,
              name,
              role,
              baseSalary,
              effectiveMonth: '2026-07',
              isActive: true,
              createdAt: String(e.created_at || new Date().toISOString()),
            });

            salaryHistory.push({
              id: `sh_${empId}`,
              employeeId: empId,
              baseSalary,
              effectiveMonth: '2026-07',
              createdAt: String(e.created_at || new Date().toISOString()),
            });
          });
      }

      const salaryPayments: SalaryPayment[] = [];
      const salaryAdjustments: EmployeeSalaryAdjustment[] = [];

      if (stRes.data) {
        stRes.data.forEach((st: any) => {
          const empId = String(st.employee_id);
          const pDate = String(st.payment_date || st.created_at || '').substring(0, 10);
          const mStr = pDate.substring(0, 7) || '2026-07';
          const paidAmt = Number(st.amount || st.paid_amount || 0);
          const remarks = String(st.remarks || '');
          const createdAt = String(st.created_at || new Date().toISOString());

          if (paidAmt > 0) {
            salaryPayments.push({
              id: String(st.id),
              employeeId: empId,
              month: mStr,
              amount: paidAmt,
              paymentMethod: 'cash',
              remarks,
              paymentDate: pDate,
              createdAt,
            });
          }
        });
      }

      const rentSettings: RentSetting[] = [];
      const rentPayments: RentPayment[] = [];
      if (rtRes.data) {
        rtRes.data.forEach((rt: any) => {
          const paidAmt = Number(rt.amount || rt.paid_amount || 0);
          if (paidAmt > 0) {
            const pDate = String(rt.payment_date || rt.created_at || '').substring(0, 10);
            const mStr = pDate.substring(0, 7) || '2026-07';
            const createdAt = String(rt.created_at || new Date().toISOString());
            rentPayments.push({
              id: String(rt.id),
              month: mStr,
              amount: paidAmt,
              paymentMethod: 'cash',
              remarks: String(rt.remarks || ''),
              paymentDate: pDate,
              createdAt,
            });
          }
        });
      }

      return {
        employees,
        salaryHistory,
        salaryAdjustments,
        salaryPayments,
        rentSettings,
        rentPayments,
        walletBalances: [],
        walletTransactions: [],
      };
    } catch (err) {
      console.error('Error fetching all salary/rent data from Supabase:', err);
      return {
        employees: [],
        salaryHistory: [],
        salaryAdjustments: [],
        salaryPayments: [],
        rentSettings: [],
        rentPayments: [],
        walletBalances: [],
        walletTransactions: [],
      };
    }
  },
};
