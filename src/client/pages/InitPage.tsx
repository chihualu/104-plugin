import { Button } from 'antd-mobile';
import FullScreenLoading from '../components/FullScreenLoading';

interface Props {
  debugMsg: string;
}

export default function InitPage({ debugMsg }: Props) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background)' }}>
      <FullScreenLoading text='系統初始化中...' />
      <div style={{ 
        position: 'fixed', 
        bottom: 40, 
        left: 0, 
        right: 0, 
        textAlign: 'center', 
        padding: 20 
      }}>
        <div style={{ marginBottom: 10, color: 'var(--color-text-tertiary)', fontSize: 12 }}>{debugMsg}</div>
        <Button size='small' color='primary' fill='outline' onClick={() => window.location.reload()}>
          重新整理
        </Button>
      </div>
    </div>
  );
}
