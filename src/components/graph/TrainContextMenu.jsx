import { useEffect } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import './TrainContextMenu.css';

/**
 * Right-click menu on a train path.
 * - view mode / other train: "Edit train N"
 * - the train being edited: "Save changes" / "Cancel edit"
 */
export function TrainContextMenu({ menu, onClose, onEdit, onSave, onCancel, editingTrainNumber }) {
  useEffect(() => {
    if (!menu) return;
    const close = () => onClose();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  const isThisEditing = editingTrainNumber === menu.trainNumber;

  return (
    <div
      className="train-context-menu"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="tcm-title">Train {menu.trainNumber}</div>
      {isThisEditing ? (
        <>
          <button className="tcm-item" onClick={() => { onSave(); onClose(); }}>
            <Save size={13} /> Save changes
          </button>
          <button className="tcm-item" onClick={() => { onCancel(); onClose(); }}>
            <X size={13} /> Cancel edit
          </button>
        </>
      ) : (
        <button className="tcm-item" onClick={() => { onEdit(menu.trainNumber); onClose(); }}>
          <Pencil size={13} /> Edit train
        </button>
      )}
    </div>
  );
}