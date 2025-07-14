
import React, { useState, useEffect, createContext, useContext, useCallback, useMemo, useRef } from 'react';
import { Unit, Contract, Invoice, Booking, GlobalSettings, Payment, UnitType, InvoiceStatus, BookingStatus } from './types';
import { INITIAL_UNITS, INITIAL_SETTINGS, UNIT_TYPE_LABELS } from './constants';
import { Home, FileText, Calendar, BedDouble, Settings, BarChart2, ArrowLeft, PlusCircle, Edit, Trash2, Send, DollarSign, Printer, FileDown, Upload, Download } from 'lucide-react';

// --- INDEXEDDB HELPERS ---
const DB_NAME = 'MonoambientesDB';
const DB_VERSION = 1;
const STORES = ['contracts', 'invoices', 'bookings', 'settings', 'app_settings'];

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            STORES.forEach(storeName => {
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: 'id' });
                }
            });
             // Special store for settings, which has a single entry
            if (!db.objectStoreNames.contains('app_settings')) {
                db.createObjectStore('app_settings', { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const dbAction = <T,>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    return new Promise(async (resolve, reject) => {
        const db = await openDB();
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = action(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(tx.error);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
    });
};


const db = {
    get: <T,>(storeName: string, id: string): Promise<T | undefined> => dbAction(storeName, 'readonly', store => store.get(id)),
    getAll: <T,>(storeName: string): Promise<T[]> => dbAction(storeName, 'readonly', store => store.getAll()),
    set: <T,>(storeName: string, data: T): Promise<IDBValidKey> => dbAction(storeName, 'readwrite', store => store.put(data)),
    delete: (storeName: string, id: string): Promise<void> => dbAction(storeName, 'readwrite', store => store.delete(id)),
    batchWrite: async (actions: { store: string; data?: any; deleteId?: string }[]): Promise<void> => {
        const db_ = await openDB();
        const storeNames = Array.from(new Set(actions.map(a => a.store)));
        const tx = db_.transaction(storeNames, 'readwrite');
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);

            actions.forEach(action => {
                const store = tx.objectStore(action.store);
                if (action.data) {
                    store.put(action.data);
                } else if (action.deleteId) {
                    store.delete(action.deleteId);
                }
            });
        });
    }
};


