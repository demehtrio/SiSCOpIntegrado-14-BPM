import React from 'react';
import { User, LogOut, LayoutDashboard, Car, Shield, Settings, Menu, X } from 'lucide-react';
import { auth } from '@/src/firebase';
import { VTRForm } from './VTRForm';
import { ASSETS } from '@/src/assets/logos';
import { SafeImage } from './SafeImage';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

type View = 'dashboard' | 'vtr' | 'efetivo' | 'config';

export const Dashboard: React.FC<{ user: any }> = ({ user }) => {
  const [currentView, setCurrentView] = React.useState<View>('dashboard');
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'vtr', label: 'Cadastro VTR', icon: Car },
    { id: 'efetivo', label: 'Efetivo', icon: Shield },
    { id: 'config', label: 'Configurações', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row" id="dashboard-container">
      {/* Mobile Header */}
      <div className="md:hidden bg-[#0c1b3d] text-white p-4 flex items-center justify-between sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded-lg p-1">
             <SafeImage src={ASSETS.LOGO_14BPM} className="w-full h-full" />
          </div>
          <span className="font-bold tracking-tight">SisCOpI</span>
        </div>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2">
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-[#0c1b3d] text-white transform transition-transform duration-300 md:relative md:translate-x-0 overflow-y-auto pt-4 flex flex-col",
        isMenuOpen ? "translate-x-0" : "-translate-x-full"
      )} id="sidebar">
        <div className="px-6 mb-10 hidden md:block">
           <div className="flex flex-col items-center">
             <SafeImage src={ASSETS.LOGO_SISCOPI} className="w-40 h-12 mb-4" />
             <div className="h-[1px] w-full bg-white/10"></div>
           </div>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentView(item.id as View);
                setIsMenuOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group text-sm font-medium",
                currentView === item.id 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/50" 
                  : "text-blue-100/60 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon size={20} className={cn(
                "transition-colors",
                currentView === item.id ? "text-white" : "text-blue-100/40 group-hover:text-white"
              )} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 mt-auto">
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-white/20 flex items-center justify-center border-2 border-white/10 shadow-inner">
                {user.photoURL ? (
                   <img src={user.photoURL} alt={user.displayName} />
                ) : (
                  <User size={20} className="text-white/60" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-xs truncate uppercase tracking-wide">{user.displayName || 'Usuário'}</p>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-[10px] text-green-500 font-bold uppercase tracking-wider">Online</span>
                </div>
              </div>
            </div>
            <button 
              onClick={() => auth.signOut()}
              className="w-full h-10 rounded-xl bg-white/10 hover:bg-red-500/20 hover:text-red-300 transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest border border-white/5 hover:border-red-500/30"
            >
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto" id="main-content">
        {/* Content Header */}
        <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-30 hidden md:flex">
          <h2 className="text-xl font-bold text-gray-800 tracking-tight">
            {menuItems.find(i => i.id === currentView)?.label}
          </h2>
          <div className="bg-gray-50 px-3 py-1 rounded-full border border-gray-100 flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">SisCOpI V2.0</span>
          </div>
        </header>

        <div className="p-4 md:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {currentView === 'dashboard' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Summary Cards */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Viaturas Ativas</p>
                    <h3 className="text-3xl font-black text-blue-600 tracking-tight">--</h3>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">Registros Hoje</p>
                    <h3 className="text-3xl font-black text-green-600 tracking-tight">--</h3>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 transition-colors group"
                       onClick={() => setCurrentView('vtr')}>
                    <Car className="text-blue-600 mb-2 group-hover:scale-110 transition-transform" />
                    <p className="text-sm font-bold text-blue-600 underline">Ir para Cadastro VTR</p>
                  </div>
                </div>
              )}

              {currentView === 'vtr' && <VTRForm />}
              
              {currentView === 'efetivo' && (
                <div className="flex flex-col items-center justify-center p-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-3xl">
                  <Shield size={48} className="mb-4 opacity-20" />
                  <p className="font-bold uppercase tracking-widest text-xs">Módulo Efetivo em Reconstrução</p>
                </div>
              )}

              {currentView === 'config' && (
                <div className="flex flex-col items-center justify-center p-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-3xl">
                  <Settings size={48} className="mb-4 opacity-20" />
                  <p className="font-bold uppercase tracking-widest text-xs">Configurações do Sistema</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile overlay */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </div>
  );
};
