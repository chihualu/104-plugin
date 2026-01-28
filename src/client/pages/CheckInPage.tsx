import { useState } from 'react';
import { Button, Form, Input, Toast, Calendar, Card, NavBar, Modal, ProgressBar } from 'antd-mobile';
import { CheckInPayload, ApiResponse } from '../../shared/types';
import dayjs from 'dayjs';

interface Props {
  lineUserId: string;
  onBack: () => void;
}

export default function CheckInPage({ lineUserId, onBack }: Props) {
  const [dates, setDates] = useState<string[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [startTime, setStartTime] = useState('08:45');
  const [endTime, setEndTime] = useState('17:45');
  const [reason, setReason] = useState('忘記打卡');
  
  const [progress, setProgress] = useState({ visible: false, title: '', current: 0, total: 0, logs: [] as string[] });

  const toggleDate = (date: Date | null) => {
    if (!date) return;
    const d = dayjs(date).format('YYYY-MM-DD');
    setDates(prev => {
        if (prev.includes(d)) {
            return prev.filter(i => i !== d);
        }
        return [...prev, d];
    });
  };

  const onCheckIn = async () => {
    if (!dates || dates.length === 0) {
       Toast.show('請選擇日期');
       return;
    }
    
    if (!startTime && !endTime) {
       Toast.show('請至少填寫上班或下班時間');
       return;
    }
    
    setProgress({ visible: true, title: '補打卡申請中', current: 0, total: dates.length, logs: [] });

    try {
      const payload: CheckInPayload = {
        lineUserId,
        dates: dates, // Already strings
        timeStart: startTime || undefined,
        timeEnd: endTime || undefined,
        reason: reason
      };

      const response = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Request failed');
      }

      if (!response.body) throw new Error('No ReadableStream');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            
            if (data.type === 'start') {
               setProgress(prev => ({ ...prev, total: data.total }));
            } else if (data.type === 'progress') {
               setProgress(prev => ({
                 ...prev,
                 current: data.index,
                 logs: [`[${data.status === 'success' ? '成功' : '失敗'}] 申請完成: ${data.key}`, ...prev.logs]
               }));
            } else if (data.type === 'done') {
               Toast.show({ icon: 'success', content: `完成！成功 ${data.successCount} 筆` });
               setTimeout(() => {
                 setProgress(prev => ({ ...prev, visible: false }));
                 setDates([]);
                 onBack();
               }, 1500);
            } else if (data.type === 'error') {
               throw new Error(data.message);
            }
          } catch (e) { console.error('Parse JSON error', e); }
        }
      }
    } catch (err: any) {
      setProgress(prev => ({ ...prev, visible: false }));
      Toast.show({ icon: 'fail', content: err.message || '申請失敗' });
    }
  };

  const progressModal = (
    <Modal
      visible={progress.visible}
      content={
        <div>
          <div style={{ marginBottom: 10, fontWeight: 'bold' }}>
            {progress.title} ({progress.current}/{progress.total})
          </div>
          <ProgressBar 
            percent={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} 
            style={{ marginBottom: 15 }}
          />
          <div style={{ height: 100, overflowY: 'auto', background: 'rgba(0,0,0,0.04)', padding: 8, borderRadius: 4, fontSize: 12 }}>
            {progress.logs.map((log, idx) => (
              <div key={idx}>{log}</div>
            ))}
          </div>
        </div>
      }
      closeOnMaskClick={false}
      showCloseButton={false}
    />
  );

  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <NavBar onBack={onBack}>補打卡申請</NavBar>
      <div style={{ padding: 20 }}>
        
        <Card title='1. 選擇日期' style={{ marginBottom: 16 }}>
          <Button onClick={() => setShowCalendar(true)} block fill='outline'>
            {dates.length > 0 ? `已選 ${dates.length} 天` : '點此選擇日期'}
          </Button>
          {showCalendar && (
            <div style={{ marginTop: 10 }}>
              <div className='custom-calendar'>
                <Calendar
                  selectionMode='single'
                  value={null}
                  onChange={toggleDate} 
                  renderDate={(date) => {
                    const dStr = dayjs(date).format('YYYY-MM-DD');
                    const isSelected = dates.includes(dStr);
                    return (
                      <div
                        style={{
                          background: isSelected ? 'var(--adm-color-primary)' : 'transparent',
                          color: isSelected ? '#fff' : 'inherit',
                          borderRadius: '50%',
                          display: 'flex', justifyContent: 'center', alignItems: 'center',
                          width: '32px', height: '32px', margin: '0 auto'
                        }}
                      >
                        {date.getDate()}
                      </div>
                    );
                  }}
                />
              </div>
              <Button block fill='none' onClick={() => setShowCalendar(false)}>確定日期</Button>
            </div>
          )}
        </Card>

        <Card title='2. 填寫時間與事由' style={{ marginBottom: 16 }}>
            <Form layout='horizontal'>
              <Form.Item 
                label='上班時間'
                extra={<Button size='mini' onClick={() => setStartTime('')}>清除</Button>}
              >
                <Input type='time' value={startTime} onChange={setStartTime} />
              </Form.Item>
              <Form.Item 
                label='下班時間'
                extra={<Button size='mini' onClick={() => setEndTime('')}>清除</Button>}
              >
                <Input type='time' value={endTime} onChange={setEndTime} />
              </Form.Item>
              <Form.Item label='補卡事由'>
                <Input value={reason} onChange={setReason} placeholder='例如: 忘記打卡' />
              </Form.Item>
            </Form>
        </Card>

        <Button 
          block 
          color='primary' 
          size='large' 
          onClick={onCheckIn} 
          disabled={dates.length === 0}
        >
          送出申請 ({dates.length}筆) - {startTime}至{endTime}
        </Button>
      </div>
      {progressModal}
    </div>
  );
}
