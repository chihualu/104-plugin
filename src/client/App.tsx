import { useEffect, useState, Suspense, lazy } from 'react';
import liff from '@line/liff';
import axios from 'axios';
import { ApiResponse } from '../shared/types';
import FullScreenLoading from './components/FullScreenLoading';

// Lazy load pages
const InitPage = lazy(() => import('./pages/InitPage'));
const BindingPage = lazy(() => import('./pages/BindingPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CheckInPage = lazy(() => import('./pages/CheckInPage'));
const CheckInNowPage = lazy(() => import('./pages/CheckInNowPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const SalaryPage = lazy(() => import('./pages/SalaryPage_Modern'));
const TeamAttendancePage = lazy(() => import('./pages/TeamAttendancePage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));

type AppState = 'INIT' | 'BINDING' | 'DASHBOARD' | 'CHECK_IN' | 'CHECK_IN_NOW' | 'AUDIT' | 'SETTINGS' | 'USAGES' | 'SALARY' | 'TEAM_ATTENDANCE' | 'SCHEDULE';

export const App = () => {
  const [state, setState] = useState<AppState>('INIT');
  const [lineUserId, setLineUserId] = useState<string>('');
  const [empId, setEmpId] = useState<string>('');
  const [debugMsg, setDebugMsg] = useState<string>('Initializing...');

  // Handle Browser Back / Swipe Gestures
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.page) {
        setState(event.state.page);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (page: AppState) => {
    setState(page);
    window.history.pushState({ page }, '', `#${page.toLowerCase()}`);
  };

  const back = () => {
    window.history.back();
  };

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
        
        // Deep Linking Logic: Check if URL has a hash matching a page state
        const initialHash = window.location.hash.substring(1).toUpperCase();
        const validStates: AppState[] = ['CHECK_IN', 'CHECK_IN_NOW', 'AUDIT', 'SETTINGS', 'SALARY', 'TEAM_ATTENDANCE', 'SCHEDULE'];
        
        if (validStates.includes(initialHash as any)) {
            setState(initialHash as AppState);
            window.history.replaceState({ page: initialHash }, '', `#${initialHash.toLowerCase()}`);
        } else {
            setState('DASHBOARD');
            window.history.replaceState({ page: 'DASHBOARD' }, '', '#dashboard');
        }
      } else {
        setState('BINDING');
        window.history.replaceState({ page: 'BINDING' }, '', '#binding');
      }
    } catch (err: any) {
      console.error(err);
      setState('BINDING'); 
      window.history.replaceState({ page: 'BINDING' }, '', '#binding');
    }
  };

  return (
    <Suspense fallback={<FullScreenLoading text='載入頁面中...' />}>
      {state === 'INIT' && <InitPage debugMsg={debugMsg} />}
      
      {state === 'BINDING' && (
        <BindingPage lineUserId={lineUserId} onSuccess={() => checkBinding(lineUserId)} />
      )}

      {state === 'DASHBOARD' && (
        <DashboardPage 
          empId={empId} 
          lineUserId={lineUserId}
          onNavigate={(page) => navigate(page)} 
        />
      )}

      {state === 'CHECK_IN_NOW' && (
        <CheckInNowPage lineUserId={lineUserId} onBack={back} />
      )}

      {state === 'CHECK_IN' && (
        <CheckInPage lineUserId={lineUserId} onBack={back} />
      )}

      {state === 'AUDIT' && (
        <AuditPage lineUserId={lineUserId} onBack={back} />
      )}

      {state === 'SALARY' && (
        <SalaryPage lineUserId={lineUserId} onBack={back} />
      )}

      {state === 'TEAM_ATTENDANCE' && (
        <TeamAttendancePage lineUserId={lineUserId} onBack={back} />
      )}

      {state === 'SCHEDULE' && (
        <SchedulePage lineUserId={lineUserId} onBack={back} />
      )}

      {state === 'SETTINGS' && (
        <SettingsPage 
          lineUserId={lineUserId}
          empId={empId} 
          onBack={back} 
          onLogout={() => {
            setState('BINDING');
            window.history.replaceState({ page: 'BINDING' }, '', '#binding');
          }}
        />
      )}

      {state === 'USAGES' && (
        <AdminPage onBack={back} />
      )}
    </Suspense>
  );
}