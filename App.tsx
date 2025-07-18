
import React, { useState, useEffect, createContext, useContext, useCallback, useMemo, useRef } from 'react';
import { Unit, Contract, Invoice, Booking, GlobalSettings, Payment, UnitType, InvoiceStatus, BookingStatus, PaymentMethod } from './types';
import { INITIAL_UNITS, INITIAL_SETTINGS, UNIT_TYPE_LABELS } from './constants';
import { Home, FileText, Calendar, BedDouble, Settings, BarChart2, ArrowLeft, PlusCircle, Edit, Trash2, Send, DollarSign, Printer, FileDown, LogOut, KeyRound, Fingerprint, FileUp, ChevronLeft, ChevronRight } from 'lucide-react';

// --- AUTH HELPERS ---
async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function bufferEncode(value: ArrayBuffer): string {
    return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(value))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
}
  
function bufferDecode(value: string): Uint8Array {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (base64.length % 4)) % 4;
    const padded = base64.padEnd(base64.length + padLength, '=');
    const raw = atob(padded);
    const buffer = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      buffer[i] = raw.charCodeAt(i);
    }
    return buffer;
}

// --- AUTH HOOK AND CONTEXT ---
const useAuthData = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isPasswordSet, setIsPasswordSet] = useState(false);
    const [isBiometricRegistered, setIsBiometricRegistered] = useState(false);
    const [isBiometricSupported, setIsBiometricSupported] = useState(false);
    const [biometricCredentialId, setBiometricCredentialId] = useState<string | null>(null);

    useEffect(() => {
        const checkSupport = async () => {
            if (window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) {
                setIsBiometricSupported(true);
            }
        };
        checkSupport();

        const hash = localStorage.getItem('passwordHash');
        const credId = localStorage.getItem('biometricCredentialId');
        
        setIsPasswordSet(!!hash);
        if (credId) {
            setIsBiometricRegistered(true);
            setBiometricCredentialId(credId);
        }
        
        setIsInitialized(true);
    }, []);

    const setupPassword = async (password: string) => {
        const hash = await hashPassword(password);
        localStorage.setItem('passwordHash', hash);
        setIsPasswordSet(true);
        setIsAuthenticated(true);
    };

    const loginWithPassword = async (password: string): Promise<boolean> => {
        const storedHash = localStorage.getItem('passwordHash');
        if (!storedHash) return false;
        const enteredHash = await hashPassword(password);
        if (enteredHash === storedHash) {
            setIsAuthenticated(true);
            return true;
        }
        return false;
    };

    const registerBiometrics = async (): Promise<boolean> => {
        try {
            let userId = localStorage.getItem('userId');
            if (!userId) {
                userId = crypto.randomUUID();
                localStorage.setItem('userId', userId);
            }

            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge,
                    rp: { name: "Monoambientes Chamical", id: window.location.hostname },
                    user: {
                        id: bufferDecode(btoa(userId)),
                        name: "user@chamical.app",
                        displayName: "Usuario",
                    },
                    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
                    authenticatorSelection: {
                        authenticatorAttachment: "platform",
                        userVerification: "required",
                    },
                    timeout: 60000,
                },
            });

            if (credential) {
                const credId = bufferEncode((credential as any).rawId);
                localStorage.setItem('biometricCredentialId', credId);
                setBiometricCredentialId(credId);
                setIsBiometricRegistered(true);
                return true;
            }
        } catch (error) {
            console.error("Biometric registration failed:", error);
        }
        return false;
    };

    const loginWithBiometrics = async (): Promise<boolean> => {
        if (!biometricCredentialId) return false;
        try {
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

            await navigator.credentials.get({
                publicKey: {
                    challenge,
                    allowCredentials: [{
                        type: 'public-key',
                        id: bufferDecode(biometricCredentialId),
                    }],
                    timeout: 60000,
                }
            });

            setIsAuthenticated(true);
            return true;
        } catch (error) {
            console.error("Biometric login failed:", error);
            return false;
        }
    };
    
    const deregisterBiometrics = () => {
        localStorage.removeItem('biometricCredentialId');
        setBiometricCredentialId(null);
        setIsBiometricRegistered(false);
    };

    const logout = () => {
        setIsAuthenticated(false);
    };

    return {
        isAuthenticated,
        isInitialized,
        isPasswordSet,
        isBiometricRegistered,
        isBiometricSupported,
        setupPassword,
        loginWithPassword,
        registerBiometrics,
        loginWithBiometrics,
        deregisterBiometrics,
        logout
    };
};

const AuthContext = createContext<ReturnType<typeof useAuthData> | null>(null);
const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};

