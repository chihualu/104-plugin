import { useEffect, useState } from 'react';
import { Button, Card, NavBar, List, AutoCenter, Tag, Collapse } from 'antd-mobile';
import { LoopOutline, CheckCircleOutline } from 'antd-mobile-icons';
import axios from 'axios';

import DOMPurify from 'dompurify';

interface Props {
  empId: string; 
  lineUserId: string;
  onBack: () => void;
  onLogout: () => void;
}

export default function SettingsPage({ lineUserId, onBack, onLogout }: Props) {
  const [info, setInfo] = useState<any>(null);
  const [leaveHtml, setLeaveHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resInfo, resLeave] = await Promise.all([
          axios.get(`/api/check-binding?lineUserId=${lineUserId}`),
          axios.get(`/api/leave/status?lineUserId=${lineUserId}`)
        ]);

        if (resInfo.data.success && resInfo.data.data.isBound) {
          setInfo(resInfo.data.data);
        }
        if (resLeave.data.success) {
          setLeaveHtml(resLeave.data.data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [lineUserId]);

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh' }}>
      <NavBar onBack={onBack}>個人資訊</NavBar>
      
      {loading ? (
        <AutoCenter style={{ marginTop: 50 }}>
          <LoopOutline fontSize={32} spin />
        </AutoCenter>
      ) : (
        <div style={{ padding: 12 }}>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <CheckCircleOutline fontSize={48} color='var(--adm-color-success)' />
              <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 8 }}>{info?.empId}</div>
              <div style={{ color: '#666' }}>已綁定</div>
            </div>
          </Card>

          <List header='公司資訊' style={{ marginBottom: 16 }}>
            <List.Item extra={info?.companyName || info?.companyId}>公司名稱</List.Item>
            <List.Item extra={info?.internalId}>公司代碼</List.Item>
          </List>

          <List header='使用統計' style={{ marginBottom: 16 }}>
            <List.Item extra={<span style={{ color: '#1677ff', fontWeight: 'bold' }}>{info?.stats?.checkIn || 0} 次</span>}>
              補打卡申請
            </List.Item>
            <List.Item extra={<span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{info?.stats?.audit || 0} 次</span>}>
              表單簽核
            </List.Item>
          </List>

          {leaveHtml && (
            <Card title='假勤餘額'>
              <div 
                style={{ overflowX: 'auto', fontSize: 14 }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(leaveHtml) }} 
              />
            </Card>
          )}

          <Button 
            block 
            fill='outline' 
            color='danger' 
            style={{ marginTop: 40 }} 
            onClick={() => {
              if(window.confirm('確定要解除綁定嗎？')) onLogout();
            }}
          >
            解除綁定 (登出)
          </Button>
        </div>
      )}
    </div>
  );
}