// --- DATA CONTEXT ---
const useAppData = () => {
    const [units] = useState<Unit[]>(INITIAL_UNITS); // Units are constant
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [settings, setSettings] = useState<GlobalSettings>(INITIAL_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);

    // Load all data from IndexedDB on initial mount
    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [loadedContracts, loadedInvoices, loadedBookings, loadedSettings] = await Promise.all([
                    db.getAll<Contract>('contracts'),
                    db.getAll<Invoice>('invoices'),
                    db.getAll<Booking>('bookings'),
                    db.get<GlobalSettings & {id: string}>('app_settings', 'main_settings')
                ]);

                setContracts(loadedContracts);
                setInvoices(loadedInvoices);
                setBookings(loadedBookings);
                
                if (loadedSettings) {
                    setSettings(loadedSettings);
                } else {
                    // If no settings exist, create the initial ones
                    await db.set('app_settings', { ...INITIAL_SETTINGS, id: 'main_settings' });
                    setSettings(INITIAL_SETTINGS);
                }

            } catch (error) {
                console.error("Failed to load data from IndexedDB", error);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    const addContract = useCallback(async (newContractData: Omit<Contract, 'id' | 'depositAmount' | 'depositBalance' | 'depositStatus' | 'depositPayments'>) => {
        const id = `contract-${Date.now()}`;
        const depositAmount = newContractData.monthlyRent;
        const fullContract: Contract = {
            ...newContractData,
            id,
            depositAmount,
            depositBalance: depositAmount,
            depositStatus: InvoiceStatus.PENDING,
            depositPayments: [],
        };

        const newInvoices: Invoice[] = [];
        let currentDate = new Date(fullContract.startDate + 'T12:00:00');
        const endDate = new Date(fullContract.endDate + 'T12:00:00');
        const contractStartDay = new Date(fullContract.startDate + 'T12:00:00').getDate();

        while (currentDate <= endDate) {
            const totalAmount = fullContract.monthlyRent + Object.values(fullContract.additionalCharges).reduce((a, b) => a + b, 0);
            const invId = `invoice-${id}-${new Date(currentDate.getFullYear(), currentDate.getMonth()).getTime()}`;
            newInvoices.push({
                id: invId,
                contractId: id,
                unitId: fullContract.unitId,
                tenantName: fullContract.tenantName,
                period: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
                dueDate: new Date(currentDate.getFullYear(), currentDate.getMonth(), contractStartDay).toISOString(),
                baseRent: fullContract.monthlyRent,
                additionalCharges: fullContract.additionalCharges,
                totalAmount: totalAmount,
                balance: totalAmount,
                status: InvoiceStatus.PENDING,
                payments: [],
                reminderSent: false,
            });
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        const batchActions = newInvoices.map(inv => ({ store: 'invoices', data: inv }));
        batchActions.push({ store: 'contracts', data: fullContract });
        await db.batchWrite(batchActions);
        
        setContracts(prev => [...prev, fullContract]);
        setInvoices(prev => [...prev, ...newInvoices]);
    }, []);
    
    // ... all other data modification functions adapted for IndexedDB
    const updateContract = useCallback(async (updatedContract: Contract) => {
        const originalContract = contracts.find(c => c.id === updatedContract.id);
        if (!originalContract) return;

        let finalUpdatedContract = { ...updatedContract };
    
        // Recalculate deposit if rent changes and deposit isn't fully paid
        if (originalContract.depositStatus !== InvoiceStatus.PAID && originalContract.monthlyRent !== finalUpdatedContract.monthlyRent) {
            const paidAmount = originalContract.depositAmount - originalContract.depositBalance;
            const newDepositAmount = finalUpdatedContract.monthlyRent;
            const newBalance = newDepositAmount - paidAmount;
            const newStatus = newBalance <= 0 ? InvoiceStatus.PAID : (paidAmount > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.PENDING);
            
            finalUpdatedContract = { ...finalUpdatedContract, depositAmount: newDepositAmount, depositBalance: newBalance, depositStatus: newStatus };
        }
    
        const existingInvoices = invoices.filter(i => i.contractId === updatedContract.id);
        const batchActions: { store: string; data?: any; deleteId?: string }[] = [{ store: 'contracts', data: finalUpdatedContract }];
        const updatedInvoices: Invoice[] = [];
        const invoicesToDelete: string[] = [];

        const newContractPeriods = new Set<string>();
        let tempDate = new Date(finalUpdatedContract.startDate + 'T12:00:00');
        const endDate = new Date(finalUpdatedContract.endDate + 'T12:00:00');
        while(tempDate <= endDate) {
            newContractPeriods.add(`${tempDate.getFullYear()}-${String(tempDate.getMonth() + 1).padStart(2, '0')}`);
            tempDate.setMonth(tempDate.getMonth() + 1);
        }
        
        const contractStartDay = new Date(finalUpdatedContract.startDate + 'T12:00:00').getDate();
        
        // Find invoices to delete or update
        existingInvoices.forEach(inv => {
            if (newContractPeriods.has(inv.period)) {
                const [year, month] = inv.period.split('-').map(Number);
                const newTotalAmount = finalUpdatedContract.monthlyRent + Object.values(finalUpdatedContract.additionalCharges).reduce((a, b) => a + b, 0);
                let updatedInvoice = { ...inv };
                
                updatedInvoice.tenantName = finalUpdatedContract.tenantName;
                updatedInvoice.dueDate = new Date(year, month - 1, contractStartDay).toISOString();
                
                if (updatedInvoice.status !== InvoiceStatus.PAID) {
                    const paidAmount = updatedInvoice.totalAmount - updatedInvoice.balance;
                    const newBalance = newTotalAmount - paidAmount;
                    const newStatus = newBalance <= 0 ? InvoiceStatus.PAID : (paidAmount > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.PENDING);
                    
                    updatedInvoice = { ...updatedInvoice, baseRent: finalUpdatedContract.monthlyRent, additionalCharges: finalUpdatedContract.additionalCharges, totalAmount: newTotalAmount, balance: newBalance, status: newStatus };
                }
                updatedInvoices.push(updatedInvoice);
                batchActions.push({ store: 'invoices', data: updatedInvoice });
                newContractPeriods.delete(inv.period);
            } else {
                invoicesToDelete.push(inv.id);
                batchActions.push({ store: 'invoices', deleteId: inv.id });
            }
        });

        // Create new invoices
        newContractPeriods.forEach(period => {
            const [year, month] = period.split('-').map(Number);
            const totalAmount = finalUpdatedContract.monthlyRent + Object.values(finalUpdatedContract.additionalCharges).reduce((a, b) => a + b, 0);
            const newInvoiceId = `invoice-${finalUpdatedContract.id}-${new Date(year, month - 1).getTime()}`;
            const newInvoice: Invoice = {
                id: newInvoiceId,
                contractId: finalUpdatedContract.id,
                unitId: finalUpdatedContract.unitId,
                tenantName: finalUpdatedContract.tenantName,
                period,
                dueDate: new Date(year, month - 1, contractStartDay).toISOString(),
                baseRent: finalUpdatedContract.monthlyRent,
                additionalCharges: finalUpdatedContract.additionalCharges,
                totalAmount,
                balance: totalAmount,
                status: InvoiceStatus.PENDING,
                payments: [],
                reminderSent: false,
            };
            updatedInvoices.push(newInvoice);
            batchActions.push({ store: 'invoices', data: newInvoice });
        });
        
        await db.batchWrite(batchActions);
        setContracts(prev => prev.map(c => c.id === finalUpdatedContract.id ? finalUpdatedContract : c));
        setInvoices(prev => [...prev.filter(i => !invoicesToDelete.includes(i.id) && i.contractId !== updatedContract.id), ...updatedInvoices]);

    }, [contracts, invoices]);

    const addPayment = useCallback(async (invoiceId: string, payment: Omit<Payment, 'id'>) => {
        const invoice = invoices.find(inv => inv.id === invoiceId);
        if (!invoice) return;

        const updatedInvoice = { ...invoice };
        updatedInvoice.payments = [...updatedInvoice.payments, { ...payment, id: `payment-${Date.now()}` }];
        const paidAmount = updatedInvoice.payments.reduce((sum, p) => sum + p.amount, 0);
        updatedInvoice.balance = updatedInvoice.totalAmount - paidAmount;
        updatedInvoice.status = updatedInvoice.balance <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;

        await db.set('invoices', updatedInvoice);
        setInvoices(prev => prev.map(inv => inv.id === invoiceId ? updatedInvoice : inv));
    }, [invoices]);

    const addDepositPayment = useCallback(async (contractId: string, payment: Omit<Payment, 'id'>) => {
        const contract = contracts.find(c => c.id === contractId);
        if (!contract) return;

        const updatedContract = { ...contract };
        updatedContract.depositPayments = [...updatedContract.depositPayments, { ...payment, id: `payment-deposit-${Date.now()}` }];
        const paidAmount = updatedContract.depositPayments.reduce((sum, p) => sum + p.amount, 0);
        updatedContract.depositBalance = updatedContract.depositAmount - paidAmount;
        updatedContract.depositStatus = updatedContract.depositBalance <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;
        
        await db.set('contracts', updatedContract);
        setContracts(prev => prev.map(c => c.id === contractId ? updatedContract : c));
    }, [contracts]);

    const updateSettings = useCallback(async (newSettings: GlobalSettings) => {
        const settingsToSave = { ...newSettings, id: 'main_settings' };
        await db.set('app_settings', settingsToSave);
        setSettings(newSettings);
    }, []);

    const addBooking = useCallback(async (newBookingData: Omit<Booking, 'id' | 'status' | 'balance' | 'payments'>) => {
        const id = `booking-${Date.now()}`;
        const fullBooking: Booking = { ...newBookingData, id, payments: [], balance: newBookingData.totalAmount, status: BookingStatus.PENDING };
        await db.set('bookings', fullBooking);
        setBookings(prev => [...prev, fullBooking]);
    }, []);
    
    const addBookingPayment = useCallback(async (bookingId: string, payment: Omit<Payment, 'id'>) => {
        const booking = bookings.find(book => book.id === bookingId);
        if (!booking) return;

        const updatedBooking = { ...booking };
        updatedBooking.payments = [...updatedBooking.payments, { ...payment, id: `payment-booking-${Date.now()}` }];
        const paidAmount = updatedBooking.payments.reduce((sum, p) => sum + p.amount, 0);
        updatedBooking.balance = updatedBooking.totalAmount - paidAmount;
        updatedBooking.status = updatedBooking.balance <= 0 ? BookingStatus.PAID : BookingStatus.PARTIAL;
        
        await db.set('bookings', updatedBooking);
        setBookings(prev => prev.map(b => b.id === bookingId ? updatedBooking : b));
    }, [bookings]);

    const deleteContract = useCallback(async (contractId: string) => {
        const invoicesToDelete = invoices.filter(i => i.contractId === contractId).map(i => i.id);
        const batchActions = invoicesToDelete.map(id => ({ store: 'invoices', deleteId: id }));
        batchActions.push({ store: 'contracts', deleteId: contractId });
        await db.batchWrite(batchActions);

        setContracts(prev => prev.filter(c => c.id !== contractId));
        setInvoices(prev => prev.filter(i => i.contractId !== contractId));
    }, [invoices]);

    const deleteBooking = useCallback(async (bookingId: string) => {
        await db.delete('bookings', bookingId);
        setBookings(prev => prev.filter(b => b.id !== bookingId));
    }, []);

    const setReminderSent = useCallback(async (invoiceId: string) => {
        const invoice = invoices.find(inv => inv.id === invoiceId);
        if (!invoice) return;
        const updatedInvoice = { ...invoice, reminderSent: true };
        await db.set('invoices', updatedInvoice);
        setInvoices(prev => prev.map(inv => inv.id === invoiceId ? updatedInvoice : inv));
    }, [invoices]);

    // Data Management
    const exportData = useCallback(() => {
        const data = { contracts, invoices, bookings, settings };
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
        const link = document.createElement("a");
        link.href = jsonString;
        link.download = `monoambientes-backup-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
    }, [contracts, invoices, bookings, settings]);

    const importData = useCallback(async (file: File) => {
        if (!window.confirm("¿Seguro que querés restaurar los datos? Esto reemplazará toda la información actual.")) {
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                if (data.contracts && data.invoices && data.bookings && data.settings) {
                    setIsLoading(true);

                    // Clear existing stores before writing new data
                    const db_ = await openDB();
                    const clearTx = db_.transaction(['contracts', 'invoices', 'bookings', 'app_settings'], 'readwrite');
                    clearTx.objectStore('contracts').clear();
                    clearTx.objectStore('invoices').clear();
                    clearTx.objectStore('bookings').clear();
                    clearTx.objectStore('app_settings').clear();

                    await new Promise(resolve => clearTx.oncomplete = resolve);
                    
                    const batchActions: { store: string; data: any }[] = [];
                    data.contracts.forEach((c: Contract) => batchActions.push({ store: 'contracts', data: c }));
                    data.invoices.forEach((i: Invoice) => batchActions.push({ store: 'invoices', data: i }));
                    data.bookings.forEach((b: Booking) => batchActions.push({ store: 'bookings', data: b }));
                    batchActions.push({ store: 'app_settings', data: { ...data.settings, id: 'main_settings' } });

                    await db.batchWrite(batchActions);

                    setContracts(data.contracts);
                    setInvoices(data.invoices);
                    setBookings(data.bookings);
                    setSettings(data.settings);
                    
                    setIsLoading(false);
                    alert("Datos restaurados con éxito!");
                } else {
                    alert("El archivo de backup parece ser inválido.");
                }
            } catch (error) {
                console.error("Error al restaurar datos:", error);
                alert("Error al restaurar datos. Verificá que el archivo sea correcto.");
                setIsLoading(false);
            }
        };
        reader.readAsText(file);
    }, []);

    return { units, contracts, invoices, bookings, settings, isLoading, addContract, updateContract, addPayment, addDepositPayment, updateSettings, addBooking, addBookingPayment, deleteContract, deleteBooking, setReminderSent, exportData, importData };
};

const AppContext = createContext<ReturnType<typeof useAppData> | null>(null);
const useApp = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error("useApp must be used within an AppProvider");
    return context;
};

// --- HELPER COMPONENTS ---
type View = 'DASHBOARD' | 'MONTHLY' | 'DAILY' | 'CALENDAR' | 'REPORTS' | 'SETTINGS';

const Page: React.FC<{ title: string; onBack: () => void; children: React.ReactNode; actions?: React.ReactNode }> = ({ title, onBack, children, actions }) => (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-700 transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">{title}</h1>
            </div>
            <div className="flex items-center gap-2">{actions}</div>
        </header>
        <main>{children}</main>
    </div>
);

const Card: React.FC<{ children: React.ReactNode; className?: string; }> = ({ children, className }) => (
    <div className={`bg-gray-800 rounded-lg shadow-lg p-4 sm:p-6 ${className}`}>{children}</div>
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { 
    variant?: 'primary' | 'secondary' | 'danger' 
};
const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', className, ...props }) => {
    const baseClasses = "flex items-center justify-center gap-2 px-4 py-2 rounded-md font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
    const variantClasses = {
        primary: 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md',
        secondary: 'bg-gray-600 text-white hover:bg-gray-500',
        danger: 'bg-red-600 text-white hover:bg-red-500',
    };
    return <button {...props} className={`${baseClasses} ${variantClasses[variant]} ${className}`}>{children}</button>;
};

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; }> = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
                <header className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold">{title}</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-700">&times;</button>
                </header>
                <div className="p-6 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
};
const Input: React.FC<InputProps> = ({ label, ...props }) => (
    <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        <input {...props} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
    </div>
);

const getStatusChip = (status: InvoiceStatus | BookingStatus) => {
    const styles: Record<string, string> = {
        [InvoiceStatus.PENDING]: 'bg-yellow-500/20 text-yellow-300',
        [InvoiceStatus.PARTIAL]: 'bg-blue-500/20 text-blue-300',
        [InvoiceStatus.PAID]: 'bg-green-500/20 text-green-300',
    };
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status]}`}>{status}</span>;
};

// All the specific views (Dashboard, MonthlyView, etc.) are largely the same, but with auth/user logic removed.
// I will include them here for completeness.

const Dashboard: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
    const { invoices } = useApp();
    const pendingInvoices = invoices.filter(i => i.status === InvoiceStatus.PENDING || i.status === InvoiceStatus.PARTIAL).length;

    const navItems = [
        { view: 'MONTHLY', label: 'Alquileres Mensuales', icon: FileText, desc: 'Gestionar contratos y pagos' },
        { view: 'DAILY', label: 'Alquileres Diarios', icon: BedDouble, desc: 'Gestionar reservas y tarifas' },
        { view: 'CALENDAR', label: 'Calendario y Avisos', icon: Calendar, desc: 'Vencimientos y recordatorios' },
        { view: 'REPORTS', label: 'Reportes', icon: BarChart2, desc: 'Exportar datos financieros' },
        { view: 'SETTINGS', label: 'Configuración', icon: Settings, desc: 'Tarifas y gestión de datos' },
    ];

    return (
        <div className="p-4 sm:p-6">
            <header className="text-center mb-8 relative">
                <h1 className="text-4xl font-extrabold text-white tracking-tight">Monoambientes Chamical</h1>
                <p className="text-gray-400 mt-2">Panel de Administración</p>
                {pendingInvoices > 0 && 
                    <div className="mt-4 inline-block bg-yellow-500/20 text-yellow-200 px-4 py-2 rounded-full">
                        <span className="font-bold">{pendingInvoices}</span> {pendingInvoices === 1 ? 'factura pendiente' : 'facturas pendientes'}
                    </div>
                }
            </header>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {navItems.map(item => (
                    <button key={item.view} onClick={() => setView(item.view as View)} className="bg-gray-800 p-6 rounded-lg text-left hover:bg-gray-700/80 hover:scale-[1.02] transition-all duration-200 shadow-lg border border-gray-700">
                        <item.icon className="w-8 h-8 text-indigo-400 mb-3" />
                        <h2 className="text-lg font-bold text-white">{item.label}</h2>
                        <p className="text-sm text-gray-400 mt-1">{item.desc}</p>
                    </button>
                ))}
            </div>
        </div>
    );
};

const MonthlyView: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
    const { units, contracts, invoices, addContract, updateContract, addPayment, addDepositPayment, deleteContract } = useApp();
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
    const [isContractModalOpen, setContractModalOpen] = useState(false);
    const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
    const [isDepositModalOpen, setDepositModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
    const [editingContract, setEditingContract] = useState<Contract | null>(null);

    const monthlyUnits = units.filter(u => u.type === UnitType.APARTMENT_MONTHLY || u.type === UnitType.COMMERCIAL_MONTHLY);
    
    const unitContracts = selectedUnit ? contracts.filter(c => c.unitId === selectedUnit.id).sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()) : [];
    
    const unitInvoices = selectedUnit 
        ? invoices
            .filter(i => i.unitId === selectedUnit.id)
            .sort((a, b) => {
                const isAPaid = a.status === InvoiceStatus.PAID;
                const isBPaid = b.status === InvoiceStatus.PAID;
                if (isAPaid && !isBPaid) return 1;
                if (!isAPaid && isBPaid) return -1;
                if (!isAPaid) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                return b.period.localeCompare(a.period);
            })
        : [];
    
    const handleAddPayment = (paymentData: {amount: number; payerName: string; date: string}) => {
        if(selectedInvoice) {
            addPayment(selectedInvoice.id, paymentData);
            setPaymentModalOpen(false);
            setSelectedInvoice(null);
        }
    };

    const handleAddDepositPayment = (paymentData: {amount: number; payerName: string; date: string}) => {
        if (selectedContract) {
            addDepositPayment(selectedContract.id, paymentData);
            setDepositModalOpen(false);
            setSelectedContract(null);
        }
    };

    const handleOpenContractModal = (contract: Contract | null) => {
        setEditingContract(contract);
        setContractModalOpen(true);
    };

    return (
        <Page title="Alquileres Mensuales" onBack={() => selectedUnit ? setSelectedUnit(null) : setView('DASHBOARD')}>
            {!selectedUnit ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {monthlyUnits.map(unit => (
                        <Card key={unit.id} className="cursor-pointer hover:border-indigo-500 border-2 border-transparent transition-colors" >
                            <button onClick={() => setSelectedUnit(unit)} className="w-full text-left">
                                <h3 className="text-xl font-bold">{unit.name}</h3>
                                <p className="text-sm text-gray-400">{UNIT_TYPE_LABELS[unit.type]}</p>
                            </button>
                        </Card>
                    ))}
                </div>
            ) : (
                <div>
                    <Card>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold">{selectedUnit.name}</h2>
                            <Button onClick={() => handleOpenContractModal(null)}><PlusCircle size={16}/> Nuevo Contrato</Button>
                        </div>

                        {/* Contracts List */}
                        <div className="mb-6">
                            <h3 className="text-xl font-semibold mb-2">Contratos</h3>
                            <div className="space-y-3">
                                {unitContracts.length > 0 ? unitContracts.map(c => (
                                    <div key={c.id} className="bg-gray-700 p-3 rounded-md">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-bold">{c.tenantName}</p>
                                                <p className="text-sm text-gray-300">
                                                    {new Date(c.startDate  + 'T12:00:00').toLocaleDateString()} - {new Date(c.endDate + 'T12:00:00').toLocaleDateString()}
                                                </p>
                                            </div>
                                            <div className="flex items-center flex-shrink-0">
                                                <button onClick={() => handleOpenContractModal(c)} className="p-2 text-gray-400 hover:text-indigo-400 transition-colors"><Edit size={18}/></button>
                                                <button onClick={() => window.confirm('¿Seguro que querés borrar este contrato y todas sus facturas?') && deleteContract(c.id)} className="p-2 text-gray-400 hover:text-red-400 transition-colors"><Trash2 size={18}/></button>
                                            </div>
                                        </div>
                                        {c.depositAmount > 0 && (
                                            <div className="mt-3 pt-3 border-t border-gray-600 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                                <div>
                                                    <p className="text-sm font-semibold">Depósito de Garantía</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {getStatusChip(c.depositStatus)}
                                                        <span className="text-sm text-gray-300">Saldo: ${c.depositBalance.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                                <Button 
                                                    variant="secondary" 
                                                    className="px-2 py-1 text-sm self-start sm:self-center"
                                                    onClick={() => { setSelectedContract(c); setDepositModalOpen(true); }} 
                                                    disabled={c.depositStatus === InvoiceStatus.PAID}
                                                >
                                                    Pagar Depósito
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )) : <p className="text-gray-400">No hay contratos para esta unidad.</p>}
                            </div>
                        </div>

                        {/* Invoices List */}
                        <div>
                            <h3 className="text-xl font-semibold mb-2">Facturas</h3>
                            <div className="space-y-2">
                            {unitInvoices.length > 0 ? unitInvoices.map(inv => (
                                <div key={inv.id} className="bg-gray-700/50 p-3 rounded-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold">{inv.tenantName}</span>
                                            {getStatusChip(inv.status)}
                                        </div>
                                        <p className="text-sm text-gray-300">Período: {inv.period} | Vence: {new Date(inv.dueDate).toLocaleDateString()}</p>
                                        <p className="text-sm text-gray-400">Total: ${inv.totalAmount.toLocaleString()} | Saldo: ${inv.balance.toLocaleString()}</p>
                                    </div>
                                    <Button onClick={() => { setSelectedInvoice(inv); setPaymentModalOpen(true); }} variant="secondary" className="self-start sm:self-center" disabled={inv.status === InvoiceStatus.PAID}>
                                        <DollarSign size={16}/> Registrar Pago
                                    </Button>
                                </div>
                            )) : <p className="text-gray-400">No hay facturas para esta unidad.</p>}
                            </div>
                        </div>
                    </Card>
                </div>
            )}
            <ContractFormModal 
                isOpen={isContractModalOpen} 
                onClose={() => { setContractModalOpen(false); setEditingContract(null); }} 
                unitId={selectedUnit?.id} 
                addContract={addContract} 
                updateContract={updateContract}
                contractToEdit={editingContract}
            />
            <PaymentModal isOpen={isPaymentModalOpen} onClose={() => setPaymentModalOpen(false)} invoice={selectedInvoice} onAddPayment={handleAddPayment} />
            <DepositPaymentModal isOpen={isDepositModalOpen} onClose={() => setDepositModalOpen(false)} contract={selectedContract} onAddDepositPayment={handleAddDepositPayment} />
        </Page>
    );
};

const ContractFormModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    unitId?: string; 
    addContract: (contract: Omit<Contract, 'id' | 'depositAmount' | 'depositBalance' | 'depositStatus' | 'depositPayments'>) => void;
    updateContract: (contract: Contract) => void;
    contractToEdit?: Contract | null;
}> = ({ isOpen, onClose, unitId, addContract, updateContract, contractToEdit }) => {
    const { settings } = useApp();
    const [tenantName, setTenantName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [monthlyRent, setMonthlyRent] = useState(0);
    const [extraCharges, setExtraCharges] = useState(settings.additionalCharges);
    const [depositInstallments, setDepositInstallments] = useState(1);

    const isEditMode = !!contractToEdit;

    useEffect(() => {
        if (isOpen) {
            if (isEditMode && contractToEdit) {
                setTenantName(contractToEdit.tenantName);
                setStartDate(contractToEdit.startDate);
                setEndDate(contractToEdit.endDate);
                setMonthlyRent(contractToEdit.monthlyRent);
                setExtraCharges(contractToEdit.additionalCharges);
                setDepositInstallments(contractToEdit.depositInstallments || 1);
            } else {
                setTenantName('');
                setStartDate('');
                setEndDate('');
                setMonthlyRent(0);
                setExtraCharges(settings.additionalCharges);
                setDepositInstallments(1);
            }
        }
    }, [isOpen, contractToEdit, isEditMode, settings]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!unitId || !tenantName || !startDate || !endDate || monthlyRent < 0) {
            alert('Por favor, completá todos los campos.'); return;
        }

        const baseContractData = { unitId, tenantName, startDate, endDate, monthlyRent, additionalCharges: extraCharges, depositInstallments };

        if (isEditMode && contractToEdit) {
            updateContract({ ...contractToEdit, ...baseContractData });
        } else {
            addContract(baseContractData as Omit<Contract, 'id' | 'depositAmount' | 'depositBalance' | 'depositStatus' | 'depositPayments'>);
        }
        
        onClose();
    };
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? "Editar Contrato" : "Nuevo Contrato Mensual"}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input label="Nombre del Inquilino" type="text" value={tenantName} onChange={e => setTenantName(e.target.value)} required />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Fecha de Inicio" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                    <Input label="Fecha de Fin" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
                </div>
                
                <h4 className="text-lg font-semibold border-t border-gray-700 pt-4 mt-4">Detalles del Alquiler</h4>
                <Input label="Monto Base Mensual" type="number" value={monthlyRent} onChange={e => setMonthlyRent(Number(e.target.value))} required />
                
                <h4 className="text-lg font-semibold border-t border-gray-700 pt-4 mt-4">Depósito de Garantía</h4>
                <p className="text-sm text-gray-300 bg-gray-700/50 p-2 rounded-md">Monto del depósito: <span className="font-bold">${monthlyRent.toLocaleString()}</span> (igual al monto base mensual)</p>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Cuotas del Depósito</label>
                    <select value={depositInstallments} onChange={e => setDepositInstallments(Number(e.target.value))} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" required>
                        <option value={1}>1 cuota</option> <option value={2}>2 cuotas</option> <option value={3}>3 cuotas</option>
                    </select>
                </div>

                <h4 className="text-lg font-semibold border-t border-gray-700 pt-4 mt-4">Gastos Adicionales Recurrentes</h4>
                <div className="space-y-2">
                    {Object.entries(extraCharges).map(([key, value]) => (
                        <Input key={key} label={key.charAt(0).toUpperCase() + key.slice(1)} type="number" value={value} onChange={e => setExtraCharges(prev => ({...prev, [key]: Number(e.target.value)}))} />
                    ))}
                </div>
                <div className="flex justify-end gap-2 pt-4">
                    <Button onClick={onClose} variant="secondary" type="button">Cancelar</Button>
                    <Button type="submit">{isEditMode ? "Guardar Cambios" : "Crear Contrato"}</Button>
                </div>
            </form>
        </Modal>
    );
};

