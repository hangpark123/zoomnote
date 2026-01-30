// client/src/App.js
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import './App.css';
import RichTextEditor from './RichTextEditor';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import ko from 'date-fns/locale/ko';

registerLocale('ko', ko);

const API_BASE =
  process.env.REACT_APP_API_BASE ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');

// 첨부파일 기능은 유지하되, UI에서는 숨김 처리
const SHOW_ATTACHMENTS_UI = false;

// 관리자 문서 수정(누락/휴가) 대상 부서 ID
const ADMIN_TARGET_DEPT_IDS = new Set([1, 2, 3, 8, 12, 13, 19]);

function toDateString(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toDateTimeMinuteString(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
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

function decodeAppContextToken(token) {
  if (!token) return {};
  const tryJson = (txt) => { try { return JSON.parse(txt); } catch { return null; } };
  const direct = tryJson(token);
  if (direct) return direct;
  const parts = token.split('.');
  if (parts.length === 3) {
    const payload = parts[1];
    try {
      const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      const parsed = tryJson(json);
      if (parsed) return parsed;
    } catch (e) { }
  }
  try {
    const norm = token.replace(/-/g, '+').replace(/_/g, '/');
    const padded = norm + '='.repeat((4 - (norm.length % 4)) % 4);
    const json = atob(padded);
    const parsed = tryJson(json);
    if (parsed) return parsed;
  } catch (e) { }
  return {};
}

function normalizeContentHtml(raw = '') {
  const value = raw || '';
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(value);
  if (looksLikeHtml) return value;
  return value.replace(/(\r\n|\n|\r)/g, '<br />');
}

function parseYearWeekKey(key) {
  const txt = String(key || '').trim();
  const m = txt.match(/(\d+)\s*년\s*(\d+)\s*주차/);
  if (m) {
    return { year: Number(m[1]) || 0, week: Number(m[2]) || 0 };
  }
  const m2 = txt.match(/(\d+)/);
  if (m2) return { year: 0, week: Number(m2[1]) || 0 };
  return { year: Number.POSITIVE_INFINITY, week: Number.POSITIVE_INFINITY };
}

function hasContentValue(value) {
  if (!value) return false;
  const hasImage = /<img[^>]+src=["']?[^"'>]+/i.test(value);
  const plain = value.replace(/<[^>]*>/g, '').replace(/\u00A0/g, ' ').trim();
  return hasImage || plain.length > 0;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    } catch (e) {
      reject(e);
    }
  });
}

const debugLog = (...args) => {
  try {
    // eslint-disable-next-line no-console
    console.log('[zoomnote]', ...args);
  } catch (e) {
    /* ignore */
  }
};

const toAbsoluteUrl = (url) => {
  try {
    return new URL(url, window.location.origin).toString();
  } catch (e) {
    return url;
  }
};

const sendServerLog = async (message, context = {}) => {
  try {
    await fetch('/api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message, context }),
    });
  } catch (e) {
    /* ignore */
  }
};

