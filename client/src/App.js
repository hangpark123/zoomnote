import React, { useState, useEffect } from 'react';
import { ResearchNote } from './ResearchNote'; // 컴포넌트 import 확인
import './App.css'; 

// API_BASE 우선순위:
// 1) REACT_APP_API_BASE 환경변수 (ngrok/배포 도메인 넣기)
// 2) 개발모드: http://localhost:5000
// 3) 프로덕션: 상대경로 (동일 오리진)
const API_BASE =
  process.env.REACT_APP_API_BASE ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');

function App() {
  const [users, setUsers] = useState([]);      
  const [loading, setLoading] = useState(true); 
  const [error, setError] = useState(null);
  
  // ★ 인쇄할 사람 정보를 담을 state
  const [printUser, setPrintUser] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/users`);
      if (!response.ok) throw new Error('데이터 실패');
      const data = await response.json();
      setUsers(data); 
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ★ [수정됨] 라이브러리 없이 인쇄하는 함수
  const handlePrint = (user) => {
    setPrintUser(user); // 1. 인쇄할 사람 데이터 세팅
    
    // 2. 데이터가 렌더링될 시간을 0.1초 준 뒤 인쇄 창 띄우기
    setTimeout(() => {
      window.print();
    }, 100);
  };

  if (loading) return <h2>⏳ 로딩 중...</h2>;
  if (error) return <h2 style={{ color: 'red' }}>{error}</h2>;

  return (
    <div className="App" style={{ padding: '20px' }}>
      
      {/* 화면에 보이는 목록 영역 (인쇄할 때는 숨겨짐) */}
      <div className="no-print">
        <h1>🏢 Zoom 직원 및 부서 현황</h1>
        <table border="1" cellPadding="10" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th>부서</th>
              <th>이름</th>
              <th>이메일</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.department}</td>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td style={{ textAlign: 'center' }}>
                  {/* ★ 클릭하면 handlePrint 실행 */}
                  <button 
                    onClick={() => handlePrint(user)}
                    style={{ cursor: 'pointer', padding: '5px 10px' }}
                  >
                    🖨️ 출력
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ★ [중요] 인쇄용 영역 (평소엔 안 보임) */}
      <div className="print-only">
        {printUser && (
          <ResearchNote 
            user={printUser} 
            date={new Date().toLocaleDateString()} 
          />
        )}
      </div>

    </div>
  );
}

export default App;
