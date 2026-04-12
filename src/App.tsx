/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  auth, 
  db 
} from './firebase';
import { 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider, 
  onAuthStateChanged, 
  onIdTokenChanged,
  signOut,
  User
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  Timestamp,
  getDocs,
  where,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  LayoutDashboard, 
  ClipboardList, 
  Truck, 
  Bike, 
  LogOut, 
  LogIn, 
  FileDown, 
  FileSpreadsheet,
  Plus, 
  PlusCircle,
  History,
  AlertCircle,
  CheckCircle2,
  Check,
  Loader2,
  ShieldAlert,
  ChevronRight,
  Search,
  X,
  UserPlus,
  UserMinus,
  RefreshCw,
  Siren,
  ShieldCheck,
  User as UserIcon,
  UserRound,
  Car,
  BarChart3,
  Calendar,
  Filter,
  MapPin,
  Users,
  Info,
  Settings as SettingsIcon,
  Trash2,
  Save,
  FileText,
  Pencil,
  ExternalLink,
  Wrench
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  MO_LIST, 
  PERSONNEL_LIST, 
  PATRIMONIO_LIST, 
  CITY_LIST, 
  PREFIXO_VT_LIST, 
  PATRIMONIO_VT_LIST, 
  FUNCAO_LINHA_LIST, 
  HORARIO_LINHA_LIST, 
  TIPO_SERVICO_LIST, 
  TIPO_SERVICO_VT_LIST,
  OPERATIONAL_PREFIXES,
  CADCHECKING_SERVICE_TYPES
} from './constants';

// --- Constants ---
const LOGO_14BPM_URL = "https://i.pinimg.com/originals/28/33/bd/2833bdc504f4fc4f3cb3c2817a664fc9.png";
const FALLBACK_LOGO = "https://cdn-icons-png.flaticon.com/512/1022/1022330.png";

const removeWhiteBackground = (base64: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Threshold for "white" - anything very bright becomes transparent
      const threshold = 245; 
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // If all channels are above threshold, make it transparent
        if (r > threshold && g > threshold && b > threshold) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
};