// --- DATA HOOK ---
const useAppData = () => {
    const [units, setUnits] = useState<Unit[]>(() => JSON.parse(localStorage.getItem('units') || 'null') || INITIAL_UNITS);
    const [contracts, setContracts] = useState<Contract[]>(() => JSON.parse(localStorage.getItem('contracts') || '[]'));
    const [invoices, setInvoices] = useState<Invoice[]>(() => JSON.parse(localStorage.getItem('invoices') || '[]'));
    const [bookings, setBookings] = useState<Booking[]>(() => JSON.parse(localStorage.getItem('bookings') || '[]'));
    const [settings, setSettings] = useState<GlobalSettings>(() => JSON.parse(localStorage.getItem('settings') || 'null') || INITIAL_SETTINGS);

    useEffect(() => { localStorage.setItem('units', JSON.stringify(units)); }, [units]);
    useEffect(() => { localStorage.setItem('contracts', JSON.stringify(contracts)); }, [contracts]);
    useEffect(() => { localStorage.setItem('invoices', JSON.stringify(invoices)); }, [invoices]);
    useEffect(() => { localStorage.setItem('bookings', JSON.stringify(bookings)); }, [bookings]);
    useEffect(() => { localStorage.setItem('settings', JSON.stringify(settings)); }, [settings]);

    const addContract = useCallback((newContractData: Omit<Contract, 'id' | 'depositAmount' | 'depositBalance' | 'depositStatus' | 'depositPayments'>) => {
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
        setContracts(prev => [...prev, fullContract]);

        // Generate invoices
        const newInvoices: Invoice[] = [];
        let currentDate = new Date(fullContract.startDate + 'T12:00:00');
        const endDate = new Date(fullContract.endDate + 'T12:00:00');
        const contractStartDay = new Date(fullContract.startDate + 'T12:00:00').getDate();
        
        while (currentDate <= endDate) {
            const totalAmount = fullContract.monthlyRent + Object.values(fullContract.additionalCharges).reduce((a, b) => a + b, 0);
            newInvoices.push({
                id: `invoice-${id}-${currentDate.getTime()}`,
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
        setInvoices(prev => [...prev, ...newInvoices]);
    }, []);

    const updateContract = useCallback((updatedContract: Contract) => {
        const originalContract = contracts.find(c => c.id === updatedContract.id);
        if (!originalContract) return;

        let finalUpdatedContract = { ...updatedContract };
    
        if (originalContract.depositStatus !== InvoiceStatus.PAID && originalContract.monthlyRent !== finalUpdatedContract.monthlyRent) {
            const totalPaid = originalContract.depositPayments.filter(p => p.amount > 0).reduce((s, p) => s + p.amount, 0);
            const totalCredited = originalContract.depositPayments.filter(p => p.amount < 0).reduce((s, p) => s + Math.abs(p.amount), 0);
            const newDepositAmount = finalUpdatedContract.monthlyRent;
            const newBalance = newDepositAmount - totalPaid - totalCredited;
            const newStatus = newBalance <= 0 ? InvoiceStatus.PAID : (totalPaid > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.PENDING);
            
            finalUpdatedContract = {
                ...finalUpdatedContract,
                depositAmount: newDepositAmount,
                depositBalance: newBalance,
                depositStatus: newStatus,
            };
        }
    
        setContracts(prev => prev.map(c => c.id === finalUpdatedContract.id ? finalUpdatedContract : c));
        
        setInvoices(prevInvoices => {
            const otherInvoices = prevInvoices.filter(i => i.contractId !== finalUpdatedContract.id);
            const invoicesForThisContract = prevInvoices.filter(i => i.contractId === finalUpdatedContract.id);
            const finalInvoicesForContract: Invoice[] = [];
    
            const newContractPeriods = new Set<string>();
            let tempDate = new Date(finalUpdatedContract.startDate + 'T12:00:00');
            const endDate = new Date(finalUpdatedContract.endDate + 'T12:00:00');
            while(tempDate <= endDate) {
                newContractPeriods.add(`${tempDate.getFullYear()}-${String(tempDate.getMonth() + 1).padStart(2, '0')}`);
                tempDate.setMonth(tempDate.getMonth() + 1);
            }
    
            const contractStartDay = new Date(finalUpdatedContract.startDate + 'T12:00:00').getDate();

            invoicesForThisContract.forEach(inv => {
                if (newContractPeriods.has(inv.period)) {
                    let updatedInvoice = { ...inv };
                    const [year, month] = inv.period.split('-').map(Number);
                    
                    updatedInvoice.tenantName = finalUpdatedContract.tenantName;
                    updatedInvoice.dueDate = new Date(year, month - 1, contractStartDay).toISOString();
                    
                    if (updatedInvoice.status !== InvoiceStatus.PAID) {
                        const newTotalAmount = finalUpdatedContract.monthlyRent + Object.values(finalUpdatedContract.additionalCharges).reduce((a, b) => a + b, 0);
                        const totalPaid = inv.payments.filter(p => p.amount > 0).reduce((s, p) => s + p.amount, 0);
                        const totalCredited = inv.payments.filter(p => p.amount < 0).reduce((s, p) => s + Math.abs(p.amount), 0);
                        const newBalance = newTotalAmount - totalPaid - totalCredited;
                        const newStatus = newBalance <= 0 ? InvoiceStatus.PAID : (totalPaid > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.PENDING);
                        
                        updatedInvoice = {
                            ...updatedInvoice,
                            baseRent: finalUpdatedContract.monthlyRent,
                            additionalCharges: finalUpdatedContract.additionalCharges,
                            totalAmount: newTotalAmount,
                            balance: newBalance,
                            status: newStatus,
                        };
                    }
                    finalInvoicesForContract.push(updatedInvoice);
                    newContractPeriods.delete(inv.period);
                }
            });
            
            newContractPeriods.forEach(period => {
                const [year, month] = period.split('-').map(Number);
                const totalAmount = finalUpdatedContract.monthlyRent + Object.values(finalUpdatedContract.additionalCharges).reduce((a, b) => a + b, 0);
                finalInvoicesForContract.push({
                    id: `invoice-${finalUpdatedContract.id}-${new Date(year, month - 1).getTime()}`,
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
                });
            });
    
            return [...otherInvoices, ...finalInvoicesForContract.sort((a,b) => a.period.localeCompare(b.period))];
        });
    }, [contracts]);
    
    const addPayment = useCallback((invoiceId: string, payment: Omit<Payment, 'id'>) => {
        setInvoices(prev => prev.map(inv => {
            if (inv.id === invoiceId) {
                const newPayments = [...inv.payments, { ...payment, id: `payment-${Date.now()}` }];
                const totalPaid = newPayments.filter(p => p.amount > 0).reduce((sum, p) => sum + p.amount, 0);
                const totalCredited = newPayments.filter(p => p.amount < 0).reduce((sum, p) => sum + Math.abs(p.amount), 0);
                const balance = inv.totalAmount - totalPaid - totalCredited;

                let status = InvoiceStatus.PENDING;
                if (balance <= 0) {
                    status = InvoiceStatus.PAID;
                } else if (totalPaid > 0) {
                    status = InvoiceStatus.PARTIAL;
                }

                return { ...inv, payments: newPayments, balance, status };
            }
            return inv;
        }));
    }, []);

    const addDepositPayment = useCallback((contractId: string, payment: Omit<Payment, 'id'>) => {
        setContracts(prev => prev.map(c => {
            if (c.id === contractId) {
                const newPayments = [...c.depositPayments, { ...payment, id: `payment-deposit-${Date.now()}` }];
                const totalPaid = newPayments.filter(p => p.amount > 0).reduce((sum, p) => sum + p.amount, 0);
                const totalCredited = newPayments.filter(p => p.amount < 0).reduce((sum, p) => sum + Math.abs(p.amount), 0);
                const balance = c.depositAmount - totalPaid - totalCredited;
                
                let status = InvoiceStatus.PENDING;
                 if (balance <= 0) {
                    status = InvoiceStatus.PAID;
                } else if (totalPaid > 0) {
                    status = InvoiceStatus.PARTIAL;
                }
                
                return { ...c, depositPayments: newPayments, depositBalance: balance, depositStatus: status };
            }
            return c;
        }));
    }, []);

    const updateSettings = useCallback((newSettings: GlobalSettings) => {
        setSettings(newSettings);
    }, []);

    const addBooking = useCallback((newBooking: Omit<Booking, 'id' | 'status' | 'balance' | 'payments'>) => {
        const id = `booking-${Date.now()}`;
        setBookings(prev => [...prev, {
            ...newBooking, 
            id,
            payments: [],
            balance: newBooking.totalAmount,
            status: BookingStatus.PENDING,
        }]);
    }, []);
    
    const addBookingPayment = useCallback((bookingId: string, payment: Omit<Payment, 'id'>) => {
        setBookings(prev => prev.map(book => {
            if (book.id === bookingId) {
                const newPayments = [...book.payments, { ...payment, id: `payment-booking-${Date.now()}` }];
                const totalPaid = newPayments.filter(p => p.amount > 0).reduce((sum, p) => sum + p.amount, 0);
                const totalCredited = newPayments.filter(p => p.amount < 0).reduce((sum, p) => sum + Math.abs(p.amount), 0);
                const balance = book.totalAmount - totalPaid - totalCredited;
                
                let status = BookingStatus.PENDING;
                if (balance <= 0) {
                    status = BookingStatus.PAID;
                } else if (totalPaid > 0) {
                    status = BookingStatus.PARTIAL;
                }
                return { ...book, payments: newPayments, balance, status };
            }
            return book;
        }));
    }, []);

    const deleteContract = useCallback((contractId: string) => {
        setContracts(prev => prev.filter(c => c.id !== contractId));
        setInvoices(prev => prev.filter(i => i.contractId !== contractId));
    }, []);

    const deleteBooking = useCallback((bookingId: string) => {
        setBookings(prev => prev.filter(b => b.id !== bookingId));
    }, []);

    const setReminderSent = useCallback((invoiceId: string) => {
        setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, reminderSent: true } : inv));
    }, []);

    return { units, contracts, invoices, bookings, settings, addContract, updateContract, addPayment, addDepositPayment, updateSettings, addBooking, addBookingPayment, deleteContract, deleteBooking, setReminderSent };
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

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }> = ({ children, variant = 'primary', className, ...props }) => {
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

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, ...props }) => (
    <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        <input {...props} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
    </div>
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: React.ReactNode }> = ({ label, children, ...props }) => (
    <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        <select {...props} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {children}
        </select>
    </div>
);

