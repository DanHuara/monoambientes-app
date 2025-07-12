
import React, { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import { Unit, Contract, Invoice, Booking, GlobalSettings, Payment, UnitType, InvoiceStatus, BookingStatus } from './types';
import { INITIAL_UNITS, INITIAL_SETTINGS, UNIT_TYPE_LABELS } from './constants';
import { Home, FileText, Calendar, BedDouble, Settings, BarChart2, ArrowLeft, PlusCircle, Edit, Trash2, Send, DollarSign, Printer, FileDown } from 'lucide-react';

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
        
        while (currentDate <= endDate) {
            const totalAmount = fullContract.monthlyRent + Object.values(fullContract.additionalCharges).reduce((a, b) => a + b, 0);
            newInvoices.push({
                id: `invoice-${id}-${currentDate.getTime()}`,
                contractId: id,
                unitId: fullContract.unitId,
                tenantName: fullContract.tenantName,
                period: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
                dueDate: new Date(currentDate.getFullYear(), currentDate.getMonth(), 10).toISOString(),
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
            const paidAmount = originalContract.depositAmount - originalContract.depositBalance;
            const newDepositAmount = finalUpdatedContract.monthlyRent;
            const newBalance = newDepositAmount - paidAmount;
            const newStatus = newBalance <= 0 ? InvoiceStatus.PAID : (paidAmount > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.PENDING);
            
            finalUpdatedContract = {
                ...finalUpdatedContract,
                depositAmount: newDepositAmount,
                depositBalance: newBalance,
                depositStatus: newStatus,
                depositPayments: originalContract.depositPayments,
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
    
            invoicesForThisContract.forEach(inv => {
                if (newContractPeriods.has(inv.period)) {
                    const newTotalAmount = finalUpdatedContract.monthlyRent + Object.values(finalUpdatedContract.additionalCharges).reduce((a, b) => a + b, 0);
                    let updatedInvoice = { ...inv };
                    updatedInvoice.tenantName = finalUpdatedContract.tenantName;
                    
                    if (updatedInvoice.status !== InvoiceStatus.PAID) {
                        const paidAmount = updatedInvoice.totalAmount - updatedInvoice.balance;
                        const newBalance = newTotalAmount - paidAmount;
                        const newStatus = newBalance <= 0 ? InvoiceStatus.PAID : (paidAmount > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.PENDING);
                        
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
                    dueDate: new Date(year, month - 1, 10).toISOString(),
                    baseRent: finalUpdatedContract.monthlyRent,
                    additionalCharges: finalUpdatedContract.additionalCharges,
                    totalAmount,
                    balance: totalAmount,
                    status: InvoiceStatus.PENDING,
                    payments: [],
                    reminderSent: false,
                });
            });
    
            return [...otherInvoices, ...finalInvoicesForContract];
        });
    }, [contracts]);
    
    const addPayment = useCallback((invoiceId: string, payment: Omit<Payment, 'id'>) => {
        setInvoices(prev => prev.map(inv => {
            if (inv.id === invoiceId) {
                const newPayments = [...inv.payments, { ...payment, id: `payment-${Date.now()}` }];
                const paidAmount = newPayments.reduce((sum, p) => sum + p.amount, 0);
                const balance = inv.totalAmount - paidAmount;
                let status = InvoiceStatus.PARTIAL;
                if (balance <= 0) status = InvoiceStatus.PAID;
                if (paidAmount === 0) status = InvoiceStatus.PENDING;

                return { ...inv, payments: newPayments, balance, status };
            }
            return inv;
        }));
    }, []);

    const addDepositPayment = useCallback((contractId: string, payment: Omit<Payment, 'id'>) => {
        setContracts(prev => prev.map(c => {
            if (c.id === contractId) {
                const newPayments = [...c.depositPayments, { ...payment, id: `payment-deposit-${Date.now()}` }];
                const paidAmount = newPayments.reduce((sum, p) => sum + p.amount, 0);
                const balance = c.depositAmount - paidAmount;
                let status = InvoiceStatus.PARTIAL;
                if (balance <= 0) status = InvoiceStatus.PAID;
                
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
                const newPayments = [...book.payments, { ...payment, id: `payment-${Date.now()}` }];
                const paidAmount = newPayments.reduce((sum, p) => sum + p.amount, 0);
                const balance = book.totalAmount - paidAmount;
                let status = BookingStatus.PARTIAL;
                if (balance <= 0) {
                    status = BookingStatus.PAID;
                } else if (paidAmount === 0) {
                    status = BookingStatus.PENDING;
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

// --- CONTEXT ---
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
    const pendingInvoices = invoices.filter(i => i.status === InvoiceStatus.PENDING || i.status === InvoiceStatus.PARTIAL).length;

    const navItems = [
        { view: 'MONTHLY', label: 'Alquileres Mensuales', icon: FileText, desc: 'Gestionar contratos y pagos' },
        { view: 'DAILY', label: 'Alquileres Diarios', icon: BedDouble, desc: 'Gestionar reservas y tarifas' },
        { view: 'CALENDAR', label: 'Calendario y Avisos', icon: Calendar, desc: 'Vencimientos y recordatorios' },
        { view: 'REPORTS', label: 'Reportes', icon: BarChart2, desc: 'Exportar datos financieros' },
        { view: 'SETTINGS', label: 'Configuración', icon: Settings, desc: 'Tarifas y gastos globales' },
    ];

    return (
        <div className="p-4 sm:p-6">
            <header className="text-center mb-8">
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
                
                if (!isAPaid) {
                     return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                }

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
                        <option value={1}>1 cuota</option>
                        <option value={2}>2 cuotas</option>
                        <option value={3}>3 cuotas</option>
                    </select>
                </div>

                <h4 className="text-lg font-semibold border-t border-gray-700 pt-4 mt-4">Gastos Adicionales Recurrentes</h4>
                <div className="space-y-2">
                    {Object.entries(extraCharges).map(([key, value]) => (
                        <Input 
                            key={key} 
                            label={key.charAt(0).toUpperCase() + key.slice(1)} 
                            type="number" 
                            value={value} 
                            onChange={e => setExtraCharges(prev => ({...prev, [key]: Number(e.target.value)}))} 
                        />
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
            setAmount(0);
            setPayerName('');
            setDate('');
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
            if (!acc[booking.unitId]) {
                acc[booking.unitId] = [];
            }
            acc[booking.unitId].push(booking);
            return acc;
        }, {} as Record<string, Booking[]>);
    }, [bookings]);

    const handleAddBookingPayment = (paymentData: {amount: number; payerName: string; date: string}) => {
        if (selectedBooking) {
            addBookingPayment(selectedBooking.id, paymentData);
            setBookingPaymentModalOpen(false);
            setSelectedBooking(null);
        }
    };

    const handleClosePaymentModal = () => {
        setBookingPaymentModalOpen(false);
        setSelectedBooking(null);
    }

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
                                            {getBookingStatusChip(booking.status)}
                                       </div>
                                       <p className="text-sm text-gray-300">
                                            {new Date(booking.startDate + 'T12:00:00').toLocaleDateString()} - {new Date(booking.endDate + 'T12:00:00').toLocaleDateString()}
                                            <span className="mx-2">|</span>
                                            {booking.guestCount} Huésped(es)
                                       </p>
                                       <p className="text-sm text-gray-400">Total: ${booking.totalAmount.toLocaleString()} | Saldo: ${booking.balance.toLocaleString()}</p>
                                   </div>
                                   <div className="flex items-center gap-2 self-start sm:self-center">
                                       <Button onClick={() => { setSelectedBooking(booking); setBookingPaymentModalOpen(true); }} variant="secondary" disabled={booking.status === BookingStatus.PAID}>
                                           <DollarSign size={16}/> Registrar Pago
                                       </Button>
                                       <button onClick={() => window.confirm('¿Seguro que querés borrar esta reserva?') && deleteBooking(booking.id)} className="p-2 text-gray-400 hover:text-red-400 transition-colors"><Trash2 size={18}/></button>
                                   </div>
                               </div>
                           ))}
                           {!(bookingsByUnit[unit.id] || []).length && <p className="text-gray-400">No hay reservas para esta unidad.</p>}
                        </div>
                    </Card>
                ))}
            </div>
            <BookingFormModal isOpen={isBookingModalOpen} onClose={() => setBookingModalOpen(false)} units={dailyUnits} addBooking={addBooking} />
            <BookingPaymentModal 
                isOpen={isBookingPaymentModalOpen}
                onClose={handleClosePaymentModal}
                booking={selectedBooking}
                onAddBookingPayment={handleAddBookingPayment}
            />
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
        const start = new Date(startDate);
        const end = new Date(endDate);
        const nights = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24));
        if (nights <= 0) return 0;
        
        const rateKey = `p${guestCount}` as keyof typeof settings.dailyRates;
        const dailyRate = settings.dailyRates[rateKey] || settings.dailyRates.p4;
        return nights * dailyRate;
    }, [startDate, endDate, guestCount, settings.dailyRates]);
    
    const suggestedDeposit = useMemo(() => {
        return Math.round((totalAmount * settings.bookingDepositPercentage) / 100);
    }, [totalAmount, settings.bookingDepositPercentage]);

    useEffect(() => {
        if(suggestedAmount > 0) {
            setTotalAmount(suggestedAmount);
        } else {
            setTotalAmount(0);
        }
    }, [suggestedAmount]);

    useEffect(() => {
        setDeposit(suggestedDeposit);
    }, [suggestedDeposit]);
    
    useEffect(() => {
        if (isOpen) {
            setUnitId(units[0]?.id || '');
            setGuestName('');
            setStartDate('');
            setEndDate('');
            setGuestCount(1);
            setTotalAmount(0);
            setDeposit(0);
        }
    }, [isOpen, units]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(!unitId || !guestName || !startDate || !endDate || guestCount < 1 || new Date(startDate) >= new Date(endDate) || totalAmount <= 0) {
            alert('Completá todos los campos correctamente. La fecha de fin debe ser posterior a la de inicio y el monto total debe ser mayor a 0.');
            return;
        }
        addBooking({
            unitId, guestName, startDate, endDate, guestCount, totalAmount, deposit
        });
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
                <Input label="Cantidad de Huéspedes (1-4)" type="number" min="1" max="4" value={guestCount} onChange={e => setGuestCount(Number(e.target.value))} required />
                <div>
                    <Input label="Monto Total" type="number" value={totalAmount} onChange={e => setTotalAmount(Number(e.target.value))} required />
                    {suggestedAmount > 0 && totalAmount !== suggestedAmount && <p className="text-xs text-gray-400 mt-1">Sugerido: ${suggestedAmount.toLocaleString()}</p>}
                </div>
                <div>
                    <Input label="Seña" type="number" value={deposit} onChange={e => setDeposit(Number(e.target.value))} required />
                    {suggestedDeposit > 0 && deposit !== suggestedDeposit && <p className="text-xs text-gray-400 mt-1">Sugerido ({settings.bookingDepositPercentage}%): ${suggestedDeposit.toLocaleString()}</p>}
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button onClick={onClose} variant="secondary" type="button">Cancelar</Button>
                    <Button type="submit">Crear Reserva</Button>
                </div>
            </form>
        </Modal>
    );
};


