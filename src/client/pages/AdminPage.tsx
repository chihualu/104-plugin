import { useEffect, useState } from 'react';
import { NavBar, Card, Grid, Tag, AutoCenter } from 'antd-mobile';
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
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <NavBar onBack={onBack}>使用統計 (公司維度)</NavBar>
      
      {loading ? (
        <AutoCenter style={{ marginTop: 50 }}>
          <LoopOutline fontSize={32} spin />
        </AutoCenter>
      ) : (
        <div style={{ padding: 12 }}>
          <div style={{ marginBottom: 12, color: 'var(--color-text-secondary)', fontSize: 14 }}>共 {stats.length} 家公司</div>
          {stats.map((s, idx) => (
            <Card key={idx} style={{ marginBottom: 16, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 'bold', fontSize: 18 }}>{s.companyName}</div>
                <Tag color='default' fill='outline'>{s.userCount} 位使用者</Tag>
              </div>

              <Grid columns={3} gap={8}>
                <Grid.Item>
                  <div style={{ background: 'rgba(111, 78, 55, 0.1)', padding: '12px 4px', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ color: 'var(--color-primary)', fontSize: 24, fontWeight: 'bold', fontFamily: 'monospace' }}>
                      {s.scheduleTotal || 0}
                    </div>
                    <div style={{ color: 'var(--color-primary)', fontSize: 12, marginTop: 4 }}>預約打卡</div>
                  </div>
                </Grid.Item>
                <Grid.Item>
                  <div style={{ background: 'rgba(143, 188, 143, 0.2)', padding: '12px 4px', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ color: 'var(--color-secondary)', fontSize: 24, fontWeight: 'bold', fontFamily: 'monospace' }}>
                      {s.checkInTotal || 0}
                    </div>
                    <div style={{ color: 'var(--color-secondary)', fontSize: 12, marginTop: 4 }}>手動補卡</div>
                  </div>
                </Grid.Item>
                <Grid.Item>
                  <div style={{ background: 'rgba(255, 77, 79, 0.1)', padding: '12px 4px', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ color: 'var(--adm-color-danger)', fontSize: 24, fontWeight: 'bold', fontFamily: 'monospace' }}>
                      {s.auditTotal || 0}
                    </div>
                    <div style={{ color: 'var(--adm-color-danger)', fontSize: 12, marginTop: 4 }}>表單簽核</div>
                  </div>
                </Grid.Item>
              </Grid>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
