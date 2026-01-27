import { useState, useEffect } from 'react';
import { NavBar, Tabs, Calendar, List, Button, Switch, Input, Toast, Tag, Modal, AutoCenter, InfiniteScroll } from 'antd-mobile';
import { AddOutline, UnorderedListOutline, ClockCircleOutline } from 'antd-mobile-icons';
import axios from 'axios';
import LocationPicker from '../components/LocationPicker';
import dayjs from 'dayjs';

interface Props {
  lineUserId: string;
  onBack: () => void;
}

export default function SchedulePage({ lineUserId, onBack }: Props) {
  const [activeTab, setActiveTab] = useState('add');
  
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [historyTasks, setHistoryTasks] = useState<any[]>([]);
  const [defaultLoc, setDefaultLoc] = useState<any>(null);
  
  // History Pagination
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [historyCursor, setHistoryCursor] = useState<number | undefined>(undefined);

  // Form State
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [checkInEnabled, setCheckInEnabled] = useState(true);
  const [checkOutEnabled, setCheckOutEnabled] = useState(true);
  
  const [checkInStart, setCheckInStart] = useState('08:40');
  const [checkInEnd, setCheckInEnd] = useState('08:50');
  
  const [checkOutStart, setCheckOutStart] = useState('17:55');
  const [checkOutEnd, setCheckOutEnd] = useState('18:05');
  
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'pending') {
        fetchPending();
    } else if (activeTab === 'history') {
        // Reset history list to fetch fresh data
        setHistoryTasks([]);
        setHistoryCursor(undefined);
        setHistoryHasMore(true);
        // loadMoreHistory will be triggered by InfiniteScroll automatically when hasMore becomes true and list is empty
    }
  }, [activeTab]);

  useEffect(() => {
    fetchPending(); // Initial fetch for default location
  }, []);

  const fetchPending = async () => {
    try {
      const res = await axios.get(`/api/schedule/list?lineUserId=${lineUserId}&status=PENDING`);
      if (res.data.success) {
        setPendingTasks(res.data.data.tasks);
        if (!location && res.data.data.defaultLocation) {
            setDefaultLoc(res.data.data.defaultLocation);
            setLocation(res.data.data.defaultLocation);
        }
      }
    } catch (e) { console.error(e); }
  };

  const loadMoreHistory = async () => {
      try {
          const url = `/api/schedule/list?lineUserId=${lineUserId}&status=HISTORY&limit=15${historyCursor ? `&cursor=${historyCursor}` : ''}`;
          const res = await axios.get(url);
          if (res.data.success) {
              const newTasks = res.data.data.tasks;
              setHistoryTasks(prev => [...prev, ...newTasks]);
              setHistoryCursor(res.data.data.nextCursor);
              setHistoryHasMore(newTasks.length > 0 && !!res.data.data.nextCursor);
          } else {
              setHistoryHasMore(false);
          }
      } catch (e) {
          setHistoryHasMore(false);
      }
  };

  const toggleDate = (date: Date | null) => {
    if (!date) return;
    const d = dayjs(date).format('YYYY-MM-DD');
    setSelectedDates(prev => {
        if (prev.includes(d)) {
            return prev.filter(i => i !== d);
        }
        return [...prev, d];
    });
  };

  const handleSubmit = async () => {
    if (selectedDates.length === 0) return Toast.show('請選擇日期');
    if (!checkInEnabled && !checkOutEnabled) return Toast.show('請至少選擇一種打卡類型');
    if (!location) return Toast.show('請設定 GPS 座標');
    
    // Validate ranges
    if (checkInEnabled && checkInStart >= checkInEnd) return Toast.show('上班開始時間必須早於結束時間');
    if (checkOutEnabled && checkOutStart >= checkOutEnd) return Toast.show('下班開始時間必須早於結束時間');

    setLoading(true);
    const schedules = [];

    for (const dateStr of selectedDates) {
        if (checkInEnabled) {
            schedules.push({
                type: 'CHECK_IN',
                date: dateStr,
                timeRange: [checkInStart, checkInEnd],
                lat: location.lat,
                lng: location.lng
            });
        }
        if (checkOutEnabled) {
            schedules.push({
                type: 'CHECK_OUT',
                date: dateStr,
                timeRange: [checkOutStart, checkOutEnd],
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
            setActiveTab('pending');
            fetchPending();
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
          fetchPending();
      } catch (e) { Toast.show('取消失敗'); }
  };

  const showHistoryDetail = (task: any) => {
      Modal.show({
          title: '預約詳情',
          content: (
              <div style={{ height: '100%', overflowY: 'auto', fontSize: 14 }}>
                  <p><strong style={{ fontWeight: 'bold' }}>時間：</strong> {dayjs(task.scheduledAt).format('YYYY-MM-DD HH:mm:ss')}</p>
                  <p><strong style={{ fontWeight: 'bold' }}>狀態：</strong> {renderStatus(task.status)}</p>
                  <p><strong style={{ fontWeight: 'bold' }}>座標：</strong> {task.lat}, {task.lng}</p>
                  <p><strong style={{ fontWeight: 'bold' }}>執行結果：</strong></p>
                  <div style={{ background: 'var(--color-background)', padding: 8, borderRadius: 4, color: task.status === 'FAILED' ? 'var(--adm-color-danger)' : 'var(--color-text)' }}>
                      {task.result || '無訊息'}
                  </div>
              </div>
          ),
          closeOnMaskClick: true,
          showCloseButton: true,
          className: 'full-screen-modal'
      });
  };

  const renderStatus = (status: string) => {
      let color = 'default';
      let text = status;
      switch(status) {
          case 'PENDING': color = 'primary'; text = '等待中'; break;
          case 'COMPLETED': color = 'success'; text = '已執行'; break;
          case 'FAILED': color = 'danger'; text = '失敗'; break;
          case 'EXPIRED': color = 'default'; text = '過期'; break;
          case 'CANCELLED': color = 'default'; text = '已取消'; break;
      }
      return (
        <div style={{ width: 60, textAlign: 'center' }}>
            <Tag color={color}>{text}</Tag>
        </div>
      );
  };

  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh', paddingBottom: 50 }}>
      <NavBar onBack={onBack}>預約打卡</NavBar>
      
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <Tabs.Tab title='新增預約' key='add' icon={<AddOutline />}>
            <div style={{ padding: 12 }}>
                <List header='1. 選擇日期 (可多選)'>
                    <Calendar
                        selectionMode='single'
                        value={null}
                        onChange={toggleDate}
                        renderDate={date => {
                            const d = dayjs(date).format('YYYY-MM-DD');
                            const isSelected = selectedDates.includes(d);
                            return (
                                <div style={{ 
                                    borderRadius: '50%', 
                                    background: isSelected ? 'var(--adm-color-primary)' : 'transparent',
                                    color: isSelected ? '#fff' : 'inherit',
                                    width: '32px', height: '32px', // Increased size
                                    margin: '0 auto', // Center it
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {date.getDate()}
                                </div>
                            );
                        }}
                    />
                    <div style={{ padding: '8px 16px', color: 'var(--color-text-secondary)' }}>已選: {selectedDates.length} 天</div>
                </List>

                <List header='2. 設定時間範圍'>
                    <List.Item extra={<Switch checked={checkInEnabled} onChange={setCheckInEnabled} />}>
                        上班卡
                    </List.Item>
                    {checkInEnabled && (
                        <List.Item>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Input type='time' value={checkInStart} onChange={setCheckInStart} style={{textAlign:'center'}} />
                                <span>~</span>
                                <Input type='time' value={checkInEnd} onChange={setCheckInEnd} style={{textAlign:'center'}} />
                            </div>
                        </List.Item>
                    )}
                    
                    <List.Item extra={<Switch checked={checkOutEnabled} onChange={setCheckOutEnabled} />}>
                        下班卡
                    </List.Item>
                    {checkOutEnabled && (
                        <List.Item>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Input type='time' value={checkOutStart} onChange={setCheckOutStart} style={{textAlign:'center'}} />
                                <span>~</span>
                                <Input type='time' value={checkOutEnd} onChange={setCheckOutEnd} style={{textAlign:'center'}} />
                            </div>
                        </List.Item>
                    )}
                </List>

                <List header='3. 設定地點 (GPS)'>
                    <div style={{ padding: 12, background: 'var(--color-background)' }}>
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

        <Tabs.Tab title='待執行' key='pending' icon={<ClockCircleOutline />}>
            <List>
                {pendingTasks.map(task => (
                    <List.Item
                        key={task.id}
                        prefix={renderStatus(task.status)}
                        extra={
                            <Button size='mini' color='danger' fill='outline' onClick={() => handleCancel(task.id)}>
                                取消
                            </Button>
                        }
                    >
                        <div style={{ fontSize: 18 }}>
                            <span style={{ fontWeight: 'bold' }}>{dayjs(task.scheduledAt).format('MM/DD HH:mm:ss')}</span>
                            <span style={{ fontSize: 16, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                                {task.lat.toFixed(4)}, {task.lng.toFixed(4)}
                            </span>
                        </div>
                    </List.Item>
                ))}
                {pendingTasks.length === 0 && <AutoCenter style={{ padding: 20, color: 'var(--color-text-tertiary)' }}>無待執行預約</AutoCenter>}
            </List>
        </Tabs.Tab>

        <Tabs.Tab title='歷史紀錄' key='history' icon={<UnorderedListOutline />}>
            <List>
                {historyTasks.map(task => (
                    <List.Item
                        key={task.id}
                        prefix={renderStatus(task.status)}
                        onClick={() => showHistoryDetail(task)}
                        arrow
                    >
                        <div style={{ fontSize: 18 }}>
                            <span style={{ fontWeight: 'bold' }}>{dayjs(task.scheduledAt).format('MM/DD HH:mm:ss')}</span>
                            <span style={{ fontSize: 16, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                                {task.lat.toFixed(4)}, {task.lng.toFixed(4)}
                            </span>
                        </div>
                    </List.Item>
                ))}
            </List>
            <InfiniteScroll loadMore={loadMoreHistory} hasMore={historyHasMore} />
        </Tabs.Tab>
      </Tabs>
    </div>
  );

}
