import { useEffect, useState } from 'react';
import { NavBar, Button, Card, AutoCenter, Toast } from 'antd-mobile';
import { CheckShieldOutline, LoopOutline } from 'antd-mobile-icons';
import axios from 'axios';
import LocationPicker from '../components/LocationPicker';

interface Props {
  lineUserId: string;
  onBack: () => void;
}

export default function CheckInNowPage({ lineUserId, onBack }: Props) {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [defaultLoc, setDefaultLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // 1. Get Default Location from server
    // We reuse schedule/list API for convenience to get config
    axios.get(`/api/schedule/list?lineUserId=${lineUserId}`)
      .then(res => {
        if (res.data.success && res.data.data.defaultLocation) {
            setDefaultLoc(res.data.data.defaultLocation);
        }
      })
      .catch(() => {})
      .finally(() => {
          // 2. Get Current Position
          getLocation();
      });
  }, [lineUserId]);

  const getLocation = () => {
    if (!navigator.geolocation) {
      Toast.show('瀏覽器不支援定位');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation({ lat: latitude, lng: longitude });
        setLoading(false);
      },
      (err) => {
        console.error(err);
        Toast.show('定位失敗，將使用預設值');
        // Fallback to default if available
        if (defaultLoc) setLocation(defaultLoc);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const onCheckIn = async () => {
    if (!location) return;
    setSubmitting(true);
    try {
      const res = await axios.post('/api/check-in/now', {
        lineUserId,
        lat: location.lat,
        lng: location.lng
      });
      if (res.data.success) {
        Toast.show({ icon: 'success', content: '打卡成功' });
        setTimeout(onBack, 1500);
      }
    } catch (err: any) {
      Toast.show({ icon: 'fail', content: err.response?.data?.message || '打卡失敗' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <NavBar onBack={onBack}>即時打卡</NavBar>
      
      <div style={{ padding: 12 }}>
        <Card style={{ marginBottom: 16 }}>
            {loading ? (
                <AutoCenter style={{ padding: '20px 0' }}>
                    <LoopOutline fontSize={48} spin color='var(--adm-color-primary)' />
                    <div style={{ marginTop: 12 }}>正在獲取位置...</div>
                </AutoCenter>
            ) : (
                <div style={{ padding: 12 }}>
                    <LocationPicker 
                        value={location!}
                        defaultValue={defaultLoc || undefined}
                        onChange={setLocation}
                    />
                </div>
            )}
        </Card>

        {!loading && (
            <div style={{ marginTop: 30 }}>
              <Button 
                block 
                color='primary' 
                size='large' 
                loading={submitting}
                onClick={onCheckIn}
                prefix={<CheckShieldOutline />}
              >
                確認打卡
              </Button>
            </div>
        )}
      </div>
    </div>
  );
}