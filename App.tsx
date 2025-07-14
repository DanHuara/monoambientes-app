
import React, { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import { Unit, Contract, Invoice, Booking, GlobalSettings, Payment, UnitType, InvoiceStatus, BookingStatus } from './types';
import { INITIAL_UNITS, INITIAL_SETTINGS, UNIT_TYPE_LABELS } from './constants';
import { Home, FileText, Calendar, BedDouble, Settings, BarChart2, ArrowLeft, PlusCircle, Edit, Trash2, Send, DollarSign, Printer, FileDown, LogOut, KeyRound, Mail, LogIn, UserPlus, AlertTriangle } from 'lucide-react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';


// --- FIREBASE SETUP ---
// ************************************************************************************
// *  ACCIÓN REQUERIDA: REEMPLAZA ESTO CON LA CONFIGURACIÓN DE TU PROYECTO FIREBASE      *
// *  Ve a la consola de Firebase > Configuración del Proyecto > General                *
// *  y copia el objeto de configuración de tu aplicación web aquí.                    *
// ************************************************************************************
const firebaseConfig = {
  apiKey: "AIzaSyAX7R4-eHUnjGA8bXAwJJ9U3TgA5ImODk0",
  authDomain: "gestion-alquileres-85cb5.firebaseapp.com",
  projectId: "gestion-alquileres-85cb5",
  storageBucket: "gestion-alquileres-85cb5.firebasestorage.app",
  messagingSenderId: "593514441418",
  appId: "1:593514441418:web:9880daee0d769eb2842233",
  measurementId: "G-PWNFJXZYQ6"
};

const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY" && firebaseConfig.projectId !== "YOUR_PROJECT_ID";

const FirebaseConfigNeeded = () => (
    <div className="flex items-center justify-center min-h-screen p-4 bg-gray-900 text-gray-100">
        <div className="max-w-3xl mx-auto bg-gray-800 shadow-2xl rounded-lg p-6 sm:p-8 border border-red-500/50">
            <h1 className="text-2xl sm:text-3xl font-bold text-red-400 mb-4 text-center">ACCIÓN REQUERIDA: Configurar Firebase</h1>
            <p className="text-lg mb-6 text-gray-200 text-center">La aplicación no puede iniciarse porque necesita las credenciales de la base de datos en la nube (Firebase). ¡No te preocupes! Es un paso sencillo.</p>
            <div className="text-left bg-gray-900/50 p-6 rounded-lg space-y-4 border border-gray-700">
                <p><strong className="text-indigo-300">Paso 1:</strong> Andá a la <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="font-bold text-indigo-400 hover:underline">Consola de Firebase</a> y creá un nuevo proyecto (es gratis).</p>
                <p><strong className="text-indigo-300">Paso 2:</strong> Dentro del panel de tu nuevo proyecto, hacé clic en el ícono de "Aplicación web" (es como esto: <code className="text-lg">&lt;/&gt;</code>) para registrar tu app.</p>
                <p><strong className="text-indigo-300">Paso 3:</strong> Firebase te dará un objeto de configuración llamado <code className="bg-gray-700 px-2 py-1 rounded-md text-yellow-300">firebaseConfig</code>. Copiá todo ese bloque de código.</p>
                <p><strong className="text-indigo-300">Paso 4:</strong> Abrí el archivo <code className="bg-gray-700 px-2 py-1 rounded-md text-yellow-300">App.tsx</code> en tu editor de código.</p>
                <p><strong className="text-indigo-300">Paso 5:</strong> Buscá la constante <code className="bg-gray-700 px-2 py-1 rounded-md text-yellow-300">firebaseConfig</code> al principio del archivo y reemplazá todo el bloque de ejemplo con el que copiaste de Firebase.</p>
            </div>
            <p className="mt-6 text-gray-400 text-center">Una vez que guardes el cambio, la página se recargará y verás la pantalla de inicio de sesión.</p>
        </div>
    </div>
);

// The entire application logic is moved into this component.
// It will only be rendered if Firebase is configured correctly.
function RentalApp() {
    // Initialize Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const auth = firebase.auth();
    const db = firebase.firestore();
    const googleProvider = new firebase.auth.GoogleAuthProvider();

    // Enable offline persistence
    db.enablePersistence()
      .catch((err) => {
        if (err.code == 'failed-precondition') {
          console.warn("Firestore persistence failed: multiple tabs open.");
        } else if (err.code == 'unimplemented') {
          console.warn("Firestore persistence not supported in this browser.");
        }
      });

    // --- AUTH HOOK AND CONTEXT ---
    const useAuthData = () => {
        const [user, setUser] = useState<firebase.User | null>(null);
        const [isLoading, setIsLoading] = useState(true);

        useEffect(() => {
            const unsubscribe = auth.onAuthStateChanged((user) => {
                setUser(user);
                setIsLoading(false);
            });
            return () => unsubscribe();
        }, []);

        const signUp = async (email: string, password: string) => {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const newUser = userCredential.user;
            if (!newUser) throw new Error("User creation failed.");

            try {
                // Atomic operation: Create user settings immediately.
                const settingsDocRef = db.collection("settings").doc(newUser.uid);
                await settingsDocRef.set({ ...INITIAL_SETTINGS, userId: newUser.uid });
                return userCredential;
            } catch (dbError) {
                // If firestore fails, rollback auth user creation
                await newUser.delete();
                // re-throw the database error to be caught by the UI
                throw dbError;
            }
        };

        const signInWithGoogle = async () => {
            const result = await auth.signInWithPopup(googleProvider);
            const user = result.user;
            if (!user) throw new Error("Google Sign in failed.");

            // Check if user settings exist, if not create them
            const settingsDocRef = db.collection("settings").doc(user.uid);
            const settingsSnap = await settingsDocRef.get();
            if (!settingsSnap.exists) {
                try {
                    await settingsDocRef.set({ ...INITIAL_SETTINGS, userId: user.uid });
                } catch(dbError) {
                     await user.delete();
                     throw dbError;
                }
            }
            return result;
        };

        const signIn = (email: string, password: string) => auth.signInWithEmailAndPassword(email, password);
        const logOut = () => auth.signOut();

        return { user, isLoading, signUp, signIn, signInWithGoogle, logOut };
    };

    const AuthContext = createContext<ReturnType<typeof useAuthData> | null>(null);
    const useAuth = () => {
        const context = useContext(AuthContext);
        if (!context) throw new Error("useAuth must be used within an AuthProvider");
        return context;
    };

    // --- DATA HOOK ---
    const useAppData = () => {
        const { user } = useAuth();
        const [units, setUnits] = useState<Unit[]>(INITIAL_UNITS); // Units are constant for now
        const [contracts, setContracts] = useState<Contract[]>([]);
        const [invoices, setInvoices] = useState<Invoice[]>([]);
        const [bookings, setBookings] = useState<Booking[]>([]);
        const [settings, setSettings] = useState<GlobalSettings>(INITIAL_SETTINGS);
        const [isLoading, setIsLoading] = useState(true);
        const [dbError, setDbError] = useState<string | null>(null);


        useEffect(() => {
            if (!user) {
                setContracts([]);
                setInvoices([]);
                setBookings([]);
                setSettings(INITIAL_SETTINGS);
                setIsLoading(false);
                setDbError(null);
                return;
            }

            setIsLoading(true);
            setDbError(null);

            const handleSnapshotError = (error: any, collectionName: string) => {
                console.error(`Error fetching ${collectionName}:`, error);
                if (error.code === 'permission-denied') {
                    setDbError('permission-denied');
                }
            };

            const qContracts = db.collection('contracts').where("userId", "==", user.uid);
            const unsubContracts = qContracts.onSnapshot((snapshot) => {
                setContracts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Contract[]);
            }, (error) => handleSnapshotError(error, 'contracts'));

            const qInvoices = db.collection('invoices').where("userId", "==", user.uid);
            const unsubInvoices = qInvoices.onSnapshot((snapshot) => {
                setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Invoice[]);
            }, (error) => handleSnapshotError(error, 'invoices'));

            const qBookings = db.collection('bookings').where("userId", "==", user.uid);
            const unsubBookings = qBookings.onSnapshot((snapshot) => {
                setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Booking[]);
            }, (error) => handleSnapshotError(error, 'bookings'));

            const settingsDocRef = db.collection("settings").doc(user.uid);
            const unsubSettings = settingsDocRef.onSnapshot((docSnapshot) => {
                if (docSnapshot.exists) {
                    setSettings(docSnapshot.data() as GlobalSettings);
                    if (dbError) setDbError(null);
                }
                setIsLoading(false);
            }, (error) => {
                handleSnapshotError(error, 'settings');
                setIsLoading(false);
            });

            return () => {
                unsubContracts();
                unsubInvoices();
                unsubBookings();
                unsubSettings();
            };

        }, [user]);
        
        const addContract = useCallback(async (newContractData: Omit<Contract, 'id' | 'depositAmount' | 'depositBalance' | 'depositStatus' | 'depositPayments' | 'userId'>) => {
            if (!user) return;
            const id = `contract-${Date.now()}`;
            const depositAmount = newContractData.monthlyRent;
            const fullContract: Omit<Contract, 'id'> = {
                ...newContractData,
                depositAmount,
                depositBalance: depositAmount,
                depositStatus: InvoiceStatus.PENDING,
                depositPayments: [],
                userId: user.uid,
            };

            const contractDocRef = db.collection("contracts").doc(id);
            
            // Generate invoices
            const newInvoices: Omit<Invoice, 'id'>[] = [];
            let currentDate = new Date(fullContract.startDate + 'T12:00:00');
            const endDate = new Date(fullContract.endDate + 'T12:00:00');
            const contractStartDay = new Date(fullContract.startDate + 'T12:00:00').getDate();

            while (currentDate <= endDate) {
                const totalAmount = fullContract.monthlyRent + Object.values(fullContract.additionalCharges).reduce((a, b) => a + b, 0);
                newInvoices.push({
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
                    userId: user.uid,
                });
                currentDate.setMonth(currentDate.getMonth() + 1);
            }

            const batch = db.batch();
            batch.set(contractDocRef, fullContract);
            newInvoices.forEach(inv => {
                const invId = `invoice-${id}-${new Date(inv.period+'-02').getTime()}`;
                batch.set(db.collection("invoices").doc(invId), inv);
            });

            await batch.commit();

        }, [user]);

        const updateContract = useCallback(async (updatedContract: Contract) => {
            if (!user) return;
            
            const batch = db.batch();

            const contractDocRef = db.collection("contracts").doc(updatedContract.id);
            const originalContract = contracts.find(c => c.id === updatedContract.id);
            if (!originalContract) return;

            let finalUpdatedContract = { ...updatedContract, userId: user.uid };
        
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
                };
            }
        
            batch.set(contractDocRef, finalUpdatedContract);
            
            const q = db.collection("invoices").where("contractId", "==", updatedContract.id).where("userId", "==", user.uid);
            const invoicesSnapshot = await q.get();
            const invoicesForThisContract = invoicesSnapshot.docs.map(d => ({id: d.id, ...d.data()})) as Invoice[];
            
            const newContractPeriods = new Set<string>();
            let tempDate = new Date(finalUpdatedContract.startDate + 'T12:00:00');
            const endDate = new Date(finalUpdatedContract.endDate + 'T12:00:00');
            while(tempDate <= endDate) {
                newContractPeriods.add(`${tempDate.getFullYear()}-${String(tempDate.getMonth() + 1).padStart(2, '0')}`);
                tempDate.setMonth(tempDate.getMonth() + 1);
            }
            
            const contractStartDay = new Date(finalUpdatedContract.startDate + 'T12:00:00').getDate();

            const invoicesToDelete = new Set(invoicesForThisContract.map(i => i.id));

            invoicesForThisContract.forEach(inv => {
                if (newContractPeriods.has(inv.period)) {
                    invoicesToDelete.delete(inv.id); // Keep this invoice, but update it.
                    const [year, month] = inv.period.split('-').map(Number);
                    const newTotalAmount = finalUpdatedContract.monthlyRent + Object.values(finalUpdatedContract.additionalCharges).reduce((a, b) => a + b, 0);
                    let updatedInvoice = { ...inv, userId: user.uid };
                    
                    updatedInvoice.tenantName = finalUpdatedContract.tenantName;
                    updatedInvoice.dueDate = new Date(year, month - 1, contractStartDay).toISOString();
                    
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
                    batch.set(db.collection("invoices").doc(inv.id), updatedInvoice);
                    newContractPeriods.delete(inv.period);
                }
            });
            
            invoicesToDelete.forEach(id => batch.delete(db.collection("invoices").doc(id)));
            
            newContractPeriods.forEach(period => {
                const [year, month] = period.split('-').map(Number);
                const totalAmount = finalUpdatedContract.monthlyRent + Object.values(finalUpdatedContract.additionalCharges).reduce((a, b) => a + b, 0);
                const newInvoiceId = `invoice-${finalUpdatedContract.id}-${new Date(year, month - 1).getTime()}`;
                batch.set(db.collection("invoices").doc(newInvoiceId), {
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
                    userId: user.uid,
                });
            });

            await batch.commit();

        }, [user, contracts]);
        
        const addPayment = useCallback(async (invoiceId: string, payment: Omit<Payment, 'id'>) => {
            if (!user) return;
            const invoice = invoices.find(inv => inv.id === invoiceId);
            if (!invoice) return;

            const newPayments = [...invoice.payments, { ...payment, id: `payment-${Date.now()}` }];
            const paidAmount = newPayments.reduce((sum, p) => sum + p.amount, 0);
            const balance = invoice.totalAmount - paidAmount;
            let status = InvoiceStatus.PARTIAL;
            if (balance <= 0) status = InvoiceStatus.PAID;
            if (paidAmount === 0) status = InvoiceStatus.PENDING;
            
            const invoiceDocRef = db.collection("invoices").doc(invoiceId);
            await invoiceDocRef.update({ payments: newPayments, balance, status });
        }, [user, invoices]);

        const addDepositPayment = useCallback(async (contractId: string, payment: Omit<Payment, 'id'>) => {
            if (!user) return;
            const contract = contracts.find(c => c.id === contractId);
            if (!contract) return;

            const newPayments = [...contract.depositPayments, { ...payment, id: `payment-deposit-${Date.now()}` }];
            const paidAmount = newPayments.reduce((sum, p) => sum + p.amount, 0);
            const balance = contract.depositAmount - paidAmount;
            let status = InvoiceStatus.PARTIAL;
            if (balance <= 0) status = InvoiceStatus.PAID;
            
            const contractDocRef = db.collection("contracts").doc(contractId);
            await contractDocRef.update({ depositPayments: newPayments, depositBalance: balance, depositStatus: status });
        }, [user, contracts]);

        const updateSettings = useCallback(async (newSettings: GlobalSettings) => {
            if (!user) return;
            const settingsDocRef = db.collection("settings").doc(user.uid);
            await settingsDocRef.set({...newSettings, userId: user.uid});
        }, [user]);

        const addBooking = useCallback(async (newBookingData: Omit<Booking, 'id' | 'status' | 'balance' | 'payments' | 'userId'>) => {
            if (!user) return;
            const id = `booking-${Date.now()}`;
            const fullBooking: Omit<Booking, 'id'> = {
                ...newBookingData,
                payments: [],
                balance: newBookingData.totalAmount,
                status: BookingStatus.PENDING,
                userId: user.uid,
            };
            await db.collection("bookings").doc(id).set(fullBooking);
        }, [user]);
        
        const addBookingPayment = useCallback(async (bookingId: string, payment: Omit<Payment, 'id'>) => {
            if (!user) return;
            const booking = bookings.find(book => book.id === bookingId);
            if (!booking) return;

            const newPayments = [...booking.payments, { ...payment, id: `payment-${Date.now()}` }];
            const paidAmount = newPayments.reduce((sum, p) => sum + p.amount, 0);
            const balance = booking.totalAmount - paidAmount;
            let status = BookingStatus.PARTIAL;
            if (balance <= 0) {
                status = BookingStatus.PAID;
            } else if (paidAmount === 0) {
                status = BookingStatus.PENDING;
            }
            
            const bookingDocRef = db.collection("bookings").doc(bookingId);
            await bookingDocRef.update({ payments: newPayments, balance, status });
        }, [user, bookings]);

        const deleteContract = useCallback(async (contractId: string) => {
            if (!user) return;
            const batch = db.batch();
            
            const contractDocRef = db.collection("contracts").doc(contractId);
            batch.delete(contractDocRef);
            
            const q = db.collection("invoices").where("contractId", "==", contractId).where("userId", "==", user.uid);
            const invoicesSnapshot = await q.get();
            invoicesSnapshot.forEach(invoiceDoc => {
                batch.delete(invoiceDoc.ref);
            });
            
            await batch.commit();
        }, [user]);

        const deleteBooking = useCallback(async (bookingId: string) => {
            if (!user) return;
            await db.collection("bookings").doc(bookingId).delete();
        }, [user]);

        const setReminderSent = useCallback(async (invoiceId: string) => {
            if (!user) return;
            await db.collection("invoices").doc(invoiceId).update({ reminderSent: true });
        }, [user]);

        return { units, contracts, invoices, bookings, settings, isLoading, dbError, addContract, updateContract, addPayment, addDepositPayment, updateSettings, addBooking, addBookingPayment, deleteContract, deleteBooking, setReminderSent };
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

    // --- ERROR SCREENS ---
    const FirestoreRulesErrorScreen: React.FC<{ logOut: () => void }> = ({ logOut }) => {
        const correctRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }

    match /settings/{userId} {
      allow read, update, create: if isOwner(userId);
    }
    
    match /{collection}/{docId} {
      // Allow creation if the user is the owner
      allow create: if isOwner(request.resource.data.userId);

      // Allow read, update, delete if the user is the owner
      allow read, update, delete: if isOwner(resource.data.userId);
    }
  }
}`;
        
        return (
            <div className="flex items-center justify-center min-h-screen p-4 bg-gray-900 text-gray-100">
                <div className="max-w-3xl mx-auto bg-gray-800 shadow-2xl rounded-lg p-6 sm:p-8 border border-red-500/50">
                    <div className="text-center">
                        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                        <h1 className="text-2xl sm:text-3xl font-bold text-red-400 mb-4">Error de Permisos en la Base de Datos</h1>
                    </div>
                    <p className="text-lg mb-6 text-gray-200 text-center">La aplicación no puede acceder a tus datos. Esto casi siempre se debe a que las **Reglas de Seguridad** de Firestore no están configuradas correctamente.</p>
                    <div className="text-left bg-gray-900/50 p-6 rounded-lg space-y-4 border border-gray-700">
                        <p className="font-bold text-indigo-300">Solución Rápida:</p>
                        <p>1. Andá a tu <a href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/rules`} target="_blank" rel="noopener noreferrer" className="font-bold text-indigo-400 hover:underline">Consola de Firebase > Firestore > Reglas</a>.</p>
                        <p>2. Borrá todo el contenido actual y pegá el siguiente código:</p>
                        <pre className="bg-gray-900 text-gray-200 p-3 rounded-md text-xs overflow-x-auto">
                            {correctRules}
                        </pre>
                        <p>3. Hacé clic en **"Publicar"**.</p>
                    </div>
                    <div className="mt-8 flex flex-col items-center gap-4">
                        <p className="text-gray-400 text-center">Después de publicar las reglas, cerrá esta sesión y volvé a iniciarla.</p>
                         <Button onClick={logOut} variant="secondary">
                            <LogOut size={16} /> Cerrar Sesión para Reintentar
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // --- VIEWS / PAGES ---

    const Dashboard: React.FC<{ setView: (view: View) => void }> = ({ setView }) => {
        const { invoices } = useApp();
        const { user, logOut } = useAuth();
        const pendingInvoices = invoices.filter(i => i.status === InvoiceStatus.PENDING || i.status === InvoiceStatus.PARTIAL).length;

        const navItems = [
            { view: 'MONTHLY', label: 'Alquileres Mensuales', icon: FileText, desc: 'Gestionar contratos y pagos' },
            { view: 'DAILY', label: 'Alquileres Diarios', icon: BedDouble, desc: 'Gestionar reservas y tarifas' },
            { view: 'CALENDAR', label: 'Calendario y Avisos', icon: Calendar, desc: 'Vencimientos y recordatorios' },
            { view: 'REPORTS', label: 'Reportes', icon: BarChart2, desc: 'Exportar datos financieros' },
            { view: 'SETTINGS', label: 'Configuración', icon: Settings, desc: 'Tarifas generales y cuenta' },
        ];

        return (
            <div className="p-4 sm:p-6">
                <header className="text-center mb-8 relative">
                    <div className="absolute top-0 right-0 flex items-center gap-4">
                        <span className="text-sm text-gray-400 hidden sm:block">{user?.email}</span>
                        <Button onClick={logOut} variant="secondary">
                            <LogOut size={16} /> <span className="hidden sm:inline">Cerrar Sesión</span>
                        </Button>
                    </div>
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
        addContract: (contract: Omit<Contract, 'id' | 'depositAmount' | 'depositBalance' | 'depositStatus' | 'depositPayments' | 'userId'>) => void;
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

    const BookingFormModal: React.FC<{ isOpen: boolean; onClose: () => void; units: Unit[]; addBooking: (booking: Omit<Booking, 'id' | 'status' | 'balance' | 'payments' | 'userId'>) => void; }> = ({ isOpen, onClose, units, addBooking }) => {
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
        const { invoices, bookings, contracts, units } = useApp();
        const [startDate, setStartDate] = useState('');
        const [endDate, setEndDate] = useState('');
        const [selectedUnitId, setSelectedUnitId] = useState('');
        const [reportData, setReportData] = useState<any[] | null>(null);

        const generateReport = () => {
            const start = startDate ? new Date(startDate + 'T00:00:00') : null;
            const end = endDate ? new Date(endDate + 'T23:59:59') : null;
            
            const unitMap = new Map(units.map(u => [u.id, u.name]));

            const dateFilter = (pDate: Date) => {
                if (start && pDate < start) return false;
                if (end && pDate > end) return false;
                return true;
            };

            const unitFilter = (unitId: string) => {
                if (!selectedUnitId) return true; // 'All' is selected
                return unitId === selectedUnitId;
            };

            const invoicePayments = invoices.filter(inv => unitFilter(inv.unitId)).flatMap(inv => 
                inv.payments.filter(p => dateFilter(new Date(p.date)))
                .map(p => ({
                    date: new Date(p.date),
                    department: unitMap.get(inv.unitId) || 'N/A',
                    type: 'Ingreso Alquiler Mensual',
                    description: `Pago de ${inv.tenantName} (Período ${inv.period})`,
                    amount: p.amount
                }))
            );
            
            const depositPayments = contracts.filter(c => unitFilter(c.unitId)).flatMap(c => 
                c.depositPayments.filter(p => dateFilter(new Date(p.date)))
                .map(p => ({
                    date: new Date(p.date),
                    department: unitMap.get(c.unitId) || 'N/A',
                    type: 'Ingreso Depósito',
                    description: `Depósito de ${c.tenantName}`,
                    amount: p.amount
                }))
            );

            const bookingPayments = bookings.filter(book => unitFilter(book.unitId)).flatMap(book => 
                book.payments.filter(p => dateFilter(new Date(p.date)))
                .map(p => ({
                    date: new Date(p.date),
                    department: unitMap.get(book.unitId) || 'N/A',
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
            const header = 'Fecha,Departamento,Tipo,Descripción,Monto\n';
            const rows = reportData.map(r => {
                const description = r.description.replace(/"/g, '""'); // Escape double quotes
                return `${r.date},"${r.department}","${r.type}","${description}",${r.amount}`;
            }).join('\n');
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
                            <p>Reporte de Pagos</p>
                            <p>Generado el: ${new Date().toLocaleDateString()}</p>
                        </header>
                        <table>
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Departamento</th>
                                    <th>Tipo</th>
                                    <th>Descripción</th>
                                    <th>Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(reportData || []).map(r => `
                                    <tr>
                                        <td>${r.date}</td>
                                        <td>${r.department}</td>
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
                    <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-end mb-6">
                        <Input label="Fecha Desde" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <Input label="Fecha Hasta" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Departamento</label>
                            <select
                                value={selectedUnitId}
                                onChange={e => setSelectedUnitId(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[200px]"
                            >
                                <option value="">Todos</option>
                                {units.map(unit => (
                                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                                ))}
                            </select>
                        </div>
                        <Button onClick={generateReport}>Generar Reporte</Button>
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
                                            <th className="p-3">Departamento</th>
                                            <th className="p-3">Tipo</th>
                                            <th className="p-3">Descripción</th>
                                            <th className="p-3 text-right">Monto</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportData.map((row, i) => (
                                            <tr key={i} className="border-b border-gray-700">
                                                <td className="p-3">{row.date}</td>
                                                <td className="p-3">{row.department}</td>
                                                <td className="p-3">{row.type}</td>
                                                <td className="p-3">{row.description}</td>
                                                <td className="p-3 text-right">${row.amount.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                            </table>
                            </div>
                        </div>
                    )}
                    {reportData && reportData.length === 0 && <p className="text-gray-400 mt-4">No se encontraron datos para los filtros seleccionados.</p>}
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
                <div className="space-y-6">
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
                </div>
            </Page>
        );
    };

    const LoginScreen: React.FC = () => {
        const { signUp, signIn, signInWithGoogle } = useAuth();
        const [isSignUp, setIsSignUp] = useState(false);
        const [email, setEmail] = useState('');
        const [password, setPassword] = useState('');
        const [error, setError] = useState('');
        const [isLoading, setIsLoading] = useState(false);

        const handleAuthAction = async (e: React.FormEvent) => {
            e.preventDefault();
            setError('');
            setIsLoading(true);
            try {
                if (isSignUp) {
                    await signUp(email, password);
                } else {
                    await signIn(email, password);
                }
            } catch (err: any) {
                console.error("Firebase Auth/DB Error:", err.code, err.message);
                if (err.code === 'permission-denied') {
                    setError('Error de Permisos. Revisá las Reglas de Seguridad en Firestore.');
                } else if (err.code === 'auth/operation-not-allowed') {
                    setError('Método de inicio de sesión no habilitado en Firebase.');
                } else if (err.code === 'auth/email-already-in-use') {
                    setError('Este email ya está registrado.');
                } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                    setError('Email o contraseña incorrectos.');
                } else if (err.code === 'auth/weak-password') {
                    setError('La contraseña debe tener al menos 6 caracteres.');
                } else {
                    setError('Ocurrió un error. Verificá tu configuración y las reglas de seguridad.');
                }
            } finally {
                setIsLoading(false);
            }
        };
        
        const handleGoogleSignIn = async () => {
            setError('');
            setIsLoading(true);
            try {
                await signInWithGoogle();
            } catch (err: any) {
                console.error("Firebase Google Auth/DB Error:", err.code, err.message);
                 if (err.code === 'permission-denied') {
                    setError('Error de Permisos. Revisá las Reglas de Seguridad en Firestore.');
                 } else if (err.code === 'auth/operation-not-allowed') {
                    setError('El inicio de sesión con Google no está habilitado en Firebase.');
                } else if (err.code === 'auth/popup-closed-by-user') {
                    // Don't show an error for this.
                } else {
                    setError('No se pudo iniciar sesión con Google.');
                }
            } finally {
                setIsLoading(false);
            }
        };

        return (
            <div className="flex items-center justify-center min-h-screen p-4 bg-gray-900">
                <div className="w-full max-w-sm">
                    <div className="text-center mb-8">
                        <Home className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
                        <h1 className="text-3xl font-extrabold text-white tracking-tight">Monoambientes Chamical</h1>
                        <p className="text-gray-400 mt-2">{isSignUp ? 'Creá tu cuenta para empezar' : 'Bienvenido de nuevo'}</p>
                    </div>

                    <Card className="!p-8">
                        <form onSubmit={handleAuthAction} className="space-y-6">
                            <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                            <Input label="Contraseña" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                            {error && <p className="text-red-400 text-sm text-center bg-red-500/10 p-2 rounded-md">{error}</p>}
                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isSignUp ? <UserPlus size={16}/> : <LogIn size={16}/>}
                                {isLoading ? (isSignUp ? 'Creando cuenta...' : 'Iniciando sesión...') : (isSignUp ? 'Crear Cuenta' : 'Iniciar Sesión')}
                            </Button>
                        </form>

                        <div className="relative my-6">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-600"></div></div>
                            <div className="relative flex justify-center text-sm"><span className="px-2 bg-gray-800 text-gray-400">o</span></div>
                        </div>
                        
                        <Button type="button" variant="secondary" className="w-full" onClick={handleGoogleSignIn} disabled={isLoading}>
                            <svg className="w-5 h-5" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 126 21.2 172.9 65.6l-58.3 58.3C338.1 102.4 295.4 88 248 88c-73.2 0-133.1 59.9-133.1 133.1s59.9 133.1 133.1 133.1c76.1 0 112.5-43.2 116.5-64.2H248V256h239.8c1.3 7.8 1.9 15.6 1.9 23.8z"></path></svg>
                            {isLoading ? '...' : 'Continuar con Google'}
                        </Button>

                        <p className="mt-6 text-center text-sm">
                            <span className="text-gray-400">{isSignUp ? '¿Ya tenés cuenta?' : '¿No tenés una cuenta?'}</span>
                            {' '}
                            <button onClick={() => { setIsSignUp(!isSignUp); setError(''); }} className="font-semibold text-indigo-400 hover:text-indigo-300">
                                {isSignUp ? 'Iniciá sesión' : 'Registrate'}
                            </button>
                        </p>
                    </Card>
                </div>
            </div>
        );
    };

    // --- MAIN APP COMPONENT ---
    function MainApp() {
        const [view, setView] = useState<View>('DASHBOARD');
        const appData = useApp();
        const { logOut } = useAuth();

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
                    <p>Cargando tus datos...</p>
                </div>
            );
        }

        if (appData.dbError === 'permission-denied') {
            return <FirestoreRulesErrorScreen logOut={logOut} />;
        }

        return (
            <div className="min-h-screen bg-gray-900 text-gray-100">
                {renderView()}
            </div>
        );
    }
    
    // This is the container that provides all the contexts.
    const AppContainer = () => {
        const authData = useAuthData();
        
        if (authData.isLoading) {
            return (
                <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-100">
                    <p>Cargando aplicación...</p>
                </div>
            );
        }
        
        return (
            <AuthContext.Provider value={authData}>
                {authData.user ? (
                    <AppContext.Provider value={useAppData()}>
                        <MainApp />
                    </AppContext.Provider>
                ) : (
                    <LoginScreen />
                )}
            </AuthContext.Provider>
        );
    }

    return <AppContainer />;
}


export default function App() {
    if (!isFirebaseConfigured) {
        return <FirebaseConfigNeeded />;
    }
    return <RentalApp />;
}
