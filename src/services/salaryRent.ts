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

// In-memory fallback for local employees
let localEmployees: SalaryEmployee[] = [];

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
    if (!isSupabaseConfigured) return [...localEmployees];

    try {
      const { data, error } = await supabase
        .from('salary_employees')
        .select('*')
        .order('id', { ascending: true });

      if (error || !data) return [...localEmployees];

      const dbEmps: SalaryEmployee[] = data
        .filter((e: any) => e.is_active !== false)
        .map((e: any) => ({
          id: String(e.id),
          name: String(e.employee_name || e.name || 'Employee'),
          role: String(e.role || ''),
          baseSalary: Number(e.monthly_salary || e.salary || e.base_salary || 0),
          effectiveMonth: '2026-07',
          isActive: Boolean(e.is_active !== false),
          createdAt: String(e.created_at || new Date().toISOString()),
        }));

      const dbIds = new Set(dbEmps.map((e) => e.id));
      const extraLocal = localEmployees.filter((le) => le.isActive && !dbIds.has(le.id));
      return [...dbEmps, ...extraLocal];
    } catch (err) {
      console.error('Error fetching salary_employees:', err);
      return [...localEmployees];
    }
  },

  async addEmployee(
    name: string,
    role: string,
    baseSalary: number,
    effectiveMonth: string
  ): Promise<SalaryEmployee> {
    const monthStr = effectiveMonth || getISTMonthStr();
    const cleanName = name.trim();
    const cleanRole = role ? role.trim() : '';
    const salaryVal = Number(baseSalary || 0);

    console.log("[EMPLOYEE] Name:", cleanName);
    console.log("[EMPLOYEE] Salary:", salaryVal);

    let insertedData: any = null;

    if (isSupabaseConfigured) {
      const payload = {
        employee_name: cleanName,
        monthly_salary: salaryVal,
        is_active: true
      };

      console.log("[EMPLOYEE] About to INSERT into salary_employees");
      console.log(payload);

      const { data, error } = await supabase
        .from('salary_employees')
        .insert(payload as any)
        .select();

      console.log("[EMPLOYEE] Returned data:", data);
      console.log("[EMPLOYEE] Returned error:", error);

      if (!error && data && data.length > 0) {
        insertedData = data[0];
      } else {
        const fallbackAttempts = [
          { employee_name: cleanName, role: cleanRole, monthly_salary: salaryVal, is_active: true },
          { name: cleanName, monthly_salary: salaryVal, is_active: true },
          { name: cleanName, role: cleanRole, monthly_salary: salaryVal, is_active: true },
          { name: cleanName, role: cleanRole, base_salary: salaryVal, is_active: true },
        ];

        for (const altPayload of fallbackAttempts) {
          try {
            console.log("[EMPLOYEE] Attempting fallback INSERT into salary_employees:", altPayload);
            const res = await supabase
              .from('salary_employees')
              .insert(altPayload as any)
              .select();

            console.log("[EMPLOYEE] Returned data:", res.data);
            console.log("[EMPLOYEE] Returned error:", res.error);

            if (!res.error && res.data && res.data.length > 0) {
              insertedData = res.data[0];
              break;
            }
          } catch (err) {
            console.log("[EMPLOYEE] Fallback exception:", err);
          }
        }
      }
    }

    const empId = insertedData ? String(insertedData.id) : `emp_${Date.now()}`;

    const newEmp: SalaryEmployee = {
      id: empId,
      name: String(insertedData?.employee_name || insertedData?.name || cleanName),
      role: String(insertedData?.role || cleanRole),
      baseSalary: Number(insertedData?.monthly_salary || insertedData?.salary || insertedData?.base_salary || salaryVal),
      effectiveMonth: monthStr,
      isActive: true,
      createdAt: String(insertedData?.created_at || new Date().toISOString()),
    };

    localEmployees.unshift(newEmp);

    return newEmp;
  },

  async updateEmployeeName(id: string, name: string, role?: string): Promise<void> {
    const numId = Number(id);
    const targetId = !isNaN(numId) ? numId : id;
    const cleanName = name.trim();
    const cleanRole = role ? role.trim() : undefined;

    console.log("Updating employee:", id, cleanName);

    if (isSupabaseConfigured) {
      const payload: Record<string, any> = { employee_name: cleanName };
      if (cleanRole !== undefined) payload.role = cleanRole;

      const { data, error } = await supabase
        .from('salary_employees')
        .update(payload)
        .eq('id', targetId)
        .select();

      console.log("Supabase update result:", data);
      console.log("Supabase update error:", error);

      if (error) {
        // Fallback to updating 'name' column
        const fallback = await supabase
          .from('salary_employees')
          .update({ name: cleanName } as any)
          .eq('id', targetId)
          .select();

        console.log("Supabase fallback update result:", fallback.data);
        console.log("Supabase fallback update error:", fallback.error);

        if (fallback.error) {
          throw error;
        }
      }
    }

    // Update in local memory only after Supabase update succeeds
    const local = localEmployees.find((e) => e.id === id);
    if (local) {
      local.name = cleanName;
      if (cleanRole !== undefined) local.role = cleanRole;
    }
  },

  async updateEmployeeSalary(id: string, newBaseSalary: number, _effectiveMonth: string): Promise<void> {
    const numId = Number(id);
    const targetId = !isNaN(numId) ? numId : id;
    const salaryVal = Number(newBaseSalary || 0);

    const local = localEmployees.find((e) => e.id === id);
    if (local) {
      local.baseSalary = salaryVal;
    }

    if (isSupabaseConfigured) {
      let { error } = await supabase
        .from('salary_employees')
        .update({ monthly_salary: salaryVal })
        .eq('id', targetId);

      if (error) {
        try {
          await supabase
            .from('salary_employees')
            .update({ base_salary: salaryVal })
            .eq('id', targetId);
        } catch (err) {
          // Ignore fallback error
        }
      }
    }
  },

  async deleteEmployee(id: string): Promise<void> {
    const numId = Number(id);
    const targetId = !isNaN(numId) ? numId : id;

    localEmployees = localEmployees.filter((e) => e.id !== id);

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('salary_employees')
        .update({ is_active: false })
        .eq('id', targetId);

      if (error) {
        try {
          await supabase.from('salary_employees').delete().eq('id', targetId);
        } catch (err) {
          // Ignore fallback error
        }
      }
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
    const rawAmt = Number(amount || 0);
    const payAmount = type === 'bonus' ? Math.abs(rawAmt) : -Math.abs(rawAmt);
    const prefix = type === 'bonus' ? 'BONUS:' : 'CUT:';
    
    let cleanRemarks = remarks.trim();
    if (!cleanRemarks.toUpperCase().startsWith(prefix)) {
      cleanRemarks = cleanRemarks ? `${prefix} ${cleanRemarks}` : `${prefix} ${type === 'bonus' ? 'Bonus' : 'Salary Cut'}`;
    }

    const targetEmpId = !isNaN(Number(employeeId)) ? Number(employeeId) : employeeId;
    const pDate = getISTDateStr();

    const payload = {
      employee_id: targetEmpId,
      payment_date: pDate,
      amount: payAmount,
      paid_by: 'resort',
      remarks: cleanRemarks,
    };

    console.log("TABLE:", "salary_transactions");
    console.log("ACTION:", "INSERT");
    console.log("PAYLOAD:", payload);

    const { data, error } = await supabase
      .from("salary_transactions")
      .insert(payload)
      .select();

    console.log("RETURNED DATA:", data);
    console.log("RETURNED ERROR:", error);

    if (error) {
      throw new Error(error.message || `Failed to record ${type} in salary_transactions`);
    }

    if (type === 'bonus' && Math.abs(rawAmt) > 0) {
      await ExpenseService.addExpense({
        category: 'Salary',
        itemName: 'Bonus Payment',
        amount: Math.abs(rawAmt),
        expenseDate: pDate,
        remarks: cleanRemarks,
      }).catch((e) => console.warn('Could not auto-log expense for bonus:', e));
    }

    const newTx = data && data[0] ? data[0] : { id: `adj_${Date.now()}` };

    return {
      id: String(newTx.id),
      employeeId,
      month,
      type,
      amount: Math.abs(rawAmt),
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
    const pDate = (paymentDate && month && paymentDate.startsWith(month))
      ? paymentDate
      : (month ? `${month}-28` : (paymentDate || getISTDateStr()));
    const cleanRemarks = remarks.trim() || 'Salary Payment';
    const targetEmpId = !isNaN(Number(employeeId)) ? Number(employeeId) : employeeId;

    const payload = {
      employee_id: targetEmpId,
      payment_date: pDate,
      amount: payAmount,
      paid_by: paidBy || 'resort',
      remarks: cleanRemarks,
    };

    console.log("TABLE:", "salary_transactions");
    console.log("ACTION:", "INSERT");
    console.log("PAYLOAD:", payload);

    const { data, error } = await supabase
      .from("salary_transactions")
      .insert(payload)
      .select();

    console.log("RETURNED DATA:", data);
    console.log("RETURNED ERROR:", error);

    if (error) {
      throw new Error(error.message || 'Failed to record salary transaction in salary_transactions');
    }

    // Auto-log into inventory_expenses as Salary expense for Analytics
    await ExpenseService.addExpense({
      category: 'Salary',
      itemName: 'Staff Salary',
      amount: payAmount,
      expenseDate: pDate,
      paidBy: paidBy,
      remarks: cleanRemarks || `Salary Payment for ${month}`,
    }).catch((e) => console.warn('Could not auto-log inventory expense for salary:', e));

    const newTx = data && data[0] ? data[0] : { id: Date.now() };

    return {
      id: String(newTx.id),
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
            const empStartMonth = String(e.effective_month || e.effectiveMonth || (e.created_at ? String(e.created_at).substring(0, 7) : getISTDateStr().substring(0, 7)));

            employees.push({
              id: empId,
              name,
              role,
              baseSalary,
              effectiveMonth: empStartMonth,
              isActive: true,
              createdAt: String(e.created_at || new Date().toISOString()),
            });

            salaryHistory.push({
              id: `sh_${empId}`,
              employeeId: empId,
              baseSalary,
              effectiveMonth: empStartMonth,
              createdAt: String(e.created_at || new Date().toISOString()),
            });
          });
      }

      const dbEmpIds = new Set(employees.map((e) => e.id));
      localEmployees.forEach((le) => {
        if (le.isActive && !dbEmpIds.has(le.id)) {
          const empStartMonth = String(le.effectiveMonth || (le.createdAt ? le.createdAt.substring(0, 7) : getISTDateStr().substring(0, 7)));
          employees.push(le);
          salaryHistory.push({
            id: `sh_${le.id}`,
            employeeId: le.id,
            baseSalary: le.baseSalary,
            effectiveMonth: empStartMonth,
            createdAt: le.createdAt,
          });
        }
      });

      const salaryPayments: SalaryPayment[] = [];
      const salaryAdjustments: EmployeeSalaryAdjustment[] = [];
      const walletTransactions: any[] = [];

      if (stRes.data) {
        stRes.data.forEach((st: any) => {
          const empId = String(st.employee_id);
          const pDate = String(st.payment_date || st.created_at || '').substring(0, 10);
          const mStr = pDate.length >= 7 ? pDate.substring(0, 7) : getISTDateStr().substring(0, 7);
          const rawAmt = Number(st.amount || st.paid_amount || 0);
          const remarks = String(st.remarks || '');
          const createdAt = String(st.created_at || new Date().toISOString());

          let txType: 'payment' | 'bonus' | 'salary_cut' = 'payment';

          if (remarks.toUpperCase().startsWith('BONUS:') || st.type === 'bonus') {
            txType = 'bonus';
            salaryAdjustments.push({
              id: String(st.id),
              employeeId: empId,
              month: mStr,
              type: 'bonus',
              amount: Math.abs(rawAmt),
              remarks,
              createdAt,
            });
          } else if (remarks.toUpperCase().startsWith('CUT:') || rawAmt < 0 || st.type === 'cut') {
            txType = 'salary_cut';
            salaryAdjustments.push({
              id: String(st.id),
              employeeId: empId,
              month: mStr,
              type: 'cut',
              amount: Math.abs(rawAmt),
              remarks,
              createdAt,
            });
          } else {
            salaryPayments.push({
              id: String(st.id),
              employeeId: empId,
              month: mStr,
              amount: rawAmt,
              paymentMethod: 'cash',
              remarks,
              paymentDate: pDate,
              createdAt,
            });
          }

          walletTransactions.push({
            id: String(st.id),
            employeeId: empId,
            salaryMonth: mStr,
            transactionType: txType,
            amount: Math.abs(rawAmt),
            remarks,
            createdAt,
          });
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
