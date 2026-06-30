import React, { useState } from 'react';
import { useMassCaseStore } from '../../stores/massCaseStore';
import type { MassComponent, ActualMassEntry } from '../../types';

interface Props {
  comp: MassComponent;
  onClose: () => void;
}

export const ActualMassHistoryModal: React.FC<Props> = ({ comp, onClose }) => {
  const confirmActualMassEntry = useMassCaseStore((s) => s.confirmActualMassEntry);
  const [confirmerName, setConfirmerName] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const entries = [...(comp.actualMassHistory ?? [])].reverse(); // 新しい順

  const latestUnconfirmed = entries.find((e) => e.status === 'input') ?? null;

  const handleConfirm = (entry: ActualMassEntry) => {
    if (!confirmerName.trim()) return;
    confirmActualMassEntry(comp.id, entry.id, confirmerName.trim());
    setConfirmingId(null);
    setConfirmerName('');
  };

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title">
              <i className="bi bi-clock-history me-2 text-primary" />
              実質量の更新履歴 —{' '}
              <span className="fw-normal" style={{ color: '#1558c0' }}>{comp.paramName}</span>
              <code className="ms-2 text-muted" style={{ fontSize: '0.75rem' }}>{comp.varName}</code>
            </h6>
            <button className="btn-close btn-sm" onClick={onClose} />
          </div>

          <div className="modal-body p-0" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            {entries.length === 0 ? (
              <p className="text-muted text-center py-4" style={{ fontSize: '0.85rem' }}>
                更新履歴はまだありません
              </p>
            ) : (
              <div style={{ position: 'relative' }}>
                {/* タイムライン縦線 */}
                <div style={{
                  position: 'absolute', left: 31, top: 0, bottom: 0,
                  width: 2, background: '#e9ecef',
                }} />

                {entries.map((entry, idx) => {
                  const isLatest = idx === 0;
                  const isUnconfirmed = entry.status === 'input';
                  const isConfirming = confirmingId === entry.id;

                  return (
                    <div key={entry.id} style={{ display: 'flex', gap: 12, padding: '14px 20px' }}>
                      {/* タイムラインドット */}
                      <div style={{ flexShrink: 0, zIndex: 1 }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: entry.status === 'confirmed' ? '#e6f4ea' : entry.source === 'cad' ? '#e8f4ff' : '#fff8e1',
                          border: `2px solid ${entry.status === 'confirmed' ? '#34a853' : entry.source === 'cad' ? '#0d6efd' : '#f9ab00'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {entry.status === 'confirmed'
                            ? <i className="bi bi-check2" style={{ fontSize: 11, color: '#1b5e20' }} />
                            : entry.source === 'cad'
                              ? <i className="bi bi-box" style={{ fontSize: 10, color: '#0d6efd' }} />
                              : <i className="bi bi-pencil" style={{ fontSize: 10, color: '#e65100' }} />}
                        </div>
                      </div>

                      {/* コンテンツ */}
                      <div style={{ flex: 1, paddingBottom: idx < entries.length - 1 ? 0 : 0 }}>
                        {/* ヘッダー行 */}
                        <div className="d-flex align-items-center flex-wrap gap-2 mb-1">
                          <span className="fw-semibold" style={{ fontSize: '1rem', color: '#212529' }}>
                            {entry.value !== null
                              ? `${entry.value.toLocaleString('ja-JP', { maximumFractionDigits: 3 })} kg`
                              : <span className="text-muted">—</span>}
                          </span>

                          {/* ソースバッジ（CAD） */}
                          {entry.source === 'cad' && (
                            <span style={{
                              background: '#e8f4ff', color: '#0d6efd',
                              fontSize: '0.65rem', fontWeight: 700,
                              padding: '1px 6px', borderRadius: 4,
                            }}>
                              <i className="bi bi-box me-1" style={{ fontSize: '0.6rem' }} />CAD
                            </span>
                          )}

                          {/* ステータスバッジ */}
                          {entry.status === 'confirmed' ? (
                            <span style={{
                              background: '#e6f4ea', color: '#1b5e20',
                              fontSize: '0.68rem', fontWeight: 600,
                              padding: '1px 7px', borderRadius: 100,
                            }}>
                              ✓ 確認済 {entry.confirmedBy && `· ${entry.confirmedBy}`}
                            </span>
                          ) : (
                            <span style={{
                              background: entry.source === 'cad' ? '#e8f4ff' : '#fff8e1',
                              color: entry.source === 'cad' ? '#0d6efd' : '#e65100',
                              fontSize: '0.68rem', fontWeight: 600,
                              padding: '1px 7px', borderRadius: 100,
                            }}>
                              {entry.source === 'cad' ? 'CAD取込済・未確認' : '入力済・未確認'}
                            </span>
                          )}

                          {isLatest && (
                            <span style={{
                              background: '#e8f0fe', color: '#1558c0',
                              fontSize: '0.65rem', fontWeight: 600,
                              padding: '1px 6px', borderRadius: 100,
                            }}>最新</span>
                          )}
                        </div>

                        {/* メタ情報 */}
                        <div className="d-flex align-items-center gap-2 flex-wrap mb-1" style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                          <span>
                            <i className="bi bi-person me-1" />
                            {entry.recordedBy || '（記入者未設定）'}
                          </span>
                          <span>
                            <i className="bi bi-clock me-1" />
                            {new Date(entry.recordedAt).toLocaleString('ja-JP')}
                          </span>
                          {entry.status === 'confirmed' && entry.confirmedAt && (
                            <span style={{ color: '#1b5e20' }}>
                              <i className="bi bi-check-circle me-1" />
                              確認: {new Date(entry.confirmedAt).toLocaleString('ja-JP')}
                            </span>
                          )}
                        </div>

                        {/* エビデンス */}
                        {entry.evidence && (
                          <p className="mb-1" style={{ fontSize: '0.82rem', color: '#495057', background: '#f8f9fa', padding: '4px 8px', borderRadius: 4 }}>
                            {entry.evidence}
                          </p>
                        )}

                        {/* 確認ボタン（最新の未確認エントリのみ） */}
                        {isLatest && isUnconfirmed && (
                          isConfirming ? (
                            <div className="d-flex align-items-center gap-2 mt-2">
                              <input
                                className="form-control form-control-sm"
                                style={{ maxWidth: 180 }}
                                placeholder="確認者名"
                                value={confirmerName}
                                onChange={(e) => setConfirmerName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleConfirm(entry)}
                                autoFocus
                              />
                              <button
                                className="btn btn-success btn-sm"
                                onClick={() => handleConfirm(entry)}
                                disabled={!confirmerName.trim()}
                              >
                                確認する
                              </button>
                              <button
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() => { setConfirmingId(null); setConfirmerName(''); }}
                              >
                                キャンセル
                              </button>
                            </div>
                          ) : (
                            <button
                              className="btn btn-outline-success btn-sm mt-1"
                              style={{ fontSize: '0.78rem' }}
                              onClick={() => setConfirmingId(entry.id)}
                            >
                              <i className="bi bi-check-circle me-1" />確認する
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="modal-footer py-2 d-flex align-items-center">
            {latestUnconfirmed && (
              <span className="me-auto" style={{ fontSize: '0.78rem', color: '#e65100' }}>
                <i className="bi bi-exclamation-circle me-1" />
                最新値が未確認です
              </span>
            )}
            <button className="btn btn-secondary btn-sm" onClick={onClose}>閉じる</button>
          </div>
        </div>
      </div>
    </div>
  );
};
