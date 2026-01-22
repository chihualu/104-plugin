import { useEffect, useState, Suspense, lazy } from 'react';
import liff from '@line/liff';
import { AutoCenter, Toast } from 'antd-mobile';
import { LoopOutline } from 'antd-mobile-icons';
import axios from 'axios';
import { ApiResponse } from '../shared/types';

// Lazy load pages
const InitPage = lazy(() => import('./pages/InitPage'));
const BindingPage = lazy(() => import('./pages/BindingPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CheckInPage = lazy(() => import('./pages/CheckInPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

type AppState = 'INIT' | 'BINDING' | 'DASHBOARD' | 'CHECK_IN' | 'AUDIT' | 'SETTINGS' | 'ADMIN';

export const App = () => {
  const [state, setState] = useState<AppState>('INIT');
  const [lineUserId, setLineUserId] = useState<string>('');
  const [empId, setEmpId] = useState<string>('');
  const [debugMsg, setDebugMsg] = useState<string>('Initializing...');

  useEffect(() => {
    const initLiff = async () => {
      try {
        const liffId = import.meta.env.VITE_LIFF_ID;
        setDebugMsg(`LIFF ID: ${liffId?.substring(0, 5)}...`);
        
        if (!liffId || liffId === 'YOUR_LIFF_ID') {
          setDebugMsg('Using Mock Mode');
          const mockUserId = 'U_MOCK_USER_FOR_DEV';
          setLineUserId(mockUserId);
          checkBinding(mockUserId);
          return;
        }

        setDebugMsg('Calling liff.init()...');
        await liff.init({ liffId });
        setDebugMsg('LIFF init done. Checking login...');

        if (!liff.isLoggedIn()) {
          setDebugMsg('Not logged in. Redirecting...');
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        const userId = profile.userId;

        if (userId) {
            setDebugMsg(`Got UserID: ${userId}. Checking binding...`);
            setLineUserId(userId);
            checkBinding(userId);
        }

      } catch (error: any) {
        setDebugMsg(`Error: ${error.message}`);
        console.error('LIFF Init Error:', error);
      }
    };
    initLiff();
  }, []);

  const checkBinding = async (uid: string) => {
    try {
      const res = await axios.get<ApiResponse>(`/api/check-binding?lineUserId=${uid}`);
      if (res.data.success && res.data.data.isBound) {
        setEmpId(res.data.data.empId);
        setState('DASHBOARD');
      } else {
        setState('BINDING');
      }
    } catch (err: any) {
      console.error(err);
      Toast.show(`連線錯誤: ${err.message}`);
      setState('BINDING'); 
    }
  };

  const handleLogout = () => {
    setState('BINDING');
  };

  const LoadingFallback = (
    <AutoCenter style={{ marginTop: 50 }}>
      <LoopOutline fontSize={48} spin />
    </AutoCenter>
  );

  return (
    <Suspense fallback={LoadingFallback}>
      {state === 'INIT' && <InitPage debugMsg={debugMsg} />}
      
      {state === 'BINDING' && (
        <BindingPage 
          lineUserId={lineUserId} 
          onSuccess={() => {
            // Re-check binding to get empId
            checkBinding(lineUserId);
          }} 
        />
      )}

      {state === 'DASHBOARD' && (
        <DashboardPage 
          empId={empId} 
          onNavigate={(page) => setState(page)} 
        />
      )}

      {state === 'CHECK_IN' && (
        <CheckInPage 
          lineUserId={lineUserId} 
          onBack={() => setState('DASHBOARD')} 
        />
      )}

      {state === 'AUDIT' && (
        <AuditPage 
          lineUserId={lineUserId} 
          onBack={() => setState('DASHBOARD')} 
        />
      )}

      {state === 'SETTINGS' && (
        <SettingsPage 
          empId={empId} 
          onBack={() => setState('DASHBOARD')} 
          onLogout={handleLogout}
        />
      )}

      {state === 'ADMIN' && (
        <AdminPage 
          onBack={() => setState('DASHBOARD')}
        />
      )}
    </Suspense>
  );
}
