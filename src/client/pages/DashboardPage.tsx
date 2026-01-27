import { useEffect, useState } from 'react';
import { AutoCenter, Card, Grid, Space, Badge } from 'antd-mobile';
import { CalendarOutline, CheckCircleOutline, FileOutline, SetOutline, TeamOutline, LocationOutline } from 'antd-mobile-icons';
import axios from 'axios';

import logo from '../assets/logo.svg';

interface Props {
  empId: string;
  lineUserId: string;
  onNavigate: (page: 'CHECK_IN' | 'AUDIT' | 'SETTINGS' | 'BINDING' | 'USAGES' | 'SALARY' | 'CHECK_IN_NOW' | 'TEAM_ATTENDANCE' | 'SCHEDULE') => void;
}

export default function DashboardPage({ empId, lineUserId, onNavigate }: Props) {
  const [auditCount, setAuditCount] = useState(0);

  useEffect(() => {
    // Check for pending audits on mount
    if (lineUserId) {
        axios.get('/api/audit/list?lineUserId=' + lineUserId)
        .then(res => {
            if (res.data.success) {
            setAuditCount(res.data.data.length);
            }
        })
        .catch(() => {});
    }
  }, [lineUserId]);
  return (
    <div style={{ padding: 20, background: 'var(--color-background)', minHeight: '100vh' }}>
      <AutoCenter style={{ marginBottom: 20 }}>
        <img src={logo} alt="104 eHR 助手" style={{ height: 60 }} />
      </AutoCenter>

      <Card title='使用者資訊' style={{ marginBottom: 20, border: '1px solid rgba(0,0,0,0.12)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <Space align='center'>
            <CheckCircleOutline color='var(--adm-color-success)' fontSize={24} />
            <span style={{ fontSize: 18, fontWeight: 'bold' }}>{empId}</span>
            <span style={{ color: 'var(--color-text-secondary)' }}>服務運行中</span>
        </Space>
      </Card>

      <Grid columns={2} gap={16}>
        <Grid.Item onClick={() => onNavigate('CHECK_IN_NOW')}>
          <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', background: 'rgba(143, 188, 143, 0.15)' }}>
              <LocationOutline fontSize={32} color='var(--color-secondary)' />
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 'bold' }}>即時打卡</div>
          </Card>
        </Grid.Item>

        <Grid.Item onClick={() => onNavigate('SCHEDULE')}>
          <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', background: 'rgba(111, 78, 55, 0.1)' }}>
              <CalendarOutline fontSize={32} color='var(--color-primary)' />
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 'bold' }}>預約打卡</div>
          </Card>
        </Grid.Item>

        <Grid.Item onClick={() => onNavigate('CHECK_IN')}>
          <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', background: 'rgba(112, 128, 144, 0.12)' }}>
              <CalendarOutline fontSize={32} color='#5D4037' />
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 'bold' }}>補打卡</div>
          </Card>
        </Grid.Item>

        <Grid.Item onClick={() => onNavigate('AUDIT')}>
          <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', background: 'rgba(204, 78, 92, 0.1)' }}>
              <Badge content={auditCount ? auditCount : null} style={{ '--right': '-10px', '--top': '-5px' }}>
                <FileOutline fontSize={32} color='var(--adm-color-danger)' />
              </Badge>
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 'bold' }}>表單簽核</div>
          </Card>
        </Grid.Item>
        
        <Grid.Item onClick={() => onNavigate('SALARY')}>
          <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', background: 'rgba(218, 165, 32, 0.15)' }}>
              <FileOutline fontSize={32} color='var(--adm-color-warning)' />
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 'bold' }}>薪資查詢</div>
          </Card>
        </Grid.Item>

        <Grid.Item onClick={() => onNavigate('TEAM_ATTENDANCE')}>
          <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', background: 'rgba(147, 112, 219, 0.12)' }}>
              <TeamOutline fontSize={32} color='var(--color-primary)' />
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 'bold' }}>部屬出勤</div>
          </Card>
        </Grid.Item>

        <Grid.Item onClick={() => onNavigate('USAGES')}>
          <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', background: 'rgba(128, 128, 128, 0.1)' }}>
              <TeamOutline fontSize={32} color='var(--color-text-secondary)' />
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 'bold' }}>使用統計</div>
          </Card>
        </Grid.Item>

        <Grid.Item onClick={() => onNavigate('SETTINGS')}>
          <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', background: 'rgba(111, 78, 55, 0.15)' }}>
              <SetOutline fontSize={32} color='var(--color-primary)' />
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 'bold' }}>個人資訊</div>
          </Card>
        </Grid.Item>
      </Grid>

      <div style={{ marginTop: 40, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
        v1.2.0 @ 104 eHR Optimization
      </div>
    </div>
  );
}
