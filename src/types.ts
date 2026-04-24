import { Timestamp } from 'firebase/firestore';

export interface Vehicle {
  id: string;
  prefix: string;
  plate: string;
  model: string;
  status: 'available' | 'in_use' | 'maintenance' | 'inactive';
  lastMileage: number;
  currentDriver?: string | null;
  currentDriverEmail?: string | null;
  category?: 'car' | 'moto';
}

export interface ChecklistData {
  mapaDiario: string;
  limpeza: string;
  equipamentos: string[];
  luzFarolAlto: string;
  luzFarolBaixo: string;
  luzLanterna: string;
  luzPlaca: string;
  luzFreioLanternaTraseira: string[];
  pneus: string;
  sistemaFreio: string;
  oleoMotor: string;
  proxTrocaOleoKm: string;
  sistemaTracao: string;
  partesInternas: string[];
  partesExternas: string[];
  descricaoAlteracoes: string;
  fotos: string[];
}

export interface RecordEntry {
  id?: string;
  vehicleId: string;
  type: 'check-out' | 'check-in' | 'maintenance-in' | 'maintenance-out';
  timestamp: Date | Timestamp | any;
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
    currentMileage: number | string;
    notes: string;
  };
  checklist?: ChecklistData;
  source?: 'cadchecking' | 'cadastro_vtr' | 'standalone_checklist' | 'checklist_module';
}

export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'user';
  displayName?: string;
}
