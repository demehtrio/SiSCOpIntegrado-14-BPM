import React from 'react';
import { motion } from 'motion/react';
import { LogIn } from 'lucide-react';
import { auth } from '@/src/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { ASSETS } from '@/src/assets/logos';
import { SafeImage } from './SafeImage';

export const Login: React.FC = () => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      setError('Erro ao fazer login com Google. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c1b3d] flex flex-col items-center justify-center p-4 relative overflow-hidden" id="login-container">
      {/* Background Decorative patterns */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500 blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-700 blur-3xl"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl relative z-10"
        id="login-card"
      >
        <div className="flex flex-col items-center mb-8" id="login-header">
          <div className="flex justify-between w-full px-4 mb-6">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 }}
              className="w-20 h-20 md:w-24 md:h-24 flex items-center justify-center bg-white/20 rounded-xl p-2"
            >
              <SafeImage
                src={ASSETS.LOGO_PMPE}
                alt="Logo PMPE"
                className="w-full h-full"
              />
            </motion.div>
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3 }}
              className="w-20 h-20 md:w-24 md:h-24 flex items-center justify-center bg-white/20 rounded-xl p-2"
            >
              <SafeImage
                src={ASSETS.LOGO_14BPM}
                alt="Logo 14º BPM"
                className="w-full h-full"
              />
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-center"
          >
            <div className="w-48 h-16 mx-auto mb-2 flex items-center justify-center">
              <SafeImage
                src={ASSETS.LOGO_SISCOPI}
                alt="Logo SISCOPI"
                className="w-full h-full max-h-full"
              />
            </div>
            <h1 className="text-white text-xl font-semibold tracking-tight">SisCOpI - 14º BPM</h1>
            <p className="text-white/60 text-sm mt-1">Sistema de Cadastramento Operacional</p>
          </motion.div>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm text-center" id="login-error">
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full h-14 bg-white hover:bg-gray-100 text-[#0c1b3d] font-bold rounded-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,255,255,0.2)]"
          id="login-button"
        >
          {loading ? (
            <div className="w-6 h-6 border-2 border-[#0c1b3d]/30 border-t-[#0c1b3d] rounded-full animate-spin"></div>
          ) : (
            <>
              <LogIn className="w-5 h-5" />
              <span>Entrar com Google</span>
            </>
          )}
        </button>

        <p className="mt-8 text-white/40 text-[10px] text-center uppercase tracking-[0.2em]">
          Polícia Militar de Pernambuco
        </p>
      </motion.div>
    </div>
  );
};
