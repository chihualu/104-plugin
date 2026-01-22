import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { Button, Form, Input, Toast, AutoCenter, Calendar, Selector, Grid, Card, Space, NavBar, CheckList } from 'antd-mobile';
import axios from 'axios';
import { BindPayload, CheckInPayload, ApiResponse } from '../shared/types';
import { CheckCircleOutline, LoopOutline, CalendarOutline, FileOutline, SetOutline } from 'antd-mobile-icons';

// 狀態定義
type AppState = 'INIT' | 'BINDING' | 'DASHBOARD' | 'CHECK_IN' | 'AUDIT' | 'SETTINGS';

export const App = () => {
  // 1. 所有 Hooks 必須在頂層宣告
  const [state, setState] = useState<AppState>('INIT');
  const [lineUserId, setLineUserId] = useState<string>('');
  const [empId, setEmpId] = useState<string>('');
  const [debugMsg, setDebugMsg] = useState<string>('Initializing...');

  // Binding State
  const [companies, setCompanies] = useState<any[]>([]);
  const [fetchingCompanies, setFetchingCompanies] = useState(false);

  // CheckIn State
  const [dates, setDates] = useState<Date[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [startTime, setStartTime] = useState('08:45');
  const [endTime, setEndTime] = useState('17:45');
  const [reason, setReason] = useState('忘記打卡');

  // Audit State
  const [auditList, setAuditList] = useState<any[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // 2. Effects
  // 初始化 LIFF
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
        } else {
            setDebugMsg('No User ID found');
            Toast.show('無法取得 LINE User ID');
        }

      } catch (error: any) {
        setDebugMsg(`Error: ${error.message}`);
        console.error('LIFF Init Error:', error);
      }
    };
    initLiff();
  }, []);

  // Audit List Fetching
  useEffect(() => {
    if (state === 'AUDIT' && lineUserId) {
      setLoadingAudit(true);
      axios.get(`/api/audit/list?lineUserId=${lineUserId}`)
        .then(res => {
          if (res.data.success) {
            const list = Array.isArray(res.data.data) ? res.data.data : [];
            setAuditList(list);
            setSelectedKeys(list.filter((i: any) => i.EnWorksheetDataID).map((i: any) => i.EnWorksheetDataID));
          }
        })
        .catch(err => {
          console.error(err);
          Toast.show('無法取得簽核清單');
        })
        .finally(() => setLoadingAudit(false));
    }
  }, [state, lineUserId]);

  // 3. Helper Functions
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

  const fetchCompanies = async (groupUBINo: string) => {
    if (!groupUBINo) return;
    setFetchingCompanies(true);
    try {
      const res = await axios.get(`/api/companies?groupUBINo=${groupUBINo}`);
      if (res.data.success) {
        setCompanies(res.data.data);
        if (res.data.data.length === 0) Toast.show('查無公司資料');
      }
    } catch (err) {
      Toast.show('查詢失敗');
    } finally {
      setFetchingCompanies(false);
    }
  };

  const onBind = async (values: any) => {
    try {
      Toast.show({ icon: 'loading', content: '驗證中...' });
      const payload = {
        lineUserId,
        groupUBINo: values.groupUBINo,
        companyID: values.companyID[0], 
        empId: values.empId,
        password: values.password
      };
      
      const res = await axios.post<ApiResponse>('/api/bind', payload);
      if (res.data.success) {
        Toast.show({ icon: 'success', content: '綁定成功' });
        setState('DASHBOARD');
      }
    } catch (err) {
      Toast.show({ icon: 'fail', content: '驗證失敗，請檢查帳號密碼' });
    }
  };

  const onCheckIn = async () => {
    if (!dates || dates.length === 0) {
       Toast.show('請選擇日期');
       return;
    }
    
    try {
      Toast.show({ icon: 'loading', content: '申請中...' });
      const payload: CheckInPayload = {
        lineUserId,
        dates: dates.map(d => d.toISOString().split('T')[0]),
        timeStart: startTime,
        timeEnd: endTime,
        reason: reason
      };

      const res = await axios.post<ApiResponse>('/api/check-in', payload);
      if (res.data.success) {
        Toast.show({ icon: 'success', content: '申請成功！' });
        setDates([]);
        setState('DASHBOARD');
      }
    } catch (err) {
      Toast.show({ icon: 'fail', content: '申請失敗' });
    }
  };

  const onApprove = async () => {
    if (selectedKeys.length === 0) return;
    try {
      Toast.show({ icon: 'loading', content: '簽核中...' });
      const res = await axios.post('/api/audit/approve', {
        lineUserId,
        approvalKeys: selectedKeys
      });
      if (res.data.success) {
        Toast.show({ icon: 'success', content: res.data.message });
        setState('DASHBOARD'); 
      }
    } catch (err) {
      Toast.show({ icon: 'fail', content: '簽核失敗' });
    }
  };

  // 4. Render Logic (Conditional Rendering)

  if (state === 'INIT') {
    return (
      <AutoCenter style={{ marginTop: 50, flexDirection: 'column' }}>
        <LoopOutline fontSize={48} />
        <div style={{ marginTop: 20 }}>載入中...</div>
        <div style={{ marginTop: 10, color: '#666', fontSize: 12 }}>{debugMsg}</div>
        <Button size='small' color='primary' fill='outline' style={{ marginTop: 20 }} onClick={() => window.location.reload()}>重新整理</Button>
      </AutoCenter>
    );
  }

  if (state === 'BINDING') {
    return (
      <div style={{ padding: 20 }}>
        <h1>104 eHR 綁定</h1>
        <p>請輸入統編後點擊查詢，並選擇公司。</p>
        <Form 
          onFinish={onBind} 
          initialValues={{ groupUBINo: '70584647' }}
          footer={<Button block type='submit' color='primary' size='large' disabled={companies.length === 0}>綁定帳號</Button>}
        >
          <Form.Item 
            name='groupUBINo' 
            label='公司統編' 
            rules={[{ required: true, len: 8, message: '統編應為8碼' }]}
            help={fetchingCompanies ? '正在查詢公司資料...' : (companies.length > 0 ? `已找到 ${companies.length} 筆公司` : null)}
            extra={
              <a onClick={() => {
                const input = document.querySelector('input[placeholder="例如: 12345678"]') as HTMLInputElement;
                if (input && input.value) fetchCompanies(input.value);
              }}>查詢</a>
            }
          >
            <Input 
              placeholder='例如: 12345678' 
              maxLength={8}
              onBlur={(e) => {
                if (e.target.value.length === 8) fetchCompanies(e.target.value);
              }}
            />
          </Form.Item>

          {companies.length > 0 && (
            <Form.Item name='companyID' label='選擇公司' rules={[{ required: true }]}>
              <Selector
                columns={1}
                options={companies.map(c => ({ label: c.COMPANY_CNAME, value: c.COMPANY_ID }))}
              />
            </Form.Item>
          )}

          <Form.Item name='empId' label='員工編號' rules={[{ required: true }]}>
            <Input placeholder='例如: A0676' />
          </Form.Item>
          <Form.Item name='password' label='密碼' rules={[{ required: true }]}>
            <Input type='password' placeholder='請輸入密碼' />
          </Form.Item>
        </Form>
      </div>
    );
  }

  if (state === 'DASHBOARD') {
    return (
      <div style={{ padding: 20, background: '#f5f5f5', minHeight: '100vh' }}>
        <AutoCenter style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>104 eHR 助手</h2>
        </AutoCenter>

        <Card title='使用者資訊' style={{ marginBottom: 20 }}>
          <Space align='center'>
             <CheckCircleOutline color='var(--adm-color-success)' fontSize={24} />
             <span style={{ fontSize: 18, fontWeight: 'bold' }}>{empId}</span>
             <span style={{ color: '#666' }}>服務運行中</span>
          </Space>
        </Card>

        <Grid columns={2} gap={16}>
          <Grid.Item onClick={() => setState('AUDIT')}>
            <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
               <FileOutline fontSize={32} color='#ff4d4f' />
               <div style={{ marginTop: 8 }}>自動表單簽核</div>
            </Card>
          </Grid.Item>

          <Grid.Item onClick={() => setState('CHECK_IN')}>
            <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
               <CalendarOutline fontSize={32} color='#1677ff' />
               <div style={{ marginTop: 8 }}>補打卡</div>
            </Card>
          </Grid.Item>
          
          <Grid.Item onClick={() => setState('SETTINGS')}>
            <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
               <SetOutline fontSize={32} color='#722ed1' />
               <div style={{ marginTop: 8 }}>個人設定</div>
            </Card>
          </Grid.Item>
        </Grid>

        <div style={{ marginTop: 40, textAlign: 'center', color: '#999', fontSize: 12 }}>
          v1.0.0 @ 104 eHR Optimization
        </div>
      </div>
    );
  }

  if (state === 'CHECK_IN') {
    return (
      <div style={{ background: '#fff', minHeight: '100vh' }}>
        <NavBar onBack={() => setState('DASHBOARD')}>補打卡申請</NavBar>
        <div style={{ padding: 20 }}>
          
          <Card title='1. 選擇日期' style={{ marginBottom: 16 }}>
            <Button onClick={() => setShowCalendar(true)} block fill='outline'>
              {dates.length > 0 ? `已選 ${dates.length} 天` : '點此選擇日期'}
            </Button>
            {showCalendar && (
              <div style={{ marginTop: 10 }}>
                <div className='custom-calendar'>
                  <Calendar
                    selectionMode='single'
                    val={null}
                    onChange={() => {}} // Disable default selection
                    renderDate={(date) => {
                      const dStr = date.toISOString().split('T')[0];
                      const isSelected = dates.some(d => d.toISOString().split('T')[0] === dStr);
                      return (
                        <div
                          className="adm-calendar-date-content"
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent parent click
                            if (isSelected) {
                              setDates(dates.filter(d => d.toISOString().split('T')[0] !== dStr));
                            } else {
                              setDates([...dates, date]);
                            }
                          }}
                          style={{
                            background: isSelected ? 'var(--adm-color-primary)' : 'transparent',
                            color: isSelected ? '#fff' : 'inherit',
                            borderRadius: 4,
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                            height: '100%'
                          }}
                        >
                          {date.getDate()}
                        </div>
                      );
                    }}
                  />
                </div>
                <Button block fill='none' onClick={() => setShowCalendar(false)}>確定日期</Button>
              </div>
            )}
          </Card>

          <Card title='2. 填寫時間與事由' style={{ marginBottom: 16 }}>
             <Form layout='horizontal'>
                <Form.Item label='上班時間'>
                  <Input type='time' value={startTime} onChange={setStartTime} />
                </Form.Item>
                <Form.Item label='下班時間'>
                  <Input type='time' value={endTime} onChange={setEndTime} />
                </Form.Item>
                <Form.Item label='補卡事由'>
                  <Input value={reason} onChange={setReason} placeholder='例如: 忘記打卡' />
                </Form.Item>
             </Form>
          </Card>

          <Button 
            block 
            color='primary' 
            size='large' 
            onClick={onCheckIn} 
            disabled={dates.length === 0}
          >
            送出申請 ({dates.length}筆) - {startTime}至{endTime}
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'AUDIT') {
    return (
      <div style={{ background: '#f5f5f5', minHeight: '100vh', paddingBottom: 80 }}>
        <NavBar onBack={() => setState('DASHBOARD')}>自動表單簽核</NavBar>
        
        {loadingAudit ? (
          <AutoCenter style={{ marginTop: 50, flexDirection: 'column' }}>
            <LoopOutline fontSize={48} spin />
            <div style={{ marginTop: 20 }}>讀取中...</div>
          </AutoCenter>
        ) : (
          <div style={{ padding: 12 }}>
            {auditList.length === 0 ? (
              <AutoCenter style={{ marginTop: 50 }}>目前沒有待簽核文件</AutoCenter>
            ) : (
              <>
                <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <span>共 {auditList.length} 筆</span>
                   <Button size='mini' onClick={() => {
                     if (selectedKeys.length === auditList.length) setSelectedKeys([]);
                     else setSelectedKeys(auditList.map(i => i.EnWorksheetDataID));
                   }}>
                     {selectedKeys.length === auditList.length ? '取消全選' : '全選'}
                   </Button>
                </div>

                <div style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}>
                  <CheckList
                    multiple
                    value={selectedKeys}
                    onChange={v => setSelectedKeys(v)}
                  >
                    {auditList.map((item, idx) => (
                      <CheckList.Item key={item.EnWorksheetDataID || idx} value={item.EnWorksheetDataID || `unknown_${idx}`}>
                        <div style={{ padding: '4px 0' }}>
                          <div style={{ fontWeight: 'bold' }}>{item.ApplyName || '未知'} <span style={{fontWeight:'normal', fontSize:12}}>({item._category || '表單'})</span></div>
                          <div style={{ fontSize: 12, color: '#666' }}>
                            {item.ApplyDatetime} | {item.WsdStatus}
                          </div>
                          <div style={{ fontSize: 12 }}>{item.ApplyDeptName}</div>
                        </div>
                      </CheckList.Item>
                    ))}
                  </CheckList>
                </div>
              </>
            )}
          </div>
        )}

        {auditList.length > 0 && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: 12, background: '#fff', borderTop: '1px solid #eee' }}>
            <Button 
              block 
              color='primary' 
              size='large' 
              onClick={onApprove} 
              disabled={selectedKeys.length === 0}
            >
              一鍵簽核 ({selectedKeys.length})
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (state === 'SETTINGS') {
    return (
      <div style={{ background: '#fff', minHeight: '100vh' }}>
        <NavBar onBack={() => setState('DASHBOARD')}>個人設定</NavBar>
        <div style={{ padding: 20 }}>
          <Card title='帳號綁定'>
            <p>員工編號: {empId}</p>
            <p>LINE 連結: 已啟用</p>
            <Button 
              block 
              fill='outline' 
              color='danger' 
              style={{ marginTop: 20 }} 
              onClick={() => {
                if(window.confirm('確定要解除綁定嗎？')) setState('BINDING');
              }}
            >
              解除綁定 (登出)
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return null;
}