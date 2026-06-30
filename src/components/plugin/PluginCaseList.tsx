import React, { useMemo, useRef, useState } from 'react';
import { usePluginStore, extractManifestFromSource } from '../../stores/pluginStore';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import { useMassCaseStore } from '../../stores/massCaseStore';
import type { PluginManifest } from '../../types/plugin';

/**
 * カスタム解析ケース 一覧画面。
 * 他解析 (荷重解析 等) と同じ「一覧 + 新規作成ボタン + 新規モーダル」 UX。
 */
export const PluginCaseList: React.FC = () => {
  const cases = usePluginStore((s) => s.cases);
  const plugins = usePluginStore((s) => s.plugins);
  const addPlugin = usePluginStore((s) => s.addPlugin);
  const addCase = usePluginStore((s) => s.addCase);
  const deleteCase = usePluginStore((s) => s.deleteCase);
  const navigate = useAppStore((s) => s.navigate);

  const projects = useProjectStore((s) => s.projects);
  const rawCases = useMassCaseStore((s) => s.cases);

  const [search, setSearch] = useState('');
  const [filterProjectId, setFilterProjectId] = useState<string>('');
  const [showModal, setShowModal] = useState(false);

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (filterProjectId && c.projectId !== filterProjectId) return false;
      if (q && !c.name.toLowerCase().includes(q) && !(c.createdBy ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cases, search, filterProjectId]);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '—';
  const massCaseName = (id: string) => rawCases.find((c) => c.id === id)?.name ?? '—';
  const pluginName = (id: string) => plugins.find((p) => p.id === id)?.manifest.name ?? '(削除済)';

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title">
          <i className="bi bi-puzzle me-2 text-primary" />カスタム解析
        </h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
          <i className="bi bi-plus-lg me-1" />新規作成
        </button>
      </div>

      <div className="card p-3 mb-3">
        <div className="row g-2 align-items-center">
          <div className="col-auto">
            <select
              className="form-select form-select-sm"
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
            >
              <option value="">すべてのプロジェクト</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="col">
            <div className="input-group input-group-sm">
              <span className="input-group-text"><i className="bi bi-search" /></span>
              <input
                className="form-control"
                placeholder="ケース名・作成者で検索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="col-auto">
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>{filteredCases.length} 件</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>ケース名</th>
                <th>プロジェクト</th>
                <th>参照ロケットDB</th>
                <th>プラグイン</th>
                <th>メモ</th>
                <th>作成者</th>
                <th className="text-center">実行回数</th>
                <th>作成日</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredCases.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-muted py-4">
                  <i className="bi bi-puzzle fs-3 d-block mb-2 opacity-25" />
                  <div>ケースがありません。「新規作成」 から追加してください</div>
                </td></tr>
              ) : (
                filteredCases.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate('pluginCondition', { pluginCaseId: c.id })}>
                    <td>
                      <i className="bi bi-puzzle text-primary me-1" />
                      <a href="#" className="text-decoration-none" onClick={(e) => e.preventDefault()}>{c.name}</a>
                    </td>
                    <td><span className="badge bg-primary-subtle text-primary">{projectName(c.projectId)}</span></td>
                    <td><span className="badge bg-secondary-subtle text-secondary">{massCaseName(c.massCaseId)}</span></td>
                    <td>{pluginName(c.pluginId)}</td>
                    <td className="text-muted text-truncate" style={{ maxWidth: 200, fontSize: '0.85rem' }}>{c.memo || '—'}</td>
                    <td>{c.createdBy || '—'}</td>
                    <td className="text-center">
                      <span className={`badge ${c.results.length > 0 ? 'bg-success' : 'bg-secondary'}`}>{c.results.length}</span>
                    </td>
                    <td className="text-muted" style={{ whiteSpace: 'nowrap', fontSize: '0.83rem' }}>
                      {new Date(c.createdAt).toLocaleDateString('ja-JP')}
                    </td>
                    <td className="text-end">
                      <button
                        className="btn btn-sm btn-outline-danger p-0 px-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`「${c.name}」を削除しますか？`)) deleteCase(c.id);
                        }}
                        title="削除"
                      ><i className="bi bi-trash" /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <NewPluginCaseModal
          onClose={() => setShowModal(false)}
          onCreated={(caseId) => {
            setShowModal(false);
            navigate('pluginCondition', { pluginCaseId: caseId });
          }}
          plugins={plugins}
          projects={projects}
          massCases={rawCases}
          onAddPlugin={(fileName, source, manifest) => addPlugin(fileName, source, manifest)}
          onAddCase={addCase}
        />
      )}
    </div>
  );
};

// ─── 新規作成モーダル ─────────────────────────────────────

