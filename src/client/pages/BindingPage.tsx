import { useState } from 'react';
import { Button, Form, Input, Toast, Selector } from 'antd-mobile';
import axios from 'axios';
import { ApiResponse } from '../../shared/types';

interface Props {
  lineUserId: string;
  onSuccess: () => void;
}

export default function BindingPage({ lineUserId, onSuccess }: Props) {
  const [companies, setCompanies] = useState<any[]>([]);
  const [fetchingCompanies, setFetchingCompanies] = useState(false);

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
        onSuccess();
      }
    } catch (err) {
      Toast.show({ icon: 'fail', content: '驗證失敗，請檢查帳號密碼' });
    }
  };

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
