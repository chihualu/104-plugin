import { useEffect, useState } from 'react';
import { NavBar, List, Tag, AutoCenter } from 'antd-mobile';
import { LoopOutline } from 'antd-mobile-icons';
import axios from 'axios';

interface Props {
  onBack: () => void;
}

export default function AdminPage({ onBack }: Props) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/admin/users')
      .then(res => {
        if (res.data.success) {
          setUsers(res.data.data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh' }}>
      <NavBar onBack={onBack}>使用統計</NavBar>
      
      {loading ? (
        <AutoCenter style={{ marginTop: 50 }}>
          <LoopOutline fontSize={32} spin />
        </AutoCenter>
      ) : (
        <List header={`共 ${users.length} 位使用者`}>
          {users.map((u, idx) => (
            <List.Item 
              key={idx}
              description={new Date(u.lastActive).toLocaleString()}
              extra={
                <div style={{ fontSize: 12 }}>
                  <div>補卡: {u.checkInTotal}</div>
                  <div>簽核: {u.auditTotal}</div>
                </div>
              }
            >
              <div style={{ fontWeight: 'bold' }}>{u.empId}</div>
              <Tag color='primary' fill='outline'>{u.companyId}</Tag>
            </List.Item>
          ))}
        </List>
      )}
    </div>
  );
}
