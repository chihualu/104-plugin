import { useEffect, useState } from 'react';
import { AutoCenter, Card, Grid, Space, Badge } from 'antd-mobile';
import { CalendarOutline, CheckCircleOutline, FileOutline, SetOutline, TeamOutline, LocationOutline } from 'antd-mobile-icons';
import axios from 'axios';

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
        <Grid.Item onClick={() => onNavigate('CHECK_IN_NOW')}>
          <Card style={{ height: 60, display: 'flex', alignItems: 'center' }}>
              <Space align='center' style={{ width: '100%' }}>
                <LocationOutline fontSize={28} color='#00b578' />
                <div style={{ fontSize: 16, fontWeight: 'bold', marginLeft: 8 }}>即時打卡</div>
              </Space>
          </Card>
        </Grid.Item>

        <Grid.Item onClick={() => onNavigate('SCHEDULE')}>
          <Card style={{ height: 60, display: 'flex', alignItems: 'center' }}>
              <Space align='center' style={{ width: '100%' }}>
                <CalendarOutline fontSize={28} color='#722ed1' />
                <div style={{ fontSize: 16, fontWeight: 'bold', marginLeft: 8 }}>預約打卡</div>
              </Space>
          </Card>
        </Grid.Item>

        <Grid.Item onClick={() => onNavigate('CHECK_IN')}>
          <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <CalendarOutline fontSize={32} color='#1677ff' />
              <div style={{ marginTop: 8 }}>補打卡</div>
          </Card>
        </Grid.Item>

        <Grid.Item onClick={() => onNavigate('AUDIT')}>
          <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <Badge content={auditCount ? auditCount : null} style={{ '--right': '-10px', '--top': '-5px' }}>
                <FileOutline fontSize={32} color='#ff4d4f' />
              </Badge>
              <div style={{ marginTop: 8 }}>表單簽核</div>
          </Card>
        </Grid.Item>
        
        <Grid.Item onClick={() => onNavigate('SALARY')}>
          <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <FileOutline fontSize={32} color='#ff8f1f' />
              <div style={{ marginTop: 8 }}>薪資查詢</div>
          </Card>
        </Grid.Item>

        <Grid.Item onClick={() => onNavigate('TEAM_ATTENDANCE')}>
          <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <TeamOutline fontSize={32} color='#722ed1' />
              <div style={{ marginTop: 8 }}>部屬出勤</div>
          </Card>
        </Grid.Item>

        <Grid.Item onClick={() => onNavigate('USAGES')}>
          <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <TeamOutline fontSize={32} color='#555' />
              <div style={{ marginTop: 8 }}>使用統計</div>
          </Card>
        </Grid.Item>

        <Grid.Item onClick={() => onNavigate('SETTINGS')}>
          <Card style={{ textAlign: 'center', height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <SetOutline fontSize={32} color='#722ed1' />
              <div style={{ marginTop: 8 }}>個人資訊</div>
          </Card>
        </Grid.Item>
      </Grid>

      <div style={{ marginTop: 40, textAlign: 'center', color: '#999', fontSize: 12 }}>
        v1.2.0 @ 104 eHR Optimization
      </div>
    </div>
  );
}
