/**
 * Shared Payroll Calculation Utility
 * 
 * Formula:
 * Wallet = Sum of all unpaid salary balances from months before the currently selected month.
 * Total Payable = Wallet + Monthly Salary + Bonus - Salary Cut
 * Remaining = Total Payable - Payments
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
  totalPayable: number;
  remainingBalance: number;
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

  const currentMonthPayable = mSalary + b - c;
  const totalPayable = prevW + currentMonthPayable;
  const inventoryExpense = currentMonthPayable;
  const remainingBalance = Math.max(0, totalPayable - p);

  return {
    monthlySalary: mSalary,
    bonus: b,
    salaryCut: c,
    finalSalary: currentMonthPayable,
    inventoryExpense,
    payments: p,
    previousWallet: prevW,
    wallet: prevW,
    totalPayable,
    remainingBalance,
  };
}
