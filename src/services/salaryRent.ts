import {
  SalaryEmployee,
  SalaryHistory,
  EmployeeSalaryAdjustment,
  SalaryPayment,
  RentSetting,
  RentPayment,
} from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Local Memory State for fallback / offline execution
let localEmployees: SalaryEmployee[] = [
  {
    id: 'emp_1',
    name: 'Salman',
    role: 'Chef',
    baseSalary: 35000,
    effectiveMonth: '2026-01',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'emp_2',
    name: 'Chef',
    role: 'Senior Chef',
    baseSalary: 30000,
    effectiveMonth: '2026-01',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'emp_3',
    name: 'Nagaland Workers',
    role: 'Operations & Maintenance',
    baseSalary: 53000,
    effectiveMonth: '2026-01',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

let localSalaryHistory: SalaryHistory[] = [
  { id: 'sh_1', employeeId: 'emp_1', baseSalary: 35000, effectiveMonth: '2026-01', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'sh_2', employeeId: 'emp_2', baseSalary: 30000, effectiveMonth: '2026-01', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'sh_3', employeeId: 'emp_3', baseSalary: 53000, effectiveMonth: '2026-01', createdAt: '2026-01-01T00:00:00.000Z' },
];

let localAdjustments: EmployeeSalaryAdjustment[] = [];
let localSalaryPayments: SalaryPayment[] = [];

let localRentSettings: RentSetting[] = [
  {
    id: 'rent_set_1',
    monthlyAmount: 160000,
    effectiveMonth: '2026-01',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

let localRentPayments: RentPayment[] = [];

export const SalaryRentService = {
  // --- EMPLOYEES ---
  async getEmployees(): Promise<SalaryEmployee[]> {
    if (!isSupabaseConfigured) return [...localEmployees];

    try {
      const { data, error } = await supabase
        .from('salary_employees')
        .select('*')
        .order('created_at', { ascending: true });

      if (error || !data || data.length === 0) {
        return [...localEmployees];
      }

      const mapped: SalaryEmployee[] = data.map((e: any) => ({
        id: String(e.id),
        name: String(e.name || 'Employee'),
        role: String(e.role || ''),
        baseSalary: Number(e.base_salary || 0),
        effectiveMonth: String(e.effective_month || '2026-01'),
        isActive: e.is_active !== false,
        createdAt: String(e.created_at || new Date().toISOString()),
      }));

      return mapped;
    } catch {
      return [...localEmployees];
    }
  },

  async addEmployee(name: string, role: string, baseSalary: number, effectiveMonth: string): Promise<SalaryEmployee> {
    const id = `emp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const nowIso = new Date().toISOString();
    const newEmp: SalaryEmployee = {
      id,
      name: name.trim(),
      role: role.trim(),
      baseSalary: Number(baseSalary || 0),
      effectiveMonth: effectiveMonth || new Date().toISOString().substring(0, 7),
      isActive: true,
      createdAt: nowIso,
    };

    localEmployees.push(newEmp);
    localSalaryHistory.push({
      id: `sh_${Date.now()}`,
      employeeId: id,
      baseSalary: Number(baseSalary || 0),
      effectiveMonth: newEmp.effectiveMonth,
      createdAt: nowIso,
    });

    if (isSupabaseConfigured) {
      try {
        const payload = {
          name: newEmp.name,
          role: newEmp.role,
          base_salary: newEmp.baseSalary,
          effective_month: newEmp.effectiveMonth,
          is_active: true,
        };
        const { data } = await supabase.from('salary_employees').insert(payload).select().single();
        if (data && data.id) {
          newEmp.id = String(data.id);
        }
        await supabase.from('salary_history').insert({
          employee_id: newEmp.id,
          base_salary: newEmp.baseSalary,
          effective_month: newEmp.effectiveMonth,
        });
      } catch (err) {
        console.warn('Supabase addEmployee fallback to local state:', err);
      }
    }

    return newEmp;
  },

  async updateEmployeeName(id: string, name: string, role?: string): Promise<void> {
    localEmployees = localEmployees.map((e) =>
      e.id === id ? { ...e, name: name.trim(), role: role !== undefined ? role.trim() : e.role } : e
    );

    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('salary_employees')
          .update({ name: name.trim(), ...(role !== undefined ? { role: role.trim() } : {}) })
          .eq('id', id);
      } catch (err) {
        console.warn('Supabase updateEmployeeName error:', err);
      }
    }
  },

  async updateEmployeeSalary(id: string, newBaseSalary: number, effectiveMonth: string): Promise<void> {
    localEmployees = localEmployees.map((e) =>
      e.id === id ? { ...e, baseSalary: Number(newBaseSalary) } : e
    );

    const sh: SalaryHistory = {
      id: `sh_${Date.now()}`,
      employeeId: id,
      baseSalary: Number(newBaseSalary),
      effectiveMonth,
      createdAt: new Date().toISOString(),
    };
    localSalaryHistory.push(sh);

    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('salary_employees')
          .update({ base_salary: Number(newBaseSalary) })
          .eq('id', id);

        await supabase.from('salary_history').insert({
          employee_id: id,
          base_salary: Number(newBaseSalary),
          effective_month: effectiveMonth,
        });
      } catch (err) {
        console.warn('Supabase updateEmployeeSalary error:', err);
      }
    }
  },

  async deleteEmployee(id: string): Promise<void> {
    localEmployees = localEmployees.filter((e) => e.id !== id);

    if (isSupabaseConfigured) {
      try {
        await supabase.from('salary_employees').delete().eq('id', id);
      } catch (err) {
        console.warn('Supabase deleteEmployee error:', err);
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
    const newAdj: EmployeeSalaryAdjustment = {
      id: `adj_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      employeeId,
      month,
      type,
      amount: Number(amount || 0),
      remarks: remarks.trim(),
      createdAt: new Date().toISOString(),
    };

    localAdjustments.push(newAdj);

    if (isSupabaseConfigured) {
      try {
        const payload = {
          employee_id: employeeId,
          month,
          type,
          amount: newAdj.amount,
          remarks: newAdj.remarks,
        };
        const { data } = await supabase.from('salary_adjustments').insert(payload).select().single();
        if (data && data.id) {
          newAdj.id = String(data.id);
        }
      } catch (err) {
        console.warn('Supabase addSalaryAdjustment error:', err);
      }
    }

    return newAdj;
  },

  // --- SALARY PAYMENTS ---
  async addSalaryPayment(
    employeeId: string,
    month: string,
    amount: number,
    paymentMethod: 'cash' | 'card' | 'upi' | 'net_banking',
    remarks: string,
    paymentDate: string
  ): Promise<SalaryPayment> {
    const newPay: SalaryPayment = {
      id: `sp_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      employeeId,
      month,
      amount: Number(amount || 0),
      paymentMethod,
      remarks: remarks.trim(),
      paymentDate: paymentDate || new Date().toISOString().substring(0, 10),
      createdAt: new Date().toISOString(),
    };

    localSalaryPayments.push(newPay);

    if (isSupabaseConfigured) {
      try {
        const payload = {
          employee_id: employeeId,
          month,
          amount: newPay.amount,
          payment_method: paymentMethod,
          remarks: newPay.remarks,
          payment_date: newPay.paymentDate,
        };
        const { data } = await supabase.from('salary_payments').insert(payload).select().single();
        if (data && data.id) {
          newPay.id = String(data.id);
        }
      } catch (err) {
        console.warn('Supabase addSalaryPayment error:', err);
      }
    }

    return newPay;
  },

  // --- RENT SETTINGS ---
  async updateRentAmount(monthlyAmount: number, effectiveMonth: string): Promise<RentSetting> {
    const newSetting: RentSetting = {
      id: `rent_set_${Date.now()}`,
      monthlyAmount: Number(monthlyAmount),
      effectiveMonth,
      createdAt: new Date().toISOString(),
    };

    localRentSettings.push(newSetting);

    if (isSupabaseConfigured) {
      try {
        const payload = {
          monthly_amount: newSetting.monthlyAmount,
          effective_month: effectiveMonth,
        };
        const { data } = await supabase.from('rent_settings').insert(payload).select().single();
        if (data && data.id) {
          newSetting.id = String(data.id);
        }
      } catch (err) {
        console.warn('Supabase updateRentAmount error:', err);
      }
    }

    return newSetting;
  },

  // --- RENT PAYMENTS ---
  async addRentPayment(
    month: string,
    amount: number,
    paymentMethod: 'cash' | 'card' | 'upi' | 'net_banking',
    remarks: string,
    paymentDate: string
  ): Promise<RentPayment> {
    const newPay: RentPayment = {
      id: `rp_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      month,
      amount: Number(amount || 0),
      paymentMethod,
      remarks: remarks.trim(),
      paymentDate: paymentDate || new Date().toISOString().substring(0, 10),
      createdAt: new Date().toISOString(),
    };

    localRentPayments.push(newPay);

    if (isSupabaseConfigured) {
      try {
        const payload = {
          month,
          amount: newPay.amount,
          payment_method: paymentMethod,
          remarks: newPay.remarks,
          payment_date: newPay.paymentDate,
        };
        const { data } = await supabase.from('rent_payments').insert(payload).select().single();
        if (data && data.id) {
          newPay.id = String(data.id);
        }
      } catch (err) {
        console.warn('Supabase addRentPayment error:', err);
      }
    }

    return newPay;
  },

  // --- FETCH & COMBINE ALL DATA ---
  async fetchAllData() {
    let emps = [...localEmployees];
    let shs = [...localSalaryHistory];
    let adjs = [...localAdjustments];
    let sps = [...localSalaryPayments];
    let rsets = [...localRentSettings];
    let rps = [...localRentPayments];

    if (isSupabaseConfigured) {
      try {
        const [eRes, shRes, aRes, spRes, rRes, rpRes] = await Promise.all([
          supabase.from('salary_employees').select('*'),
          supabase.from('salary_history').select('*'),
          supabase.from('salary_adjustments').select('*'),
          supabase.from('salary_payments').select('*'),
          supabase.from('rent_settings').select('*'),
          supabase.from('rent_payments').select('*'),
        ]);

        if (eRes.data && eRes.data.length > 0) {
          emps = eRes.data.map((e: any) => ({
            id: String(e.id),
            name: String(e.name || ''),
            role: String(e.role || ''),
            baseSalary: Number(e.base_salary || 0),
            effectiveMonth: String(e.effective_month || '2026-01'),
            isActive: e.is_active !== false,
            createdAt: String(e.created_at || new Date().toISOString()),
          }));
          localEmployees = emps;
        }

        if (shRes.data && shRes.data.length > 0) {
          shs = shRes.data.map((h: any) => ({
            id: String(h.id),
            employeeId: String(h.employee_id),
            baseSalary: Number(h.base_salary || 0),
            effectiveMonth: String(h.effective_month || '2026-01'),
            createdAt: String(h.created_at || new Date().toISOString()),
          }));
          localSalaryHistory = shs;
        }

        if (aRes.data) {
          adjs = aRes.data.map((a: any) => ({
            id: String(a.id),
            employeeId: String(a.employee_id),
            month: String(a.month),
            type: a.type as 'bonus' | 'cut',
            amount: Number(a.amount || 0),
            remarks: String(a.remarks || ''),
            createdAt: String(a.created_at || new Date().toISOString()),
          }));
          localAdjustments = adjs;
        }

        if (spRes.data) {
          sps = spRes.data.map((p: any) => ({
            id: String(p.id),
            employeeId: String(p.employee_id),
            month: String(p.month),
            amount: Number(p.amount || 0),
            paymentMethod: (p.payment_method || 'cash') as any,
            remarks: String(p.remarks || ''),
            paymentDate: String(p.payment_date || p.created_at || '').substring(0, 10),
            createdAt: String(p.created_at || new Date().toISOString()),
          }));
          localSalaryPayments = sps;
        }

        if (rRes.data && rRes.data.length > 0) {
          rsets = rRes.data.map((r: any) => ({
            id: String(r.id),
            monthlyAmount: Number(r.monthly_amount || 160000),
            effectiveMonth: String(r.effective_month || '2026-01'),
            createdAt: String(r.created_at || new Date().toISOString()),
          }));
          localRentSettings = rsets;
        }

        if (rpRes.data) {
          rps = rpRes.data.map((p: any) => ({
            id: String(p.id),
            month: String(p.month),
            amount: Number(p.amount || 0),
            paymentMethod: (p.payment_method || 'cash') as any,
            remarks: String(p.remarks || ''),
            paymentDate: String(p.payment_date || p.created_at || '').substring(0, 10),
            createdAt: String(p.created_at || new Date().toISOString()),
          }));
          localRentPayments = rps;
        }
      } catch (err) {
        console.warn('Exception loading salary/rent data from Supabase:', err);
      }
    }

    return {
      employees: emps,
      salaryHistory: shs,
      salaryAdjustments: adjs,
      salaryPayments: sps,
      rentSettings: rsets,
      rentPayments: rps,
    };
  },
};
