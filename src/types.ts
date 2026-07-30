export interface Room {
  id: string | number;
  number: number;
  floor: number;
  type: string;
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
  // Joined fields for display
  guestName?: string;
  guestPhone?: string;
  guestIdProof?: string;
}

export interface Payment {
  id: string; // local payment uuid
  bookingId: string;
  amount: number;
  totalAmount?: number;
  advancePaid?: number;
  paymentStatus?: 'paid' | 'pending';
  paymentDate: string; // ISO String
  paymentMethod: 'cash' | 'card' | 'upi' | 'net_banking';
  remarks: string;
  createdAt: string;
  _synced?: boolean; // flag for firebase sync status
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
  createdAt: string;
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
