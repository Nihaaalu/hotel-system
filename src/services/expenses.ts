import { Expense, ExpenseCategory } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

function logQuery(table: string, action: string, where: string, payload?: any) {
  console.log(`TABLE:\n${table}\n\nACTION:\n${action}\n\nWHERE:\n${where}\n\nPAYLOAD:\n${JSON.stringify(payload ?? {}, null, 2)}`);
}

function logResponse(data: any, error: any) {
  console.log(`Returned data:\n${JSON.stringify(data ?? null, null, 2)}`);
  console.log(`Returned error:\n${JSON.stringify(error ?? null, null, 2)}`);
}

// In-memory fallback storage when Supabase is offline
let localExpenses: Expense[] = [];

export const ExpenseService = {
  async getExpenses(): Promise<Expense[]> {
    if (!isSupabaseConfigured) {
      return [...localExpenses];
    }

    try {
      logQuery('inventory_expenses', 'SELECT', 'ALL');
      const { data, error } = await supabase
        .from('inventory_expenses')
        .select('id, expense_date, category, amount, remarks, created_at')
        .order('expense_date', { ascending: false });
      logResponse(data, error);

      if (error) {
        console.warn('Error fetching inventory_expenses from Supabase:', error.message || error);
        return [...localExpenses];
      }

      if (!data) return [...localExpenses];

      const mapped: Expense[] = data.map((item: any) => ({
        id: String(item.id || `exp_${Date.now()}_${Math.random()}`),
        expenseDate: String(item.expense_date || item.date || new Date().toISOString().split('T')[0]),
        category: (item.category || 'Miscellaneous') as ExpenseCategory,
        amount: Number(item.amount || item.cost || item.price || 0),
        remarks: String(item.remarks || item.notes || ''),
        createdAt: String(item.created_at || new Date().toISOString()),
      }));

      return mapped;
    } catch (err) {
      console.warn('Exception fetching inventory_expenses:', err);
      return [...localExpenses];
    }
  },

  async addExpense(
    expenseData: Omit<Expense, 'id' | 'createdAt'>
  ): Promise<Expense> {
    const id = `exp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const nowIso = new Date().toISOString();
    const newExpense: Expense = {
      ...expenseData,
      id,
      createdAt: nowIso,
    };

    // Always add to local memory list so UI stays instantly responsive
    const existingIdx = localExpenses.findIndex((e) => e.id === id);
    if (existingIdx === -1) {
      localExpenses.unshift(newExpense);
    }

    if (isSupabaseConfigured) {
      // Strictly insert only expense_date, category, amount, remarks
      const payload = {
        expense_date: expenseData.expenseDate,
        category: expenseData.category,
        amount: Number(expenseData.amount || 0),
        remarks: expenseData.remarks || '',
      };

      logQuery('inventory_expenses', 'INSERT', 'N/A', payload);
      console.log('TABLE:\npublic.inventory_expenses');
      console.log('PAYLOAD:\n', JSON.stringify(payload, null, 2));

      const { data, error } = await supabase
        .from('inventory_expenses')
        .insert(payload)
        .select()
        .single();

      console.log('SUPABASE RESPONSE:\n', JSON.stringify(data, null, 2));
      console.log('SUPABASE ERROR:\n', JSON.stringify(error, null, 2));

      if (error) {
        console.error('Supabase inventory_expenses INSERT returned error:', error);
        throw new Error(error.message || `Failed to insert expense into Supabase: ${JSON.stringify(error)}`);
      } else if (data && data.id) {
        newExpense.id = String(data.id);
      }
    }

    return newExpense;
  },

  async updateExpense(
    id: string,
    expenseData: Partial<Omit<Expense, 'id' | 'createdAt'>>
  ): Promise<void> {
    localExpenses = localExpenses.map((exp) =>
      exp.id === id ? { ...exp, ...expenseData } : exp
    );

    if (isSupabaseConfigured) {
      const payload: Record<string, any> = {};
      if (expenseData.expenseDate !== undefined) payload.expense_date = expenseData.expenseDate;
      if (expenseData.category !== undefined) payload.category = expenseData.category;
      if (expenseData.amount !== undefined) payload.amount = Number(expenseData.amount);
      if (expenseData.remarks !== undefined) payload.remarks = expenseData.remarks;

      const numId = Number(id);
      const targetId = !isNaN(numId) ? numId : id;

      logQuery('inventory_expenses', 'UPDATE', `id = ${targetId}`, payload);
      const { data, error } = await supabase
        .from('inventory_expenses')
        .update(payload)
        .eq('id', targetId)
        .select();
      logResponse(data, error);

      if (error) {
        console.error('Supabase inventory_expenses UPDATE failed:', error);
        throw new Error(error.message || 'Failed to update expense in Supabase');
      }
    }
  },

  async deleteExpense(id: string): Promise<void> {
    localExpenses = localExpenses.filter((exp) => exp.id !== id);

    if (isSupabaseConfigured) {
      const numId = Number(id);
      const targetId = !isNaN(numId) ? numId : id;

      logQuery('inventory_expenses', 'DELETE', `id = ${targetId}`);
      const { data, error } = await supabase
        .from('inventory_expenses')
        .delete()
        .eq('id', targetId)
        .select();
      logResponse(data, error);

      if (error) {
        console.error('Supabase inventory_expenses DELETE failed:', error);
        throw new Error(error.message || 'Failed to delete expense from Supabase');
      }
    }
  },
};