const getStatusChip = (status: InvoiceStatus | BookingStatus) => {
    const styles: Record<InvoiceStatus, string> = {
        [InvoiceStatus.PENDING]: 'bg-yellow-500/20 text-yellow-300',
        [InvoiceStatus.PARTIAL]: 'bg-blue-500/20 text-blue-300',
        [InvoiceStatus.PAID]: 'bg-green-500/20 text-green-300',
    };
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status]}`}>{status}</span>;
};

const getBookingStatusChip = (status: BookingStatus) => {
    const styles: Record<BookingStatus, string> = {
        [BookingStatus.PENDING]: 'bg-yellow-500/20 text-yellow-300',
        [BookingStatus.PARTIAL]: 'bg-blue-500/20 text-blue-300',
        [BookingStatus.PAID]: 'bg-green-500/20 text-green-300',
    };
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status]}`}>{status}</span>;
};

// --- VIEWS / PAGES ---

const Dashboard: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
    const { invoices } = useApp();
    const { logout } = useAuth();
    const pendingInvoices = invoices.filter(i => i.status === InvoiceStatus.PENDING || i.status === InvoiceStatus.PARTIAL).length;

    const navItems = [
        { view: 'MONTHLY', label: 'Alquileres Mensuales', icon: FileText, desc: 'Gestionar contratos y pagos' },
        { view: 'DAILY', label: 'Alquileres Diarios', icon: BedDouble, desc: 'Gestionar reservas y tarifas' },
        { view: 'CALENDAR', label: 'Calendario y Avisos', icon: Calendar, desc: 'Vencimientos y recordatorios' },
        { view: 'REPORTS', label: 'Reportes', icon: BarChart2, desc: 'Exportar datos financieros' },
        { view: 'SETTINGS', label: 'Configuración', icon: Settings, desc: 'Tarifas y seguridad' },
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
                <Button onClick={logout} variant="secondary" className="absolute top-0 right-0">
                    <LogOut size={16} /> Cerrar Sesión
                </Button>
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
                
                if (!isAPaid) {
                     return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                }

                return b.period.localeCompare(a.period);
            })
        : [];
    
    const handleAddPayment = (paymentData: Omit<Payment, 'id'>) => {
        if(selectedInvoice) {
            addPayment(selectedInvoice.id, paymentData);
            setPaymentModalOpen(false);
            setSelectedInvoice(null);
        }
    };

    const handleAddDepositPayment = (paymentData: Omit<Payment, 'id'>) => {
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

    const handleCloseContractModal = () => {
        setEditingContract(null);
        setContractModalOpen(false);
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
                                            <div className="mt-3 pt-3 border-t border-gray-600">
                                                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
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
                                <div key={inv.id} className="bg-gray-700/50 p-3 rounded-md">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
                                    {inv.payments.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-gray-600/50">
                                            <h4 className="text-xs font-semibold text-gray-400 mb-2">Pagos:</h4>
                                            <ul className="text-xs space-y-1">
                                                {inv.payments.map(p => (
                                                    <li key={p.id} className="flex justify-between items-start text-gray-300">
                                                        <div className="flex-1 pr-2">
                                                            <span>{new Date(p.date).toLocaleDateString()} - <span className="capitalize">{p.method}</span></span>
                                                            {p.observations && <p className="text-gray-400 italic">{p.observations}</p>}
                                                        </div>
                                                        <span className={`font-semibold ${p.amount < 0 ? 'text-yellow-400' : ''}`}>
                                                            {p.amount < 0 ? `-$${Math.abs(p.amount).toLocaleString()} (NC)` : `$${p.amount.toLocaleString()}`}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )) : <p className="text-gray-400">No hay facturas para esta unidad.</p>}
                            </div>
                        </div>
                     </Card>
                </div>
            )}
            <ContractFormModal 
                isOpen={isContractModalOpen} 
                onClose={handleCloseContractModal} 
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
            if (isEditMode) {
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
            alert('Por favor, completá todos los campos.');
            return;
        }

        const baseContractData = {
            unitId,
            tenantName,
            startDate,
            endDate,
            monthlyRent,
            additionalCharges: extraCharges,
        };

        if (isEditMode) {
            updateContract({ 
                ...contractToEdit, 
                ...baseContractData,
                depositInstallments,
             });
        } else {
            addContract({
                ...baseContractData,
                depositInstallments,
            });
        }
        
        onClose();
    };
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? "Editar Contrato" : "Nuevo Contrato"}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input label="Nombre del Inquilino" value={tenantName} onChange={e => setTenantName(e.target.value)} required />
                <div className="grid grid-cols-2 gap-4">
                    <Input label="Fecha de Inicio" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                    <Input label="Fecha de Fin" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
                </div>
                <Input label="Monto del Alquiler Mensual" type="number" value={monthlyRent} onChange={e => setMonthlyRent(parseFloat(e.target.value) || 0)} required />
                <fieldset className="border border-gray-600 p-4 rounded-md">
                    <legend className="text-sm font-medium text-gray-300 px-2">Cargos Adicionales</legend>
                    <div className="space-y-2">
                        <Input label="Internet" type="number" value={extraCharges.internet} onChange={e => setExtraCharges(c => ({...c, internet: parseFloat(e.target.value) || 0}))} />
                        <Input label="Muebles" type="number" value={extraCharges.furniture} onChange={e => setExtraCharges(c => ({...c, furniture: parseFloat(e.target.value) || 0}))} />
                        <Input label="Otros" type="number" value={extraCharges.other} onChange={e => setExtraCharges(c => ({...c, other: parseFloat(e.target.value) || 0}))} />
                    </div>
                </fieldset>
                <Input label="Cuotas del Depósito" type="number" min="1" step="1" value={depositInstallments} onChange={e => setDepositInstallments(parseInt(e.target.value) || 1)} />

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit">{isEditMode ? "Guardar Cambios" : "Crear Contrato"}</Button>
                </div>
            </form>
        </Modal>
    );
};

