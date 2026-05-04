export default function HintModePopup({ onChoose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:32, maxWidth:400, width:'90%', textAlign:'center', boxShadow:'0 8px 32px rgba(0,0,0,0.15)' }}>
        <h2 style={{ marginTop:0 }}>💡 학습 방식을 선택하세요</h2>
        <p style={{ color:'#555' }}>문제를 바로 풀어드릴까요, 아니면 질문을 통해 스스로 풀도록 도와드릴까요?</p>
        <div style={{ display:'flex', gap:12, marginTop:24 }}>
          <button
            onClick={() => onChoose(false)}
            style={{ flex:1, padding:'12px 0', background:'#f1f3f5', color:'#333', border:'none', borderRadius:10, cursor:'pointer', fontWeight:600, fontSize:15 }}>
            📋 바로 풀어줘
          </button>
          <button
            onClick={() => onChoose(true)}
            style={{ flex:1, padding:'12px 0', background:'#3B5BDB', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontWeight:600, fontSize:15 }}>
            🧠 힌트로 배우기
          </button>
        </div>
        <p style={{ fontSize:12, color:'#aaa', marginTop:16 }}>나중에 설정에서 바꿀 수 있어요</p>
      </div>
    </div>
  );
}