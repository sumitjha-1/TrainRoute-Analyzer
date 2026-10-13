import { useRef, useState } from 'react';
import { UploadCloud, CheckCircle2, AlertTriangle, FileSpreadsheet, X, Loader2 } from 'lucide-react';
import './FileUploadCard.css';

const ACCEPTED = '.csv,.txt,.xlsx,.xls';
const MAX_SIZE_MB = 15;

export function FileUploadCard({ title, description, fileState, onFile, onClear }) {
  const inputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const { file, status, issues } = fileState;

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  function handleFiles(fileList) {
    const f = fileList?.[0];
    if (!f) return;
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      onFile(null, `File exceeds ${MAX_SIZE_MB}MB limit.`);
      return;
    }
    onFile(f);
  }

  return (
    <div className={`upload-card status-${status}`}>
      <div className="upload-card-head">
        <div>
          <div className="upload-card-title">{title}</div>
          <div className="upload-card-desc">{description}</div>
        </div>
        {file && (
          <button className="upload-clear-btn" onClick={onClear} title="Remove file">
            <X size={14} />
          </button>
        )}
      </div>

      {!file ? (
        <div
          className={`dropzone ${isDragOver ? 'is-dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <UploadCloud size={22} />
          <div className="dropzone-text">
            <strong>Click to upload</strong> or drag and drop
          </div>
          <div className="dropzone-hint">.csv, .txt, .xlsx, .xls — up to {MAX_SIZE_MB}MB</div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      ) : (
        <div className="file-summary">
          <div className="file-summary-icon">
            {status === 'loading' && <Loader2 size={18} className="spin" />}
            {status === 'success' && <CheckCircle2 size={18} color="var(--success)" />}
            {status === 'error' && <AlertTriangle size={18} color="var(--danger)" />}
            {status === 'empty' && <FileSpreadsheet size={18} />}
          </div>
          <div className="file-summary-info">
            <div className="file-summary-name">{file.name}</div>
            <div className="file-summary-meta">
              {formatSize(file.size)} · {status === 'loading' ? 'Parsing…' : status === 'success' ? 'Loaded' : status === 'error' ? 'Failed' : ''}
              {warnings.length > 0 && status === 'success' && ` · ${warnings.length} warning${warnings.length > 1 ? 's' : ''}`}
            </div>
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="issue-list issue-error">
          {errors.slice(0, 4).map((e, i) => (
            <div key={i} className="issue-row">{e.message}</div>
          ))}
          {errors.length > 4 && <div className="issue-row issue-more">+{errors.length - 4} more — see validation panel</div>}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
