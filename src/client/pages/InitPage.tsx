import { AutoCenter, Button } from 'antd-mobile';
import { LoopOutline } from 'antd-mobile-icons';

interface Props {
  debugMsg: string;
}

export default function InitPage({ debugMsg }: Props) {
  return (
    <AutoCenter style={{ marginTop: 50, flexDirection: 'column' }}>
      <LoopOutline fontSize={48} />
      <div style={{ marginTop: 20 }}>載入中...</div>
      <div style={{ marginTop: 10, color: '#666', fontSize: 12 }}>{debugMsg}</div>
      <Button size='small' color='primary' fill='outline' style={{ marginTop: 20 }} onClick={() => window.location.reload()}>重新整理</Button>
    </AutoCenter>
  );
}