const PaymentModal: React.FC<{ isOpen: boolean; onClose: () => void; invoice: Invoice | null; onAddPayment: (payment: Omit<Payment, 'id'>) => void; }> = ({ isOpen, onClose, invoice, onAddPayment }) => {
    const [amount, setAmount] = useState(0);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [payerName, setPayerName] = useState('');
    const [method, setMethod] = useState<PaymentMethod>('transferencia');
    const [observations, setObservations] = useState('');

    useEffect(() => {
        if (invoice) {
            setAmount(invoice.balance > 0 ? invoice.balance : 0);
            setPayerName(invoice.tenantName);
            setDate(new Date().toISOString().split('T')[0]);
            setMethod('transferencia');
            setObservations('');
        }
    }, [invoice]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onAddPayment({ amount, date, payerName, method, observations });
    };

    if (!invoice) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Registrar Pago para ${invoice.period}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input label="Monto" type="number" step="0.01" value={amount} onChange={e => setAmount(parseFloat(e.target.value))} required />
                <Input label="Fecha de Pago" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                <Input label="Nombre del Pagador" value={payerName} onChange={e => setPayerName(e.target.value)} required />
                <Select label="Método de Pago" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                </Select>
                <Input label="Observaciones (Opcional)" value={observations} onChange={e => setObservations(e.target.value)} />

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit">Agregar Pago</Button>
                </div>
            </form>
        </Modal>
    );
};

const DepositPaymentModal: React.FC<{ isOpen: boolean; onClose: () => void; contract: Contract | null; onAddDepositPayment: (payment: Omit<Payment, 'id'>) => void; }> = ({ isOpen, onClose, contract, onAddDepositPayment }) => {
    const [amount, setAmount] = useState(0);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [payerName, setPayerName] = useState('');
    const [method, setMethod] = useState<PaymentMethod>('transferencia');
    const [observations, setObservations] = useState('');

    useEffect(() => {
        if (contract) {
            setAmount(contract.depositBalance > 0 ? contract.depositBalance : 0);
            setPayerName(contract.tenantName);
            setDate(new Date().toISOString().split('T')[0]);
            setMethod('transferencia');
            setObservations('');
        }
    }, [contract]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(contract) {
            onAddDepositPayment({ amount, date, payerName, method, observations });
        }
    };
    
    if (!contract) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Pago de Depósito para ${contract.tenantName}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input label="Monto" type="number" step="0.01" value={amount} onChange={e => setAmount(parseFloat(e.target.value))} required />
                <Input label="Fecha de Pago" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                <Input label="Nombre del Pagador" value={payerName} onChange={e => setPayerName(e.target.value)} required />
                <Select label="Método de Pago" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                </Select>
                <Input label="Observaciones (Opcional)" value={observations} onChange={e => setObservations(e.target.value)} />
                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit">Agregar Pago</Button>
                </div>
            </form>
        </Modal>
    );
};

const CalendarComponent: React.FC<{ bookings: Booking[] }> = ({ bookings }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const bookedRanges = useMemo(() => 
        bookings.map(b => ({
            start: new Date(b.startDate + 'T00:00:00'),
            end: new Date(b.endDate + 'T00:00:00'),
        })), [bookings]);

    const isBooked = (day: Date) => {
        return bookedRanges.some(range => day >= range.start && day <= range.end);
    };

    const handlePrevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const renderCalendar = () => {
        const month = currentDate.getMonth();
        const year = currentDate.getFullYear();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const days = [];
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(<div key={`empty-${i}`} className="p-2 text-center"></div>);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const today = new Date();
            const isToday = date.toDateString() === today.toDateString();
            const booked = isBooked(date);
            
            let classes = 'p-2 text-center rounded-full w-10 h-10 flex items-center justify-center';
            if (isToday) classes += ' bg-indigo-500 text-white';
            if (booked) classes += ' bg-blue-600 text-white font-bold';
            
            days.push(<div key={day} className={classes}>{day}</div>);
        }
        return days;
    };
    
    return (
        <Card className="mb-6">
            <div className="flex justify-between items-center mb-4">
                <button onClick={handlePrevMonth} className="p-2 rounded-full hover:bg-gray-700"><ChevronLeft /></button>
                <h3 className="text-lg font-bold">{currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase()}</h3>
                <button onClick={handleNextMonth} className="p-2 rounded-full hover:bg-gray-700"><ChevronRight /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-sm text-center text-gray-400 mb-2">
                {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map(day => <div key={day}>{day}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-y-2 items-center justify-items-center">
                {renderCalendar()}
            </div>
        </Card>
    );
};


const BookingFormModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    unitId?: string;
    addBooking: (booking: Omit<Booking, 'id' | 'status' | 'balance' | 'payments'>) => void;
}> = ({ isOpen, onClose, unitId, addBooking }) => {
    const { settings } = useApp();
    const [guestName, setGuestName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [guestCount, setGuestCount] = useState(1);
    const [totalAmount, setTotalAmount] = useState(0);
    const [deposit, setDeposit] = useState(0);

    useEffect(() => {
        if (!startDate || !endDate || guestCount < 1) {
            setTotalAmount(0);
            return;
        }

        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T00:00:00');
        if (start > end) {
            setTotalAmount(0);
            return;
        }

        const nights = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24));
        if (nights <= 0) {
            setTotalAmount(0);
            return;
        }

        let rateKey: keyof typeof settings.dailyRates = 'p1';
        if (guestCount === 2) rateKey = 'p2';
        else if (guestCount === 3) rateKey = 'p3';
        else if (guestCount >= 4) rateKey = 'p4';

        const dailyRate = settings.dailyRates[rateKey];
        const newTotal = nights * dailyRate;
        setTotalAmount(newTotal);

    }, [startDate, endDate, guestCount, settings.dailyRates]);

    useEffect(() => {
        if (totalAmount > 0) {
            const newDeposit = (totalAmount * settings.bookingDepositPercentage) / 100;
            setDeposit(newDeposit);
        } else {
            setDeposit(0);
        }
    }, [totalAmount, settings.bookingDepositPercentage]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!unitId || !guestName || !startDate || !endDate || guestCount < 1 || totalAmount <= 0) {
            alert('Por favor, complete todos los campos correctamente.');
            return;
        }
        addBooking({
            unitId,
            guestName,
            startDate,
            endDate,
            guestCount,
            totalAmount,
            deposit,
        });
        onClose();
    };
    
    // Reset form on close
    useEffect(() => {
        if(!isOpen) {
            setGuestName('');
            setStartDate('');
            setEndDate('');
            setGuestCount(1);
        }
    }, [isOpen]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Nueva Reserva">
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input label="Nombre del Huésped" value={guestName} onChange={e => setGuestName(e.target.value)} required />
                <div className="grid grid-cols-2 gap-4">
                    <Input label="Fecha de Entrada" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                    <Input label="Fecha de Salida" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
                </div>
                <Input label="Cantidad de Huéspedes" type="number" min="1" value={guestCount} onChange={e => setGuestCount(parseInt(e.target.value, 10) || 1)} required />
                
                <div className="bg-gray-700 p-3 rounded-md space-y-2">
                    <div className="flex justify-between">
                        <span className="text-gray-300">Monto Total:</span>
                        <span className="font-bold">${totalAmount.toLocaleString()}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-gray-300">Depósito ({settings.bookingDepositPercentage}%):</span>
                        <span className="font-bold">${deposit.toLocaleString()}</span>
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit">Crear Reserva</Button>
                </div>
            </form>
        </Modal>
    );
};

const BookingPaymentModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    booking: Booking | null;
    onAddBookingPayment: (payment: Omit<Payment, 'id'>) => void;
}> = ({ isOpen, onClose, booking, onAddBookingPayment }) => {
    const [amount, setAmount] = useState(0);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [payerName, setPayerName] = useState('');
    const [method, setMethod] = useState<PaymentMethod>('transferencia');
    const [observations, setObservations] = useState('');

    useEffect(() => {
        if (booking) {
            setAmount(booking.balance > 0 ? booking.balance : 0);
            setPayerName(booking.guestName);
            setDate(new Date().toISOString().split('T')[0]);
            setMethod('transferencia');
            setObservations('');
        }
    }, [booking]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onAddBookingPayment({ amount, date, payerName, method, observations });
    };

    if (!booking) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Registrar Pago para ${booking.guestName}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input label="Monto" type="number" step="0.01" value={amount} onChange={e => setAmount(parseFloat(e.target.value))} required />
                <Input label="Fecha de Pago" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                <Input label="Nombre del Pagador" value={payerName} onChange={e => setPayerName(e.target.value)} required />
                <Select label="Método de Pago" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                </Select>
                <Input label="Observaciones (Opcional)" value={observations} onChange={e => setObservations(e.target.value)} />

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit">Agregar Pago</Button>
                </div>
            </form>
        </Modal>
    );
};

