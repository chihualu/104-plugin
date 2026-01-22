import { Button, Card, NavBar } from 'antd-mobile';

interface Props {
  empId: string;
  onBack: () => void;
  onLogout: () => void;
}

export default function SettingsPage({ empId, onBack, onLogout }: Props) {
  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <NavBar onBack={onBack}>個人設定</NavBar>
      <div style={{ padding: 20 }}>
        <Card title='帳號綁定'>
          <p>員工編號: {empId}</p>
          <p>LINE 連結: 已啟用</p>
          <Button 
            block 
            fill='outline' 
            color='danger' 
            style={{ marginTop: 20 }} 
            onClick={() => {
              if(window.confirm('確定要解除綁定嗎？')) onLogout();
            }}
          >
            解除綁定 (登出)
          </Button>
        </Card>
      </div>
    </div>
  );
}
