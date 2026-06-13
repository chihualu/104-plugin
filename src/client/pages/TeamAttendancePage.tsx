import { useState, useMemo } from 'react';
import { NavBar, Button, List, Picker, Tag, AutoCenter, Toast, Tabs, Card } from 'antd-mobile';
import { SendOutline } from 'antd-mobile-icons';
import axios from 'axios';
import liff from '@line/liff';
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

  const onShare = async () => {
    if (data.punches.length === 0) return Toast.show('目前沒有打卡異常資料可分享');

    // 統計每個人異常幾筆
    const summary: Record<string, number> = {};
    data.punches.forEach(p => {
        summary[p.empName] = (summary[p.empName] || 0) + 1;
    });

    const items = Object.entries(summary).slice(0, 10).map(([name, count]) => ({
        type: 'box',
        layout: 'horizontal',
        contents: [
            { type: 'text', text: name, size: 'sm', color: '#555555', flex: 0 },
            { type: 'text', text: `${count} 筆`, size: 'sm', color: '#111111', align: 'end', weight: 'bold' }
        ]
    }));

    const liffId = import.meta.env.VITE_LIFF_ID;
    // 防呆：liffId 缺失時退回官網，避免產生 .../undefined 的不合法 URI 讓整張 Flex 被拒
    const shareUrl = liffId ? `https://liff.line.me/${liffId}#check_in` : 'https://line.me';

    const flexContent: any = {
        type: 'bubble',
        header: {
            type: 'box',
            layout: 'vertical',
            contents: [
                { type: 'text', text: '📅 團隊出勤異常提醒', weight: 'bold', color: '#ffffff', size: 'lg' },
                { type: 'text', text: `${selectedValue[0]}年${selectedValue[1]}月 統計`, size: 'xs', color: '#ffffffcc' }
            ],
            backgroundColor: '#8D6E63'
        },
        body: {
            type: 'box',
            layout: 'vertical',
            contents: [
                { type: 'text', text: '以下同仁尚有待處理之打卡紀錄，請儘速補辦：', size: 'xs', color: '#888888', margin: 'md', wrap: true },
                { type: 'separator', margin: 'md' },
                {
                    type: 'box',
                    layout: 'vertical',
                    margin: 'md',
                    spacing: 'sm',
                    contents: items.length > 0 ? items : [{ type: 'text', text: '暫無異常' }]
                },
                { type: 'text', text: Object.keys(summary).length > 10 ? '...(僅顯示前10筆)' : ' ', size: 'xxs', color: '#aaaaaa', margin: 'xs', align: 'center' }
            ]
        },
        footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
                {
                    type: 'button',
                    action: {
                        type: 'uri',
                        label: '立即前往 104 補打卡',
                        uri: shareUrl
                    },
                    style: 'primary',
                    color: '#6F4E37'
                }
            ]
        }
    };

    console.log('Flex Content:', JSON.stringify(flexContent));

    try {
        if (!liff.isApiAvailable('shareTargetPicker')) {
            // 多半是在 LINE App 外（外部瀏覽器/桌面）開啟，或非 LIFF 環境
            Toast.show('此環境不支援分享，請在手機 LINE App 內開啟');
            return;
        }
        const res = await liff.shareTargetPicker([
            {
                type: 'flex',
                altText: '【出勤提醒】團隊異常統計',
                contents: flexContent
            }
        ]);
        if (res) {
            Toast.show('分享成功');
        } else {
            // res 為 null：使用者自行關閉了選擇視窗
            Toast.show('已取消分享');
        }
    } catch (e: any) {
        // 暴露真正的錯誤訊息（缺 chat_message.write scope、Flex 格式錯誤等都會在此顯示）
        console.error('shareTargetPicker error:', e);
        Toast.show(`分享失敗：${e?.message || e}`);
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
          onConfirm={v => setSelectedValue(v as (string | null)[])}
        />
      </div>

      <FullScreenLoading visible={loading} text='查詢中，請稍候...' />

      {!loading && (data.leaves.length > 0 || data.punches.length > 0) && (
          <div style={{ padding: '0 12px', marginTop: 8 }}>
              <Card style={{ borderRadius: 12, background: 'rgba(111, 78, 55, 0.05)', border: '1px dashed #8D6E63' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                          <div style={{ fontSize: 14, fontWeight: 'bold', color: '#6F4E37' }}>本月異常統計</div>
                          <div style={{ fontSize: 12, color: '#8D6E63' }}>共 {data.punches.length} 筆待補打卡</div>
                      </div>
                      <Button color='primary' size='small' shape='rounded' onClick={() => { onShare(); }} style={{ fontSize: 13 }}>
                          <SendOutline /> 分享給團隊
                      </Button>
                  </div>
              </Card>
          </div>
      )}

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