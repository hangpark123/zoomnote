// client/src/App.js
import React, { useEffect, useState, useMemo } from 'react';
import './App.css';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import ko from 'date-fns/locale/ko';

registerLocale('ko', ko);

const API_BASE =
  process.env.REACT_APP_API_BASE ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');

function toDateString(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekNumber(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 1;
  const temp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil(((temp - yearStart) / 86400000 + 1) / 7);
}

function App() {
  const [zoomReady, setZoomReady] = useState(false);
  const [zoomUserId, setZoomUserId] = useState(null);
  const [zoomEmail, setZoomEmail] = useState(null);
  const [zoomAccountId, setZoomAccountId] = useState(null);
  const [me, setMe] = useState(null);

  const [notes, setNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState('my');

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // 🔥 하단 시스템 로그 상태
  const [logs, setLogs] = useState([]);

  const addLog = (msg, data) => {
    const time = new Date().toISOString().slice(11, 19); // HH:MM:SS
    const line =
      `[${time}] ${msg}` +
      (data !== undefined ? ` | ${JSON.stringify(data)}` : '');
    console.log(line);
    setLogs((prev) => [...prev, line]);
  };

  const today = useMemo(() => new Date(), []);
  const [recordDate, setRecordDate] = useState(today);
  const [reportYear, setReportYear] = useState(today.getFullYear());
  const [reportWeek, setReportWeek] = useState(getWeekNumber(today));
  const [serialNo, setSerialNo] = useState(
    `${today.getFullYear()}-${getWeekNumber(today)}`
  );
  const [title, setTitle] = useState('');
  const [periodStart, setPeriodStart] = useState(null);
  const [periodEnd, setPeriodEnd] = useState(null);
  const [weeklyGoal, setWeeklyGoal] = useState('');
  const [content, setContent] = useState('');

  const myNotes = useMemo(() => {
    if (!me) return [];
    return notes.filter((n) => n.writer_zoom_user_id === me.zoom_user_id);
  }, [notes, me]);
  // 1. Zoom user id/email/accountId 가져오기 + 로그
  useEffect(() => {
    async function initZoomUser() {
      const devId =
        process.env.REACT_APP_DEV_ZOOM_USER_ID ||
        process.env.DEV_ZOOM_USER_ID ||
        null;
      const devEmail =
        process.env.REACT_APP_DEV_ZOOM_USER_EMAIL ||
        process.env.DEV_ZOOM_USER_EMAIL ||
        null;
      const devAccountId =
        process.env.REACT_APP_DEV_ZOOM_ACCOUNT_ID ||
        process.env.DEV_ZOOM_ACCOUNT_ID ||
        process.env.ZOOM_ACCOUNT_ID ||
        null;
      const allowDevFallback =
        process.env.REACT_APP_ALLOW_DEV_FALLBACK === 'true' ||
        process.env.ALLOW_DEV_FALLBACK === 'true';

      addLog('initZoomUser 시작', {
        hasZoomSdk: !!window.zoomSdk,
        type: typeof window.zoomSdk,
      });

      try {
        // 1) 아예 SDK 없으면
        if (!window.zoomSdk) {
          addLog('zoomSdk 없음', {});
          if (allowDevFallback && devId && devEmail) {
            addLog('DEV fallback 사용', { devId, devEmail, devAccountId });
            setZoomUserId(devId);
            setZoomEmail(devEmail);
            setZoomAccountId(devAccountId);
          } else {
            setZoomUserId(null);
            setZoomEmail(null);
            setZoomAccountId(null);
          }
          return;
        }

        // 2) config 호출
        let configResult;
        try {
          addLog('zoomSdk.config 호출', {
            capabilities: ['getUserContext', 'getUser'],
          });
          configResult = await window.zoomSdk.config({
            capabilities: ['getUserContext', 'getUser'],
            version: '0.16.0',
          });
          addLog('zoomSdk.config 성공', configResult);
        } catch (err) {
          addLog('zoomSdk.config 실패', {
            message: err?.message,
          });
          if (allowDevFallback && devId && devEmail) {
            setZoomUserId(devId);
            setZoomEmail(devEmail);
            setZoomAccountId(devAccountId);
          } else {
            setZoomUserId(null);
            setZoomEmail(null);
            setZoomAccountId(null);
          }
          return;
        }

        // 3) getUserContext 호출
        let raw;
        try {
          addLog('getUserContext 호출');
          raw = await window.zoomSdk.getUserContext();
          addLog('getUserContext raw', raw);
        } catch (err) {
          addLog('getUserContext 실패', {
            message: err?.message,
          });
          if (allowDevFallback && devId && devEmail) {
            setZoomUserId(devId);
            setZoomEmail(devEmail);
            setZoomAccountId(devAccountId);
          } else {
            setZoomUserId(null);
            setZoomEmail(null);
            setZoomAccountId(null);
          }
          return;
        }

        // 4) 결과 파싱
        const ctx = raw.userContext || raw;
        addLog('파싱 대상 ctx', ctx);

        const id =
          ctx.userId ||
          ctx.userUUID ||
          ctx.id ||
          (ctx.user && ctx.user.id) ||
          null;

        const email =
          ctx.userEmail ||
          ctx.email ||
          (ctx.user && ctx.user.email) ||
          null;

        const accountId =
          ctx.accountId ||
          (ctx.user && ctx.user.accountId) ||
          devAccountId ||
          null;

        addLog('파싱된 userId/email/accountId', { id, email, accountId });

        // 5) getUser 추가 시도 (id/email이 비어있으면)
        let finalId = id;
        let finalEmail = email;
        let finalAccountId = accountId;

        if ((!finalId || !finalEmail) && window.zoomSdk?.getUser) {
          try {
            addLog('getUser 호출');
            const userRes = await window.zoomSdk.getUser();
            addLog('getUser 응답', userRes);
            finalId =
              userRes?.userId ||
              userRes?.id ||
              userRes?.user?.id ||
              finalId;
            finalEmail =
              userRes?.email ||
              userRes?.user?.email ||
              finalEmail;
            finalAccountId =
              userRes?.accountId ||
              userRes?.user?.accountId ||
              finalAccountId;
          } catch (err) {
            addLog('getUser 실패', { message: err?.message });
          }
        }

        setZoomUserId(finalId || (allowDevFallback ? devId : null));
        setZoomEmail(finalEmail || (allowDevFallback ? devEmail : null));
        setZoomAccountId(finalAccountId || (allowDevFallback ? devAccountId : null));
      } catch (e) {
        console.error('initZoomUser error:', e);
        addLog('initZoomUser 전체 에러 → DEV fallback', {
          message: e?.message,
        });
        if (allowDevFallback && devId && devEmail) {
          setZoomUserId(devId);
          setZoomEmail(devEmail);
          setZoomAccountId(devAccountId);
        } else {
          setZoomUserId(null);
          setZoomEmail(null);
          setZoomAccountId(null);
        }
      } finally {
        setZoomReady(true);
        addLog('initZoomUser 종료', { zoomReady: true });
      }
    }

    initZoomUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // 2. 연구노트 & 현재 사용자 로드
  useEffect(() => {
    if (!zoomReady || (!zoomUserId && !zoomEmail)) {
      return;
    }

    addLog('loadMe/loadNotes 트리거', {
      zoomReady,
      zoomUserId,
      zoomEmail,
      zoomAccountId,
    });

    async function loadMe() {
      try {
        const params = new URLSearchParams();
        if (zoomUserId) params.set('zoomUserId', zoomUserId);
        if (zoomEmail) params.set('zoomEmail', zoomEmail);
        if (zoomAccountId) params.set('zoomAccountId', zoomAccountId);

        addLog('/api/me 호출', Object.fromEntries(params.entries()));

        const res = await fetch(`${API_BASE}/api/me?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          addLog('/api/me 응답', data);
          setMe(data);
        } else {
          const data = await res.json().catch(() => ({}));
          addLog('/api/me 실패', { status: res.status, data });
        }
      } catch (e) {
        console.warn('loadMe error', e);
        addLog('❌ loadMe error', { message: e.message });
      }
    }

    async function loadNotes() {
      try {
        setLoadingNotes(true);
        setError(null);

        const params = new URLSearchParams();
        if (zoomUserId) params.set('zoomUserId', zoomUserId);
        if (zoomEmail) params.set('zoomEmail', zoomEmail);
        if (zoomAccountId) params.set('zoomAccountId', zoomAccountId);

        addLog('/api/research-notes 호출', Object.fromEntries(params.entries()));

        const res = await fetch(
          `${API_BASE}/api/research-notes?${params.toString()}`
        );
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          addLog('/api/research-notes 실패', {
            status: res.status,
            data,
          });
          throw new Error(data.error || `연구노트 조회 실패 (${res.status})`);
        }

        addLog('/api/research-notes 응답', data);

        setMe(data.me);
        setNotes(data.notes || []);
      } catch (e) {
        console.error(e);
        setError(e.message);
        addLog('❌ loadNotes error', { message: e.message });
      } finally {
        setLoadingNotes(false);
      }
    }

    loadMe();
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomReady, zoomUserId, zoomEmail, zoomAccountId]);

  // 3. Zoom 전체 사용자/부서 동기화 조회
  const loadUsers = async () => {
    if (loadingUsers) return;
    try {
      setLoadingUsers(true);
      addLog('/api/users 호출');

      const res = await fetch(`${API_BASE}/api/users`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        addLog('/api/users 실패', { status: res.status, data });
        throw new Error(data.error || `직원 목록 조회 실패 (${res.status})`);
      }

      addLog('/api/users 응답', { count: (data || []).length });
      setUsers(data || []);
    } catch (e) {
      console.error(e);
      alert(e.message);
      addLog('❌ loadUsers error', { message: e.message });
    } finally {
      setLoadingUsers(false);
    }
  };

  // 4. 연구노트 저장
  const handleSave = async () => {
    if (!zoomUserId && !zoomEmail) {
      alert('Zoom 사용자 정보가 없습니다.');
      return;
    }
    if (!title.trim()) {
      alert('보고 제목을 입력해주세요.');
      return;
    }
    if (!content.trim()) {
      alert('보고 내용을 입력해주세요.');
      return;
    }

    try {
      setError(null);

      const body = {
        recordDate: toDateString(recordDate),
        reportYear,
        reportWeek,
        serialNo,
        title,
        periodStart: toDateString(periodStart) || null,
        periodEnd: toDateString(periodEnd) || null,
        weeklyGoal: weeklyGoal || null,
        content,
        zoomUserId,
        zoomEmail,
        zoomAccountId,
      };

      const params = new URLSearchParams();
      if (zoomUserId) params.set('zoomUserId', zoomUserId);
      if (zoomEmail) params.set('zoomEmail', zoomEmail);
      if (zoomAccountId) params.set('zoomAccountId', zoomAccountId);

      addLog('연구노트 저장 요청', {
        query: Object.fromEntries(params.entries()),
        body,
      });

      const res = await fetch(
        `${API_BASE}/api/research-notes?${params.toString()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        addLog('연구노트 저장 실패', { status: res.status, data });
        throw new Error(data.error || `연구노트 저장 실패 (${res.status})`);
      }

      addLog('연구노트 저장 성공', data);

      const inserted = data;
      setNotes((prev) => [inserted, ...prev]);

      setTitle('');
      setWeeklyGoal('');
      setContent('');
    } catch (e) {
      console.error(e);
      setError(e.message);
      alert(e.message);
      addLog('❌ handleSave error', { message: e.message });
    }
  };

  // 5. 출력
  const handlePrintNote = (note) => {
    const win = window.open('', '_blank');
    if (!win) return;

    const period =
      (note.period_start ? toDateString(note.period_start) : '') +
      (note.period_end ? ' ~ ' + toDateString(note.period_end) : '');

    win.document.write(`
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <title>연구노트 출력</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "Noto Sans KR", sans-serif; padding: 32px; }
            h1 { font-size: 22px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            th, td { border: 1px solid #ccc; padding: 8px 10px; font-size: 13px; }
            th { background: #f3f4f6; text-align: left; }
            pre { white-space: pre-wrap; font-size: 13px; }
          </style>
        </head>
        <body>
          <h1>Zoom 연구노트</h1>
          <table>
            <tr>
              <th>부서</th>
              <td>${note.department_name || ''}</td>
              <th>작성자</th>
              <td>
                ${(note.writer_name || '')}
                ${note.writer_job_title ? ' / ' + note.writer_job_title : ''}
                ${note.department_name ? ' / ' + note.department_name : ''}
              </td>
            </tr>
            <tr>
              <th>기록일자</th>
              <td>${toDateString(note.record_date)}</td>
              <th>보고 주차</th>
              <td>${note.report_year}년 ${note.report_week}주차</td>
            </tr>
            <tr><th>보고 제목</th><td colspan="3">${note.title || ''}</td></tr>
            <tr><th>보고기간</th><td colspan="3">${period}</td></tr>
            <tr><th>금주 목표</th><td colspan="3">${note.weekly_goal || ''}</td></tr>
          </table>
          <h2>보고 내용</h2>
          <pre>${(note.content || '').replace(/</g, '&lt;')}</pre>
        </body>
      </html>
    `);

    win.document.close();
    win.focus();
    win.print();
  };

  // ---------- 화면 ----------
  return (
    <div className="app-root">
      <header className="app-header">
        <h1>사내 Zoom 연구노트 대시보드</h1>
        <div className="app-header-meta">
          <span>
            현재 사용자{' '}
            {me
              ? `${me.name} / ${me.job_title || '직책 미등록'} / ${
                  me.department_name || '부서 미등록'
                }`
              : loadingNotes
              ? '불러오는 중...'
              : zoomEmail || zoomUserId || '알 수 없음'}
          </span>
          {me && (
            <span style={{ marginLeft: 12 }}>
              부서 {me.department_name || '미등록'}
            </span>
          )}
        </div>
        <div className="app-tabs">
          <button
            className={activeTab === 'my' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('my')}
          >
            내 연구노트
          </button>
          <button
            className={activeTab === 'dept' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('dept')}
          >
            부서별 문서
          </button>
          <button
            className={activeTab === 'users' ? 'tab active' : 'tab'}
            onClick={() => {
              setActiveTab('users');
              if (!users.length) loadUsers();
            }}
          >
            Zoom 직원/부서 현황
          </button>
        </div>
      </header>

      <main className="app-main">
        {error && <div className="error-banner">오류: {error}</div>}

        {/* ---------- 내 연구노트 탭 ---------- */}
        {activeTab === 'my' && (
          <>
            <section className="card">
              <div className="card-header">
                <h2>새 연구노트 작성</h2>
                <button
                  className="ghost-btn"
                  onClick={() => {
                    const el = document.querySelector('.new-note-form');
                    if (!el) return;
                    el.classList.toggle('collapsed');
                  }}
                >
                  작성 폼 접기/펼치기
                </button>
              </div>
              <div className="card-subheader">
                {me ? (
                  <>
                    기록자&nbsp;
                    <strong>{me.name}</strong> / {me.job_title || '직책 미등록'} /{' '}
                    {me.department_name || '부서 미등록'}
                  </>
                ) : (
                  <>기록자 정보를 불러오는 중입니다...</>
                )}
              </div>
              <div className="card-body new-note-form">
                <div className="form-grid">
                  <div className="form-row">
                    <label>기록일자</label>
                    <DatePicker
                      selected={recordDate}
                      onChange={(d) => {
                        setRecordDate(d);
                        const week = getWeekNumber(d);
                        const year = d.getFullYear();
                        setReportYear(year);
                        setReportWeek(week);
                        setSerialNo(`${year}-${week}`);
                      }}
                      dateFormat="yyyy-MM-dd"
                      locale="ko"
                      className="input"
                    />
                  </div>
                  <div className="form-row">
                    <label>보고 연도</label>
                    <input
                      className="input"
                      type="number"
                      value={reportYear}
                      onChange={(e) => setReportYear(Number(e.target.value))}
                    />
                  </div>
                  <div className="form-row">
                    <label>주차</label>
                    <input
                      className="input"
                      type="number"
                      value={reportWeek}
                      onChange={(e) => setReportWeek(Number(e.target.value))}
                    />
                  </div>
                  <div className="form-row">
                    <label>문서번호</label>
                    <input
                      className="input"
                      value={serialNo}
                      onChange={(e) => setSerialNo(e.target.value)}
                    />
                  </div>
                  <div className="form-row full">
                    <label>보고 제목</label>
                    <input
                      className="input"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label>보고기간 시작</label>
                    <DatePicker
                      selected={periodStart}
                      onChange={(d) => setPeriodStart(d)}
                      dateFormat="yyyy-MM-dd"
                      locale="ko"
                      className="input"
                      placeholderText="날짜 선택"
                    />
                  </div>
                  <div className="form-row">
                    <label>보고기간 종료</label>
                    <DatePicker
                      selected={periodEnd}
                      onChange={(d) => setPeriodEnd(d)}
                      dateFormat="yyyy-MM-dd"
                      locale="ko"
                      className="input"
                      placeholderText="날짜 선택"
                    />
                  </div>
                  <div className="form-row full">
                    <label>금주 목표</label>
                    <input
                      className="input"
                      value={weeklyGoal}
                      onChange={(e) => setWeeklyGoal(e.target.value)}
                    />
                  </div>
                  <div className="form-row full">
                    <label>보고 내용</label>
                    <textarea
                      className="textarea"
                      rows={6}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button className="primary-btn" onClick={handleSave}>
                    연구노트 저장
                  </button>
                </div>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <h2>내 연구노트 목록</h2>
                {loadingNotes && <span className="badge">로딩 중...</span>}
              </div>
              <div className="card-body">
                {myNotes.length === 0 ? (
                  <p className="muted">작성한 연구노트가 없습니다.</p>
                ) : (
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>부서</th>
                          <th>보고 주차 / 작성자</th>
                          <th>보고 제목</th>
                          <th>보고기간</th>
                          <th>작성일</th>
                          <th>출력</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myNotes.map((n) => (
                          <tr key={n.id}>
                            <td>{n.department_name || ''}</td>
                            <td>
                              {n.report_year}년 {n.report_week}주차 /{' '}
                              {n.writer_name || ''}
                              {n.writer_job_title
                                ? ` / ${n.writer_job_title}`
                                : ''}
                              {n.department_name
                                ? ` / ${n.department_name}`
                                : ''}
                            </td>
                            <td>{n.title}</td>
                            <td>
                              {toDateString(n.period_start)} ~{' '}
                              {toDateString(n.period_end)}
                            </td>
                            <td>{toDateString(n.record_date)}</td>
                            <td>
                              <button
                                className="small-btn"
                                onClick={() => handlePrintNote(n)}
                              >
                                출력
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* ---------- 부서별 문서 탭 ---------- */}
        {activeTab === 'dept' && (
          <section className="card">
            <div className="card-header">
              <h2>연구노트 목록 (권한에 따른 범위)</h2>
              {loadingNotes && <span className="badge">로딩 중...</span>}
            </div>
            <div className="card-body">
              {notes.length === 0 ? (
                <p className="muted">조회된 연구노트가 없습니다.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>부서</th>
                        <th>보고 주차 / 작성자</th>
                        <th>보고 제목</th>
                        <th>보고기간</th>
                        <th>작성일</th>
                        <th>출력</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notes.map((n) => (
                        <tr key={n.id}>
                          <td>{n.department_name || ''}</td>
                          <td>
                            {n.report_year}년 {n.report_week}주차 /{' '}
                            {n.writer_name || ''}
                            {n.writer_job_title
                              ? ` / ${n.writer_job_title}`
                              : ''}
                            {n.department_name
                              ? ` / ${n.department_name}`
                              : ''}
                          </td>
                          <td>{n.title}</td>
                          <td>
                            {toDateString(n.period_start)} ~{' '}
                            {toDateString(n.period_end)}
                          </td>
                          <td>{toDateString(n.record_date)}</td>
                          <td>
                            <button
                              className="small-btn"
                              onClick={() => handlePrintNote(n)}
                            >
                              출력
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ---------- Zoom 직원/부서 현황 탭 ---------- */}
        {activeTab === 'users' && (
          <section className="card">
            <div className="card-header">
              <h2>Zoom 직원 및 부서 현황</h2>
              <button className="ghost-btn" onClick={loadUsers}>
                새로 불러오기
              </button>
              {loadingUsers && <span className="badge">로딩 중...</span>}
            </div>
            <div className="card-body">
              <p className="muted">
                목록을 불러오면 Zoom API 데이터를 바탕으로
                직원/부서 정보가 DB(users, departments)에 동기화됩니다.
              </p>
              {users.length === 0 ? (
                <p className="muted">직원 목록이 없습니다.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>부서</th>
                        <th>이름</th>
                        <th>이메일</th>
                        <th>직책</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td>{u.department}</td>
                          <td>{u.name}</td>
                          <td>{u.email}</td>
                          <td>{u.job_title}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* ★★★ 화면 하단 고정 로그창 ★★★ */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '150px',
          backgroundColor: 'black',
          color: '#0f0',
          fontSize: '12px',
          overflowY: 'scroll',
          padding: '10px',
          borderTop: '2px solid #333',
          zIndex: 99999,
          opacity: 0.9,
        }}
      >
        <strong>[시스템 로그]</strong>
        <br />
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </div>
  );
}

export default App;
