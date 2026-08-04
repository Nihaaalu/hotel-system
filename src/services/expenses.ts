import { Expense, ExpenseCategory } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getISTDateStr } from '../utils/formatters';

const DEBUG = false;

function logQuery(table: string, action: string, where: string, payload?: any) {
  if (DEBUG) console.log(`TABLE:\n${table}\n\nACTION:\n${action}\n\nWHERE:\n${where}\n\nPAYLOAD:\n${JSON.stringify(payload ?? {}, null, 2)}`);
}

function logResponse(data: any, error: any) {
  if (DEBUG) console.log(`Returned data:\n${JSON.stringify(data ?? null, null, 2)}`);
  if (DEBUG) console.log(`Returned error:\n${JSON.stringify(error ?? null, null, 2)}`);
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

      const mapped: Expense[] = data.map((item: any) => {
        let cat = (item.category || 'Miscellaneous') as ExpenseCategory;
        const itemNameRaw = String(item.item_name || item.name || '').trim();
        const remarksRaw = String(item.remarks || item.notes || '').trim();

        if (cat === 'Miscellaneous' || (cat as string) === 'Other') {
          if (itemNameRaw.toLowerCase().includes('rent') || remarksRaw.toLowerCase().includes('rent')) {
            cat = 'Rent';
          } else if (itemNameRaw.toLowerCase().includes('salary') || remarksRaw.toLowerCase().includes('salary')) {
            cat = 'Salary';
          }
        }

        const nameVal = itemNameRaw || cat;
        return {
          id: String(item.id || `exp_${Date.now()}_${Math.random()}`),
          expenseDate: String(item.expense_date || item.date || getISTDateStr()),
          category: cat,
          itemName: nameVal,
          amount: Number(item.amount || item.cost || item.price || 0),
          remarks: remarksRaw,
          paidBy: (item.paid_by === 'irshad' ? 'irshad' : 'resort') as 'resort' | 'irshad',
          createdAt: String(item.created_at || new Date().toISOString()),
        };
      });

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
    const finalItemName = (expenseData.itemName || '').trim() || expenseData.category;

    const newExpense: Expense = {
      ...expenseData,
      itemName: finalItemName,
      id,
      createdAt: nowIso,
    };

    // Always add to local memory list so UI stays instantly responsive
    const existingIdx = localExpenses.findIndex((e) => e.id === id);
    if (existingIdx === -1) {
      localExpenses.unshift(newExpense);
    }

    if (isSupabaseConfigured) {
      const payload: Record<string, any> = {
        expense_date: expenseData.expenseDate,
        category: expenseData.category,
        item_name: finalItemName,
        amount: Number(expenseData.amount || 0),
        remarks: expenseData.remarks || '',
        paid_by: expenseData.paidBy || 'resort',
      };

      logQuery('inventory_expenses', 'INSERT', 'N/A', payload);

      let { data, error } = await supabase
        .from('inventory_expenses')
        .insert(payload)
        .select()
        .single();

      // If category constraint error (e.g. 23514), fallback to category 'Miscellaneous'
      if (error && error.code === '23514') {
        payload.category = 'Miscellaneous';
        payload.item_name = finalItemName || 'Rent Payment';
        const retryRes = await supabase
          .from('inventory_expenses')
          .insert(payload)
          .select()
          .single();
        data = retryRes.data;
        error = retryRes.error;
      }

      // If item_name column doesn't exist yet in Supabase table, try fallback without item_name
      if (error && (error.message?.includes('item_name') || error.code === 'PGRST204')) {
        delete payload.item_name;
        const retryRes = await supabase
          .from('inventory_expenses')
          .insert(payload)
          .select()
          .single();
        data = retryRes.data;
        error = retryRes.error;
      }

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
      if (expenseData.itemName !== undefined || expenseData.category !== undefined) {
        payload.item_name = (expenseData.itemName || '').trim() || expenseData.category;
      }
      if (expenseData.amount !== undefined) payload.amount = Number(expenseData.amount);
      if (expenseData.remarks !== undefined) payload.remarks = expenseData.remarks;
      if (expenseData.paidBy !== undefined) payload.paid_by = expenseData.paidBy;

      const numId = Number(id);
      const targetId = !isNaN(numId) ? numId : id;

      logQuery('inventory_expenses', 'UPDATE', `id = ${targetId}`, payload);
      let { data, error } = await supabase
        .from('inventory_expenses')
        .update(payload)
        .eq('id', targetId)
        .select();

      if (error && (error.message?.includes('item_name') || error.code === 'PGRST204')) {
        delete payload.item_name;
        const retryRes = await supabase
          .from('inventory_expenses')
          .update(payload)
          .eq('id', targetId)
          .select();
        data = retryRes.data;
        error = retryRes.error;
      }

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
