import { useState, useEffect } from 'react';

export function useHintMode() {
  const [hintMode, setHintModeState] = useState(false);
  const [hasChosen, setHasChosen] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch('/api/auth/hint-mode', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setHintModeState(data.hintMode);
        const chosen = localStorage.getItem('hintModeChosen');
        if (!chosen) setHasChosen(false);
      });
  }, []);

  const setHintMode = async (value) => {
    const token = localStorage.getItem('token');
    setHintModeState(value);
    setHasChosen(true);
    localStorage.setItem('hintModeChosen', 'true');
    await fetch('/api/auth/hint-mode', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ hintMode: value })
    });
  };

  return { hintMode, hasChosen, setHintMode };
}