const PaymentModal: React.FC<{isOpen: boolean; onClose: () => void; invoice: Invoice | null; onAddPayment: (data: {amount: number; payerName: string; date: string}) => void;}> = ({isOpen, onClose, invoice, onAddPayment}) => {
    const [amount, setAmount] = useState(0);
    const [payerName, setPayerName] = useState('');
    const [date, setDate] = useState('');

    useEffect(() => {
        if(invoice){
            setAmount(invoice.balance);
            setPayerName(invoice.tenantName);
            setDate(new Date().toISOString().split('T')[0]);
        }
    }, [invoice]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(amount > 0 && payerName && date) {
            onAddPayment({amount, payerName, date: new Date(date + 'T12:00:00').toISOString()});
            onClose();
        }
    };
    
    if(!invoice) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Registrar Pago para ${invoice.tenantName}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-gray-700 p-3 rounded-md">
                    <p>Período: <span className="font-semibold">{invoice.period}</span></p>
                    <p>Monto Total: <span className="font-semibold">${invoice.totalAmount.toLocaleString()}</span></p>
                    <p>Saldo Pendiente: <span className="font-semibold">${invoice.balance.toLocaleString()}</span></p>
                </div>
                <Input label="Nombre del Pagador" type="text" value={payerName} onChange={e => setPayerName(e.target.value)} required />
                <Input label="Monto a Pagar" type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} required min="0.01" step="0.01"/>
                <Input label="Fecha del Pago" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                <div className="flex justify-end gap-2 pt-4">
                    <Button onClick={onClose} variant="secondary" type="button">Cancelar</Button>
                    <Button type="submit">Registrar Pago</Button>
                </div>
            </form>
        </Modal>
    );
};

