import { useState } from 'react';

interface Props {
  itemName: string;
  description?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({ itemName, description, onConfirm, onCancel }: Props) {
  const [input, setInput] = useState('');

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="modal-dialog modal-sm">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title text-danger">削除の確認</h5>
            <button className="btn-close" onClick={onCancel} />
          </div>
          <div className="modal-body">
            <p className="mb-1">
              <strong>{itemName}</strong> を削除します。
            </p>
            {description && (
              <p className="mb-2">
                <small className="text-muted">{description}</small>
              </p>
            )}
            <p className="mb-1 small">確認のため <code>delete</code> と入力してください。</p>
            <input
              type="text"
              className="form-control form-control-sm"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="delete"
              autoFocus
            />
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary btn-sm" onClick={onCancel}>
              キャンセル
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={onConfirm}
              disabled={input !== 'delete'}
            >
              削除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
