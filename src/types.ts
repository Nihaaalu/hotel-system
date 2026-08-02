export interface Room {
  id: string | number;
  number: number;
  floor: number;
  type: string;
  room_number?: number;
  room_type?: string;
  bed_type?: string;
  capacity?: number;
  is_active?: boolean;
}

export interface Guest {
  id: string; // local guest uuid
  name: string;
  phone: string;
  address: string;
  idProof: string;
  createdAt: string;
  updatedAt: string;
  _synced?: boolean; // flag for firebase sync status
}

export interface Booking {
  id: string; // local booking uuid
  guestId: string;
  roomNumber: number;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  status: 'booked' | 'checked-in' | 'checked-out' | 'cancelled';
  totalAmount: number;
  advancePaid: number;
  paymentStatus?: 'paid' | 'pending';
  remarks: string;
  createdAt: string;
  updatedAt: string;
  _synced?: boolean; // flag for firebase sync status
  bookingGroupId?: string; // internal booking group ID
  // Irshad transfer tracking
  amountCollected?: number;
  transferredToIrshad?: number;
  transferToIrshad?: boolean;
  // Joined fields for display
  guestName?: string;
  guestPhone?: string;
  guestIdProof?: string;
}

export interface Payment {
  id: string; // local payment uuid
  bookingId: string;
  reservationId?: string;
  amount: number;
  totalAmount?: number;
  advancePaid?: number;
  amountCollected?: number;
  transferredToIrshad?: number;
  transferToIrshad?: boolean;
  balanceDueWallet?: boolean;
  remainingBalance?: number;
  paymentStatus?: 'paid' | 'pending' | 'balance_due';
  paymentDate: string; // ISO String
  paymentMethod: 'cash' | 'card' | 'upi' | 'net_banking';
  remarks: string;
  createdAt: string;
  _synced?: boolean; // flag for firebase sync status
}

export interface DueTransaction {
  id?: string;
  payment_id: string;
  reservation_id?: string;
  amount: number;
  payment_method: string;
  remarks?: string;
  created_at: string;
}

export interface CustomerDue {
  id: string; // payment id
  reservationId: string;
  bookingName: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  totalAmount: number;
  advancePaid: number;
  amountCollected: number;
  remainingBalance: number;
  balanceDueWallet: boolean;
  transferToIrshad?: boolean;
  transferredToIrshad?: number;
  paymentStatus: 'balance_due' | 'paid' | 'pending';
  createdAt: string;
}

export type ExpenseCategory =
  | 'Meat'
  | 'Groceries'
  | 'Cleaning'
  | 'Electricity Bill'
  | 'Laundry'
  | 'Raw Materials'
  | 'Electrical Items'
  | 'Furniture'
  | 'Improvement'
  | 'Miscellaneous'
  | 'Salary'
  | 'Rent'
  | 'Other';

export interface Expense {
  id: string;
  expenseDate: string; // YYYY-MM-DD
  category: ExpenseCategory;
  itemName?: string;   // optional item name field. If empty, falls back to category
  amount: number;
  remarks: string;
  paidBy?: 'resort' | 'irshad';
  createdAt: string;
}

export interface IrshadSettlement {
  id: string;
  transactionDate: string;
  transactionType: 'resort_paid_irshad' | 'irshad_paid_resort';
  amount: number;
  remarks?: string;
  createdAt: string;
}

export interface IrshadWalletSummary {
  expense_by_irshad: number;
  bookings_with_irshad: number;
  resort_paid: number;
  irshad_paid: number;
}

export interface IrshadWalletNetSummary {
  bookingTransferred: number;
  expenseByIrshad: number;
  settlementPaid: number;
  walletNet: number;
}

export interface SalaryEmployee {
  id: string;
  name: string;
  role: string;
  baseSalary: number;
  effectiveMonth: string; // YYYY-MM
  isActive: boolean;
  createdAt: string;
}

export interface SalaryHistory {
  id: string;
  employeeId: string;
  baseSalary: number;
  effectiveMonth: string; // YYYY-MM
  createdAt: string;
}

export interface EmployeeSalaryAdjustment {
  id: string;
  employeeId: string;
  month: string; // YYYY-MM
  type: 'bonus' | 'cut';
  amount: number;
  remarks: string;
  createdAt: string;
}

export interface EmployeeWalletBalance {
  employeeId: string;
  walletBalance: number;
}

export interface EmployeeWalletTransaction {
  id: string;
  employeeId: string;
  salaryMonth: string;
  transactionType: 'monthly_salary' | 'bonus' | 'salary_cut' | 'payment' | 'manual_adjustment';
  amount: number;
  paymentMethod?: string;
  remarks?: string;
  createdAt: string;
}

export interface SalaryPayment {
  id: string;
  employeeId: string;
  month: string; // YYYY-MM
  amount: number;
  paymentMethod: 'cash' | 'card' | 'upi' | 'net_banking';
  remarks: string;
  paymentDate: string; // YYYY-MM-DD
  createdAt: string;
}

export interface RentSetting {
  id: string;
  monthlyAmount: number;
  effectiveMonth: string; // YYYY-MM
  createdAt: string;
}

export interface RentPayment {
  id: string;
  month: string; // YYYY-MM
  amount: number;
  paymentMethod: 'cash' | 'card' | 'upi' | 'net_banking';
  remarks: string;
  paymentDate: string; // YYYY-MM-DD
  createdAt: string;
}

export interface DashboardStats {
  availableRoomsCount: number;
  occupiedRoomsCount: number;
  futureBookingsCount: number;
  todayCheckinsCount: number;
  todayCheckoutsCount: number;
  currentStayingCount: number;
  todayCollection: number;
  totalPendingBalance: number;
  // Financial totals
  totalBookingAmount?: number;
  totalAdvancePaid?: number;
  totalBalance?: number;
  // Expense totals
  todayExpenses?: number;
  monthExpenses?: number;
}