function App() {
  const [zoomReady, setZoomReady] = useState(false);
  const [zoomUserId, setZoomUserId] = useState(null);
  const [zoomEmail, setZoomEmail] = useState(null);
  const [zoomAccountId, setZoomAccountId] = useState(null);
  const [appContextHeader, setAppContextHeader] = useState(null);

  const [me, setMe] = useState(null);
  const [notes, setNotes] = useState([]);
  const [users, setUsers] = useState([]);
  const [userRoleEdits, setUserRoleEdits] = useState({});
  const [roleSavingId, setRoleSavingId] = useState(null);

  const [signatureData, setSignatureData] = useState('');
  const [signatureType, setSignatureType] = useState('none');
  const canvasRef = useRef(null);
  const drawingRef = useRef({ drawing: false, lastX: 0, lastY: 0 });
  const hasDrawingRef = useRef(false);
  const [signatureLoading, setSignatureLoading] = useState(false);

  const fileInputRef = useRef(null);
  const editFileInputRef = useRef(null);
  const formSectionRef = useRef(null);
  const sigSectionRef = useRef(null);

  const [searchCategory, setSearchCategory] = useState('title');
  const [searchText, setSearchText] = useState('');
  const [adminSearchCategory, setAdminSearchCategory] = useState('title');
  const [adminSearchText, setAdminSearchText] = useState('');

  const [loadingUsers, setLoadingUsers] = useState(false);
  const [proxySignerId, setProxySignerId] = useState(null);
  const [proxyMode, setProxyMode] = useState(false);
  const [error, setError] = useState(null);
  const [modalMessage, setModalMessage] = useState('');
  const [activeTab, setActiveTab] = useState('my-manage');
  const [isFormCollapsed, setIsFormCollapsed] = useState(true);
  const [isSigCollapsed, setIsSigCollapsed] = useState(true);
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  // [Dark Mode]
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // 저장된 테마 불러오기 (없으면 시스템 설정 따름)
    const saved = localStorage.getItem('zoomnote-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('zoomnote-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('zoomnote-theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);
  const [adminMissingYear, setAdminMissingYear] = useState(new Date().getFullYear());
  const [adminMissingWeek, setAdminMissingWeek] = useState(getWeekNumber(new Date()));
  const [adminVacations, setAdminVacations] = useState([]);
  const [myVacations, setMyVacations] = useState([]);
  const [adminVacationDraftIds, setAdminVacationDraftIds] = useState(() => new Set());
  const [adminVacationSaving, setAdminVacationSaving] = useState(false);
  const [adminVacationOpen, setAdminVacationOpen] = useState(false);
  const [adminMissingOpen, setAdminMissingOpen] = useState(false); // [Request] Default collapsed

  // [System Config]
  const [configYear, setConfigYear] = useState(new Date().getFullYear());
  const [configOffset, setConfigOffset] = useState('');
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Accordion State
  const [expandedDepts, setExpandedDepts] = useState({});
  const [expandedWeeks, setExpandedWeeks] = useState({});

  // Modal States
  const [previewNote, setPreviewNote] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [editingNote, setEditingNote] = useState(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState([]);

  const today = useMemo(() => new Date(), []);

  const handleModalConfirm = useCallback(() => {
    const msg = modalMessage;
    setModalMessage('');
    if (msg === '작성 완료했습니다') {
      setActiveTab('my-manage');
    }
  }, [modalMessage]);


  // Create Form States
  const [recordDate, setRecordDate] = useState(today);
  const [reportYear, setReportYear] = useState(today.getFullYear());
  const [reportWeek, setReportWeek] = useState(getWeekNumber(today));
  const [title, setTitle] = useState('');
  const [periodStart, setPeriodStart] = useState(null);
  const [periodEnd, setPeriodEnd] = useState(null);
  const [weeklyGoal, setWeeklyGoal] = useState('');
  const [content, setContent] = useState('');
  const [attachmentFiles, setAttachmentFiles] = useState([]);

  // User Template (고정값 저장 기능)
  const [userTemplate, setUserTemplate] = useState(null);
  const [hasTemplate, setHasTemplate] = useState(false);

  // Edit Form States
  const [editingMode, setEditingMode] = useState('self');
  const [editRecordDate, setEditRecordDate] = useState(null);
  const [editReportYear, setEditReportYear] = useState('');
  const [editReportWeek, setEditReportWeek] = useState('');
  const [editSerialNo, setEditSerialNo] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editPeriodStart, setEditPeriodStart] = useState(null);
  const [editPeriodEnd, setEditPeriodEnd] = useState(null);
  const [editWeeklyGoal, setEditWeeklyGoal] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editAttachments, setEditAttachments] = useState([]);
  const [editFileDeleted, setEditFileDeleted] = useState(false);

  const isLeader = useMemo(() => {
    if (!me) return false;
    return ['leader', 'admin', 'master'].includes(me.role);
  }, [me]);

  const isMaster = useMemo(() => me?.role === 'master', [me]);

  const myNotes = useMemo(() => {
    if (!me) return [];
    return notes.filter((n) => n.writer_zoom_user_id === me.zoom_user_id);
  }, [notes, me]);

  const leaderSigners = useMemo(
    () => users.filter((u) => ['leader', 'master'].includes(u.role) && u.signature_data),
    [users]
  );

  const groupedNotes = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    let targetNotes = notes;
    if (keyword) {
      targetNotes = notes.filter(n => {
        if (searchCategory === 'title') return (n.title || '').toLowerCase().includes(keyword);
        return (n.writer_name || '').toLowerCase().includes(keyword);
      });
    }

    const structure = {};
    targetNotes.forEach(note => {
      const dept = note.department_name || '부서 미등록';
      if (!structure[dept]) structure[dept] = {};

      const weekKey = `${note.report_year}년 ${note.report_week}주차`;
      if (!structure[dept][weekKey]) structure[dept][weekKey] = [];

      structure[dept][weekKey].push(note);
    });
    return structure;
  }, [notes, searchText, searchCategory]);

  const adminFilteredNotes = useMemo(() => {
    const keyword = adminSearchText.trim().toLowerCase();
    if (!keyword) return notes;
    return notes.filter((n) => {
      if (adminSearchCategory === 'writer') return (n.writer_name || '').toLowerCase().includes(keyword);
      if (adminSearchCategory === 'serial') return (n.serial_no || '').toLowerCase().includes(keyword);
      return (n.title || '').toLowerCase().includes(keyword);
    });
  }, [notes, adminSearchCategory, adminSearchText]);

  const selectedNotes = useMemo(
    () => notes.filter((n) => selectedNoteIds.includes(n.id)),
    [notes, selectedNoteIds]
  );

  const myVacationWeeks = useMemo(() => {
    const set = new Set();
    (myVacations || []).forEach((v) => {
      const wk = Number(v?.week);
      if (Number.isInteger(wk)) set.add(wk);
    });
    return set;
  }, [myVacations]);

  const myWeekStatus = useMemo(() => {
    const maxWeeks = 53;
    let adjustedCount = 0;
    const map = Array.from({ length: maxWeeks }, (_, idx) => {
      const week = idx + 1;
      const targetNote = myNotes.find((n) => n.report_year === calendarYear && n.report_week === week);
      const has = Boolean(targetNote);
      // [Fix] If note title is '휴가', treat as vacation
      const isVacationNote = targetNote && targetNote.title === '휴가';
      const isVacationSet = myVacationWeeks.has(week);
      const isVacation = isVacationNote || isVacationSet;

      let adjustedWeek = 0;
      if (!isVacation) {
        adjustedCount++;
        adjustedWeek = adjustedCount;
      }
      // Priority: Vacation > Done > Missing
      // If it is vacation (either by note title or admin set), show vacation.
      // Else if note exists, show done.
      const status = isVacation ? 'vacation' : (has ? 'done' : 'missing');

      return { week, status, isVacation, adjustedWeek };
    });
    const todayWeek = getWeekNumber(new Date());
    const todayItem = map.find((m) => m.week === todayWeek);
    const currentWeekDisplay = todayItem
      ? (todayItem.isVacation ? '휴가 기간' : todayItem.adjustedWeek)
      : todayWeek;

    return { list: map, currentWeek: currentWeekDisplay };
  }, [myNotes, calendarYear, myVacationWeeks]);

  const adminTargetUsers = useMemo(() => {
    if (!users.length) return [];
    return users.filter(
      (u) => {
        const deptName = u.department_name || '';
        const isTarget = ['staff', 'leader', 'executive', 'master'].includes(u.role) &&
          ADMIN_TARGET_DEPT_IDS.has(Number(u.department_id));

        // [Debug] Check what we are filtering
        // if (isTarget) console.log('AdminTarget Candidate:', u.name, deptName);

        // [Request] Exclude New Business Dept (Robust Check)
        if (deptName.includes('신사업')) return false;

        return isTarget;
      }
    );
  }, [users]);

  const adminSavedVacationIds = useMemo(() => {
    const set = new Set();
    (adminVacations || []).forEach((v) => {
      if (v?.zoom_user_id) set.add(v.zoom_user_id);
    });
    return set;
  }, [adminVacations]);

  useEffect(() => {
    const next = new Set();
    (adminVacations || []).forEach((v) => {
      if (v?.zoom_user_id) next.add(v.zoom_user_id);
    });
    setAdminVacationDraftIds(next);
  }, [adminVacations]);

  const adminVacationIds = adminVacationDraftIds;

  const adminVacationDirty = useMemo(() => {
    if (adminVacationDraftIds.size !== adminSavedVacationIds.size) return true;
    for (const id of adminVacationDraftIds) {
      if (!adminSavedVacationIds.has(id)) return true;
    }
    return false;
  }, [adminVacationDraftIds, adminSavedVacationIds]);

  const adminVacationUsers = useMemo(
    () => adminTargetUsers.filter((u) => adminVacationIds.has(u.zoom_user_id)),
    [adminTargetUsers, adminVacationIds]
  );

  const adminMissing = useMemo(() => {
    if (!adminTargetUsers.length) return [];
    const submitted = notes.filter(
      (n) => n.report_year === adminMissingYear && n.report_week === adminMissingWeek
    );
    const submittedIds = new Set(submitted.map((n) => n.writer_zoom_user_id));
    return adminTargetUsers.filter(
      (u) => !submittedIds.has(u.zoom_user_id) && !adminVacationIds.has(u.zoom_user_id)
    );
  }, [adminTargetUsers, notes, adminMissingYear, adminMissingWeek, adminVacationIds]);

  const toggleDept = (dept) => {
    setExpandedDepts(prev => ({ ...prev, [dept]: !prev[dept] }));
  };

  const toggleWeek = (dept, week) => {
    const key = `${dept}_${week}`;
    setExpandedWeeks(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSelectNote = (noteId) => {
    setSelectedNoteIds((prev) =>
      prev.includes(noteId) ? prev.filter((id) => id !== noteId) : [...prev, noteId]
    );
  };

  const clearSelection = () => setSelectedNoteIds([]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawingRef.current = false;
  };

  useEffect(() => {
    if (activeTab !== 'my-write' || isSigCollapsed) return;
    if (!signatureData || signatureType === 'none') { clearCanvas(); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    clearCanvas();
    if (signatureType === 'text') {
      ctx.fillStyle = '#111827';
      ctx.font = '24px "Pretendard", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(signatureData, 20, canvas.height / 2);
      hasDrawingRef.current = true;
      return;
    }
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); hasDrawingRef.current = true; };
    img.src = signatureData;
  }, [signatureData, signatureType, activeTab, isSigCollapsed]);

  useEffect(() => {
    if (!recordDate) return;
    const week = getWeekNumber(recordDate);
    const year = recordDate.getFullYear();
    setReportYear(year);
    setReportWeek(week);
  }, [recordDate]);

  useEffect(() => { clearCanvas(); }, []);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (zoomUserId) params.set('zoomUserId', zoomUserId);
    if (zoomEmail) params.set('zoomEmail', zoomEmail);
    if (zoomAccountId) params.set('zoomAccountId', zoomAccountId);
    return params;
  }, [zoomUserId, zoomEmail, zoomAccountId]);

  const getHeaders = useCallback(() => {
    return appContextHeader ? { 'x-zoom-app-context': appContextHeader } : undefined;
  }, [appContextHeader]);

  const loadMe = useCallback(async () => {
    try {
      const params = buildQuery();
      const qs = params.toString();
      const headers = getHeaders();
      const res = await fetch(`${API_BASE}/api/me${qs ? `?${qs}` : ''}`, { headers, credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMe(data);
        if (data?.email && !zoomEmail) setZoomEmail(data.email);
        try {
          setSignatureLoading(true);
          const sigRes = await fetch(`${API_BASE}/api/my-signature`, { headers, credentials: 'include' });
          const sigData = await sigRes.json().catch(() => ({}));
          if (sigRes.ok) {
            setSignatureData(sigData.signature_data || '');
            setSignatureType(sigData.signature_type || 'none');
          }
        } finally {
          setSignatureLoading(false);
        }
      }
    } catch (e) { }
  }, [buildQuery, getHeaders, zoomEmail]);

  const loadNotes = useCallback(async () => {
    try {
      setError(null);
      const params = buildQuery();
      const qs = params.toString();
      const headers = getHeaders();
      const res = await fetch(`${API_BASE}/api/research-notes${qs ? `?${qs}` : ''}`, { headers, credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `연구노트 조회 실패 (${res.status})`);
      setMe(data.me);
      if (data?.me?.email && !zoomEmail) setZoomEmail(data.me.email);
      setNotes(data.notes || []);
    } catch (e) { setError(e.message); }
  }, [buildQuery, getHeaders, zoomEmail]);

  useEffect(() => {
    if ((activeTab === 'dept' && isLeader) || (activeTab === 'admin' && isMaster)) {
      loadNotes();
    }
  }, [activeTab, isLeader, isMaster, loadNotes]);

  useEffect(() => {
    if (activeTab !== 'dept') clearSelection();
  }, [activeTab]);

  useEffect(() => {
    if (me?.role === 'master' && !proxySignerId && leaderSigners.length) {
      setProxySignerId(leaderSigners[0].zoom_user_id);
    }
  }, [me, proxySignerId, leaderSigners]);

  useEffect(() => {
    async function initZoomUser() {
      const devId = process.env.REACT_APP_DEV_ZOOM_USER_ID || process.env.DEV_ZOOM_USER_ID || null;
      const devEmail = process.env.REACT_APP_DEV_ZOOM_USER_EMAIL || process.env.DEV_ZOOM_USER_EMAIL || null;
      const devAccountId = process.env.REACT_APP_DEV_ZOOM_ACCOUNT_ID || process.env.DEV_ZOOM_ACCOUNT_ID || process.env.ZOOM_ACCOUNT_ID || null;
      const allowDevFallback = process.env.REACT_APP_ALLOW_DEV_FALLBACK === 'true' || process.env.ALLOW_DEV_FALLBACK === 'true';

      if (!window.zoomSdk) {
        if (allowDevFallback && devId && devEmail) {
          setZoomUserId(devId);
          setZoomEmail(devEmail);
          setZoomAccountId(devAccountId);
        }
        setZoomReady(true);
        return;
      }

      let configResult;
      let unsupported = [];
      const tryGetUserContext = async () => {
        if (!window.zoomSdk?.getUserContext) return {};
        try {
          const raw = await window.zoomSdk.getUserContext();
          return raw?.userContext || raw || {};
        } catch (err) {
          return {};
        }
      };
      try {
        configResult = await window.zoomSdk.config({
          capabilities: ['getUserContext', 'getUser', 'getUserProfile', 'getAppContext', 'openUrl'],
          version: '0.16.0',
        });
        unsupported = configResult?.unsupportedApis || [];
      } catch (err) {
        unsupported = [];
      }
      try {
        if (window.zoomSdk?.getSupportedJsApis) {
          const supported = await window.zoomSdk.getSupportedJsApis();
          debugLog('supportedJsApis', supported);
        }
      } catch (e) {
        debugLog('getSupportedJsApis error', e?.message || e);
      }

      const canUse = (name) => window.zoomSdk?.[name] && !unsupported.includes(name);
      let ctx = {};

      const ctxDirect = await tryGetUserContext();
      ctx = { ...ctx, ...ctxDirect };

      let finalId = ctx.userId || ctx.userUUID || ctx.user_id || ctx.participantUUID || ctx.id || null;
      let finalEmail = ctx.userEmail || ctx.email || null;
      let finalAccountId = ctx.accountId || ctx.account_id || null;

      if ((!finalId || !finalEmail) && canUse('getUser')) {
        try {
          const u = await window.zoomSdk.getUser();
          finalId = finalId || u?.userId || u?.id || u?.user?.id;
          finalEmail = finalEmail || u?.email || u?.user?.email;
          finalAccountId = finalAccountId || u?.accountId || u?.user?.accountId;
        } catch (err) { /* ignore */ }
      }

      if (canUse('getAppContext')) {
        try {
          const appCtx = await window.zoomSdk.getAppContext();
          const token = appCtx?.context || appCtx?.appContext || null;
          setAppContextHeader(token || null);
          const decodedCtx = decodeAppContextToken(token);
          finalId = finalId || decodedCtx?.uid || decodedCtx?.userId || decodedCtx?.user_id || decodedCtx?.userUUID || decodedCtx?.id;
          finalEmail = finalEmail || decodedCtx?.email || decodedCtx?.userEmail || decodedCtx?.user_email;
          finalAccountId = finalAccountId || decodedCtx?.accountId || decodedCtx?.account_id || decodedCtx?.aid || decodedCtx?.acctId;
        } catch (err) { /* ignore */ }
      }

      if (!finalId && allowDevFallback && devId) finalId = devId;
      if (!finalEmail && allowDevFallback && devEmail) finalEmail = devEmail;
      if (!finalAccountId && devAccountId) finalAccountId = devAccountId;

      if (!finalEmail) {
        const ctxAgain = await tryGetUserContext();
        finalEmail = ctxAgain.userEmail || ctxAgain.email || finalEmail;
        finalId = finalId || ctxAgain.userId || ctxAgain.id || ctxAgain.userUUID || ctxAgain.user_id || null;
        finalAccountId = finalAccountId || ctxAgain.accountId || ctxAgain.account_id || null;
      }

      setZoomUserId(finalId || null);
      setZoomEmail(finalEmail || null);
      setZoomAccountId(finalAccountId || null);
      setZoomReady(true);
    }
    initZoomUser();
  }, []);

  useEffect(() => {
    if (!zoomReady) return;
    loadMe();
    loadNotes();
  }, [zoomReady, loadMe, loadNotes]);

  useEffect(() => {
    if (!isMaster && (activeTab === 'admin' || activeTab === 'users')) {
      setActiveTab('my-manage');
    }
  }, [activeTab, isMaster]);

  useEffect(() => {
    if (activeTab === 'my-write') {
      setIsFormCollapsed(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setSelectedNoteIds((prev) => prev.filter((id) => notes.some((n) => n.id === id)));
  }, [notes]);

  const loadUsers = useCallback(async (opts = {}) => {
    if (loadingUsers) return;
    const sync = Boolean(opts?.sync);
    try {
      setLoadingUsers(true);
      const headers = appContextHeader ? { 'x-zoom-app-context': appContextHeader } : undefined;
      const url = sync ? `${API_BASE}/api/users?sync=1` : `${API_BASE}/api/users`;
      const res = await fetch(url, { headers, credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `사용자 목록 조회 실패 (${res.status})`);
      setUsers(data || []);
      if (!proxySignerId && Array.isArray(data)) {
        const firstLeader = data.find((u) => u.role === 'leader' && u.signature_data);
        if (firstLeader) setProxySignerId(firstLeader.zoom_user_id);
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setLoadingUsers(false);
    }
  }, [appContextHeader, loadingUsers, proxySignerId]);

  const updateUserRole = useCallback(
    async (zoomUserId, role) => {
      if (!zoomUserId) return;
      const nextRole = role == null ? '' : String(role).trim();
      if (!nextRole) return;
      try {
        setRoleSavingId(zoomUserId);
        const headersAuth = appContextHeader ? { 'x-zoom-app-context': appContextHeader } : {};
        const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(zoomUserId)}/role`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...headersAuth },
          credentials: 'include',
          body: JSON.stringify({ role: nextRole }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `권한 수정 실패 (${res.status})`);

        setUsers((prev) =>
          prev.map((u) => (u.zoom_user_id === zoomUserId ? { ...u, role: nextRole } : u))
        );
        setUserRoleEdits((prev) => {
          const next = { ...prev };
          delete next[zoomUserId];
          return next;
        });

        if (me?.zoom_user_id === zoomUserId) {
          loadMe();
          loadNotes();
        }
      } finally {
        setRoleSavingId(null);
      }
    },
    [appContextHeader, loadMe, loadNotes, me?.zoom_user_id]
  );

  useEffect(() => {
    if (me?.role === 'master' && !users.length) {
      loadUsers({ sync: true });
    }
  }, [me, users.length, loadUsers]);

  useEffect(() => {
    if (activeTab === 'admin' && isMaster && !users.length) {
      loadUsers({ sync: true });
    }
  }, [activeTab, isMaster, users.length, loadUsers]);

  useEffect(() => {
    if (activeTab === 'dept' && me?.role === 'master' && !users.length) {
      loadUsers({ sync: true });
    }
  }, [activeTab, me, users.length, loadUsers]);

  const loadAdminVacations = useCallback(
    async (year, week) => {
      try {
        const headers = appContextHeader ? { 'x-zoom-app-context': appContextHeader } : undefined;
        const params = new URLSearchParams();
        params.set('year', String(year));
        params.set('week', String(week));
        params.set('t', String(Date.now())); // Cache busting
        const res = await fetch(`${API_BASE}/api/vacations?${params.toString()}`, { headers, credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `휴가자 조회 실패 (${res.status})`);
        setAdminVacations(Array.isArray(data) ? data : []);
      } catch (e) {
        debugLog('loadAdminVacations error', e);
        setAdminVacations([]);
      }
    },
    [appContextHeader]
  );

  const loadMyVacations = useCallback(
    async (year) => {
      try {
        const headers = appContextHeader ? { 'x-zoom-app-context': appContextHeader } : undefined;
        const params = new URLSearchParams();
        params.set('year', String(year));
        const res = await fetch(`${API_BASE}/api/my-vacations?${params.toString()}`, { headers, credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `내 휴가 조회 실패 (${res.status})`);
        setMyVacations(Array.isArray(data) ? data : []);
      } catch (e) {
        debugLog('loadMyVacations error', e);
        setMyVacations([]);
      }
    },
    [appContextHeader]
  );

  const toggleAdminVacationDraft = useCallback((zoomUserId) => {
    if (!zoomUserId) return;
    setAdminVacationDraftIds((prev) => {
      const next = new Set(prev);
      if (next.has(zoomUserId)) next.delete(zoomUserId);
      else next.add(zoomUserId);
      return next;
    });
  }, []);

  const saveAdminVacationDraft = useCallback(async () => {
    if (adminVacationSaving) return;
    const year = adminMissingYear;
    const week = adminMissingWeek;
    const changes = [];

    for (const id of adminVacationDraftIds) {
      if (!adminSavedVacationIds.has(id)) changes.push({ zoomUserId: id, isVacation: true });
    }
    for (const id of adminSavedVacationIds) {
      if (!adminVacationDraftIds.has(id)) changes.push({ zoomUserId: id, isVacation: false });
    }

    if (!changes.length) {
      setModalMessage('변경 사항이 없습니다.');
      return;
    }

    try {
      setAdminVacationSaving(true);
      const headersAuth = appContextHeader ? { 'x-zoom-app-context': appContextHeader } : {};
      for (const ch of changes) {
        const res = await fetch(`${API_BASE}/api/vacations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headersAuth },
          credentials: 'include',
          body: JSON.stringify({ zoom_user_id: ch.zoomUserId, year, week, isVacation: ch.isVacation }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `휴가 설정 실패 (${res.status})`);
      }
      await loadAdminVacations(year, week);
      setModalMessage('휴가 설정이 저장되었습니다.');
      loadNotes();
    } catch (e) {
      alert(e.message);
    } finally {
      setAdminVacationSaving(false);
    }
  }, [
    adminVacationSaving,
    adminMissingYear,
    adminMissingWeek,
    adminVacationDraftIds,
    adminSavedVacationIds,
    appContextHeader,
    loadAdminVacations,
    loadNotes
  ]);

  const refreshAdminVacation = useCallback(() => {
    loadUsers({ sync: true });
    loadAdminVacations(adminMissingYear, adminMissingWeek);
  }, [loadUsers, loadAdminVacations, adminMissingYear, adminMissingWeek]);

  useEffect(() => {
    if (activeTab !== 'admin' || !isLeader) return;
    loadAdminVacations(adminMissingYear, adminMissingWeek);
  }, [activeTab, isLeader, adminMissingYear, adminMissingWeek, loadAdminVacations]);

  useEffect(() => {
    if (activeTab !== 'my-manage' || !me) return;
    loadMyVacations(calendarYear);
  }, [activeTab, me, calendarYear, loadMyVacations]);

  const signNote = async (noteId, role, clear = false) => {
    try {
      setError(null);
      const headersAuth = appContextHeader ? { 'x-zoom-app-context': appContextHeader } : {};
      const res = await fetch(`${API_BASE}/api/research-notes/${noteId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headersAuth },
        credentials: 'include',
        body: JSON.stringify({ role, clear, proxyZoomUserId: proxyMode ? proxySignerId : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '서명 처리에 실패했습니다.');

      loadNotes();

    } catch (e) {
      alert(e.message);
    }
  };

  // [신규 기능] 첨부파일 개별 삭제 함수
  const handleRemoveNewFile = (targetIndex) => {
    setAttachmentFiles((prevFiles) => prevFiles.filter((_, index) => index !== targetIndex));
    // input 초기화: 같은 파일을 다시 선택하거나 리스트 관리를 위해 필요
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // [고정값 저장/해제 기능] 사용자 template 불러오기
  React.useEffect(() => {
    if (!me) return;

    const fetchTemplate = async () => {
      try {
        const res = await fetch('/api/user/template', { credentials: 'include' });
        if (!res.ok) throw new Error('고정값 불러오기 실패');
        const data = await res.json();

        if (data.title || data.start_date || data.end_date) {
          setUserTemplate(data);
          setHasTemplate(true);

          // 고정값이 있으면 자동으로 입력 필드에 채우기
          if (data.title) setTitle(data.title);
          if (data.start_date) setPeriodStart(new Date(data.start_date));
          if (data.end_date) setPeriodEnd(new Date(data.end_date));
        } else {
          setUserTemplate(null);
          setHasTemplate(false);
        }
      } catch (e) {
        console.error('고정값 불러오기 에러:', e);
      }
    };

    fetchTemplate();
  }, [me]);

  // [고정값 저장]
  const handleSaveTemplate = async () => {
    if (!title.trim()) {
      alert('보고 제목을 입력해주세요.');
      return;
    }

    try {
      const res = await fetch('/api/user/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title,
          start_date: periodStart ? toDateString(periodStart) : null,
          end_date: periodEnd ? toDateString(periodEnd) : null,
        }),
      });

      if (!res.ok) throw new Error('고정값 저장 실패');
      const data = await res.json();

      alert(data.message || '고정값이 저장되었습니다.');

      // 상태 업데이트 (새로고침 대신)
      setUserTemplate({ title, start_date: periodStart ? toDateString(periodStart) : null, end_date: periodEnd ? toDateString(periodEnd) : null });
      setHasTemplate(true);
    } catch (e) {
      alert('고정값 저장 중 오류가 발생했습니다: ' + e.message);
    }
  };

  // [고정값 해제]
  const handleClearTemplate = async () => {
    if (!window.confirm('저장된 고정값을 해제하시겠습니까?')) return;

    try {
      const res = await fetch('/api/user/template', {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) throw new Error('고정값 해제 실패');
      const data = await res.json();

      alert(data.message || '고정값이 해제되었습니다.');

      // 상태 업데이트 (새로고침 대신)
      setUserTemplate(null);
      setHasTemplate(false);
      setTitle('');
      setPeriodStart(null);
      setPeriodEnd(null);
    } catch (e) {
      alert('고정값 해제 중 오류가 발생했습니다: ' + e.message);
    }
  };

  const handleSave = async () => {
    setError(null);
    sendServerLog('create-submit', {
      title: title || '',
      recordDate: toDateString(recordDate),
      periodStart: toDateString(periodStart),
      periodEnd: toDateString(periodEnd),
      weeklyGoal: weeklyGoal || '',
      hasContent: hasContentValue(content),
    });

    if (!me) {
      const msg = '로그인 정보를 불러와 주세요.';
      setError(msg);
      sendServerLog('create-validation-fail', { reason: 'no-me' });
      setModalMessage(msg);
      return;
    }

    const missing = [];
    if (!recordDate) missing.push('기록일자');
    if (!periodStart) missing.push('시작일');
    if (!periodEnd) missing.push('종료일');
    if (!title.trim()) missing.push('보고 제목');
    if (!weeklyGoal.trim()) missing.push('금주 목표');
    if (!hasContentValue(content)) missing.push('금주 연구 내용');

    if (missing.length > 0) {
      const msg = `다음 항목이 비어 있습니다. 작성해주세요: ${missing.join(', ')}`;
      setError(msg);
      sendServerLog('create-validation-fail', { missing });
      setModalMessage(msg);
      return;
    }

    {
      const type = signatureType || me.signature_type || 'none';
      const data = signatureData || me.signature_data || '';
      const hasSignature = type !== 'none' && String(data).trim().length > 0;
      if (!hasSignature) {
        const msg = '서명이 등록되어 있지 않습니다. 먼저 내 서명 관리에서 서명을 저장해주세요.';
        setIsSigCollapsed(false);
        sigSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
        setModalMessage(msg);
        return;
      }
    }

    try {
      const normalizedContent = normalizeContentHtml(content);
      const formData = new FormData();
      formData.append('recordDate', toDateString(recordDate));
      formData.append('reportYear', reportYear);
      formData.append('reportWeek', reportWeek);
      formData.append('title', title);
      formData.append('periodStart', toDateString(periodStart) || '');
      formData.append('periodEnd', toDateString(periodEnd) || '');
      formData.append('weeklyGoal', weeklyGoal || '');
      formData.append('content', normalizedContent);

      if (zoomUserId) formData.append('zoomUserId', zoomUserId);
      if (zoomEmail) formData.append('zoomEmail', zoomEmail);
      if (zoomAccountId) formData.append('zoomAccountId', zoomAccountId);
      if (attachmentFiles && attachmentFiles.length) {
        attachmentFiles.forEach((f) => formData.append('attachments', f));
      }

      const params = new URLSearchParams();
      if (zoomUserId) params.set('zoomUserId', zoomUserId);

      const res = await fetch(`${API_BASE}/api/research-notes?${params.toString()}`, {
        method: 'POST',
        headers: { ...(appContextHeader ? { 'x-zoom-app-context': appContextHeader } : {}) },
        credentials: 'include',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `연구노트 저장 실패 (${res.status})`);

      setNotes((prev) => [data, ...prev]);
      setTitle('');
      setWeeklyGoal('');
      setContent('');
      setAttachmentFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';

      setModalMessage('작성 완료했습니다');

      loadNotes();

    } catch (e) {
      setError(e.message);
      alert(e.message);
    }
  };

  const handleSaveSignature = async () => {
    try {
      setSignatureLoading(true);
      let data = signatureData;
      let type = signatureType;
      const canvas = canvasRef.current;
      if (canvas && hasDrawingRef.current) {
        data = canvas.toDataURL('image/png');
        type = 'draw';
      } else {
        if (!data) {
          alert('서명을 그려주세요.');
          return;
        }
      }
      const headersAuth = appContextHeader ? { 'x-zoom-app-context': appContextHeader } : {};
      const res = await fetch(`${API_BASE}/api/my-signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headersAuth },
        credentials: 'include',
        body: JSON.stringify({ signatureData: data || null, signatureType: type || 'none' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '서명 저장에 실패했습니다.');
      }
      alert('서명을 저장했습니다.');
      setSignatureData(data || '');
      setSignatureType(type || 'none');
      loadNotes();
    } catch (e) {
      alert(e.message);
    } finally {
      setSignatureLoading(false);
    }
  };

  const getCanvasPos = (evt) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };
  const startDraw = (evt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCanvasPos(evt);
    drawingRef.current = { drawing: true, lastX: x, lastY: y };
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    evt.preventDefault();
  };
  const draw = (evt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!drawingRef.current.drawing) return;
    const { x, y } = getCanvasPos(evt);
    ctx.beginPath();
    ctx.moveTo(drawingRef.current.lastX, drawingRef.current.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    drawingRef.current.lastX = x;
    drawingRef.current.lastY = y;
    hasDrawingRef.current = true;
    evt.preventDefault();
  };
  const stopDraw = () => { drawingRef.current.drawing = false; };

  const handlePrintNote = (note) => { setPreviewNote(note); };
  const handleDeleteRequest = (noteId) => { setDeleteTargetId(noteId); };

  const openWriteForWeek = useCallback((week, year = calendarYear) => {
    setActiveTab('my-write');
    setIsFormCollapsed(false);
    setIsSigCollapsed(true);

    const yr = Number(year);
    if (Number.isFinite(yr)) setReportYear(yr);

    const wk = Number(week);
    if (Number.isFinite(wk)) {
      const safeWeek = Math.min(53, Math.max(1, Math.trunc(wk)));
      setReportWeek(safeWeek);
    }

    setTimeout(() => {
      try {
        formSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      } catch (e) {
        /* ignore */
      }
    }, 0);
  }, [calendarYear]);

  const handleMyWeekCellClick = useCallback((weekInfo) => {
    if (!weekInfo) return;
    if (weekInfo.status === 'vacation') return;

    if (weekInfo.status === 'missing') {
      // [Request] "주차 클릭 시 선택한 주차 그대로 사용" (휴가 등으로 인한 주차 조정 제거)
      openWriteForWeek(weekInfo.week, calendarYear);
      return;
    }

    const candidates = myNotes.filter(
      (n) => n.report_year === calendarYear && n.report_week === weekInfo.week
    );
    const target = candidates.reduce((best, n) => {
      if (!best) return n;
      const a = new Date(best.record_date || best.created_at || 0).getTime();
      const b = new Date(n.record_date || n.created_at || 0).getTime();
      if (!Number.isNaN(b) && (Number.isNaN(a) || b > a)) return n;
      if ((n.id || 0) > (best.id || 0)) return n;
      return best;
    }, null);

    if (target) setPreviewNote(target);
    else setModalMessage('해당 주차 문서를 찾을 수 없습니다.');
  }, [calendarYear, myNotes, openWriteForWeek]);

  const handleEditClick = (note, mode = 'self') => {
    setEditingMode(mode);
    setEditingNote(note);
    setEditRecordDate(note.record_date ? new Date(note.record_date) : null);
    setEditReportYear(note.report_year || '');
    setEditReportWeek(note.report_week || '');
    setEditSerialNo(note.serial_no || '');
    setEditTitle(note.title);
    setEditPeriodStart(note.period_start ? new Date(note.period_start) : null);
    setEditPeriodEnd(note.period_end ? new Date(note.period_end) : null);
    setEditWeeklyGoal(note.weekly_goal || '');
    setEditContent(normalizeContentHtml(note.content || ''));
    setEditAttachments([]);
    if (editFileInputRef.current) editFileInputRef.current.value = '';
    setEditFileDeleted(false);
  };

  const handleUpdateNote = async () => {
    if (!editingNote) return;
    if (!editTitle.trim()) { alert('제목을 입력해주세요.'); return; }
    if (!hasContentValue(editContent)) { alert('내용을 입력해주세요.'); return; }
    if (editingMode === 'admin') {
      if (!editRecordDate || !String(editReportYear).trim() || !String(editReportWeek).trim() || !editSerialNo.trim()) {
        alert('기록일자, 보고 주차, 문서번호를 모두 입력해주세요.');
        return;
      }
    }

    try {
      const normalizedContent = normalizeContentHtml(editContent);
      const formData = new FormData();
      formData.append('title', editTitle);
      formData.append('periodStart', toDateString(editPeriodStart) || '');
      formData.append('periodEnd', toDateString(editPeriodEnd) || '');
      formData.append('weeklyGoal', editWeeklyGoal);
      formData.append('content', normalizedContent);
      formData.append('deleteAttachment', editFileDeleted);
      if (editingMode === 'admin') {
        formData.append('adminEdit', 'true');
        formData.append('recordDate', toDateString(editRecordDate) || '');
        formData.append('reportYear', editReportYear);
        formData.append('reportWeek', editReportWeek);
        formData.append('serialNo', editSerialNo);
      }

      if (editAttachments && editAttachments.length) {
        editAttachments.forEach((f) => formData.append('attachments', f));
      }

      const headers = appContextHeader ? { 'x-zoom-app-context': appContextHeader } : {};

      const res = await fetch(`${API_BASE}/api/research-notes/${editingNote.id}`, {
        method: 'PUT',
        headers: { ...headers },
        credentials: 'include',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '수정에 실패했습니다.');

      setEditingNote(null);
      alert('성공적으로 수정되었습니다.');
      loadNotes();

    } catch (e) {
      alert(e.message);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      const res = await fetch(`${API_BASE}/api/research-notes/${deleteTargetId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '삭제에 실패했습니다.');
      setNotes((prev) => prev.filter((n) => n.id !== deleteTargetId));
      setDeleteTargetId(null);
    } catch (e) {
      alert(e.message);
    }
  };

  const attemptOpenUrl = async (url, label = '') => {
    try {
      if (window.zoomSdk?.openUrl) {
        await window.zoomSdk.openUrl({ url });
        debugLog('openUrl success', label || url);
        return true;
      }
    } catch (e) {
      debugLog('openUrl error', e?.message || e);
    }
    try {
      window.location.assign(url);
      debugLog('location.assign success', label || url);
      return true;
    } catch (e) {
      debugLog('location.assign error', e?.message || e);
      return false;
    }
  };

  const openBlobDownload = async (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const name = filename || 'download';

    // 1) Zoom SDK openUrl (data URL로 던지면 시스템 브라우저에서 열어 저장 가능)
    let opened = false;
    try {
      if (window.zoomSdk?.openUrl) {
        const dataUrl = await blobToDataUrl(blob);
        await window.zoomSdk.openUrl({ url: dataUrl });
        opened = true;
        debugLog('openUrl via dataUrl success', { name, size: blob.size });
      }
    } catch (e) {
      opened = false;
      debugLog('openUrl via dataUrl error', e?.message || e);
    }

    // 2) 동일 창 이동/앵커 다운로드/iframe
    await attemptOpenUrl(url, `blob://${name}`);

    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // 3) iframe fallback
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);

    setTimeout(() => {
      document.body.removeChild(iframe);
      window.URL.revokeObjectURL(url);
    }, 4000);
    return opened;
  };

  const handleDownload = async (e, noteId, fileId = null) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const downloadUrl = fileId
        ? `${API_BASE}/api/research-notes/${noteId}/files/${fileId}/download`
        : `${API_BASE}/api/research-notes/${noteId}/download`;
      const absUrl = toAbsoluteUrl(downloadUrl);
      sendServerLog('download-click', { noteId, fileId, downloadUrl });

      // 시스템 브라우저로 바로 열기 시도 (Zoom SDK 지원 시)
      try {
        if (window.zoomSdk?.openUrl) {
          debugLog('openUrl download try', absUrl);
          await window.zoomSdk.openUrl({ url: absUrl });
          return;
        }
      } catch (e) {
        debugLog('openUrl download error', e?.message || e);
      }

      const res = await fetch(absUrl, { credentials: 'include' });
      if (!res.ok) {
        sendServerLog('download-fetch-fail', { status: res.status, noteId, fileId });
        throw new Error('파일을 다운로드할 수 없습니다.');
      }
      const blob = await res.blob();
      let filename = 'attachment';
      const cd = res.headers.get('Content-Disposition');
      const match = cd && cd.match(/filename\*?=([^;]+)/i);
      if (match) {
        filename = decodeURIComponent(match[1].replace(/UTF-8''/i, '').trim().replace(/^"(.*)"$/, '$1'));
      }
      await openBlobDownload(blob, filename);
      sendServerLog('download-success', { noteId, fileId, filename });
    } catch (err) {
      debugLog('download fallback err', err?.message || err);
      // 직접 URL로 이동 시도 (팝업 미사용)
      const fallbackUrl = toAbsoluteUrl(fileId
        ? `${API_BASE}/api/research-notes/${noteId}/files/${fileId}/download`
        : `${API_BASE}/api/research-notes/${noteId}/download`);
      const opened = await attemptOpenUrl(fallbackUrl);
      if (!opened) {
        const copyLink = async () => {
          try {
            await navigator.clipboard.writeText(fallbackUrl);
            alert('다운로드 링크를 클립보드에 복사했습니다. 브라우저 주소창에 붙여넣어 다운로드 해주세요.');
            sendServerLog('download-copied-link', { noteId, fileId, fallbackUrl });
          } catch (e) {
            alert('다운로드가 차단되었습니다. 아래 링크를 복사해 브라우저에서 열어주세요:\n' + fallbackUrl);
            sendServerLog('download-copy-failed', { noteId, fileId, fallbackUrl });
          }
        };
        copyLink();
      }
    }
  };

  const handleExportSelectedToPdf = () => {
    if (!selectedNotes.length) {
      alert('PDF로 내보낼 문서를 선택해주세요.');
      return;
    }
    const ids = selectedNotes.map((n) => n.id);
    sendServerLog('export-selected', { count: ids.length, ids });
    const qsIds = ids.join(',');
    const urlParams = new URLSearchParams();
    urlParams.set('ids', qsIds);
    if (zoomUserId) urlParams.set('zoomUserId', zoomUserId);
    if (zoomEmail) urlParams.set('zoomEmail', zoomEmail);
    if (zoomAccountId) urlParams.set('zoomAccountId', zoomAccountId);
    const exportUrl = toAbsoluteUrl(`/api/research-notes/export-pdf?${urlParams.toString()}`);
    (async () => {
      try {
        // 1) 시스템 브라우저로 바로 열기 시도 (첨부 다운로드와 동일)
        if (window.zoomSdk?.openUrl) {
          await window.zoomSdk.openUrl({ url: exportUrl });
          sendServerLog('export-openurl', { exportUrl });
          return;
        }

        // 2) fetch 후 blob 다운로드
        const res = await fetch(exportUrl, { credentials: 'include' });
        if (!res.ok) {
          sendServerLog('export-fetch-fail', { status: res.status });
          throw new Error('내보내기 생성에 실패했습니다.');
        }
        const blob = await res.blob();
        const filename = 'research-notes.pdf';
        await openBlobDownload(blob, filename);
        sendServerLog('export-success', { ids, filename });
      } catch (e) {
        sendServerLog('export-error', { message: e?.message || e });
        alert(e.message || 'PDF 저장에 실패했습니다.');
      }
    })();
  };

  const writerDisplay = me ? me.name : (zoomEmail || '방문자');

  const renderSignature = (data, type) => {
    if ((type === 'draw' || (data && data.startsWith('data:image'))) && data) {
      return <img src={data} alt="서명" className="print-sign-image" />;
    }
    if (type === 'text' && data) return <span className="print-sign-text">{data}</span>;
    return <span className="print-sign-empty">(미서명)</span>;
  };

  return (
    <div className="app-root">
      <header className="app-header">
        {/* [Fixed Toggle Button - moved inside header] */}
        <div className="theme-toggle-fixed">
          <button
            className="theme-toggle-btn"
            onClick={toggleDarkMode}
            title={isDarkMode ? '라이트 모드로 전환' : '다크 모드로 전환'}
            type="button"
          >
            <div className="toggle-thumb">
              {isDarkMode ? '🌙' : '☀️'}
            </div>
          </button>
        </div>
        <h1>아이알링크㈜ 정보통신연구소 연구노트</h1>
        <div className="app-header-meta" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>사용자: <span className="user-badge">{writerDisplay}</span></span>
        </div>
        <nav className="app-tabs">
          <button className={`tab ${activeTab === 'my-manage' ? 'active' : ''}`} onClick={() => setActiveTab('my-manage')}>내 연구노트 관리</button>
          <button className={`tab ${activeTab === 'my-write' ? 'active' : ''}`} onClick={() => { setActiveTab('my-write'); setIsFormCollapsed(false); setIsSigCollapsed(true); }}>내 연구노트 작성</button>
          {isLeader && (
            <>
              <button className={`tab ${activeTab === 'dept' ? 'active' : ''}`} onClick={() => setActiveTab('dept')}>부서별 문서함</button>
              {isMaster && (
                <>
                  <button className={`tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => { setActiveTab('users'); loadUsers({ sync: true }); }}>직원 현황</button>
                  <button className={`tab ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => { setActiveTab('admin'); loadNotes(); }}>관리자 수정</button>
                </>
              )}
            </>
          )}
        </nav>
      </header>

      <main className="app-main">
        {modalMessage && (
          <div className="modal-backdrop" onClick={() => setModalMessage('')}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-body">
                <div style={{ fontWeight: 700, marginBottom: 8 }}>안내</div>
                <div>{modalMessage}</div>
              </div>
              <div className="modal-actions">
                <button className="primary-btn" onClick={handleModalConfirm}>확인</button>
              </div>
            </div>
          </div>
        )}

        {error && <div className="error-msg" style={{ marginBottom: 16, background: '#fee2e2', padding: 10, borderRadius: 6 }}>{error}</div>}

        {activeTab === 'my-manage' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className="secondary-btn" onClick={() => { setActiveTab('my-write'); setIsFormCollapsed(false); formSectionRef.current?.scrollIntoView({ behavior: 'smooth' }); }}>새 연구노트 작성</button>
              <button className="secondary-btn" onClick={() => { setActiveTab('my-write'); setIsSigCollapsed(false); sigSectionRef.current?.scrollIntoView({ behavior: 'smooth' }); }}>내 서명 관리</button>
            </div>

            <section className="card">
              <div className="card-header">
                <h2>내 작성 문서함</h2>
                <span className="muted">{myNotes.length}건</span>
              </div>
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>캘린더 연도</label>
                    <select className="input" style={{ width: 140, marginLeft: 8 }} value={calendarYear} onChange={(e) => setCalendarYear(Number(e.target.value))}>
                      {[calendarYear - 1, calendarYear, calendarYear + 1].map((y) => (
                        <option key={y} value={y}>{y}년</option>
                      ))}
                    </select>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>현재 주차: {myWeekStatus.currentWeek}주차</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(70px,1fr))', gap: 6, marginTop: 8 }}>
                  {myWeekStatus.list.map((w) => (
                    <button
                      key={w.week}
                      type="button"
                      className={`week-cell ${w.status}`}
                      disabled={w.status === 'vacation'}
                      onClick={() => handleMyWeekCellClick(w)}
                      title={w.status === 'done' ? '보기' : w.status === 'missing' ? '작성' : '휴가'}
                    >
                      {w.status === 'vacation'
                        ? `휴가\n(${w.week}주)`
                        : `${w.week}주차\n${w.status === 'done' ? '완료' : '미작성'}`
                      }
                    </button>
                  ))}
                </div>
              </div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>문서번호</th>
                      <th>보고주차</th>
                      <th>제목</th>
                      <th>보고기간</th>
                      <th>상태</th>
                      <th style={{ textAlign: 'right' }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myNotes.length === 0 ? (
                      <tr><td colSpan="6" style={{ textAlign: 'center', padding: '30px' }}>작성된 문서가 없습니다.</td></tr>
                    ) : (
                      myNotes.map((note) => (
                        <tr key={note.id}>
                          <td>{note.serial_no}</td>
                          <td>{note.report_year}년 {note.report_week}주차</td>
                          <td style={{ fontWeight: '600' }}>
                            {note.title}
                            {SHOW_ATTACHMENTS_UI && note.attachments && note.attachments.length > 0 && (
                              <span className="muted" style={{ fontSize: 10, marginLeft: 6 }}>
                                첨부 {note.attachments.length}개
                              </span>
                            )}
                          </td>
                          <td>{toDateString(note.period_start)} ~ {toDateString(note.period_end)}</td>
                          <td>
                            {(() => {
                              const times = [note.checker_signed_at, note.reviewer_signed_at]
                                .filter(Boolean)
                                .map((t) => new Date(t).getTime())
                                .filter((ms) => !Number.isNaN(ms));
                              const lastSignedAt = times.length ? new Date(Math.max(...times)) : null;
                              const lastSignedText = toDateTimeMinuteString(lastSignedAt);
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                                  {note.checker_signature_data ? (
                                    <span className="status-badge" style={{ background: '#dcfce7', color: '#166534' }}>확인완료</span>
                                  ) : (
                                    <span className="status-badge">대기중</span>
                                  )}
                                  {lastSignedText && (
                                    <span className="muted" style={{ fontSize: 11 }}>{lastSignedText}</span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button className="secondary-btn" onClick={() => handlePrintNote(note)}>인쇄/보기</button>
                              {!note.checker_signature_data && (
                                <>
                                  <button className="secondary-btn" onClick={() => handleEditClick(note)}>수정</button>
                                  <button className="danger-outline-btn" onClick={() => handleDeleteRequest(note.id)}>삭제</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>


          </>
        )}

        {/* 내 연구노트 작성 */}
        {activeTab === 'my-write' && (
          <>
            <section className="card">
              <div className="card-header">
                <h2>내 서명 관리</h2>
                <button className="secondary-btn" onClick={() => setIsSigCollapsed(!isSigCollapsed)}>
                  {isSigCollapsed ? '서명 설정 열기' : '접기'}
                </button>
              </div>
              {!isSigCollapsed && (
                <div className="card-body">
                  <div className="signature-area">
                    <p className="muted" style={{ margin: 0 }}>아래 영역에 마우스로 서명을 그려주세요.</p>
                    <canvas
                      ref={canvasRef}
                      width={500}
                      height={140}
                      onMouseDown={startDraw}
                      onMouseMove={draw}
                      onMouseUp={stopDraw}
                      onMouseLeave={stopDraw}
                      onTouchStart={startDraw}
                      onTouchMove={draw}
                      onTouchEnd={stopDraw}
                    />
                    <div className="btn-group">
                      <button className="secondary-btn" onClick={() => {
                        clearCanvas();
                        setSignatureData('');
                        setSignatureType('none');
                      }}>초기화</button>
                      <button className="primary-btn" onClick={handleSaveSignature} disabled={signatureLoading}>
                        {signatureLoading ? '저장 중...' : '서명 저장하기'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-header">
                <h2>새 연구노트 작성</h2>
                <button className="secondary-btn" onClick={() => setIsFormCollapsed(!isFormCollapsed)}>
                  {isFormCollapsed ? '작성 폼 열기' : '접기'}
                </button>
              </div>
              {!isFormCollapsed && (
                <div className="card-body" ref={formSectionRef}>
                  <div className="note-form-container">
                    <div className="form-section">
                      <div className="section-title">01. 기본 정보</div>
                      <div className="form-grid">
                        <div className="form-group col-4">
                          <label>기록일자</label>
                          <DatePicker selected={recordDate} onChange={setRecordDate} dateFormat="yyyy-MM-dd" locale="ko" className="input" />
                        </div>
                        <div className="form-group col-4">
                          <label>보고 주차</label>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input className="input" style={{ width: 90 }} value={reportYear} readOnly />
                            <span className="muted" style={{ fontSize: 12 }}>년</span>
                            <input
                              className="input"
                              type="number"
                              min={1}
                              max={53}
                              step={1}
                              style={{ width: 90 }}
                              value={reportWeek}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                const safe = Number.isFinite(next) ? Math.min(53, Math.max(1, Math.trunc(next))) : 1;
                                setReportWeek(safe);
                              }}
                            />
                            <span className="muted" style={{ fontSize: 12 }}>주차</span>
                          </div>
                        </div>
                        <div className="form-group col-4">
                          <label>문서 번호</label>
                          <input className="input readonly-hint" value="저장 시 자동 생성" readOnly />
                        </div>

                        <div className="form-group col-12">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <label style={{ margin: 0 }}>보고 제목</label>
                            {!hasTemplate ? (
                              <button
                                type="button"
                                onClick={handleSaveTemplate}
                                style={{
                                  padding: '2px 8px',
                                  fontSize: '11px',
                                  background: '#4CAF50',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '3px',
                                  cursor: 'pointer'
                                }}
                                title="현재 입력한 제목, 시작일, 종료일을 고정값으로 저장합니다"
                              >
                                📌 저장
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={handleClearTemplate}
                                style={{
                                  padding: '2px 8px',
                                  fontSize: '11px',
                                  background: '#ff6b6b',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '3px',
                                  cursor: 'pointer'
                                }}
                                title="저장된 고정값을 해제합니다"
                              >
                                🔓 해제
                              </button>
                            )}
                          </div>
                          <input className="input" placeholder="예: 12월 3주차 주간 연구 보고" value={title} onChange={(e) => setTitle(e.target.value)} />
                        </div>
                        <div className="form-group col-6">
                          <label>시작일</label>
                          <DatePicker selected={periodStart} onChange={setPeriodStart} dateFormat="yyyy-MM-dd" locale="ko" className="input" placeholderText="기간 시작" />
                        </div>
                        <div className="form-group col-6">
                          <label>종료일</label>
                          <DatePicker selected={periodEnd} onChange={setPeriodEnd} dateFormat="yyyy-MM-dd" locale="ko" className="input" placeholderText="기간 종료" />
                        </div>
                      </div>
                    </div>

                    <div className="form-section">
                      <div className="section-title">02. 상세 내용</div>
                      <div className="form-group">
                        <label>금주 목표</label>
                        <input className="input" value={weeklyGoal} onChange={(e) => setWeeklyGoal(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>금주 연구 내용</label>
                        <RichTextEditor
                          value={content}
                          onChange={setContent}
                          placeholder="연구 내용을 입력하세요."
                        />
                      </div>
                      {SHOW_ATTACHMENTS_UI && (
                        <>
                          {/* 첨부파일 영역 수정: 개별 삭제 기능 추가 */}
                          <div className="form-group">
                            <label>첨부파일</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input
                                type="file"
                                className="input"
                                ref={fileInputRef}
                                multiple
                                onChange={(e) => {
                                  if (e.target.files && e.target.files.length > 0) {
                                    setAttachmentFiles(Array.from(e.target.files));
                                  }
                                }}
                                style={{ flex: 1 }}
                              />
                            </div>

                            {attachmentFiles && attachmentFiles.length > 0 && (
                              <div className="new-file-list" style={{ marginTop: 8 }}>
                                {attachmentFiles.map((f, index) => (
                                  <div key={index} className="new-file-item">
                                    <span className="file-name">?? {f.name}</span>
                                    <span className="file-size">({(f.size / 1024).toFixed(1)} KB)</span>
                                    <button
                                      type="button"
                                      className="file-remove-btn"
                                      onClick={() => handleRemoveNewFile(index)}
                                      title="이 파일 삭제"
                                    >
                                      ?
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="primary-btn" onClick={handleSave}>연구노트 등록</button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === 'dept' && isLeader && (
          <section className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2>부서별 문서함</h2>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* [Moved] Search Bar to Header */}
                <div className="search-wrapper" style={{ width: 'auto' }}>
                  <select className="search-select" value={searchCategory} onChange={(e) => setSearchCategory(e.target.value)}>
                    <option value="title">제목</option>
                    <option value="writer">작성자</option>
                  </select>
                  <input className="search-input" placeholder="검색어를 입력하세요" value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ width: 180 }} />
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {selectedNoteIds.length > 0 && (
                    <span className="muted" style={{ fontSize: 12 }}>선택 {selectedNoteIds.length}건</span>
                  )}
                  <button
                    className="primary-btn"
                    style={{ padding: '6px 10px' }}
                    disabled={!selectedNoteIds.length}
                    onClick={handleExportSelectedToPdf}
                  >
                    PDF 저장
                  </button>
                  {selectedNoteIds.length > 0 && (
                    <button className="secondary-btn" style={{ padding: '6px 10px' }} onClick={clearSelection}>
                      해제
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="card-body">
              {/* Search removed from here */}



              {me?.role === 'master' && (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 12, marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', background: 'var(--surface-hover)' }}>
                  <div style={{ fontWeight: 700 }}>대리 서명 (마스터 전용)</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={proxyMode} onChange={(e) => setProxyMode(e.target.checked)} disabled={!leaderSigners.length} />
                    <span>대리 서명 모드</span>
                  </label>
                  <select
                    className="input"
                    style={{ minWidth: 200 }}
                    value={proxySignerId || ''}
                    onChange={(e) => setProxySignerId(e.target.value || null)}
                    disabled={!proxyMode || !leaderSigners.length}
                  >
                    {leaderSigners.length ? (
                      leaderSigners.map((ls) => (
                        <option key={ls.zoom_user_id} value={ls.zoom_user_id}>
                          {ls.name}
                        </option>
                      ))
                    ) : loadingUsers ? (
                      <option value="">리더 서명자 로딩 중...</option>
                    ) : (
                      <option value="">등록된 리더 서명이 없습니다</option>
                    )}
                  </select>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {leaderSigners.length
                      ? '모드 ON 상태에서 서명 버튼을 누르면 선택한 리더의 서명이 적용됩니다.'
                      : loadingUsers
                        ? '리더(서명 등록자) 목록을 불러오는 중입니다.'
                        : '직원 현황에서 리더가 서명을 저장해야 목록에 표시됩니다.'}
                  </span>
                </div>
              )}

              {Object.entries(groupedNotes).map(([dept, weekData]) => (
                <div key={dept}>
                  {/* 1단계: 부서 */}
                  <div className="accordion-header" onClick={() => toggleDept(dept)}>
                    <span>{dept}</span>
                    <span>{expandedDepts[dept] ? '▲' : '▼'}</span>
                  </div>

                  {expandedDepts[dept] && Object.entries(weekData)
                    .sort(([aKey], [bKey]) => {
                      const a = parseYearWeekKey(aKey);
                      const b = parseYearWeekKey(bKey);
                      if (a.year !== b.year) return a.year - b.year;
                      return a.week - b.week;
                    })
                    .map(([weekKey, weekNotes]) => {
                      const weekIds = weekNotes.map((n) => n.id);
                      const allSelected =
                        weekIds.length > 0 && weekIds.every((id) => selectedNoteIds.includes(id));

                      const toggleWeekSelection = (e) => {
                        e.stopPropagation();
                        setSelectedNoteIds((prev) => {
                          if (allSelected) return prev.filter((id) => !weekIds.includes(id));
                          const merged = new Set(prev);
                          weekIds.forEach((id) => merged.add(id));
                          return Array.from(merged);
                        });
                      };

                      return (
                        <div key={weekKey}>
                          {/* 2단계: 주차 */}
                          <div className="accordion-sub-header" onClick={() => toggleWeek(dept, weekKey)}>
                            <span>{weekKey} ({weekNotes.length}건)</span>
                            <span>{expandedWeeks[`${dept}_${weekKey}`] ? '▲' : '▼'}</span>
                          </div>

                          {/* 3단계: 노트 목록 */}
                          {expandedWeeks[`${dept}_${weekKey}`] && (
                            <div className="accordion-content table-container">
                              <table className="table dept-notes-table">
                                <thead>
                                  <tr>
                                    <th style={{ width: '50px', textAlign: 'center' }}>
                                      <input
                                        type="checkbox"
                                        checked={allSelected}
                                        ref={(el) => {
                                          if (!el) return;
                                          const someSelected =
                                            weekIds.length > 0 && weekIds.some((id) => selectedNoteIds.includes(id));
                                          el.indeterminate = someSelected && !allSelected;
                                        }}
                                        onChange={toggleWeekSelection}
                                      />
                                    </th>
                                    <th>작성자</th><th>제목</th><th>기간</th><th>확인자</th><th>점검자</th><th style={{ textAlign: 'right' }}>기능</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {weekNotes.map((note) => (
                                    <tr key={note.id}>
                                      <td style={{ textAlign: 'center' }}>
                                        <input
                                          type="checkbox"
                                          checked={selectedNoteIds.includes(note.id)}
                                          onChange={() => toggleSelectNote(note.id)}
                                        />
                                      </td>
                                      <td>{note.writer_name}</td>
                                      <td>
                                        {note.title}
                                        {SHOW_ATTACHMENTS_UI && note.attachments && note.attachments.length > 0 && (
                                          <span style={{ fontSize: 10, marginLeft: 4 }} className="muted">
                                            첨부 {note.attachments.length}개
                                          </span>
                                        )}
                                      </td>
                                      <td>{toDateString(note.period_start)} ~ {toDateString(note.period_end)}</td>
                                      <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {note.checker_name ? (
                                              <>
                                                {/* [UI Fix] Show only Name, Full info in Tooltip */}
                                                <span
                                                  className="status-badge"
                                                  style={{ background: '#dcfce7', color: '#166534', cursor: 'help' }}
                                                  title={`완료: ${note.checker_name} (클릭 시 세부정보)`}
                                                >
                                                  완료 {note.checker_name.split('/')[0]}
                                                </span>
                                                <button className="ghost-btn" style={{ fontSize: '11px', color: '#ef4444', textDecoration: 'none' }} onClick={() => signNote(note.id, 'checker', true)}>제거</button>
                                              </>
                                            ) : (
                                              <>
                                                <span className="status-badge" style={{ background: '#f1f5f9', color: '#475569' }}>대기</span>
                                                <button className="ghost-btn" style={{ fontSize: '11px', color: '#2563eb' }} onClick={() => signNote(note.id, 'checker', false)}>{proxyMode ? '대리' : '서명'}</button>
                                              </>
                                            )}
                                          </div>
                                          {note.checker_signed_at && (
                                            <div className="muted" style={{ fontSize: 10 }}>{toDateTimeMinuteString(note.checker_signed_at).slice(0, 10)}</div>
                                          )}
                                        </div>
                                      </td>
                                      <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {note.reviewer_name ? (
                                              <>
                                                <span
                                                  className="status-badge"
                                                  style={{ background: '#dcfce7', color: '#166534', cursor: 'help' }}
                                                  title={`완료: ${note.reviewer_name} (클릭 시 세부정보)`}
                                                >
                                                  완료 {note.reviewer_name.split('/')[0]}
                                                </span>
                                                <button className="ghost-btn" style={{ fontSize: '11px', color: '#ef4444', textDecoration: 'none' }} onClick={() => signNote(note.id, 'reviewer', true)}>제거</button>
                                              </>
                                            ) : (
                                              <>
                                                <span className="status-badge" style={{ background: '#f1f5f9', color: '#475569' }}>대기</span>
                                                <button className="ghost-btn" style={{ fontSize: '11px', color: '#2563eb' }} onClick={() => signNote(note.id, 'reviewer', false)}>{proxyMode ? '대리' : '서명'}</button>
                                              </>
                                            )}
                                          </div>
                                          {note.reviewer_signed_at && (
                                            <div className="muted" style={{ fontSize: 10 }}>{toDateTimeMinuteString(note.reviewer_signed_at).slice(0, 10)}</div>
                                          )}
                                        </div>
                                      </td>
                                      <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                                          <button className="secondary-btn" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => handlePrintNote(note)}>보기</button>
                                          <button className="danger-outline-btn" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => handleDeleteRequest(note.id)}>삭제</button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'admin' && isMaster && (
          <section className="card">
            <div className="card-header">
              <h2>관리자 문서 수정</h2>
              <div className="search-wrapper">
                <select className="search-select" value={adminSearchCategory} onChange={(e) => setAdminSearchCategory(e.target.value)}>
                  <option value="title">제목</option>
                  <option value="writer">작성자</option>
                  <option value="serial">문서번호</option>
                </select>
                <input
                  className="search-input"
                  placeholder="제목/작성자/문서번호 검색"
                  value={adminSearchText}
                  onChange={(e) => setAdminSearchText(e.target.value)}
                />
              </div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* [System Config Removed] */}
              {/* [System Config Removed] */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>연도</label>
                  <input className="input" type="number" style={{ width: 120, marginLeft: 6 }} value={adminMissingYear} onChange={(e) => setAdminMissingYear(Number(e.target.value) || new Date().getFullYear())} />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 12 }}>주차</label>
                  <input className="input" type="number" style={{ width: 120, marginLeft: 6 }} value={adminMissingWeek} onChange={(e) => setAdminMissingWeek(Number(e.target.value) || 1)} />
                </div>
                <div className="muted" style={{ fontSize: 12 }}>누락 인원: {adminMissing.length}명</div>
                <div className="muted" style={{ fontSize: 12 }}>휴가 인원: {adminVacationUsers.length}명</div>
              </div>

              <div className="vacation-box" style={{ marginTop: 8 }}>
                <div className="vacation-box-header">
                  <div className="box-title-row">
                    <div className="box-title">주차 휴가자 설정</div>
                    <span className="muted box-meta">
                      {adminVacationDirty ? '변경사항 있음' : '저장됨'}
                    </span>
                  </div>
                  <div className="box-actions">
                    <button
                      className="primary-btn"
                      style={{ padding: '6px 10px', display: adminVacationOpen ? 'inline-flex' : 'none' }}
                      onClick={saveAdminVacationDraft}
                      disabled={adminVacationSaving || !adminVacationDirty}
                    >
                      {adminVacationSaving ? '저장 중...' : '휴가 저장'}
                    </button>
                    <button
                      className="secondary-btn"
                      style={{ padding: '6px 10px', display: adminVacationOpen ? 'inline-flex' : 'none' }}
                      onClick={refreshAdminVacation}
                      disabled={adminVacationSaving}
                    >
                      새로고침
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      style={{ padding: '6px 10px' }}
                      onClick={() => setAdminVacationOpen((v) => !v)}
                    >
                      {adminVacationOpen ? '접기' : '펼치기'}
                    </button>
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 10, display: adminVacationOpen ? 'block' : 'none' }}>
                  체크한 인원은 누락 목록 대신 "휴가"로 표시됩니다.
                </div>
                <div className="vacation-grid" style={{ display: adminVacationOpen ? 'flex' : 'none' }}>
                  {adminTargetUsers.length === 0 && (
                    <div className="muted" style={{ fontSize: 12 }}>대상 직원이 없습니다.</div>
                  )}
                  {adminTargetUsers.map((u) => {
                    const checked = adminVacationIds.has(u.zoom_user_id);
                    return (
                      <label key={u.zoom_user_id} className={`vacation-chip ${checked ? 'on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={adminVacationSaving}
                          onChange={() => toggleAdminVacationDraft(u.zoom_user_id)}
                        />
                        <span>{u.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {adminMissing.length > 0 && (
                <div className="missing-box">
                  <div className="vacation-box-header">
                    <div className="box-title-row">
                      <div className="box-title">주차 누락자 목록</div>
                      <span className="muted box-meta">
                        (총 {adminMissing.length}명)
                      </span>
                    </div>
                    <div className="box-actions">
                      <button
                        type="button"
                        className="secondary-btn"
                        style={{ padding: '6px 10px' }}
                        onClick={() => setAdminMissingOpen((v) => !v)}
                      >
                        {adminMissingOpen ? '접기' : '펼치기'}
                      </button>
                    </div>
                  </div>

                  {adminMissingOpen && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                      {adminMissing.map((u) => (
                        <span key={u.zoom_user_id} className="status-badge missing-user-badge">
                          {u.name} {u.department_name ? `(${u.department_name.split(' ')[0]})` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {adminMissing.length === 0 && <div className="muted" style={{ fontSize: 12 }}>누락 인원이 없습니다.</div>}
              {adminVacationUsers.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {adminVacationUsers.map((u) => (
                    <span key={u.zoom_user_id} className="status-badge" style={{ background: '#dbeafe', color: '#1e40af' }}>
                      휴가: {u.name}
                    </span>
                  ))}
                </div>
              )}
            </div>


            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>문서번호</th>
                    <th>보고주차</th>
                    <th>제목</th>
                    <th>작성자</th>
                    <th>기록일</th>
                    <th style={{ textAlign: 'right' }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {adminFilteredNotes.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '24px' }}>검색 결과가 없습니다.</td>
                    </tr>
                  ) : (
                    adminFilteredNotes.map((note) => (
                      <tr key={note.id}>
                        <td>{note.serial_no}</td>
                        <td>{note.report_year ? `${note.report_year}년 ${note.report_week}주차` : '-'}</td>
                        <td style={{ fontWeight: '600' }}>
                          {note.title}
                          {SHOW_ATTACHMENTS_UI && note.attachments && note.attachments.length > 0 && (
                            <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>[첨부 {note.attachments.length}개]</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: '600' }}>{note.writer_name}</span>
                          </div>
                        </td>
                        <td>{toDateString(note.record_date)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button className="secondary-btn" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handlePrintNote(note)}>보기</button>
                            <button className="primary-btn" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handleEditClick(note, 'admin')}>관리자 수정</button>
                            <button className="danger-outline-btn" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => handleDeleteRequest(note.id)}>삭제</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {activeTab === 'users' && isMaster && (
          <section className="card">
            <div className="card-header">
              <h2>직원 현황</h2>
              <button className="primary-btn" onClick={() => loadUsers({ sync: true })} disabled={loadingUsers}>{loadingUsers ? '로딩 중...' : '새로고침'}</button>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>부서</th>
                    <th>직급</th>
                    <th>이메일</th>
                    <th>시스템 권한</th>
                    <th style={{ textAlign: 'right' }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const canEditRole = me?.role === 'master';
                    const currentRole = u.role || 'staff';
                    const draftRole = Object.prototype.hasOwnProperty.call(userRoleEdits, u.zoom_user_id)
                      ? userRoleEdits[u.zoom_user_id]
                      : currentRole;
                    const changed = draftRole !== currentRole;
                    const saving = roleSavingId === u.zoom_user_id;

                    return (
                      <tr key={u.zoom_user_id}>
                        <td style={{ fontWeight: '600' }}>{u.name}</td>
                        <td>{u.department_name || '-'}</td>
                        <td>{u.job_title || '-'}</td>
                        <td className="muted">{u.email}</td>
                        <td>
                          {canEditRole ? (
                            <select
                              className="input"
                              style={{ minWidth: 140 }}
                              value={draftRole}
                              onChange={(e) =>
                                setUserRoleEdits((prev) => ({ ...prev, [u.zoom_user_id]: e.target.value }))
                              }
                            >
                              {['staff', 'leader', 'master'].map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="user-badge">{currentRole}</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {canEditRole ? (
                            <button
                              className="secondary-btn"
                              style={{ padding: '6px 10px', fontSize: '12px' }}
                              disabled={!changed || saving}
                              onClick={() => updateUserRole(u.zoom_user_id, draftRole)}
                            >
                              {saving ? '저장 중...' : '저장'}
                            </button>
                          ) : (
                            <span className="muted" style={{ fontSize: 12 }}>master만 수정 가능</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </main>

      {/* 인쇄/보기 모달 */}
      {previewNote && (
        <div className="modal-overlay" onClick={() => setPreviewNote(null)}>
          <div className="modal-content print-modal" onClick={e => e.stopPropagation()}>
            <div className="print-preview-area">
              <h1>아이알링크㈜ 정보통신연구소 연구노트</h1>

              <div className="print-top-row">
                <div className="print-meta-grid">
                  <div className="label">부서</div>
                  <div>{previewNote.department_name || '-'}</div>

                  <div className="label">작성자</div>
                  <div>{(previewNote.writer_name || '-').split('/')[0]}</div>

                  <div className="label">기록일자</div>
                  <div>{toDateString(previewNote.record_date) || '-'}</div>

                  <div className="label">문서번호</div>
                  <div>{previewNote.serial_no || '-'}</div>

                  <div className="label">보고주차</div>
                  <div>{previewNote.report_year ? `${previewNote.report_year}년 ${previewNote.report_week}주차` : '-'}</div>

                  <div className="label">제목</div>
                  <div>{previewNote.title || '-'}</div>

                  <div className="label">기간</div>
                  <div>{toDateString(previewNote.period_start)} ~ {toDateString(previewNote.period_end)}</div>

                  <div className="label">금주 연구 목표</div>
                  <div style={{ whiteSpace: 'pre-line' }}>{previewNote.weekly_goal || '-'}</div>
                </div>

                <div className="print-sign-grid">
                  <div className="print-sign-box">
                    <div className="role">기록자</div>
                    <div className="body">
                      {renderSignature(previewNote.writer_signature_data, previewNote.writer_signature_type)}
                      <div className="name">{previewNote.writer_name || '-'}</div>
                      <div className="time">{toDateTimeMinuteString(previewNote.created_at) || '-'}</div>
                    </div>
                  </div>
                  <div className="print-sign-box">
                    <div className="role">확인자</div>
                    <div className="body">
                      {renderSignature(previewNote.checker_signature_data, previewNote.checker_signature_type)}
                      <div className="name">{previewNote.checker_name || '-'}</div>
                      <div className="time">{toDateTimeMinuteString(previewNote.checker_signed_at) || '-'}</div>
                    </div>
                  </div>
                  <div className="print-sign-box">
                    <div className="role">점검자</div>
                    <div className="body">
                      {renderSignature(previewNote.reviewer_signature_data, previewNote.reviewer_signature_type)}
                      <div className="name">{previewNote.reviewer_name || '-'}</div>
                      <div className="time">{toDateTimeMinuteString(previewNote.reviewer_signed_at) || '-'}</div>
                    </div>
                  </div>
                </div>
              </div>

              {SHOW_ATTACHMENTS_UI && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>첨부파일</div>
                  {previewNote.attachments && previewNote.attachments.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {previewNote.attachments.map((att) => (
                        <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{att.file_name}</span>
                          <button
                            className="secondary-btn"
                            style={{ fontSize: 11, padding: '2px 8px' }}
                            onClick={(e) => handleDownload(e, previewNote.id, att.id)}
                          >
                            다운로드
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : previewNote.attachment_name ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{previewNote.attachment_name}</span>
                      {previewNote.attachment_data && (
                        <button
                          className="secondary-btn"
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={(e) => handleDownload(e, previewNote.id)}
                        >
                          다운로드
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="muted" style={{ fontSize: 12 }}>(첨부 없음)</div>
                  )}
                </div>
              )}

              <table className="print-content-table">
                <thead>
                  <tr>
                    <th>금주 연구 내용</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="print-content-body">
                      <div className="ql-snow">
                        <div
                          className="ql-editor"
                          dangerouslySetInnerHTML={{
                            __html: normalizeContentHtml(previewNote.content || ''),
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

            </div>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setPreviewNote(null)}>닫기</button>
              <button className="primary-btn" onClick={() => window.print()}>브라우저 인쇄</button>
            </div>
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {editingNote && (
        <div className="modal-overlay" onClick={() => setEditingNote(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="card-header">
              <h2>연구노트 수정</h2>
              <span className="muted">{editingNote.serial_no}</span>
            </div>
            <div className="card-body">
              <div className="note-form-container">
                <div className="form-section">
                  {editingMode === 'admin' && (
                    <div className="form-grid">
                      <div className="form-group col-6">
                        <label>기록일자</label>
                        <DatePicker selected={editRecordDate} onChange={setEditRecordDate} dateFormat="yyyy-MM-dd" locale="ko" className="input" />
                      </div>
                      <div className="form-group col-3">
                        <label>보고 연도</label>
                        <input className="input" value={editReportYear} onChange={(e) => setEditReportYear(e.target.value)} />
                      </div>
                      <div className="form-group col-3">
                        <label>주차</label>
                        <input className="input" value={editReportWeek} onChange={(e) => setEditReportWeek(e.target.value)} />
                      </div>
                      <div className="form-group col-12">
                        <label>문서 번호</label>
                        <input className="input" value={editSerialNo} onChange={(e) => setEditSerialNo(e.target.value)} />
                      </div>
                      <div className="form-group col-12">
                        <label>작성자</label>
                        <div className="input" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 600 }}>{editingNote.writer_name}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="form-grid">
                    <div className="form-group col-12">
                      <label>보고 제목</label>
                      <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                    </div>
                    <div className="form-group col-6">
                      <label>시작일</label>
                      <DatePicker selected={editPeriodStart} onChange={setEditPeriodStart} dateFormat="yyyy-MM-dd" locale="ko" className="input" />
                    </div>
                    <div className="form-group col-6">
                      <label>종료일</label>
                      <DatePicker selected={editPeriodEnd} onChange={setEditPeriodEnd} dateFormat="yyyy-MM-dd" locale="ko" className="input" />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <div className="form-group">
                    <label>금주 목표</label>
                    <input className="input" value={editWeeklyGoal} onChange={(e) => setEditWeeklyGoal(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>연구/업무 내용</label>
                    <RichTextEditor
                      value={editContent}
                      onChange={setEditContent}
                      placeholder="연구/업무 내용을 수정하세요."
                    />
                  </div>
                  {SHOW_ATTACHMENTS_UI && (
                    <div className="form-group">
                      <label>첨부파일 변경 (선택)</label>
                      <input
                        type="file"
                        className="input"
                        ref={editFileInputRef}
                        multiple
                        onChange={(e) => setEditAttachments(Array.from(e.target.files || []))}
                      />
                      {(editingNote.attachments && editingNote.attachments.length > 0) && !editAttachments.length && (
                        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {editingNote.attachments.map((att) => (
                            <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="muted" style={{ fontSize: 12 }}>{att.file_name}</span>
                              <button
                                className="ghost-btn"
                                style={{ fontSize: 11, padding: '2px 6px' }}
                                onClick={(e) => handleDownload(e, editingNote.id, att.id)}
                              >
                                다운로드
                              </button>
                            </div>
                          ))}
                          {editFileDeleted ? (
                            <span className="deleted-file-text">삭제 예정: 기존 첨부파일 {editingNote.attachments.length}개</span>
                          ) : (
                            <button className="file-del-btn" onClick={() => setEditFileDeleted(true)}>기존 첨부 모두 삭제</button>
                          )}
                        </div>
                      )}
                      {editFileDeleted && !editAttachments.length && (
                        <button className="secondary-btn" style={{ marginTop: 4, padding: '2px 6px', fontSize: 11 }} onClick={() => setEditFileDeleted(false)}>삭제 취소</button>
                      )}
                      {editAttachments.length > 0 && (
                        <div className="muted" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {editAttachments.map((f) => (
                            <span key={f.name}>추가 예정: {f.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setEditingNote(null)}>취소</button>
              <button className="primary-btn" onClick={handleUpdateNote}>수정사항 저장</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {deleteTargetId && (
        <div className="modal-overlay" onClick={() => setDeleteTargetId(null)}>
          <div className="modal-content mini" onClick={e => e.stopPropagation()}>
            <h3>정말 삭제하시겠습니까?</h3>
            <p className="muted">삭제된 연구노트는 복구할 수 없습니다.</p>
            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setDeleteTargetId(null)}>취소</button>
              <button className="primary-btn" style={{ background: 'var(--danger)' }} onClick={confirmDelete}>삭제하기</button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
}

export default App;
