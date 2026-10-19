import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertCircle, Plus, Camera, Image as ImageIcon, Trash2, CheckCircle2,
  Clock, AlertTriangle, Building2, Users, ExternalLink, X, Loader2, MessageSquare, Edit2
} from 'lucide-react';
import {
  subscribeManagerIssues, addManagerIssue, updateManagerIssue, deleteManagerIssue, uploadIssuePhoto
} from '../../firebase';
import { Sheet, Tile, EmptyState, ConfirmDeleteSheet } from '../Ops/shared';

const B2B_ISSUE_TYPES = [
  'Missing Clothes',
  'Damaged / Torn Clothes',
  'Wrong Clothes Delivered',
  'Late Delivery / Pickup',
  'Weight Dispute',
  'Quality Issue',
  'Billing / Rate Dispute',
  'Staff / Driver Behaviour',
  'Other',
];

const B2C_ISSUE_TYPES = [
  'Missing Items',
  'Damage',
  'Late Delivery',
  'Late Pickup',
  'Stain / Wash Quality Issue',
  'Payment / Billing Issue',
  'Wrong Delivery',
  'Rider Behaviour',
  'Other',
];

export default function IssuesTab({ clients = [] }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'b2b' | 'b2c' | 'pending' | 'resolved'
  const [reporting, setReporting] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(null);

  // Form State (New Issue)
  const [scope, setScope] = useState('b2b');
  const [clientName, setClientName] = useState(clients[0] || '');
  const [customClient, setCustomClient] = useState('');
  const [b2cCustomer, setB2cCustomer] = useState('');
  const [b2cOrderNo, setB2cOrderNo] = useState('');
  const [issueType, setIssueType] = useState('Missing Clothes');
  const [severity, setSeverity] = useState('normal');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Edit Issue State
  const [editingIssue, setEditingIssue] = useState(null);
  const [editScope, setEditScope] = useState('b2b');
  const [editClientName, setEditClientName] = useState('');
  const [editCustomClient, setEditCustomClient] = useState('');
  const [editB2cCustomer, setEditB2cCustomer] = useState('');
  const [editB2cOrderNo, setEditB2cOrderNo] = useState('');
  const [editIssueType, setEditIssueType] = useState('Missing Clothes');
  const [editSeverity, setEditSeverity] = useState('normal');
  const [editStatus, setEditStatus] = useState('pending');
  const [editDescription, setEditDescription] = useState('');
  const [editPhotoFile, setEditPhotoFile] = useState(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState('');
  const [editExistingPhotoUrl, setEditExistingPhotoUrl] = useState('');

  // Delete Confirm State
  const [deleteConfirmIssue, setDeleteConfirmIssue] = useState(null);

  // Subscribe to live issues
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeManagerIssues(
      (list) => {
        setIssues(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching manager issues:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Update default issueType when scope changes
  useEffect(() => {
    if (scope === 'b2b') {
      setIssueType(B2B_ISSUE_TYPES[0]);
    } else {
      setIssueType(B2C_ISSUE_TYPES[0]);
    }
  }, [scope]);

  // Handle Photo Select
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose a valid image file (PNG, JPG, WebP).');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError('');
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview('');
  };

  // Submit Issue
  const handleCreateIssue = async (e) => {
    e.preventDefault();
    setError('');

    const linked = scope === 'b2b'
      ? (clientName === 'other' ? customClient.trim() : clientName).trim()
      : b2cCustomer.trim() + (b2cOrderNo.trim() ? ` (Order #${b2cOrderNo.trim()})` : '');

    if (scope === 'b2b' && !linked) {
      setError('Please select or specify the B2B Client/Hostel name.');
      return;
    }
    if (scope === 'b2c' && !b2cCustomer.trim()) {
      setError('Please provide Customer Name or Order ID for the B2C issue.');
      return;
    }
    if (!description.trim()) {
      setError('Please describe the issue faced.');
      return;
    }

    setSubmitting(true);
    try {
      let photoUrl = '';
      if (photoFile) {
        const uploadRes = await uploadIssuePhoto(photoFile);
        photoUrl = uploadRes.url;
      }

      await addManagerIssue({
        scope,
        linkedEntity: linked,
        issueType,
        severity,
        title: title.trim() || `${issueType} - ${linked}`,
        description: description.trim(),
        photoUrl,
        photoUrls: photoUrl ? [photoUrl] : [],
      });

      // Reset form
      setReporting(false);
      setTitle('');
      setDescription('');
      setPhotoFile(null);
      setPhotoPreview('');
      setB2cCustomer('');
      setB2cOrderNo('');
    } catch (err) {
      console.error('Failed to create issue:', err);
      setError(err.message || 'Failed to report issue. Please try again.');
    }
    setSubmitting(false);
  };

  // Quick Resolve Toggle
  const handleToggleResolve = async (issue) => {
    const nextStatus = issue.status === 'resolved' ? 'pending' : 'resolved';
    try {
      await updateManagerIssue(issue.id, {
        status: nextStatus,
        resolveStatus: nextStatus === 'resolved' ? 'Resolved' : 'Unresolved',
      });
    } catch (err) {
      console.error('Failed to update issue status:', err);
      alert('Could not update status: ' + err.message);
    }
  };

  // Open Edit Modal
  const openEditModal = (issue) => {
    setEditingIssue(issue);
    setEditScope(issue.scope || 'b2b');

    if (issue.scope === 'b2b') {
      const isKnownClient = clients.includes(issue.linkedEntity);
      if (isKnownClient) {
        setEditClientName(issue.linkedEntity);
        setEditCustomClient('');
      } else {
        setEditClientName('other');
        setEditCustomClient(issue.linkedEntity || '');
      }
      setEditB2cCustomer('');
      setEditB2cOrderNo('');
    } else {
      setEditClientName(clients[0] || '');
      setEditCustomClient('');
      const match = (issue.linkedEntity || '').match(/^(.*?)\s*\(Order #([^)]+)\)$/);
      if (match) {
        setEditB2cCustomer(match[1]);
        setEditB2cOrderNo(match[2]);
      } else {
        setEditB2cCustomer(issue.linkedEntity || '');
        setEditB2cOrderNo('');
      }
    }

    setEditIssueType(issue.issueType || (issue.scope === 'b2b' ? B2B_ISSUE_TYPES[0] : B2C_ISSUE_TYPES[0]));
    setEditSeverity(issue.severity || 'normal');
    setEditStatus(issue.status || 'pending');
    setEditDescription(issue.description || '');
    const currentPhoto = issue.photoUrl || (issue.photoUrls && issue.photoUrls[0]) || '';
    setEditExistingPhotoUrl(currentPhoto);
    setEditPhotoPreview(currentPhoto);
    setEditPhotoFile(null);
    setError('');
  };

  // Handle Photo Select in Edit Mode
  const handleEditPhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose a valid image file (PNG, JPG, WebP).');
      return;
    }
    setEditPhotoFile(file);
    setEditPhotoPreview(URL.createObjectURL(file));
    setError('');
  };

  const removeEditPhoto = () => {
    setEditPhotoFile(null);
    setEditPhotoPreview('');
    setEditExistingPhotoUrl('');
  };

  // Submit Update Issue
  const handleUpdateIssue = async (e) => {
    e.preventDefault();
    setError('');

    const linked = editScope === 'b2b'
      ? (editClientName === 'other' ? editCustomClient.trim() : editClientName).trim()
      : editB2cCustomer.trim() + (editB2cOrderNo.trim() ? ` (Order #${editB2cOrderNo.trim()})` : '');

    if (editScope === 'b2b' && !linked) {
      setError('Please select or specify the B2B Client/Hostel name.');
      return;
    }
    if (editScope === 'b2c' && !editB2cCustomer.trim()) {
      setError('Please provide Customer Name or Order ID for the B2C issue.');
      return;
    }
    if (!editDescription.trim()) {
      setError('Please describe the issue faced.');
      return;
    }

    setSubmitting(true);
    try {
      let photoUrl = editExistingPhotoUrl;
      if (editPhotoFile) {
        const uploadRes = await uploadIssuePhoto(editPhotoFile);
        photoUrl = uploadRes.url;
      } else if (!editPhotoPreview) {
        photoUrl = '';
      }

      await updateManagerIssue(editingIssue.id, {
        scope: editScope,
        linkedEntity: linked,
        issueType: editIssueType,
        severity: editSeverity,
        status: editStatus,
        resolveStatus: editStatus === 'resolved' ? 'Resolved' : 'Unresolved',
        title: `${editIssueType} - ${linked}`,
        description: editDescription.trim(),
        photoUrl,
        photoUrls: photoUrl ? [photoUrl] : [],
      });

      setEditingIssue(null);
    } catch (err) {
      console.error('Failed to update issue:', err);
      setError(err.message || 'Failed to update issue. Please try again.');
    }
    setSubmitting(false);
  };

  // Metrics
  const metrics = useMemo(() => {
    const total = issues.length;
    const pending = issues.filter((i) => i.status !== 'resolved').length;
    const critical = issues.filter((i) => (i.severity === 'critical' || i.severity === 'high') && i.status !== 'resolved').length;
    const resolved = issues.filter((i) => i.status === 'resolved').length;
    return { total, pending, critical, resolved };
  }, [issues]);

  // Filtered List
  const filteredIssues = useMemo(() => {
    return issues.filter((item) => {
      if (filter === 'b2b') return item.scope === 'b2b';
      if (filter === 'b2c') return item.scope === 'b2c';
      if (filter === 'pending') return item.status !== 'resolved';
      if (filter === 'resolved') return item.status === 'resolved';
      return true;
    });
  }, [issues, filter]);

  return (
    <div className="issues-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. TOP KPI METRICS */}
      <div className="ops-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Tile tone="blue" label="Total Issues Logged" value={metrics.total} icon={<AlertCircle size={20} />} sub="B2B & B2C operations" />
        <Tile tone="amber" label="Pending Action" value={metrics.pending} icon={<Clock size={20} />} sub="Awaiting resolution" />
        <Tile tone="red" label="Critical / High" value={metrics.critical} icon={<AlertTriangle size={20} />} sub="Requires immediate review" />
        <Tile tone="green" label="Resolved" value={metrics.resolved} icon={<CheckCircle2 size={20} />} sub="Closed & settled" />
      </div>

      {/* 2. CONTROLS BAR: FILTERS & REPORT BUTTON */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fff', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <div className="chip-row scroll" style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'all', label: `All (${metrics.total})` },
            { id: 'b2b', label: `B2B Issues (${issues.filter((i) => i.scope === 'b2b').length})` },
            { id: 'b2c', label: `B2C Issues (${issues.filter((i) => i.scope === 'b2c').length})` },
            { id: 'pending', label: `Pending (${metrics.pending})` },
            { id: 'resolved', label: `Resolved (${metrics.resolved})` },
          ].map((f) => (
            <button
              key={f.id}
              className={`chip ${filter === f.id ? 'chip-active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          className="btn-action-primary"
          onClick={() => { setReporting(true); setError(''); }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={16} /> <span>Report New Issue</span>
        </button>
      </div>

      {/* 3. ISSUES LIST */}
      {loading ? (
        <div className="loading-state" style={{ padding: 40, textAlign: 'center' }}>
          <Loader2 size={24} className="spin" />
          <span style={{ marginLeft: 8 }}>Loading logged issues…</span>
        </div>
      ) : filteredIssues.length === 0 ? (
        <EmptyState
          title="No issues found"
          sub={filter === 'all' ? 'No issues have been reported by the managers yet.' : `No issues match the "${filter}" filter.`}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {filteredIssues.map((item) => {
            const isResolved = item.status === 'resolved';
            const isCritical = item.severity === 'critical';
            const isHigh = item.severity === 'high';

            return (
              <div
                key={item.id}
                style={{
                  background: '#fff',
                  borderRadius: 14,
                  border: isCritical ? '1px solid #fca5a5' : isResolved ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                  boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  position: 'relative',
                }}
              >
                {/* Header: Scope, Severity, Status */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 6,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        background: item.scope === 'b2b' ? '#eff6ff' : '#faf5ff',
                        color: item.scope === 'b2b' ? '#1d4ed8' : '#7e22ce',
                        border: item.scope === 'b2b' ? '1px solid #bfdbfe' : '1px solid #e9d5ff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {item.scope === 'b2b' ? <Building2 size={12} /> : <Users size={12} />}
                      {item.scope === 'b2b' ? 'B2B' : 'B2C'}
                    </span>

                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: isCritical ? '#fee2e2' : isHigh ? '#fef3c7' : '#f1f5f9',
                        color: isCritical ? '#dc2626' : isHigh ? '#b45309' : '#475569',
                      }}
                    >
                      {item.severity ? item.severity.toUpperCase() : 'NORMAL'}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: 12,
                      background: isResolved ? '#ecfdf5' : item.status === 'checking' ? '#eff6ff' : '#fffbeb',
                      color: isResolved ? '#059669' : item.status === 'checking' ? '#2563eb' : '#d97706',
                      border: isResolved ? '1px solid #a7f3d0' : item.status === 'checking' ? '1px solid #bfdbfe' : '1px solid #fde68a',
                    }}
                  >
                    {isResolved ? 'Resolved' : item.status === 'checking' ? 'Checking' : 'Pending'}
                  </span>
                </div>

                {/* Linked Entity & Date */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
                    {item.linkedEntity || 'Unassigned'}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Reported on {item.date || 'Today'} {item.reportedBy ? `by ${item.reportedBy}` : ''}
                  </div>
                </div>

                {/* Issue Type & Description */}
                <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    {item.issueType || 'General Issue'}
                  </div>
                  <p style={{ fontSize: 12.5, color: '#475569', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                    {item.description}
                  </p>
                </div>

                {/* Proof Photo Attachment */}
                {(item.photoUrl || (item.photoUrls && item.photoUrls[0])) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img
                      src={item.photoUrl || item.photoUrls[0]}
                      alt="Proof"
                      style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1', cursor: 'pointer' }}
                      onClick={() => setViewingPhoto(item.photoUrl || item.photoUrls[0])}
                    />
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ fontSize: 11, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => setViewingPhoto(item.photoUrl || item.photoUrls[0])}
                    >
                      <ExternalLink size={12} /> View proof photo
                    </button>
                  </div>
                )}

                {/* Admin Solution Notes (if any) */}
                {item.solution && (
                  <div style={{ background: '#ecfdf5', padding: '10px 12px', borderRadius: 8, border: '1px solid #a7f3d0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#047857', marginBottom: 3 }}>
                      <CheckCircle2 size={13} /> Admin Resolution Notes:
                    </div>
                    <div style={{ fontSize: 12, color: '#065f46', lineHeight: 1.4 }}>
                      {item.solution}
                    </div>
                  </div>
                )}

                {/* Footer Action */}
                <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#2563eb',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        cursor: 'pointer',
                      }}
                      onClick={() => openEditModal(item)}
                    >
                      <Edit2 size={13} /> Edit
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#dc2626',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '4px 8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                      onClick={() => setDeleteConfirmIssue(item)}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn-ghost"
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: isResolved ? '#64748b' : '#059669',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                    }}
                    onClick={() => handleToggleResolve(item)}
                  >
                    <CheckCircle2 size={14} />
                    {isResolved ? 'Re-open issue' : 'Mark as Resolved'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. REPORT ISSUE MODAL / SHEET */}
      {reporting && (
        <Sheet title="Report Operations Issue" onClose={() => setReporting(false)}>
          <form onSubmit={handleCreateIssue} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Scope Selection */}
            <div className="form-row">
              <label className="form-label">Issue Scope</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  type="button"
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: scope === 'b2b' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: scope === 'b2b' ? '#eff6ff' : '#fff',
                    color: scope === 'b2b' ? '#1d4ed8' : '#475569',
                    fontWeight: 700,
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                  onClick={() => setScope('b2b')}
                >
                  <Building2 size={16} /> B2B Client / Hostel
                </button>
                <button
                  type="button"
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: scope === 'b2c' ? '2px solid #7e22ce' : '1px solid #cbd5e1',
                    background: scope === 'b2c' ? '#faf5ff' : '#fff',
                    color: scope === 'b2c' ? '#7e22ce' : '#475569',
                    fontWeight: 700,
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                  onClick={() => setScope('b2c')}
                >
                  <Users size={16} /> B2C Retail Order
                </button>
              </div>
            </div>

            {/* Linked Entity: B2B vs B2C */}
            {scope === 'b2b' ? (
              <div className="form-row">
                <label className="form-label">Select Client / Property</label>
                <select
                  className="form-input"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                >
                  {clients.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="other">Other / Custom Client</option>
                </select>
                {clientName === 'other' && (
                  <input
                    className="form-input"
                    style={{ marginTop: 8 }}
                    placeholder="Enter custom B2B client or hostel name"
                    value={customClient}
                    onChange={(e) => setCustomClient(e.target.value)}
                  />
                )}
              </div>
            ) : (
              <div className="form-row two-col">
                <div>
                  <label className="form-label">Customer Name / Phone</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Rahul Sharma (9876543210)"
                    value={b2cCustomer}
                    onChange={(e) => setB2cCustomer(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Order ID (optional)</label>
                  <input
                    className="form-input"
                    placeholder="e.g. 10452"
                    value={b2cOrderNo}
                    onChange={(e) => setB2cOrderNo(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Issue Category & Severity */}
            <div className="form-row two-col">
              <div>
                <label className="form-label">Issue Category</label>
                <select
                  className="form-input"
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value)}
                >
                  {(scope === 'b2b' ? B2B_ISSUE_TYPES : B2C_ISSUE_TYPES).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Severity Level</label>
                <select
                  className="form-input"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical (Immediate Attention)</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div className="form-row">
              <label className="form-label">Details / Description</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Explain the issue clearly (e.g., 2 chef coats missing from batch #2, or customer says white shirt has stains)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Photo Attachment (Dual Camera & Gallery Upload) */}
            <div className="form-row">
              <label className="form-label">Attach Proof Photo (optional)</label>
              {photoPreview ? (
                <div className="b2b-photo-preview-wrap">
                  <img src={photoPreview} alt="Proof preview" className="b2b-photo-thumb" />
                  <div className="b2b-photo-actions" style={{ display: 'flex', gap: 8 }}>
                    <label className="btn-ghost" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Camera size={14} /> Camera
                      <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoSelect} />
                    </label>
                    <label className="btn-ghost" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <ImageIcon size={14} /> Gallery
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoSelect} />
                    </label>
                    <button type="button" className="btn-ghost" style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={removePhoto}>
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="b2b-photo-dropzone" style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Camera size={20} className="ops-muted" />
                    <span style={{ color: '#cbd5e1' }}>|</span>
                    <ImageIcon size={20} className="ops-muted" />
                  </div>
                  <span className="ops-muted" style={{ fontSize: 12 }}>Snap photo or choose from gallery</span>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 8, background: '#f1f5f9', border: '1px solid #cbd5e1', fontWeight: 600 }}>
                      <Camera size={14} /> Take Photo
                      <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoSelect} />
                    </label>
                    <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 8, background: '#f1f5f9', border: '1px solid #cbd5e1', fontWeight: 600 }}>
                      <ImageIcon size={14} /> Gallery
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoSelect} />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {error && <div className="form-error">{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button type="button" className="btn-secondary" onClick={() => setReporting(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? <><Loader2 size={16} className="spin" /> Submitting…</> : 'Log Issue'}
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {/* 5. EDIT ISSUE MODAL / SHEET */}
      {editingIssue && (
        <Sheet title="Edit Operations Issue" onClose={() => setEditingIssue(null)}>
          <form onSubmit={handleUpdateIssue} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Scope Selection */}
            <div className="form-row">
              <label className="form-label">Issue Scope</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  type="button"
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: editScope === 'b2b' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: editScope === 'b2b' ? '#eff6ff' : '#fff',
                    color: editScope === 'b2b' ? '#1d4ed8' : '#475569',
                    fontWeight: 700,
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setEditScope('b2b');
                    setEditIssueType(B2B_ISSUE_TYPES[0]);
                  }}
                >
                  <Building2 size={16} /> B2B Client / Hostel
                </button>
                <button
                  type="button"
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: editScope === 'b2c' ? '2px solid #7e22ce' : '1px solid #cbd5e1',
                    background: editScope === 'b2c' ? '#faf5ff' : '#fff',
                    color: editScope === 'b2c' ? '#7e22ce' : '#475569',
                    fontWeight: 700,
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setEditScope('b2c');
                    setEditIssueType(B2C_ISSUE_TYPES[0]);
                  }}
                >
                  <Users size={16} /> B2C Retail Order
                </button>
              </div>
            </div>

            {/* Linked Entity: B2B vs B2C */}
            {editScope === 'b2b' ? (
              <div className="form-row">
                <label className="form-label">Select Client / Property</label>
                <select
                  className="form-input"
                  value={editClientName}
                  onChange={(e) => setEditClientName(e.target.value)}
                >
                  {clients.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="other">Other / Custom Client</option>
                </select>
                {editClientName === 'other' && (
                  <input
                    className="form-input"
                    style={{ marginTop: 8 }}
                    placeholder="Enter custom B2B client or hostel name"
                    value={editCustomClient}
                    onChange={(e) => setEditCustomClient(e.target.value)}
                  />
                )}
              </div>
            ) : (
              <div className="form-row two-col">
                <div>
                  <label className="form-label">Customer Name / Phone</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Rahul Sharma (9876543210)"
                    value={editB2cCustomer}
                    onChange={(e) => setEditB2cCustomer(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Order ID (optional)</label>
                  <input
                    className="form-input"
                    placeholder="e.g. 10452"
                    value={editB2cOrderNo}
                    onChange={(e) => setEditB2cOrderNo(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Issue Category & Severity */}
            <div className="form-row two-col">
              <div>
                <label className="form-label">Issue Category</label>
                <select
                  className="form-input"
                  value={editIssueType}
                  onChange={(e) => setEditIssueType(e.target.value)}
                >
                  {(editScope === 'b2b' ? B2B_ISSUE_TYPES : B2C_ISSUE_TYPES).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Severity Level</label>
                <select
                  className="form-input"
                  value={editSeverity}
                  onChange={(e) => setEditSeverity(e.target.value)}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical (Immediate Attention)</option>
                </select>
              </div>
            </div>

            {/* Status Selection */}
            <div className="form-row">
              <label className="form-label">Status</label>
              <select
                className="form-input"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="checking">Checking</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            {/* Description */}
            <div className="form-row">
              <label className="form-label">Details / Description</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Explain the issue clearly..."
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>

            {/* Photo Attachment */}
            <div className="form-row">
              <label className="form-label">Proof Photo</label>
              {editPhotoPreview ? (
                <div className="b2b-photo-preview-wrap">
                  <img src={editPhotoPreview} alt="Proof preview" className="b2b-photo-thumb" />
                  <div className="b2b-photo-actions" style={{ display: 'flex', gap: 8 }}>
                    <label className="btn-ghost" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Camera size={14} /> Camera
                      <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleEditPhotoSelect} />
                    </label>
                    <label className="btn-ghost" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <ImageIcon size={14} /> Gallery
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleEditPhotoSelect} />
                    </label>
                    <button type="button" className="btn-ghost" style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={removeEditPhoto}>
                      <Trash2 size={14} /> Remove Photo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="b2b-photo-dropzone" style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Camera size={20} className="ops-muted" />
                    <span style={{ color: '#cbd5e1' }}>|</span>
                    <ImageIcon size={20} className="ops-muted" />
                  </div>
                  <span className="ops-muted" style={{ fontSize: 12 }}>Snap photo or choose from gallery</span>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 8, background: '#f1f5f9', border: '1px solid #cbd5e1', fontWeight: 600 }}>
                      <Camera size={14} /> Take Photo
                      <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleEditPhotoSelect} />
                    </label>
                    <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 8, background: '#f1f5f9', border: '1px solid #cbd5e1', fontWeight: 600 }}>
                      <ImageIcon size={14} /> Gallery
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleEditPhotoSelect} />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {error && <div className="form-error">{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button type="button" className="btn-secondary" onClick={() => setEditingIssue(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? <><Loader2 size={16} className="spin" /> Saving…</> : 'Save Changes'}
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {/* 6. DELETE CONFIRMATION SHEET */}
      {deleteConfirmIssue && (
        <ConfirmDeleteSheet
          title="Delete Issue"
          message={`Are you sure you want to permanently delete this issue for "${deleteConfirmIssue.linkedEntity || 'this entry'}"? This action cannot be undone.`}
          onConfirm={async () => {
            try {
              await deleteManagerIssue(deleteConfirmIssue.id);
              setDeleteConfirmIssue(null);
            } catch (err) {
              alert('Could not delete issue: ' + err.message);
            }
          }}
          onClose={() => setDeleteConfirmIssue(null)}
        />
      )}

      {/* 7. FULL PHOTO VIEWER LIGHTBOX */}
      {viewingPhoto && (
        <div
          className="modal-backdrop"
          onClick={() => setViewingPhoto(null)}
          style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setViewingPhoto(null)}
              style={{
                position: 'absolute',
                top: -12,
                right: -12,
                background: '#0f172a',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              <X size={18} />
            </button>
            <img
              src={viewingPhoto}
              alt="Full size proof"
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 12, objectFit: 'contain', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