const DepositPaymentModal: React.FC<{isOpen: boolean; onClose: () => void; contract: Contract | null; onAddDepositPayment: (data: {amount: number; payerName: string; date: string}) => void;}> = ({isOpen, onClose, contract, onAddDepositPayment}) => {
    const [amount, setAmount] = useState(0);
    const [payerName, setPayerName] = useState('');
    const [date, setDate] = useState('');

    useEffect(() => {
        if(contract){
            setAmount(contract.depositBalance);
            setPayerName(contract.tenantName);
            setDate(new Date().toISOString().split('T')[0]);
        }
    }, [contract]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(amount > 0 && payerName && date && contract) {
            onAddDepositPayment({amount, payerName, date: new Date(date + 'T12:00:00').toISOString()});
        }
        onClose();
    };
    
    if(!contract) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Pagar Depósito para ${contract.tenantName}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-gray-700 p-3 rounded-md">
                    <p>Contrato: <span className="font-semibold">{new Date(contract.startDate + 'T12:00:00').toLocaleDateString()} - {new Date(contract.endDate + 'T12:00:00').toLocaleDateString()}</span></p>
                    <p>Monto Total Depósito: <span className="font-semibold">${contract.depositAmount.toLocaleString()}</span></p>
                    <p>Saldo Pendiente: <span className="font-semibold">${contract.depositBalance.toLocaleString()}</span></p>
                </div>
                <Input label="Nombre del Pagador" type="text" value={payerName} onChange={e => setPayerName(e.target.value)} required />
                <Input label="Monto a Pagar" type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} required min="0.01" step="0.01"/>
                <Input label="Fecha del Pago" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                <div className="flex justify-end gap-2 pt-4">
                    <Button onClick={onClose} variant="secondary" type="button">Cancelar</Button>
                    <Button type="submit">Registrar Pago</Button>
                </div>
            </form>
        </Modal>
    );
};

