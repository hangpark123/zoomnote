import React from 'react';

const styles = {
  page: {
    padding: '40px',
    fontFamily: '"Malgun Gothic", "Dotum", sans-serif',
    color: '#000',
    maxWidth: '210mm',
    margin: '0 auto',
  },
  headerBox: {
    textAlign: 'center',
    marginBottom: '30px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    textDecoration: 'underline',
    marginBottom: '10px',
  },
  subTitle: {
    fontSize: '16px',
    color: '#555',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '15px',
    fontSize: '13px',
  },
  th: {
    border: '1px solid #000',
    backgroundColor: '#f0f0f0',
    padding: '8px',
    textAlign: 'center',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
  },
  td: {
    border: '1px solid #000',
    padding: '8px',
    verticalAlign: 'middle',
  },
  tdCenter: {
    border: '1px solid #000',
    padding: '8px',
    textAlign: 'center',
    verticalAlign: 'middle',
  },
  signatureBox: {
    height: '50px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentBox: {
    border: '1px solid #000',
    height: '400px',
    padding: '15px',
    verticalAlign: 'top',
  }
};

export const ResearchNote = ({ user, date }) => {
  if (!user) return null;

  // ★ [핵심 로직] 이름 / 직함 / 부서 순서로 조립
  // 1. 배열에 [이름, 직함, 부서] 순서대로 담습니다.
  // 2. filter(Boolean): 값이 비어있거나 null인 항목은 자동으로 뺍니다. (슬래시 겹침 방지)
  // 3. join(" / "): 남은 항목들 사이사이에만 " / "를 넣습니다.
  
  // 예시 상황:
  // - 이름: 박민수, 직함: 사원, 부서: 신사업개발부  -> "박민수 / 사원 / 신사업개발부"
  // - 이름: 이지훈, 직함: (없음), 부서: 개발1부 2팀 -> "이지훈 / 개발1부 2팀" (슬래시가 1개만 생김)
  
  const userInfoStr = [user.name, user.job_title, user.department]
    .filter(Boolean) // 빈 값(null, undefined, "") 제거
    .join(" / "); 

  return (
    <div className="print-container" style={styles.page}>
      
      {/* 1. 헤더 */}
      <div style={styles.headerBox}>
        <div style={styles.title}>연 구 노 트</div>
        <div style={styles.subTitle}>아이알링크(주) 정보통신연구소 연구원 연구노트</div>
      </div>

      {/* 2. 결재란 */}
      <table style={styles.table}>
        <colgroup>
          <col style={{ width: '15%' }} />
          <col style={{ width: '42.5%' }} />
          <col style={{ width: '42.5%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={styles.th}>구분</th>
            <th style={styles.th}>기록자</th>
            <th style={styles.th}>확인자 / 점검자</th>
          </tr>
        </thead>
        <tbody>
          {/* 서명 행 */}
          <tr>
            <td style={styles.tdCenter}><strong>서명</strong></td>
            <td style={styles.tdCenter}>
              <div style={styles.signatureBox}>
                {/* ▼ 조립된 문자열(userInfoStr) 출력 */}
                <div style={{ marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                  {userInfoStr}
                </div>
                <div style={{ fontStyle: 'italic', color: '#ccc' }}>(서명)</div>
              </div>
            </td>
            <td style={styles.tdCenter}>
              <div style={styles.signatureBox}>
                <span style={{ color: '#ccc' }}>(서명)</span>
              </div>
            </td>
          </tr>
          {/* 서명 일자 행 */}
          <tr>
            <td style={styles.tdCenter}><strong>서명 일자</strong></td>
            <td style={styles.tdCenter}>
              {date}
            </td>
            <td style={styles.tdCenter}>
              {/* 공란 */}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 3. 연구 개요 정보 */}
      <table style={styles.table}>
        <colgroup>
          <col style={{ width: '15%' }} />
          <col style={{ width: '35%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '35%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td style={styles.th}>보고주차</td>
            <td style={styles.td}>2025년 12월 2주차</td>
            <td style={styles.th}>일련번호</td>
            <td style={styles.td}>2025-12-001</td>
          </tr>
          <tr>
            <td style={styles.th}>기록일자</td>
            <td style={styles.td}>{date}</td>
            <td style={styles.th}>기록자</td>
            {/* ▼ 여기도 똑같이 적용 */}
            <td style={styles.td}>{userInfoStr}</td>
          </tr>
          <tr>
            <td style={styles.th}>연구제목</td>
            <td colSpan="3" style={styles.td}>
             Zoom API 기반 자동화 시스템 고도화
            </td>
          </tr>
          <tr>
            <td style={styles.th}>연구기간</td>
            <td colSpan="3" style={styles.td}>2025.01.01 ~ 2025.12.31</td>
          </tr>
          <tr>
            <td style={styles.th}>금주목표</td>
            <td colSpan="3" style={styles.td}>
               부서별 데이터 연동 및 출력 레이아웃 최적화
            </td>
          </tr>
        </tbody>
      </table>

      {/* 4. 연구 내용 */}
      <div style={styles.contentBox}>
        <h4 style={{ margin: '0 0 15px 0', borderBottom: '1px solid #ddd', paddingBottom: '5px' }}>■ 연구 내용</h4>
        <div style={{ lineHeight: '1.8' }}>
          <p>1. <strong>Zoom API 연동 데이터 확장</strong></p>
          <ul style={{ listStyleType: 'circle', marginLeft: '20px' }}>
            <li>API 응답 데이터에서 <code>job_title</code> 필드 추출 및 UI 반영</li>
            <li>결재란 서명 일자 행 추가 및 자동 기입 로직 구현</li>
          </ul>

          <p>2. <strong>연구노트 UI/UX 개선</strong></p>
          <ul style={{ listStyleType: 'circle', marginLeft: '20px' }}>
             <li>인쇄 시 레이아웃 깨짐 현상을 방지하기 위한 CSS 스타일링 적용</li>
             <li>결재 라인 및 서명란 중앙 정렬 배치</li>
          </ul>
          
          <p style={{ marginTop: '20px', color: '#999' }}>
            (추가 작성 내용은 출력 후 수기로 기입 가능)
          </p>
        </div>
      </div>
      
      <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '14px' }}>
        위와 같이 연구노트를 기록함.
      </div>
    </div>
  );
};