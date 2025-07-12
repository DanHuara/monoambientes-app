
import { Unit, UnitType, GlobalSettings } from './types';

export const INITIAL_UNITS: Unit[] = [
  // 6 departamentos en alquiler mensual
  { id: 'am-1', name: 'Departamento 1', type: UnitType.APARTMENT_MONTHLY },
  { id: 'am-2', name: 'Departamento 2', type: UnitType.APARTMENT_MONTHLY },
  { id: 'am-3', name: 'Departamento 3', type: UnitType.APARTMENT_MONTHLY },
  { id: 'am-4', name: 'Departamento 4', type: UnitType.APARTMENT_MONTHLY },
  { id: 'am-5', name: 'Departamento 5', type: UnitType.APARTMENT_MONTHLY },
  { id: 'am-6', name: 'Departamento 6', type: UnitType.APARTMENT_MONTHLY },
  // 3 departamentos en alquiler diario
  { id: 'ad-1', name: 'Departamento Diario A', type: UnitType.APARTMENT_DAILY },
  { id: 'ad-2', name: 'Departamento Diario B', type: UnitType.APARTMENT_DAILY },
  { id: 'ad-3', name: 'Departamento Diario C', type: UnitType.APARTMENT_DAILY },
  // 2 locales comerciales en alquiler mensual
  { id: 'cm-1', name: 'Local Comercial 1', type: UnitType.COMMERCIAL_MONTHLY },
  { id: 'cm-2', name: 'Local Comercial 2', type: UnitType.COMMERCIAL_MONTHLY },
];

export const INITIAL_SETTINGS: GlobalSettings = {
  additionalCharges: {
    internet: 3000,
    furniture: 5000,
    other: 1500,
  },
  dailyRates: {
    p1: 10000,
    p2: 12000,
    p3: 14000,
    p4: 15000,
  },
  bookingDepositPercentage: 30,
};

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  [UnitType.APARTMENT_MONTHLY]: 'Alquiler Mensual',
  [UnitType.APARTMENT_DAILY]: 'Alquiler Diario',
  [UnitType.COMMERCIAL_MONTHLY]: 'Local Comercial Mensual',
};