const BookingPaymentModal: React.FC<{isOpen: boolean; onClose: () => void; booking: Booking | null; onAddBookingPayment: (data: {amount: number; payerName: string; date: string}) => void;}> = ({isOpen, onClose, booking, onAddBookingPayment}) => {
    const [amount, setAmount] = useState(0);
    const [payerName, setPayerName] = useState('');
    const [date, setDate] = useState('');

    useEffect(() => {
        if(booking){
            setAmount(booking.balance);
            setPayerName(booking.guestName);
            setDate(new Date().toISOString().split('T')[0]);
        }
    }, [booking]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(amount > 0 && payerName && date) {
            onAddBookingPayment({amount, payerName, date: new Date(date + 'T12:00:00').toISOString()});
            onClose();
        }
    };

    if(!booking) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Registrar Pago para ${booking.guestName}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-gray-700 p-3 rounded-md">
                    <p>Reserva: <span className="font-semibold">{new Date(booking.startDate + 'T12:00:00').toLocaleDateString()} - {new Date(booking.endDate + 'T12:00:00').toLocaleDateString()}</span></p>
                    <p>Monto Total: <span className="font-semibold">${booking.totalAmount.toLocaleString()}</span></p>
                    <p>Saldo Pendiente: <span className="font-semibold">${booking.balance.toLocaleString()}</span></p>
                </div>
                <Input label="Nombre del Pagador" type="text" value={payerName} onChange={e => setPayerName(e.target.value)} required />
                <Input label="Monto a Pagar" type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} required min="0.01" step="0.01"/>
                <Input label="Fecha del Pago" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                <div className="flex justify-end gap-2 pt-4">
                    <Button onClick={onClose} variant="secondary" type="button">Cancelar</Button>
                    <Button type="submit">Registrar Pago</Button>
                </div>
            </form>
        </Modal>
    );
};

