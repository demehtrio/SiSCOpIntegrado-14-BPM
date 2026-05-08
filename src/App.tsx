import React from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from './firebase';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { doc, getDocFromServer } from 'firebase/firestore';

const App: React.FC = () => {
  const [user, setUser] = React.useState<User | null>(null);
  const [authReady, setAuthReady] = React.useState(false);
  const [connectionTest, setConnectionTest] = React.useState<'idle' | 'testing' | 'ok' | 'error'>('idle');

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });

    // Test connection as required by integration instructions
    const testConnection = async () => {
      setConnectionTest('testing');
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        setConnectionTest('ok');
        console.log("Firebase connection established.");
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
          setConnectionTest('error');
        } else {
           // Might fail if 'test/connection' doesn't exist, but reaching the server is what matters
           setConnectionTest('ok');
        }
      }
    };
    testConnection();

    return () => unsubscribe();
  }, []);

  if (!authReady) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#0c1b3d]">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div id="app-root">
      <AnimatePresence mode="wait">
        {!user ? (
          <motion.div
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Login />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Dashboard user={user} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
