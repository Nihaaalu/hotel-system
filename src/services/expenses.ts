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
        .select('*')
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
        itemName: String(item.item_name || item.item || item.name || ''),
        quantity: Number(item.quantity || item.qty || 1),
        unit: String(item.unit || 'pcs'),
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

    localExpenses.unshift(newExpense);

    if (isSupabaseConfigured) {
      try {
        const payload = {
          expense_date: expenseData.expenseDate,
          category: expenseData.category,
          item_name: expenseData.itemName,
          quantity: expenseData.quantity,
          unit: expenseData.unit,
          amount: expenseData.amount,
          remarks: expenseData.remarks,
        };

        logQuery('inventory_expenses', 'INSERT', 'N/A', payload);
        const { data, error } = await supabase
          .from('inventory_expenses')
          .insert(payload)
          .select()
          .single();
        logResponse(data, error);

        if (error) {
          console.warn('Error inserting inventory_expenses:', error.message || error);
        } else if (data) {
          newExpense.id = String(data.id || id);
        }
      } catch (err) {
        console.warn('Exception inserting inventory_expense:', err);
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
      try {
        const payload: Record<string, any> = {};
        if (expenseData.expenseDate !== undefined) payload.expense_date = expenseData.expenseDate;
        if (expenseData.category !== undefined) payload.category = expenseData.category;
        if (expenseData.itemName !== undefined) payload.item_name = expenseData.itemName;
        if (expenseData.quantity !== undefined) payload.quantity = expenseData.quantity;
        if (expenseData.unit !== undefined) payload.unit = expenseData.unit;
        if (expenseData.amount !== undefined) payload.amount = expenseData.amount;
        if (expenseData.remarks !== undefined) payload.remarks = expenseData.remarks;

        logQuery('inventory_expenses', 'UPDATE', `id = ${id}`, payload);
        const { data, error } = await supabase
          .from('inventory_expenses')
          .update(payload)
          .eq('id', id)
          .select();
        logResponse(data, error);

        if (error) {
          console.warn('Error updating inventory_expenses:', error.message || error);
        }
      } catch (err) {
        console.warn('Exception updating inventory_expense:', err);
      }
    }
  },

  async deleteExpense(id: string): Promise<void> {
    localExpenses = localExpenses.filter((exp) => exp.id !== id);

    if (isSupabaseConfigured) {
      try {
        logQuery('inventory_expenses', 'DELETE', `id = ${id}`);
        const { data, error } = await supabase
          .from('inventory_expenses')
          .delete()
          .eq('id', id)
          .select();
        logResponse(data, error);

        if (error) {
          console.warn('Error deleting inventory_expense:', error.message || error);
        }
      } catch (err) {
        console.warn('Exception deleting inventory_expense:', err);
      }
    }
  },
};
