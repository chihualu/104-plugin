import { useEffect, useState } from 'react';
import { NavBar, List, Tag, AutoCenter } from 'antd-mobile';
import { LoopOutline } from 'antd-mobile-icons';
import axios from 'axios';

interface Props {
  onBack: () => void;
}

export default function AdminPage({ onBack }: Props) {
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/usages/stats')
      .then(res => {
        if (res.data.success) {
          setStats(res.data.data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh' }}>
      <NavBar onBack={onBack}>使用統計 (公司維度)</NavBar>
      
      {loading ? (
        <AutoCenter style={{ marginTop: 50 }}>
          <LoopOutline fontSize={32} spin />
        </AutoCenter>
      ) : (
        <List header={`共 ${stats.length} 家公司`}>
          {stats.map((s, idx) => (
            <List.Item 
              key={idx}
              extra={
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 'bold', color: '#1677ff' }}>補卡: {s.checkInTotal}</div>
                  <div style={{ fontSize: 16, fontWeight: 'bold', color: '#ff4d4f' }}>簽核: {s.auditTotal}</div>
                </div>
              }
            >
              <div style={{ fontWeight: 'bold', fontSize: 18 }}>{s.companyId}</div>
              <Tag color='success' fill='outline' style={{ marginTop: 4 }}>ID: {s.internalId}</Tag>
            </List.Item>
          ))}
        </List>
      )}
    </div>
  );
}