const CalendarView: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
    const { invoices, setReminderSent } = useApp();
    
    const upcomingInvoices = useMemo(() => 
        invoices
            .filter(i => i.status === InvoiceStatus.PENDING || i.status === InvoiceStatus.PARTIAL)
            .sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    , [invoices]);

    const handleSendReminder = (invoice: Invoice) => {
        const details = Object.entries(invoice.additionalCharges).map(([key, value]) => `- ${key.charAt(0).toUpperCase() + key.slice(1)}: $${value.toLocaleString()}`).join('\n');
        
        const message = `Hola ${invoice.tenantName}\nTe recordamos que el ${new Date(invoice.dueDate).toLocaleDateString()} vence tu alquiler del periodo ${invoice.period}.\n\nTotal a pagar: $${invoice.totalAmount.toLocaleString()}\nDetalle:\n- Alquiler: $${invoice.baseRent.toLocaleString()}\n${details}\n\nPor favor avisá si necesitás más información.\n— Monoambientes Chamical`;

        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
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
                            <Button onClick={() => handleSendReminder(inv)} variant={inv.reminderSent ? "secondary" : "primary"}>
                                <Send size={16}/> {inv.reminderSent ? "Reenviar Aviso" : "Enviar Aviso"}
                            </Button>
                        </div>
                    )) : <p className="text-gray-400">No hay vencimientos pendientes.</p>}
                </div>
            </Card>
        </Page>
    );
};

