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
  Wrench,
  ChevronDown,
  Sparkles,
  Settings,
  Lightbulb,
  Camera,
  MessageCircle,
  ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const APP_BLUE_DARK = [30, 58, 138];
const logoPM = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Bras%C3%A3o_da_PMPE.svg/1200px-Bras%C3%A3o_da_PMPE.svg.png';

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
  CADASTRO_VTR_SERVICE_TYPES,
  EQUIPAMENTOS_VTR,
  PARTES_INTERNAS,
  PARTES_EXTERNAS,
  LUZES_TRASEIRAS
} from './constants';
import { parseChecklistDescription, extractLicensePlateFromImage } from './services/geminiService';
import { Vehicle, RecordEntry, UserProfile, ChecklistData } from './types';

// --- Constants ---
const LOGO_14BPM_URL = "https://i.pinimg.com/originals/28/33/bd/2833bdc504f4fc4f3cb3c2817a664fc9.png";
const LOGO_SISCOPI_URL = "https://i.pinimg.com/originals/87/a3/ed/87a3ed9f8a7288c126367864ac2a7663.png";
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

const compressImage = async (base64: string, maxWidth = 600, maxHeight = 600, quality = 0.5): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
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

/**
 * Get a proxied URL for an image to avoid CORS and hotlinking issues.
 * Uses images.weserv.nl as primary proxy (very stable).
 */
