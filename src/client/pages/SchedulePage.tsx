import { useState, useEffect } from 'react';
import { NavBar, Tabs, Calendar, List, Button, Switch, Input, Toast, Tag, Modal, AutoCenter } from 'antd-mobile';
import { AddOutline, UnorderedListOutline, CloseCircleOutline } from 'antd-mobile-icons';
import axios from 'axios';
import LocationPicker from '../components/LocationPicker';
import dayjs from 'dayjs';

interface Props {
  lineUserId: string;
  onBack: () => void;
}

export default function SchedulePage({ lineUserId, onBack }: Props) {
  const [activeTab, setActiveTab] = useState('add');
  const [tasks, setTasks] = useState<any[]>([]);
  const [defaultLoc, setDefaultLoc] = useState<any>(null);
  
  // Form State
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [checkInEnabled, setCheckInEnabled] = useState(true);
  const [checkOutEnabled, setCheckOutEnabled] = useState(true);
  const [checkInTime, setCheckInTime] = useState('08:45');
  const [checkOutTime, setCheckOutTime] = useState('17:45');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchList();
  }, []);

  const fetchList = async () => {
    try {
      const res = await axios.get(`/api/schedule/list?lineUserId=${lineUserId}`);
      if (res.data.success) {
        setTasks(res.data.data.tasks);
        if (!location && res.data.data.defaultLocation) {
            setDefaultLoc(res.data.data.defaultLocation);
            setLocation(res.data.data.defaultLocation);
        }
      }
    } catch (e) { console.error(e); }
  };

  const handleSubmit = async () => {
    if (selectedDates.length === 0) return Toast.show('請選擇日期');
    if (!checkInEnabled && !checkOutEnabled) return Toast.show('請至少選擇一種打卡類型');
    if (!location) return Toast.show('請設定 GPS 座標');

    setLoading(true);
    const schedules = [];

    for (const date of selectedDates) {
        const dateStr = dayjs(date).format('YYYY-MM-DD');
        
        if (checkInEnabled) {
            schedules.push({
                time: `${dateStr} ${checkInTime}:00`,
                lat: location.lat,
                lng: location.lng
            });
        }
        if (checkOutEnabled) {
            schedules.push({
                time: `${dateStr} ${checkOutTime}:00`,
                lat: location.lat,
                lng: location.lng
            });
        }
    }

    try {
        const res = await axios.post('/api/schedule/create', { lineUserId, schedules });
        if (res.data.success) {
            Toast.show({ icon: 'success', content: '預約成功' });
            setSelectedDates([]); // Clear selection
            setActiveTab('list');
            fetchList();
        }
    } catch (err: any) {
        Toast.show({ icon: 'fail', content: err.response?.data?.message || '預約失敗' });
    } finally {
        setLoading(false);
    }
  };

  const handleCancel = async (taskId: number) => {
      try {
          await axios.post('/api/schedule/cancel', { lineUserId, taskId });
          Toast.show('已取消');
          fetchList();
      } catch (e) { Toast.show('取消失敗'); }
  };

  const renderStatus = (status: string) => {
      switch(status) {
          case 'PENDING': return <Tag color='primary'>等待中</Tag>;
          case 'COMPLETED': return <Tag color='success'>已執行</Tag>;
          case 'FAILED': return <Tag color='danger'>失敗</Tag>;
          case 'EXPIRED': return <Tag color='default'>過期</Tag>;
          case 'CANCELLED': return <Tag color='default'>已取消</Tag>;
          default: return <Tag>{status}</Tag>;
      }
  };

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh', paddingBottom: 50 }}>
      <NavBar onBack={onBack}>預約打卡</NavBar>
      
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <Tabs.Tab title='新增預約' key='add' icon={<AddOutline />}>
            <div style={{ padding: 12 }}>
                <List header='1. 選擇日期 (可多選)'>
                    <Calendar
                        selectionMode='multi'
                        onChange={val => setSelectedDates(val ? (Array.isArray(val) ? val : [val]) : [])}
                    />
                    <div style={{ padding: '8px 16px', color: '#666' }}>已選: {selectedDates.length} 天</div>
                </List>

                <List header='2. 設定時間'>
                    <List.Item extra={<Switch checked={checkInEnabled} onChange={setCheckInEnabled} />}>
                        上班卡
                    </List.Item>
                    {checkInEnabled && (
                        <List.Item>
                            <Input type='time' value={checkInTime} onChange={setCheckInTime} />
                        </List.Item>
                    )}
                    
                    <List.Item extra={<Switch checked={checkOutEnabled} onChange={setCheckOutEnabled} />}>
                        下班卡
                    </List.Item>
                    {checkOutEnabled && (
                        <List.Item>
                            <Input type='time' value={checkOutTime} onChange={setCheckOutTime} />
                        </List.Item>
                    )}
                </List>

                <List header='3. 設定地點 (GPS)'>
                    <div style={{ padding: 12, background: '#fff' }}>
                        {location && (
                            <LocationPicker 
                                value={location} 
                                defaultValue={defaultLoc}
                                onChange={setLocation} 
                            />
                        )}
                        {!location && <AutoCenter>Loading Map...</AutoCenter>}
                    </div>
                </List>

                <div style={{ marginTop: 20 }}>
                    <Button block color='primary' size='large' onClick={handleSubmit} loading={loading}>
                        送出預約 ({selectedDates.length * ((checkInEnabled?1:0) + (checkOutEnabled?1:0))} 筆)
                    </Button>
                </div>
            </div>
        </Tabs.Tab>

        <Tabs.Tab title='預約紀錄' key='list' icon={<UnorderedListOutline />}>
            <List>
                {tasks.map(task => (
                    <List.Item
                        key={task.id}
                        prefix={renderStatus(task.status)}
                        description={task.result && <span style={{fontSize: 12, color: 'red'}}>{task.result}</span>}
                        extra={
                            task.status === 'PENDING' && (
                                <Button size='mini' color='danger' fill='outline' onClick={() => handleCancel(task.id)}>
                                    取消
                                </Button>
                            )
                        }
                    >
                        <div style={{ fontWeight: 'bold' }}>
                            {dayjs(task.scheduledAt).format('MM/DD HH:mm')}
                        </div>
                        <div style={{ fontSize: 12, color: '#999' }}>
                            {task.lat.toFixed(5)}, {task.lng.toFixed(5)}
                        </div>
                    </List.Item>
                ))}
                {tasks.length === 0 && <AutoCenter style={{ padding: 20, color: '#999' }}>尚無預約</AutoCenter>}
            </List>
        </Tabs.Tab>
      </Tabs>
    </div>
  );
}
