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
const CheckInNowPage = lazy(() => import('./pages/CheckInNowPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const SalaryPage = lazy(() => import('./pages/SalaryPage'));

type AppState = 'INIT' | 'BINDING' | 'DASHBOARD' | 'CHECK_IN' | 'CHECK_IN_NOW' | 'AUDIT' | 'SETTINGS' | 'USAGES' | 'SALARY';

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

        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        const userId = profile.userId;

        if (userId) {
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
      setState('BINDING'); 
    }
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
        <BindingPage lineUserId={lineUserId} onSuccess={() => checkBinding(lineUserId)} />
      )}

      {state === 'DASHBOARD' && (
        <DashboardPage empId={empId} onNavigate={(page) => setState(page)} />
      )}

      {state === 'CHECK_IN_NOW' && (
        <CheckInNowPage lineUserId={lineUserId} onBack={() => setState('DASHBOARD')} />
      )}

      {state === 'CHECK_IN' && (
        <CheckInPage lineUserId={lineUserId} onBack={() => setState('DASHBOARD')} />
      )}

      {state === 'AUDIT' && (
        <AuditPage lineUserId={lineUserId} onBack={() => setState('DASHBOARD')} />
      )}

      {state === 'SALARY' && (
        <SalaryPage lineUserId={lineUserId} onBack={() => setState('DASHBOARD')} />
      )}

      {state === 'SETTINGS' && (
        <SettingsPage 
          lineUserId={lineUserId}
          empId={empId} 
          onBack={() => setState('DASHBOARD')} 
          onLogout={() => setState('BINDING')}
        />
      )}

      {state === 'USAGES' && (
        <AdminPage onBack={() => setState('DASHBOARD')} />
      )}
    </Suspense>
  );
}