const DailyView: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
    const { units, bookings, addBooking, deleteBooking, addBookingPayment } = useApp();
    const [isBookingModalOpen, setBookingModalOpen] = useState(false);
    const [isBookingPaymentModalOpen, setBookingPaymentModalOpen] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

    const dailyUnits = units.filter(u => u.type === UnitType.APARTMENT_DAILY);
    
    const bookingsByUnit = useMemo(() => {
        return bookings.reduce((acc, booking) => {
            if (!acc[booking.unitId]) { acc[booking.unitId] = []; }
            acc[booking.unitId].push(booking);
            return acc;
        }, {} as Record<string, Booking[]>);
    }, [bookings]);

    const handleAddBookingPayment = (paymentData: {amount: number; payerName: string; date: string}) => {
        if (selectedBooking) {
            addBookingPayment(selectedBooking.id, paymentData);
            setBookingPaymentModalOpen(false);
        }
    };

    return (
        <Page title="Alquileres Diarios" onBack={() => setView('DASHBOARD')} actions={<Button onClick={() => setBookingModalOpen(true)}><PlusCircle size={16} /> Nueva Reserva</Button>}>
            <div className="space-y-6">
                {dailyUnits.map(unit => (
                    <Card key={unit.id}>
                        <h3 className="text-xl font-bold mb-3">{unit.name}</h3>
                        <div className="space-y-2">
                        {(bookingsByUnit[unit.id] || []).sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()).map(booking => (
                            <div key={booking.id} className="bg-gray-700/50 p-3 rounded-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3">
                                        <p className="font-bold">{booking.guestName}</p>
                                        {getStatusChip(booking.status)}
                                    </div>
                                    <p className="text-sm text-gray-300">{new Date(booking.startDate + 'T12:00:00').toLocaleDateString()} - {new Date(booking.endDate + 'T12:00:00').toLocaleDateString()}</p>
                                    <p className="text-sm text-gray-400">Total: ${booking.totalAmount.toLocaleString()} | Saldo: ${booking.balance.toLocaleString()}</p>
                                </div>
                                <div className="flex items-center gap-2 self-start sm:self-center">
                                    <Button onClick={() => { setSelectedBooking(booking); setBookingPaymentModalOpen(true); }} variant="secondary" disabled={booking.status === BookingStatus.PAID}><DollarSign size={16}/> Registrar Pago</Button>
                                    <button onClick={() => window.confirm('¿Seguro?') && deleteBooking(booking.id)} className="p-2 text-gray-400 hover:text-red-400"><Trash2 size={18}/></button>
                                </div>
                            </div>
                        ))}
                        {!(bookingsByUnit[unit.id] || []).length && <p className="text-gray-400">No hay reservas para esta unidad.</p>}
                        </div>
                    </Card>
                ))}
            </div>
            <BookingFormModal isOpen={isBookingModalOpen} onClose={() => setBookingModalOpen(false)} units={dailyUnits} addBooking={addBooking} />
            <BookingPaymentModal isOpen={isBookingPaymentModalOpen} onClose={() => setBookingPaymentModalOpen(false)} booking={selectedBooking} onAddBookingPayment={handleAddBookingPayment} />
        </Page>
    );
};

