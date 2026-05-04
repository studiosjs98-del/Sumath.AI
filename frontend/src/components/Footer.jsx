import React from 'react'
import { Link } from 'react-router-dom'
import { Mail, Phone } from 'lucide-react'

const GREY = '#6B7280'

export default function Footer() {
  return (
    <footer style={{
      background: '#111827', color: '#9ca3af',
      borderTop: '1px solid #374151',
      padding: '48px 0 32px',
      marginTop: 'auto'
    }}>
      <div className="container">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '40px', marginBottom: '40px' }}>
          {/* Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: 'white', fontSize: '14px' }}>수</div>
              <span style={{ fontSize: '17px', fontWeight: '800', color: 'white' }}>수학 마스터</span>
            </div>
            <p style={{ fontSize: '13px', lineHeight: 1.8, color: GREY }}>
              AI 기반 맞춤형 수학 학습 플랫폼.<br />
              중학교 1학년부터 고등학교 3학년까지<br />
              완벽한 수학 실력을 만들어 드립니다.
            </p>
          </div>

          {/* Services */}
          <div>
            <h4 style={{ color: 'white', fontWeight: '700', fontSize: '14px', marginBottom: '16px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>서비스</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { to: '/ai-chat', label: 'AI 채팅' },
                { to: '/ai-chat', label: '홈' },
              ].map(item => (
                <li key={item.to}>
                  <Link to={item.to} style={{ color: '#9ca3af', fontSize: '14px', textDecoration: 'none', transition: 'color 0.15s' }}
                    onMouseEnter={e => e.target.style.opacity = '1'}
                    onMouseLeave={e => e.target.style.opacity = '0.75'}
                  >{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Curriculum */}
          <div>
            <h4 style={{ color: 'white', fontWeight: '700', fontSize: '14px', marginBottom: '16px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>교육과정</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {['중학교 수학 (중1~중3)', '고등학교 공통수학 (고1)', '수학I · 수학II (고2)', '미적분 · 확률과통계 (고3)', '기하 (고3)'].map(item => (
                <li key={item} style={{ color: GREY, fontSize: '14px' }}>{item}</li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 style={{ color: 'white', fontWeight: '700', fontSize: '14px', marginBottom: '16px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>고객센터</h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <li style={{ color: GREY, fontSize: '14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Mail size={14} color={GREY} strokeWidth={1.75} />
                support@sumathmaster.kr
              </li>
              <li style={{ color: GREY, fontSize: '14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Phone size={14} color={GREY} strokeWidth={1.75} />
                1588-0000 (평일 9~18시)
              </li>
              <li style={{ color: GREY, fontSize: '14px' }}>운영시간: 월~금 09:00~18:00</li>
            </ul>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #374151', paddingTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <p style={{ fontSize: '13px', color: GREY }}>
            © 2025 수학 마스터. All rights reserved.
          </p>
          <div style={{ display: 'flex', gap: '20px' }}>
            {['이용약관', '개인정보처리방침', '고객센터'].map(item => (
              <span key={item} style={{ fontSize: '13px', color: GREY, cursor: 'pointer' }}
                onMouseEnter={e => e.target.style.opacity = '1'}
                onMouseLeave={e => e.target.style.opacity = '0.75'}
              >{item}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
