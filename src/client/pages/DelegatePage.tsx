import { useEffect, useState } from 'react';
import { NavBar, List, Button, Input, Toast, Card, Dialog, Empty } from 'antd-mobile';
import axios from 'axios';

interface Props {
  onBack: () => void;
  onEnterProxy: (target: { lineUserId: string; empId: string }) => void;
}

export default function DelegatePage({ onBack, onEnterProxy }: Props) {
  const [actingFor, setActingFor] = useState<any[]>([]);
  const [granted, setGranted] = useState<any[]>([]);
  const [empIdInput, setEmpIdInput] = useState('');

  const load = async () => {
    try {
      const [r1, r2] = await Promise.all([
        axios.get('/api/delegation/acting-for'),
        axios.get('/api/delegation/granted'),
      ]);
      if (r1.data.success) setActingFor(r1.data.data || []);
      if (r2.data.success) setGranted(r2.data.data || []);
    } catch (e) {
      Toast.show('載入失敗');
    }
  };

  useEffect(() => { load(); }, []);

  const onGrant = async () => {
    const empId = empIdInput.trim();
    if (!empId) return Toast.show('請輸入員編');
    try {
      const res = await axios.post('/api/delegation/grant', { granteeEmpId: empId });
      if (res.data.success) {
        Toast.show({ icon: 'success', content: '授權成功' });
        setEmpIdInput('');
        load();
      }
    } catch (e: any) {
      Toast.show(e.response?.data?.message || '授權失敗');
    }
  };

  const onRevoke = async (granteeLineUserId: string, empId: string) => {
    const ok = await Dialog.confirm({ content: `確定撤銷對 ${empId} 的代理授權？` });
    if (!ok) return;
    try {
      const res = await axios.post('/api/delegation/revoke', { granteeLineUserId });
      if (res.data.success) {
        Toast.show('已撤銷');
        load();
      }
    } catch (e: any) {
      Toast.show(e.response?.data?.message || '撤銷失敗');
    }
  };

  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <NavBar onBack={onBack}>代理設定</NavBar>
      <div style={{ padding: 12 }}>
        {/* 區塊一：以他人身分操作 */}
        <Card title='以他人身分操作' style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            以下同事已授權你代理。選擇後，打卡 / 簽核 / 出勤 / 排程將以對方身分操作（薪資與個人設定仍為你本人）。
          </div>
          {actingFor.length === 0 ? (
            <Empty description='目前沒有人授權你代理' />
          ) : (
            <List>
              {actingFor.map((a, i) => (
                <List.Item
                  key={i}
                  extra={
                    <Button size='small' color='primary' onClick={() => onEnterProxy({ lineUserId: a.granterLineUserId, empId: a.granterEmpId })}>
                      代理
                    </Button>
                  }
                >
                  {a.granterEmpId} <span style={{ fontSize: 12, color: '#999' }}>{a.granterCompanyId}</span>
                </List.Item>
              ))}
            </List>
          )}
        </Card>

        {/* 區塊二：授權他人代理我 */}
        <Card title='授權他人代理我'>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            輸入同公司同事的員編，授權對方代理你的帳號（薪資不開放）。對方需已綁定本系統。
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <Input placeholder='同事員編' value={empIdInput} onChange={setEmpIdInput} />
            <Button color='primary' onClick={() => { onGrant(); }}>授權</Button>
          </div>
          {granted.length === 0 ? (
            <Empty description='尚未授權任何人' />
          ) : (
            <List>
              {granted.map((g, i) => (
                <List.Item
                  key={i}
                  extra={
                    <Button size='small' color='danger' fill='outline' onClick={() => onRevoke(g.granteeLineUserId, g.granteeEmpId)}>
                      撤銷
                    </Button>
                  }
                >
                  {g.granteeEmpId}
                </List.Item>
              ))}
            </List>
          )}
        </Card>
      </div>
    </div>
  );
}
