import React from 'react';
import { db, auth } from '@/src/firebase';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  query, 
  onSnapshot,
  getDocs,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import { 
  Vehicle, 
  RecordEntry
} from '@/src/types';
import {
  OME_ORIGEM,
  PERSONNEL_LIST,
  OPERATIONAL_PREFIXES,
  TIPO_SERVICO_VT_LIST
} from '@/src/constants';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Save, 
  MessageCircle, 
  Car, 
  Hash, 
  User, 
  Navigation, 
  Calendar, 
  Clock, 
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  History
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { handleFirestoreError, OperationType } from '@/src/utils/firestoreErrors';

export const VTRForm: React.FC = () => {
  const [vehicles, setVehicles] = React.useState<Vehicle[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Form State
  const [selectedVehicle, setSelectedVehicle] = React.useState<Vehicle | null>(null);
  const [driverName, setDriverName] = React.useState('');
  const [operationalPrefix, setOperationalPrefix] = React.useState('');
  const [serviceType, setServiceType] = React.useState('Ordinário');
  const [mileage, setMileage] = React.useState<string>('');
  const [isCheckout, setIsCheckout] = React.useState(true);

  React.useEffect(() => {
    const q = query(collection(db, 'vehicles'), orderBy('prefix'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const vehicleList: Vehicle[] = [];
      snapshot.forEach((doc) => {
        vehicleList.push({ id: doc.id, ...doc.data() } as Vehicle);
      });
      setVehicles(vehicleList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'vehicles');
    });

    return () => unsubscribe();
  }, []);

  const handleVehicleSelect = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setMileage(vehicle.lastMileage.toString());
    setIsCheckout(vehicle.status === 'available');
  };

  const formatDriverName = (name: string) => {
    // Standard format in PERSONNEL_LIST is "RANK NAME PATRIMONY" or "RANK NAME MATRICULA"
    // Usually ends with XXXXXX-X or XXXXXX
    const parts = name.split(' ');
    if (parts.length < 2) return name;
    
    // Check if the last part is the matricula/registration
    const lastPart = parts[parts.length - 1];
    if (/\d+-\d+|\d+/.test(lastPart)) {
      const namePart = parts.slice(0, -1).join(' ');
      return `${namePart} / ${lastPart}`;
    }
    return name;
  };

  const generateWhatsAppMessage = (record: RecordEntry) => {
    const isRetorno = record.type === 'check-in' || record.type === 'maintenance-in';
    const header = isRetorno ? 'CADASTRO VTR - RETORNO' : 'CADASTRO VTR - SAÍDA';
    const formattedDriver = formatDriverName(record.drivers.driverName);
    
    // Exact format requested by user
    return encodeURIComponent(
`${header}

🚩 Patrimônio: ${record.identification.prefix}
🔢 Placa: ${record.identification.plate}
🏷️ Opm/Prefixo: ${record.identification.operationalPrefix}
🚔 Modelo: ${record.identification.model}
⏲️ KM: ${record.mileage.currentMileage} km
📅 Data: ${record.identification.date} 
🕒 Hora: ${record.identification.time} 
👮 Responsável: ${formattedDriver}

Gerado via SisCOpI - ${OME_ORIGEM}`
    );
  };

  const handleSubmit = async (sendWhatsApp: boolean = false) => {
    if (!selectedVehicle || !driverName || !operationalPrefix || !mileage) {
      setMessage({ type: 'error', text: 'Por favor, preencha todos os campos obrigatórios.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const now = new Date();
      const recordType = isCheckout ? 'check-out' : 'check-in';
      
      const record: RecordEntry = {
        vehicleId: selectedVehicle.id,
        type: recordType,
        timestamp: serverTimestamp(),
        userEmail: auth.currentUser?.email || 'unknown',
        userName: auth.currentUser?.displayName || 'Sistema',
        identification: {
          prefix: selectedVehicle.prefix,
          operationalPrefix: operationalPrefix,
          plate: selectedVehicle.plate,
          model: selectedVehicle.model,
          date: format(now, 'dd/MM/yyyy'),
          time: format(now, 'HH:mm'),
        },
        drivers: {
          driverName: driverName,
          serviceType: serviceType,
        },
        mileage: {
          currentMileage: parseInt(mileage),
          notes: '',
        },
        source: 'cadastro_vtr'
      };

      // 1. Create the record
      await addDoc(collection(db, 'records'), record);

      // 2. Update vehicle status and mileage
      const vehicleRef = doc(db, 'vehicles', selectedVehicle.id);
      await updateDoc(vehicleRef, {
        status: isCheckout ? 'in_use' : 'available',
        lastMileage: parseInt(mileage),
        currentDriver: isCheckout ? driverName : null,
        currentDriverEmail: isCheckout ? auth.currentUser?.email : null
      });

      // 3. Create notification for WhatsApp share if that's what triggers the logic
      // (The user said "Salvar e Enviar WhatsApp")
      if (sendWhatsApp) {
         const waUrl = `https://wa.me/?text=${generateWhatsAppMessage(record)}`;
         setTimeout(() => {
           window.open(waUrl, '_blank');
         }, 100);
      }

      setMessage({ type: 'success', text: 'Dados salvos com sucesso!' });
      
      // Reset form
      setSelectedVehicle(null);
      setDriverName('');
      setOperationalPrefix('');
      setMileage('');
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.CREATE, 'records');
      setMessage({ type: 'error', text: 'Erro ao salvar os dados. Verifique sua conexão.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6" id="vtr-form-container">
      <div className="mb-8 overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100" id="vehicle-selector">
        <div className="bg-blue-600 p-4 text-white flex items-center gap-2">
          <Car size={20} />
          <h2 className="font-semibold">Selecione a Viatura</h2>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[300px] overflow-y-auto">
          {vehicles.map((v) => (
            <button
              key={v.id}
              onClick={() => handleVehicleSelect(v)}
              className={cn(
                "p-3 rounded-xl border-2 transition-all text-left flex flex-col gap-1",
                selectedVehicle?.id === v.id 
                  ? "border-blue-600 bg-blue-50" 
                  : "border-gray-100 hover:border-gray-200 bg-gray-50"
              )}
            >
              <span className="text-[10px] uppercase font-bold text-gray-400">{v.plate}</span>
              <span className="font-bold text-sm truncate">{v.prefix}</span>
              <span className={cn(
                "text-[10px] font-medium px-2 py-0.5 rounded-full w-fit",
                v.status === 'available' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              )}>
                {v.status === 'available' ? 'Disponível' : 'Em Uso'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectedVehicle && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
            id="vtr-inputs"
          >
            <div className="bg-white rounded-2xl p-6 shadow-xl border border-gray-100 relative overflow-hidden">
               <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                    <History size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 capitalize">
                      {isCheckout ? 'Cadastro de Saída' : 'Cadastro de Retorno'}
                    </h3>
                    <p className="text-sm text-gray-500">{selectedVehicle.prefix} - {selectedVehicle.model}</p>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* Driver Selection */}
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                      <User size={12} /> Motorista Responsável
                    </label>
                    <select
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none"
                    >
                      <option value="">Selecione...</option>
                      {PERSONNEL_LIST.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                 </div>

                 {/* Operational Prefix */}
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                      <Navigation size={12} /> Prefixo Operacional (OPM)
                    </label>
                    <select
                      value={operationalPrefix}
                      onChange={(e) => setOperationalPrefix(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none"
                    >
                      <option value="">Selecione...</option>
                      {OPERATIONAL_PREFIXES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                 </div>

                 {/* Service Type */}
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                      <Clock size={12} /> Tipo de Serviço
                    </label>
                    <select
                      value={serviceType}
                      onChange={(e) => setServiceType(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none"
                    >
                      {TIPO_SERVICO_VT_LIST.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                 </div>

                 {/* Mileage */}
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                      <Hash size={12} /> Quilometragem (KM)
                    </label>
                    <input
                      type="number"
                      value={mileage}
                      onChange={(e) => setMileage(e.target.value)}
                      placeholder={`Km Atual: ${selectedVehicle.lastMileage}`}
                      className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                 </div>
               </div>

               {message && (
                 <div className={cn(
                   "mt-6 p-4 rounded-xl flex items-center gap-3",
                   message.type === 'success' ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
                 )}>
                   {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                   <span className="text-sm font-medium">{message.text}</span>
                 </div>
               )}

               <div className="mt-8 flex flex-col sm:flex-row gap-4" id="form-actions">
                 <button
                   onClick={() => handleSubmit(false)}
                   disabled={saving}
                   className="flex-1 h-14 bg-gray-900 hover:bg-black text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                 >
                   {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save size={20} />}
                   Salvar Registro
                 </button>
                 <button
                   onClick={() => handleSubmit(true)}
                   disabled={saving}
                   className="flex-1 h-14 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-green-200"
                 >
                   {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle size={20} />}
                   Salvar e Enviar WhatsApp
                 </button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Loader2 = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={cn("lucide lucide-loader-2", className)}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);