const loadImage = async (url: string): Promise<string | null> => {
  const fetchAsBase64 = async (targetUrl: string): Promise<string | null> => {
    try {
      const response = await fetch(targetUrl);
      if (!response.ok) return null;
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  };

  let base64: string | null = null;

  // For the main logo, we likely need a proxy due to Mixed Content (HTTP on HTTPS site) and CORS
  if (url === LOGO_14BPM_URL) {
    // Try wsrv.nl as primary for images
    base64 = await fetchAsBase64(`https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`);
    
    if (!base64) {
      // Try CorsProxy.io as secondary
      base64 = await fetchAsBase64(`https://corsproxy.io/?${encodeURIComponent(url)}`);
    }
    
    if (!base64) {
      // Try AllOrigins as tertiary
      base64 = await fetchAsBase64(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
    }
  }

  // Try direct fetch if not already fetched
  if (!base64) {
    base64 = await fetchAsBase64(url);
  }

  // Try fallback
  if (!base64 && url !== FALLBACK_LOGO) {
    base64 = await fetchAsBase64(FALLBACK_LOGO);
  }

  // If it's the 14th BPM logo, remove the white background
  if (base64 && url === LOGO_14BPM_URL) {
    return await removeWhiteBackground(base64);
  }

  return base64;
};

const getProxiedLogoUrl = () => {
  return `https://wsrv.nl/?url=${encodeURIComponent(LOGO_14BPM_URL)}`;
};

const handleLogoError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
  const target = e.target as HTMLImageElement;
  const currentSrc = target.src;
  
  if (currentSrc.includes('wsrv.nl')) {
    target.src = `https://corsproxy.io/?${encodeURIComponent(LOGO_14BPM_URL)}`;
  } else if (currentSrc.includes('corsproxy.io')) {
    target.src = `https://api.allorigins.win/raw?url=${encodeURIComponent(LOGO_14BPM_URL)}`;
  } else {
    target.src = FALLBACK_LOGO;
  }
};

// --- Types ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  timestamp: string;
  context?: string;
  route?: string;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

// --- CadChecking Types ---
interface Vehicle {
  id: string;
  plate: string;
  model: string;
  prefix: string;
  status: 'available' | 'in_use' | 'maintenance';
  lastMileage: number;
  currentDriver?: string;
  currentDriverEmail?: string;
}

interface RecordEntry {
  id: string;
  vehicleId: string;
  type: 'check-out' | 'check-in' | 'maintenance-in' | 'maintenance-out';
  timestamp: any;
  userEmail: string;
  userName?: string;
  identification: {
    prefix: string;
    operationalPrefix: string;
    plate: string;
    model: string;
    date: string;
    time: string;
  };
  drivers: {
    driverName: string;
    serviceType: string;
  };
  mileage: {
    currentMileage: number | '';
    notes: string;
  };
}

// --- Error Handling ---
function handleFirestoreError(
  error: unknown, 
  operationType: OperationType, 
  path: string | null,
  context?: string
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    timestamp: new Date().toISOString(),
    operationType,
    path,
    context,
    route: window.location.pathname + window.location.hash,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    }
  };

  // Structured logging for better debugging
  console.group('%c🔥 Firestore Error', 'color: white; background: #d32f2f; font-weight: bold; padding: 2px 4px; border-radius: 2px;');
  console.error('Message:', errInfo.error);
  console.log('Operation:', errInfo.operationType);
  console.log('Path:', errInfo.path);
  console.log('Context:', errInfo.context || 'N/A');
  console.log('Route:', errInfo.route);
  console.log('Timestamp:', errInfo.timestamp);
  console.log('Auth Info:', errInfo.authInfo);
  console.groupEnd();

  // Here you could integrate with a service like Sentry or LogRocket
  // if (process.env.NODE_ENV === 'production') {
  //   Sentry.captureException(error, { extra: errInfo });
  // }

  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      try {
        const errorData = JSON.parse(event.error.message);
        if (errorData.error) {
          setHasError(true);
          setErrorMessage(`Erro no Firestore (${errorData.operationType}): ${errorData.error}`);
        }
      } catch (e) {
        // Not a Firestore JSON error
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full border border-red-100">
          <div className="flex items-center gap-3 text-red-600 mb-4">
            <AlertCircle size={32} />
            <h2 className="text-xl font-bold">Ops! Algo deu errado.</h2>
          </div>
          <p className="text-gray-600 mb-6">{errorMessage || "Ocorreu um erro inesperado."}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
          >
            Recarregar Aplicativo
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// --- Components ---
const LoadingOverlay = ({ isVisible }: { isVisible: boolean }) => (
  <AnimatePresence>
    {isVisible && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          className="bg-white p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-6 max-w-xs w-full mx-4 border border-white/20"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-20"></div>
            <div className="relative bg-blue-50 p-6 rounded-full">
              <Loader2 className="animate-spin text-blue-600" size={48} />
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Processando</h3>
            <p className="text-slate-500 text-sm font-medium leading-relaxed">
              Aguarde um momento enquanto salvamos as informações no sistema.
            </p>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              className="w-full h-full bg-blue-600 rounded-full"
            />
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  
  // Get today's date in Brasília timezone (UTC-3)
  const todayStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date()).split('/').reverse().join('-');

  const [activeTab, setActiveTab] = useState<'dashboard' | 'form' | 'history' | 'reports' | 'settings' | 'cadchecking'>('dashboard');
  const [formType, setFormType] = useState<'linha' | 'viatura' | 'mo' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  
  // --- CadChecking State ---
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [cadcheckingHistory, setCadcheckingHistory] = useState<RecordEntry[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [operationType, setOperationType] = useState<'check-out' | 'check-in' | null>(null);
  const [cadcheckingView, setCadcheckingView] = useState<'list' | 'history' | 'admin'>('list');
  const [cadcheckingSearchTerm, setCadcheckingSearchTerm] = useState('');
  const [cadcheckingStatusFilter, setCadcheckingStatusFilter] = useState<'all' | 'available' | 'in_use' | 'maintenance'>('all');
  const [cadcheckingHistoryFilter, setCadcheckingHistoryFilter] = useState<'all' | 'check-out' | 'check-in' | 'maintenance'>('all');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleForm, setVehicleForm] = useState({
    prefix: '',
    plate: '',
    model: '',
    status: 'available' as 'available' | 'in_use' | 'maintenance',
    lastMileage: 0
  });
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'vehicle' | 'admin', label?: string } | null>(null);
  const [maintenanceModal, setMaintenanceModal] = useState<{ vehicle: Vehicle, notes: string } | null>(null);
  const [currentCadcheckingTab, setCurrentCadcheckingTab] = useState<number>(0);
  const [cadcheckingFormData, setCadcheckingFormData] = useState({
    identification: {
      prefix: '',
      operationalPrefix: '',
      plate: '',
      model: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      time: format(new Date(), 'HH:mm')
    },
    drivers: {
      driverName: '',
      serviceType: ''
    },
    mileage: {
      currentMileage: '' as number | '',
      notes: ''
    }
  });
  const isBootstrapping = useRef(false);
  
  // --- CadChecking Effects ---

  // Vehicles listener
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      const vehicleList: Vehicle[] = [];
      snapshot.forEach((doc) => {
        vehicleList.push({ id: doc.id, ...doc.data() } as Vehicle);
      });
      console.log(`[CadChecking] Vehicles updated: ${vehicleList.length} items`);
      setVehicles(vehicleList);
    }, (err) => {
      console.error("Error fetching vehicles:", err);
    });
    return () => unsubscribe();
  }, [user]);

  // Bootstrap vehicles if empty and user is admin
  useEffect(() => {
    if (isAdmin && vehicles.length === 0 && !loading) {
      console.log("[CadChecking] Fleet empty, triggering bootstrap...");
      bootstrapVehicles();
    }
  }, [isAdmin, vehicles.length, loading]);

  // CadChecking History listener
  useEffect(() => {
    if (!user || activeTab !== 'cadchecking' || cadcheckingView !== 'history') return;
    const q = query(
      collection(db, 'checklists'), 
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recordList: RecordEntry[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as RecordEntry;
        // Individualize history: only show own records unless admin
        if (isAdmin || data.userEmail === user.email) {
          recordList.push({ id: doc.id, ...data } as RecordEntry);
        }
      });
      setCadcheckingHistory(recordList);
    }, (error) => {
      console.error("Error fetching cadchecking history:", error);
    });
    return () => unsubscribe();
  }, [user, activeTab, cadcheckingView, isAdmin]);

  // Admin users listener (for CadChecking admin view)
  useEffect(() => {
    if (!isAdmin || activeTab !== 'cadchecking' || cadcheckingView !== 'admin') return;
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const userList: any[] = [];
      snapshot.forEach((doc) => {
        userList.push({ id: doc.id, ...doc.data() });
      });
      setAdminUsers(userList);
    });
    return () => unsubscribe();
  }, [isAdmin, activeTab, cadcheckingView]);

  const [notifications, setNotifications] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);

  const addNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  // --- CadChecking Handlers ---

  const handleSaveVehicle = async () => {
    if (!isAdmin) return;
    try {
      if (editingVehicle) {
        await updateDoc(doc(db, 'vehicles', editingVehicle.id), vehicleForm);
        addNotification("Viatura atualizada com sucesso!", "success");
      } else {
        await addDoc(collection(db, 'vehicles'), vehicleForm);
        addNotification("Viatura cadastrada com sucesso!", "success");
      }
      setIsVehicleModalOpen(false);
      setEditingVehicle(null);
      setVehicleForm({ prefix: '', plate: '', model: '', status: 'available', lastMileage: 0 });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'vehicles');
      addNotification("Erro ao salvar viatura.", "error");
    }
  };

  const handleDeleteVehicle = (id: string, plate: string) => {
    if (!isAdmin) return;
    setDeleteConfirm({ id, type: 'vehicle', label: plate });
  };

  const confirmCadcheckingDelete = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === 'vehicle') {
        await deleteDoc(doc(db, 'vehicles', deleteConfirm.id));
        addNotification("Viatura excluída com sucesso!", "success");
      } else {
        await updateDoc(doc(db, 'users', deleteConfirm.id), { role: 'user' });
        addNotification("Permissão de administrador removida.", "success");
      }
      setDeleteConfirm(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, deleteConfirm.type === 'vehicle' ? 'vehicles' : 'users');
      addNotification("Erro ao realizar a exclusão.", "error");
    }
  };

  const handleAddAdmin = async () => {
    if (!isAdmin || !newUserEmail) return;
    try {
      const q = query(collection(db, 'users'), where('email', '==', newUserEmail.toLowerCase().trim()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const userDoc = snap.docs[0];
        await updateDoc(doc(db, 'users', userDoc.id), { role: 'admin' });
        setIsUserModalOpen(false);
        setNewUserEmail('');
        addNotification("Administrador adicionado com sucesso!", "success");
      } else {
        addNotification("Usuário não encontrado. Ele precisa ter feito login pelo menos uma vez.", "error");
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users');
      addNotification("Erro ao adicionar administrador.", "error");
    }
  };

  const handleRemoveAdmin = (userId: string, email: string) => {
    if (!isAdmin) return;
    if (email === 'demetriomarques@gmail.com') {
      addNotification("Não é possível remover o administrador principal.", "error");
      return;
    }
    setDeleteConfirm({ id: userId, type: 'admin', label: email });
  };

  const bootstrapVehicles = async (force = false) => {
    // If not forced, only bootstrap if empty and not already bootstrapping
    if (!force && (isBootstrapping.current || vehicles.length > 5)) {
      console.log("[CadChecking] Bootstrap skipped:", { isBootstrapping: isBootstrapping.current, count: vehicles.length });
      return;
    }
    
    isBootstrapping.current = true;
    if (force) setIsSyncing(true);
    console.log("[CadChecking] Starting bootstrap of 47 vehicles...");
    
    const initialVehicles = [
      { plate: 'SNZ8F51', model: 'CHEVROLET/S-10', prefix: '640150', status: 'available', lastMileage: 0 },
      { plate: 'SNZ4C21', model: 'CHEVROLET/S-10', prefix: '640151', status: 'available', lastMileage: 0 },
      { plate: 'SNZ4C61', model: 'CHEVROLET/S-10', prefix: '640152', status: 'available', lastMileage: 0 },
      { plate: 'SOG4H29', model: 'CHEVROLET/S-10', prefix: '640153', status: 'available', lastMileage: 0 },
      { plate: 'SOG4I59', model: 'CHEVROLET/S-10', prefix: '640154', status: 'available', lastMileage: 0 },
      { plate: 'SOG4G99', model: 'CHEVROLET/S-10', prefix: '640155', status: 'available', lastMileage: 0 },
      { plate: 'SOH6A98', model: 'CHEVROLET/S-10', prefix: '640156', status: 'available', lastMileage: 0 },
      { plate: 'UHL2H45', model: 'HILLUX', prefix: '640161', status: 'available', lastMileage: 0 },
      { plate: 'RZZ8G50', model: 'RENALT/DUSTER', prefix: '640135', status: 'available', lastMileage: 0 },
      { plate: 'RZZ6G90', model: 'RENALT/DUSTER', prefix: '640136', status: 'available', lastMileage: 0 },
      { plate: 'RZZ0F43', model: 'RENALT/DUSTER', prefix: '640137', status: 'available', lastMileage: 0 },
      { plate: 'RZZ0F83', model: 'RENALT/DUSTER', prefix: '640138', status: 'available', lastMileage: 0 },
      { plate: 'RZZ0G33', model: 'RENALT/DUSTER', prefix: '640139', status: 'available', lastMileage: 0 },
      { plate: 'RZZ6E00', model: 'RENALT/DUSTER', prefix: '640140', status: 'available', lastMileage: 0 },
      { plate: 'RZZ8H00', model: 'RENALT/DUSTER', prefix: '640141', status: 'available', lastMileage: 0 },
      { plate: 'RZY4G58', model: 'RENALT/DUSTER', prefix: '640142', status: 'available', lastMileage: 0 },
      { plate: 'RZZ2E03', model: 'RENALT/DUSTER', prefix: '640143', status: 'available', lastMileage: 0 },
      { plate: 'RZY1G98', model: 'RENALT/DUSTER', prefix: '640157', status: 'available', lastMileage: 0 },
      { plate: 'SNN5E90', model: 'RENALT/DUSTER', prefix: '1210097', status: 'available', lastMileage: 0 },
      { plate: 'PBG5G37', model: 'FORD/RANGER', prefix: '64110', status: 'available', lastMileage: 0 },
      { plate: 'QYV7F75', model: 'MMC/L200', prefix: '64107', status: 'available', lastMileage: 0 },
      { plate: 'SNO0C99', model: 'VOLKSWAGENPOLO', prefix: '640144', status: 'available', lastMileage: 0 },
      { plate: 'SOB5F10', model: 'FIAT/ARGO', prefix: '1210105', status: 'available', lastMileage: 0 },
      { plate: 'SOA9C08', model: 'FIAT/ARGO', prefix: '1210153', status: 'available', lastMileage: 0 },
      { plate: 'PFA5246', model: 'VOLKSWAGEN/VOLARE', prefix: '6489', status: 'available', lastMileage: 0 },
      { plate: 'PCK8556', model: 'FIAT/DOBLO', prefix: '6491', status: 'available', lastMileage: 0 },
      { plate: 'PDS6365', model: 'HONDA/XRE300', prefix: '6492', status: 'available', lastMileage: 0 },
      { plate: 'PDS6435', model: 'HONDA/XRE300', prefix: '6493', status: 'available', lastMileage: 0 },
      { plate: 'PDS6455', model: 'HONDA/XRE300', prefix: '6494', status: 'available', lastMileage: 0 },
      { plate: 'PDS6475', model: 'HONDA/XRE300', prefix: '6495', status: 'available', lastMileage: 0 },
      { plate: 'PDS6485', model: 'HONDA/XRE300', prefix: '6496', status: 'available', lastMileage: 0 },
      { plate: 'PDS6845', model: 'HONDA/XRE300', prefix: '6497', status: 'available', lastMileage: 0 },
      { plate: 'PEC8506', model: 'HONDA/XRE300', prefix: '6498', status: 'available', lastMileage: 0 },
      { plate: 'PEC8526', model: 'HONDA/XRE300', prefix: '6499', status: 'available', lastMileage: 0 },
      { plate: 'PEC8576', model: 'HONDA/XRE300', prefix: '64100', status: 'available', lastMileage: 0 },
      { plate: 'PEC9726', model: 'HONDA/XRE300', prefix: '64103', status: 'available', lastMileage: 0 },
      { plate: 'PEC9736', model: 'HONDA/XRE300', prefix: '64104', status: 'available', lastMileage: 0 },
      { plate: 'PDS1785', model: 'HONDA/XRE300', prefix: '64105', status: 'available', lastMileage: 0 },
      { plate: 'PDS1795', model: 'HONDA/XRE300', prefix: '64106', status: 'available', lastMileage: 0 },
      { plate: 'SNR1I38', model: 'HONDA/XRE300', prefix: '640145', status: 'available', lastMileage: 0 },
      { plate: 'SNR8D25', model: 'HONDA/XRE300', prefix: '640146', status: 'available', lastMileage: 0 },
      { plate: 'SNR8A05', model: 'HONDA/XRE300', prefix: '640147', status: 'available', lastMileage: 0 },
      { plate: 'SNT5I45', model: 'HONDA/XRE300', prefix: '640148', status: 'available', lastMileage: 0 },
      { plate: 'SNT5I46', model: 'HONDA/XRE300', prefix: '640149', status: 'available', lastMileage: 0 },
      { plate: 'SOJ6C78', model: 'HONDA/XRE300', prefix: '640158', status: 'available', lastMileage: 0 },
      { plate: 'SOJ6D28', model: 'HONDA/XRE300', prefix: '640159', status: 'available', lastMileage: 0 },
      { plate: 'SOJ6D78', model: 'HONDA/XRE300', prefix: '640160', status: 'available', lastMileage: 0 },
    ];
    try {
      for (const v of initialVehicles) {
        const docRef = doc(db, 'vehicles', v.plate);
        await setDoc(docRef, v);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'vehicles');
    } finally {
      isBootstrapping.current = false;
      if (force) {
        setIsSyncing(false);
        addNotification("Frota sincronizada com sucesso!", "success");
      }
    }
  };

  const handleToggleMaintenance = async (vehicle: Vehicle, notes: string = '') => {
    const isEnteringMaintenance = vehicle.status !== 'maintenance';
    
    if (isEnteringMaintenance && notes === '' && !maintenanceModal) {
      setMaintenanceModal({ vehicle, notes: '' });
      return;
    }

    const newStatus = isEnteringMaintenance ? 'maintenance' : 'available';
    try {
      await updateDoc(doc(db, 'vehicles', vehicle.id), {
        status: newStatus
      });
      // Record this action in the history
      if (user) {
        await addDoc(collection(db, 'checklists'), {
          vehicleId: vehicle.id,
          type: newStatus === 'maintenance' ? 'maintenance-in' : 'maintenance-out',
          timestamp: serverTimestamp(),
          userEmail: user.email,
          userName: user.displayName || user.email?.split('@')[0],
          identification: {
            plate: vehicle.plate,
            prefix: vehicle.prefix || 'RESERVA',
            model: vehicle.model,
            operationalPrefix: 'MANUTENÇÃO',
            date: format(new Date(), 'yyyy-MM-dd'),
            time: format(new Date(), 'HH:mm')
          },
          drivers: {
            driverName: 'SISTEMA / MANUTENÇÃO',
            serviceType: 'MANUTENÇÃO'
          },
          mileage: {
            currentMileage: vehicle.lastMileage,
            notes: notes || (newStatus === 'maintenance' ? 'Viatura baixada para manutenção.' : 'Viatura retornou da manutenção.')
          }
        });
      }
      addNotification(`Viatura ${newStatus === 'maintenance' ? 'em manutenção' : 'disponível'}`, "info");
      setMaintenanceModal(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'vehicles');
      addNotification("Erro ao atualizar status da viatura.", "error");
    }
  };

  const handleStartCadcheckingRecord = async (vehicle: Vehicle | null, type: 'check-out' | 'check-in' | null) => {
    if (!vehicle || !type) {
      setSelectedVehicle(null);
      setOperationType(null);
      return;
    }
    
    let lastCheckIn: RecordEntry | null = null;
    
    if (type === 'check-out') {
      try {
        const constraints = [
          where('vehicleId', '==', vehicle.id),
          where('type', '==', 'check-in'),
          orderBy('timestamp', 'desc'),
          limit(1)
        ];

        // Se não for admin, só pode ver o SEU próprio check-in
        if (!isAdmin) {
          constraints.splice(2, 0, where('userEmail', '==', user?.email));
        }

        const q = query(collection(db, 'checklists'), ...constraints);
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          lastCheckIn = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as RecordEntry;
        } else if (!isAdmin) {
          // Se não encontrou check-in e não é admin, bloqueia
          addNotification("Apenas o usuário que realizou o check-in pode fazer o check-out desta viatura.", "error");
          return;
        }
      } catch (err) {
        console.error("Error fetching last check-in:", err);
      }
    }
    setSelectedVehicle(vehicle);
    setOperationType(type);
    setCurrentCadcheckingTab(type === 'check-out' ? 2 : 0);
    setCadcheckingFormData({
      identification: {
        prefix: vehicle.prefix || 'RESERVA',
        operationalPrefix: lastCheckIn?.identification.operationalPrefix || '',
        plate: vehicle.plate,
        model: vehicle.model,
        date: format(new Date(), 'yyyy-MM-dd'),
        time: format(new Date(), 'HH:mm')
      },
      drivers: {
        driverName: lastCheckIn?.drivers.driverName || '',
        serviceType: lastCheckIn?.drivers.serviceType || ''
      },
      mileage: {
        currentMileage: '',
        notes: ''
      }
    });
  };

  const formatWhatsAppMessage = (record: RecordEntry) => {
    const driverFormatted = record.drivers?.driverName?.replace(/ (\d)/, ' / $1') || '---';
    const dateFormatted = record.identification?.date?.split('-').reverse().join('/') || '---';
    
    const messageBody = record.type === 'check-in' 
      ? ` *CHECK-IN VIATURA (SAÍDA)*\n` +
        ` *Pat:* ${record.identification?.prefix || '---'}\n` +
        ` *Placa:* ${record.identification?.plate || '---'}\n` +
        ` *Prefixo:* ${record.identification?.operationalPrefix || '---'}\n` +
        ` *Emprego:* ${record.drivers?.serviceType || '---'}\n` +
        ` *Vtr:* ${record.identification?.model || '---'}\n` +
        ` *Km inic:* ${record.mileage?.currentMileage || '---'}\n` +
        ` *Data:* ${dateFormatted}\n` +
        ` *Hora que armou:* ${record.identification?.time || '---'}\n` +
        ` *Condutor/Mat:* ${driverFormatted}`
      : ` *CHECK-OUT VIATURA (RETORNO)*\n` +
        ` *Pat:* ${record.identification?.prefix || '---'}\n` +
        ` *Placa:* ${record.identification?.plate || '---'}\n` +
        ` *Prefixo:* ${record.identification?.operationalPrefix || '---'}\n` +
        ` *Emprego:* ${record.drivers?.serviceType || '---'}\n` +
        ` *Vtr:* ${record.identification?.model || '---'}\n` +
        ` *Km final:* ${record.mileage?.currentMileage || '---'}\n` +
        ` *Data:* ${dateFormatted}\n` +
        ` *Hora que desarmou:* ${record.identification?.time || '---'}\n` +
        ` *Condutor/Mat:* ${driverFormatted}`;
    
    return record.mileage.notes 
      ? `${messageBody}\n\n *Obs:* ${record.mileage.notes}`
      : messageBody;
  };

  const handleResendWhatsApp = (record: RecordEntry) => {
    const message = formatWhatsAppMessage(record);
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleSaveCadcheckingRecord = async (skipWhatsApp = false) => {
    if (!selectedVehicle || !operationType || !user) return;
    
    const currentMileage = Number(cadcheckingFormData.mileage.currentMileage);
    const lastMileage = Number(selectedVehicle.lastMileage || 0);

    if (isNaN(currentMileage) || currentMileage < lastMileage) {
      addNotification(`A quilometragem informada (${currentMileage}) não pode ser menor que a quilometragem atual do veículo (${lastMileage}).`, "error");
      return;
    }

    setSubmitting(true);
    try {
      // Add record to database
      await addDoc(collection(db, 'checklists'), {
        vehicleId: selectedVehicle.id,
        type: operationType,
        timestamp: serverTimestamp(),
        userEmail: user.email,
        userName: user.displayName || user.email?.split('@')[0],
        identification: cadcheckingFormData.identification,
        drivers: cadcheckingFormData.drivers,
        mileage: cadcheckingFormData.mileage
      });
      // Update vehicle status
      await updateDoc(doc(db, 'vehicles', selectedVehicle.id), {
        status: operationType === 'check-in' ? 'in_use' : 'available',
        lastMileage: cadcheckingFormData.mileage.currentMileage,
        currentDriver: operationType === 'check-in' ? cadcheckingFormData.drivers.driverName : null,
        currentDriverEmail: operationType === 'check-in' ? user.email : null
      });
      
      addNotification("Registro salvo com sucesso!", "success");

      if (!skipWhatsApp) {
        // Format WhatsApp Message
        const recordToFormat: RecordEntry = {
          ...cadcheckingFormData,
          id: '', // Not needed for formatting
          vehicleId: selectedVehicle.id,
          type: operationType!,
          userEmail: user.email || '',
          userName: user.displayName || '',
          timestamp: new Date()
        };
        const finalMessage = formatWhatsAppMessage(recordToFormat);
        const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(finalMessage)}`;
        window.open(whatsappUrl, '_blank');
      }
      // Reset form
      setSelectedVehicle(null);
      setOperationType(null);
      setCurrentCadcheckingTab(0);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, 'checklists');
      addNotification("Erro ao salvar registro.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Auth Listener ---

  // Lists state
  const [personnelList, setPersonnelList] = useState<string[]>(PERSONNEL_LIST);
  const [prefixoVtList, setPrefixoVtList] = useState<string[]>(PREFIXO_VT_LIST);
  const [patrimonioVtList, setPatrimonioVtList] = useState<string[]>(PATRIMONIO_VT_LIST);
  const [moList, setMoList] = useState<string[]>(MO_LIST);
  const [patrimonioMoList, setPatrimonioMoList] = useState<string[]>(PATRIMONIO_LIST);
  const [cityList, setCityList] = useState<string[]>(CITY_LIST);
  const [funcaoLinhaList, setFuncaoLinhaList] = useState<string[]>(FUNCAO_LINHA_LIST);
  const [horarioLinhaList, setHorarioLinhaList] = useState<string[]>(HORARIO_LINHA_LIST);
  const [tipoServicoList, setTipoServicoList] = useState<string[]>(TIPO_SERVICO_LIST);
  const [tipoServicoVtList, setTipoServicoVtList] = useState<string[]>(TIPO_SERVICO_VT_LIST);
  const [adminList, setAdminList] = useState<string[]>(["demetriomarques@gmail.com"]);
  const [authorizedList, setAuthorizedList] = useState<string[]>([]);
  
  // Conditional form states
  const [hasR3, setHasR3] = useState(false);
  const [hasR4, setHasR4] = useState(false);
  const [hasPatrulheiro01, setHasPatrulheiro01] = useState(false);
  const [hasPatrulheiro02, setHasPatrulheiro02] = useState(false);
  const [hasPatrulheiro03, setHasPatrulheiro03] = useState(false);
  const [hasPatrulheiro04, setHasPatrulheiro04] = useState(false);
  const [hasPatrulheiro05, setHasPatrulheiro05] = useState(false);
  const [isPermuta, setIsPermuta] = useState(false);
  const [isCondutorCmt, setIsCondutorCmt] = useState(false);

  const [authError, setAuthError] = useState<string | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  const closePdfPreview = () => {
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
    }
    setPdfPreviewUrl(null);
    setShowPdfPreview(false);
  };

  // Auth Listener
  useEffect(() => {
    console.log("Initializing Auth Listeners...");
    
    // Ensure persistence is set
    const initAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        console.log("Auth persistence set to local");
        
        // Handle redirect result
        const result = await getRedirectResult(auth);
        if (result) {
          console.log("Redirect login successful:", result.user.email);
          setUser(result.user);
        }
      } catch (error: any) {
        console.error("Auth init/redirect error:", error);
        if (error.code !== 'auth/web-storage-unsupported') {
          setAuthError("Erro na inicialização: " + error.message);
        }
      }
    };
    initAuth();

    const handleAuthState = (currentUser: User | null) => {
      if (currentUser) {
        const providerId = currentUser.providerData[0]?.providerId;
        console.log(`Auth State Changed: ${currentUser.email} (Provider: ${providerId})`);
        
        // Ensure it's a Google account (optional but good for clarity)
        if (providerId !== 'google.com' && !currentUser.isAnonymous) {
          console.warn("Non-Google account detected");
        }
      } else {
        console.log("Auth State Changed: No User");
      }
      
      setUser(currentUser);
      setLoading(false);
    };

    const unsubAuth = onAuthStateChanged(auth, handleAuthState);
    const unsubToken = onIdTokenChanged(auth, handleAuthState);
    
    return () => {
      unsubAuth();
      unsubToken();
    };
  }, []);

  // Admin & Authorization Check Listener
  useEffect(() => {
    if (user && user.email) {
      const email = user.email.toLowerCase().trim();
      const isVerified = user.emailVerified;
      const isHardcodedAdmin = email === "demetriomarques@gmail.com" && isVerified;
      const isListedAdmin = isVerified && Array.isArray(adminList) && adminList.some(adminEmail => 
        typeof adminEmail === 'string' && adminEmail.toLowerCase().trim() === email
      );
      
      const finalIsAdmin = isHardcodedAdmin || isListedAdmin;
      setIsAdmin(finalIsAdmin);

      const finalIsAuthorized = isVerified;
      setIsAuthorized(finalIsAuthorized);

      console.log(`Access check for ${email}: Admin=${finalIsAdmin}, Authorized=${finalIsAuthorized}, Verified=${isVerified}`);
    } else {
      setIsAdmin(false);
      setIsAuthorized(false);
    }
  }, [user, adminList, authorizedList]);

  useEffect(() => {
    if (user) {
      console.log("User state updated:", user.email, "isAdmin:", isAdmin);
    } else {
      console.log("User state updated: null");
    }
  }, [user, isAdmin]);

  // Settings Listener
  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(doc(db, 'settings', 'lists'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        console.log("Settings loaded from Firestore:", data);
        
        if (data.personnelList && Array.isArray(data.personnelList) && data.personnelList.length > 0) {
          setPersonnelList(data.personnelList);
        } else {
          console.warn("Personnel list from Firestore is empty or invalid, using default.");
          setPersonnelList(PERSONNEL_LIST);
        }

        if (data.prefixoVtList && Array.isArray(data.prefixoVtList) && data.prefixoVtList.length > 0) {
          setPrefixoVtList(data.prefixoVtList);
        } else {
          setPrefixoVtList(PREFIXO_VT_LIST);
        }

        if (data.patrimonioVtList && Array.isArray(data.patrimonioVtList) && data.patrimonioVtList.length > 0) {
          setPatrimonioVtList(data.patrimonioVtList);
        } else {
          setPatrimonioVtList(PATRIMONIO_VT_LIST);
        }

        if (data.moList && Array.isArray(data.moList) && data.moList.length > 0) {
          setMoList(data.moList);
        } else {
          setMoList(MO_LIST);
        }

        if (data.patrimonioMoList && Array.isArray(data.patrimonioMoList) && data.patrimonioMoList.length > 0) {
          setPatrimonioMoList(data.patrimonioMoList);
        } else {
          setPatrimonioMoList(PATRIMONIO_LIST);
        }
        
        if (data.cityList) setCityList(data.cityList);
        if (data.funcaoLinhaList) setFuncaoLinhaList(data.funcaoLinhaList);
        if (data.horarioLinhaList) setHorarioLinhaList(data.horarioLinhaList);
        if (data.tipoServicoList) setTipoServicoList(data.tipoServicoList);
        if (data.tipoServicoVtList) setTipoServicoVtList(data.tipoServicoVtList);
        if (data.adminList) setAdminList(data.adminList);
        if (data.authorizedList) setAuthorizedList(data.authorizedList);
      } else if (isAdmin) {
        // Initialize settings if they don't exist (only if admin)
        const initialSettings = {
          personnelList: PERSONNEL_LIST,
          prefixoVtList: PREFIXO_VT_LIST,
          patrimonioVtList: PATRIMONIO_VT_LIST,
          moList: MO_LIST,
          patrimonioMoList: PATRIMONIO_LIST,
          cityList: CITY_LIST,
          funcaoLinhaList: FUNCAO_LINHA_LIST,
          horarioLinhaList: HORARIO_LINHA_LIST,
          tipoServicoList: TIPO_SERVICO_LIST,
          tipoServicoVtList: TIPO_SERVICO_VT_LIST,
          adminList: ["demetriomarques@gmail.com"],
          authorizedList: ["demetriomarques@gmail.com"]
        };
        setDoc(doc(db, 'settings', 'lists'), initialSettings).catch(err => 
          handleFirestoreError(err, OperationType.WRITE, 'settings/lists', 'Inicialização das configurações padrão')
        );
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/lists', 'Monitoramento de configurações');
    });

    return () => unsub();
  }, [user, isAdmin]);

  // History Listener
  useEffect(() => {
    if (!user) return;

    const collections = ['atividades_linha', 'efetivo_viaturas', 'efetivo_mos'];
    const unsubscribes: (() => void)[] = [];

    collections.forEach(collName => {
      const q = query(
        collection(db, collName), 
        where('data', '==', todayStr),
        orderBy('createdAt', 'desc')
      );
      const unsub = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          type: collName,
          ...doc.data()
        }));
        setHistoryData(prev => {
          const filtered = prev.filter(item => item.type !== collName);
          return [...filtered, ...data].sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
            return dateB - dateA;
          });
        });
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, collName, 'Monitoramento do histórico de atividades');
      });
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [user]);

  const handleLogin = async () => {
    setLoginLoading(true);
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    try {
      console.log("Starting login popup...");
      await setPersistence(auth, browserLocalPersistence);
      const result = await signInWithPopup(auth, provider);
      console.log("Login successful:", result.user.email);
      setUser(result.user);
    } catch (error: any) {
      console.error("Login error:", error);
      let msg = "Erro ao acessar o sistema: " + error.message;
      if (error.code === 'auth/popup-blocked') {
        msg = "O popup de login foi bloqueado. Por favor, permita popups ou use o login alternativo abaixo.";
      } else if (error.code === 'auth/cancelled-popup-request') {
        msg = "A solicitação de login foi cancelada.";
      } else if (error.code === 'auth/network-request-failed') {
        msg = "Falha na conexão com o Firebase. Isso pode ser causado por um bloqueador de anúncios (AdBlock), firewall ou conexão instável. Tente desativar extensões ou use o método alternativo abaixo.";
      }
      setAuthError(msg);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLoginRedirect = async () => {
    setLoginLoading(true);
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    try {
      console.log("Starting login redirect...");
      await setPersistence(auth, browserLocalPersistence);
      await signInWithRedirect(auth, provider);
    } catch (error: any) {
      console.error("Redirect error:", error);
      let msg = "Erro no redirecionamento: " + error.message;
      if (error.code === 'auth/network-request-failed') {
        msg = "Falha na conexão com o Firebase. Verifique sua conexão ou se há algum bloqueador de rede/extensão impedindo o acesso.";
      }
      setAuthError(msg);
      setLoginLoading(false);
    }
  };

  const handleClearSession = async () => {
    try {
      await signOut(auth);
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.location.reload();
    } catch (e) {
      window.location.reload();
    }
  };

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    try {
      await signOut(auth);
      setActiveTab('dashboard');
      setFormType(null);
      setShowLogoutModal(false);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleDelete = (item: any) => {
    if (!isAdmin) return;
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete || !isAdmin) return;
    setSubmitting(true);
    try {
      await deleteDoc(doc(db, itemToDelete.type, itemToDelete.id));
      setShowDeleteModal(false);
      setItemToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, itemToDelete.type, `Exclusão de registro: ${itemToDelete.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  const generatePDF = async (data: any) => {
    setSubmitting(true);
    try {
      const doc = new jsPDF();
      const APP_BLUE_DARK = [30, 58, 138];
      const APP_RED = [220, 38, 38];
      const APP_EMERALD = [5, 150, 105];
      const APP_ORANGE = [234, 88, 12];
      
      const sectionColor = data.type === 'atividades_linha' ? APP_BLUE_DARK :
                          data.type === 'efetivo_viaturas' ? APP_EMERALD :
                          APP_ORANGE;

      const logoPM = await loadImage(LOGO_14BPM_URL);
      
      // Header
      doc.setFillColor(APP_BLUE_DARK[0], APP_BLUE_DARK[1], APP_BLUE_DARK[2]);
      doc.rect(0, 0, 210, 40, 'F');
      doc.setFillColor(APP_RED[0], APP_RED[1], APP_RED[2]);
      doc.rect(0, 0, 210, 2, 'F');

      if (logoPM) {
        doc.addImage(logoPM, 'PNG', 11, 6, 28, 28);
      }

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('14º BPM', 45, 15);
      doc.setFontSize(9);
      doc.text('SERRA TALHADA', 45, 20);
      doc.setTextColor(APP_RED[0], APP_RED[1], APP_RED[2]);
      doc.text('SisCOpI', 45, 25);

      const title = data.type === 'atividades_linha' ? 'RELATÓRIO DE ATIVIDADE LINHA' :
                    data.type === 'efetivo_viaturas' ? 'RELATÓRIO DE EFETIVO DAS VIATURAS' :
                    'RELATÓRIO DE EFETIVO DAS MO\'S';

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.text(title, 45, 32);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const brasiliaTime = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(new Date());
      doc.text(`Gerado em: ${brasiliaTime}`, 45, 37);

      const tableData = Object.entries(data)
        .filter(([key]) => !['id', 'type', 'createdBy', 'createdAt', 'hasR3', 'hasR4', 'hasPatrulheiro01', 'hasPatrulheiro02', 'hasPatrulheiro03', 'hasPatrulheiro04', 'hasPatrulheiro05', 'horarioEntrada', 'horarioTermino'].includes(key))
        .map(([key, value]) => {
          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          return [label, String(value === true ? 'SIM' : value === false ? 'NÃO' : value || '---')];
        });

      if (typeof (doc as any).autoTable === 'function') {
        (doc as any).autoTable({
          startY: 50,
          head: [['Campo', 'Informação']],
          body: tableData,
          theme: 'striped',
          headStyles: { fillColor: sectionColor, textColor: [255, 255, 255], fontStyle: 'bold' },
          styles: { fontSize: 9, cellPadding: 3 },
          alternateRowStyles: { fillColor: [245, 247, 250] },
          margin: { left: 15, right: 15 }
        });
      }

      // Footer and Page Numbers
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, 105, 285, { align: 'center' });
        doc.text('14º BPM - POLÍCIA MILITAR DE PERNAMBUCO | Sistema de Gestão de Efetivo', 10, 285);
      }

      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setShowPdfPreview(true);
    } catch (error) {
      console.error("Error generating individual PDF:", error);
      addNotification("Erro ao gerar o PDF.", "error");
    } finally {
      setSubmitting(false);
    }
  };


  const generateConsolidatedPDF = async (startDate: string, endDate: string, types: string[]) => {
    if (!user) return;
    setSubmitting(true);

    try {
      const doc = new jsPDF();
      let yPos = 10;
      
      const APP_BLUE_DARK = [30, 58, 138];
      const APP_RED = [220, 38, 38];
      const APP_EMERALD = [5, 150, 105];
      const APP_ORANGE = [234, 88, 12];

      const logoPM = await loadImage(LOGO_14BPM_URL);

      const drawHeader = () => {
        doc.setFillColor(APP_BLUE_DARK[0], APP_BLUE_DARK[1], APP_BLUE_DARK[2]);
        doc.rect(0, 0, 210, 45, 'F');
        doc.setFillColor(APP_RED[0], APP_RED[1], APP_RED[2]);
        doc.rect(0, 0, 210, 2, 'F');

        if (logoPM) {
          doc.addImage(logoPM, 'PNG', 10, 7, 30, 30);
        }

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('POLÍCIA MILITAR DE PERNAMBUCO', 105, 15, { align: 'center' });
        doc.setFontSize(9);
        doc.text('DIRETORIA INTEGRADA DO INTERIOR - II', 105, 21, { align: 'center' });
        doc.text('14º BATALHÃO DE POLÍCIA MILITAR', 105, 26, { align: 'center' });
        doc.setTextColor(APP_RED[0], APP_RED[1], APP_RED[2]);
        doc.setFontSize(10);
        doc.text('SisCOpI', 105, 31, { align: 'center' });
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.text('MAPA DA FORÇA', 105, 39, { align: 'center' });
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const dateStr = startDate === endDate ? 
          new Date(startDate + 'T12:00:00').toLocaleDateString('pt-BR') :
          `${new Date(startDate + 'T12:00:00').toLocaleDateString('pt-BR')} até ${new Date(endDate + 'T12:00:00').toLocaleDateString('pt-BR')}`;
        doc.text(`Período: ${dateStr}`, 105, 44, { align: 'center' });

        yPos = 55;
      };

      const checkPageBreak = (needed: number) => {
        if (yPos + needed > 275) {
          doc.addPage();
          yPos = 10;
          drawHeader();
          return true;
        }
        return false;
      };

      drawHeader();

      let allData: any[] = [];
      try {
        for (const collName of types) {
          const q = query(collection(db, collName), where('data', '>=', startDate), where('data', '<=', endDate), orderBy('data', 'asc'));
          const snapshot = await getDocs(q);
          snapshot.forEach(d => allData.push({ id: d.id, type: collName, ...d.data() }));
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'multiple', 'Geração de PDF consolidado');
      }

      if (allData.length === 0) {
        addNotification("Nenhum registro encontrado.", "info");
        setSubmitting(false);
        return;
      }

      const linhaOrder = [
        'OFICIAL DE OPERAÇÕES',
        'ADJUNTO DE OPERAÇÕES',
        'RÁDIO OPERADOR',
        'AUXILIAR DE RÁDIO OPERADOR',
        'ARMEIRO'
      ];

      const linha = allData
        .filter(item => item.type === 'atividades_linha')
        .sort((a, b) => {
          const indexA = linhaOrder.indexOf(a.funcao?.toUpperCase());
          const indexB = linhaOrder.indexOf(b.funcao?.toUpperCase());
          
          if (indexA !== -1 && indexB !== -1) {
            if (indexA !== indexB) return indexA - indexB;
          } else if (indexA !== -1) {
            return -1;
          } else if (indexB !== -1) {
            return 1;
          }
          
          // Secondary sort by createdAt to maintain filling sequence
          const getTime = (ts: any) => {
            if (!ts) return 0;
            if (typeof ts.toMillis === 'function') return ts.toMillis();
            if (ts.seconds) return ts.seconds * 1000;
            return 0;
          };
          return getTime(a.createdAt) - getTime(b.createdAt);
        });

      const viaturas = allData.filter(item => item.type === 'efetivo_viaturas');
      const mos = allData.filter(item => item.type === 'efetivo_mos');

      if (linha.length > 0) {
        checkPageBreak(20);
        doc.setFillColor(APP_BLUE_DARK[0], APP_BLUE_DARK[1], APP_BLUE_DARK[2]);
        doc.roundedRect(10, yPos, 190, 8, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('ATIVIDADE LINHA', 105, yPos + 5.5, { align: 'center' });
        yPos += 12;

        linha.forEach(l => {
          checkPageBreak(45);
          doc.setFillColor(241, 245, 249);
          doc.roundedRect(10, yPos, 190, 35, 2, 2, 'F');
          doc.setFillColor(APP_BLUE_DARK[0], APP_BLUE_DARK[1], APP_BLUE_DARK[2]);
          doc.rect(10, yPos, 3, 35, 'F');

          doc.setTextColor(APP_BLUE_DARK[0], APP_BLUE_DARK[1], APP_BLUE_DARK[2]);
          doc.setFontSize(9);
          doc.text(l.funcao || '---', 18, yPos + 6);
          doc.setTextColor(30, 41, 59);
          doc.setFont('helvetica', 'normal');
          doc.text(l.graduacaoNomeMatricula || '---', 18, yPos + 12);
          doc.setFontSize(8);
          doc.text(`Tipo: ${l.tipoServico || '---'} | Cidade: ${l.cidade || '---'} | Horário: ${l.horario || '---'}`, 18, yPos + 18);
          doc.text(`Telefone: ${l.telefone || '---'}`, 18, yPos + 23);
          
          if (l.permutaSubstituicao) {
            doc.setTextColor(APP_RED[0], APP_RED[1], APP_RED[2]);
            doc.text(`PERMUTA: ${l.especificacaoEfetivo}`, 18, yPos + 28, { maxWidth: 170 });
          }
          
          doc.setTextColor(100);
          doc.text(`SEI: ${l.noSei || '---'} | Obs: ${l.observacao || '---'}`, 18, yPos + 33);
          yPos += 40;
        });
      }

      if (viaturas.length > 0) {
        checkPageBreak(20);
        doc.setFillColor(APP_EMERALD[0], APP_EMERALD[1], APP_EMERALD[2]);
        doc.roundedRect(10, yPos, 190, 8, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('EFETIVO VIATURAS', 105, yPos + 5.5, { align: 'center' });
        yPos += 12;

        viaturas.forEach(vt => {
          checkPageBreak(75);
          doc.setFillColor(240, 253, 244);
          doc.roundedRect(10, yPos, 190, 65, 2, 2, 'F');
          doc.setFillColor(APP_EMERALD[0], APP_EMERALD[1], APP_EMERALD[2]);
          doc.rect(10, yPos, 3, 65, 'F');

          doc.setTextColor(APP_EMERALD[0], APP_EMERALD[1], APP_EMERALD[2]);
          doc.setFontSize(10);
          doc.text(`PREFIXO: ${vt.prefixo || '---'}`, 18, yPos + 7);
          doc.setTextColor(30, 41, 59);
          doc.setFontSize(8);
          doc.text(`Patrimônio: ${vt.patrimonio || '---'} | Cidade: ${vt.cidade || '---'}`, 18, yPos + 13);

          const personnel = [
            { l: 'CMT', n: vt.comandante, t: vt.tipoServicoCmt },
            { l: 'MOT', n: vt.condutor, t: vt.tipoServicoCondutor },
            { l: 'P01', n: vt.patrulheiro01, t: vt.tipoServicoPatrulheiro01 },
            { l: 'P02', n: vt.patrulheiro02, t: vt.tipoServicoPatrulheiro02 },
            { l: 'P03', n: vt.patrulheiro03, t: vt.tipoServicoPatrulheiro03 },
            { l: 'P04', n: vt.patrulheiro04, t: vt.tipoServicoPatrulheiro04 },
            { l: 'P05', n: vt.patrulheiro05, t: vt.tipoServicoPatrulheiro05 }
          ].filter(p => p.n);

          let pY = yPos + 20;
          personnel.forEach(p => {
            doc.setFont('helvetica', 'bold');
            doc.text(`${p.l}:`, 18, pY);
            doc.setFont('helvetica', 'normal');
            doc.text(`${p.n} (${p.t})`, 30, pY);
            pY += 5;
          });

          doc.setFontSize(7);
          doc.setTextColor(100);
          doc.text(`Tel Cmt: ${vt.celularCmt} | Tel Func: ${vt.celularFuncional}`, 18, pY + 2);
          
          if (vt.observacoes) {
            doc.setTextColor(APP_BLUE_DARK[0], APP_BLUE_DARK[1], APP_BLUE_DARK[2]);
            doc.setFont('helvetica', 'bold');
            doc.text('Observações:', 18, pY + 6);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100);
            doc.text(vt.observacoes, 40, pY + 6, { maxWidth: 150 });
          }
          
          yPos += 75;
        });
      }

      if (mos.length > 0) {
        checkPageBreak(20);
        doc.setFillColor(APP_ORANGE[0], APP_ORANGE[1], APP_ORANGE[2]);
        doc.roundedRect(10, yPos, 190, 8, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('EFETIVO MOTOCICLETAS', 105, yPos + 5.5, { align: 'center' });
        yPos += 12;

        mos.forEach(mo => {
          checkPageBreak(60);
          doc.setFillColor(255, 247, 237);
          doc.roundedRect(10, yPos, 190, 50, 2, 2, 'F');
          doc.setFillColor(APP_ORANGE[0], APP_ORANGE[1], APP_ORANGE[2]);
          doc.rect(10, yPos, 3, 50, 'F');

          doc.setTextColor(APP_ORANGE[0], APP_ORANGE[1], APP_ORANGE[2]);
          doc.setFontSize(10);
          doc.text(`PREFIXO: ${mo.prefixo || '---'}`, 18, yPos + 7);
          doc.setTextColor(30, 41, 59);
          doc.setFontSize(8);
          doc.text(`Cidade: ${mo.cidade || '---'}`, 18, yPos + 13);

          const rows = [
            { l: 'R1', n: mo.cmtR1, t: mo.r1Type, p: mo.patrimonioR1 },
            { l: 'R2', n: mo.r2, t: mo.r2Type, p: mo.patrimonioR2 },
            { l: 'R3', n: mo.r3, t: mo.r3Type, p: mo.patrimonioR3 },
            { l: 'R4', n: mo.r4, t: mo.r4Type, p: mo.patrimonioR4 }
          ].filter(r => r.n);

          let rY = yPos + 20;
          rows.forEach(r => {
            doc.setFont('helvetica', 'bold');
            doc.text(`${r.l}:`, 18, rY);
            doc.setFont('helvetica', 'normal');
            doc.text(`${r.n} (${r.t}) - Pat: ${r.p}`, 30, rY);
            rY += 5;
          });

          doc.setFontSize(7);
          doc.setTextColor(100);
          if (mo.permuta) {
            doc.setTextColor(APP_RED[0], APP_RED[1], APP_RED[2]);
            doc.text(`PERMUTA: ${mo.especificacaoEfetivo}`, 18, rY + 2, { maxWidth: 170 });
          }
          doc.setTextColor(100);
          doc.text(`Obs: ${mo.observacoes || '---'}`, 18, rY + 6, { maxWidth: 170 });
          yPos += 55;
        });
      }

      // Add Footer and Page Numbers
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, 105, 285, { align: 'center' });
        doc.text('14º BPM - POLÍCIA MILITAR DE PERNAMBUCO | Sistema de Gestão de Efetivo', 10, 285);
      }

      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setShowPdfPreview(true);
    } catch (error) {
      console.error("Error generating consolidated report:", error);
      addNotification("Erro ao gerar o relatório.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const generateConsolidatedCSV = async (startDate: string, endDate: string, types: string[]) => {
    if (!user) return;
    setSubmitting(true);

    try {
      let allData: any[] = [];
      try {
        for (const collName of types) {
          const q = query(collection(db, collName), where('data', '>=', startDate), where('data', '<=', endDate), orderBy('data', 'asc'));
          const snapshot = await getDocs(q);
          snapshot.forEach(d => allData.push({ id: d.id, type: collName, ...d.data() }));
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'multiple', 'Geração de CSV consolidado');
      }

      if (allData.length === 0) {
        addNotification("Nenhum registro encontrado.", "info");
        setSubmitting(false);
        return;
      }

      // Define headers based on all unique keys in allData
      const allKeys = new Set<string>();
      allData.forEach(item => {
        Object.keys(item).forEach(key => {
          if (key !== 'id' && key !== 'createdAt' && key !== 'createdBy') {
            allKeys.add(key);
          }
        });
      });

      const headers = ['id', 'type', 'createdAt', 'createdBy', ...Array.from(allKeys)];
      
      const csvRows = [];
      csvRows.push(headers.join(','));

      allData.forEach(item => {
        const values = headers.map(header => {
          let val = item[header];
          
          // Handle special types
          if (val instanceof Timestamp) {
            val = val.toDate().toISOString();
          } else if (val === null || val === undefined) {
            val = '';
          } else if (typeof val === 'string') {
            // Escape quotes and wrap in quotes if contains comma or newline
            val = val.replace(/"/g, '""');
            if (val.includes(',') || val.includes('\n') || val.includes('"')) {
              val = `"${val}"`;
            }
          }
          
          return val;
        });
        csvRows.push(values.join(','));
      });

      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `mapa_da_forca_${startDate}_ate_${endDate}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addNotification("Relatório CSV exportado com sucesso!", "success");
    } catch (error) {
      console.error("Error generating CSV report:", error);
      addNotification("Erro ao gerar o relatório CSV.", "error");
    } finally {
      setSubmitting(false);
    }
  };


  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormType(item.type === 'atividades_linha' ? 'linha' : item.type === 'efetivo_viaturas' ? 'viatura' : 'mo');
    setHasR3(!!item.hasR3);
    setHasR4(!!item.hasR4);
    setHasPatrulheiro01(!!item.hasPatrulheiro01);
    setHasPatrulheiro02(!!item.hasPatrulheiro02);
    setHasPatrulheiro03(!!item.hasPatrulheiro03);
    setHasPatrulheiro04(!!item.hasPatrulheiro04);
    setHasPatrulheiro05(!!item.hasPatrulheiro05);
    setIsPermuta(!!item.permuta);
    setIsCondutorCmt(!!item.isCondutorCmt);
    setActiveTab('form');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !formType) return;

    setSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const data: any = editingItem ? { ...editingItem } : {
      createdBy: user.uid,
      createdAt: Timestamp.now(),
    };

    formData.forEach((value, key) => {
      // Handle boolean strings
      if (value === 'true') data[key] = true;
      else if (value === 'false') data[key] = false;
      else data[key] = value;
    });

    // Ensure hasR3/hasR4 are boolean
    if (formType === 'mo') {
      data.hasR3 = hasR3;
      data.hasR4 = hasR4;
      data.permuta = isPermuta;
    }

    if (formType === 'viatura') {
      data.hasPatrulheiro01 = hasPatrulheiro01;
      data.hasPatrulheiro02 = hasPatrulheiro02;
      data.hasPatrulheiro03 = hasPatrulheiro03;
      data.hasPatrulheiro04 = hasPatrulheiro04;
      data.hasPatrulheiro05 = hasPatrulheiro05;
      data.permuta = isPermuta;
      data.isCondutorCmt = isCondutorCmt;
      
      // Handle "Condutor é o Comandante"
      if (isCondutorCmt) {
        data.condutor = data.comandante;
        data.tipoServicoCondutor = data.tipoServicoCmt;
      }
    }

    const collName = formType === 'linha' ? 'atividades_linha' :
                     formType === 'viatura' ? 'efetivo_viaturas' :
                     'efetivo_mos';

    try {
      if (editingItem) {
        data.updatedAt = Timestamp.now();
        data.isEdited = true;
        
        // Remove id from data before updating to avoid potential issues
        const { id, ...updateData } = data;
        await updateDoc(doc(db, collName, id), updateData);
      } else {
        await addDoc(collection(db, collName), data);
      }
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setActiveTab('dashboard');
        setFormType(null);
        setEditingItem(null);
        setHasR3(false);
        setHasR4(false);
        setIsPermuta(false);
        setHasPatrulheiro01(false);
        setHasPatrulheiro02(false);
        setHasPatrulheiro03(false);
        setHasPatrulheiro04(false);
        setHasPatrulheiro05(false);
        setIsCondutorCmt(false);
      }, 2000);
    } catch (error) {
      handleFirestoreError(error, editingItem ? OperationType.UPDATE : OperationType.CREATE, collName, `Submissão de formulário: ${formType}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSubmitting(true);
    try {
      const updatedSettings = {
        personnelList,
        prefixoVtList,
        patrimonioVtList,
        moList,
        patrimonioMoList,
        cityList,
        funcaoLinhaList,
        horarioLinhaList,
        tipoServicoList,
        tipoServicoVtList,
        adminList,
        authorizedList
      };
      console.log("Saving settings to Firestore:", updatedSettings);
      await setDoc(doc(db, 'settings', 'lists'), updatedSettings);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/lists', 'Salvamento de configurações de listas');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestoreDefaults = () => {
    if (!window.confirm("Deseja restaurar todas as listas para os valores padrão do sistema? Isso substituirá as configurações atuais.")) return;
    
    setPersonnelList(PERSONNEL_LIST);
    setPrefixoVtList(PREFIXO_VT_LIST);
    setPatrimonioVtList(PATRIMONIO_VT_LIST);
    setMoList(MO_LIST);
    setPatrimonioMoList(PATRIMONIO_LIST);
    
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  const handleSisCOpILogoError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    const currentSrc = target.src;
    const originalUrl = "https://i.pinimg.com/originals/87/a3/ed/87a3ed9f8a7288c126367864ac2a7663.png";
    
    if (currentSrc.includes('wsrv.nl')) {
      target.src = `https://corsproxy.io/?${encodeURIComponent(originalUrl)}`;
    } else if (currentSrc.includes('corsproxy.io')) {
      target.src = `https://api.allorigins.win/raw?url=${encodeURIComponent(originalUrl)}`;
    } else if (!currentSrc.includes(originalUrl)) {
      target.src = originalUrl;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f0f2f5] p-4 relative overflow-hidden">
        <LoadingOverlay isVisible={loginLoading} />
        {/* Background Accents */}
        <div className="absolute top-0 left-0 w-full h-2 bg-red-600"></div>
        <div className="absolute top-2 left-0 w-full h-1/2 bg-blue-900 -skew-y-6 -translate-y-1/2"></div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-10 rounded-[2rem] shadow-2xl max-w-md w-full text-center border border-slate-200 relative z-10"
        >
          <div className="w-32 h-32 bg-white rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-lg p-3">
            <img 
              src={getProxiedLogoUrl()} 
              alt="Logo 14º BPM" 
              className="w-full h-full object-contain" 
              referrerPolicy="no-referrer"
              onError={handleLogoError}
            />
          </div>
          <h1 className="text-4xl font-black text-blue-900 mb-0 uppercase tracking-tighter">14º BPM</h1>
          <p className="text-slate-500 font-black text-xs uppercase tracking-widest mb-2">PMPE</p>
          <p className="text-slate-400 font-medium mb-2 text-[10px]">Batalhão Cel. PM Manoel de Souza Ferraz</p>
          <img 
            src={`https://wsrv.nl/?url=${encodeURIComponent("https://i.pinimg.com/originals/87/a3/ed/87a3ed9f8a7288c126367864ac2a7663.png")}`} 
            alt="SisCOpI Logo" 
            className="h-10 w-auto object-contain mx-auto mb-8" 
            referrerPolicy="no-referrer"
            onError={handleSisCOpILogoError}
          />
          
          <div className="h-px bg-slate-100 w-full mb-8"></div>
          
          <button 
            onClick={handleLogin}
            disabled={loginLoading}
            className="w-full flex items-center justify-center gap-3 py-4 bg-white text-slate-700 border-2 border-slate-200 rounded-2xl font-bold hover:bg-slate-50 transition-all shadow-sm hover:shadow-md active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loginLoading ? (
              <Loader2 className="animate-spin text-blue-600" size={24} />
            ) : (
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
            )}
            {loginLoading ? "Acessando..." : "Entrar com Google"}
          </button>

          {authError && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl flex items-start gap-3">
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="font-bold">Erro no Acesso</p>
                <p className="opacity-90">{authError}</p>
                <button 
                  onClick={handleLoginRedirect}
                  className="mt-2 text-xs font-bold underline hover:text-red-800"
                >
                  Tentar método alternativo (Redirecionar)
                </button>
              </div>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-slate-200 w-full">
            <button 
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 py-2 text-slate-500 text-sm hover:text-slate-700 transition-colors"
            >
              <RefreshCw size={14} />
              Recarregar página
            </button>

            <button 
              onClick={handleClearSession}
              className="w-full flex items-center justify-center gap-2 py-2 text-red-400 text-[10px] uppercase font-bold hover:text-red-600 transition-colors mt-2"
            >
              <LogOut size={12} />
              Limpar sessão e sair
            </button>
          </div>

          <p className="mt-8 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
            Polícia Militar de Pernambuco
          </p>
        </motion.div>
      </div>
    );
  }

  // Access Pending Screen for logged in but unauthorized users
  if (!isAuthorized && !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-md text-center border border-slate-100"
        >
          <div className="w-24 h-24 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
            <ShieldAlert size={48} />
          </div>
          
          <h1 className="text-3xl font-black text-slate-900 mb-4 tracking-tight leading-none">
            Acesso Pendente
          </h1>
          
          <div className="space-y-4 mb-10">
            <p className="text-slate-600 font-medium leading-relaxed">
              Olá, <span className="text-blue-600 font-bold">{user.displayName || user.email}</span>.
            </p>
            <p className="text-slate-500 text-sm leading-relaxed">
              Sua conta ainda não foi autorizada para acessar o sistema SisCOpI. 
              Por favor, entre em contato com o administrador para solicitar a liberação do seu acesso.
            </p>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-left">
              <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Seu E-mail:</p>
              <p className="text-xs font-mono text-slate-600 break-all">{user.email}</p>
            </div>
          </div>

          <div className="space-y-3">
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
            >
              <RefreshCw size={18} />
              Verificar Novamente
            </button>
            
            <button 
              onClick={confirmLogout}
              className="w-full bg-white text-red-600 border-2 border-red-50 py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-50 transition-all flex items-center justify-center gap-2"
            >
              <LogOut size={18} />
              Sair da Conta
            </button>
          </div>

          <p className="mt-10 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
            14º BPM - Serra Talhada/PE
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <LoadingOverlay isVisible={submitting} />
      <div className="min-h-screen bg-slate-50 pb-20 md:pb-0 md:pl-64">
        {/* Logout Confirmation Modal */}
        {showLogoutModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <LogOut size={40} />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">Sair do Sistema?</h3>
                <p className="text-slate-500 font-medium">Tem certeza que deseja sair? Você precisará fazer login novamente para acessar o SisCOpI.</p>
              </div>
              <div className="flex border-t border-slate-100">
                <button 
                  onClick={() => setShowLogoutModal(false)}
                  className="flex-1 p-5 text-slate-600 font-bold hover:bg-slate-50 transition-colors border-r border-slate-100"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmLogout}
                  className="flex-1 p-5 text-red-600 font-black hover:bg-red-50 transition-colors"
                >
                  Sim, Sair
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 size={40} />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">Excluir Registro?</h3>
                <p className="text-slate-500 font-medium">
                  Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.
                </p>
                {itemToDelete && (
                  <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs font-mono text-slate-500 break-all">
                    {itemToDelete.prefixoViatura || itemToDelete.prefixo || itemToDelete.unidade || itemToDelete.funcao || itemToDelete.graduacaoNomeMatricula || "Registro"}
                  </div>
                )}
              </div>
              <div className="flex border-t border-slate-100">
                <button 
                  onClick={() => { setShowDeleteModal(false); setItemToDelete(null); }}
                  className="flex-1 p-5 text-slate-600 font-bold hover:bg-slate-50 transition-colors border-r border-slate-100"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 p-5 text-red-600 font-black hover:bg-red-50 transition-colors"
                >
                  Sim, Excluir
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sidebar Desktop */}
        <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-slate-200">
          <div className="flex flex-col bg-blue-900 text-white border-b-4 border-red-600 shadow-lg">
            <div className="p-6 flex items-center gap-3">
              <div className="bg-white p-1.5 rounded-xl shadow-inner">
                <img 
                  src={getProxiedLogoUrl()} 
                  alt="Logo 14º BPM" 
                  className="w-12 h-12 object-contain" 
                  referrerPolicy="no-referrer"
                  onError={handleLogoError}
                />
              </div>
              <div className="flex flex-col">
                <span className="font-black text-xl tracking-tighter leading-none">14º BPM</span>
                <span className="text-[10px] font-bold opacity-80 uppercase tracking-tighter">PMPE</span>
                <img 
                  src={`https://wsrv.nl/?url=${encodeURIComponent("https://i.pinimg.com/originals/87/a3/ed/87a3ed9f8a7288c126367864ac2a7663.png")}`} 
                  alt="SisCOpI Logo" 
                  className="h-4 w-auto object-contain mt-0.5" 
                  referrerPolicy="no-referrer"
                  onError={handleSisCOpILogoError}
                />
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 p-4 mt-4">
            <SidebarLink 
              active={activeTab === 'dashboard'} 
              onClick={() => { setActiveTab('dashboard'); setFormType(null); }}
              icon={<LayoutDashboard size={20} />}
              label="Dashboard"
            />
            <SidebarLink 
              active={activeTab === 'history'} 
              onClick={() => setActiveTab('history')}
              icon={<History size={20} />}
              label="Histórico"
            />
            <SidebarLink 
              active={activeTab === 'reports'} 
              onClick={() => setActiveTab('reports')}
              icon={<BarChart3 size={20} />}
              label="Relatórios"
            />
            <SidebarLink 
              active={activeTab === 'cadchecking'} 
              onClick={() => {
                setActiveTab('cadchecking');
                setCadcheckingSearchTerm('');
                setCadcheckingStatusFilter('all');
              }}
              icon={<img src="https://i.pinimg.com/originals/a4/9d/1b/a49d1bc945d9d701a572668f6ffc99b8.png" alt="" className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />}
              label="CadChecking"
            />
            {isAdmin && (
              <SidebarLink 
                active={activeTab === 'settings'} 
                onClick={() => setActiveTab('settings')}
                icon={<SettingsIcon size={20} />}
                label="Configurações"
              />
            )}
          </nav>

          <div className="mt-auto pt-6 border-t border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <img 
                src={user.photoURL || ""} 
                alt={user.displayName || ""} 
                className="w-10 h-10 rounded-full border border-slate-200" 
                onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=random`; }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{user.displayName}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 p-3 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
            >
              <LogOut size={20} />
              Sair
            </button>
          </div>
        </aside>

        {/* Mobile Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-2 z-50 shadow-2xl">
          <MobileNavLink active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setFormType(null); }} icon={<LayoutDashboard size={20} />} label="Início" />
          <MobileNavLink active={activeTab === 'form'} onClick={() => { setActiveTab('form'); setFormType(null); setEditingItem(null); }} icon={<PlusCircle size={20} />} label="Registro" />
          <MobileNavLink active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={20} />} label="Histórico" />
          <MobileNavLink active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={<BarChart3 size={20} />} label="Relatórios" />
          <MobileNavLink 
            active={activeTab === 'cadchecking'} 
            onClick={() => {
              setActiveTab('cadchecking');
              setCadcheckingSearchTerm('');
              setCadcheckingStatusFilter('all');
            }} 
            icon={<img src="https://i.pinimg.com/originals/a4/9d/1b/a49d1bc945d9d701a572668f6ffc99b8.png" alt="" className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />} 
            label="CadChecking" 
          />
          {isAdmin && <MobileNavLink active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<SettingsIcon size={20} />} label="Ajustes" />}
        </nav>

        {/* Mobile Header */}
        <header className="md:hidden bg-blue-900 text-white border-b-4 border-red-600 p-4 flex items-center justify-between sticky top-0 z-40 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="bg-white p-1 rounded-lg shadow-sm">
              <img 
                src={getProxiedLogoUrl()} 
                alt="Logo 14º BPM" 
                className="w-10 h-10 object-contain" 
                referrerPolicy="no-referrer"
                onError={handleLogoError}
              />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-lg tracking-tighter leading-none">14º BPM</span>
              <span className="text-[9px] font-bold opacity-80 uppercase">PMPE</span>
              <img 
                src={`https://wsrv.nl/?url=${encodeURIComponent("https://i.pinimg.com/originals/87/a3/ed/87a3ed9f8a7288c126367864ac2a7663.png")}`} 
                alt="SisCOpI Logo" 
                className="h-3.5 w-auto object-contain mt-0.5" 
                referrerPolicy="no-referrer"
                onError={handleSisCOpILogoError}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <img 
              src={user.photoURL || ""} 
              alt="" 
              className="w-8 h-8 rounded-full border-2 border-white/20" 
              onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=random`; }}
            />
            <button 
              onClick={handleLogout}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              title="Sair"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-6 max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="relative"
              >
                {/* Watermark Background */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none z-0">
                  <img 
                    src={getProxiedLogoUrl()} 
                    alt="" 
                    className="w-[500px] h-[500px] object-contain" 
                    referrerPolicy="no-referrer"
                  />
                </div>

                <header className="mb-10 p-10 bg-white rounded-[3rem] border-b-[12px] border-red-600 shadow-2xl relative overflow-hidden flex flex-col items-center text-center z-10">
                  <div className="absolute top-0 left-0 w-full h-2 bg-blue-900"></div>
                  <div className="bg-white p-5 rounded-[2.5rem] shadow-xl mb-6 relative z-10">
                    <img 
                      src={getProxiedLogoUrl()} 
                      alt="Logo 14º BPM" 
                      className="w-32 h-32 object-contain" 
                      referrerPolicy="no-referrer"
                      onError={handleLogoError}
                    />
                  </div>
                  <div className="relative z-10">
                    <h1 className="text-5xl font-black text-slate-900 tracking-tighter mb-2"><span>Olá, {user.displayName?.split(' ')[0]}!</span></h1>
                    <p className="text-blue-900 font-black text-2xl uppercase tracking-tight"><span>14º Batalhão de Polícia Militar</span></p>
                    <p className="text-slate-500 font-bold text-base uppercase tracking-widest opacity-60"><span>PMPE</span></p>
                    <div className="flex flex-col items-center justify-center gap-2 mt-4">
                      <div className="flex items-center justify-center gap-4">
                        <div className="h-px w-12 bg-slate-200"></div>
                        <img 
                          src={`https://wsrv.nl/?url=${encodeURIComponent("https://i.pinimg.com/originals/87/a3/ed/87a3ed9f8a7288c126367864ac2a7663.png")}`} 
                          alt="SisCOpI Logo" 
                          className="h-12 w-auto object-contain" 
                          referrerPolicy="no-referrer"
                          onError={handleSisCOpILogoError}
                        />
                        <div className="h-px w-12 bg-slate-200"></div>
                      </div>
                      <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">Sistema de Cadastramento Operacional Integrado</p>
                    </div>
                  </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <DashboardCard 
                    title="Atividade Linha"
                    description="Cadastramento de efetivo em Atividade de Linha."
                    color="blue"
                    icon={<UserRound size={32} />}
                    onClick={() => { setFormType('linha'); setActiveTab('form'); setIsPermuta(false); }}
                  />
                  <DashboardCard 
                    title="Efetivo Viaturas"
                    description="Cadastramento de efetivo em Viaturas."
                    color="emerald"
                    icon={<Car size={32} />}
                    onClick={() => { setFormType('viatura'); setActiveTab('form'); setIsPermuta(false); }}
                  />
                  <DashboardCard 
                    title="Efetivo Motos"
                    description="Cadastramento de efetivo em Motopatrulhamento."
                    color="orange"
                    icon={<Bike size={32} />}
                    onClick={() => { setFormType('mo'); setActiveTab('form'); setIsPermuta(false); }}
                  />
                  <DashboardCard 
                    title="CadChecking"
                    description="Cadastramento, check-in/out e manutenção de frota"
                    color="blue"
                    icon={<img src="https://i.pinimg.com/originals/a4/9d/1b/a49d1bc945d9d701a572668f6ffc99b8.png" alt="CadChecking" className="w-10 h-10 object-contain transition-transform group-hover:scale-110" referrerPolicy="no-referrer" />}
                    onClick={() => {
                      setActiveTab('cadchecking');
                      setCadcheckingSearchTerm('');
                      setCadcheckingStatusFilter('all');
                    }}
                  />
                  <DashboardCard 
                    title="Checklist"
                    description="Acesso ao sistema externo de checklist de viaturas do 14º BPM."
                    color="red"
                    icon={<img src="https://i.pinimg.com/originals/44/e4/8c/44e48c5ff461edb7623bab64bd898d8d.png" alt="Checklist" className="w-10 h-10 object-contain transition-transform group-hover:scale-110" referrerPolicy="no-referrer" />}
                    onClick={() => window.open('https://checklist-14-bpm.vercel.app/', '_blank')}
                  />
                  <DashboardCard 
                    title="Gestão de Serviços"
                    description="Acesso ao sistema externo de gestão de serviços (Base44)."
                    color="indigo"
                    icon={<img src="https://i.pinimg.com/originals/f6/7c/d6/f67cd60fb3862f17be0f3c3a61281b11.png" alt="Brasão 14º BPM" className="w-8 h-8 object-contain opacity-70 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />}
                    onClick={() => window.open('https://14-bpm.base44.app/AppLogin', '_blank')}
                  />
                  <DashboardCard 
                    title="Escalas PMPE"
                    description="Acesso ao sistema oficial de escalas da Polícia Militar de Pernambuco."
                    color="blue"
                    icon={<img src="https://www.pm.pe.gov.br/wp-content/uploads/2020/01/cropped-logo-pmpe-150x150.png" alt="Brasão PMPE" className="w-8 h-8 object-contain opacity-70 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />}
                    onClick={() => window.open('https://escalas.sistemas.pm.pe.gov.br/#/login', '_blank')}
                  />
                  {isAdmin && (
                    <DashboardCard 
                      title="Configurações"
                      description="Gerenciar listas de efetivo, viaturas, cidades e outros dados."
                      color="slate"
                      icon={<SettingsIcon size={32} />}
                      onClick={() => setActiveTab('settings')}
                    />
                  )}
                </div>

                <section className="mt-12">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-slate-900">Registros de Hoje</h2>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => {
                          const today = new Intl.DateTimeFormat('pt-BR', {
                            timeZone: 'America/Sao_Paulo',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                          }).format(new Date()).split('/').reverse().join('-');
                          generateConsolidatedPDF(today, today, ['atividades_linha', 'efetivo_viaturas', 'efetivo_mos']);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md hover:shadow-lg active:scale-95"
                      >
                        <FileText size={16} />
                        Visualizar Relatório
                      </button>
                      <button onClick={() => setActiveTab('history')} className="text-blue-600 text-sm font-semibold hover:underline">Ver tudo</button>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
                    <div className="min-w-[600px] md:min-w-0">
                      {historyData.slice(0, 5).map((item, idx) => (
                        <HistoryItem 
                          key={item.id} 
                          item={item} 
                          onDownload={() => generatePDF(item)} 
                          onDelete={() => handleDelete(item)}
                          onEdit={() => handleEdit(item)}
                          isAdmin={isAdmin}
                          isLast={idx === 4 || idx === historyData.length - 1} 
                          userId={user?.uid}
                        />
                      ))}
                    </div>
                    {historyData.length === 0 && (
                      <div className="p-10 text-center text-slate-400">Nenhum registro encontrado.</div>
                    )}
                  </div>
                </section>
              </motion.div>
            )}

            {activeTab === 'form' && !formType && (
              <motion.div 
                key="form-selection"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-3xl mx-auto"
              >
                <div className="text-center mb-10">
                  <h2 className="text-3xl font-black text-slate-900 mb-2">Novo Registro</h2>
                  <p className="text-slate-500 font-medium">Selecione o tipo de registro que deseja realizar</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <DashboardCard 
                    title="Atividade Linha"
                    description="Cadastramento de efetivo em Atividade de Linha."
                    color="blue"
                    icon={<UserRound size={32} />}
                    onClick={() => { setFormType('linha'); setIsPermuta(false); }}
                  />
                  <DashboardCard 
                    title="Efetivo Viaturas"
                    description="Cadastramento de efetivo em Viaturas."
                    color="emerald"
                    icon={<Car size={32} />}
                    onClick={() => { setFormType('viatura'); setIsPermuta(false); }}
                  />
                  <DashboardCard 
                    title="Efetivo Motos"
                    description="Cadastramento de efetivo em Motopatrulhamento."
                    color="orange"
                    icon={<Bike size={32} />}
                    onClick={() => { setFormType('mo'); setIsPermuta(false); }}
                  />
                  <DashboardCard 
                    title="Checklist"
                    description="Acesso ao sistema externo de checklist de viaturas do 14º BPM."
                    color="red"
                    icon={<img src="https://i.pinimg.com/originals/44/e4/8c/44e48c5ff461edb7623bab64bd898d8d.png" alt="Checklist" className="w-8 h-8 object-contain opacity-70 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />}
                    onClick={() => window.open('https://checklist-14-bpm.vercel.app/', '_blank')}
                  />
                </div>
              </motion.div>
            )}

            {activeTab === 'form' && formType && (
              <motion.div 
                key="form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-3xl mx-auto"
              >
                <button 
                  onClick={() => { setActiveTab('dashboard'); setFormType(null); }}
                  className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-6 transition-colors"
                >
                  <ChevronRight className="rotate-180" size={20} />
                  Voltar ao Dashboard
                </button>

                <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                  <div className="flex items-center gap-4 mb-8">
                    <div className={`p-3 rounded-2xl text-white ${
                      formType === 'linha' ? 'bg-blue-600' :
                      formType === 'viatura' ? 'bg-emerald-600' : 'bg-orange-600'
                    }`}>
                      <span className="text-lg font-bold">
                        {formType === 'linha' ? 'AL' :
                         formType === 'viatura' ? 'EV' : 'EM'}
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">
                      {formType === 'linha' ? 'Cadastramento - Atividade Linha' :
                       formType === 'viatura' ? 'Cadastramento do Efetivo das Viaturas' :
                       'Cadastramento do Efetivo das Motos'}
                    </h2>
                  </div>

                  {success ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle2 size={40} />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900">Sucesso!</h3>
                      <p className="text-slate-500">O registro foi salvo com sucesso.</p>
                    </div>
                  ) : (
                    <form key={editingItem?.id || 'new'} onSubmit={handleSubmit} className="space-y-8">
                      {/* Common Fields: Data and Chamada/Horario */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-slate-700">Data *</label>
                          <input required name="data" type="date" defaultValue={editingItem?.data || todayStr} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                        </div>
                        {formType === 'linha' ? (
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Horário *</label>
                            <select required name="horario" defaultValue={editingItem?.horario || ""} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                              <option value="">Selecione o horário</option>
                              {horarioLinhaList.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Chamada *</label>
                            <select required name="chamada" defaultValue={editingItem?.chamada || ""} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                              <option value="1ª Chamada">1ª Chamada (até 07h30)</option>
                              <option value="2ª Chamada">2ª Chamada (até 08h30)</option>
                              <option value="3ª Chamada">3ª Chamada (até 09h30)</option>
                              <option value="Outros">Outros Horários</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {/* MO Specific Fields */}
                      {formType === 'mo' && (
                        <div className="space-y-8">
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">PREFIXO *</label>
                            <SearchableSelect 
                              required 
                              name="prefixo" 
                              defaultValue={editingItem?.prefixo || ""} 
                              options={moList}
                              placeholder="Selecione o prefixo"
                            />
                          </div>

                          {/* R1 Section */}
                          <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-6">
                            <h3 className="font-bold text-blue-900 flex items-center gap-2">
                              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs">1</div>
                              Policial R1 (Comandante)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">CMT/R1 *</label>
                                <SearchableSelect 
                                  required 
                                  name="cmtR1" 
                                  defaultValue={editingItem?.cmtR1 || ""} 
                                  options={personnelList}
                                  placeholder="Selecione o policial"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">R1 (Tipo) *</label>
                                <select required name="r1Type" defaultValue={editingItem?.r1Type || ""} className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                                  <option value="">Selecione o tipo</option>
                                  {tipoServicoList.map(type => <option key={type} value={type}>{type}</option>)}
                                </select>
                              </div>
                              <div className="md:col-span-2 space-y-2">
                                <label className="text-sm font-semibold text-slate-700">PATRIMÔNIO R1 *</label>
                                <SearchableSelect 
                                  required 
                                  name="patrimonioR1" 
                                  defaultValue={editingItem?.patrimonioR1 || ""} 
                                  options={patrimonioMoList}
                                  placeholder="Selecione a moto"
                                />
                              </div>
                            </div>
                          </div>

                          {/* R2 Section */}
                          <div className="p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-6">
                            <h3 className="font-bold text-emerald-900 flex items-center gap-2">
                              <div className="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-xs">2</div>
                              Policial R2
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">R2</label>
                                <SearchableSelect 
                                  name="r2" 
                                  defaultValue={editingItem?.r2 || ""} 
                                  options={personnelList}
                                  placeholder="Selecione o policial"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">R2 (Tipo)</label>
                                <select name="r2Type" defaultValue={editingItem?.r2Type || ""} className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                                  <option value="">Selecione o tipo</option>
                                  {tipoServicoList.map(type => <option key={type} value={type}>{type}</option>)}
                                </select>
                              </div>
                              <div className="md:col-span-2 space-y-2">
                                <label className="text-sm font-semibold text-slate-700">PATRIMÔNIO R2</label>
                                <SearchableSelect 
                                  name="patrimonioR2" 
                                  defaultValue={editingItem?.patrimonioR2 || ""} 
                                  options={patrimonioMoList}
                                  placeholder="Selecione a moto"
                                />
                              </div>
                            </div>
                          </div>

                          {/* R3 Section (Conditional) */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-bold text-slate-700">Adicionar Policial R3?</label>
                              <button 
                                type="button"
                                onClick={() => setHasR3(!hasR3)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${hasR3 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}
                              >
                                {hasR3 ? <><UserMinus size={16} /> Remover</> : <><UserPlus size={16} /> Adicionar</>}
                              </button>
                            </div>
                            
                            {hasR3 && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="p-6 bg-orange-50/50 rounded-2xl border border-orange-100 space-y-6 overflow-hidden"
                              >
                                <h3 className="font-bold text-orange-900 flex items-center gap-2">
                                  <div className="w-6 h-6 bg-orange-600 text-white rounded-full flex items-center justify-center text-xs">3</div>
                                  Policial R3
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">R3</label>
                                    <SearchableSelect 
                                      name="r3" 
                                      defaultValue={editingItem?.r3 || ""} 
                                      options={personnelList}
                                      placeholder="Selecione o policial"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">R3 (Tipo)</label>
                                    <select name="r3Type" defaultValue={editingItem?.r3Type || ""} className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                                      <option value="">Selecione o tipo</option>
                                      {[...tipoServicoList, "OP São João"].map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                  </div>
                                  <div className="md:col-span-2 space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">PATRIMÔNIO R3</label>
                                    <SearchableSelect 
                                      name="patrimonioR3" 
                                      defaultValue={editingItem?.patrimonioR3 || ""} 
                                      options={patrimonioMoList}
                                      placeholder="Selecione a moto"
                                    />
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </div>

                          {/* R4 Section (Conditional) */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-bold text-slate-700">Adicionar Policial R4?</label>
                              <button 
                                type="button"
                                onClick={() => setHasR4(!hasR4)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${hasR4 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}
                              >
                                {hasR4 ? <><UserMinus size={16} /> Remover</> : <><UserPlus size={16} /> Adicionar</>}
                              </button>
                            </div>
                            
                            {hasR4 && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-6 overflow-hidden"
                              >
                                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                  <div className="w-6 h-6 bg-slate-900 text-white rounded-full flex items-center justify-center text-xs">4</div>
                                  Policial R4
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">R4</label>
                                    <SearchableSelect 
                                      name="r4" 
                                      defaultValue={editingItem?.r4 || ""} 
                                      options={personnelList}
                                      placeholder="Selecione o policial"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">R4 (Tipo)</label>
                                    <select name="r4Type" defaultValue={editingItem?.r4Type || ""} className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                                      <option value="">Selecione o tipo</option>
                                      {tipoServicoList.map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                  </div>
                                  <div className="md:col-span-2 space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">PATRIMÔNIO R4</label>
                                    <SearchableSelect 
                                      name="patrimonioR4" 
                                      defaultValue={editingItem?.patrimonioR4 || ""} 
                                      options={patrimonioMoList}
                                      placeholder="Selecione a moto"
                                    />
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </div>

                          {/* Additional Info Section */}
                          <div className="pt-6 border-t border-slate-100 space-y-6">
                            <h3 className="font-bold text-slate-900">Informações Adicionais</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Celular do Cmt</label>
                                <input name="celularCmt" defaultValue={editingItem?.celularCmt || ""} placeholder="(00) 00000-0000" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Celular Funcional</label>
                                <input name="celularFuncional" defaultValue={editingItem?.celularFuncional || ""} placeholder="(00) 00000-0000" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">CIDADE *</label>
                                <SearchableSelect 
                                  required 
                                  name="cidade" 
                                  defaultValue={editingItem?.cidade || ""} 
                                  options={cityList}
                                  placeholder="Selecione a cidade"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">PERMUTA *</label>
                                <div className="flex gap-4 p-1 bg-slate-100 rounded-xl">
                                  <label className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg cursor-pointer transition-all has-[:checked]:bg-white has-[:checked]:shadow-sm has-[:checked]:text-blue-600 text-slate-500 font-bold">
                                    <input type="radio" name="permuta" value="true" defaultChecked={editingItem?.permuta === true} onChange={() => setIsPermuta(true)} className="hidden" /> SIM
                                  </label>
                                  <label className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg cursor-pointer transition-all has-[:checked]:bg-white has-[:checked]:shadow-sm has-[:checked]:text-blue-600 text-slate-500 font-bold">
                                    <input type="radio" name="permuta" value="false" defaultChecked={editingItem ? editingItem.permuta === false : true} onChange={() => setIsPermuta(false)} className="hidden" /> NÃO
                                  </label>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-semibold text-slate-700">Especificação do Efetivo {isPermuta && '*'}</label>
                              <textarea required={isPermuta} name="especificacaoEfetivo" defaultValue={editingItem?.especificacaoEfetivo || ""} rows={2} placeholder="Ex: SD SANTOS PERMUTANDO COM SD SILVA" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-semibold text-slate-700">Nº do SEI {isPermuta && '*'}</label>
                              <input required={isPermuta} name="noSei" defaultValue={editingItem?.noSei || ""} placeholder="Número do processo SEI" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Line Activity Specific Fields */}
                      {formType === 'linha' && (
                        <div className="space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <label className="text-sm font-semibold text-slate-700">Função *</label>
                              <SearchableSelect 
                                required 
                                name="funcao" 
                                defaultValue={editingItem?.funcao || ""} 
                                options={funcaoLinhaList}
                                placeholder="Selecione a função"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-semibold text-slate-700">Graduação/Nome/Matrícula *</label>
                              <SearchableSelect 
                                required 
                                name="graduacaoNomeMatricula" 
                                defaultValue={editingItem?.graduacaoNomeMatricula || ""} 
                                options={personnelList}
                                placeholder="Selecione o policial"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <label className="text-sm font-semibold text-slate-700">Tipo de Serviço *</label>
                              <select required name="tipoServico" defaultValue={editingItem?.tipoServico || ""} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                                <option value="">Selecione o tipo</option>
                                {tipoServicoList.map(type => <option key={type} value={type}>{type}</option>)}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-semibold text-slate-700">Telefone *</label>
                              <input required name="telefone" defaultValue={editingItem?.telefone || ""} placeholder="(87) 9 9999 9999" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <label className="text-sm font-semibold text-slate-700">Cidade *</label>
                              <SearchableSelect 
                                required 
                                name="cidade" 
                                defaultValue={editingItem?.cidade || ""} 
                                options={cityList}
                                placeholder="Selecione a cidade"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-semibold text-slate-700">Permuta/Substituição *</label>
                              <div className="flex gap-4 p-1 bg-slate-100 rounded-xl">
                                <label className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg cursor-pointer transition-all has-[:checked]:bg-white has-[:checked]:shadow-sm has-[:checked]:text-blue-600 text-slate-500 font-bold">
                                  <input type="radio" name="permutaSubstituicao" value="true" defaultChecked={editingItem?.permutaSubstituicao === true} onChange={() => setIsPermuta(true)} className="hidden" /> SIM
                                </label>
                                <label className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg cursor-pointer transition-all has-[:checked]:bg-white has-[:checked]:shadow-sm has-[:checked]:text-blue-600 text-slate-500 font-bold">
                                  <input type="radio" name="permutaSubstituicao" value="false" defaultChecked={editingItem ? editingItem.permutaSubstituicao === false : true} onChange={() => setIsPermuta(false)} className="hidden" /> NÃO
                                </label>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Especificação do Efetivo {isPermuta && '*'}</label>
                            <textarea required={isPermuta} name="especificacaoEfetivo" defaultValue={editingItem?.especificacaoEfetivo || ""} rows={2} placeholder="EX.: SD SANTOS PERMUTANDO COM SD SILVA..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none" />
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Nº do SEI {isPermuta && '*'}</label>
                            <input required={isPermuta} name="noSei" defaultValue={editingItem?.noSei || ""} placeholder="Número do processo SEI" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Observação</label>
                            <textarea name="observacao" defaultValue={editingItem?.observacao || ""} rows={2} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none" />
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Adicionais (Central)</label>
                            <input name="adicionais" defaultValue={editingItem?.adicionais || ""} placeholder="Preenchimento realizado pela Central" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                          </div>
                        </div>
                      )}

                      {/* Viatura Specific Fields */}
                      {formType === 'viatura' && (
                        <div className="space-y-8">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <label className="text-sm font-semibold text-slate-700">PREFIXO *</label>
                              <SearchableSelect 
                                required 
                                name="prefixo" 
                                defaultValue={editingItem?.prefixo || ""} 
                                options={prefixoVtList}
                                placeholder="Selecione o prefixo"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-semibold text-slate-700">PATRIMÔNIO VT *</label>
                              <SearchableSelect 
                                required 
                                name="patrimonio" 
                                defaultValue={editingItem?.patrimonio || ""} 
                                options={patrimonioVtList}
                                placeholder="Selecione o patrimônio"
                              />
                            </div>
                          </div>

                          {/* Comandante Section */}
                          <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-6">
                            <h3 className="font-bold text-blue-900">Comandante da Viatura</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Comandante *</label>
                                <SearchableSelect 
                                  required 
                                  name="comandante" 
                                  defaultValue={editingItem?.comandante || ""} 
                                  options={personnelList}
                                  placeholder="Selecione o policial"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Tipo de Serviço Cmt *</label>
                                <select required name="tipoServicoCmt" defaultValue={editingItem?.tipoServicoCmt || ""} className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                                  <option value="">Selecione o tipo</option>
                                  {tipoServicoVtList.map(type => <option key={type} value={type}>{type}</option>)}
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* Condutor Section */}
                          <div className="p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-6">
                            <div className="flex items-center justify-between">
                              <h3 className="font-bold text-emerald-900">Condutor</h3>
                              <label className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isCondutorCmt ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300 group-hover:border-emerald-400'}`}>
                                  {isCondutorCmt && <Check size={14} className="text-white" />}
                                  <input 
                                    type="checkbox" 
                                    className="hidden" 
                                    checked={isCondutorCmt} 
                                    onChange={(e) => setIsCondutorCmt(e.target.checked)} 
                                  />
                                </div>
                                <span className="text-sm font-bold text-emerald-900">Condutor é o Comandante?</span>
                              </label>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">
                                  {isCondutorCmt ? "Condutor (Mesmo do Comandante)" : "Condutor *"}
                                </label>
                                {isCondutorCmt ? (
                                  <div className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 italic">
                                    Vinculado ao Comandante
                                  </div>
                                ) : (
                                  <SearchableSelect 
                                    required 
                                    name="condutor" 
                                    defaultValue={editingItem?.condutor || ""} 
                                    options={personnelList}
                                    placeholder="Selecione o policial"
                                  />
                                )}
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">
                                  {isCondutorCmt ? "Tipo de Serviço (Mesmo do Comandante)" : "Tipo de Serviço Condutor *"}
                                </label>
                                {isCondutorCmt ? (
                                  <div className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 italic">
                                    Vinculado ao Comandante
                                  </div>
                                ) : (
                                  <select required name="tipoServicoCondutor" defaultValue={editingItem?.tipoServicoCondutor || ""} className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                                    <option value="">Selecione o tipo</option>
                                    {tipoServicoVtList.map(type => <option key={type} value={type}>{type}</option>)}
                                  </select>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Patrulheiro 01 Section */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-bold text-slate-700">Adicionar Patrulheiro 01?</label>
                              <button 
                                type="button"
                                onClick={() => setHasPatrulheiro01(!hasPatrulheiro01)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${hasPatrulheiro01 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}
                              >
                                {hasPatrulheiro01 ? <><UserMinus size={16} /> Remover</> : <><UserPlus size={16} /> Adicionar</>}
                              </button>
                            </div>
                            
                            {hasPatrulheiro01 && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="p-6 bg-orange-50/50 rounded-2xl border border-orange-100 space-y-6 overflow-hidden"
                              >
                                <h3 className="font-bold text-orange-900">Patrulheiro 01</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Patrulheiro 01</label>
                                    <SearchableSelect 
                                      name="patrulheiro01" 
                                      defaultValue={editingItem?.patrulheiro01 || ""} 
                                      options={personnelList}
                                      placeholder="Selecione o policial"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Tipo de Serviço Patrulheiro 01</label>
                                    <select name="tipoServicoPatrulheiro01" defaultValue={editingItem?.tipoServicoPatrulheiro01 || ""} className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                                      <option value="">Selecione o tipo</option>
                                      {tipoServicoVtList.map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </div>

                          {/* Patrulheiro 02 Section */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-bold text-slate-700">Adicionar Patrulheiro 02?</label>
                              <button 
                                type="button"
                                onClick={() => setHasPatrulheiro02(!hasPatrulheiro02)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${hasPatrulheiro02 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}
                              >
                                {hasPatrulheiro02 ? <><UserMinus size={16} /> Remover</> : <><UserPlus size={16} /> Adicionar</>}
                              </button>
                            </div>
                            
                            {hasPatrulheiro02 && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-6 overflow-hidden"
                              >
                                <h3 className="font-bold text-slate-900">Patrulheiro 02</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Patrulheiro 02</label>
                                    <SearchableSelect 
                                      name="patrulheiro02" 
                                      defaultValue={editingItem?.patrulheiro02 || ""} 
                                      options={personnelList}
                                      placeholder="Selecione o policial"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Tipo de Serviço Patrulheiro 02</label>
                                    <select name="tipoServicoPatrulheiro02" defaultValue={editingItem?.tipoServicoPatrulheiro02 || ""} className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                                      <option value="">Selecione o tipo</option>
                                      {tipoServicoVtList.map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </div>

                          {/* Patrulheiro 03 Section */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-bold text-slate-700">Adicionar Patrulheiro 03?</label>
                              <button 
                                type="button"
                                onClick={() => setHasPatrulheiro03(!hasPatrulheiro03)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${hasPatrulheiro03 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}
                              >
                                {hasPatrulheiro03 ? <><UserMinus size={16} /> Remover</> : <><UserPlus size={16} /> Adicionar</>}
                              </button>
                            </div>
                            
                            {hasPatrulheiro03 && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="p-6 bg-orange-50/50 rounded-2xl border border-orange-100 space-y-6 overflow-hidden"
                              >
                                <h3 className="font-bold text-orange-900">Patrulheiro 03</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Patrulheiro 03</label>
                                    <SearchableSelect 
                                      name="patrulheiro03" 
                                      defaultValue={editingItem?.patrulheiro03 || ""} 
                                      options={personnelList}
                                      placeholder="Selecione o policial"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Tipo de Serviço Patrulheiro 03</label>
                                    <select name="tipoServicoPatrulheiro03" defaultValue={editingItem?.tipoServicoPatrulheiro03 || ""} className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                                      <option value="">Selecione o tipo</option>
                                      {tipoServicoVtList.map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </div>

                          {/* Patrulheiro 04 Section */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-bold text-slate-700">Adicionar Patrulheiro 04?</label>
                              <button 
                                type="button"
                                onClick={() => setHasPatrulheiro04(!hasPatrulheiro04)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${hasPatrulheiro04 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}
                              >
                                {hasPatrulheiro04 ? <><UserMinus size={16} /> Remover</> : <><UserPlus size={16} /> Adicionar</>}
                              </button>
                            </div>
                            
                            {hasPatrulheiro04 && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-6 overflow-hidden"
                              >
                                <h3 className="font-bold text-slate-900">Patrulheiro 04</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Patrulheiro 04</label>
                                    <SearchableSelect 
                                      name="patrulheiro04" 
                                      defaultValue={editingItem?.patrulheiro04 || ""} 
                                      options={personnelList}
                                      placeholder="Selecione o policial"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Tipo de Serviço Patrulheiro 04</label>
                                    <select name="tipoServicoPatrulheiro04" defaultValue={editingItem?.tipoServicoPatrulheiro04 || ""} className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                                      <option value="">Selecione o tipo</option>
                                      {tipoServicoVtList.map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </div>

                          {/* Patrulheiro 05 Section */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-bold text-slate-700">Adicionar Patrulheiro 05?</label>
                              <button 
                                type="button"
                                onClick={() => setHasPatrulheiro05(!hasPatrulheiro05)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${hasPatrulheiro05 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}
                              >
                                {hasPatrulheiro05 ? <><UserMinus size={16} /> Remover</> : <><UserPlus size={16} /> Adicionar</>}
                              </button>
                            </div>
                            
                            {hasPatrulheiro05 && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="p-6 bg-orange-50/50 rounded-2xl border border-orange-100 space-y-6 overflow-hidden"
                              >
                                <h3 className="font-bold text-orange-900">Patrulheiro 05</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Patrulheiro 05</label>
                                    <SearchableSelect 
                                      name="patrulheiro05" 
                                      defaultValue={editingItem?.patrulheiro05 || ""} 
                                      options={personnelList}
                                      placeholder="Selecione o policial"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Tipo de Serviço Patrulheiro 05</label>
                                    <select name="tipoServicoPatrulheiro05" defaultValue={editingItem?.tipoServicoPatrulheiro05 || ""} className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                                      <option value="">Selecione o tipo</option>
                                      {tipoServicoVtList.map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </div>

                          {/* Additional Info Section */}
                          <div className="pt-6 border-t border-slate-100 space-y-6">
                            <h3 className="font-bold text-slate-900">Informações Adicionais</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">CIDADE *</label>
                                <SearchableSelect 
                                  required 
                                  name="cidade" 
                                  defaultValue={editingItem?.cidade || ""} 
                                  options={cityList}
                                  placeholder="Selecione a cidade"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Celular do Cmt *</label>
                                <input required name="celularCmt" defaultValue={editingItem?.celularCmt || ""} placeholder="(00) 00000-0000" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Celular Funcional *</label>
                                <input required name="celularFuncional" defaultValue={editingItem?.celularFuncional || ""} placeholder="(00) 00000-0000" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">PERMUTA *</label>
                                <div className="flex gap-4 p-1 bg-slate-100 rounded-xl">
                                  <label className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg cursor-pointer transition-all has-[:checked]:bg-white has-[:checked]:shadow-sm has-[:checked]:text-blue-600 text-slate-500 font-bold">
                                    <input type="radio" name="permuta" value="true" defaultChecked={editingItem?.permuta === true} onChange={() => setIsPermuta(true)} className="hidden" /> SIM
                                  </label>
                                  <label className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg cursor-pointer transition-all has-[:checked]:bg-white has-[:checked]:shadow-sm has-[:checked]:text-blue-600 text-slate-500 font-bold">
                                    <input type="radio" name="permuta" value="false" defaultChecked={editingItem ? editingItem.permuta === false : true} onChange={() => setIsPermuta(false)} className="hidden" /> NÃO
                                  </label>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-semibold text-slate-700">Especificação do Efetivo {isPermuta && '*'}</label>
                              <textarea required={isPermuta} name="especificacaoEfetivo" defaultValue={editingItem?.especificacaoEfetivo || ""} rows={2} placeholder="Ex: SD SANTOS PERMUTANDO COM SD SILVA" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-semibold text-slate-700">Nº do SEI {isPermuta && '*'}</label>
                              <input required={isPermuta} name="noSei" defaultValue={editingItem?.noSei || ""} placeholder="Número do processo SEI" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Observações</label>
                        <textarea name="observacoes" defaultValue={editingItem?.observacoes || ""} rows={3} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none" />
                      </div>

                      {(formType === 'mo' || formType === 'viatura') && (
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-slate-700">HSH (Preenchimento Central)</label>
                          <input name="hsh" defaultValue={editingItem?.hsh || ""} placeholder="Não precisa responder" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                        </div>
                      )}

                      <div className="flex flex-col gap-3">
                        <button 
                          disabled={submitting}
                          type="submit"
                          className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {submitting ? <Loader2 className="animate-spin" size={20} /> : (editingItem ? <CheckCircle2 size={20} /> : <Plus size={20} />)}
                          {editingItem ? 'Atualizar Registro' : 'Salvar Registro'}
                        </button>

                        {editingItem && (
                          <button 
                            type="button"
                            onClick={() => {
                              setEditingItem(null);
                              // Reset states to default
                              setHasR3(false);
                              setHasPatrulheiro01(false);
                              setHasPatrulheiro02(false);
                              setHasPatrulheiro03(false);
                              setHasPatrulheiro04(false);
                              setHasPatrulheiro05(false);
                              setIsPermuta(false);
                              setIsCondutorCmt(false);
                            }}
                            className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                          >
                            Cancelar Edição
                          </button>
                        )}
                      </div>
                    </form>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <header className="mb-8">
                  <h1 className="text-3xl font-bold text-slate-900">Registros de Hoje</h1>
                  <p className="text-slate-500">Acesse e baixe todos os registros realizados no dia de hoje.</p>
                </header>

                <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto shadow-sm">
                  <div className="min-w-[600px] md:min-w-0">
                    {historyData.map((item, idx) => (
                      <HistoryItem 
                        key={item.id} 
                        item={item} 
                        onDownload={() => generatePDF(item)} 
                        onDelete={() => handleDelete(item)}
                        onEdit={() => handleEdit(item)}
                        isAdmin={isAdmin}
                        isLast={idx === historyData.length - 1} 
                        userId={user?.uid}
                        isExpanded={expandedHistoryId === item.id}
                        onToggle={() => setExpandedHistoryId(expandedHistoryId === item.id ? null : item.id)}
                      />
                    ))}
                  </div>
                  {historyData.length === 0 && (
                    <div className="p-20 text-center text-slate-400">
                      <History size={48} className="mx-auto mb-4 opacity-20" />
                      Nenhum registro encontrado.
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'reports' && (
              <motion.div 
                key="reports"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <header className="mb-8">
                  <h1 className="text-3xl font-bold text-slate-900">Relatórios Consolidados</h1>
                  <p className="text-slate-500">Gere relatórios em PDF baseados em filtros específicos.</p>
                </header>

                <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-2xl">
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const submitter = (e.nativeEvent as any).submitter;
                      const format = submitter?.value || 'pdf';
                      
                      console.log("Reports form submitted with format:", format);
                      const formData = new FormData(e.currentTarget);
                      const startDate = formData.get('startDate') as string;
                      const endDate = formData.get('endDate') as string;
                      const types = [];
                      if (formData.get('type_linha')) types.push('atividades_linha');
                      if (formData.get('type_viatura')) types.push('efetivo_viaturas');
                      if (formData.get('type_mo')) types.push('efetivo_mos');
                      
                      console.log("Form data:", { startDate, endDate, types });

                      if (!startDate || !endDate) {
                        addNotification("Por favor, selecione as datas de início e fim.", "error");
                        return;
                      }
                      if (types.length === 0) {
                        addNotification("Por favor, selecione pelo menos um tipo de registro.", "error");
                        return;
                      }
                      
                      if (format === 'csv') {
                        await generateConsolidatedCSV(startDate, endDate, types);
                      } else {
                        await generateConsolidatedPDF(startDate, endDate, types);
                      }
                    } catch (err) {
                      console.error("Error in reports form submission:", err);
                      addNotification("Ocorreu um erro ao processar o formulário de relatório.", "error");
                    }
                  }} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                          <Calendar size={16} /> Data Inicial
                        </label>
                        <input required name="startDate" type="date" defaultValue={todayStr} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                          <Calendar size={16} /> Data Final
                        </label>
                        <input required name="endDate" type="date" defaultValue={todayStr} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <Filter size={16} /> Tipos de Registro
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-blue-50 transition-colors">
                          <input type="checkbox" name="type_linha" defaultChecked className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500" />
                          <span className="text-sm font-medium text-slate-700">Linha</span>
                        </label>
                        <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-emerald-50 transition-colors">
                          <input type="checkbox" name="type_viatura" defaultChecked className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500" />
                          <span className="text-sm font-medium text-slate-700">Viatura</span>
                        </label>
                        <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-orange-50 transition-colors">
                          <input type="checkbox" name="type_mo" defaultChecked className="w-5 h-5 rounded text-orange-600 focus:ring-orange-500" />
                          <span className="text-sm font-medium text-slate-700">MO</span>
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                      <button 
                        type="submit"
                        name="format"
                        value="pdf"
                        disabled={submitting}
                        className="py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-3 disabled:opacity-50"
                      >
                        {submitting ? (
                          <Loader2 className="animate-spin" size={24} />
                        ) : (
                          <>
                            <FileDown size={24} />
                            Visualizar PDF
                          </>
                        )}
                      </button>
                      <button 
                        type="submit"
                        name="format"
                        value="csv"
                        disabled={submitting}
                        className="py-4 bg-emerald-600 text-white rounded-2xl font-bold text-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-3 disabled:opacity-50"
                      >
                        {submitting ? (
                          <Loader2 className="animate-spin" size={24} />
                        ) : (
                          <>
                            <FileSpreadsheet size={24} />
                            Gerar CSV
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && isAdmin && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <header className="mb-8">
                  <h1 className="text-3xl font-bold text-slate-900">Configurações do Sistema</h1>
                  <p className="text-slate-500">Gerencie as listas de dados utilizadas nos formulários.</p>
                </header>

                <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                  {success ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle2 size={40} />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900">Configurações Salvas!</h3>
                      <p className="text-slate-500">As listas foram atualizadas com sucesso.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleSaveSettings} className="space-y-8">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <SettingsListEditor 
                          label="Efetivo (Graduação/Nome/Matrícula)" 
                          value={personnelList.join('\n')} 
                          onChange={(val) => setPersonnelList(val.split('\n').filter(i => i.trim()))} 
                        />
                        <SettingsListEditor 
                          label="Prefixos de Viaturas" 
                          value={prefixoVtList.join('\n')} 
                          onChange={(val) => setPrefixoVtList(val.split('\n').filter(i => i.trim()))} 
                        />
                        <SettingsListEditor 
                          label="Patrimônios de Viaturas" 
                          value={patrimonioVtList.join('\n')} 
                          onChange={(val) => setPatrimonioVtList(val.split('\n').filter(i => i.trim()))} 
                        />
                        <SettingsListEditor 
                          label="Prefixos de Motos" 
                          value={moList.join('\n')} 
                          onChange={(val) => setMoList(val.split('\n').filter(i => i.trim()))} 
                        />
                        <SettingsListEditor 
                          label="Patrimônios de Motos" 
                          value={patrimonioMoList.join('\n')} 
                          onChange={(val) => setPatrimonioMoList(val.split('\n').filter(i => i.trim()))} 
                        />
                        <SettingsListEditor 
                          label="Cidades" 
                          value={cityList.join('\n')} 
                          onChange={(val) => setCityList(val.split('\n').filter(i => i.trim()))} 
                        />
                        <SettingsListEditor 
                          label="Funções (Linha)" 
                          value={funcaoLinhaList.join('\n')} 
                          onChange={(val) => setFuncaoLinhaList(val.split('\n').filter(i => i.trim()))} 
                        />
                        <SettingsListEditor 
                          label="Horários (Linha)" 
                          value={horarioLinhaList.join('\n')} 
                          onChange={(val) => setHorarioLinhaList(val.split('\n').filter(i => i.trim()))} 
                        />
                        <SettingsListEditor 
                          label="Tipos de Serviço (Geral)" 
                          value={tipoServicoList.join('\n')} 
                          onChange={(val) => setTipoServicoList(val.split('\n').filter(i => i.trim()))} 
                        />
                        <SettingsListEditor 
                          label="Tipos de Serviço (Viatura)" 
                          value={tipoServicoVtList.join('\n')} 
                          onChange={(val) => setTipoServicoVtList(val.split('\n').filter(i => i.trim()))} 
                        />
                      </div>

                      <div className="pt-6 border-t border-slate-100">
                        <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
                          <ShieldCheck size={20} />
                          Administradores Secundários
                        </h3>
                        <SettingsListEditor 
                          label="E-mails dos Administradores" 
                          value={adminList.join('\n')} 
                          onChange={(val) => setAdminList(val.split('\n').filter(i => i.trim()).map(e => e.toLowerCase().trim()))} 
                        />
                        <p className="text-[10px] text-slate-400 mt-2 italic">
                          * O administrador principal (demetriomarques@gmail.com) tem acesso permanente. Administradores secundários podem gerenciar estas configurações.
                        </p>
                      </div>

                      <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row gap-4">
                        <button 
                          type="button"
                          onClick={handleRestoreDefaults}
                          className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold text-lg hover:bg-slate-200 transition-all flex items-center justify-center gap-3"
                        >
                          <RefreshCw size={24} />
                          Restaurar Padrões
                        </button>
                        <button 
                          type="submit"
                          disabled={submitting}
                          className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                          {submitting ? <Loader2 className="animate-spin" size={24} /> : <Save size={24} />}
                          Salvar Configurações
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'cadchecking' && (
              <motion.div 
                key="cadchecking"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <CadChecking 
                  user={user}
                  isAdmin={isAdmin}
                  vehicles={vehicles}
                  history={cadcheckingHistory}
                  selectedVehicle={selectedVehicle}
                  operationType={operationType}
                  view={cadcheckingView}
                  setView={setCadcheckingView}
                  searchTerm={cadcheckingSearchTerm}
                  setSearchTerm={setCadcheckingSearchTerm}
                  statusFilter={cadcheckingStatusFilter}
                  setStatusFilter={setCadcheckingStatusFilter}
                  historyFilter={cadcheckingHistoryFilter}
                  setHistoryFilter={setCadcheckingHistoryFilter}
                  expandedHistoryId={expandedHistoryId}
                  setExpandedHistoryId={setExpandedHistoryId}
                  onStartRecord={handleStartCadcheckingRecord}
                  onToggleMaintenance={handleToggleMaintenance}
                  maintenanceModal={maintenanceModal}
                  setMaintenanceModal={setMaintenanceModal}
                  onSaveRecord={handleSaveCadcheckingRecord}
                  onResendWhatsApp={handleResendWhatsApp}
                  onEditVehicle={(v: any) => {
                    setEditingVehicle(v);
                    setVehicleForm({
                      prefix: v.prefix,
                      plate: v.plate,
                      model: v.model,
                      status: v.status,
                      lastMileage: v.lastMileage
                    });
                    setIsVehicleModalOpen(true);
                  }}
                  onDeleteVehicle={handleDeleteVehicle}
                  onBootstrap={bootstrapVehicles}
                  isSyncing={isSyncing}
                  formData={cadcheckingFormData}
                  setFormData={setCadcheckingFormData}
                  submitting={submitting}
                  adminUsers={adminUsers}
                  onAddAdmin={handleAddAdmin}
                  onRemoveAdmin={handleRemoveAdmin}
                  isUserModalOpen={isUserModalOpen}
                  setIsUserModalOpen={setIsUserModalOpen}
                  newUserEmail={newUserEmail}
                  setNewUserEmail={setNewUserEmail}
                  isVehicleModalOpen={isVehicleModalOpen}
                  setIsVehicleModalOpen={setIsVehicleModalOpen}
                  vehicleForm={vehicleForm}
                  setVehicleForm={setVehicleForm}
                  onSaveVehicle={handleSaveVehicle}
                  editingVehicle={editingVehicle}
                  setEditingVehicle={setEditingVehicle}
                  currentTab={currentCadcheckingTab}
                  setCurrentTab={setCurrentCadcheckingTab}
                  personnelList={personnelList}
                  prefixoVtList={prefixoVtList}
                  moList={moList}
                  patrimonioVtList={patrimonioVtList}
                  patrimonioMoList={patrimonioMoList}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
      <AnimatePresence>
        {showPdfPreview && pdfPreviewUrl && (
          <PDFPreviewModal url={pdfPreviewUrl} onClose={closePdfPreview} />
        )}
      </AnimatePresence>

      {/* Notifications */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className={`pointer-events-auto px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] max-w-md ${
                n.type === 'success' ? 'bg-emerald-600 text-white' :
                n.type === 'error' ? 'bg-rose-600 text-white' :
                'bg-blue-600 text-white'
              }`}
            >
              {n.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> :
               n.type === 'error' ? <AlertCircle className="w-5 h-5" /> :
               <Info className="w-5 h-5" />}
              <p className="text-sm font-medium">{n.message}</p>
              <button 
                onClick={() => setNotifications(prev => prev.filter(item => item.id !== n.id))}
                className="ml-auto p-1 hover:bg-white/20 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}

// ... (SidebarLink, MobileNavLink, DashboardCard, HistoryItemProps, HistoryItem remain same)

function SidebarLink({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all font-bold ${
        active ? 'bg-blue-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <div className={`${active ? 'text-red-500' : ''}`}>
        {icon}
      </div>
      {label}
    </button>
  );
}

function MobileNavLink({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${active ? 'text-blue-900 bg-blue-50' : 'text-slate-400'}`}
    >
      <div className={`${active ? 'text-red-600' : ''}`}>
        {icon}
      </div>
      <span className={`text-[9px] font-black uppercase tracking-tighter ${active ? 'text-blue-900' : 'text-slate-400'}`}>{label}</span>
    </button>
  );
}

function DashboardCard({ title, description, onClick, color = "blue", icon }: { title: string, description: string, onClick: () => void, color?: "blue" | "emerald" | "orange" | "slate" | "red" | "indigo", icon?: React.ReactNode }) {
  const borderClasses = {
    blue: "hover:border-blue-300",
    emerald: "hover:border-emerald-300",
    orange: "hover:border-orange-300",
    slate: "hover:border-slate-300",
    red: "hover:border-red-300",
    indigo: "hover:border-indigo-300"
  };

  const accentClasses = {
    blue: "bg-blue-600",
    emerald: "bg-emerald-600",
    orange: "bg-orange-600",
    slate: "bg-slate-600",
    red: "bg-red-600",
    indigo: "bg-indigo-600"
  };

  return (
    <button 
      onClick={onClick}
      className={`bg-white p-8 rounded-[2.5rem] border border-slate-200 text-left hover:shadow-2xl transition-all duration-300 group relative overflow-hidden flex flex-col h-full ${borderClasses[color]}`}
    >
      <div className="flex justify-between items-start mb-6">
        <div className={`w-12 h-2 rounded-full transition-all duration-300 ${accentClasses[color]}`} />
        {icon && <div className="text-slate-400 group-hover:text-blue-600 transition-colors">{icon}</div>}
      </div>
      
      <div className="flex-grow">
        <h3 className="text-2xl font-black text-slate-900 mb-3 tracking-tight group-hover:text-blue-900 transition-colors">{title}</h3>
        <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6">{description}</p>
      </div>

      <div className="flex items-center text-blue-600 text-sm font-black uppercase tracking-widest gap-2 mt-auto">
        <span>Acessar</span>
        <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
      </div>
      
      {/* Decorative background element */}
      <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-slate-50 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 scale-50 group-hover:scale-100" />
    </button>
  );
}

function SearchableSelect({ 
  options, 
  name, 
  defaultValue = "", 
  required = false, 
  placeholder = "Selecione...",
  className = "",
  onChange
}: { 
  options: string[], 
  name: string, 
  defaultValue?: string, 
  required?: boolean, 
  placeholder?: string,
  className?: string,
  onChange?: (val: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState(defaultValue);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = (options || []).filter(opt => 
    String(opt || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      console.log(`[SearchableSelect:${name}] Opened with ${options?.length || 0} options`);
    }
  }, [isOpen, options, name]);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <input type="hidden" name={name} value={selected} required={required} />
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer flex justify-between items-center group hover:border-blue-300"
      >
        <span className={selected ? "text-slate-900" : "text-slate-400"}>
          {selected || placeholder}
        </span>
        <ChevronRight className={`transition-transform text-slate-400 group-hover:text-blue-500 ${isOpen ? 'rotate-90' : ''}`} size={18} />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
            <Search size={16} className="text-slate-400" />
            <input 
              autoFocus
              type="text" 
              placeholder="Pesquisar..." 
              className="w-full bg-transparent border-none outline-none text-sm p-1"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm("")}>
                <X size={14} className="text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, i) => (
                <div 
                  key={i}
                  onClick={() => {
                    setSelected(opt);
                    setIsOpen(false);
                    setSearchTerm("");
                    if (onChange) onChange(opt);
                  }}
                  className={`p-3 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${selected === opt ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-700'}`}
                >
                  {opt}
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-slate-400 text-sm italic">Nenhum resultado encontrado</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsListEditor({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-bold text-slate-700">{label}</label>
      <textarea 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none font-mono text-sm"
        placeholder="Um item por linha..."
      />
      <p className="text-[10px] text-slate-400 italic">Insira um item por linha.</p>
    </div>
  );
}

interface HistoryItemProps {
  key?: any;
  item: any;
  onDownload: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  isAdmin: boolean;
  isLast: boolean;
  userId?: string;
  isExpanded?: boolean;
  onToggle?: () => void;
}

function HistoryItem({ item, onDownload, onDelete, onEdit, isAdmin, isLast, userId, isExpanded, onToggle }: HistoryItemProps) {
  const date = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
  const isOwner = item.createdBy === userId;
  const typeLabel = item.type === 'atividades_linha' ? 'Linha' :
                    item.type === 'efetivo_viaturas' ? 'Viatura' : 'MO';
  const typeColor = item.type === 'atividades_linha' ? 'bg-blue-900 text-white' :
                    item.type === 'efetivo_viaturas' ? 'bg-emerald-700 text-white' : 'bg-orange-700 text-white';
  
  // Helper to get effective names
  const getEffectiveNames = () => {
    if (item.type === 'atividades_linha') {
      return item.graduacaoNomeMatricula || '';
    }
    if (item.type === 'efetivo_viaturas') {
      const names = [
        item.comandante, 
        item.condutor, 
        item.patrulheiro01, 
        item.patrulheiro02, 
        item.patrulheiro03, 
        item.patrulheiro04, 
        item.patrulheiro05
      ].filter(Boolean);
      return names.join(', ');
    }
    if (item.type === 'efetivo_mos') {
      const names = [
        item.cmtR1, 
        item.r2, 
        item.r3, 
        item.r4
      ].filter(Boolean);
      return names.join(', ');
    }
    return '';
  };

  const effectiveNames = getEffectiveNames();
  const patrimony = item.patrimonio || item.patrimonioViatura || item.patrimonioR1 || item.patrimonioR2 || item.patrimonioR3 || item.patrimonioR4 || '';
  const city = item.cidade || '';
  const spec = item.especificacaoEfetivo || '';

  return (
    <div className={`flex flex-col transition-all ${!isLast ? 'border-b border-slate-100' : ''} ${isExpanded ? 'bg-slate-50/80 shadow-inner' : 'hover:bg-slate-50'}`}>
      <div className="p-4 flex items-center justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${item.type === 'atividades_linha' ? 'bg-blue-50 text-blue-900' : item.type === 'efetivo_viaturas' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
            <span className="font-bold">
              {item.type === 'atividades_linha' ? 'AL' : item.type === 'efetivo_viaturas' ? 'EV' : 'EM'}
            </span>
          </div>
          <div>
            <p className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
              <span>{item.prefixoViatura || item.prefixo || item.unidade || item.funcao || item.graduacaoNomeMatricula || "Registro"}</span>
              {patrimony && (
                <span className="text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
                  Pat: {patrimony}
                </span>
              )}
              {item.isEdited && (
                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 uppercase tracking-tighter">
                  Editado
                </span>
              )}
            </p>
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                <Calendar size={10} className="opacity-60" />
                <span>{date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span> às <span>{date.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</span>
                {city && (
                  <>
                    <span className="mx-1 opacity-20">|</span>
                    <MapPin size={10} className="opacity-60 text-blue-600" />
                    <span className="text-blue-600 font-bold">{city}</span>
                  </>
                )}
              </p>
              {effectiveNames && (
                <p className="text-[10px] text-slate-600 font-semibold flex items-start gap-1 mt-0.5">
                  <Users size={10} className="mt-0.5 opacity-60" />
                  <span className="line-clamp-1">{effectiveNames}</span>
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${typeColor}`}>
            {typeLabel}
          </div>
          <ChevronRight className={`text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} size={20} />
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 pt-2 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Common Details */}
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Data/Hora do Registro</p>
                  <p className="text-sm font-bold text-slate-700">{date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
                </div>

                {item.type === 'atividades_linha' && (
                  <>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Função</p>
                      <p className="text-sm font-bold text-slate-700">{item.funcao}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Horário</p>
                      <p className="text-sm font-bold text-slate-700">{item.horario}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipo de Serviço</p>
                      <p className="text-sm font-bold text-slate-700">{item.tipoServico}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Telefone</p>
                      <p className="text-sm font-bold text-slate-700">{item.telefone}</p>
                    </div>
                  </>
                )}

                {(item.type === 'efetivo_viaturas' || item.type === 'efetivo_mos') && (
                  <>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Chamada</p>
                      <p className="text-sm font-bold text-slate-700">{item.chamada}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Prefixo</p>
                      <p className="text-sm font-bold text-slate-700">{item.prefixo}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Patrimônio</p>
                      <p className="text-sm font-bold text-slate-700">{patrimony}</p>
                    </div>
                  </>
                )}

                {item.type === 'efetivo_viaturas' && (
                  <>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Comandante</p>
                      <p className="text-sm font-bold text-slate-700">{item.comandante}</p>
                      <p className="text-[10px] text-slate-500">{item.tipoServicoCmt}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Condutor</p>
                      <p className="text-sm font-bold text-slate-700">{item.condutor}</p>
                      <p className="text-[10px] text-slate-500">{item.tipoServicoCondutor}</p>
                    </div>
                  </>
                )}

                {item.type === 'efetivo_mos' && (
                  <>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Comandante R1</p>
                      <p className="text-sm font-bold text-slate-700">{item.cmtR1}</p>
                      <p className="text-[10px] text-slate-500">{item.r1Type}</p>
                    </div>
                    {item.r2 && (
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">R2</p>
                        <p className="text-sm font-bold text-slate-700">{item.r2}</p>
                        <p className="text-[10px] text-slate-500">{item.r2Type}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Personnel List for Viaturas/MOs */}
              {(item.type === 'efetivo_viaturas' || item.type === 'efetivo_mos') && (
                <div className="bg-white p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Efetivo Completo</p>
                  <div className="flex flex-wrap gap-2">
                    {item.type === 'efetivo_viaturas' ? (
                      [
                        { name: item.comandante, type: item.tipoServicoCmt, label: 'Cmt' },
                        { name: item.condutor, type: item.tipoServicoCondutor, label: 'Cond' },
                        { name: item.patrulheiro01, type: item.tipoServicoPatrulheiro01, label: 'P1' },
                        { name: item.patrulheiro02, type: item.tipoServicoPatrulheiro02, label: 'P2' },
                        { name: item.patrulheiro03, type: item.tipoServicoPatrulheiro03, label: 'P3' },
                        { name: item.patrulheiro04, type: item.tipoServicoPatrulheiro04, label: 'P4' },
                        { name: item.patrulheiro05, type: item.tipoServicoPatrulheiro05, label: 'P5' }
                      ].filter(p => p.name).map((p, i) => (
                        <div key={i} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 flex flex-col">
                          <span className="text-[9px] font-black text-blue-600 uppercase mb-0.5">{p.label}</span>
                          <span className="text-xs font-bold text-slate-700">{p.name}</span>
                          <span className="text-[9px] text-slate-400 font-medium">{p.type}</span>
                        </div>
                      ))
                    ) : (
                      [
                        { name: item.cmtR1, type: item.r1Type, label: 'R1' },
                        { name: item.r2, type: item.r2Type, label: 'R2' },
                        { name: item.r3, type: item.r3Type, label: 'R3' },
                        { name: item.r4, type: item.r4Type, label: 'R4' }
                      ].filter(p => p.name).map((p, i) => (
                        <div key={i} className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 flex flex-col">
                          <span className="text-[9px] font-black text-orange-600 uppercase mb-0.5">{p.label}</span>
                          <span className="text-xs font-bold text-slate-700">{p.name}</span>
                          <span className="text-[9px] text-slate-400 font-medium">{p.type}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {spec && (
                <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                  <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Especificação do Efetivo</p>
                  <p className="text-sm text-red-700 font-medium">{spec}</p>
                </div>
              )}

              {(item.observacao || item.observacoes) && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Observações</p>
                  <p className="text-sm text-slate-600 italic">"{item.observacao || item.observacoes}"</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100">
                <button 
                  onClick={(e) => { e.stopPropagation(); onDownload(); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95"
                >
                  <FileText size={18} />
                  Gerar PDF
                </button>
                
                {(isAdmin || isOwner) && onEdit && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95"
                  >
                    <Pencil size={18} />
                    Editar
                  </button>
                )}

                {isAdmin && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white text-red-600 border border-red-100 rounded-xl font-bold text-sm hover:bg-red-50 transition-all active:scale-95"
                  >
                    <Trash2 size={18} />
                    Excluir
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- CadChecking Component ---
function CadChecking({ 
  user, 
  isAdmin, 
  vehicles, 
  history, 
  selectedVehicle, 
  operationType, 
  view, 
  setView,
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  historyFilter,
  setHistoryFilter,
  expandedHistoryId,
  setExpandedHistoryId,
  onStartRecord,
  onToggleMaintenance,
  onSaveRecord,
  onResendWhatsApp,
  onEditVehicle,
  onDeleteVehicle,
  onBootstrap,
  isSyncing,
  formData,
  setFormData,
  submitting,
  adminUsers,
  onAddAdmin,
  onRemoveAdmin,
  isUserModalOpen,
  setIsUserModalOpen,
  newUserEmail,
  setNewUserEmail,
  isVehicleModalOpen,
  setIsVehicleModalOpen,
  vehicleForm,
  setVehicleForm,
  onSaveVehicle,
  editingVehicle,
  setEditingVehicle,
  maintenanceModal,
  setMaintenanceModal,
  currentTab,
  setCurrentTab,
  personnelList,
  prefixoVtList,
  moList,
  patrimonioVtList,
  patrimonioMoList
}: any) {
  
  console.log(`[CadChecking] Rendering with ${vehicles.length} total vehicles`);
  
  const counts = React.useMemo(() => ({
    all: vehicles.length,
    available: vehicles.filter((v: any) => v.status === 'available').length,
    in_use: vehicles.filter((v: any) => v.status === 'in_use').length,
    maintenance: vehicles.filter((v: any) => v.status === 'maintenance').length
  }), [vehicles]);

  const filteredVehicles = React.useMemo(() => vehicles.filter((v: any) => {
    const plate = (v.plate || '').toLowerCase();
    const model = (v.model || '').toLowerCase();
    const prefix = (v.prefix || '').toLowerCase();
    const search = (searchTerm || '').toLowerCase();

    const matchesSearch = plate.includes(search) || 
                         model.includes(search) ||
                         prefix.includes(search);
    const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [vehicles, searchTerm, statusFilter]);

  console.log(`[CadChecking] Filtered to ${filteredVehicles.length} vehicles (Search: "${searchTerm}", Status: "${statusFilter}")`);

  const filteredHistory = React.useMemo(() => history.filter((h: any) => {
    if (historyFilter === 'all') return true;
    if (historyFilter === 'maintenance') return h.type.includes('maintenance');
    return h.type === historyFilter;
  }), [history, historyFilter]);

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <img 
              src="https://i.pinimg.com/originals/a4/9d/1b/a49d1bc945d9d701a572668f6ffc99b8.png" 
              alt="CadChecking Logo" 
              className="w-10 h-10 object-contain" 
              referrerPolicy="no-referrer"
            />
            CadChecking <span className="text-blue-600/20">|</span> <span className="text-slate-400 text-lg font-bold">Controle de Frota</span>
          </h2>
          <p className="text-slate-500 font-medium">Gerenciamento de cautela e manutenção de viaturas.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl">
          <button 
            onClick={() => setView('list')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${view === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Truck size={18} />
            Frota
          </button>
          <button 
            onClick={() => setView('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${view === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <History size={18} />
            Histórico
          </button>
          {isAdmin && (
            <button 
              onClick={() => setView('admin')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${view === 'admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <ShieldCheck size={18} />
              Painel
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <AnimatePresence mode="wait">
        {view === 'list' && (
          <motion.div 
            key="list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Filters */}
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1 lg:flex-[0.45]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input 
                  type="text"
                  placeholder="Buscar por placa, modelo ou patrimônio..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all shadow-sm font-medium"
                />
              </div>
              
              <div className="flex flex-wrap gap-2 flex-1 lg:flex-[0.55]">
                {[
                  { id: 'all', label: 'Todos', count: counts.all, color: 'bg-slate-100 text-slate-700', activeColor: 'bg-slate-900 text-white' },
                  { id: 'available', label: 'Disponíveis', count: counts.available, color: 'bg-emerald-50 text-emerald-700 border-emerald-100', activeColor: 'bg-emerald-600 text-white' },
                  { id: 'in_use', label: 'Em Uso', count: counts.in_use, color: 'bg-blue-50 text-blue-700 border-blue-100', activeColor: 'bg-blue-600 text-white' },
                  { id: 'maintenance', label: 'Manutenção', count: counts.maintenance, color: 'bg-amber-50 text-amber-700 border-amber-100', activeColor: 'bg-amber-600 text-white' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setStatusFilter(opt.id)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-2xl font-bold transition-all border shadow-sm min-w-[120px] ${
                      statusFilter === opt.id 
                        ? `${opt.activeColor} border-transparent shadow-md scale-[1.02]` 
                        : `${opt.color} border-transparent hover:border-current/20`
                    }`}
                  >
                    <span className="text-xs whitespace-nowrap">{opt.label}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusFilter === opt.id ? 'bg-white/20' : 'bg-current/10'}`}>
                      {opt.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Vehicle Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredVehicles.map((vehicle: any) => (
                <VehicleCard 
                  key={vehicle.id} 
                  vehicle={vehicle} 
                  isAdmin={isAdmin}
                  currentUserEmail={user?.email}
                  onStartRecord={onStartRecord}
                  onToggleMaintenance={onToggleMaintenance}
                  onEdit={onEditVehicle}
                  onDelete={onDeleteVehicle}
                />
              ))}
              {filteredVehicles.length === 0 && (
                <div className="col-span-full py-20 text-center bg-white rounded-[2.5rem] border border-dashed border-slate-300">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="text-slate-300" size={40} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Nenhuma viatura encontrada</h3>
                  <p className="text-slate-500">Tente ajustar seus filtros de busca.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {view === 'history' && (
          <motion.div 
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* History Filters */}
            <div className="flex flex-wrap gap-2 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
              {['all', 'check-in', 'check-out', 'maintenance'].map((f) => (
                <button
                  key={f}
                  onClick={() => setHistoryFilter(f as any)}
                  className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${historyFilter === f ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                >
                  {f === 'all' ? 'Todos' : f === 'check-in' ? 'Saídas (Check-in)' : f === 'check-out' ? 'Retornos (Check-out)' : 'Manutenção'}
                </button>
              ))}
            </div>

            {/* History List */}
            <div className="space-y-4">
              {filteredHistory.map((record: any) => (
                <CadcheckingHistoryItem 
                  key={record.id} 
                  record={record} 
                  isExpanded={expandedHistoryId === record.id}
                  onToggle={() => setExpandedHistoryId(expandedHistoryId === record.id ? null : record.id)}
                  onResendWhatsApp={onResendWhatsApp}
                />
              ))}
              {filteredHistory.length === 0 && (
                <div className="py-20 text-center bg-white rounded-[2.5rem] border border-dashed border-slate-300">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <History className="text-slate-300" size={40} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Nenhum registro encontrado</h3>
                  <p className="text-slate-500">Os registros de cautela aparecerão aqui.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {view === 'admin' && isAdmin && (
          <motion.div 
            key="admin"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            {/* Fleet Management */}
            <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                    <Truck className="text-blue-600" size={24} />
                    Gestão da Frota
                  </h3>
                  <p className="text-slate-500 text-sm font-medium">Cadastre e gerencie as viaturas da unidade.</p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => onBootstrap(true)}
                    disabled={isSyncing}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={isSyncing ? "animate-spin" : ""} size={18} />
                    Sincronizar Frota
                  </button>
                  <button 
                    onClick={() => {
                      setEditingVehicle(null);
                      setVehicleForm({ prefix: '', plate: '', model: '', status: 'available', lastMileage: 0 });
                      setIsVehicleModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95"
                  >
                    <Plus size={20} />
                    Nova Viatura
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-slate-400 text-xs font-black uppercase tracking-widest">
                      <th className="px-4 py-2">Patrimônio</th>
                      <th className="px-4 py-2">Placa</th>
                      <th className="px-4 py-2">Modelo</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Última KM</th>
                      <th className="px-4 py-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((v: any) => (
                      <tr key={v.id} className="bg-slate-50/50 hover:bg-slate-50 transition-colors group">
                        <td className="px-4 py-4 rounded-l-2xl">
                          <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-md uppercase tracking-wider">
                            {v.prefix}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-mono font-bold text-blue-600">{v.plate}</td>
                        <td className="px-4 py-4 text-slate-600 font-medium">{v.model}</td>
                        <td className="px-4 py-4">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            v.status === 'available' ? 'bg-emerald-100 text-emerald-700' :
                            v.status === 'in_use' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {v.status === 'available' ? 'Disponível' : v.status === 'in_use' ? 'Em Uso' : 'Manutenção'}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-mono font-bold text-slate-500">{v.lastMileage} km</td>
                        <td className="px-4 py-4 rounded-r-2xl text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => onEditVehicle(v)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                            >
                              <Pencil size={18} />
                            </button>
                            <button 
                              onClick={() => onDeleteVehicle(v.id, v.plate)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Admin Users Management */}
            <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                    <ShieldCheck className="text-blue-600" size={24} />
                    Administradores do Sistema
                  </h3>
                  <p className="text-slate-500 text-sm font-medium">Gerencie quem pode cadastrar viaturas e ver todo o histórico.</p>
                </div>
                <button 
                  onClick={() => setIsUserModalOpen(true)}
                  className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                >
                  <UserPlus size={20} />
                  Adicionar Admin
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {adminUsers.filter((u: any) => u.role === 'admin').map((admin: any) => (
                  <div key={admin.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-black">
                        {admin.displayName?.[0] || admin.email[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{admin.displayName || 'Usuário'}</p>
                        <p className="text-xs text-slate-500 truncate">{admin.email}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => onRemoveAdmin(admin.id, admin.email)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <UserMinus size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Operation Modal (Check-in / Check-out) */}
      <AnimatePresence>
        {selectedVehicle && operationType && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden border border-slate-200 my-auto"
            >
              {/* Modal Header */}
              <div className={`p-8 text-white relative overflow-hidden ${operationType === 'check-in' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
                <div className="absolute top-0 right-0 p-12 bg-white/10 rounded-full -mr-12 -mt-12 blur-2xl"></div>
                <div className="relative z-10 flex items-center justify-between">
                  <div>
                    <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest mb-2 inline-block">
                      {operationType === 'check-in' ? 'Check-in (Saída de Viatura)' : 'Check-out (Devolução de Viatura)'}
                    </span>
                    <h3 className="text-3xl font-black tracking-tight">{selectedVehicle?.prefix}</h3>
                    <p className="opacity-90 font-bold text-lg">{selectedVehicle?.model} • <span className="font-mono">{selectedVehicle?.plate}</span></p>
                  </div>
                  <button 
                    onClick={() => onStartRecord(null, null)}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Modal Body - Multi-step Form */}
              <div className="p-8">
                <div className="flex gap-2 mb-8 bg-slate-50 p-1.5 rounded-2xl">
                  {[
                    { icon: <Siren size={18} />, label: 'Identificação' },
                    { icon: <UserRound size={18} />, label: 'Condutor' },
                    { icon: <RefreshCw size={18} />, label: 'Quilometragem' }
                  ].map((step, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentTab(idx)}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${currentTab === idx ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {step.icon}
                      <span className="hidden sm:inline">{step.label}</span>
                    </button>
                  ))}
                </div>

                <div className="min-h-[300px]">
                  {currentTab === 0 && (
                    <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Prefixo Operacional</label>
                          <SearchableSelect 
                            name="operationalPrefix"
                            defaultValue={formData.identification.operationalPrefix}
                            onChange={(val: string) => setFormData({...formData, identification: {...formData.identification, operationalPrefix: val}})}
                            options={[...prefixoVtList, ...moList]}
                            placeholder="Selecione o Prefixo..."
                            className="w-full"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Data do Registro</label>
                          <input 
                            type="date"
                            value={formData.identification.date}
                            onChange={(e) => setFormData({...formData, identification: {...formData.identification, date: e.target.value}})}
                            className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Hora do Registro</label>
                          <input 
                            type="time"
                            value={formData.identification.time}
                            onChange={(e) => setFormData({...formData, identification: {...formData.identification, time: e.target.value}})}
                            className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {currentTab === 1 && (
                    <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Motorista / Matrícula</label>
                        <SearchableSelect 
                          name="driverName"
                          defaultValue={formData.drivers.driverName}
                          onChange={(val: string) => setFormData({...formData, drivers: {...formData.drivers, driverName: val}})}
                          options={personnelList}
                          placeholder="Selecione o Motorista..."
                          className="w-full"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Modalidade de Emprego</label>
                        <select 
                          value={formData.drivers.serviceType}
                          onChange={(e) => setFormData({...formData, drivers: {...formData.drivers, serviceType: e.target.value}})}
                          className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700"
                        >
                          <option value="">Selecione o Emprego...</option>
                          {CADCHECKING_SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </motion.div>
                  )}

                  {currentTab === 2 && (
                    <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                      <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 flex items-center gap-4">
                        <div className="bg-blue-600 p-3 rounded-2xl text-white">
                          <RefreshCw size={24} />
                        </div>
                        <div>
                          <p className="text-xs font-black text-blue-600 uppercase tracking-widest">KM Anterior</p>
                          <p className="text-2xl font-black text-blue-900">{selectedVehicle?.lastMileage} <span className="text-sm font-bold opacity-60">km</span></p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Quilometragem Atual</label>
                        <input 
                          type="number"
                          placeholder="Digite a KM do painel..."
                          value={formData.mileage.currentMileage}
                          onChange={(e) => setFormData({...formData, mileage: {...formData.mileage, currentMileage: e.target.value === '' ? '' : Number(e.target.value)}})}
                          className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none font-black text-3xl text-slate-900 transition-all"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Observações (Opcional)</label>
                        <textarea 
                          placeholder="Alguma avaria ou observação sobre a viatura?"
                          value={formData.mileage.notes}
                          onChange={(e) => setFormData({...formData, mileage: {...formData.mileage, notes: e.target.value}})}
                          className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700 min-h-[100px]"
                        />
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="mt-10 flex gap-4">
                  {currentTab > 0 ? (
                    <button 
                      onClick={() => setCurrentTab(currentTab - 1)}
                      className="flex-1 py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                    >
                      Voltar
                    </button>
                  ) : (
                    <button 
                      onClick={() => onStartRecord(null, null)}
                      className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                    >
                      Cancelar
                    </button>
                  )}
                  
                  {currentTab < 2 ? (
                    <button 
                      onClick={() => setCurrentTab(currentTab + 1)}
                      className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                    >
                      Próximo Passo
                    </button>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-3 flex-[2]">
                      <button 
                        onClick={() => onSaveRecord(true)}
                        disabled={submitting || formData.mileage.currentMileage === ''}
                        className="flex-1 py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {submitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                        Apenas Salvar
                      </button>
                      <button 
                        onClick={() => onSaveRecord()}
                        disabled={submitting || formData.mileage.currentMileage === ''}
                        className={`flex-[1.5] py-4 text-white rounded-2xl font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 ${operationType === 'check-in' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                      >
                        {submitting ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                        Salvar e Enviar WhatsApp
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Vehicle Admin Modal */}
      <AnimatePresence>
        {isVehicleModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  {editingVehicle ? 'Editar Viatura' : 'Nova Viatura'}
                </h3>
                <button onClick={() => setIsVehicleModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"><X size={24} /></button>
              </div>
              <div className="p-8 space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Patrimônio</label>
                    <SearchableSelect 
                      name="prefix"
                      defaultValue={vehicleForm.prefix}
                      onChange={(val: string) => setVehicleForm({...vehicleForm, prefix: val})}
                      options={[...patrimonioVtList, ...patrimonioMoList]}
                      placeholder="Selecione o patrimônio"
                      className="w-full"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Placa</label>
                      <input 
                        type="text"
                        value={vehicleForm.plate}
                        onChange={(e) => setVehicleForm({...vehicleForm, plate: e.target.value.toUpperCase()})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Modelo / Marca</label>
                      <input 
                        type="text"
                        value={vehicleForm.model}
                        onChange={(e) => setVehicleForm({...vehicleForm, model: e.target.value})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quilometragem Inicial</label>
                  <input 
                    type="number"
                    value={vehicleForm.lastMileage}
                    onChange={(e) => setVehicleForm({...vehicleForm, lastMileage: Number(e.target.value)})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  />
                </div>
                <button 
                  onClick={onSaveVehicle}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 mt-4"
                >
                  Salvar Viatura
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        {/* Maintenance Observation Modal */}
        <AnimatePresence>
          {maintenanceModal && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
              >
                <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-amber-50">
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-100 p-2 rounded-xl text-amber-600">
                      <Wrench size={24} />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">
                      Baixar para Manutenção
                    </h3>
                  </div>
                  <button onClick={() => setMaintenanceModal(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"><X size={24} /></button>
                </div>
                <div className="p-8 space-y-6">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Viatura</p>
                    <p className="font-bold text-slate-700">{maintenanceModal.vehicle.prefix} - {maintenanceModal.vehicle.model} ({maintenanceModal.vehicle.plate})</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Observação / Motivo da Baixa</label>
                    <textarea 
                      placeholder="Descreva o motivo da manutenção (ex: Troca de óleo, pneu furado, revisão...)"
                      value={maintenanceModal.notes}
                      onChange={(e) => setMaintenanceModal({...maintenanceModal, notes: e.target.value})}
                      className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700 min-h-[120px]"
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-3">
                    <button 
                      onClick={() => setMaintenanceModal(null)}
                      className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={() => onToggleMaintenance(maintenanceModal.vehicle, maintenanceModal.notes)}
                      className="flex-[2] py-4 bg-amber-600 text-white rounded-2xl font-bold hover:bg-amber-700 transition-all shadow-lg shadow-amber-100"
                    >
                      Confirmar Baixa
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* User Admin Modal */}
      <AnimatePresence>
        {isUserModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Adicionar Administrador</h3>
                <button onClick={() => setIsUserModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"><X size={24} /></button>
              </div>
              <div className="p-8 space-y-4">
                <p className="text-slate-500 text-sm font-medium">O usuário deve ter feito login no sistema pelo menos uma vez para ser promovido a administrador.</p>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail do Usuário</label>
                  <input 
                    type="email"
                    placeholder="exemplo@gmail.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  />
                </div>
                <button 
                  onClick={onAddAdmin}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg mt-4"
                >
                  Promover a Administrador
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- CadChecking Sub-components ---

function VehicleCard({ vehicle, isAdmin, currentUserEmail, onStartRecord, onToggleMaintenance, onEdit, onDelete }: any) {
  const isAvailable = vehicle.status === 'available';
  const isInUse = vehicle.status === 'in_use';
  const isMaintenance = vehicle.status === 'maintenance';
  
  // Somente quem fez o check-in pode fazer o check-out, ou se for admin
  const canCheckOut = isAdmin || (vehicle.currentDriverEmail === currentUserEmail);

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-white rounded-[2.5rem] p-6 shadow-sm border-2 transition-all group relative overflow-hidden ${
        isAvailable ? 'border-slate-100 hover:border-emerald-200' : 
        isInUse ? 'border-blue-100 bg-blue-50/30' : 
        'border-amber-100 bg-amber-50/30'
      }`}
    >
      {/* Status Badge */}
      <div className="flex items-center justify-between mb-4">
        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
          isAvailable ? 'bg-emerald-100 text-emerald-700' : 
          isInUse ? 'bg-blue-100 text-blue-700' : 
          'bg-amber-100 text-amber-700'
        }`}>
          {isAvailable ? 'Disponível' : isInUse ? 'Em Uso' : 'Manutenção'}
        </span>
        <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
          Pat: {vehicle?.prefix}
        </span>
      </div>

      {/* Vehicle Info */}
      <div className="mb-6">
        <h4 className="text-xl font-black text-slate-900 tracking-tight leading-tight mb-1">{vehicle.model}</h4>
        <p className="text-2xl font-mono font-black text-blue-600 tracking-tighter">{vehicle.plate}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-50 p-3 rounded-2xl">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Última KM</p>
          <p className="text-sm font-bold text-slate-700">{vehicle.lastMileage} km</p>
        </div>
        <div className="bg-slate-50 p-3 rounded-2xl">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Motorista</p>
          <p className="text-sm font-bold text-slate-700 truncate">{vehicle.currentDriver || '---'}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {isAvailable && (
          <button 
            onClick={() => onStartRecord(vehicle, 'check-in')}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95"
          >
            <LogIn size={18} />
            Check-in
          </button>
        )}
        {isInUse && (
          <div className="flex-1 flex flex-col gap-1">
            <button 
              onClick={() => canCheckOut && onStartRecord(vehicle, 'check-out')}
              disabled={!canCheckOut}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95 ${
                canCheckOut 
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-100' 
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
              }`}
            >
              <LogOut size={18} />
              Check-out
            </button>
            {!canCheckOut && (
              <p className="text-[9px] text-red-500 font-bold text-center">
                Apenas o motorista que retirou pode devolver
              </p>
            )}
          </div>
        )}
        {isMaintenance && (
          <div className="flex-1 py-3 bg-amber-100 text-amber-700 rounded-2xl font-bold text-center text-sm flex items-center justify-center gap-2">
            <AlertCircle size={18} />
            Em Manutenção
          </div>
        )}
        
        {isAdmin && (
          <button 
            onClick={() => onToggleMaintenance(vehicle)}
            title={isMaintenance ? "Retirar da Manutenção" : "Colocar em Manutenção"}
            className={`p-3 rounded-2xl transition-all border-2 ${
              isMaintenance ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-400 border-slate-100 hover:border-amber-200 hover:text-amber-600'
            }`}
          >
            <SettingsIcon size={20} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

function CadcheckingHistoryItem({ record, isExpanded, onToggle, onResendWhatsApp }: any) {
  const isCheckIn = record.type === 'check-in';
  const isMaintenance = record.type.includes('maintenance');
  
  const date = record.timestamp?.toDate ? record.timestamp.toDate() : new Date(record.timestamp);
  const formattedDate = format(date, "dd 'de' MMMM", { locale: ptBR });
  const formattedTime = format(date, "HH:mm");

  return (
    <div className={`bg-white rounded-3xl border transition-all overflow-hidden ${isExpanded ? 'border-blue-200 shadow-lg' : 'border-slate-100 hover:border-slate-200 shadow-sm'}`}>
      <div 
        onClick={onToggle}
        className="p-5 flex items-center justify-between cursor-pointer"
      >
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
            isCheckIn ? 'bg-blue-50 text-blue-600' : 
            isMaintenance ? 'bg-amber-50 text-amber-600' : 
            'bg-emerald-50 text-emerald-600'
          }`}>
            {isCheckIn ? <LogIn size={24} /> : isMaintenance ? <AlertCircle size={24} /> : <LogOut size={24} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
                Pat: {record?.identification?.prefix}
              </span>
              <span className="text-xs font-bold text-slate-400">•</span>
              <span className="text-xs font-black text-blue-600 font-mono">{record.identification.plate}</span>
            </div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              {isCheckIn ? 'Saída (Check-in)' : isMaintenance ? 'Manutenção' : 'Retorno (Check-out)'} • {formattedDate} às {formattedTime}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-bold text-slate-900">{record.drivers.driverName || 'SISTEMA'}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{record.drivers.serviceType || '---'}</p>
          </div>
          <ChevronRight className={`text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} size={20} />
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-slate-50 bg-slate-50/50 p-6"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Viatura</p>
                <p className="text-sm font-bold text-slate-700">{record?.identification?.model}</p>
                <p className="text-xs text-slate-500">{record?.identification?.operationalPrefix || '---'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quilometragem</p>
                <p className="text-sm font-bold text-slate-700">{record?.mileage?.currentMileage} km</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Operador</p>
                <p className="text-sm font-bold text-slate-700">{record.userName || '---'}</p>
                <p className="text-xs text-slate-500">{record.userEmail}</p>
              </div>
            </div>

            {record.mileage.notes && (
              <div className="bg-white p-4 rounded-2xl border border-slate-100 mb-6">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Observações</p>
                <p className="text-sm text-slate-600 italic">"{record.mileage.notes}"</p>
              </div>
            )}

            {!isMaintenance && (
              <button 
                onClick={() => onResendWhatsApp(record)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95"
              >
                <ExternalLink size={18} />
                Reenviar para WhatsApp
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PDFPreviewModal({ url, onClose }: { url: string, onClose: () => void }) {
  const openInNewTab = () => {
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden border border-slate-200"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Visualização do Relatório</h3>
            <p className="text-sm text-slate-500">Confira as informações antes de baixar ou imprimir.</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={openInNewTab}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-2xl font-bold hover:bg-slate-50 transition-all shadow-sm active:scale-95"
              title="Abrir em uma nova aba do navegador"
            >
              <LayoutDashboard size={18} className="rotate-45" />
              Nova Aba
            </button>
            <a 
              href={url} 
              download="relatorio.pdf"
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg hover:shadow-blue-200 active:scale-95"
            >
              <FileDown size={18} />
              Baixar PDF
            </a>
            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            >
              <X size={24} />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-100 p-4 overflow-hidden">
          <object 
            data={url} 
            type="application/pdf"
            className="w-full h-full rounded-xl border border-slate-200 shadow-inner bg-white"
          >
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-white rounded-xl">
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                <Info className="text-blue-500" size={40} />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-2">Visualização Bloqueada</h4>
              <p className="text-slate-600 mb-2 max-w-md">
                O Chrome impediu a exibição direta do PDF nesta janela por segurança.
              </p>
              <p className="text-slate-400 text-sm mb-8">
                Você pode abrir o relatório em uma nova aba ou baixá-lo agora mesmo.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={openInNewTab}
                  className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                >
                  Abrir em Nova Aba
                </button>
                <a 
                  href={url} 
                  download="relatorio.pdf"
                  className="px-8 py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                >
                  Baixar Arquivo
                </a>
              </div>
            </div>
          </object>
        </div>
      </motion.div>
    </div>
  );
}
