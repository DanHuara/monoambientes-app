export enum UnitType {
  APARTMENT_MONTHLY = 'APARTMENT_MONTHLY',
  APARTMENT_DAILY = 'APARTMENT_DAILY',
  COMMERCIAL_MONTHLY = 'COMMERCIAL_MONTHLY',
}

export interface Unit {
  id: string;
  name: string;
  type: UnitType;
}

export enum InvoiceStatus {
  PENDING = 'PENDIENTE',
  PARTIAL = 'PARCIAL',
  PAID = 'PAGADO',
}

export type PaymentMethod = 'efectivo' | 'transferencia';

export interface Payment {
  id: string;
  amount: number;
  date: string; // ISO string
  payerName: string;
  method: PaymentMethod;
  observations?: string;
}

export type AdditionalCharges = {
  internet: number;
  furniture: number;
  other: number;
};

export interface Invoice {
  id: string;
  unitId: string;
  contractId: string;
  tenantName: string;
  period: string; // e.g., "2024-08"
  dueDate: string; // ISO string
  baseRent: number;
  additionalCharges: AdditionalCharges;
  totalAmount: number;
  balance: number;
  status: InvoiceStatus;
  payments: Payment[];
  reminderSent: boolean;
}

export interface Contract {
  id: string;
  unitId: string;
  tenantName: string;
  startDate: string; // ISO string
  endDate: string; // ISO string
  monthlyRent: number;
  additionalCharges: AdditionalCharges;
  // New deposit fields
  depositAmount: number;
  depositInstallments: number;
  depositBalance: number;
  depositStatus: InvoiceStatus;
  depositPayments: Payment[];
}

export enum BookingStatus {
  PENDING = 'PENDIENTE',
  PARTIAL = 'PARCIAL',
  PAID = 'PAGADO',
}

export interface Booking {
  id: string;
  unitId: string;
  guestName: string;
  startDate: string; // ISO string
  endDate: string; // ISO string
  guestCount: number;
  totalAmount: number;
  deposit: number;
  status: BookingStatus;
  balance: number;
  payments: Payment[];
}

export interface GlobalSettings {
  additionalCharges: AdditionalCharges;
  dailyRates: {
    p1: number;
    p2: number;
    p3: number;
    p4: number;
  };
  bookingDepositPercentage: number;
}
