export default function HintModeToggle({ hintMode, setHintMode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px' }}>
      <span style={{ fontSize:14 }}>💡 힌트 모드</span>
      <div
        onClick={() => setHintMode(!hintMode)}
        style={{
          width:44, height:24, borderRadius:12, cursor:'pointer',
          background: hintMode ? '#3B5BDB' : '#ccc',
          position:'relative', transition:'background 0.2s'
        }}>
        <div style={{
          position:'absolute', top:3,
          left: hintMode ? 23 : 3,
          width:18, height:18, borderRadius:'50%',
          background:'#fff', transition:'left 0.2s'
        }} />
      </div>
      <span style={{ fontSize:12, color:'#888' }}>{hintMode ? 'ON' : 'OFF'}</span>
    </div>
  );
}