import { useEffect, useState, Suspense, lazy } from 'react';
import liff from '@line/liff';
import axios from 'axios';
import { ApiResponse } from '../shared/types';
import FullScreenLoading from './components/FullScreenLoading';
import { setToken, clearToken, getLineUid, setLineUid, clearLineUid } from './auth';

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
const DelegatePage = lazy(() => import('./pages/DelegatePage'));

type AppState = 'INIT' | 'BINDING' | 'DASHBOARD' | 'CHECK_IN' | 'CHECK_IN_NOW' | 'AUDIT' | 'SETTINGS' | 'USAGES' | 'SALARY' | 'TEAM_ATTENDANCE' | 'SCHEDULE' | 'DELEGATE';

export const App = () => {
  const [state, setState] = useState<AppState>('INIT');
  const [lineUserId, setLineUserId] = useState<string>('');
  const [empId, setEmpId] = useState<string>('');
  const [debugMsg, setDebugMsg] = useState<string>('Initializing...');
  // 代理模式：非 null 時，功能頁以此對象身分操作（薪資 / 個人設定除外）。
  // 注意：JWT token 仍是本人（actor），只是請求帶的 lineUserId 換成代理對象（target）。
  const [actingAs, setActingAs] = useState<{ lineUserId: string; empId: string } | null>(null);

  const effectiveLineUserId = actingAs ? actingAs.lineUserId : lineUserId;

  // Global API Error Handling (403 -> Binding)
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        const status = error.response && error.response.status;
        if (status === 401) {
          // Token missing/expired/invalid: drop it, exit proxy mode, send user back to bind.
          console.warn('401 detected, clearing token and redirecting to binding');
          clearToken();
          setActingAs(null);
          setState('BINDING');
          window.history.replaceState({ page: 'BINDING' }, '', '#binding');
        } else if (status === 403) {
          console.warn('403 detected, redirecting to binding page');
          setActingAs(null);
          setState('BINDING');
          window.history.replaceState({ page: 'BINDING' }, '', '#binding');
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

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

  // Handle Re-entering the app (Foreground)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && lineUserId) {
        console.log('App back to foreground, re-checking status...');
        checkBinding(lineUserId);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [lineUserId]);

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

        // PWA/standalone：LIFF 的 access token 在 app 關閉後即失效，會逼每次重做 LINE 登入。
        // 若本機已記住 lineUserId，直接用它走 check-binding（公開端點、會回新的 7 天 token），
        // 完全略過 liff.login()。只有從沒登入過（無快取）時才走 LINE 登入。
        const cachedUid = getLineUid();
        if (cachedUid) {
          setLineUserId(cachedUid);
          checkBinding(cachedUid);
          return;
        }

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        const userId = profile.userId;

        if (userId) {
            setLineUserId(userId);
            setLineUid(userId); // 記住，下次開啟免 LINE 登入
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
        setToken(res.data.data.token);
        
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
      {actingAs && (
        <div style={{ position: 'sticky', top: 0, zIndex: 1000, background: '#E67E22', color: '#fff', padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, fontWeight: 'bold' }}>
          <span>⚠️ 代理中：{actingAs.empId}（薪資/設定仍為本人）</span>
          <button type="button" onClick={() => setActingAs(null)} style={{ color: '#fff', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: 0 }}>退出</button>
        </div>
      )}
      {state === 'INIT' && <InitPage debugMsg={debugMsg} />}
      
      {state === 'BINDING' && (
        <BindingPage lineUserId={lineUserId} onSuccess={() => checkBinding(lineUserId)} />
      )}

      {state === 'DASHBOARD' && (
        <DashboardPage
          empId={empId}
          lineUserId={effectiveLineUserId}
          onNavigate={(page) => navigate(page)}
        />
      )}

      {state === 'CHECK_IN_NOW' && (
        <CheckInNowPage lineUserId={effectiveLineUserId} onBack={back} />
      )}

      {state === 'CHECK_IN' && (
        <CheckInPage lineUserId={effectiveLineUserId} onBack={back} />
      )}

      {state === 'AUDIT' && (
        <AuditPage lineUserId={effectiveLineUserId} onBack={back} />
      )}

      {state === 'SALARY' && (
        <SalaryPage lineUserId={lineUserId} onBack={back} />
      )}

      {state === 'TEAM_ATTENDANCE' && (
        <TeamAttendancePage lineUserId={effectiveLineUserId} onBack={back} />
      )}

      {state === 'SCHEDULE' && (
        <SchedulePage lineUserId={effectiveLineUserId} onBack={back} />
      )}

      {state === 'SETTINGS' && (
        <SettingsPage 
          lineUserId={lineUserId}
          empId={empId} 
          onBack={back} 
          onLogout={() => {
            clearToken();
            clearLineUid(); // 完整登出：清掉快取，下次開啟回到 LINE 登入
            setActingAs(null);
            setState('BINDING');
            window.history.replaceState({ page: 'BINDING' }, '', '#binding');
          }}
        />
      )}

      {state === 'USAGES' && (
        <AdminPage onBack={back} />
      )}

      {state === 'DELEGATE' && (
        <DelegatePage
          onBack={back}
          onEnterProxy={(target) => { setActingAs(target); navigate('DASHBOARD'); }}
        />
      )}
    </Suspense>
  );
}