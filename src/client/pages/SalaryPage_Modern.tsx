import DOMPurify from 'dompurify';
import { useEffect, useState } from 'react';
import { NavBar, Form, Input, Button, Toast, Modal, Tabs, AutoCenter, Card, Grid } from 'antd-mobile';
import { LoopOutline, CheckShieldOutline, PayCircleOutline, BillOutline, CloseOutline } from 'antd-mobile-icons';
import axios from 'axios';
import './SalaryPage_Modern.css';

interface Props {
  lineUserId: string;
  onBack: () => void;
}

export default function SalaryPage({ lineUserId, onBack }: Props) {
  const [step, setStep] = useState<'VERIFY' | 'LIST'>('VERIFY');
  const [years, setYears] = useState<string[]>([]);
  const [currentYear, setCurrentYear] = useState<string>('');
  const [salaryList, setSalaryList] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<{ title: string, items: any[], html: string } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // 1. Verify
  const onVerify = async (values: any) => {
    setLoading(true);
    try {
      const res = await axios.post('/api/salary/verify', { lineUserId, code: values.code });
      if (res.data.success) {
        Toast.show({ icon: 'success', content: '驗證成功' });
        // 驗證成功後，抓取年份
        fetchYears();
      }
    } catch (err) {
      Toast.show({ icon: 'fail', content: '驗證失敗，請確認驗證碼' });
      setLoading(false);
    }
  };

  // 2. Fetch Years
  const fetchYears = async () => {
    try {
      const res = await axios.get(`/api/salary/years?lineUserId=${lineUserId}`);
      if (res.data.success) {
        const list = res.data.data;
        if (list.length > 0) {
          const yList = list.map((i: any) => i.SALARY_YEAR);
          setYears(yList);
          setCurrentYear(yList[0]);
          
          // 切換到列表模式
          setStep('LIST');
          
          // 抓取第一年的資料
          fetchList(yList[0]);
        } else {
          Toast.show('查無薪資年份資料');
          setLoading(false);
        }
      }
    } catch (err) {
      Toast.show('取得年份失敗');
      setLoading(false);
    }
  };

  // 3. Fetch List & Summary
  const fetchList = async (year: string) => {
    setLoading(true);
    setLoadingSummary(true);
    setSummary(null);
    setSalaryList([]); 
    
    // 平行呼叫 List 和 Summary
    axios.get(`/api/salary/list?lineUserId=${lineUserId}&year=${year}`)
      .then(res => {
        if (res.data.success) setSalaryList(res.data.data);
      })
      .catch(() => Toast.show('取得薪資單失敗'))
      .finally(() => setLoading(false));

    axios.get(`/api/salary/summary?lineUserId=${lineUserId}&year=${year}`)
      .then(res => {
        if (res.data.success) setSummary(res.data.data);
      })
      .catch(() => console.error('Summary failed'))
      .finally(() => setLoadingSummary(false));
  };

  // 4. Show Detail
  const showDetail = async (id: string, title: string) => {
    setLoadingDetail(true);
    Toast.show({ icon: 'loading', content: '讀取中...' });
    try {
      const res = await axios.get(`/api/salary/detail?lineUserId=${lineUserId}&id=${id}`);
      if (res.data.success) {
        const { items, html } = res.data.data;
        setSelectedDetail({ title, items, html });
        Toast.clear();
      }
    } catch (err) {
      Toast.show({ icon: 'fail', content: '讀取詳情失敗' });
    } finally {
      setLoadingDetail(false);
    }
  };

  // Render: Verify Step
  if (step === 'VERIFY') {
    return (
      <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
        <NavBar onBack={onBack}>薪資查詢</NavBar>
        <div style={{ padding: 24, marginTop: 40 }}>
          <AutoCenter>
             <CheckShieldOutline fontSize={64} color='var(--color-primary)' />
          </AutoCenter>
          <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 40 }}>
            <h2 style={{ marginBottom: 8 }}>身份驗證</h2>
            <div style={{ color: 'var(--color-text-secondary)' }}>
                為了保護您的薪資隱私<br/>請輸入驗證碼進行身份確認
            </div>
          </div>
          
          <Card style={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              <Form layout='vertical' onFinish={onVerify} footer={
                  <Button block type='submit' color='primary' size='large' loading={loading} shape='rounded'>
                      開始驗證
                  </Button>
              }>
                <Form.Item name='code' label='薪資驗證碼' rules={[{ required: true }]}>
                  <Input type='password' placeholder='請輸入驗證碼 (如身分證後四碼)' clearable />
                </Form.Item>
              </Form>
          </Card>
        </div>
      </div>
    );
  }

  // Render: List Step
  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh', paddingBottom: 40 }}>
      <NavBar onBack={onBack}>薪資查詢</NavBar>
      <div style={{ background: 'var(--color-background)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <Tabs activeKey={currentYear} onChange={(key) => { setCurrentYear(key); fetchList(key); }}>
          {years.map(y => (
            <Tabs.Tab title={`${y}年`} key={y} />
          ))}
        </Tabs>
      </div>

      {loading && salaryList.length === 0 ? (
        <AutoCenter style={{ marginTop: 50 }}>
          <LoopOutline fontSize={32} spin color='var(--color-primary)' />
        </AutoCenter>
      ) : (
        <div style={{ padding: 16 }}>
          {/* Summary Card */}
          <Card style={{ borderRadius: 16, background: 'linear-gradient(135deg, var(--color-primary) 0%, #8D6E63 100%)', color: '#fff', marginBottom: 20, boxShadow: '0 8px 16px rgba(111, 78, 55, 0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: '500', opacity: 0.9, marginBottom: 16 }}>{currentYear} 年度總覽</div>
            {loadingSummary ? (
                <div style={{ opacity: 0.8 }}>統計中...</div>
            ) : summary ? (
                <Grid columns={2} gap={16}>
                  <div>
                      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 2 }}>實發金額</div>
                      <div style={{ fontSize: 24, fontWeight: 'bold' }}>${summary.real.toLocaleString()}</div>
                  </div>
                  <div>
                      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 2 }}>應發總額</div>
                      <div style={{ fontSize: 20, fontWeight: '500' }}>${summary.income.toLocaleString()}</div>
                  </div>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 8 }}>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>應稅總額</div>
                      <div style={{ fontSize: 16 }}>${summary.tax.toLocaleString()}</div>
                  </div>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 8 }}>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>應扣總額</div>
                      <div style={{ fontSize: 16, color: '#ffccc7' }}>-${summary.deduction.toLocaleString()}</div>
                  </div>
                </Grid>
            ) : (
                <div style={{ opacity: 0.8 }}>無統計資料</div>
            )}
          </Card>

          <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 'bold', color: 'var(--color-text-secondary)', marginLeft: 4 }}>薪資明細 ({salaryList.length})</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {salaryList.map((item, idx) => (
              <Card 
                key={idx} 
                onClick={() => showDetail(item.SALARY_CLOSE_ID, item.SALARY_NAME)}
                style={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}
              >
                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(143, 188, 143, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                             <BillOutline fontSize={20} color='var(--color-secondary)' />
                        </div>
                        <div>
                             <div style={{ fontSize: 16, fontWeight: 'bold' }}>{item.SALARY_NAME}</div>
                             <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>點擊查看詳情</div>
                        </div>
                    </div>
                    <PayCircleOutline fontSize={20} color='var(--color-text-tertiary)' />
                 </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Custom Full Screen Detail Overlay */}
      {selectedDetail && (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            background: 'var(--color-background)',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div style={{ 
                padding: '16px', 
                background: 'var(--adm-card-background)', 
                borderBottom: '1px solid rgba(0,0,0,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
            }}>
                <div style={{ fontSize: 18, fontWeight: 'bold' }}>{selectedDetail.title}</div>
                <div onClick={() => setSelectedDetail(null)} style={{ padding: 4 }}>
                    <CloseOutline fontSize={24} />
                </div>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {selectedDetail.items && selectedDetail.items.length > 0 ? (
                    <Card style={{ borderRadius: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {selectedDetail.items.map((item: any, idx: number) => (
                                <div key={idx} style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center',
                                    padding: '12px 0',
                                    borderBottom: idx !== selectedDetail.items.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                                    width: '100%'
                                }}>
                                    <div style={{ 
                                        color: 'var(--color-text-secondary)', 
                                        fontWeight: 'bold', 
                                        flex: 1, 
                                        marginRight: 16, 
                                        wordBreak: 'break-word',
                                        minWidth: 0 
                                    }}>
                                        {item.label}
                                    </div>
                                    <div style={{ 
                                        fontWeight: 'bold', 
                                        fontSize: 16,
                                        color: item.type === 'deduction' ? 'var(--adm-color-danger)' : 
                                            item.type === 'earning' ? 'var(--color-primary)' : 'var(--color-text)',
                                        flexShrink: 0,
                                        textAlign: 'right',
                                        maxWidth: '40%'
                                    }}>
                                        {item.value}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                ) : (
                    <Card style={{ borderRadius: 12 }}>
                        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedDetail.html) }} />
                    </Card>
                )}
            </div>
        </div>
      )}
    </div>
  );
}