const ReportsView: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
    const { invoices, bookings, contracts } = useApp();
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reportData, setReportData] = useState<any[] | null>(null);

    const generateReport = () => {
        const start = startDate ? new Date(startDate + 'T00:00:00') : null;
        const end = endDate ? new Date(endDate + 'T23:59:59') : null;

        const dateFilter = (pDate: Date) => {
            if (start && pDate < start) return false;
            if (end && pDate > end) return false;
            return true;
        };

        const invoicePayments = invoices.flatMap(inv => 
            inv.payments.filter(p => dateFilter(new Date(p.date)))
            .map(p => ({
                date: new Date(p.date),
                type: 'Ingreso Alquiler Mensual',
                description: `Pago de ${inv.tenantName} (Período ${inv.period})`,
                amount: p.amount
            }))
        );
        
        const depositPayments = contracts.flatMap(c => 
            c.depositPayments.filter(p => dateFilter(new Date(p.date)))
            .map(p => ({
                date: new Date(p.date),
                type: 'Ingreso Depósito',
                description: `Depósito de ${c.tenantName}`,
                amount: p.amount
            }))
        );

        const bookingPayments = bookings.flatMap(book => 
            book.payments.filter(p => dateFilter(new Date(p.date)))
            .map(p => ({
                date: new Date(p.date),
                type: 'Ingreso Alquiler Diario',
                description: `Pago de ${book.guestName} (${new Date(book.startDate + 'T12:00:00').toLocaleDateString()} - ${new Date(book.endDate + 'T12:00:00').toLocaleDateString()})`,
                amount: p.amount
            }))
        );

        const combinedReportData = [...invoicePayments, ...depositPayments, ...bookingPayments]
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .map(item => ({...item, date: item.date.toLocaleDateString() }));
        
        setReportData(combinedReportData);
    };

    const exportToCSV = () => {
        if (!reportData) return;
        const header = 'Fecha,Tipo,Descripción,Monto\n';
        const rows = reportData.map(r => `${r.date},"${r.type}","${r.description}",${r.amount}`).join('\n');
        const csvContent = "data:text/csv;charset=utf-8," + '\uFEFF' + header + rows;
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "reporte_monoambientes.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const printReport = () => {
        const printWindow = window.open('', '_blank');
        if(printWindow) {
            printWindow.document.write(`
                <html>
                <head>
                    <title>Reporte de Pagos</title>
                    <style>
                        body { font-family: sans-serif; }
                        h1, h2, p { margin: 0; }
                        header { margin-bottom: 20px; text-align: center; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                    </style>
                </head>
                <body>
                    <header>
                        <h1>Monoambientes Chamical</h1>
                        <p>Reporte de pagos y vencimientos</p>
                        <p>Generado el: ${new Date().toLocaleDateString()}</p>
                    </header>
                    <table>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Tipo</th>
                                <th>Descripción</th>
                                <th>Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(reportData || []).map(r => `
                                <tr>
                                    <td>${r.date}</td>
                                    <td>${r.type}</td>
                                    <td>${r.description}</td>
                                    <td>$${r.amount.toLocaleString()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.print();
        }
    };

    return (
        <Page title="Reportes" onBack={() => setView('DASHBOARD')}>
            <Card>
                <div className="flex flex-col md:flex-row gap-4 items-center mb-6">
                    <Input label="Fecha Desde" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <Input label="Fecha Hasta" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    <div className="self-end">
                        <Button onClick={generateReport}>Generar Reporte</Button>
                    </div>
                </div>

                {reportData && (
                    <div>
                        <div className="flex gap-2 mb-4">
                            <Button onClick={printReport} variant="secondary"><Printer size={16}/> Imprimir/PDF</Button>
                            <Button onClick={exportToCSV} variant="secondary"><FileDown size={16}/> Exportar a CSV</Button>
                        </div>
                        <div className="overflow-x-auto">
                           <table className="w-full text-left">
                                <thead className="bg-gray-700">
                                    <tr>
                                        <th className="p-3">Fecha</th>
                                        <th className="p-3">Tipo</th>
                                        <th className="p-3">Descripción</th>
                                        <th className="p-3">Monto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.map((row, i) => (
                                        <tr key={i} className="border-b border-gray-700">
                                            <td className="p-3">{row.date}</td>
                                            <td className="p-3">{row.type}</td>
                                            <td className="p-3">{row.description}</td>
                                            <td className="p-3">${row.amount.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                           </table>
                        </div>
                    </div>
                )}
                 {reportData && reportData.length === 0 && <p className="text-gray-400 mt-4">No se encontraron datos para el rango de fechas seleccionado.</p>}
            </Card>
        </Page>
    );
};

const SettingsView: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
    const { settings, updateSettings } = useApp();
    const [currentSettings, setCurrentSettings] = useState(settings);
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        setCurrentSettings(settings);
    }, [settings]);

    const handleSave = () => {
        updateSettings(currentSettings);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
    };

    const handleChargeChange = <K extends keyof GlobalSettings['additionalCharges']>(key: K, value: string) => {
        setCurrentSettings(prev => ({ ...prev, additionalCharges: { ...prev.additionalCharges, [key]: Number(value) } }));
    };

    const handleRateChange = <K extends keyof GlobalSettings['dailyRates']>(key: K, value: string) => {
        setCurrentSettings(prev => ({ ...prev, dailyRates: { ...prev.dailyRates, [key]: Number(value) } }));
    };

    return (
        <Page title="Configuración" onBack={() => setView('DASHBOARD')}>
            <Card>
                <div className="space-y-6">
                    <div>
                        <h3 className="text-xl font-bold mb-3">Gastos Adicionales Globales</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Input label="Internet" type="number" value={currentSettings.additionalCharges.internet} onChange={e => handleChargeChange('internet', e.target.value)} />
                            <Input label="Muebles" type="number" value={currentSettings.additionalCharges.furniture} onChange={e => handleChargeChange('furniture', e.target.value)} />
                            <Input label="Otros" type="number" value={currentSettings.additionalCharges.other} onChange={e => handleChargeChange('other', e.target.value)} />
                        </div>
                    </div>
                     <div>
                        <h3 className="text-xl font-bold mb-3">Tarifas Alquiler Diario</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Input label="1 Persona" type="number" value={currentSettings.dailyRates.p1} onChange={e => handleRateChange('p1', e.target.value)} />
                            <Input label="2 Personas" type="number" value={currentSettings.dailyRates.p2} onChange={e => handleRateChange('p2', e.target.value)} />
                            <Input label="3 Personas" type="number" value={currentSettings.dailyRates.p3} onChange={e => handleRateChange('p3', e.target.value)} />
                            <Input label="4 Personas" type="number" value={currentSettings.dailyRates.p4} onChange={e => handleRateChange('p4', e.target.value)} />
                        </div>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold mb-3">Reserva Diaria</h3>
                        <Input label="Porcentaje de Seña (%)" type="number" value={currentSettings.bookingDepositPercentage} onChange={e => setCurrentSettings(prev => ({ ...prev, bookingDepositPercentage: Number(e.target.value) }))} />
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-700 flex justify-end items-center gap-4">
                    {showSuccess && <p className="text-sm text-green-400">Guardado con éxito!</p>}
                    <Button onClick={handleSave}>Guardar Cambios</Button>
                </div>
            </Card>
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

    return (
        <AppContext.Provider value={appData}>
            <div className="min-h-screen bg-gray-900 text-gray-100">
                {renderView()}
            </div>
        </AppContext.Provider>
    );
}
