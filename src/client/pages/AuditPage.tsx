import { useEffect, useState } from 'react';
import { Button, Toast, AutoCenter, CheckList, Modal, ProgressBar, NavBar } from 'antd-mobile';
import { LoopOutline } from 'antd-mobile-icons';
import axios from 'axios';

interface Props {
  lineUserId: string;
  onBack: () => void;
}

export default function AuditPage({ lineUserId, onBack }: Props) {
  const [auditList, setAuditList] = useState<any[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [progress, setProgress] = useState({ visible: false, title: '', current: 0, total: 0, logs: [] as string[] });

  useEffect(() => {
    setLoadingAudit(true);
    axios.get(`/api/audit/list?lineUserId=${lineUserId}`)
      .then(res => {
        if (res.data.success) {
          const list = Array.isArray(res.data.data) ? res.data.data : [];
          setAuditList(list);
          setSelectedKeys(list.filter((i: any) => i.EnWorksheetDataID).map((i: any) => i.EnWorksheetDataID));
        }
      })
      .catch(() => Toast.show('無法取得簽核清單'))
      .finally(() => setLoadingAudit(false));
  }, [lineUserId]);

  const onApprove = async () => {
    if (selectedKeys.length === 0) return;
    
    setProgress({ visible: true, title: '簽核執行中', current: 0, total: selectedKeys.length, logs: [] });

    try {
      const response = await fetch('/api/audit/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId, approvalKeys: selectedKeys })
      });

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
                 logs: [`[${data.status === 'success' ? '成功' : '失敗'}] 單據處理完成 (${data.index}/${data.total})`, ...prev.logs]
               }));
            } else if (data.type === 'done') {
               Toast.show({ icon: 'success', content: `完成！成功 ${data.successCount} 筆` });
               setTimeout(() => {
                 setProgress(prev => ({ ...prev, visible: false }));
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
      Toast.show({ icon: 'fail', content: err.message || '簽核失敗' });
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
          <div style={{ height: 100, overflowY: 'auto', background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: 12 }}>
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
    <div style={{ background: '#f5f5f5', minHeight: '100vh', paddingBottom: 80 }}>
      <NavBar onBack={onBack}>表單簽核</NavBar>
      
      {loadingAudit ? (
        <AutoCenter style={{ marginTop: 50, flexDirection: 'column' }}>
          <LoopOutline fontSize={48} spin />
          <div style={{ marginTop: 20 }}>讀取中...</div>
        </AutoCenter>
      ) : (
        <div style={{ padding: 12 }}>
          {auditList.length === 0 ? (
            <AutoCenter style={{ marginTop: 50 }}>目前沒有待簽核文件</AutoCenter>
          ) : (
            <>
              <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>共 {auditList.length} 筆</span>
                  <Button size='mini' onClick={() => {
                    if (selectedKeys.length === auditList.length) setSelectedKeys([]);
                    else setSelectedKeys(auditList.map(i => i.EnWorksheetDataID));
                  }}>
                    {selectedKeys.length === auditList.length ? '取消全選' : '全選'}
                  </Button>
              </div>

              <div style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}>
                <CheckList
                  multiple
                  value={selectedKeys}
                  onChange={v => setSelectedKeys(v)}
                >
                  {auditList.map((item, idx) => (
                    <CheckList.Item key={item.EnWorksheetDataID || idx} value={item.EnWorksheetDataID || `unknown_${idx}`}>
                      <div style={{ padding: '4px 0' }}>
                        <div style={{ fontWeight: 'bold' }}>{item.ApplyName || '未知'} <span style={{fontWeight:'normal', fontSize:12}}>({item._category || '表單'})</span></div>
                        <div style={{ fontSize: 12, color: '#666' }}>
                          {item.ApplyDatetime} | {item.WsdStatus}
                        </div>
                        <div style={{ fontSize: 12 }}>{item.ApplyDeptName}</div>
                      </div>
                    </CheckList.Item>
                  ))}
                </CheckList>
              </div>
            </>
          )}
        </div>
      )}

      {auditList.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: 12, background: '#fff', borderTop: '1px solid #eee' }}>
          <Button 
            block 
            color='primary' 
            size='large' 
            onClick={onApprove} 
            disabled={selectedKeys.length === 0}
          >
            一鍵簽核 ({selectedKeys.length})
          </Button>
        </div>
      )}
      {progressModal}
    </div>
  );
}
