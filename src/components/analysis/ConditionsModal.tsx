import React, { useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { MassModel } from '../massCase/MassModel';

/**
 * 機体諸元（条件設定）をフロー画面上で編集するためのフルスクリーンモーダル。
 * 画面遷移せずに MassModel エディタをそのまま開く。
 * MassModel は appStore の massCaseId / projectId を参照するため、
 * マウント時にそれらをセットする（view は変更しない）。
 */
export const ConditionsModal: React.FC<{
  projectId: string;
  massCaseId: string;
  title: string;
  onClose: () => void;
}> = ({ projectId, massCaseId, title, onClose }) => {
  useEffect(() => {
    // view を変えずにコンテキストのみセット（フロー画面に留まったまま編集）
    useAppStore.setState({ projectId, massCaseId });
  }, [projectId, massCaseId]);

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-fullscreen">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h5 className="modal-title">
              <i className="bi bi-box-seam me-2 text-primary" />{title}
              <small className="text-muted ms-2" style={{ fontSize: '0.8rem' }}>機体諸元（このフェーズ共通の条件設定）</small>
            </h5>
            <button className="btn btn-primary btn-sm" onClick={onClose}>
              <i className="bi bi-check-lg me-1" />設定を終える
            </button>
          </div>
          <div className="modal-body" style={{ overflow: 'auto' }}>
            <MassModel />
          </div>
        </div>
      </div>
    </div>
  );
};
