import { useState, useEffect, useCallback } from 'react';

let _showToast = null;
export const showToast = (msg) => _showToast?.(msg);

export default function Toast() {
  const [msg, setMsg]       = useState('');
  const [visible, setVisible] = useState(false);

  const show = useCallback((m) => {
    setMsg(m);
    setVisible(true);
  }, []);

  useEffect(() => { _showToast = show; }, [show]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(t);
  }, [visible, msg]);

  if (!visible) return null;
  return <div className="toast">{msg}</div>;
}
