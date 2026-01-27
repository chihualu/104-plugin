import { AutoCenter, SpinLoading } from 'antd-mobile';

interface Props {
  text?: string;
  visible?: boolean;
}

export default function FullScreenLoading({ text = 'Loading...', visible = true }: Props) {
  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999,
      background: 'rgba(255, 255, 255, 0.8)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <SpinLoading color='primary' style={{ '--size': '48px' }} />
      <div style={{ marginTop: 16, fontSize: 16, fontWeight: 'bold', color: 'var(--color-primary)' }}>
        {text}
      </div>
    </div>
  );
}
