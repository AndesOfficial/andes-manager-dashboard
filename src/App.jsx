import React, { useState, useEffect } from 'react';
import {
  Plus, Loader2, Home, Users, LogOut, Boxes, LayoutDashboard, Building2, Archive, AlertCircle,
} from 'lucide-react';
import InventoryTab from './components/Inventory/InventoryTab';
import OverviewTab from './components/Ops/OverviewTab';
import B2CTab from './components/Ops/B2CTab';
import B2BTab from './components/Ops/B2BTab';
import IssuesTab from './components/Issues/IssuesTab';
import ArchiveTab from './components/Ops/ArchiveTab';
import ErrorBoundary from './components/ErrorBoundary';
import { RangeBar, todayStr, rangeLabel } from './components/Ops/shared';
import useRangeData from './hooks/useDayData';
import {
  subscribeHostels, subscribeAuth, signIn, signOut, isAllowedUser, isManagerUser,
} from './firebase';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, title: 'Dashboard Overview' },
  { id: 'b2b', label: 'B2B', icon: Building2, title: 'B2B Entries' },
  { id: 'b2c', label: 'B2C', icon: Users, title: 'B2C Orders' },
  { id: 'issues', label: 'Issues', icon: AlertCircle, title: 'Operations Issues' },
  { id: 'inventory', label: 'Inventory', icon: Boxes, title: 'Inventory' },
  { id: 'archive', label: 'Archive', icon: Archive, title: 'Archive' },
];
const DAY_TABS = ['overview', 'b2b', 'b2c'];