const getProxiedUrl = (url: string) => {
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&n=-1`;
};

const getProxiedLogoUrl = () => {
  return getProxiedUrl(LOGO_14BPM_URL);
};

const getProxiedSisCOpILogoUrl = () => {
  return getProxiedUrl(LOGO_SISCOPI_URL);
};

const handleLogoError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
  const target = e.target as HTMLImageElement;
  const currentSrc = target.src;
  const originalUrl = LOGO_14BPM_URL;
  
  if (currentSrc.includes('weserv.nl')) {
    target.src = `https://corsproxy.io/?${encodeURIComponent(originalUrl)}`;
  } else if (currentSrc.includes('corsproxy.io')) {
    target.src = `https://api.allorigins.win/raw?url=${encodeURIComponent(originalUrl)}`;
  } else if (currentSrc !== originalUrl && !currentSrc.includes('allorigins')) {
    target.src = `${originalUrl}?cb=${Date.now()}`;
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

const SummaryItem = ({ label, value }: { label: string, value: string | string[] }) => (
  <div className="flex flex-col gap-1 p-3 bg-blue-50 rounded-2xl border border-blue-100">
    <span className="text-[9px] font-bold uppercase opacity-40 text-blue-600">{label}</span>
    <span className="text-sm font-medium text-blue-900 truncate">
      {Array.isArray(value) ? value.join(', ') : value || '---'}
    </span>
  </div>
);

const ChecklistSearchableSelect = ({ 
  label, 
  value, 
  onChange, 
  options, 
  placeholder = "Selecione...", 
  rightElement = null,
  variant = 'default'
}: { 
  label: string, 
  value: string, 
  onChange: (val: string) => void, 
  options: string[],
  placeholder?: string,
  rightElement?: React.ReactNode,
  variant?: 'default' | 'dark' | 'blue'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => 
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getLabelStyles = () => {
    if (variant === 'dark') return 'text-white/70';
    if (variant === 'blue') return 'text-blue-600/60';
    return 'opacity-50';
  };

  const getInputStyles = () => {
    if (variant === 'dark') return 'bg-white/10 border-white/20 text-white focus:ring-white/20 placeholder:text-white/40';
    if (variant === 'blue') return 'bg-white border-blue-200 text-blue-900 focus:ring-blue-500/20 placeholder:text-blue-400';
    return 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-blue-500/20';
  };

  const getIconStyles = () => {
    if (variant === 'dark') return 'text-white';
    return 'text-blue-600';
  };

  return (
    <div className={`space-y-2 relative ${isOpen ? 'z-[100]' : 'z-10'}`} ref={containerRef}>
      <div className="flex items-center justify-between">
        <label className={`text-xs font-bold uppercase ${getLabelStyles()}`}>{label}</label>
        {rightElement}
      </div>
      <div className="relative">
        <input 
          type="text"
          className={`w-full p-3 pr-10 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-all font-medium ${getInputStyles()}`}
          placeholder={placeholder}
          value={isOpen ? searchTerm : value}
          onChange={(e) => {
            const val = e.target.value;
            setSearchTerm(val);
            onChange(val);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearchTerm(value);
          }}
        />
        <div 
          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${getIconStyles()} ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 space-y-1 overflow-hidden"
          >
            <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
              {filteredOptions.length > 0 ? (
                filteredOptions.slice(0, 100).map((opt, i) => (
                  <button
                    key={`${opt}-${i}`}
                    type="button"
                    className="w-full text-left p-3 hover:bg-blue-50 rounded-xl text-sm transition-colors font-medium text-slate-700"
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                      setSearchTerm("");
                    }}
                  >
                    {opt}
                  </button>
                ))
              ) : (
                <p className="text-xs text-center py-6 text-slate-400 font-medium">Nenhum resultado encontrado</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null);
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

  const [activeTab, setActiveTab] = useState<'dashboard' | 'form' | 'history' | 'reports' | 'settings' | 'cadchecking' | 'checklist'>('dashboard');
  const [formType, setFormType] = useState<'linha' | 'viatura' | 'mo' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);

  // Lists state
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [personnelList, setPersonnelList] = useState<string[]>([]);
  const [prefixoVtList, setPrefixoVtList] = useState<string[]>([]);
  const [patrimonioVtList, setPatrimonioVtList] = useState<string[]>([]);
  const [moList, setMoList] = useState<string[]>([]);
  const [patrimonioMoList, setPatrimonioMoList] = useState<string[]>([]);
  const [cityList, setCityList] = useState<string[]>([]);
  const [funcaoLinhaList, setFuncaoLinhaList] = useState<string[]>([]);
  const [horarioLinhaList, setHorarioLinhaList] = useState<string[]>([]);
  const [tipoServicoList, setTipoServicoList] = useState<string[]>([]);
  const [tipoServicoVtList, setTipoServicoVtList] = useState<string[]>([]);
  const [adminList, setAdminList] = useState<string[]>(["demetriomarques@gmail.com"]);
  const [authorizedList, setAuthorizedList] = useState<string[]>([]);
  
  // --- CadChecking State ---
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [cadcheckingHistory, setCadcheckingHistory] = useState<RecordEntry[]>([]);
  const [standaloneHistory, setStandaloneHistory] = useState<RecordEntry[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [operationType, setOperationType] = useState<'check-out' | 'check-in' | null>(null);
  const [cadcheckingView, setCadcheckingView] = useState<'list' | 'history' | 'admin'>('list');
  const [cadcheckingSearchTerm, setCadcheckingSearchTerm] = useState('');
  const [cadcheckingStatusFilter, setCadcheckingStatusFilter] = useState<'all' | 'available' | 'in_use' | 'maintenance'>('all');
  const [cadcheckingHistoryFilter, setCadcheckingHistoryFilter] = useState<'all' | 'check-out' | 'check-in' | 'maintenance'>('all');
  const [cadcheckingDateFilter, setCadcheckingDateFilter] = useState({
    start: format(new Date(), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
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
  const [isExtractingPlate, setIsExtractingPlate] = useState(false);
  const [cadcheckingFormData, setCadcheckingFormData] = useState<any>({
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
    },
    checklist: {
      mapaDiario: 'SIM',
      equipamentos: [],
      luzFarolAlto: 'Todos funcionam',
      luzFarolBaixo: 'Todos funcionam',
      luzLanterna: 'Todos funcionam',
      luzFreioLanternaTraseira: ['TODAS FUNCIONANDO'],
      luzPlaca: 'Funciona',
      pneus: 'Novo',
      sistemaFreio: 'Freio funcionando',
      oleoMotor: 'Nível Normal',
      proxTrocaOleoKm: '',
      partesInternas: ['SEM ALTERAÇÃO'],
      sistemaTracao: 'Kit de tração em condições',
      partesExternas: ['Sem Alteração'],
      limpeza: 'SIM',
      descricaoAlteracoes: '',
      fotos: []
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
        const data = doc.data() as Vehicle;
        vehicleList.push({ id: doc.id, ...data } as Vehicle);
      });
      console.log(`[CadChecking] Vehicles updated: ${vehicleList.length} items`);
      
      // Filter out inactive vehicles for the main UI
      const activeVehicles = vehicleList.filter(v => v.status !== 'inactive');
      setVehicles(activeVehicles);
    }, (err) => {
      console.error("Error fetching vehicles:", err);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const constraints: any[] = [orderBy('timestamp', 'desc'), limit(50)];
    
    const q = query(collection(db, 'standalone_checklists'), ...constraints);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const historyData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStandaloneHistory(historyData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'standalone_checklists');
    });
    return () => unsubscribe();
  }, [user, isAdmin]);

  // Bootstrap vehicles if empty and user is admin
  useEffect(() => {
    if (isAdmin && vehicles.length === 0 && !loading && settingsLoaded && patrimonioVtList.length > 0) {
      console.log("[CadChecking] Fleet empty or settings updated, triggering bootstrap...");
      bootstrapVehicles();
    }
  }, [isAdmin, vehicles.length, loading, settingsLoaded, patrimonioVtList, patrimonioMoList]);

  // CadChecking History listener
  useEffect(() => {
    if (!user || activeTab !== 'cadchecking' || cadcheckingView !== 'history') return;
    
    const constraints: any[] = [orderBy('timestamp', 'desc'), limit(50)];
    
    const q = query(
      collection(db, 'checklists'), 
      ...constraints
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recordList: RecordEntry[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as RecordEntry;
        recordList.push({ id: doc.id, ...data } as RecordEntry);
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
        // Standardize ID: remove spaces and dashes
        const vehicleId = vehicleForm.plate.replace(/[\s-]/g, '').toUpperCase();
        await setDoc(doc(db, 'vehicles', vehicleId), { ...vehicleForm, id: vehicleId });
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
    if (!force && isBootstrapping.current) {
      return;
    }
    
    isBootstrapping.current = true;
    if (force) setIsSyncing(true);
    
    // Always use the latest lists from state (which come from settings/lists in Firestore)
    const allPatrimonio = [
      ...patrimonioVtList.map(item => ({ item, type: 'vt' })),
      ...patrimonioMoList.map(item => ({ item, type: 'mo' }))
    ];
    console.log(`[CadChecking] Starting sync of ${allPatrimonio.length} items (VTs and Motos) from SisCOpI settings...`);
    
    const currentPlateIds = new Set<string>();
    
    try {
      for (const entry of allPatrimonio) {
        const { item: s, type } = entry;
        // Use a more robust split that only looks for dashes surrounded by spaces
        // This avoids splitting prefixes or plates that contain internal dashes like "V-1234" or "ABC-1234"
        const parts = s.split(/\s+-\s+/).map(p => p.trim());
        
        if (parts.length >= 2) {
          const prefix = parts[0];
          const plate = parts[1];
          const model = parts[2] || (type === 'mo' ? 'MOTO' : 'Viatura');
          const vehicleId = plate.replace(/[\s-]/g, '').toUpperCase();
          currentPlateIds.add(vehicleId);
          
          const docRef = doc(db, 'vehicles', vehicleId);
          const snap = await getDoc(docRef);
          
          let correctedModel = model;
          const upperModel = model.toUpperCase();
          
          // Standardization logic
          if (upperModel.includes('HILUX') || upperModel.includes('HILLUX')) {
            correctedModel = 'TOYOTA/HILUX';
          } else if (upperModel === 'RANGER' || upperModel.includes('RANGER')) {
            correctedModel = 'FORD/RANGER';
          } else if (upperModel === 'DUSTER' || upperModel.includes('DUSTER')) {
            correctedModel = 'RENAULT/DUSTER';
          } else if (upperModel === 'S10' || upperModel === 'S-10') {
            correctedModel = 'CHEVROLET/S10';
          } else if (upperModel === 'ARGO') {
            correctedModel = 'FIAT/ARGO';
          } else if (upperModel === 'POLO') {
            correctedModel = 'VW/POLO';
          } else if (upperModel === 'ONIX') {
            correctedModel = 'CHEVROLET/ONIX';
          } else if (upperModel === 'L200' || upperModel.includes('L 200') || upperModel.includes('L-200')) {
            correctedModel = 'MITSUBISHI/L200';
          } else if (type === 'mo' && (upperModel === 'MOTO' || upperModel === 'MOTOCICLETA')) {
            correctedModel = 'MOTOCICLETA';
          }

          if (snap.exists()) {
            const existing = snap.data();
            // Restore if inactive, or keep current status
            const status = existing.status === 'inactive' ? 'available' : existing.status;
            await updateDoc(docRef, { 
              prefix, 
              model: correctedModel,
              plate,
              status
            });
          } else {
            await setDoc(docRef, { 
              id: vehicleId,
              prefix,
              plate,
              model: correctedModel,
              status: 'available',
              lastMileage: 0
            });
          }
        }
      }

      // Deactivate vehicles not in the current SisCOpI config
      const querySnapshot = await getDocs(collection(db, 'vehicles'));
      for (const vehicleDoc of querySnapshot.docs) {
        const v = vehicleDoc.data();
        if (!currentPlateIds.has(vehicleDoc.id) && v.status !== 'inactive') {
          console.log(`[CadChecking] Deactivating vehicle no longer in config: ${v.prefix} (${v.plate})`);
          await updateDoc(vehicleDoc.ref, { status: 'inactive' });
        }
      }

      if (force) addNotification("Frota (Viaturas e Motos) sincronizada!", "success");
    } catch (err) {
      console.error("[CadChecking] Sync error:", err);
      handleFirestoreError(err, OperationType.WRITE, 'vehicles');
      if (force) addNotification("Erro ao sincronizar frota.", "error");
    } finally {
      setIsSyncing(false);
      isBootstrapping.current = false;
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
          data: todayStr,
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
    
    // Somente o motorista que retirou ou o administrador pode fazer o retorno
    if (type === 'check-in' && !isAdmin && user?.email !== vehicle.currentDriverEmail) {
      addNotification("Apenas o motorista que realizou a saída ou um administrador pode realizar o retorno.", "error");
      return;
    }
    
    setSubmitting(true);
    let lastCheckOut: RecordEntry | null = null;
    
    if (type === 'check-in') {
      try {
        const queryConstraints: any[] = [
          where('vehicleId', '==', vehicle.id),
          where('type', '==', 'check-out')
        ];

        // Add ordering and limit
        queryConstraints.push(orderBy('timestamp', 'desc'));
        queryConstraints.push(limit(1));

        const q = query(collection(db, 'checklists'), ...queryConstraints);
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          lastCheckOut = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as RecordEntry;
        }
      } catch (err) {
        console.error("Error fetching last check-out:", err);
      }
    }
    setSelectedVehicle(vehicle);
    setOperationType(type);
    // Para check-in (Retorno), abre direto na tela de quilometragem (aba 2)
    setCurrentCadcheckingTab(type === 'check-in' ? 2 : 0);
    setCadcheckingFormData({
      identification: {
        prefix: vehicle.prefix || 'RESERVA',
        operationalPrefix: lastCheckOut?.identification?.operationalPrefix || '',
        plate: vehicle.plate,
        model: vehicle.model,
        date: format(new Date(), 'yyyy-MM-dd'),
        time: format(new Date(), 'HH:mm')
      },
      drivers: {
        driverName: lastCheckOut?.drivers?.driverName || '',
        serviceType: lastCheckOut?.drivers?.serviceType || ''
      },
      mileage: {
        currentMileage: '',
        notes: ''
      },
      checklist: {
        mapaDiario: 'SIM',
        equipamentos: [],
        luzFarolAlto: 'Todos funcionam',
        luzFarolBaixo: 'Todos funcionam',
        luzLanterna: 'Todos funcionam',
        luzFreioLanternaTraseira: ['TODAS FUNCIONANDO'],
        luzPlaca: 'Funciona',
        pneus: 'Novo',
        sistemaFreio: 'Freio funcionando',
        oleoMotor: 'Nível Normal',
        proxTrocaOleoKm: '',
        partesInternas: ['SEM ALTERAÇÃO'],
        sistemaTracao: 'Kit de tração em condições',
        partesExternas: ['Sem Alteração'],
        limpeza: 'SIM',
        descricaoAlteracoes: '',
        fotos: []
      },
      source: 'cadchecking'
    });
    setCadcheckingView('record');
    setSubmitting(false);
  };

  const formatWhatsAppMessage = (record: RecordEntry) => {
    // Check if it's a Cadastro VTR record
    const isCadastroVTR = record.source === 'cadchecking' || record.source === 'standalone_checklist';
    const isExit = record.type === 'check-out' || record.type === 'maintenance-out';
    const isIn = record.type === 'check-in' || record.type === 'maintenance-in';
    const typeLabel = isExit ? 'SAÍDA' : 'RETORNO';
    const kmLabel = isExit ? 'Km inic' : 'Km final';
    const hourLabel = isExit ? 'Hora que armou' : 'Hora que desarmou';
    
    // Formatting plate (removing spaces as requested: PBG5G37)
    const plateFormatted = record.identification?.plate?.replace(/\s/g, '').toUpperCase() || '---';
    
    // Formatting driver name to include the separator (e.g. 2° TEN FLORO / 126757-4)
    let driverFormatted = record.drivers?.driverName || '---';
    if (driverFormatted !== '---') {
      const matriculaMatch = driverFormatted.match(/(\s)(\d{5,})/);
      if (matriculaMatch) {
        driverFormatted = driverFormatted.replace(/(\s)(\d{5,})/, ' / $2');
      } else {
        // Fallback for names already formatted or with different space patterns
        driverFormatted = driverFormatted.replace(/ (\d)/, ' / $1');
      }
    }

    // Formatting date to DD/MM/YYYY
    let dateFormatted = record.identification?.date || '---';
    if (dateFormatted.includes('-')) {
      const [y, m, d] = dateFormatted.split('-');
      dateFormatted = `${d}/${m}/${y}`;
    }

    if (isCadastroVTR) {
      let title = record.source === 'cadchecking' ? 'CADASTRO VTR' : 'CHECKLIST VTR';
      let msg = `*${title} - ${typeLabel}*\n\n`;
      if (record.identification?.prefix) msg += `🚩 *Patrimônio:* ${record.identification.prefix}\n`;
      if (plateFormatted !== '---') msg += `🔢 *Placa:* ${plateFormatted}\n`;
      if (record.identification?.operationalPrefix) msg += `🏷️ *Prefixo Operacional:* ${record.identification.operationalPrefix}\n`;
      if (record.drivers?.serviceType) msg += `🛞 *Tipo de Emprego:* ${record.drivers.serviceType}\n`;
      if (record.identification?.model) msg += `🚔 *Modelo da VTR:* ${record.identification.model}\n`;
      if (record.mileage?.currentMileage !== undefined && record.mileage?.currentMileage !== '') msg += `⏲️ *Quilometragem:* ${record.mileage.currentMileage}\n`;
      if (dateFormatted !== '---') msg += `📅 *Data:* ${dateFormatted}\n`;
      if (record.identification?.time) msg += `⏰ *Hora:* ${record.identification.time}\n`;
      if (driverFormatted !== '---') msg += `👮 *Condutor e Matrícula:* ${driverFormatted}\n`;

      // Conditional details if present
      if (record.checklist?.descricaoAlteracoes) {
        msg += `\n📝 *Alterações:* ${record.checklist.descricaoAlteracoes}`;
      }
      if (record.mileage?.notes) {
        msg += `\n📝 *Observações:* ${record.mileage.notes}`;
      }
      
      msg += `\n\n_Gerado via SisCOpI - 14º BPM_`;
      return msg;
    }

    // Standard Checklist WhatsApp Format
    let message = `*CHECKLIST ${isExit ? 'SAÍDA' : 'RETORNO'}*\n\n`;
    message += `🚩 *Prefixo:* ${record.identification?.prefix || '---'}\n`;
    message += `🔢 *Placa:* ${plateFormatted}\n`;
    if (record.identification?.operationalPrefix) {
      message += `🏷️ *P. Operacional:* ${record.identification.operationalPrefix}\n`;
    }
    message += `🚔 *Modelo:* ${record.identification?.model || '---'}\n`;
    message += `📅 *Data:* ${dateFormatted}\n`;
    message += `⏰ *Hora:* ${record.identification?.time || '---'}\n\n`;

    message += `👮 *Condutor:* ${driverFormatted}\n`;
    message += `🛞 *Emprego:* ${record.drivers?.serviceType || '---'}\n`;
    message += `⏲️ *${kmLabel}:* ${record.mileage?.currentMileage || '---'} km\n\n`;

    if (record.checklist) {
      const c = record.checklist;
      message += `*ESTADO GERAL*\n`;
      message += `📑 *Mapa Diário:* ${c.mapaDiario || '---'}\n`;
      message += `✨ *Limpeza:* ${c.limpeza || '---'}\n`;
      message += `🛢️ *Óleo Motor:* ${c.oleoMotor || '---'}\n`;
      message += `🛞 *Pneus:* ${c.pneus || '---'}\n`;
      message += `🛑 *Freio:* ${c.sistemaFreio || '---'}\n`;
      
      if (c.luzFarolAlto) {
        message += `\n*ILUMINAÇÃO*\n`;
        message += `💡 *Farol Alto:* ${c.luzFarolAlto || '---'}\n`;
        message += `💡 *Farol Baixo:* ${c.luzFarolBaixo || '---'}\n`;
        message += `💡 *Lanterna/Pisca:* ${c.luzLanterna || '---'}\n`;
        message += `💡 *Luz de Placa:* ${c.luzPlaca || '---'}\n`;
      }
      
      if (c.descricaoAlteracoes) {
        message += `\n*DESCRIÇÃO DE ALTERAÇÕES*\n${c.descricaoAlteracoes}\n`;
      }
    }

    message += `\n_Gerado via SisCOpI - 14º BPM_`;
    return message;
  };

  const generateDetailedChecklistPDF = async (record: RecordEntry) => {
    setSubmitting(true);
    try {
      console.log("Generating detailed PDF for record:", record.id);
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFillColor(APP_BLUE_DARK[0], APP_BLUE_DARK[1], APP_BLUE_DARK[2]);
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      if (logoPM) {
        try {
          doc.addImage(logoPM, 'PNG', 10, 5, 25, 25);
        } catch (e) {
          console.warn("Failed to add logo to PDF", e);
        }
      }

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      const isCadastroVTR = record.source === 'cadchecking' || record.source === 'standalone_checklist';
      doc.text(isCadastroVTR ? 'CADASTRO VTR' : 'CHECKLIST DE VIATURA', pageWidth / 2, 15, { align: 'center' });
      
      doc.setFontSize(10);
      doc.text('14º BPM - SERRA TALHADA', pageWidth / 2, 22, { align: 'center' });
      doc.text('POLÍCIA MILITAR DE PERNAMBUCO', pageWidth / 2, 28, { align: 'center' });
      
      let timestamp = new Date();
      try {
        if (record.timestamp?.toDate) {
          timestamp = record.timestamp.toDate();
        } else if (record.timestamp) {
          const t = new Date(record.timestamp);
          if (!isNaN(t.getTime())) {
            timestamp = t;
          }
        }
      } catch (e) {
        console.warn("Error parsing record timestamp", e);
      }
      
      doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, 35, { align: 'center' });

      let currentY = 50;
      const addSection = (title: string, data: [string, string][]) => {
        if (currentY > 260) {
          doc.addPage();
          currentY = 20;
        }
        doc.setFontSize(12);
        doc.setTextColor(APP_BLUE_DARK[0], APP_BLUE_DARK[1], APP_BLUE_DARK[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(title.toUpperCase(), 14, currentY);
        currentY += 5;
        
        (doc as any).autoTable({
          startY: currentY,
          head: [['Campo', 'Informação']],
          body: data,
          theme: 'striped',
          headStyles: { fillColor: APP_BLUE_DARK },
          styles: { fontSize: 9, cellPadding: 3 },
          margin: { left: 14, right: 14 },
          didDrawPage: (data: any) => {
            currentY = data.cursor.y;
          }
        });
        currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 15 : currentY + 30;
      };

      // Identificação e Dados Gerais
      const isOut = record.type === 'check-out' || record.type === 'maintenance-out';
      const ident = (record.identification || {}) as any;
      const drv = (record.drivers || {}) as any;
      
      let driverFormatted = drv.driverName || '---';
      if (typeof driverFormatted === 'string') {
        const matriculaMatch = driverFormatted.match(/(\s)(\d{5,})/);
        if (matriculaMatch) {
          driverFormatted = driverFormatted.replace(/(\s)(\d{5,})/, ' / $2');
        }
      }

      if (isCadastroVTR) {
        // Formato específico para Cadastro VTR seguindo a ordem solicitada
        const cadcheckingData: [string, string][] = [
          ['Pat', ident.prefix || '---'],
          ['Placa', (ident.plate || '').replace(/\s/g, '').toUpperCase() || '---'],
          ['Prefixo', ident.operationalPrefix || '---'],
          ['Emprego', drv.serviceType || '---'],
          ['Vtr', ident.model || '---'],
          [isOut ? 'Km inic' : 'Km final', `${record.mileage?.currentMileage || 0}`],
          ['Data', format(timestamp, 'dd/MM/yyyy')],
          [isOut ? 'Hora que armou' : 'Hora que desarmou', ident.time || '---'],
          ['Condutor/Mat', driverFormatted]
        ];

        addSection('Dados do Registro', cadcheckingData);
      } else {
        // Formato padrão para outros checklists
        const identificationData: [string, string][] = [
          ['Viatura', ident.prefix || '---'],
          ['Placa', (ident.plate || '').replace(/\s/g, '').toUpperCase() || '---'],
          ['Modelo', ident.model || '---']
        ];
        
        if (ident.operationalPrefix) {
          identificationData.push(['Prefixo', ident.operationalPrefix]);
        }
        
        identificationData.push(['Data', format(timestamp, 'dd/MM/yyyy')]);
        identificationData.push(['Hora', ident.time || '---']);
        identificationData.push(['Tipo de Registro', isOut ? 'SAÍDA' : 'RETORNO']);

        addSection('Identificação', identificationData);

        addSection('Responsável', [
          ['Condutor/Mat', driverFormatted],
          ['Emprego', drv.serviceType || '---'],
          ['Quilometragem', `${record.mileage?.currentMileage || 0} km`]
        ]);
      }

      // Observações (Always show if present)
      if (record.checklist?.descricaoAlteracoes || record.mileage?.notes) {
        const obsData: [string, string][] = [];
        if (record.checklist?.descricaoAlteracoes) {
          obsData.push(['Descrição de Alterações', record.checklist.descricaoAlteracoes]);
        }
        if (record.mileage?.notes) {
          obsData.push(['Observações', record.mileage.notes]);
        }
        addSection('Observações', obsData);
      }

      if (record.checklist && !isCadastroVTR) {
        const c = record.checklist;
        
        // Estado Técnico
        addSection('Estado Técnico', [
          ['Mapa Diário', c.mapaDiario],
          ['Limpeza', c.limpeza],
          ['Equipamentos', c.equipamentos.join(', ') || 'Nenhum']
        ]);

        // Iluminação
        addSection('Iluminação', [
          ['Farol Alto', c.luzFarolAlto],
          ['Farol Baixo', c.luzFarolBaixo],
          ['Lanterna/Pisca', c.luzLanterna],
          ['Luz de Placa', c.luzPlaca],
          ['Luz de Freio/Traseira', c.luzFreioLanternaTraseira.join(', ')]
        ]);

        // Mecânica
        addSection('Mecânica e Pneus', [
          ['Pneus', c.pneus],
          ['Sistema de Freio', c.sistemaFreio],
          ['Óleo Motor', c.oleoMotor],
          ['Próx. Troca Óleo', c.proxTrocaOleoKm ? `${c.proxTrocaOleoKm} km` : '---'],
          ['Sistema de Tração', c.sistemaTracao || '---']
        ]);

        // Conservação
        addSection('Conservação', [
          ['Partes Internas', c.partesInternas.join(', ')],
          ['Partes Externas', c.partesExternas.join(', ')]
        ]);

        // Fotos
        if (c.fotos && c.fotos.length > 0) {
          if (currentY > 200) {
            doc.addPage();
            currentY = 20;
          }
          
          doc.setFontSize(12);
          doc.setTextColor(APP_BLUE_DARK[0], APP_BLUE_DARK[1], APP_BLUE_DARK[2]);
          doc.setFont('helvetica', 'bold');
          doc.text('FOTOS ANEXADAS', 14, currentY);
          currentY += 10;

          const imgWidth = 80;
          const imgHeight = 60;
          const margin = 14;
          const spacing = 10;

          c.fotos.forEach((foto, index) => {
            if (currentY + imgHeight > 280) {
              doc.addPage();
              currentY = 20;
            }
            const x = index % 2 === 0 ? margin : margin + imgWidth + spacing;
            try {
              const format = foto.includes('png') ? 'PNG' : 'JPEG';
              doc.addImage(foto, format, x, currentY, imgWidth, imgHeight);
            } catch (err) {
              console.error("Error adding image to PDF:", err);
            }
            
            if (index % 2 !== 0 || index === c.fotos.length - 1) {
              currentY += imgHeight + spacing;
            }
          });
        }
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount} - SisCOpI 14º BPM`, pageWidth / 2, 285, { align: 'center' });
      }

      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setShowPdfPreview(true);
    } catch (error) {
      console.error("Error generating detailed PDF:", error);
      addNotification("Erro ao gerar o PDF detalhado.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendWhatsApp = (record: RecordEntry) => {
    const message = formatWhatsAppMessage(record);
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    
    try {
      const w = window.open(whatsappUrl, '_blank');
      if (!w) {
        window.location.href = whatsappUrl;
      }
    } catch (e) {
      window.location.href = whatsappUrl;
    }
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
        data: cadcheckingFormData.identification.date || todayStr,
        vehicleId: selectedVehicle.id,
        type: operationType,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(), // For compatibility with main history
        userEmail: user.email,
        userName: user.displayName || user.email?.split('@')[0],
        unidade: '14º BPM', // Consistent with other records
        identification: cadcheckingFormData.identification,
        drivers: cadcheckingFormData.drivers,
        mileage: cadcheckingFormData.mileage,
        checklist: cadcheckingFormData.checklist,
        source: 'cadchecking'
      });
      // Update vehicle status
      await updateDoc(doc(db, 'vehicles', selectedVehicle.id), {
        status: operationType === 'check-out' ? 'in_use' : 'available',
        lastMileage: cadcheckingFormData.mileage.currentMileage,
        currentDriver: operationType === 'check-out' ? cadcheckingFormData.drivers.driverName : null,
        currentDriverEmail: operationType === 'check-out' ? user.email : null
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
          timestamp: new Date(),
          source: 'cadchecking'
        };
        const finalMessage = formatWhatsAppMessage(recordToFormat);
        const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(finalMessage)}`;
        
        try {
          const w = window.open(whatsappUrl, '_blank');
          if (!w) {
            window.location.href = whatsappUrl;
          }
        } catch (e) {
          window.location.href = whatsappUrl;
        }
        
        // Add a small delay for mobile browsers to process the window.open/assign before state changes
        await new Promise(resolve => setTimeout(resolve, 500));
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

  const handleSaveStandaloneChecklist = async (formData: RecordEntry, skipWhatsApp = false) => {
    if (!user) return;
    
    setSubmitting(true);
    try {
      // Find matching vehicle to update its status/mileage
      const vehicle = vehicles.find((v: Vehicle) => v.plate === formData.identification.plate);
      
      // Add record to database
      const docRef = await addDoc(collection(db, 'standalone_checklists'), {
        data: formData.identification.date || todayStr,
        ...formData,
        vehicleId: vehicle?.id || '',
        timestamp: serverTimestamp(),
        userEmail: user.email,
        userName: user.displayName || user.email?.split('@')[0],
        source: 'standalone_checklist'
      });
      
      // Update vehicle if found
      if (vehicle) {
        await updateDoc(doc(db, 'vehicles', vehicle.id), {
          lastMileage: Number(formData.mileage.currentMileage),
          // We don't necessarily know the operation type (check-in/out) in standalone, 
          // but we can update the mileage at least.
        });
      }
      
      addNotification("Checklist salvo com sucesso!", "success");

      if (!skipWhatsApp) {
        // Format WhatsApp Message
        const recordToFormat: RecordEntry = {
          ...formData,
          id: docRef.id,
          vehicleId: vehicle?.id || '',
          type: formData.type || 'check-in', 
          userEmail: user.email || '',
          userName: user.displayName || '',
          timestamp: new Date(),
          source: 'standalone_checklist'
        };
        const finalMessage = formatWhatsAppMessage(recordToFormat);
        const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(finalMessage)}`;
        
        try {
          const w = window.open(whatsappUrl, '_blank');
          if (!w) {
            window.location.href = whatsappUrl;
          }
        } catch (e) {
          window.location.href = whatsappUrl;
        }
        
        // Add a small delay for mobile browsers
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return true;
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, 'standalone_checklists');
      addNotification("Erro ao salvar checklist.", "error");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const generateCadcheckingHistoryPDF = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const doc = new jsPDF();
      const APP_BLUE_DARK = [30, 58, 138];
      const APP_RED = [220, 38, 38];
      
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

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.text('RELATÓRIO DE HISTÓRICO - CADASTRO VTR', 45, 32);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      
      const period = `Período: ${format(new Date(cadcheckingDateFilter.start + 'T00:00:00'), 'dd/MM/yyyy')} até ${format(new Date(cadcheckingDateFilter.end + 'T00:00:00'), 'dd/MM/yyyy')}`;
      doc.text(period, 45, 37);

      const tableData = cadcheckingHistory.filter((h: any) => {
        const matchesType = cadcheckingHistoryFilter === 'all' || 
                           (cadcheckingHistoryFilter === 'maintenance' ? h.type.includes('maintenance') : h.type === cadcheckingHistoryFilter);
        const recordDate = h.timestamp?.toDate ? h.timestamp.toDate() : new Date(h.timestamp);
        const start = new Date(cadcheckingDateFilter.start + 'T00:00:00');
        const end = new Date(cadcheckingDateFilter.end + 'T23:59:59');
        const matchesDate = recordDate >= start && recordDate <= end;
        return matchesType && matchesDate;
      }).map((record: any) => {
        const date = record.timestamp?.toDate ? record.timestamp.toDate() : new Date(record.timestamp);
        const typeLabel = record.type === 'check-out' ? 'SAÍDA' : 
                         record.type === 'check-in' ? 'RETORNO' : 
                         record.type.includes('maintenance') ? 'MANUTENÇÃO' : record.type;
        
        return [
          format(date, 'dd/MM/yy HH:mm'),
          record.identification.prefix,
          record.identification.plate,
          typeLabel,
          record.drivers.driverName || '---',
          `${record.mileage.currentMileage} km`
        ];
      });

      if (typeof (doc as any).autoTable === 'function') {
        (doc as any).autoTable({
          startY: 50,
          head: [['Data/Hora', 'Prefixo', 'Placa', 'Tipo', 'Motorista', 'KM']],
          body: tableData,
          theme: 'striped',
          headStyles: { fillColor: APP_BLUE_DARK, textColor: [255, 255, 255], fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 2 },
          alternateRowStyles: { fillColor: [245, 247, 250] },
          margin: { left: 10, right: 10 }
        });
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, 105, 285, { align: 'center' });
        doc.text('14º BPM - POLÍCIA MILITAR DE PERNAMBUCO | Cadastro VTR', 10, 285);
      }

      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setShowPdfPreview(true);
    } catch (error) {
      console.error("Error generating history PDF:", error);
      addNotification("Erro ao gerar o PDF do histórico.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Auth Listener ---

  // Conditional form states
  const [hasR3, setHasR3] = useState(false);
  const [hasR4, setHasR4] = useState(false);

  const handleExtractPlate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtractingPlate(true);
    try {
      const base64String = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const plate = await extractLicensePlateFromImage(base64String);
      if (plate && plate !== 'NONE') {
        const normalizedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
        
        // Find vehicle
        const vehicle = vehicles.find((v: any) => v.plate.replace(/[^A-Z0-9]/g, '').toUpperCase() === normalizedPlate);
        
        setCadcheckingFormData((prev: any) => ({ 
          ...prev, 
          identification: {
            ...prev.identification,
            plate: normalizedPlate,
            prefix: vehicle?.prefix || prev.identification.prefix,
            model: vehicle?.model || prev.identification.model
          },
          checklist: {
            ...(prev.checklist || {}),
            fotos: [...(prev.checklist?.fotos || []), base64String]
          }
        }));
        
        if (!vehicle) {
          addNotification(`Placa ${normalizedPlate} identificada, mas não encontrada na frota.`, "info");
        } else {
          addNotification(`Viatura ${vehicle.prefix} identificada!`, "success");
        }
      } else {
        addNotification("Não foi possível identificar a placa.", "error");
      }
    } catch (error) {
      console.error("Error extracting plate:", error);
      addNotification("Erro ao processar imagem.", "error");
    } finally {
      setIsExtractingPlate(false);
    }
  };
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

  // User Role Listener
  useEffect(() => {
    if (!user) {
      setUserRole(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setUserRole(data.role || 'user');
        console.log("User role loaded from Firestore:", data.role);
      } else {
        // Create user document if it doesn't exist
        setUserRole('user');
        setDoc(doc(db, 'users', user.uid), {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: 'user',
          createdAt: serverTimestamp()
        }).catch(err => console.error("Error creating user doc:", err));
      }
    }, (error) => {
      console.error("Error fetching user role:", error);
    });
    return () => unsub();
  }, [user]);

  // Admin & Authorization Check Listener
  useEffect(() => {
    if (user && user.email) {
      const email = user.email.toLowerCase().trim();
      const isVerified = user.emailVerified;
      const isHardcodedAdmin = email === "demetriomarques@gmail.com";
      const isListedAdmin = (isVerified || isHardcodedAdmin) && Array.isArray(adminList) && adminList.some(adminEmail => 
        typeof adminEmail === 'string' && adminEmail.toLowerCase().trim() === email
      );
      const isDatabaseAdmin = userRole === 'admin';
      
      const finalIsAdmin = isHardcodedAdmin || isListedAdmin || isDatabaseAdmin;
      setIsAdmin(finalIsAdmin);

      const isListedAuthorized = Array.isArray(authorizedList) && authorizedList.some(authEmail => 
        typeof authEmail === 'string' && authEmail.toLowerCase().trim() === email
      );
      // Fixed: Authorization should be more inclusive by default if authenticated
      const finalIsAuthorized = !!user; // Allow all authenticated users
      setIsAuthorized(finalIsAuthorized);

      console.log(`Access check for ${email}: Admin=${finalIsAdmin}, Authorized=${finalIsAuthorized}, Verified=${isVerified}, Role=${userRole}`);
    } else {
      setIsAdmin(false);
      setIsAuthorized(false);
    }
  }, [user, adminList, authorizedList, userRole]);

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
        setSettingsLoaded(true);
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
        ).finally(() => setSettingsLoaded(true));
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
        where('data', '==', todayStr)
      );
      const unsub = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => {
          const docData = doc.data();
          return {
            id: doc.id,
            sourceColl: collName,
            // If the doc doesn't have a type, use the collName as default
            type: docData.type || collName,
            ...docData
          };
        });
        setHistoryData(prev => {
          const filtered = prev.filter(item => item.sourceColl !== collName);
          const combined = [...filtered, ...data].sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : (a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.createdAt || a.timestamp || 0));
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : (b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.createdAt || b.timestamp || 0));
            return dateB - dateA;
          });
          return combined;
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
    if (data.type === 'checklists') {
      return generateDetailedChecklistPDF(data);
    }
    if (data.type === 'standalone_checklists') {
      return generateDetailedChecklistPDF(data);
    }

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

      const cadVtr = allData.filter(item => item.type === 'checklists' || item.source === 'cadchecking');
      if (cadVtr.length > 0) {
        checkPageBreak(20);
        doc.setFillColor(APP_BLUE_DARK[0], APP_BLUE_DARK[1], APP_BLUE_DARK[2]);
        doc.roundedRect(10, yPos, 190, 8, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('CADASTRO VTR (CAUTELA)', 105, yPos + 5.5, { align: 'center' });
        yPos += 12;

        cadVtr.forEach(v => {
          checkPageBreak(40);
          const isCheckIn = v.type === 'check-in';
          doc.setFillColor(isCheckIn ? 239 : 240, isCheckIn ? 246 : 253, isCheckIn ? 255 : 244);
          doc.roundedRect(10, yPos, 190, 30, 2, 2, 'F');
          doc.setFillColor(isCheckIn ? APP_BLUE_DARK[0] : APP_EMERALD[0], isCheckIn ? APP_BLUE_DARK[1] : APP_EMERALD[1], isCheckIn ? APP_BLUE_DARK[2] : APP_EMERALD[2]);
          doc.rect(10, yPos, 3, 30, 'F');

          doc.setTextColor(isCheckIn ? APP_BLUE_DARK[0] : APP_EMERALD[0], isCheckIn ? APP_BLUE_DARK[1] : APP_EMERALD[1], isCheckIn ? APP_BLUE_DARK[2] : APP_EMERALD[2]);
          doc.setFontSize(9);
          doc.text(`${isCheckIn ? 'RETORNO' : 'SAÍDA'} - PAT: ${v.identification?.prefix || '---'} | PLACA: ${v.identification?.plate || '---'}`, 18, yPos + 7);
          doc.setTextColor(30, 41, 59);
          doc.setFontSize(8);
          doc.text(`Vtr: ${v.identification?.model || '---'} | Emprego: ${v.drivers?.serviceType || '---'}`, 18, yPos + 13);
          doc.text(`Condutor: ${v.drivers?.driverName || '---'} | KM: ${v.mileage?.currentMileage || '0'}`, 18, yPos + 19);
          doc.setTextColor(100);
          doc.text(`Data/Hora: ${v.identification?.date} ${v.identification?.time} | Obs: ${v.checklist?.descricaoAlteracoes || '---'}`, 18, yPos + 25);
          yPos += 35;
        });
      }

      const standalone = allData.filter(item => item.type === 'standalone_checklists' || item.source === 'standalone_checklist');
      if (standalone.length > 0) {
        checkPageBreak(20);
        doc.setFillColor(100, 100, 100);
        doc.roundedRect(10, yPos, 190, 8, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('CHECKLISTS AVULSOS VTR', 105, yPos + 5.5, { align: 'center' });
        yPos += 12;

        standalone.forEach(v => {
          checkPageBreak(40);
          doc.setFillColor(248, 250, 252);
          doc.roundedRect(10, yPos, 190, 30, 2, 2, 'F');
          doc.setFillColor(100, 100, 100);
          doc.rect(10, yPos, 3, 30, 'F');

          doc.setTextColor(50, 50, 50);
          doc.setFontSize(9);
          doc.text(`POLICIAMENTO - PLACA: ${v.identification?.plate || '---'} | MODELO: ${v.identification?.model || '---'}`, 18, yPos + 7);
          doc.setTextColor(30, 41, 59);
          doc.setFontSize(8);
          doc.text(`Condutor: ${v.userName || v.userEmail || '---'} | KM: ${v.mileage?.currentMileage || '0'}`, 18, yPos + 13);
          doc.text(`Prefixos: ${v.identification?.prefix || '---'} | P. Operacional: ${v.identification?.operationalPrefix || '---'}`, 18, yPos + 19);
          doc.setTextColor(100);
          doc.text(`Data/Hora: ${v.identification?.date} ${v.identification?.time} | Obs: ${v.checklist?.descricaoAlteracoes || '---'}`, 18, yPos + 25);
          yPos += 35;
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
    console.log("handleSaveSettings called. isAdmin:", isAdmin);
    if (!isAdmin) {
      addNotification("Apenas administradores podem salvar configurações.", "error");
      return;
    }
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
      console.log("Settings saved successfully!");
      setSuccess(true);
      addNotification("Configurações persistidas com sucesso no banco de dados!", "success");
      setTimeout(() => setSuccess(false), 2000);
    } catch (error: any) {
      console.error("Error saving settings:", error);
      handleFirestoreError(error, OperationType.WRITE, 'settings/lists', 'Salvamento de configurações de listas');
      addNotification(`Erro ao salvar: ${error.message || 'Erro desconhecido'}`, "error");
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
    const originalUrl = LOGO_SISCOPI_URL;
    
    if (currentSrc.includes('weserv.nl')) {
      target.src = `https://corsproxy.io/?${encodeURIComponent(originalUrl)}`;
    } else if (currentSrc.includes('corsproxy.io')) {
      target.src = `https://api.allorigins.win/raw?url=${encodeURIComponent(originalUrl)}`;
    } else if (currentSrc !== originalUrl && !currentSrc.includes('allorigins')) {
      target.src = `${originalUrl}?cb=${Date.now()}`;
    } else {
      target.src = FALLBACK_LOGO;
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
            src={`https://wsrv.nl/?url=${encodeURIComponent(LOGO_SISCOPI_URL)}`} 
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
                  src={getProxiedSisCOpILogoUrl()} 
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
              label="Cadastro VTR"
            />
            <SidebarLink 
              active={activeTab === 'checklist'} 
              onClick={() => setActiveTab('checklist')}
              icon={<ClipboardList size={20} />}
              label="Checklist VTR"
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
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-2 z-50 shadow-2xl overflow-x-auto no-scrollbar">
          <MobileNavLink active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setFormType(null); }} icon={<LayoutDashboard size={20} />} label="Início" />
          <MobileNavLink active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={20} />} label="Histórico" />
          <MobileNavLink active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={<BarChart3 size={20} />} label="Relatórios" />
          <MobileNavLink 
            active={activeTab === 'cadchecking'} 
            onClick={() => {
              setActiveTab('cadchecking');
              setCadcheckingSearchTerm('');
              setCadcheckingStatusFilter('all');
            }} 
            icon={<Truck size={20} />} 
            label="Cadastro VTR" 
          />
          <MobileNavLink active={activeTab === 'checklist'} onClick={() => setActiveTab('checklist')} icon={<ClipboardList size={20} />} label="Checklist VTR" />
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
                src={getProxiedSisCOpILogoUrl()} 
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
                          src={getProxiedSisCOpILogoUrl()} 
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
                    title="Cadastro VTR"
                    description="Cadastramento, check-in/out e manutenção de frota"
                    color="blue"
                    icon={<img src="https://i.pinimg.com/originals/a4/9d/1b/a49d1bc945d9d701a572668f6ffc99b8.png" alt="Cadastro VTR" className="w-10 h-10 object-contain transition-transform group-hover:scale-110" referrerPolicy="no-referrer" />}
                    onClick={() => {
                      setActiveTab('cadchecking');
                      setCadcheckingSearchTerm('');
                      setCadcheckingStatusFilter('all');
                    }}
                  />
                  <DashboardCard 
                    title="Checklist VTR"
                    description="Sistema integrado de checklist de viaturas do 14º BPM."
                    color="red"
                    icon={<ClipboardList size={32} />}
                    onClick={() => setActiveTab('checklist')}
                  />
                  <DashboardCard 
                    title="Relatórios"
                    description="Geração de relatórios consolidados em PDF e CSV."
                    color="blue"
                    icon={<BarChart3 size={32} />}
                    onClick={() => setActiveTab('reports')}
                  />
                  <DashboardCard 
                    title="Gestão de Serviços"
                    description="Acesso ao sistema externo de gestão de serviços (Base44)."
                    color="indigo"
                    icon={<img src={LOGO_14BPM_URL} alt="Brasão 14º BPM" className="w-8 h-8 object-contain opacity-70 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />}
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
                      {historyData
                        .slice(0, 5)
                        .map((item, idx) => (
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

                <footer className="mt-16 py-8 border-t border-slate-100 flex flex-col items-center justify-center gap-4 text-center">
                  <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-full border border-slate-100 mb-2">
                    <Truck size={14} className="text-blue-600" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acesso Rápido</span>
                  </div>
                  <button 
                    onClick={() => {
                      setActiveTab('cadchecking');
                      setCadcheckingSearchTerm('');
                      setCadcheckingStatusFilter('all');
                    }}
                    className="text-blue-600 font-bold hover:underline flex items-center gap-2"
                  >
                    Ir para Cadastro VTR
                    <ChevronRight size={16} />
                  </button>
                  <p className="text-slate-400 text-xs font-medium">14º Batalhão de Polícia Militar • SisCOpI</p>
                </footer>
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
                                className="p-6 bg-orange-50/50 rounded-2xl border border-orange-100 space-y-6 relative z-[20]"
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
                                className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-6 relative z-[10]"
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
                          <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-6 relative z-[70]">
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
                          <div className="p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-6 relative z-[60]">
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
                                className="p-6 bg-orange-50/50 rounded-2xl border border-orange-100 space-y-6 relative z-[50]"
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
                                className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-6 relative z-[40]"
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
                                className="p-6 bg-orange-50/50 rounded-2xl border border-orange-100 space-y-6 relative z-[30]"
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
                                className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-6 relative z-[20]"
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
                                className="p-6 bg-orange-50/50 rounded-2xl border border-orange-100 space-y-6 relative z-[10]"
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

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="w-full">
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
                <header className="mb-6 md:mb-8">
                  <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Relatórios Consolidados</h1>
                  <p className="text-sm md:text-base text-slate-500">Gere relatórios em PDF baseados em filtros específicos.</p>
                </header>

                <div className="bg-white p-5 md:p-8 rounded-3xl shadow-xl border border-slate-100 max-w-2xl mx-auto">
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
                      if (formData.get('type_checklists')) types.push('checklists');
                      if (formData.get('type_standalone')) types.push('standalone_checklists');
                      
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                        <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-blue-50 transition-colors">
                          <input type="checkbox" name="type_checklists" defaultChecked className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500" />
                          <span className="text-sm font-medium text-slate-700">Cadastro VTR</span>
                        </label>
                        <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-indigo-50 transition-colors">
                          <input type="checkbox" name="type_standalone" defaultChecked className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500" />
                          <span className="text-sm font-medium text-slate-700">Checklist VTR</span>
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
                  onBootstrap={bootstrapVehicles}
                  isSyncing={isSyncing}
                  formData={cadcheckingFormData}
                  setFormData={setCadcheckingFormData}
                  submitting={submitting}
                  dateFilter={cadcheckingDateFilter}
                  setDateFilter={setCadcheckingDateFilter}
                  onGeneratePDF={generateCadcheckingHistoryPDF}
                  onGenerateDetailedPDF={generateDetailedChecklistPDF}
                  currentTab={currentCadcheckingTab}
                  setCurrentTab={setCurrentCadcheckingTab}
                  personnelList={personnelList}
                  prefixoVtList={prefixoVtList}
                  moList={moList}
                  patrimonioVtList={patrimonioVtList}
                  patrimonioMoList={patrimonioMoList}
                  isExtractingPlate={isExtractingPlate}
                  onExtractPlate={handleExtractPlate}
                />
              </motion.div>
            )}

            {activeTab === 'checklist' && (
              <motion.div 
                key="checklist"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <ChecklistModule 
                  user={user}
                  vehicles={vehicles}
                  personnelList={personnelList}
                  prefixoVtList={prefixoVtList}
                  moList={moList}
                  patrimonioVtList={patrimonioVtList}
                  patrimonioMoList={patrimonioMoList}
                  isExtractingPlate={isExtractingPlate}
                  onExtractPlate={handleExtractPlate}
                  onGenerateDetailedPDF={generateDetailedChecklistPDF}
                  onResendWhatsApp={handleResendWhatsApp}
                  onSaveStandalone={handleSaveStandaloneChecklist}
                  history={standaloneHistory}
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
        <div className="absolute z-[100] w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
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
  const date = item.createdAt?.toDate ? item.createdAt.toDate() : (item.timestamp?.toDate ? item.timestamp.toDate() : new Date(item.createdAt || item.timestamp || Date.now()));
  const isOwner = item.createdBy === userId;
  
  const typeLabel = item.sourceColl === 'atividades_linha' ? 'Linha' :
                    item.sourceColl === 'efetivo_viaturas' ? 'Viatura' : 
                    item.sourceColl === 'efetivo_mos' ? 'MO' :
                    item.sourceColl === 'checklists' ? 'Cadastro VTR' : 
                    item.sourceColl === 'standalone_checklists' ? 'Checklist VTR' : 
                    (item.type === 'atividades_linha' ? 'Linha' : 'Registro');

  const typeColor = item.sourceColl === 'atividades_linha' ? 'bg-blue-900 text-white' :
                    item.sourceColl === 'efetivo_viaturas' ? 'bg-emerald-700 text-white' : 
                    item.sourceColl === 'efetivo_mos' ? 'bg-orange-700 text-white' :
                    item.sourceColl === 'checklists' ? 'bg-blue-600 text-white' : 
                    item.sourceColl === 'standalone_checklists' ? 'bg-slate-700 text-white' : 'bg-slate-600';
  
  // Helper to get effective names
  const getEffectiveNames = () => {
    if (item.sourceColl === 'atividades_linha' || item.type === 'atividades_linha') {
      return item.graduacaoNomeMatricula || '';
    }
    if (item.sourceColl === 'checklists' || item.source === 'cadchecking') {
      return item.drivers?.driverName || '';
    }
    if (item.sourceColl === 'standalone_checklists' || item.source === 'standalone_checklist') {
      return item.drivers?.driverName || item.driverName || '';
    }
    if (item.sourceColl === 'efetivo_viaturas' || item.type === 'efetivo_viaturas') {
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
    if (item.sourceColl === 'efetivo_mos' || item.type === 'efetivo_mos') {
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
  const patrimony = item.identification?.plate || item.plate || item.patrimony || item.patrimonioViatura || item.patrimonioR1 || item.patrimonioR2 || item.patrimonioR3 || item.patrimonioR4 || '';
  const city = item.cidade || '';
  const spec = item.especificacaoEfetivo || '';

  return (
    <div className={`flex flex-col transition-all ${!isLast ? 'border-b border-slate-100' : ''} ${isExpanded ? 'bg-slate-50/80 shadow-inner' : 'hover:bg-slate-50'}`}>
      <div className="p-4 flex items-center justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${
            item.sourceColl === 'atividades_linha' ? 'bg-blue-50 text-blue-900' : 
            item.sourceColl === 'efetivo_viaturas' ? 'bg-emerald-50 text-emerald-700' : 
            item.sourceColl === 'efetivo_mos' ? 'bg-orange-50 text-orange-700' :
            item.sourceColl === 'checklists' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-700'
          }`}>
            <span className="font-bold">
              {item.sourceColl === 'atividades_linha' ? 'AL' : 
               item.sourceColl === 'efetivo_viaturas' ? 'EV' : 
               item.sourceColl === 'efetivo_mos' ? 'EM' : 
               item.sourceColl === 'checklists' ? 'CV' : 'CK'}
            </span>
          </div>
          <div>
            <p className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
              <span>{item.identification?.prefix || item.prefixoViatura || item.prefixo || item.unidade || item.funcao || item.graduacaoNomeMatricula || "Registro"}</span>
              {patrimony && (
                <span className="text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
                  {item.sourceColl === 'checklists' || item.sourceColl === 'standalone_checklists' ? 'Placa: ' : 'Pat: '}{patrimony}
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

                {(item.type === 'efetivo_viaturas' || item.type === 'efetivo_mos' || item.sourceColl === 'efetivo_viaturas' || item.sourceColl === 'efetivo_mos') && (
                  <>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Chamada</p>
                      <p className="text-sm font-bold text-slate-700">{item.chamada || '---'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Prefixo</p>
                      <p className="text-sm font-bold text-slate-700">{item.prefixo || item.prefixoViatura || '---'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Patrimônio</p>
                      <p className="text-sm font-bold text-slate-700">{patrimony}</p>
                    </div>
                  </>
                )}

                {(item.sourceColl === 'checklists' || item.sourceColl === 'standalone_checklists') && (
                  <>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipo</p>
                      <p className="text-sm font-bold text-slate-700">{(item.type === 'check-out' || item.type === 'maintenance-out') ? 'SAÍDA' : 'RETORNO'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Km</p>
                      <p className="text-sm font-bold text-slate-700">{item.mileage?.currentMileage || '0'} km</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Patrimônio</p>
                      <p className="text-sm font-bold text-slate-700">{item.identification?.prefix || '---'}</p>
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

function ChecklistHistoryItem({ 
  record, 
  isExpanded, 
  onToggle, 
  onResendWhatsApp, 
  onGenerateDetailedPDF 
}: any) {
  const timestamp = record.timestamp?.toDate ? record.timestamp.toDate() : new Date(record.timestamp);
  
  return (
    <div className={`bg-white rounded-3xl border transition-all ${isExpanded ? 'border-red-200 shadow-xl shadow-red-50' : 'border-slate-100 hover:border-slate-200 shadow-sm'}`}>
      <div 
        onClick={onToggle}
        className="p-6 cursor-pointer flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center">
            <ClipboardList size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-black text-slate-900">{record.identification.prefix}</h4>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[10px] font-bold font-mono">{record.identification.plate}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                record.type === 'check-out' || record.type === 'maintenance-out'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {record.type === 'check-out' || record.type === 'maintenance-out' ? 'RETORNO' : 'SAÍDA'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-bold">
              {format(timestamp, "dd/MM/yyyy HH:mm")} • {record.drivers.driverName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ChevronDown size={20} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-slate-50"
          >
            <div className="p-6 space-y-6 bg-slate-50/30">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Responsável</p>
                  <p className="text-sm font-bold text-slate-700">{record.drivers.driverName}</p>
                  <p className="text-[10px] text-slate-500">{record.drivers.serviceType}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quilometragem</p>
                  <p className="text-sm font-bold text-slate-700">{record.mileage.currentMileage} km</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estado Geral</p>
                  <p className="text-sm font-bold text-slate-700">{record.checklist.mapaDiario === 'SIM' ? '✅ Mapa OK' : '❌ Sem Mapa'}</p>
                  <p className="text-[10px] text-slate-500">{record.checklist.limpeza === 'SIM' ? '✅ Limpa' : '❌ Suja'}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => onGenerateDetailedPDF(record)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                >
                  <FileText size={18} />
                  Gerar PDF Detalhado
                </button>
                <button 
                  onClick={() => onResendWhatsApp(record)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                >
                  <MessageCircle size={18} />
                  WhatsApp
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Checklist Module Component ---
function ChecklistModule({ 
  user, 
  vehicles, 
  personnelList, 
  prefixoVtList, 
  moList, 
  patrimonioVtList, 
  patrimonioMoList,
  isExtractingPlate,
  onExtractPlate,
  onGenerateDetailedPDF,
  onResendWhatsApp,
  onSaveStandalone,
  history
}: {
  user: User | null;
  vehicles: Vehicle[];
  personnelList: string[];
  prefixoVtList: string[];
  moList: string[];
  patrimonioVtList: string[];
  patrimonioMoList: string[];
  isExtractingPlate: boolean;
  onExtractPlate: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onGenerateDetailedPDF: (record: RecordEntry) => void;
  onResendWhatsApp: (record: RecordEntry) => void;
  onSaveStandalone: (formData: any, skipWhatsApp?: boolean) => Promise<boolean>;
  history: RecordEntry[];
}) {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [currentTab, setCurrentTab] = useState(0);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const initialFormData = {
    identification: {
      prefix: '',
      plate: '',
      model: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      time: format(new Date(), 'HH:mm'),
    },
    type: 'check-in' as 'check-in' | 'check-out',
    drivers: {
      driverName: '',
      serviceType: '',
    },
    mileage: {
      currentMileage: '',
      notes: ''
    },
    checklist: {
      mapaDiario: 'SIM',
      limpeza: 'SIM',
      equipamentos: [],
      luzFarolAlto: 'Todos funcionam',
      luzFarolBaixo: 'Todos funcionam',
      luzLanterna: 'Todos funcionam',
      luzPlaca: 'Funciona',
      luzFreioLanternaTraseira: [],
      pneus: 'Todos em bom estado',
      sistemaFreio: 'Normal',
      oleoMotor: 'Nível normal',
      proxTrocaOleoKm: '',
      sistemaTracao: 'Normal',
      partesInternas: [],
      partesExternas: [],
      descricaoAlteracoes: '',
      fotos: []
    }
  };

  const [formData, setFormData] = useState(initialFormData);

  const handleStartNew = () => {
    setFormData({
      ...initialFormData,
      identification: {
        ...initialFormData.identification,
        date: format(new Date(), 'yyyy-MM-dd'),
        time: format(new Date(), 'HH:mm')
      }
    });
    setCurrentTab(0);
    setView('form');
  };

  const handleSave = async (skipWhatsApp = false) => {
    setSubmitting(true);
    try {
      const success = await onSaveStandalone(formData, skipWhatsApp);
      if (success) {
        setView('list');
      }
    } catch (error) {
      console.error("Erro ao salvar checklist:", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Checklist de Viaturas</h2>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs opacity-60">Sistema de Conferência 14º BPM</p>
        </div>
        <div className="flex gap-3">
          {view === 'form' && (
            <button 
              onClick={() => setView('list')}
              className="px-6 py-3 bg-white text-slate-700 rounded-2xl font-bold shadow-lg border border-slate-100 hover:bg-slate-50 transition-all flex items-center gap-2"
            >
              <History size={20} />
              Ver Histórico
            </button>
          )}
        </div>
      </div>

      {view === 'list' ? (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-100/50">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-slate-900">Histórico Recente</h3>
              <button 
                onClick={handleStartNew}
                className="p-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 flex items-center gap-2"
              >
                <Plus size={20} />
                Novo Checklist
              </button>
            </div>

            <div className="space-y-4">
              {history.map((record: RecordEntry) => (
                <ChecklistHistoryItem 
                  key={record.id}
                  record={record}
                  isExpanded={expandedHistoryId === record.id}
                  onToggle={() => setExpandedHistoryId(expandedHistoryId === record.id ? null : record.id)}
                  onResendWhatsApp={onResendWhatsApp}
                  onGenerateDetailedPDF={onGenerateDetailedPDF}
                />
              ))}
              {history.length === 0 && (
                <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-[2.5rem]">
                  <p className="text-slate-400 font-bold">Nenhum checklist encontrado.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden">
          {/* Multi-step Form Header */}
          <div className="bg-slate-50 p-8 border-b border-slate-100">
            <div className="flex gap-2 mb-8 overflow-x-auto pb-2 custom-scrollbar">
              {[
                { icon: <Siren size={18} />, label: 'Identificação' },
                { icon: <UserRound size={18} />, label: 'Responsável' },
                { icon: <ShieldCheck size={18} />, label: 'Estado Técnico' },
                { icon: <Lightbulb size={18} />, label: 'Iluminação' },
                { icon: <Settings size={18} />, label: 'Mecânica' },
                { icon: <ShieldAlert size={18} />, label: 'Conservação' },
                { icon: <Camera size={18} />, label: 'Fotos' }
              ].map((step, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentTab(idx)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    currentTab === idx 
                    ? 'bg-red-600 text-white shadow-lg shadow-red-100' 
                    : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-100'
                  }`}
                >
                  {step.icon}
                  {step.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-8">
            <div className="min-h-[400px]">
              {currentTab === 0 && (
                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Placa</label>
                      <ChecklistSearchableSelect 
                        label="Placa"
                        value={formData.identification.plate}
                        onChange={(val: string) => {
                          const vehicle = vehicles.find((v: Vehicle) => v.plate === val);
                          setFormData({
                            ...formData, 
                            identification: {
                              ...formData.identification, 
                              plate: val, 
                              prefix: vehicle?.prefix || formData.identification.prefix,
                              model: vehicle?.model || formData.identification.model
                            }
                          });
                        }}
                        options={vehicles.map((v: Vehicle) => v.plate)}
                        placeholder="Selecione a placa..."
                        variant="blue"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Viatura</label>
                      <ChecklistSearchableSelect 
                        label="Viatura"
                        value={formData.identification.prefix}
                        onChange={(val: string) => {
                          const vehicle = vehicles.find((v: Vehicle) => v.prefix === val);
                          setFormData({
                            ...formData, 
                            identification: {
                              ...formData.identification, 
                              prefix: val, 
                              plate: vehicle?.plate || formData.identification.plate,
                              model: vehicle?.model || formData.identification.model
                            }
                          });
                        }}
                        options={vehicles.map((v: Vehicle) => v.prefix)}
                        placeholder="Selecione a viatura..."
                        variant="blue"
                      />
                    </div>
                      <div className="space-y-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setFormData({...formData, type: 'check-in'})}
                            className={`flex-1 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${
                              formData.type === 'check-in' 
                                ? 'bg-blue-600 text-white shadow-lg' 
                                : 'bg-slate-50 text-slate-400 border border-slate-100'
                            }`}
                          >
                            <LogIn size={20} />
                            SAÍDA
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({...formData, type: 'check-out'})}
                            className={`flex-1 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${
                              formData.type === 'check-out' 
                                ? 'bg-emerald-600 text-white shadow-lg' 
                                : 'bg-slate-50 text-slate-400 border border-slate-100'
                            }`}
                          >
                            <LogOut size={20} />
                            RETORNO
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Data do Registro</label>
                            <input 
                              type="date"
                              value={formData.identification.date}
                              onChange={(e) => setFormData({...formData, identification: {...formData.identification, date: e.target.value}})}
                              className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold text-slate-700"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Hora do Registro</label>
                            <input 
                              type="time"
                              value={formData.identification.time}
                              onChange={(e) => setFormData({...formData, identification: {...formData.identification, time: e.target.value}})}
                              className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold text-slate-700"
                            />
                          </div>
                        </div>
                      </div>
                  </div>
                </motion.div>
              )}

              {currentTab === 1 && (
                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Motorista / Matrícula</label>
                    <ChecklistSearchableSelect 
                      label="Motorista"
                      value={formData.drivers.driverName}
                      onChange={(val: string) => setFormData({...formData, drivers: {...formData.drivers, driverName: val}})}
                      options={personnelList}
                      placeholder="Selecione o Motorista..."
                      variant="blue"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Modalidade de Emprego</label>
                    <select 
                      value={formData.drivers.serviceType}
                      onChange={(e) => setFormData({...formData, drivers: {...formData.drivers, serviceType: e.target.value}})}
                      className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold text-slate-700"
                    >
                      <option value="">Selecione o Emprego...</option>
                      {CADASTRO_VTR_SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </motion.div>
              )}

              {currentTab === 2 && (
                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                      <label className="text-xs font-bold uppercase text-red-600">Mapa Diário</label>
                      <div className="flex gap-2 mt-2">
                        {['SIM', 'NÃO'].map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setFormData({...formData, checklist: {...formData.checklist, mapaDiario: opt}})}
                            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${
                              formData.checklist.mapaDiario === opt 
                              ? 'bg-red-600 text-white border-transparent shadow-md' 
                              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                      <label className="text-xs font-bold uppercase text-red-600">Limpeza</label>
                      <div className="flex gap-2 mt-2">
                        {['SIM', 'NÃO'].map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setFormData({...formData, checklist: {...formData.checklist, limpeza: opt}})}
                            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${
                              formData.checklist.limpeza === opt 
                              ? 'bg-red-600 text-white border-transparent shadow-md' 
                              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-xs font-bold uppercase text-slate-400 tracking-widest">Equipamentos Presentes</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {EQUIPAMENTOS_VTR.map(eq => (
                        <button
                          key={eq}
                          type="button"
                          onClick={() => {
                            const current = formData.checklist.equipamentos;
                            const next = current.includes(eq) ? current.filter((i: string) => i !== eq) : [...current, eq];
                            setFormData({...formData, checklist: {...formData.checklist, equipamentos: next}});
                          }}
                          className={`p-3 rounded-xl text-xs text-left transition-all border ${
                            formData.checklist.equipamentos.includes(eq) 
                            ? 'bg-red-600 text-white border-transparent shadow-lg scale-[1.02]' 
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          {eq}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {currentTab === 3 && (
                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {[
                      { label: 'Farol Alto', field: 'luzFarolAlto' },
                      { label: 'Farol Baixo', field: 'luzFarolBaixo' },
                      { label: 'Lanterna/Pisca', field: 'luzLanterna' },
                      { label: 'Luz de Placa', field: 'luzPlaca' }
                    ].map(item => (
                      <div key={item.field} className="space-y-2">
                        <label className="text-xs font-bold uppercase text-slate-400">{item.label}</label>
                        <select 
                          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700"
                          value={formData.checklist[item.field]}
                          onChange={(e) => setFormData({...formData, checklist: {...formData.checklist, [item.field]: e.target.value}})}
                        >
                          <option value="Todos funcionam">Todos funcionam</option>
                          <option value="Direito queimado">Direito queimado</option>
                          <option value="Esquerdo queimado">Esquerdo queimado</option>
                          <option value="Todas queimados">Todas queimados</option>
                          <option value="Funciona">Funciona</option>
                          <option value="Queimada">Queimada</option>
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-4">
                    <label className="text-xs font-bold uppercase text-slate-400 tracking-widest">Luz de Freio e Lanterna Traseira</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {LUZES_TRASEIRAS.map(item => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            const current = formData.checklist.luzFreioLanternaTraseira;
                            const next = current.includes(item) ? current.filter((i: string) => i !== item) : [...current, item];
                            setFormData({...formData, checklist: {...formData.checklist, luzFreioLanternaTraseira: next}});
                          }}
                          className={`p-3 rounded-xl text-xs text-left transition-all border ${
                            formData.checklist.luzFreioLanternaTraseira.includes(item) 
                            ? 'bg-red-600 text-white border-transparent shadow-md' 
                            : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-red-200'
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {currentTab === 4 && (
                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-slate-400">Pneus</label>
                      <select 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700"
                        value={formData.checklist.pneus}
                        onChange={(e) => setFormData({...formData, checklist: {...formData.checklist, pneus: e.target.value}})}
                      >
                        <option value="Novo">Novo</option>
                        <option value="Meia vida">Meia vida</option>
                        <option value="Inutilizável (Motivo de baixa)">Inutilizável (Motivo de baixa)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-slate-400">Sistema de Freio</label>
                      <select 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700"
                        value={formData.checklist.sistemaFreio}
                        onChange={(e) => setFormData({...formData, checklist: {...formData.checklist, sistemaFreio: e.target.value}})}
                      >
                        <option value="Freio funcionando">Freio funcionando</option>
                        <option value="Freio falhando">Freio falhando</option>
                        <option value="Sem Freios (Motivo de baixa)">Sem Freios (Motivo de baixa)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-slate-400">Óleo Motor</label>
                      <select 
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700"
                        value={formData.checklist.oleoMotor}
                        onChange={(e) => setFormData({...formData, checklist: {...formData.checklist, oleoMotor: e.target.value}})}
                      >
                        <option value="Nível Normal">Nível Normal</option>
                        <option value="Nível Baixo">Nível Baixo</option>
                        <option value="Nível sem condições (Baixar VTR)">Nível sem condições (Baixar VTR)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-slate-400">Próx. Troca Óleo KM</label>
                      <input 
                        type="number"
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700"
                        value={formData.checklist.proxTrocaOleoKm}
                        onChange={(e) => setFormData({...formData, checklist: {...formData.checklist, proxTrocaOleoKm: e.target.value}})}
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {currentTab === 5 && (
                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  <div className="space-y-4">
                    <label className="text-xs font-bold uppercase text-slate-400 tracking-widest">Partes Internas</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {PARTES_INTERNAS.map(item => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            const current = formData.checklist.partesInternas;
                            const next = current.includes(item) ? current.filter((i: string) => i !== item) : [...current, item];
                            setFormData({...formData, checklist: {...formData.checklist, partesInternas: next}});
                          }}
                          className={`p-3 rounded-xl text-xs text-left transition-all border ${
                            formData.checklist.partesInternas.includes(item) 
                            ? 'bg-red-600 text-white border-transparent shadow-md' 
                            : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-red-200'
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-xs font-bold uppercase text-slate-400 tracking-widest">Partes Externas</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {PARTES_EXTERNAS.map(item => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            const current = formData.checklist.partesExternas;
                            const next = current.includes(item) ? current.filter((i: string) => i !== item) : [...current, item];
                            setFormData({...formData, checklist: {...formData.checklist, partesExternas: next}});
                          }}
                          className={`p-3 rounded-xl text-xs text-left transition-all border ${
                            formData.checklist.partesExternas.includes(item) 
                            ? 'bg-red-600 text-white border-transparent shadow-md' 
                            : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-red-200'
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {currentTab === 6 && (
                <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Quilometragem Atual</label>
                    <input 
                      type="number"
                      placeholder="Digite a KM do painel..."
                      value={formData.mileage.currentMileage}
                      onChange={(e) => setFormData({...formData, mileage: {...formData.mileage, currentMileage: e.target.value}})}
                      className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-[2rem] focus:ring-4 focus:ring-red-500/20 outline-none font-black text-3xl text-slate-900 text-center"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Observações Adicionais</label>
                    <textarea 
                      placeholder="Relate qualquer observação importante..."
                      value={formData.mileage.notes}
                      onChange={(e) => setFormData({...formData, mileage: {...formData.mileage, notes: e.target.value}})}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold text-slate-700 min-h-[120px]"
                    />
                  </div>

                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                      <Camera size={14} />
                      Fotos da Viatura
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {formData.checklist.fotos.map((foto: string, index: number) => (
                        <div key={index} className="relative group aspect-square rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                          <img src={foto} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => {
                              const next = formData.checklist.fotos.filter((_: string, i: number) => i !== index);
                              setFormData({...formData, checklist: {...formData.checklist, fotos: next}});
                            }}
                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      {formData.checklist.fotos.length < 8 && (
                        <label className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-50 transition-all text-slate-400 hover:text-red-600 group">
                          <Camera size={24} className="group-hover:scale-110 transition-transform" />
                          <span className="text-[10px] font-black uppercase">Adicionar Foto</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            multiple 
                            className="hidden" 
                            onChange={async (e) => {
                              const files = Array.from(e.target.files || []);
                              const newFotos = await Promise.all(files.map(async (file: Blob) => {
                                const base64 = await new Promise<string>((resolve) => {
                                  const reader = new FileReader();
                                  reader.onload = () => resolve(reader.result as string);
                                  reader.readAsDataURL(file);
                                });
                                return await compressImage(base64);
                              }));
                              setFormData({...formData, checklist: {...formData.checklist, fotos: [...formData.checklist.fotos, ...newFotos]}});
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Navigation Buttons */}
            <div className="flex gap-4 mt-10">
              {currentTab > 0 && (
                <button 
                  onClick={() => setCurrentTab(currentTab - 1)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                >
                  <ChevronLeft size={20} />
                  Anterior
                </button>
              )}
              {currentTab < 6 ? (
                <button 
                  onClick={() => setCurrentTab(currentTab + 1)}
                  className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xl"
                >
                  Próximo
                  <ChevronRight size={20} />
                </button>
              ) : (
                <div className="flex-[2] flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={() => handleSave(true)}
                    disabled={submitting}
                    className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    Salvar
                  </button>
                  <button 
                    onClick={() => handleSave(false)}
                    disabled={submitting}
                    className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-emerald-100 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="animate-spin" size={20} /> : <MessageCircle size={20} />}
                    Salvar e Enviar WhatsApp
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
  onBootstrap,
  isSyncing,
  formData,
  setFormData,
  submitting,
  dateFilter,
  setDateFilter,
  onGeneratePDF,
  maintenanceModal,
  setMaintenanceModal,
  currentTab,
  setCurrentTab,
  personnelList,
  prefixoVtList,
  moList,
  patrimonioVtList,
  patrimonioMoList,
  isExtractingPlate,
  onExtractPlate,
  onGenerateDetailedPDF
}: {
  user: User | null;
  isAdmin: boolean;
  vehicles: Vehicle[];
  history: RecordEntry[];
  selectedVehicle: Vehicle | null;
  operationType: 'check-out' | 'check-in' | null;
  view: 'list' | 'history' | 'admin';
  setView: (view: 'list' | 'history' | 'admin') => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: 'all' | 'available' | 'in_use' | 'maintenance';
  setStatusFilter: (filter: 'all' | 'available' | 'in_use' | 'maintenance') => void;
  historyFilter: 'all' | 'check-out' | 'check-in' | 'maintenance';
  setHistoryFilter: (filter: 'all' | 'check-out' | 'check-in' | 'maintenance') => void;
  expandedHistoryId: string | null;
  setExpandedHistoryId: (id: string | null) => void;
  onStartRecord: (vehicle: Vehicle, type: 'check-out' | 'check-in') => void;
  onToggleMaintenance: (vehicle: Vehicle, notes?: string) => void;
  onSaveRecord: (skipWhatsApp?: boolean) => void;
  onResendWhatsApp: (record: RecordEntry) => void;
  onBootstrap: (force?: boolean) => void;
  isSyncing: boolean;
  formData: RecordEntry;
  setFormData: React.Dispatch<React.SetStateAction<RecordEntry>>;
  submitting: boolean;
  dateFilter: { start: string; end: string };
  setDateFilter: (filter: { start: string; end: string }) => void;
  onGeneratePDF: () => void;
  maintenanceModal: { vehicle: Vehicle; notes: string } | null;
  setMaintenanceModal: (modal: { vehicle: Vehicle; notes: string } | null) => void;
  currentTab: number;
  setCurrentTab: (tab: number) => void;
  personnelList: string[];
  prefixoVtList: string[];
  moList: string[];
  patrimonioVtList: string[];
  patrimonioMoList: string[];
  isExtractingPlate: boolean;
  onExtractPlate: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onGenerateDetailedPDF: (record: RecordEntry) => void;
}) {
  
  console.log(`[CadChecking] Rendering with ${vehicles.length} total vehicles`);
  
  const uniqueVehicles = React.useMemo(() => {
    const unique = new Map<string, Vehicle>();
    vehicles.forEach(v => {
      const plateKey = (v.plate || '').replace(/[\s-]/g, '').toUpperCase();
      // Se já existe, preferimos o que tem o ID padrão (igual à placa normalizada)
      if (!unique.has(plateKey) || v.id === plateKey) {
        unique.set(plateKey, v);
      }
    });
    return Array.from(unique.values());
  }, [vehicles]);

  const counts = React.useMemo(() => ({
    all: uniqueVehicles.length,
    available: uniqueVehicles.filter((v: Vehicle) => v.status === 'available').length,
    in_use: uniqueVehicles.filter((v: Vehicle) => v.status === 'in_use').length,
    maintenance: uniqueVehicles.filter((v: Vehicle) => v.status === 'maintenance').length
  }), [uniqueVehicles]);

  const filteredVehicles = React.useMemo(() => uniqueVehicles.filter((v: Vehicle) => {
    const plate = (v.plate || '').toLowerCase();
    const model = (v.model || '').toLowerCase();
    const prefix = (v.prefix || '').toLowerCase();
    const search = (searchTerm || '').toLowerCase();

    const matchesSearch = plate.includes(search) || 
                         model.includes(search) ||
                         prefix.includes(search);
    const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [uniqueVehicles, searchTerm, statusFilter]);

  console.log(`[CadChecking] Filtered to ${filteredVehicles.length} vehicles (Search: "${searchTerm}", Status: "${statusFilter}")`);

  const filteredHistory = React.useMemo(() => history.filter((h: RecordEntry) => {
    // Type filter
    const matchesType = historyFilter === 'all' || 
                       (historyFilter === 'maintenance' ? h.type.includes('maintenance') : h.type === historyFilter);
    
    // Date filter
    const recordDate = h.timestamp?.toDate ? (h.timestamp as Timestamp).toDate() : (h.timestamp ? new Date(h.timestamp as Date) : new Date());
    const start = new Date(dateFilter.start + 'T00:00:00');
    const end = new Date(dateFilter.end + 'T23:59:59');
    const matchesDate = recordDate >= start && recordDate <= end;

    return matchesType && matchesDate;
  }), [history, historyFilter, dateFilter]);

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <img 
              src="https://i.pinimg.com/originals/a4/9d/1b/a49d1bc945d9d701a572668f6ffc99b8.png" 
              alt="Cadastro VTR Logo" 
              className="w-10 h-10 object-contain" 
              referrerPolicy="no-referrer"
            />
            Cadastro VTR <span className="text-blue-600/20">|</span> <span className="text-slate-400 text-lg font-bold">Controle de Frota</span>
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
              onClick={() => onBootstrap(true)}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 active:scale-95 ml-2"
            >
              <RefreshCw className={isSyncing ? "animate-spin" : ""} size={16} />
              <span className="hidden sm:inline">Sincronizar Frota Completa</span>
              <span className="sm:hidden">Sincronizar</span>
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
                    onClick={() => setStatusFilter(opt.id as any)}
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
                  submitting={submitting}
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
            <div className="flex flex-col lg:flex-row gap-4 bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
              <div className="flex-1 space-y-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Filtrar por Tipo</label>
                <div className="flex flex-wrap gap-2">
                  {['all', 'check-in', 'check-out', 'maintenance'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setHistoryFilter(f as any)}
                      className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${historyFilter === f ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                    >
                      {f === 'all' ? 'Todos' : f === 'check-out' ? 'Saídas' : f === 'check-in' ? 'Retornos' : 'Manutenção'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 space-y-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Filtrar por Período</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="date"
                    value={dateFilter.start}
                    onChange={(e) => setDateFilter({...dateFilter, start: e.target.value})}
                    className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700 text-sm"
                  />
                  <span className="text-slate-400 font-bold">até</span>
                  <input 
                    type="date"
                    value={dateFilter.end}
                    onChange={(e) => setDateFilter({...dateFilter, end: e.target.value})}
                    className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-end">
                <button 
                  onClick={onGeneratePDF}
                  disabled={submitting}
                  className="w-full lg:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                >
                  <FileText size={20} />
                  Gerar PDF
                </button>
              </div>
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
                  onGenerateDetailedPDF={onGenerateDetailedPDF}
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
      </AnimatePresence>

      {/* Operation Modal (Check-in / Check-out) */}
      <AnimatePresence>
        {selectedVehicle && operationType && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl flex flex-col border border-slate-200 my-auto"
            >
              {/* Modal Header */}
              <div className={`p-8 text-white relative overflow-hidden ${operationType === 'check-in' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
                <div className="absolute top-0 right-0 p-12 bg-white/10 rounded-full -mr-12 -mt-12 blur-2xl"></div>
                <div className="relative z-10 flex items-center justify-between">
                  <div>
                    <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest mb-2 inline-block">
                      {operationType === 'check-out' ? 'SAÍDA (Cautelar Viatura)' : 'RETORNO (Devolução Viatura)'}
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

                  <div className="flex gap-2 mb-8 bg-slate-50 p-1.5 rounded-2xl overflow-x-auto custom-scrollbar">
                    {[
                      { icon: <Siren size={18} />, label: 'Identificação' },
                      { icon: <UserRound size={18} />, label: 'Condutor' },
                      { icon: <RefreshCw size={18} />, label: 'Quilometragem' }
                    ].map((step, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentTab(idx)}
                        className={`flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-all ${currentTab === idx ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        {step.icon}
                        <span className="hidden sm:inline">{step.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="min-h-[400px]">
                    {currentTab === 0 && (
                      <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Placa</label>
                            <ChecklistSearchableSelect 
                              label="Placa"
                              value={formData.identification.plate}
                              onChange={(val: string) => {
                                const vehicle = vehicles.find((v: Vehicle) => v.plate === val);
                                setFormData({
                                  ...formData, 
                                  identification: {
                                    ...formData.identification, 
                                    plate: val, 
                                    prefix: vehicle?.prefix || formData.identification.prefix,
                                    model: vehicle?.model || formData.identification.model
                                  }
                                });
                              }}
                              options={vehicles.map((v: Vehicle) => v.plate)}
                              placeholder="Selecione a placa..."
                              variant="blue"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Viatura</label>
                            <ChecklistSearchableSelect 
                              label="Viatura"
                              value={formData.identification.prefix}
                              onChange={(val: string) => {
                                const vehicle = vehicles.find((v: Vehicle) => v.prefix === val);
                                setFormData({
                                  ...formData, 
                                  identification: {
                                    ...formData.identification, 
                                    prefix: val, 
                                    plate: vehicle?.plate || formData.identification.plate,
                                    model: vehicle?.model || formData.identification.model
                                  }
                                });
                              }}
                              options={vehicles.map((v: Vehicle) => v.prefix)}
                              placeholder="Selecione a viatura..."
                              variant="blue"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Prefixo Operacional</label>
                            <ChecklistSearchableSelect 
                              label="Prefixo Operacional"
                              value={formData.identification.operationalPrefix}
                              onChange={(val: string) => setFormData({...formData, identification: {...formData.identification, operationalPrefix: val}})}
                              options={[...prefixoVtList, ...moList]}
                              placeholder="Selecione o Prefixo..."
                              variant="blue"
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
                          <ChecklistSearchableSelect 
                            label="Motorista"
                            value={formData.drivers.driverName}
                            onChange={(val: string) => setFormData({...formData, drivers: {...formData.drivers, driverName: val}})}
                            options={personnelList}
                            placeholder="Selecione o Motorista..."
                            variant="blue"
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
                      {CADASTRO_VTR_SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
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
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Observações / Avarias</label>
                          <textarea 
                            placeholder="Descreva aqui qualquer detalhe adicional, avarias em lataria, vidros, bancos, etc."
                            value={formData.checklist.descricaoAlteracoes}
                            onChange={(e) => setFormData({...formData, checklist: {...formData.checklist, descricaoAlteracoes: e.target.value}})}
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
    </div>
  );
}

// --- CadChecking Sub-components ---

function VehicleCard({ 
  vehicle, 
  isAdmin, 
  currentUserEmail, 
  onStartRecord, 
  onToggleMaintenance,
  submitting
}: any) {
  const isAvailable = vehicle.status === 'available';
  const isInUse = vehicle.status === 'in_use';
  const isMaintenance = vehicle.status === 'maintenance';
  
    // Somente o usuário que retirou ou o administrador pode fazer o retorno
    const canCheckOut = isAdmin || (isInUse ? currentUserEmail === vehicle.currentDriverEmail : !!currentUserEmail);

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
            onClick={() => onStartRecord(vehicle, 'check-out')}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="animate-spin" size={18} /> : <LogOut size={18} />}
            Saída
          </button>
        )}
        {isInUse && (
          <div className="flex-1 flex flex-col gap-1">
            <button 
              onClick={() => canCheckOut && onStartRecord(vehicle, 'check-in')}
              disabled={!canCheckOut || submitting}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95 ${
                canCheckOut 
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100' 
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
              } disabled:opacity-50`}
            >
              {submitting ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
              Retorno
            </button>
            {!canCheckOut && (
              <p className="text-[9px] text-red-500 font-bold text-center">
                Apenas quem retirou pode devolver
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

function CadcheckingHistoryItem({ 
  record, 
  isExpanded, 
  onToggle, 
  onResendWhatsApp, 
  onGenerateDetailedPDF 
}: any) {
  const isCheckIn = record.type === 'check-in';
  const isMaintenance = record.type?.includes('maintenance');
  
  let date = new Date();
  try {
    if (record.timestamp?.toDate) {
      date = record.timestamp.toDate();
    } else if (record.timestamp) {
      const t = new Date(record.timestamp);
      if (!isNaN(t.getTime())) {
        date = t;
      }
    }
  } catch (e) {
    console.error("Error parsing timestamp in HistoryItem:", e);
  }

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
              {isCheckIn ? 'Retorno (Check-in)' : isMaintenance ? 'Manutenção' : 'Saída (Check-out)'} • {formattedDate} às {formattedTime}
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
              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={() => onResendWhatsApp(record)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95"
                >
                  <ExternalLink size={18} />
                  WhatsApp
                </button>
                <button 
                  onClick={() => onGenerateDetailedPDF(record)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95"
                >
                  <FileDown size={18} />
                  PDF Detalhado
                </button>
              </div>
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