const NewPluginCaseModal: React.FC<{
  onClose: () => void;
  onCreated: (caseId: string) => void;
  plugins: ReturnType<typeof usePluginStore.getState>['plugins'];
  projects: { id: string; name: string }[];
  massCases: { id: string; name: string; projectId: string }[];
  onAddPlugin: (fileName: string, source: string, manifest: PluginManifest) => { id: string };
  onAddCase: ReturnType<typeof usePluginStore.getState>['addCase'];
}> = ({ onClose, onCreated, plugins, projects, massCases, onAddPlugin, onAddCase }) => {
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [massCaseId, setMassCaseId] = useState('');
  const [pluginId, setPluginId] = useState('');
  const [memo, setMemo] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredMassCases = useMemo(
    () => massCases.filter((m) => m.projectId === projectId),
    [massCases, projectId]
  );
  const selectedPlugin = plugins.find((p) => p.id === pluginId) ?? null;

  // プラグイン選択が変わったらパラメータ初期値を流し込む
  React.useEffect(() => {
    if (selectedPlugin) {
      const initial: Record<string, unknown> = {};
      for (const p of selectedPlugin.manifest.parameters) {
        if (p.default !== undefined) initial[p.name] = p.default;
      }
      setParamValues(initial);
    } else {
      setParamValues({});
    }
  }, [pluginId, selectedPlugin]);

  const handleFileUpload = async (file: File) => {
    setUploadError(null);
    if (!/\.(m?js)$/i.test(file.name)) {
      if (/\.py$/i.test(file.name)) {
        setUploadError('Python (.py) は近日対応予定です。今は .js / .mjs のみ受け付けます。');
      } else {
        setUploadError('.js または .mjs ファイルを選択してください');
      }
      return;
    }
    try {
      const source = await file.text();
      const manifest = await extractManifestFromSource(source);
      const p = onAddPlugin(file.name, source, manifest);
      setPluginId(p.id);
    } catch (err) {
      setUploadError(`プラグイン登録失敗: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const canSubmit = !!(name.trim() && projectId && massCaseId && pluginId);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const c = onAddCase({
      name: name.trim(),
      projectId, massCaseId, pluginId,
      paramValues,
      memo: memo.trim(),
      createdBy: createdBy.trim(),
    });
    onCreated(c.id);
  };

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1060 }} onClick={onClose}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-puzzle me-2" />新規カスタム解析
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <div className="mb-3">
              <label className="form-label fw-medium">ケース名 <span className="text-danger">*</span></label>
              <input
                className="form-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 重心マージン検討 #1"
              />
            </div>

            <div className="mb-3">
              <label className="form-label fw-medium">プロジェクト <span className="text-danger">*</span></label>
              <select
                className="form-select"
                value={projectId}
                onChange={(e) => { setProjectId(e.target.value); setMassCaseId(''); }}
              >
                <option value="">— 選択してください —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label fw-medium">参照ロケットDB <span className="text-danger">*</span></label>
              <select
                className="form-select"
                value={massCaseId}
                onChange={(e) => setMassCaseId(e.target.value)}
                disabled={!projectId}
              >
                <option value="">— 選択してください —</option>
                {filteredMassCases.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {projectId && filteredMassCases.length === 0 && (
                <div className="form-text text-warning">
                  <i className="bi bi-exclamation-triangle me-1" />このプロジェクトにロケットDBがありません
                </div>
              )}
            </div>

            <div className="mb-3">
              <label className="form-label fw-medium">プラグイン <span className="text-danger">*</span></label>
              <div className="row g-2">
                <div className="col">
                  <select
                    className="form-select"
                    value={pluginId}
                    onChange={(e) => setPluginId(e.target.value)}
                  >
                    <option value="">— 登録済から選択 —</option>
                    {plugins.map((p) => (
                      <option key={p.id} value={p.id}>{p.manifest.name} ({p.fileName})</option>
                    ))}
                  </select>
                </div>
                <div className="col-auto">
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <i className="bi bi-upload me-1" />新規取り込み
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".js,.mjs,.py"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  />
                </div>
              </div>
              {uploadError && (
                <div className="alert alert-danger py-2 px-3 mt-2 mb-0" style={{ fontSize: '0.82rem' }}>
                  <i className="bi bi-exclamation-triangle me-1" />{uploadError}
                </div>
              )}
              {selectedPlugin && selectedPlugin.manifest.description && (
                <div className="form-text">{selectedPlugin.manifest.description}</div>
              )}
            </div>

            {/* パラメータ初期値 (任意。後で条件画面で変更可能) */}
            {selectedPlugin && selectedPlugin.manifest.parameters.length > 0 && (
              <div className="mb-3 border-top pt-3">
                <label className="form-label fw-medium">初期パラメータ <span className="text-muted fw-normal" style={{ fontSize: '0.78rem' }}>(後で変更可)</span></label>
                {selectedPlugin.manifest.parameters.map((p) => (
                  <div key={p.name} className="mb-2">
                    <label className="form-label" style={{ fontSize: '0.85rem' }}>
                      {p.label || p.name}
                      {p.unit && <span className="text-muted ms-1 fw-normal">({p.unit})</span>}
                    </label>
                    {p.type === 'number' && (
                      <input
                        type="number" step="any" className="form-control form-control-sm"
                        value={(paramValues[p.name] as number) ?? ''}
                        onChange={(e) => setParamValues((prev) => ({ ...prev, [p.name]: e.target.value === '' ? null : Number(e.target.value) }))}
                      />
                    )}
                    {p.type === 'string' && (
                      <input
                        type="text" className="form-control form-control-sm"
                        value={(paramValues[p.name] as string) ?? ''}
                        onChange={(e) => setParamValues((prev) => ({ ...prev, [p.name]: e.target.value }))}
                      />
                    )}
                    {p.type === 'boolean' && (
                      <div className="form-check">
                        <input
                          type="checkbox" className="form-check-input"
                          checked={!!paramValues[p.name]}
                          onChange={(e) => setParamValues((prev) => ({ ...prev, [p.name]: e.target.checked }))}
                        />
                      </div>
                    )}
                    {p.type === 'select' && (
                      <select
                        className="form-select form-select-sm"
                        value={(paramValues[p.name] as string) ?? ''}
                        onChange={(e) => setParamValues((prev) => ({ ...prev, [p.name]: e.target.value }))}
                      >
                        <option value="">(選択)</option>
                        {p.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mb-3">
              <label className="form-label fw-medium">作成者</label>
              <input
                className="form-control" value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                placeholder="例: 山田太郎"
              />
            </div>

            <div className="mb-0">
              <label className="form-label fw-medium">メモ</label>
              <textarea
                className="form-control" rows={2} value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="例: 安全率 1.5 で再計算"
              />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>キャンセル</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
              <i className="bi bi-plus-lg me-1" />作成して実行画面へ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
