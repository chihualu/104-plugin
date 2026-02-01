import { useState, useEffect } from 'react';
import { Button, Form, Input, Toast, Selector, Dialog, Card, AutoCenter } from 'antd-mobile';
import { UserAddOutline } from 'antd-mobile-icons';
import liff from '@line/liff';
import axios from 'axios';
import { ApiResponse } from '../../shared/types';

interface Props {
  lineUserId: string;
  onSuccess: () => void;
}

export default function BindingPage({ lineUserId, onSuccess }: Props) {
  const [companies, setCompanies] = useState<any[]>([]);
  const [fetchingCompanies, setFetchingCompanies] = useState(false);
  const [isFriend, setIsFriend] = useState(true); // Default true to hide initial flash

  useEffect(() => {
    const checkFriendship = async () => {
        if (liff.isInClient()) {
            try {
                const friendship = await liff.getFriendship();
                setIsFriend(friendship.friendFlag);
            } catch (e) { console.error(e); }
        }
    };
    checkFriendship();
  }, []);

  const handleAddFriend = () => {
      const botId = import.meta.env.VITE_LINE_BOT_ID;
      if (botId) {
          window.location.href = `https://line.me/R/ti/p/${botId}`;
      } else {
          Toast.show('未設定 Bot ID');
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
    // Check Friendship
    try {
      if (liff.isInClient()) {
        const friendship = await liff.getFriendship();
        if (!friendship.friendFlag) {
          const result = await Dialog.confirm({
            title: '通知設定',
            content: '為了能收到每月出勤異常通知，請先加入官方帳號為好友。',
            confirmText: '去加入',
            cancelText: '略過 (無法收通知)',
          });
          
          if (result) {
             const botId = import.meta.env.VITE_LINE_BOT_ID;
             if (botId) {
                 window.location.href = `https://line.me/R/ti/p/${botId}`;
                 return; // Stop flow to let user add friend
             }
          }
        }
      }
    } catch (e) { console.error('Friendship check failed', e); }

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
        onSuccess();
      }
    } catch (err) {
      Toast.show({ icon: 'fail', content: '驗證失敗，請檢查帳號密碼' });
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>104 eHR 綁定</h1>
      <p style={{ marginBottom: 16 }}>請輸入統編後點擊查詢，並選擇公司。</p>
      
      {!isFriend && (
        <Card style={{ marginBottom: 20, border: '1px solid #faad14', background: '#fffbe6', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontWeight: 'bold', color: '#d48806' }}>開啟通知功能</div>
                    <div style={{ fontSize: 12, color: '#888' }}>加入好友以接收出勤異常提醒</div>
                </div>
                <Button color='warning' size='small' onClick={handleAddFriend} style={{ fontSize: 13 }}>
                    <UserAddOutline /> 加入好友
                </Button>
            </div>
        </Card>
      )}

      <Form 
        onFinish={onBind} 
        initialValues={{ groupUBINo: '' }}
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
            onChange={(val) => {
              if (val.length === 8) fetchCompanies(val);
            }}
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
          <Input placeholder='例如: A0001' />
        </Form.Item>
        <Form.Item name='password' label='密碼' rules={[{ required: true }]}>
          <Input type='password' placeholder='請輸入密碼' />
        </Form.Item>
      </Form>
    </div>
  );
}