/* ---------------- main app ---------------- */

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = checking
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState('overview');
  const [range, setRange] = useState(() => ({ from: todayStr(), to: todayStr() }));
  const [focusId, setFocusId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [hostels, setHostels] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const isAdmin = user && isAllowedUser(user);
  const canUseApp = !!(isAdmin || (user && isManagerUser(user)));
  const data = useRangeData(range, canUseApp);

  /* network listener */
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  /* auth listener */
  useEffect(() => subscribeAuth((u) => {
    setUser(u);
    if (u && !isAllowedUser(u) && !isManagerUser(u)) {
      setAuthError('This account does not have access. Sign in with an Andes manager or admin account.');
      signOut();
    } else {
      setAuthError('');
    }
  }), []);

  /* B2B client names */
  useEffect(() => (canUseApp ? subscribeHostels(setHostels) : undefined), [canUseApp]);

  const go = (t, id = null) => { setTab(t); setFocusId(id); };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!loginEmail.trim() || !loginPassword) {
      setAuthError('Enter email and password.');
      return;
    }
    setLoginLoading(true);
    try {
      await signIn(loginEmail.trim(), loginPassword);
    } catch (err) {
      console.error('Firebase Auth error details:', err);
      const msg = err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password'
        ? 'Wrong email or password.'
        : err.code === 'auth/user-not-found'
          ? 'No account with this email.'
          : `Sign-in failed (${err.code || 'unknown'}).`;
      setAuthError(msg);
    }
    setLoginLoading(false);
  };

  const handleSignOut = () => {
    signOut();
    setLoginEmail('');
    setLoginPassword('');
  };

  if (user === undefined) {
    return (
      <div className="layout-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="loading-state"><Loader2 size={22} className="spin" /><span>Checking auth…</span></div>
      </div>
    );
  }

  if (!canUseApp) {
    return (
      <div className="layout-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 10px 30px rgba(15,23,42,0.08)' }}>
          <div className="sidebar-title" style={{ color: '#0f172a', marginBottom: 4 }}>Andes Manager Portal</div>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Sign in with the manager or admin account.</p>
          <form onSubmit={handleSignIn} style={{ width: '100%' }}>
            <div className="form-row">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" placeholder="you@andes.co.in"
                value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} autoFocus />
            </div>
            <div className="form-row">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="••••••••"
                value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
            </div>
            {authError && <div className="form-error" style={{ textAlign: 'center', marginBottom: 10 }}>{authError}</div>}
            <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={loginLoading}>
              {loginLoading ? <><Loader2 size={16} className="spin" /> Signing in…</> : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const current = TABS.find((t) => t.id === tab);
  const isDayTab = DAY_TABS.includes(tab);
  const toVerify = data.b2cRows.filter((r) => r.status === 'pending' || r.status === 'changed').length
    + data.b2bEntries.filter((e) => e.status === 'pending').length;
  const addButton = tab === 'b2b' && (
    <button className="btn-action-primary" onClick={() => setAdding(true)}>
      <Plus size={16} /><span>Add B2B entry</span>
    </button>
  );

  return (
    <div className="layout-container">

      {/* 1. WIDESCREEN SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="sidebar-logo"><Home size={20} color="#fff" /></div>
            <div>
              <div className="sidebar-title">Andes</div>
              <div className="sidebar-subtitle">Manager Portal</div>
            </div>
          </div>

          <nav className="sidebar-menu">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} className={`menu-item ${tab === id ? 'active' : ''}`} onClick={() => go(id)}>
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-profile">
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div className="profile-info">
                <span className="profile-name">{isAdmin ? 'Admin' : 'Manager'}</span>
                <span className="profile-role">{user.email}</span>
              </div>
              <button className="icon-btn" style={{ background: 'transparent', border: 'none', color: '#94a3b8' }} onClick={handleSignOut} title="Sign out">
                <LogOut size={18} />
              </button>
            </div>
            <div className="profile-info" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: isOnline ? 'var(--green)' : 'var(--red)',
                boxShadow: isOnline ? '0 0 8px var(--green)' : '0 0 8px var(--red)'
              }} />
              <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MAIN AREA */}
      <main className="main-area">

        {/* Desktop Header */}
        <header className="main-header">
          <div className="main-title-wrap">
            <h1>{current.title}</h1>
            <p>{isDayTab
              ? `${rangeLabel(range)} · ${toVerify ? `${toVerify} to verify` : 'all verified'}`
              : tab === 'issues' ? 'Report & monitor B2B and B2C operational issues'
              : tab === 'inventory' ? 'Daily stock, cleanliness, vehicle & utility log' : 'Old hand-typed records'}</p>
          </div>
          <div className="header-actions">{addButton}</div>
        </header>

        {/* Mobile Header (Hidden on Desktop) */}
        <div className="mobile-topbar">
          <div className="brand">
            <div className="brand-badge"><Home size={17} color="#fff" /></div>
            <div>
              <div className="brand-name">Andes {isAdmin && <span className="admin-pill" style={{ fontSize: 9, background: '#2563eb', color: '#fff', padding: '2px 6px', borderRadius: 4, marginLeft: 6, fontWeight: 700, textTransform: 'uppercase' }}>Admin</span>}</div>
              <div className="brand-sub">{isDayTab ? `${toVerify} to verify` : current.title}</div>
            </div>
          </div>
          <button className="icon-btn" onClick={handleSignOut} title="Sign out"><LogOut size={16} /></button>
        </div>

        {/* Mobile Navigation Tabs (Hidden on Desktop) */}
        <nav className="mobile-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`mobile-tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => go(t.id)}>{t.label}</button>
          ))}
        </nav>

        {/* Active Tab Panel */}
        <div className="tab-content-panel">
          <ErrorBoundary key={tab}>
            {isDayTab && <RangeBar range={range} onChange={(r) => { setRange(r); setFocusId(null); }} />}
            {isDayTab && data.error && <div className="form-error" style={{ marginBottom: 12 }}>{data.error}</div>}
            {isDayTab && data.loading ? (
              <div className="loading-state"><Loader2 size={22} className="spin" /><span>Loading {rangeLabel(range)}…</span></div>
            ) : tab === 'overview' ? (
              <OverviewTab b2c={data.b2c} b2bSum={data.b2bSum} onGo={go} />
            ) : tab === 'b2b' ? (
              <B2BTab range={range} entries={data.b2bEntries} clients={hostels} adding={adding} onAddClose={() => setAdding(false)} />
            ) : tab === 'b2c' ? (
              <B2CTab rows={data.b2cRows} focusId={focusId} range={range} />
            ) : tab === 'issues' ? (
              <IssuesTab clients={hostels} />
            ) : tab === 'inventory' ? (
              <InventoryTab />
            ) : (
              <ArchiveTab />
            )}
          </ErrorBoundary>
        </div>

      </main>

      {/* Mobile Floating Action Button (FAB) */}
      {tab === 'b2b' && !data.loading && (
        <button className="fab" onClick={() => setAdding(true)}>
          <Plus size={20} /> <span>Add B2B entry</span>
        </button>
      )}

    </div>
  );
}