const BookingFormModal: React.FC<{ isOpen: boolean; onClose: () => void; units: Unit[]; addBooking: (booking: Omit<Booking, 'id' | 'status' | 'balance' | 'payments'>) => void; }> = ({ isOpen, onClose, units, addBooking }) => {
    const { settings } = useApp();
    const [unitId, setUnitId] = useState('');
    const [guestName, setGuestName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [guestCount, setGuestCount] = useState(1);
    const [totalAmount, setTotalAmount] = useState(0);
    const [deposit, setDeposit] = useState(0);
    
    const suggestedAmount = useMemo(() => {
        if (!startDate || !endDate || guestCount < 1) return 0;
        const nights = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 3600 * 24));
        if (nights <= 0) return 0;
        const rateKey = `p${guestCount}` as keyof typeof settings.dailyRates;
        return nights * (settings.dailyRates[rateKey] || settings.dailyRates.p4);
    }, [startDate, endDate, guestCount, settings.dailyRates]);
    
    const suggestedDeposit = useMemo(() => Math.round((totalAmount * settings.bookingDepositPercentage) / 100), [totalAmount, settings.bookingDepositPercentage]);

    useEffect(() => { setTotalAmount(suggestedAmount > 0 ? suggestedAmount : 0); }, [suggestedAmount]);
    useEffect(() => { setDeposit(suggestedDeposit); }, [suggestedDeposit]);
    
    useEffect(() => {
        if (isOpen) {
            setUnitId(units[0]?.id || ''); setGuestName(''); setStartDate(''); setEndDate(''); setGuestCount(1); setTotalAmount(0); setDeposit(0);
        }
    }, [isOpen, units]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(!unitId || !guestName || !startDate || !endDate || guestCount < 1 || new Date(startDate) >= new Date(endDate) || totalAmount <= 0) {
            alert('Completá todos los campos correctamente.'); return;
        }
        addBooking({ unitId, guestName, startDate, endDate, guestCount, totalAmount, deposit });
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Nueva Reserva Diaria">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Unidad</label>
                    <select value={unitId} onChange={e => setUnitId(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" required>
                        <option value="">Seleccionar unidad...</option>
                        {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                </div>
                <Input label="Nombre del Huésped" value={guestName} onChange={e => setGuestName(e.target.value)} required />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Fecha de Inicio" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                    <Input label="Fecha de Fin" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
                </div>
                <Input label="Huéspedes (1-4)" type="number" min="1" max="4" value={guestCount} onChange={e => setGuestCount(Number(e.target.value))} required />
                <div>
                    <Input label="Monto Total" type="number" value={totalAmount} onChange={e => setTotalAmount(Number(e.target.value))} required />
                    {suggestedAmount > 0 && totalAmount !== suggestedAmount && <p className="text-xs text-gray-400 mt-1">Sugerido: ${suggestedAmount.toLocaleString()}</p>}
                </div>
                <div>
                    <Input label="Seña" type="number" value={deposit} onChange={e => setDeposit(Number(e.target.value))} required />
                    {suggestedDeposit > 0 && deposit !== suggestedDeposit && <p className="text-xs text-gray-400 mt-1">Sugerido ({settings.bookingDepositPercentage}%): ${suggestedDeposit.toLocaleString()}</p>}
                </div>

                <div className="flex justify-end gap-2 pt-4"><Button onClick={onClose} variant="secondary" type="button">Cancelar</Button><Button type="submit">Crear Reserva</Button></div>
            </form>
        </Modal>
    );
};


const CalendarView: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
    const { invoices, setReminderSent } = useApp();
    const upcomingInvoices = useMemo(() => invoices.filter(i => i.status === InvoiceStatus.PENDING || i.status === InvoiceStatus.PARTIAL).sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()), [invoices]);

    const handleSendReminder = (invoice: Invoice) => {
        const details = Object.entries(invoice.additionalCharges).map(([key, value]) => `- ${key.charAt(0).toUpperCase() + key.slice(1)}: $${value.toLocaleString()}`).join('\n');
        const message = `Hola ${invoice.tenantName}\nTe recordamos que el ${new Date(invoice.dueDate).toLocaleDateString()} vence tu alquiler del periodo ${invoice.period}.\n\nTotal a pagar: $${invoice.totalAmount.toLocaleString()}\nDetalle:\n- Alquiler: $${invoice.baseRent.toLocaleString()}\n${details}\n\nPor favor avisá si necesitás más información.\n— Monoambientes Chamical`;
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
        setReminderSent(invoice.id);
    };

    return (
        <Page title="Calendario y Avisos" onBack={() => setView('DASHBOARD')}>
            <Card>
                <h2 className="text-xl font-bold mb-4">Próximos Vencimientos</h2>
                <div className="space-y-3">
                    {upcomingInvoices.length > 0 ? upcomingInvoices.map(inv => (
                        <div key={inv.id} className="bg-gray-700/50 p-3 rounded-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                                <p className="font-bold">{inv.tenantName} - ${inv.balance.toLocaleString()}</p>
                                <p className="text-sm text-gray-300">Vence: {new Date(inv.dueDate).toLocaleDateString()}</p>
                            </div>
                            <Button onClick={() => handleSendReminder(inv)} variant={inv.reminderSent ? "secondary" : "primary"}><Send size={16}/> {inv.reminderSent ? "Reenviar Aviso" : "Enviar Aviso"}</Button>
                        </div>
                    )) : <p className="text-gray-400">No hay vencimientos pendientes.</p>}
                </div>
            </Card>
        </Page>
    );
};

