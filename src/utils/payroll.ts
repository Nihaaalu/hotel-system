/**
 * Shared Payroll Calculation Utility
 * 
 * Formula:
 * Final Salary = Monthly Salary + Bonus - Salary Cut
 * Inventory Expense = Final Salary
 * Wallet = Previous Wallet + Final Salary - Payments
 */

export interface PayrollCalculationInput {
  monthlySalary: number;
  bonus?: number;
  salaryCut?: number;
  payments?: number;
  previousWallet?: number;
}

export interface PayrollCalculationResult {
  monthlySalary: number;
  bonus: number;
  salaryCut: number;
  finalSalary: number;
  inventoryExpense: number;
  payments: number;
  previousWallet: number;
  wallet: number;
}

export function calculatePayroll({
  monthlySalary,
  bonus = 0,
  salaryCut = 0,
  payments = 0,
  previousWallet = 0,
}: PayrollCalculationInput): PayrollCalculationResult {
  const mSalary = Number(monthlySalary || 0);
  const b = Number(bonus || 0);
  const c = Number(salaryCut || 0);
  const p = Number(payments || 0);
  const prevW = Number(previousWallet || 0);

  const finalSalary = mSalary + b - c;
  const inventoryExpense = finalSalary;
  const wallet = prevW + finalSalary - p;

  return {
    monthlySalary: mSalary,
    bonus: b,
    salaryCut: c,
    finalSalary,
    inventoryExpense,
    payments: p,
    previousWallet: prevW,
    wallet,
  };
}
