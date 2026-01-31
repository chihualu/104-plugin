import { useEffect, useState } from 'react';
import { Button, Card, NavBar, List, AutoCenter, Tag, Grid, Toast } from 'antd-mobile';
import { LoopOutline, CheckCircleOutline, UserOutline, UserAddOutline } from 'antd-mobile-icons';
import axios from 'axios';
import liff from '@line/liff';

import DOMPurify from 'dompurify';

interface Props {
  empId: string; 
  lineUserId: string;
  onBack: () => void;
  onLogout: () => void;
}

export default function SettingsPage({ lineUserId, onBack, onLogout }: Props) {
  const [info, setInfo] = useState<any>(null);
  const [leaveData, setLeaveData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFriend, setIsFriend] = useState(true);

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
          setLeaveData(resLeave.data.data);
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
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <NavBar onBack={onBack}>個人資訊</NavBar>
      
      {loading ? (
        <AutoCenter style={{ marginTop: 50 }}>
          <LoopOutline fontSize={32} spin />
        </AutoCenter>
            ) : (
              <div style={{ padding: 12 }}>
                {/* Profile Card */}
                <Card style={{ marginBottom: 16, borderTop: '4px solid var(--adm-color-primary)', borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  <div style={{ textAlign: 'center', padding: '10px 0' }}>
                    <div style={{ background: 'rgba(111, 78, 55, 0.1)', width: 64, height: 64, borderRadius: '50%', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <UserOutline fontSize={36} color='var(--adm-color-primary)' />
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>{info?.empId}</div>
                    <div style={{ fontSize: 16, color: 'var(--color-text-secondary)', marginBottom: 12 }}>{info?.companyName || info?.companyId}</div>
                    <Tag color='success' fill='outline' style={{ fontSize: 12 }}>
                      <CheckCircleOutline style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      已綁定帳號
                    </Tag>
                  </div>
                </Card>
      
                {/* Personal Stats Grid */}
                <Grid columns={3} gap={8}>
                  <Grid.Item>
                    <Card style={{ textAlign: 'center', borderRadius: 12, padding: 8, border: '1px solid rgba(0,0,0,0.12)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <div style={{ fontSize: 24, fontWeight: 'bold', color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                        {info?.stats?.checkIn || 0}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, fontWeight: 'bold' }}>補打卡申請</div>
                    </Card>
                  </Grid.Item>
                  <Grid.Item>
                    <Card style={{ textAlign: 'center', borderRadius: 12, padding: 8, border: '1px solid rgba(0,0,0,0.12)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <div style={{ fontSize: 24, fontWeight: 'bold', color: 'var(--adm-color-danger)', fontFamily: 'monospace' }}>
                        {info?.stats?.audit || 0}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, fontWeight: 'bold' }}>表單簽核</div>
                    </Card>
                  </Grid.Item>
                  <Grid.Item>
                    <Card style={{ textAlign: 'center', borderRadius: 12, padding: 8, border: '1px solid rgba(0,0,0,0.12)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <div style={{ fontSize: 24, fontWeight: 'bold', color: 'var(--adm-color-primary)', fontFamily: 'monospace' }}>
                        {info?.stats?.scheduledTasks || 0}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, fontWeight: 'bold' }}>預約打卡</div>
                    </Card>
                  </Grid.Item>
                </Grid>
      
                {/* Leave Balance */}
                {leaveData.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ padding: '0 4px 8px', color: 'var(--color-text-secondary)', fontSize: 14 }}>假勤餘額</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {leaveData.map((item, idx) => (
                            <Card key={idx} style={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                                <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>{item.name}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginRight: 4, fontWeight: 'bold' }}>剩餘</span>
                                        <span style={{ fontSize: 20, fontWeight: 'bold', color: 'var(--color-primary)' }}>{item.balance}</span>
                                    </div>
                                    <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
                                        <span style={{ marginRight: 4, fontWeight: 'bold' }}>全部</span>
                                        <span style={{ fontWeight: 'bold' }}>{item.total}</span>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                  </div>
                )}
      
                <Card style={{ marginTop: 16, borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: 16 }}>官方帳號好友</div>
                            <div style={{ fontSize: 12, color: isFriend ? 'var(--adm-color-success)' : 'var(--color-text-secondary)', marginTop: 4 }}>
                                {isFriend ? '已加入 (可接收通知)' : '未加入 (無法接收通知)'}
                            </div>
                        </div>
                        {!isFriend && (
                            <Button 
                                size='small' 
                                color='primary' 
                                onClick={() => {
                                    const botId = import.meta.env.VITE_LINE_BOT_ID;
                                    if(botId) window.location.href = `https://line.me/R/ti/p/${botId}`;
                                    else Toast.show('未設定 Bot ID');
                                }}
                            >
                                <UserAddOutline /> 加入
                            </Button>
                        )}
                    </div>
                </Card>

                <Button 
                  block 
                  fill='outline' 
                  color='danger' 
                  size='large'
                  style={{ marginTop: 40, borderRadius: 8 }} 
                  onClick={() => {
                    if(window.confirm('確定要解除綁定嗎？')) onLogout();
                  }}
                >
                  解除綁定 (登出)
                </Button>
              </div>
            )}    </div>
  );
}
