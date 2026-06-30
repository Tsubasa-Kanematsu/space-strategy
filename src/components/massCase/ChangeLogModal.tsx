import React, { useState } from 'react';
import { useMassCaseStore } from '../../stores/massCaseStore';
import type { MassCase } from '../../types';

interface Props {
  mc: MassCase;
  onClose: () => void;
}

export const ChangeLogModal: React.FC<Props> = ({ mc, onClose }) => {
  const addChangeRecord = useMassCaseStore((s) => s.addChangeRecord);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ changedBy: '', summary: '', rationale: '', documentUrls: '' });

  const entries = [...(mc.changeLog ?? [])].reverse(); // 新しい順

  const handleAdd = () => {
    if (!form.summary.trim()) return;
    addChangeRecord(mc.id, {
      changedBy: form.changedBy.trim(),
      summary: form.summary.trim(),
      rationale: form.rationale.trim(),
      documentUrls: form.documentUrls
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean),
    });
    setForm({ changedBy: '', summary: '', rationale: '', documentUrls: '' });
    setShowAdd(false);
  };

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title">
              <i className="bi bi-journal-text me-2 text-primary" />
              変更ログ —{' '}
              <span className="fw-normal" style={{ color: '#1558c0' }}>{mc.name}</span>
            </h6>
            <button className="btn-close btn-sm" onClick={onClose} />
          </div>

          <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {entries.length === 0 && !showAdd && (
              <p className="text-muted text-center py-3" style={{ fontSize: '0.85rem' }}>
                変更ログはまだありません
              </p>
            )}

            {entries.map((entry, idx) => (
              <div key={entry.id} className={`pb-3 ${idx < entries.length - 1 ? 'mb-3 border-bottom' : ''}`}>
                <div className="d-flex gap-2">
                  <div className="flex-shrink-0 pt-1">
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#1a73e8', marginTop: 4,
                    }} />
                  </div>
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                      <span className="fw-semibold" style={{ fontSize: '0.875rem' }}>
                        {entry.summary}
                      </span>
                      <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                        {new Date(entry.changedAt).toLocaleString('ja-JP')}
                        {entry.changedBy && ` · ${entry.changedBy}`}
                      </span>
                    </div>
                    {entry.rationale && (
                      <p className="text-muted mb-1" style={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap' }}>
                        {entry.rationale}
                      </p>
                    )}
                    {entry.documentUrls.length > 0 && (
                      <div className="d-flex flex-wrap gap-1 mt-1">
                        {entry.documentUrls.map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-decoration-none"
                            style={{
                              background: '#e8f0fe',
                              color: '#1558c0',
                              fontSize: '0.75rem',
                              padding: '2px 8px',
                              borderRadius: 100,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            title={url}
                          >
                            <i className="bi bi-link-45deg" />
                            {url.length > 60 ? url.slice(0, 59) + '…' : url}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {showAdd && (
              <div className="border rounded p-3" style={{ background: '#f8f9fa' }}>
                <p className="fw-medium mb-2" style={{ fontSize: '0.85rem' }}>
                  <i className="bi bi-plus-circle me-1 text-primary" />新しいエントリを追加
                </p>
                <div className="mb-2">
                  <label className="form-label fw-medium" style={{ fontSize: '0.82rem' }}>
                    変更概要 <span className="text-danger">*</span>
                  </label>
                  <input
                    className="form-control form-control-sm"
                    placeholder="例: エンジン質量を最新試験値に更新"
                    value={form.summary}
                    onChange={(e) => setForm({ ...form, summary: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label fw-medium" style={{ fontSize: '0.82rem' }}>
                    変更理由・背景
                  </label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    placeholder="例: 燃焼試験 #3 の計測結果を反映。前回値より 2.1 kg 重くなった。"
                    value={form.rationale}
                    onChange={(e) => setForm({ ...form, rationale: e.target.value })}
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label fw-medium" style={{ fontSize: '0.82rem' }}>
                    参照ドキュメントURL（1行1件）
                  </label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    placeholder={'https://docs.example.com/test-report-3\nhttps://confluence.example.com/...'}
                    value={form.documentUrls}
                    onChange={(e) => setForm({ ...form, documentUrls: e.target.value })}
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label fw-medium" style={{ fontSize: '0.82rem' }}>
                    記入者
                  </label>
                  <input
                    className="form-control form-control-sm"
                    placeholder="例: 山田太郎"
                    value={form.changedBy}
                    onChange={(e) => setForm({ ...form, changedBy: e.target.value })}
                  />
                </div>
                <div className="d-flex gap-2 justify-content-end">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setShowAdd(false); setForm({ changedBy: '', summary: '', rationale: '', documentUrls: '' }); }}
                  >
                    キャンセル
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleAdd}
                    disabled={!form.summary.trim()}
                  >
                    追加
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer py-2">
            {!showAdd && (
              <button
                className="btn btn-outline-primary btn-sm me-auto"
                onClick={() => setShowAdd(true)}
              >
                <i className="bi bi-plus-lg me-1" />エントリを追加
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={onClose}>
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
