import { useState, useMemo } from 'react';
import { NavBar, Button, List, Picker, Tag, AutoCenter, Toast, Tabs } from 'antd-mobile';
import { LoopOutline, CalendarOutline, CheckCircleOutline } from 'antd-mobile-icons';
import axios from 'axios';
import FullScreenLoading from '../components/FullScreenLoading';

interface Props {
  lineUserId: string;
  onBack: () => void;
}

interface AttendanceRecord {
  empId: string;
  empName: string;
  dept: string;
  date: string;
  info: string;
}

interface TeamData {
  leaves: AttendanceRecord[];
  punches: AttendanceRecord[];
}

export default function TeamAttendancePage({ lineUserId, onBack }: Props) {
  const now = new Date();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedValue, setSelectedValue] = useState<(string | null)[]>([
    now.getFullYear().toString(),
    (now.getMonth() + 1).toString()
  ]);
  
  const [data, setData] = useState<TeamData>({ leaves: [], punches: [] });
  const [loading, setLoading] = useState(false);

  const pickerColumns = useMemo(() => {
    const years = ['2024', '2025', '2026', '2027'];
    const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString());
    return [
      years.map(y => ({ label: `${y}年`, value: y })),
      months.map(m => ({ label: `${m}月`, value: m })),
    ];
  }, []);

  const onQuery = async () => {
    if (!selectedValue[0] || !selectedValue[1]) return;
    setLoading(true);
    
    try {
      const year = selectedValue[0];
      const month = selectedValue[1];
      const res = await axios.get(`/api/team/attendance?lineUserId=${lineUserId}&year=${year}&month=${month}`);
      
      if (res.data.success) {
        setData(res.data.data);
        if (res.data.data.leaves.length === 0 && res.data.data.punches.length === 0) {
            Toast.show('該月無資料');
        }
      }
    } catch (err: any) {
      console.error(err);
      Toast.show(err.response?.data?.message || '查詢失敗');
    } finally {
      setLoading(false);
    }
  };

  const renderList = (records: AttendanceRecord[], emptyMsg: string, isPunch: boolean) => {
    if (records.length === 0) {
      return <AutoCenter style={{ marginTop: 40, color: 'var(--color-text-tertiary)' }}>{emptyMsg}</AutoCenter>;
    }
    return (
      <List>
        {records.map((r, idx) => (
          <List.Item
            key={idx}
            prefix={
              <div style={{ fontSize: 16, fontWeight: 'bold', minWidth: 25 }}>{r.date.split('-')[2]}</div>
            }
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14 }}>
                <span style={{ fontWeight: 'bold' }}>{r.empName}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>{r.dept}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Tag color={isPunch ? 'primary' : 'warning'} style={{ fontSize: 12 }}>
                  {r.info}
                </Tag>
              </div>
            </div>
          </List.Item>
        ))}
      </List>
    );
  };

  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <NavBar onBack={onBack}>部屬出勤</NavBar>
      
      <div style={{ padding: 12, background: 'var(--color-background)' }}>
        <Button 
          block 
          onClick={() => setPickerVisible(true)}
          style={{ marginBottom: 12 }}
        >
          {selectedValue[0]}年 {selectedValue[1]}月
        </Button>
        
        <Button block color='primary' onClick={onQuery} loading={loading}>
          查詢
        </Button>

        <Picker
          columns={pickerColumns}
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          value={selectedValue}
          onConfirm={v => setSelectedValue(v)}
        />
      </div>

      <FullScreenLoading visible={loading} text='查詢中，請稍候...' />

      {!loading && (
        <div style={{ marginTop: 10, background: 'var(--color-background)' }}>
          <Tabs>
            <Tabs.Tab title={`請假狀況 (${data.leaves.length})`} key='leaves'>
              {renderList(data.leaves, '本月無請假紀錄', false)}
            </Tabs.Tab>
            <Tabs.Tab title={`打卡紀錄 (${data.punches.length})`} key='punches'>
              {renderList(data.punches, '本月無打卡紀錄', true)}
            </Tabs.Tab>
          </Tabs>
        </div>
      )}
    </div>
  );
}