const ReportsView: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
    const { invoices, bookings, contracts, units } = useApp();
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedUnitId, setSelectedUnitId] = useState('');
    const [reportData, setReportData] = useState<any[] | null>(null);

    const generateReport = () => {
        const start = startDate ? new Date(startDate + 'T00:00:00') : null;
        const end = endDate ? new Date(endDate + 'T23:59:59') : null;
        const unitMap = new Map(units.map(u => [u.id, u.name]));
        const dateFilter = (pDate: Date) => (!start || pDate >= start) && (!end || pDate <= end);
        const unitFilter = (unitId: string) => !selectedUnitId || unitId === selectedUnitId;

        const allPayments = [
            ...invoices.filter(inv => unitFilter(inv.unitId)).flatMap(inv => inv.payments.map(p => ({ p, inv }))),
            ...contracts.filter(c => unitFilter(c.unitId)).flatMap(c => c.depositPayments.map(p => ({ p, c }))),
            ...bookings.filter(b => unitFilter(b.unitId)).flatMap(b => b.payments.map(p => ({ p, b })))
        ];
        
        const filteredReport = allPayments
            .filter(({ p }) => dateFilter(new Date(p.date)))
            .map(({p, inv, c, b}) => {
                const paymentDate = new Date(p.date);
                if (inv) return { date: paymentDate, department: unitMap.get(inv.unitId), type: 'Ingreso Alquiler Mensual', description: `Pago de ${inv.tenantName} (Período ${inv.period})`, amount: p.amount };
                if (c) return { date: paymentDate, department: unitMap.get(c.unitId), type: 'Ingreso Depósito', description: `Depósito de ${c.tenantName}`, amount: p.amount };
                if (b) return { date: paymentDate, department: unitMap.get(b.unitId), type: 'Ingreso Alquiler Diario', description: `Pago de ${b.guestName}`, amount: p.amount };
                return null;
            })
            .filter(Boolean)
            .sort((a, b) => a!.date.getTime() - b!.date.getTime())
            .map(item => ({...item, date: item!.date.toLocaleDateString() }));

        setReportData(filteredReport as any[]);
    };

    const exportToCSV = () => {
        if (!reportData) return;
        const header = 'Fecha,Departamento,Tipo,Descripción,Monto\n';
        const rows = reportData.map(r => `"${r.date}","${r.department}","${r.type}","${r.description.replace(/"/g, '""')}",${r.amount}`).join('\n');
        const link = document.createElement("a");
        link.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURI(header + rows);
        link.download = "reporte_monoambientes.csv";
        link.click();
    };

    const printReport = () => {
        const printWindow = window.open('', '_blank');
        if(!printWindow || !reportData) return;
        const total = reportData.reduce((sum, r) => sum + r.amount, 0);
        printWindow.document.write(`<html><head><title>Reporte de Pagos</title><style>body{font-family:sans-serif;margin:2rem}h1,h2,p{margin:0}header{margin-bottom:20px;text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background-color:#f2f2f2}tfoot{font-weight:bold}</style></head><body><header><h1>Monoambientes Chamical</h1><p>Reporte de Ingresos</p><p>Generado el: ${new Date().toLocaleDateString()}</p></header><table><thead><tr><th>Fecha</th><th>Departamento</th><th>Tipo</th><th>Descripción</th><th>Monto</th></tr></thead><tbody>${reportData.map(r=>`<tr><td>${r.date}</td><td>${r.department}</td><td>${r.type}</td><td>${r.description}</td><td>$${r.amount.toLocaleString()}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="4" style="text-align:right;font-weight:bold;">Total</td><td style="font-weight:bold;">$${total.toLocaleString()}</td></tr></tfoot></table></body></html>`);
        printWindow.document.close();
        printWindow.print();
    };

    return (
        <Page title="Reportes" onBack={() => setView('DASHBOARD')}>
            <Card>
                <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-end mb-6">
                    <Input label="Fecha Desde" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <Input label="Fecha Hasta" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Departamento</label>
                        <select value={selectedUnitId} onChange={e => setSelectedUnitId(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white min-w-[200px]"><option value="">Todos</option>{units.map(unit => (<option key={unit.id} value={unit.id}>{unit.name}</option>))}</select>
                    </div>
                    <Button onClick={generateReport}>Generar Reporte</Button>
                </div>

                {reportData && (
                    <div>
                        <div className="flex gap-2 mb-4"><Button onClick={printReport} variant="secondary"><Printer size={16}/> Imprimir/PDF</Button><Button onClick={exportToCSV} variant="secondary"><FileDown size={16}/> Exportar a CSV</Button></div>
                        <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-gray-700"><tr><th className="p-3">Fecha</th><th className="p-3">Departamento</th><th className="p-3">Tipo</th><th className="p-3">Descripción</th><th className="p-3 text-right">Monto</th></tr></thead><tbody>{reportData.map((row,i)=><tr key={i} className="border-b border-gray-700"><td className="p-3">{row.date}</td><td className="p-3">{row.department}</td><td className="p-3">{row.type}</td><td className="p-3">{row.description}</td><td className="p-3 text-right">${row.amount.toLocaleString()}</td></tr>)}</tbody><tfoot className="font-bold"><tr className="border-t-2 border-gray-500"><td colSpan={4} className="p-3 text-right">Total</td><td className="p-3 text-right">${reportData.reduce((sum, row) => sum + row.amount, 0).toLocaleString()}</td></tr></tfoot></table></div>
                    </div>
                )}
                {reportData?.length === 0 && <p className="text-gray-400 mt-4">No se encontraron datos para los filtros seleccionados.</p>}
            </Card>
        </Page>
    );
};

const SettingsView: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
    const { settings, updateSettings, exportData, importData } = useApp();
    const [currentSettings, setCurrentSettings] = useState(settings);
    const [showSuccess, setShowSuccess] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setCurrentSettings(settings); }, [settings]);

    const handleSave = () => {
        updateSettings(currentSettings);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            importData(file);
        }
    };
    
    return (
        <Page title="Configuración" onBack={() => setView('DASHBOARD')}>
            <div className="space-y-8">
                <Card>
                    <h3 className="text-xl font-bold mb-4">Parámetros Generales</h3>
                    <div className="space-y-6">
                        <div>
                            <h4 className="text-lg font-semibold mb-3">Gastos Adicionales Globales</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Input label="Internet" type="number" value={currentSettings.additionalCharges.internet} onChange={e => setCurrentSettings(s=>({...s, additionalCharges: {...s.additionalCharges, internet: +e.target.value}}))} />
                                <Input label="Muebles" type="number" value={currentSettings.additionalCharges.furniture} onChange={e => setCurrentSettings(s=>({...s, additionalCharges: {...s.additionalCharges, furniture: +e.target.value}}))} />
                                <Input label="Otros" type="number" value={currentSettings.additionalCharges.other} onChange={e => setCurrentSettings(s=>({...s, additionalCharges: {...s.additionalCharges, other: +e.target.value}}))} />
                            </div>
                        </div>
                        <div>
                            <h4 className="text-lg font-semibold mb-3">Tarifas Alquiler Diario</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Input label="1 Persona" type="number" value={currentSettings.dailyRates.p1} onChange={e => setCurrentSettings(s=>({...s, dailyRates: {...s.dailyRates, p1: +e.target.value}}))} />
                                <Input label="2 Personas" type="number" value={currentSettings.dailyRates.p2} onChange={e => setCurrentSettings(s=>({...s, dailyRates: {...s.dailyRates, p2: +e.target.value}}))} />
                                <Input label="3 Personas" type="number" value={currentSettings.dailyRates.p3} onChange={e => setCurrentSettings(s=>({...s, dailyRates: {...s.dailyRates, p3: +e.target.value}}))} />
                                <Input label="4 Personas" type="number" value={currentSettings.dailyRates.p4} onChange={e => setCurrentSettings(s=>({...s, dailyRates: {...s.dailyRates, p4: +e.target.value}}))} />
                            </div>
                        </div>
                        <div>
                            <h4 className="text-lg font-semibold mb-3">Reserva Diaria</h4>
                            <Input label="Porcentaje de Seña (%)" type="number" value={currentSettings.bookingDepositPercentage} onChange={e => setCurrentSettings(s=>({...s, bookingDepositPercentage: +e.target.value}))} />
                        </div>
                    </div>
                    <div className="mt-8 pt-6 border-t border-gray-700 flex justify-end items-center gap-4">
                        {showSuccess && <p className="text-sm text-green-400">Guardado con éxito!</p>}
                        <Button onClick={handleSave}>Guardar Cambios</Button>
                    </div>
                </Card>

                <Card>
                    <h3 className="text-xl font-bold mb-4">Gestión de Datos</h3>
                    <p className="text-gray-400 mb-4">Exportá tus datos para tener una copia de seguridad o para moverlos a otro dispositivo. Usá la opción de restaurar para cargar una copia previamente guardada.</p>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <Button onClick={exportData} variant="secondary"><Download size={16}/> Exportar Datos (Backup)</Button>
                        <Button onClick={() => fileInputRef.current?.click()} variant="secondary"><Upload size={16}/> Restaurar desde Archivo</Button>
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
                    </div>
                </Card>
            </div>
        </Page>
    );
};


// --- MAIN APP COMPONENT ---
export default function App() {
    const [view, setView] = useState<View>('DASHBOARD');
    const appData = useAppData();

    const renderView = () => {
        switch (view) {
            case 'DASHBOARD': return <Dashboard setView={setView} />;
            case 'MONTHLY': return <MonthlyView setView={setView} />;
            case 'DAILY': return <DailyView setView={setView} />;
            case 'CALENDAR': return <CalendarView setView={setView} />;
            case 'REPORTS': return <ReportsView setView={setView} />;
            case 'SETTINGS': return <SettingsView setView={setView} />;
            default: return <Dashboard setView={setView} />;
        }
    };
    
    if (appData.isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-100">
                <p>Cargando datos...</p>
            </div>
        );
    }

    return (
        <AppContext.Provider value={appData}>
            <div className="min-h-screen bg-gray-900 text-gray-100">
                {renderView()}
            </div>
        </AppContext.Provider>
    );
}
