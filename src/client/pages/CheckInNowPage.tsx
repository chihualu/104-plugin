import { useEffect, useState } from 'react';
import { NavBar, Button, Card, AutoCenter, Toast, List } from 'antd-mobile';
import { LocationOutline, LoopOutline, CheckShieldOutline } from 'antd-mobile-icons';
import axios from 'axios';

interface Props {
  lineUserId: string;
  onBack: () => void;
}

export default function CheckInNowPage({ lineUserId, onBack }: Props) {
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = () => {
    setLoading(true);
    if (!navigator.geolocation) {
      Toast.show('瀏覽器不支援定位');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLoc({ lat: latitude, lng: longitude });
        await fetchAddress(latitude, longitude);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        Toast.show('定位失敗，請確保已開啟 GPS 與權限');
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const fetchAddress = async (lat: number, lng: number) => {
    try {
      // 使用 OpenStreetMap Nominatim (免費)
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=zh-TW`);
      const data = await res.json();
      setAddress(data.display_name || '未知地址');
    } catch (e) {
      setAddress('無法取得地址文字');
    }
  };

  const onCheckIn = async () => {
    if (!loc) return;
    setSubmitting(true);
    try {
      const res = await axios.post('/api/check-in/now', {
        lineUserId,
        lat: loc.lat,
        lng: loc.lng,
        address
      });
      if (res.data.success) {
        Toast.show({ icon: 'success', content: '打卡成功！' });
        setTimeout(onBack, 1500);
      }
    } catch (err: any) {
      Toast.show({ icon: 'fail', content: err.response?.data?.message || '打卡失敗' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh' }}>
      <NavBar onBack={onBack}>即時打卡</NavBar>
      
      <div style={{ padding: 12 }}>
        <Card style={{ marginBottom: 16 }}>
          <AutoCenter style={{ padding: '20px 0' }}>
            {loading ? (
              <>
                <LoopOutline fontSize={48} spin color='var(--adm-color-primary)' />
                <div style={{ marginTop: 12 }}>正在獲取 GPS 定位...</div>
              </>
            ) : (
              <>
                <LocationOutline fontSize={48} color='var(--adm-color-primary)' />
                <div style={{ marginTop: 12, fontWeight: 'bold', fontSize: 18 }}>定位完成</div>
              </>
            )}
          </AutoCenter>
        </Card>

        {!loading && (
          <>
            <List header='目前位置'>
              <List.Item title='經緯度'>
                {loc?.lat.toFixed(5)}, {loc?.lng.toFixed(5)}
              </List.Item>
              <List.Item title='參考地址'>
                <span style={{ fontSize: 14, color: '#666' }}>{address || '讀取中...'}</span>
              </List.Item>
            </List>

            <div style={{ marginTop: 30 }}>
              <Button 
                block 
                color='primary' 
                size='large' 
                loading={submitting}
                onClick={onCheckIn}
                prefix={<CheckShieldOutline />}
              >
                立即打卡
              </Button>
              <Button 
                block 
                fill='none' 
                style={{ marginTop: 10 }}
                onClick={getLocation}
              >
                重新定位
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
