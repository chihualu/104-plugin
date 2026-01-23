import { useEffect, useState } from 'react';
import { NavBar, Form, Input, Button, Toast, List, Tag, Modal, Tabs, AutoCenter } from 'antd-mobile';
import { LoopOutline } from 'antd-mobile-icons';
import axios from 'axios';

interface Props {
  lineUserId: string;
  onBack: () => void;
}

export default function SalaryPage({ lineUserId, onBack }: Props) {
  const [step, setStep] = useState<'VERIFY' | 'LIST'>('VERIFY');
  const [years, setYears] = useState<string[]>([]);
  const [currentYear, setCurrentYear] = useState<string>('');
  const [salaryList, setSalaryList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Verify
  const onVerify = async (values: any) => {
    setLoading(true);
    try {
      const res = await axios.post('/api/salary/verify', { lineUserId, code: values.code });
      if (res.data.success) {
        Toast.show({ icon: 'success', content: '驗證成功' });
        fetchYears();
      }
    } catch (err) {
      Toast.show({ icon: 'fail', content: '驗證失敗，請確認驗證碼' });
      setLoading(false);
    }
  };

  const fetchYears = async () => {
    try {
      const res = await axios.get(`/api/salary/years?lineUserId=${lineUserId}`);
      if (res.data.success) {
        const list = res.data.data;
        if (list.length > 0) {
          const yList = list.map((i: any) => i.SALARY_YEAR);
          setYears(yList);
          setCurrentYear(yList[0]);
          setStep('LIST');
          // Fetch list for first year
          fetchList(yList[0]);
        } else {
          Toast.show('查無薪資年份資料');
        }
      }
    } catch (err) {
      Toast.show('取得年份失敗');
    } finally {
      setLoading(false);
    }
  };

  const fetchList = async (year: string) => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/salary/list?lineUserId=${lineUserId}&year=${year}`);
      if (res.data.success) {
        setSalaryList(res.data.data);
      }
    } catch (err) {
      Toast.show('取得薪資單失敗');
    } finally {
      setLoading(false);
    }
  };

  const showDetail = async (id: string, title: string) => {
    Toast.show({ icon: 'loading', content: '讀取中...' });
    try {
      const res = await axios.get(`/api/salary/detail?lineUserId=${lineUserId}&id=${id}`);
      if (res.data.success) {
        Modal.show({
          title,
          content: (
            <div 
              style={{ maxHeight: '60vh', overflowY: 'auto' }}
              dangerouslySetInnerHTML={{ __html: res.data.data }} 
            />
          ),
          closeOnMaskClick: true,
          showCloseButton: true
        });
        Toast.clear();
      }
    } catch (err) {
      Toast.show({ icon: 'fail', content: '讀取詳情失敗' });
    }
  };

  if (step === 'VERIFY') {
    return (
      <div style={{ background: '#fff', minHeight: '100vh' }}>
        <NavBar onBack={onBack}>薪資查詢</NavBar>
        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 20, color: '#666' }}>
            請輸入您的薪資驗證碼（通常為身分證後四碼或自訂密碼）以繼續。
          </div>
          <Form onFinish={onVerify} footer={<Button block type='submit' color='primary' size='large' loading={loading}>驗證</Button>}>
            <Form.Item name='code' label='驗證碼' rules={[{ required: true }]}>
              <Input type='password' placeholder='請輸入驗證碼' />
            </Form.Item>
          </Form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh' }}>
      <NavBar onBack={onBack}>薪資查詢</NavBar>
      <div style={{ background: '#fff' }}>
        <Tabs activeKey={currentYear} onChange={(key) => { setCurrentYear(key); fetchList(key); }}>
          {years.map(y => (
            <Tabs.Tab title={`${y}年`} key={y} />
          ))}
        </Tabs>
      </div>

      {loading ? (
        <AutoCenter style={{ marginTop: 50 }}>
          <LoopOutline fontSize={32} spin />
        </AutoCenter>
      ) : (
        <List>
          {salaryList.map((item, idx) => (
            <List.Item 
              key={idx} 
              onClick={() => showDetail(item.SALARY_CLOSE_ID, item.SALARY_NAME)}
              arrow
            >
              {item.SALARY_NAME}
            </List.Item>
          ))}
        </List>
      )}
    </div>
  );
}