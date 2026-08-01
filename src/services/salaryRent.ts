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
    if (!isSupabaseConfigured) return [];
    try {
      const { data, error } = await supabase
        .from('employee_wallet_balance')
        .select('*');

      if (error) {
        console.warn('Could not query employee_wallet_balance view:', error);
        // Fallback calculation directly from employee_wallet_transactions
        const { data: txs } = await supabase
          .from('employee_wallet_transactions')
          .select('*');
        if (!txs) return [];

        const map = new Map<string, number>();
        txs.forEach((t: any) => {
          const empId = String(t.employee_id);
          const type = String(t.transaction_type || '');
          const amt = Number(t.amount || 0);
          const curr = map.get(empId) || 0;
          if (type === 'monthly_salary' || type === 'bonus' || type === 'manual_adjustment') {
            map.set(empId, curr + amt);
          } else if (type === 'salary_cut' || type === 'payment') {
            map.set(empId, curr - amt);
          }
        });
        return Array.from(map.entries()).map(([employeeId, walletBalance]) => ({
          employeeId,
          walletBalance,
        }));
      }

      if (!data) return [];
      return data.map((b: any) => ({
        employeeId: String(b.employee_id),
        walletBalance: Number(b.wallet_balance || 0),
      }));
    } catch (err) {
      console.error('Error in getWalletBalances:', err);
      return [];
    }
  },

  async getWalletTransactions(employeeId?: string): Promise<EmployeeWalletTransaction[]> {
    if (!isSupabaseConfigured) return [];
    try {
      let query = supabase
        .from('employee_wallet_transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (employeeId) {
        const targetEmpId = !isNaN(Number(employeeId)) ? Number(employeeId) : employeeId;
        query = query.eq('employee_id', targetEmpId);
      }

      const { data, error } = await query;
      if (error || !data) return [];

      return data.map((t: any) => ({
        id: String(t.id),
        employeeId: String(t.employee_id),
        salaryMonth: String(t.salary_month || '').substring(0, 7),
        transactionType: t.transaction_type as any,
        amount: Number(t.amount || 0),
        paymentMethod: String(t.payment_method || ''),
        remarks: String(t.remarks || ''),
        createdAt: String(t.created_at || ''),
      }));
    } catch (err) {
      console.error('Error in getWalletTransactions:', err);
      return [];
    }
  },

  async recordWalletTransaction(tx: {
    employeeId: string;
    salaryMonth: string;
    transactionType: 'monthly_salary' | 'bonus' | 'salary_cut' | 'payment' | 'manual_adjustment';
    amount: number;
    paymentMethod?: string;
    remarks?: string;
  }): Promise<void> {
    if (!isSupabaseConfigured) return;

    const targetEmpId = !isNaN(Number(tx.employeeId)) ? Number(tx.employeeId) : tx.employeeId;
    const monthStr = tx.salaryMonth ? tx.salaryMonth.substring(0, 7) : getISTMonthStr();
    const salaryMonth = `${monthStr}-01`;

    const payload = {
      employee_id: targetEmpId,
      salary_month: salaryMonth,
      transaction_type: tx.transactionType,
      amount: Number(tx.amount || 0),
      payment_method: tx.paymentMethod || '',
      remarks: tx.remarks || '',
    };

    const { error } = await supabase
      .from('employee_wallet_transactions')
      .insert(payload);

    if (error) {
      console.error('Error inserting employee_wallet_transaction:', error);
      throw new Error(error.message || 'Failed to record wallet transaction');
    }
  },

  async addManualAdjustment(
    employeeId: string,
    month: string,
    amount: number,
    remarks: string
  ): Promise<void> {
    await this.recordWalletTransaction({
      employeeId,
      salaryMonth: month,
      transactionType: 'manual_adjustment',
      amount: Number(amount || 0),
      remarks: remarks.trim() || 'Manual Adjustment',
    });
  },

  // --- EMPLOYEES ---
  async getEmployees(): Promise<SalaryEmployee[]> {
    if (!isSupabaseConfigured) return [];

    try {
      const { data, error } = await supabase
        .from('salary_employees')
        .select('*')
        .order('created_at', { ascending: true });

      if (error || !data) return [];

      return data
        .filter((e: any) => e.is_active !== false)
        .map((e: any) => ({
          id: String(e.id),
          name: String(e.employee_name || e.name || 'Employee'),
          role: String(e.role || ''),
          baseSalary: Number(e.monthly_salary || e.base_salary || 0),
          effectiveMonth: String(e.effective_from || e.effective_month || '').substring(0, 7) || '2026-07',
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
    const effectiveFrom = `${monthStr}-01`;
    const payload = {
      employee_name: name.trim(),
      monthly_salary: Number(baseSalary || 0),
      is_active: true,
      effective_from: effectiveFrom,
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

    // Record initial monthly_salary transaction in employee_wallet_transactions
    if (baseSalary > 0) {
      await this.recordWalletTransaction({
        employeeId: empId,
        salaryMonth: monthStr,
        transactionType: 'monthly_salary',
        amount: Number(baseSalary),
        remarks: `Initial Monthly Salary for ${monthStr}`,
      }).catch((err) => console.warn('Could not record initial monthly_salary:', err));
    }

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

  async updateEmployeeSalary(id: string, newBaseSalary: number, effectiveMonth: string): Promise<void> {
    const monthStr = effectiveMonth || getISTMonthStr();
    const effectiveFrom = `${monthStr}-01`;
    const numId = Number(id);
    const targetId = !isNaN(numId) ? numId : id;

    const { error } = await supabase
      .from('salary_employees')
      .update({
        monthly_salary: Number(newBaseSalary),
        effective_from: effectiveFrom,
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
    const salaryMonth = `${month}-01`;
    const adjAmount = Number(amount || 0);
    const cleanRemarks = remarks.trim();
    const targetEmpId = !isNaN(Number(employeeId)) ? Number(employeeId) : employeeId;

    // Fetch employee details
    const { data: empData } = await supabase
      .from('salary_employees')
      .select('*')
      .eq('id', targetEmpId)
      .maybeSingle();

    const empName = empData ? (empData.employee_name || empData.name || 'Employee') : 'Employee';
    const monthlySalary = empData ? Number(empData.monthly_salary || 0) : 0;

    // Check existing transaction
    const { data: existingTx } = await supabase
      .from('salary_transactions')
      .select('*')
      .eq('employee_id', targetEmpId)
      .eq('salary_month', salaryMonth)
      .maybeSingle();

    if (existingTx) {
      const newBonus = type === 'bonus' ? Number(existingTx.bonus || 0) + adjAmount : Number(existingTx.bonus || 0);
      const newCut = type === 'cut' ? Number(existingTx.salary_cut || 0) + adjAmount : Number(existingTx.salary_cut || 0);
      const updatedRemarks = cleanRemarks
        ? (existingTx.remarks ? `${existingTx.remarks}; ${type === 'bonus' ? 'Bonus' : 'Cut'}: ${cleanRemarks}` : cleanRemarks)
        : (existingTx.remarks || `${type === 'bonus' ? 'Bonus' : 'Salary Cut'}`);

      const { error: updErr } = await supabase
        .from('salary_transactions')
        .update({
          bonus: newBonus,
          salary_cut: newCut,
          remarks: updatedRemarks,
        })
        .eq('id', existingTx.id);

      if (updErr) {
        console.error('Error updating salary adjustment:', updErr);
        throw new Error(updErr.message || 'Failed to update salary adjustment');
      }
    } else {
      const { error: insErr } = await supabase
        .from('salary_transactions')
        .insert({
          employee_id: targetEmpId,
          salary_month: salaryMonth,
          salary_amount: monthlySalary,
          paid_amount: 0,
          salary_cut: type === 'cut' ? adjAmount : 0,
          bonus: type === 'bonus' ? adjAmount : 0,
          carry_forward: 0,
          remarks: cleanRemarks || (type === 'bonus' ? 'Bonus' : 'Salary Cut'),
        });

      if (insErr) {
        console.error('Error inserting salary adjustment:', insErr);
        throw new Error(insErr.message || 'Failed to record salary adjustment');
      }
    }

    // Record in employee_wallet_transactions
    await this.recordWalletTransaction({
      employeeId,
      salaryMonth: month,
      transactionType: type === 'bonus' ? 'bonus' : 'salary_cut',
      amount: adjAmount,
      remarks: cleanRemarks || (type === 'bonus' ? 'Bonus' : 'Salary Cut'),
    }).catch((e) => console.warn('Could not record wallet transaction for adjustment:', e));

    // If bonus is added, log as an expense in inventory_expenses so analytics registers it immediately
    if (type === 'bonus' && adjAmount > 0) {
      await ExpenseService.addExpense({
        category: 'Salary',
        itemName: `${empName} (Bonus)`,
        amount: adjAmount,
        expenseDate: getISTDateStr(),
        remarks: cleanRemarks || `Bonus for ${month}`,
      }).catch((e) => console.warn('Could not auto-log inventory expense for bonus:', e));
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
    const salaryMonth = `${month}-01`;
    const payAmount = Number(amount || 0);
    const pDate = paymentDate || getISTDateStr();
    const cleanRemarks = remarks.trim();
    const targetEmpId = !isNaN(Number(employeeId)) ? Number(employeeId) : employeeId;

    // Fetch employee
    const { data: empData } = await supabase
      .from('salary_employees')
      .select('*')
      .eq('id', targetEmpId)
      .maybeSingle();

    const empName = empData ? (empData.employee_name || empData.name || 'Employee') : 'Employee';
    const monthlySalary = empData ? Number(empData.monthly_salary || 0) : payAmount;

    // Record in inventory_expenses if paid by Irshad
    if (paidBy === 'irshad') {
      try {
        await supabase.from('inventory_expenses').insert({
          expense_date: pDate,
          category: 'Salary',
          amount: payAmount,
          remarks: cleanRemarks ? `Salary paid by Irshad: ${cleanRemarks}` : `Salary paid by Irshad (${empName})`,
          item_name: `Salary Payment (${empName})`,
          created_at: new Date().toISOString(),
          paid_by: 'irshad',
        });
      } catch (e) {
        console.warn('Could not insert salary paid by Irshad to inventory_expenses', e);
      }
    }

    // Check existing transaction
    const { data: existingTx } = await supabase
      .from('salary_transactions')
      .select('*')
      .eq('employee_id', targetEmpId)
      .eq('salary_month', salaryMonth)
      .maybeSingle();

    let txId = '';
    if (existingTx) {
      txId = String(existingTx.id);
      const updatedPaid = Number(existingTx.paid_amount || 0) + payAmount;
      const updatedRemarks = cleanRemarks
        ? (existingTx.remarks ? `${existingTx.remarks}; ${cleanRemarks}` : cleanRemarks)
        : (existingTx.remarks || 'Salary Payment');

      const { error: updErr } = await supabase
        .from('salary_transactions')
        .update({
          paid_amount: updatedPaid,
          remarks: updatedRemarks,
        })
        .eq('id', existingTx.id);

      if (updErr) {
        console.error('Error updating salary transaction:', updErr);
        throw new Error(updErr.message || 'Failed to update salary transaction');
      }
    } else {
      const { data: newTx, error: insErr } = await supabase
        .from('salary_transactions')
        .insert({
          employee_id: targetEmpId,
          salary_month: salaryMonth,
          salary_amount: monthlySalary,
          paid_amount: payAmount,
          salary_cut: 0,
          bonus: 0,
          carry_forward: 0,
          remarks: cleanRemarks || 'Salary Payment',
        })
        .select()
        .single();

      if (insErr) {
        console.error('Error inserting salary transaction:', insErr);
        throw new Error(insErr.message || 'Failed to record salary transaction');
      }
      txId = String(newTx.id);
    }

    // Record in employee_wallet_transactions
    await this.recordWalletTransaction({
      employeeId,
      salaryMonth: month,
      transactionType: 'payment',
      amount: payAmount,
      paymentMethod,
      remarks: cleanRemarks || 'Salary Payment',
    }).catch((e) => console.warn('Could not record wallet transaction for payment:', e));

    // Auto-log into inventory_expenses as Salary expense for Analytics
    await ExpenseService.addExpense({
      category: 'Salary',
      itemName: empName,
      amount: payAmount,
      expenseDate: pDate,
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
    const effectiveFrom = `${monthStr}-01`;
    const rentVal = Number(monthlyAmount || 0);

    const { data, error } = await supabase
      .from('rent_settings')
      .insert({
        monthly_rent: rentVal,
        effective_from: effectiveFrom,
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting rent_setting:', error);
      throw new Error(error.message || 'Failed to update rent amount');
    }

    return {
      id: String(data.id),
      monthlyAmount: rentVal,
      effectiveMonth: monthStr,
      createdAt: String(data.created_at || new Date().toISOString()),
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
    const rentMonth = `${month}-01`;
    const payAmount = Number(amount || 0);
    const pDate = paymentDate || getISTDateStr();
    const cleanRemarks = remarks.trim();

    // Record in inventory_expenses if paid by Irshad
    if (paidBy === 'irshad') {
      try {
        await supabase.from('inventory_expenses').insert({
          expense_date: pDate,
          category: 'Rent',
          amount: payAmount,
          remarks: cleanRemarks ? `Rent paid by Irshad: ${cleanRemarks}` : 'Rent paid by Irshad',
          item_name: 'Rent Payment',
          created_at: new Date().toISOString(),
          paid_by: 'irshad',
        });
      } catch (e) {
        console.warn('Could not insert rent paid by Irshad to inventory_expenses', e);
      }
    }

    // Fetch latest effective rent setting
    const { data: rentSets } = await supabase
      .from('rent_settings')
      .select('*')
      .order('effective_from', { ascending: false })
      .limit(1);

    const effectiveRent = rentSets && rentSets.length > 0 ? Number(rentSets[0].monthly_rent || 160000) : 160000;

    // Check existing transaction
    const { data: existingRt } = await supabase
      .from('rent_transactions')
      .select('*')
      .eq('rent_month', rentMonth)
      .maybeSingle();

    let rtId = '';
    if (existingRt) {
      rtId = String(existingRt.id);
      const updatedPaid = Number(existingRt.paid_amount || 0) + payAmount;
      const updatedRemarks = cleanRemarks
        ? (existingRt.remarks ? `${existingRt.remarks}; ${cleanRemarks}` : cleanRemarks)
        : (existingRt.remarks || 'Rent Payment');

      const { error: updErr } = await supabase
        .from('rent_transactions')
        .update({
          paid_amount: updatedPaid,
          remarks: updatedRemarks,
        })
        .eq('id', existingRt.id);

      if (updErr) {
        console.error('Error updating rent transaction:', updErr);
        throw new Error(updErr.message || 'Failed to update rent transaction');
      }
    } else {
      const { data: newRt, error: insErr } = await supabase
        .from('rent_transactions')
        .insert({
          rent_month: rentMonth,
          rent_amount: effectiveRent,
          paid_amount: payAmount,
          carry_forward: 0,
          remarks: cleanRemarks || 'Rent Payment',
        })
        .select()
        .single();

      if (insErr) {
        console.error('Error inserting rent transaction:', insErr);
        throw new Error(insErr.message || 'Failed to record rent transaction');
      }
      rtId = String(newRt.id);
    }

    // Auto-log into inventory_expenses as Rent expense for Analytics
    await ExpenseService.addExpense({
      category: 'Rent',
      itemName: 'Monthly Rent',
      amount: payAmount,
      expenseDate: pDate,
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
      };
    }

    try {
      const [eRes, stRes, rSetRes, rtRes, walletBalances, walletTransactions] = await Promise.all([
        supabase.from('salary_employees').select('*').order('created_at', { ascending: true }),
        supabase.from('salary_transactions').select('*').order('created_at', { ascending: true }),
        supabase.from('rent_settings').select('*').order('effective_from', { ascending: false }),
        supabase.from('rent_transactions').select('*').order('created_at', { ascending: true }),
        this.getWalletBalances(),
        this.getWalletTransactions(),
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
            const baseSalary = Number(e.monthly_salary || e.base_salary || 0);
            const effectiveMonth = String(e.effective_from || e.effective_month || '').substring(0, 7) || '2026-07';

            employees.push({
              id: empId,
              name,
              role,
              baseSalary,
              effectiveMonth,
              isActive: true,
              createdAt: String(e.created_at || new Date().toISOString()),
            });

            salaryHistory.push({
              id: `sh_${empId}`,
              employeeId: empId,
              baseSalary,
              effectiveMonth,
              createdAt: String(e.created_at || new Date().toISOString()),
            });
          });
      }

      const salaryPayments: SalaryPayment[] = [];
      const salaryAdjustments: EmployeeSalaryAdjustment[] = [];

      if (stRes.data) {
        stRes.data.forEach((st: any) => {
          const empId = String(st.employee_id);
          const mStr = String(st.salary_month || '').substring(0, 7);
          const paidAmt = Number(st.paid_amount || 0);
          const bonusAmt = Number(st.bonus || 0);
          const cutAmt = Number(st.salary_cut || 0);
          const remarks = String(st.remarks || '');
          const createdAt = String(st.created_at || new Date().toISOString());
          const paymentDate = createdAt.substring(0, 10);

          if (paidAmt > 0) {
            salaryPayments.push({
              id: String(st.id),
              employeeId: empId,
              month: mStr,
              amount: paidAmt,
              paymentMethod: 'cash',
              remarks,
              paymentDate,
              createdAt,
            });
          }

          if (bonusAmt > 0) {
            salaryAdjustments.push({
              id: `bonus_${st.id}`,
              employeeId: empId,
              month: mStr,
              type: 'bonus',
              amount: bonusAmt,
              remarks,
              createdAt,
            });
          }

          if (cutAmt > 0) {
            salaryAdjustments.push({
              id: `cut_${st.id}`,
              employeeId: empId,
              month: mStr,
              type: 'cut',
              amount: cutAmt,
              remarks,
              createdAt,
            });
          }
        });
      }

      const rentSettings: RentSetting[] = [];
      if (rSetRes.data && rSetRes.data.length > 0) {
        rSetRes.data.forEach((rs: any) => {
          rentSettings.push({
            id: String(rs.id),
            monthlyAmount: Number(rs.monthly_rent || 0),
            effectiveMonth: String(rs.effective_from || '').substring(0, 7) || '2026-07',
            createdAt: String(rs.created_at || new Date().toISOString()),
          });
        });
      }

      const rentPayments: RentPayment[] = [];
      if (rtRes.data) {
        rtRes.data.forEach((rt: any) => {
          const paidAmt = Number(rt.paid_amount || 0);
          if (paidAmt > 0) {
            const mStr = String(rt.rent_month || '').substring(0, 7);
            const createdAt = String(rt.created_at || new Date().toISOString());
            rentPayments.push({
              id: String(rt.id),
              month: mStr,
              amount: paidAmt,
              paymentMethod: 'cash',
              remarks: String(rt.remarks || ''),
              paymentDate: createdAt.substring(0, 10),
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
        walletBalances,
        walletTransactions,
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