const DailyView: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
    const { units, bookings, addBooking, addBookingPayment, deleteBooking } = useApp();
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
    const [isBookingModalOpen, setBookingModalOpen] = useState(false);
    const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

    const dailyUnits = units.filter(u => u.type === UnitType.APARTMENT_DAILY);
    const unitBookings = selectedUnit ? bookings.filter(b => b.unitId === selectedUnit.id).sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()) : [];

    const handleAddBooking = (bookingData: Omit<Booking, 'id' | 'status' | 'balance' | 'payments'>) => {
        addBooking(bookingData);
        setBookingModalOpen(false);
    };

    const handleAddPayment = (paymentData: Omit<Payment, 'id'>) => {
        if(selectedBooking) {
            addBookingPayment(selectedBooking.id, paymentData);
            setPaymentModalOpen(false);
            setSelectedBooking(null);
        }
    };

    return (
        <Page title="Alquileres Diarios" onBack={() => selectedUnit ? setSelectedUnit(null) : setView('DASHBOARD')}>
            {!selectedUnit ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dailyUnits.map(unit => (
                         <Card key={unit.id} className="cursor-pointer hover:border-indigo-500 border-2 border-transparent transition-colors">
                             <button onClick={() => setSelectedUnit(unit)} className="w-full text-left">
                                <h3 className="text-xl font-bold">{unit.name}</h3>
                                <p className="text-sm text-gray-400">{UNIT_TYPE_LABELS[unit.type]}</p>
                            </button>
                        </Card>
                    ))}
                </div>
            ) : (
                <div>
                     <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-bold">{selectedUnit.name}</h2>
                        <Button onClick={() => setBookingModalOpen(true)}><PlusCircle size={16}/> Nueva Reserva</Button>
                     </div>

                    <CalendarComponent bookings={unitBookings} />
                    
                    <Card>
                        <h3 className="text-xl font-semibold mb-2">Reservas</h3>
                        <div className="space-y-2">
                        {unitBookings.length > 0 ? unitBookings.map(book => (
                            <div key={book.id} className="bg-gray-700/50 p-3 rounded-md">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold">{book.guestName}</span>
                                            {getBookingStatusChip(book.status)}
                                        </div>
                                        <p className="text-sm text-gray-300">
                                            {new Date(book.startDate + 'T00:00:00').toLocaleDateString()} - {new Date(book.endDate + 'T00:00:00').toLocaleDateString()}
                                        </p>
                                        <p className="text-sm text-gray-400">Total: ${book.totalAmount.toLocaleString()} | Saldo: ${book.balance.toLocaleString()}</p>
                                    </div>
                                    <div className="flex gap-2 self-start sm:self-center">
                                        <Button onClick={() => { setSelectedBooking(book); setPaymentModalOpen(true); }} variant="secondary" disabled={book.status === BookingStatus.PAID}>
                                            <DollarSign size={16}/> Pagar
                                        </Button>
                                        <Button variant="danger" onClick={() => window.confirm('¿Seguro que querés borrar esta reserva?') && deleteBooking(book.id)}>
                                            <Trash2 size={16}/>
                                        </Button>
                                    </div>
                                </div>
                                {book.payments.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-gray-600/50">
                                        <h4 className="text-xs font-semibold text-gray-400 mb-2">Pagos:</h4>
                                        <ul className="text-xs space-y-1">
                                            {book.payments.map(p => (
                                                <li key={p.id} className="flex justify-between items-start text-gray-300">
                                                    <div className="flex-1 pr-2">
                                                        <span>{new Date(p.date).toLocaleDateString()} - <span className="capitalize">{p.method}</span></span>
                                                        {p.observations && <p className="text-gray-400 italic">{p.observations}</p>}
                                                    </div>
                                                    <span className={`font-semibold ${p.amount < 0 ? 'text-yellow-400' : ''}`}>
                                                        {p.amount < 0 ? `-$${Math.abs(p.amount).toLocaleString()} (NC)` : `$${p.amount.toLocaleString()}`}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )) : <p className="text-gray-400">No hay reservas para esta unidad.</p>}
                        </div>
                    </Card>
                </div>
            )}
            <BookingFormModal isOpen={isBookingModalOpen} onClose={() => setBookingModalOpen(false)} unitId={selectedUnit?.id} addBooking={handleAddBooking} />
            <BookingPaymentModal isOpen={isPaymentModalOpen} onClose={() => setPaymentModalOpen(false)} booking={selectedBooking} onAddBookingPayment={handleAddPayment} />
        </Page>
    );
};


const CalendarView: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
    const { invoices, setReminderSent } = useApp();
    const today = new Date();
    today.setHours(0,0,0,0);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    const dueInvoices = invoices.filter(inv => {
        const dueDate = new Date(inv.dueDate);
        return inv.status !== InvoiceStatus.PAID && dueDate >= today && dueDate <= nextWeek;
    }).sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    const overdueInvoices = invoices.filter(inv => {
        const dueDate = new Date(inv.dueDate);
        return inv.status !== InvoiceStatus.PAID && dueDate < today;
    }).sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    const handleSendReminder = (invoice: Invoice) => {
        const message = `Recordatorio de pago: Su factura para el período ${invoice.period} por un total de $${invoice.totalAmount.toLocaleString()} ha vencido. Saldo pendiente: $${invoice.balance.toLocaleString()}.`;
        
        if ('share' in navigator) {
            navigator.share({
                title: 'Recordatorio de Pago',
                text: message,
            }).then(() => {
                setReminderSent(invoice.id);
            }).catch(console.error);
        } else {
            alert(message);
            setReminderSent(invoice.id);
        }
    };
    
    return (
        <Page title="Calendario y Avisos" onBack={() => setView('DASHBOARD')}>
            <div className="space-y-8">
                <Card>
                    <h2 className="text-xl font-bold mb-4 text-red-400">Facturas Vencidas</h2>
                    {overdueInvoices.length > 0 ? (
                        <div className="space-y-3">
                            {overdueInvoices.map(inv => (
                                <div key={inv.id} className="bg-gray-700 p-3 rounded-md flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold">{inv.tenantName} - {inv.period}</p>
                                        <p className="text-sm text-gray-300">Venció: {new Date(inv.dueDate).toLocaleDateString()} | Saldo: ${inv.balance.toLocaleString()}</p>
                                    </div>
                                    <Button onClick={() => handleSendReminder(inv)} variant="secondary" disabled={inv.reminderSent}>
                                        <Send size={16}/> {inv.reminderSent ? 'Enviado' : 'Avisar'}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : <p className="text-gray-400">No hay facturas vencidas.</p>}
                </Card>
                <Card>
                    <h2 className="text-xl font-bold mb-4 text-yellow-400">Vencimientos Próximos (7 días)</h2>
                    {dueInvoices.length > 0 ? (
                        <div className="space-y-3">
                            {dueInvoices.map(inv => (
                                <div key={inv.id} className="bg-gray-700 p-3 rounded-md flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold">{inv.tenantName} - {inv.period}</p>
                                        <p className="text-sm text-gray-300">Vence: {new Date(inv.dueDate).toLocaleDateString()} | Saldo: ${inv.balance.toLocaleString()}</p>
                                    </div>
                                    <Button onClick={() => handleSendReminder(inv)} variant="secondary" disabled={inv.reminderSent}>
                                        <Send size={16}/> {inv.reminderSent ? 'Enviado' : 'Avisar'}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : <p className="text-gray-400">No hay vencimientos en los próximos 7 días.</p>}
                </Card>
            </div>
        </Page>
    );
};

const ReportsView: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
    const { invoices, contracts, bookings, units } = useApp();
    const [filter, setFilter] = useState({ year: new Date().getFullYear().toString(), month: 'all', unitId: 'all' });
    const printRef = useRef(null);
    
    const allUnits = useMemo(() => units, [units]);

    const getUnitName = useCallback((unitId: string) => {
        return allUnits.find(u => u.id === unitId)?.name || 'N/A';
    }, [allUnits]);

    const reportData = useMemo(() => {
        let allPayments: (Payment & { type: string; details: string; unitId: string })[] = [];

        invoices.forEach(inv => {
            inv.payments.forEach(p => {
                const paymentDate = new Date(p.date);
                if ((filter.year === 'all' || paymentDate.getFullYear().toString() === filter.year) &&
                    (filter.month === 'all' || (paymentDate.getMonth() + 1).toString() === filter.month) &&
                    (filter.unitId === 'all' || inv.unitId === filter.unitId)) {
                    allPayments.push({ ...p, type: 'Alquiler Mensual', details: `Factura ${inv.period}`, unitId: inv.unitId });
                }
            });
        });

        contracts.forEach(c => {
            c.depositPayments.forEach(p => {
                const paymentDate = new Date(p.date);
                if ((filter.year === 'all' || paymentDate.getFullYear().toString() === filter.year) &&
                    (filter.month === 'all' || (paymentDate.getMonth() + 1).toString() === filter.month) &&
                    (filter.unitId === 'all' || c.unitId === filter.unitId)) {
                    allPayments.push({ ...p, type: 'Depósito', details: `Contrato ${c.tenantName}`, unitId: c.unitId });
                }
            });
        });

        bookings.forEach(b => {
            b.payments.forEach(p => {
                const paymentDate = new Date(p.date);
                 if ((filter.year === 'all' || paymentDate.getFullYear().toString() === filter.year) &&
                    (filter.month === 'all' || (paymentDate.getMonth() + 1).toString() === filter.month) &&
                    (filter.unitId === 'all' || b.unitId === filter.unitId)) {
                    allPayments.push({ ...p, type: 'Alquiler Diario', details: `Reserva ${b.guestName}`, unitId: b.unitId });
                }
            });
        });

        return allPayments.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [invoices, contracts, bookings, filter]);
    
    const totalIncome = useMemo(() => reportData.reduce((sum, p) => sum + p.amount, 0), [reportData]);
    
    const handlePrint = () => {
        const printWindow = window.open('', '', 'height=800,width=1000');
        if (printWindow && printRef.current) {
            const content = (printRef.current as HTMLDivElement).innerHTML;
            printWindow.document.write('<html><head><title>Reporte de Ingresos</title>');
            printWindow.document.write('<style>body{font-family:sans-serif;padding:20px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:8px;text-align:left;} th{background-color:#f2f2f2;}</style>');
            printWindow.document.write('</head><body>');
            printWindow.document.write(`<h1>Reporte de Ingresos - ${filter.month === 'all' ? `Año ${filter.year}` : `${filter.month}/${filter.year}`}</h1>`);
            printWindow.document.write(`<h2>Total: $${totalIncome.toLocaleString()}</h2>`);
            printWindow.document.write(content);
            printWindow.document.write('</body></html>');
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => { printWindow.print(); }, 500);
        }
    };
    
    const handleExport = () => {
        const headers = ["Fecha", "Departamento", "Tipo", "Detalles", "Pagador", "Método", "Observaciones", "Monto"];
        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n" 
            + reportData.map(p => [
                new Date(p.date).toLocaleDateString(),
                `"${getUnitName(p.unitId)}"`,
                p.type,
                `"${p.details}"`,
                `"${p.payerName}"`,
                p.method,
                `"${p.observations || ''}"`,
                p.amount
            ].join(",")).join("\n");
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `reporte_ingresos_${filter.year}_${filter.month}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const years = [...new Set(
        [...invoices, ...contracts, ...bookings].flatMap(item => 'payments' in item ? item.payments : item.depositPayments).map(p => new Date(p.date).getFullYear())
    )].sort((a,b) => b-a);
    
    return (
        <Page title="Reportes" onBack={() => setView('DASHBOARD')} actions={
            <>
                <Button onClick={handlePrint} variant="secondary"><Printer size={16}/> Imprimir</Button>
                <Button onClick={handleExport} variant="secondary"><FileDown size={16}/> Exportar</Button>
            </>
        }>
            <Card>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 p-4 bg-gray-700/50 rounded-lg">
                    <Select label="Año" value={filter.year} onChange={e => setFilter(f => ({...f, year: e.target.value}))}>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </Select>
                    <Select label="Mes" value={filter.month} onChange={e => setFilter(f => ({...f, month: e.target.value}))}>
                        <option value="all">Todos</option>
                        {Array.from({length: 12}, (_, i) => <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('es', {month: 'long'})}</option>)}
                    </Select>
                    <Select label="Departamento" value={filter.unitId} onChange={e => setFilter(f => ({...f, unitId: e.target.value}))}>
                       <option value="all">Todos</option>
                       {allUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </Select>
                </div>

                <div className="mb-4 text-right">
                    <h3 className="text-xl font-bold">Total Ingresos: <span className="text-green-400">${totalIncome.toLocaleString()}</span></h3>
                </div>

                <div className="overflow-x-auto" ref={printRef}>
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Fecha</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Departamento</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Tipo</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Detalles</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Monto</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {reportData.map(p => (
                                <tr key={p.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{new Date(p.date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{getUnitName(p.unitId)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{p.type}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{p.details}</td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${p.amount < 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                                        {p.amount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {reportData.length === 0 && <p className="text-center text-gray-400 mt-6">No hay datos para los filtros seleccionados.</p>}
            </Card>
        </Page>
    );
};

const SettingsView: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
    const { settings, updateSettings, units, contracts, invoices, bookings } = useApp();
    const auth = useAuth();
    const { isBiometricRegistered, isBiometricSupported, registerBiometrics, deregisterBiometrics } = auth;
    const [currentSettings, setCurrentSettings] = useState(settings);
    const [passwordChange, setPasswordChange] = useState({ old: '', new: '', confirm: ''});
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSettingsChange = <K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) => {
        setCurrentSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = () => {
        updateSettings(currentSettings);
        alert('Configuración guardada!');
    };
    
    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        const { old, new: newPass, confirm } = passwordChange;
        if (newPass !== confirm) {
            alert("Las nuevas contraseñas no coinciden.");
            return;
        }

        const correctOld = await auth.loginWithPassword(old);

        if (correctOld) {
            await auth.setupPassword(newPass);
            alert("Contraseña cambiada con éxito.");
            setPasswordChange({ old: '', new: '', confirm: ''});
            auth.logout(); // For security, log out after password change.
        } else {
            alert("La contraseña actual es incorrecta.");
        }
    };

    const handleBackup = () => {
        const backupData = {
            units: localStorage.getItem('units'),
            contracts: localStorage.getItem('contracts'),
            invoices: localStorage.getItem('invoices'),
            bookings: localStorage.getItem('bookings'),
            settings: localStorage.getItem('settings'),
            passwordHash: localStorage.getItem('passwordHash'),
            userId: localStorage.getItem('userId'),
            biometricCredentialId: localStorage.getItem('biometricCredentialId'),
        };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        link.href = url;
        link.download = `monoambientes-backup-${date}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        alert(`Copia de seguridad creada con éxito. Resumen:\n` +
              `${units.length} Unidades\n` +
              `${contracts.length} Contratos\n` +
              `${invoices.length} Facturas\n` +
              `${bookings.length} Reservas`);
    };

    const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') {
                    throw new Error("El archivo no es válido.");
                }
                const restoredData = JSON.parse(text);

                // Validation
                const requiredKeys = ['units', 'contracts', 'invoices', 'bookings', 'settings', 'passwordHash'];
                if (!requiredKeys.every(key => key in restoredData && typeof restoredData[key] === 'string')) {
                     throw new Error("El archivo de respaldo está incompleto o corrupto.");
                }
                
                // Summary
                const summary = {
                    units: JSON.parse(restoredData.units).length,
                    contracts: JSON.parse(restoredData.contracts).length,
                    invoices: JSON.parse(restoredData.invoices).length,
                    bookings: JSON.parse(restoredData.bookings).length,
                }

                if (window.confirm("¿Seguro que querés restaurar los datos? Se sobreescribirán todos los datos actuales.")) {
                    Object.keys(restoredData).forEach(key => {
                        if (restoredData[key]) {
                            localStorage.setItem(key, restoredData[key]);
                        } else {
                            localStorage.removeItem(key);
                        }
                    });
                     alert(`Restauración completada.\n`+
                           `Se cargaron: ${summary.units} Unidades, ${summary.contracts} Contratos, ${summary.invoices} Facturas, ${summary.bookings} Reservas.\n`+
                           `La aplicación se reiniciará ahora.`);
                    window.location.reload();
                }
            } catch (error) {
                console.error("Error al restaurar:", error);
                alert("Error al leer el archivo de respaldo. Asegúrate de que no esté dañado.");
            } finally {
                 // Reset file input
                if(fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
            }
        };
        reader.readAsText(file);
    };

    return (
        <Page title="Configuración" onBack={() => setView('DASHBOARD')} actions={<Button onClick={handleSave}>Guardar Cambios</Button>}>
            <div className="space-y-8">
                <Card>
                    <h2 className="text-xl font-bold mb-4">Tarifas Diarias</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="1 Persona" type="number" value={currentSettings.dailyRates.p1} onChange={e => handleSettingsChange('dailyRates', {...currentSettings.dailyRates, p1: parseFloat(e.target.value) || 0})} />
                        <Input label="2 Personas" type="number" value={currentSettings.dailyRates.p2} onChange={e => handleSettingsChange('dailyRates', {...currentSettings.dailyRates, p2: parseFloat(e.target.value) || 0})} />
                        <Input label="3 Personas" type="number" value={currentSettings.dailyRates.p3} onChange={e => handleSettingsChange('dailyRates', {...currentSettings.dailyRates, p3: parseFloat(e.target.value) || 0})} />
                        <Input label="4+ Personas" type="number" value={currentSettings.dailyRates.p4} onChange={e => handleSettingsChange('dailyRates', {...currentSettings.dailyRates, p4: parseFloat(e.target.value) || 0})} />
                    </div>
                </Card>
                <Card>
                    <h2 className="text-xl font-bold mb-4">Configuración General</h2>
                     <Input 
                        label="Porcentaje de Depósito para Reservas (%)" 
                        type="number" 
                        value={currentSettings.bookingDepositPercentage} 
                        onChange={e => handleSettingsChange('bookingDepositPercentage', parseFloat(e.target.value) || 0)} 
                    />
                </Card>
                 <Card>
                    <h2 className="text-xl font-bold mb-4">Seguridad</h2>
                    {isBiometricSupported && (
                        <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-md">
                            <div className="flex items-center gap-3">
                                <Fingerprint className="text-indigo-400" />
                                <div>
                                    <p className="font-semibold">Acceso Biométrico</p>
                                    <p className="text-sm text-gray-400">{isBiometricRegistered ? "Habilitado" : "Deshabilitado"}</p>
                                </div>
                            </div>
                            {isBiometricRegistered ? (
                                <Button variant="danger" onClick={deregisterBiometrics}>Deshabilitar</Button>
                            ) : (
                                <Button onClick={registerBiometrics}>Habilitar</Button>
                            )}
                        </div>
                    )}
                </Card>
                <Card>
                     <h2 className="text-xl font-bold mb-4">Copia de Seguridad y Restauración</h2>
                     <p className="text-sm text-gray-400 mb-4">Guarda todos tus datos en un archivo para transferirlos a otro dispositivo o guardarlos como respaldo.</p>
                     <div className="flex gap-4">
                        <Button onClick={handleBackup}><FileDown size={16} /> Crear y Descargar Copia</Button>
                        <Button variant="secondary" onClick={() => fileInputRef.current?.click()}><FileUp size={16} /> Restaurar desde Archivo</Button>
                        <input type="file" ref={fileInputRef} onChange={handleRestore} accept=".json" className="hidden" />
                     </div>
                </Card>
            </div>
        </Page>
    );
};


// --- APP CONTAINER & ROUTING ---
const AppContent: React.FC = () => {
    const [view, setView] = useState<View>('DASHBOARD');

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

const AuthScreen: React.FC = () => {
    const { 
        isPasswordSet, 
        setupPassword, 
        loginWithPassword, 
        isBiometricRegistered, 
        isBiometricSupported, 
        loginWithBiometrics 
    } = useAuth();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const success = await loginWithPassword(password);
        if (!success) {
            setError('Contraseña incorrecta.');
        }
    };
    
    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }
        if (password.length < 4) {
            setError('La contraseña debe tener al menos 4 caracteres.');
            return;
        }
        await setupPassword(password);
    };

    const handleBiometricLogin = async () => {
        setError('');
        const success = await loginWithBiometrics();
        if(!success) {
            setError('Fallo en la autenticación biométrica. Intentá con tu contraseña.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
            <div className="w-full max-w-sm">
                <div className="text-center mb-8">
                    <Home className="mx-auto h-12 w-12 text-indigo-400" />
                    <h1 className="text-3xl font-bold text-white mt-4">Monoambientes Chamical</h1>
                    <p className="text-gray-400">{isPasswordSet ? "Iniciar Sesión" : "Crear Contraseña Maestra"}</p>
                </div>
                
                <Card>
                    <form onSubmit={isPasswordSet ? handleLogin : handleSetup} className="space-y-6">
                        <Input 
                            label={isPasswordSet ? "Contraseña" : "Nueva Contraseña"} 
                            type="password" 
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required 
                        />
                        {!isPasswordSet && (
                            <Input 
                                label="Confirmar Contraseña" 
                                type="password" 
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                required 
                            />
                        )}

                        {error && <p className="text-red-400 text-sm">{error}</p>}
                        
                        <Button type="submit" className="w-full">
                            <KeyRound size={16} />
                            {isPasswordSet ? "Ingresar" : "Guardar Contraseña"}
                        </Button>
                    </form>
                    {isPasswordSet && isBiometricRegistered && isBiometricSupported && (
                        <>
                            <div className="my-4 flex items-center">
                                <hr className="flex-grow border-gray-600" />
                                <span className="mx-2 text-gray-400 text-sm">o</span>
                                <hr className="flex-grow border-gray-600" />
                            </div>
                            <Button onClick={handleBiometricLogin} variant="secondary" className="w-full">
                                <Fingerprint size={16} />
                                Ingresar con Huella
                            </Button>
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    const auth = useAuthData();
    const appData = useAppData();

    if (!auth.isInitialized) {
        return <div className="bg-gray-900 min-h-screen"></div>; // Loading screen
    }
    
    return (
        <AuthContext.Provider value={auth}>
            <AppContext.Provider value={appData}>
                {auth.isAuthenticated ? <AppContent /> : <AuthScreen />}
            </AppContext.Provider>
        </AuthContext.Provider>
    );
};

export default App;
