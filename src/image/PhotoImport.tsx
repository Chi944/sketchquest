import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import type { Interpretation } from '../core/types';
import { interpretPhoto, PhotoApiError } from './api';
import { FULL_CROP, orientedDimensions, type CropBounds, type QuarterTurn } from './geometry';
import {
  canvasBlob,
  loadPhoto,
  PHOTO_ACCEPT,
  preparePhoto,
  renderPhoto,
  type LoadedPhoto,
} from './prepare';
import styles from './PhotoImport.module.css';

export interface PhotoImportResult {
  requestId: string;
  interpretation: Interpretation;
  /** Ownership transfers to the caller, which must revoke this URL when review ends. */
  previewUrl: string;
  metrics: { latencyMs: number };
}
export interface PhotoImportProps {
  onResult: (value: PhotoImportResult) => void;
  onClose: () => void;
  aiEnabled: boolean;
}

export function PhotoImport({ onResult, onClose, aiEnabled }: PhotoImportProps) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const photoRef = useRef<LoadedPhoto | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const versionRef = useRef(0);
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState<QuarterTurn>(0);
  const [crop, setCrop] = useState<CropBounds>({ ...FULL_CROP });
  const [specifyGrid, setSpecifyGrid] = useState(false);
  const [width, setWidth] = useState(6);
  const [height, setHeight] = useState(6);
  const [legend, setLegend] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  function cancelPending() {
    versionRef.current++;
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
    setLoading(false);
    setStatus('');
  }
  function changeInput(update: () => void) {
    cancelPending();
    setError(null);
    update();
  }
  function close() {
    cancelPending();
    onClose();
  }

  useEffect(
    () => () => {
      versionRef.current++;
      requestRef.current?.abort();
      photoRef.current?.dispose();
      photoRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!aiEnabled) {
      versionRef.current++;
      requestRef.current?.abort();
      requestRef.current = null;
      setBusy(false);
      setLoading(false);
      setStatus('');
    }
  }, [aiEnabled]);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setPreviewUrl(null);
    if (photo) {
      let canvas: HTMLCanvasElement | null = null;
      try {
        canvas = renderPhoto(photo, FULL_CROP, rotation);
        void canvasBlob(canvas)
          .then((blob) => {
            if (cancelled) return;
            url = URL.createObjectURL(blob);
            setPreviewUrl(url);
          })
          .catch((reason) => {
            if (!cancelled)
              setError(
                reason instanceof Error ? reason.message : 'The preview could not be prepared.',
              );
          })
          .finally(() => {
            if (canvas) {
              canvas.width = 0;
              canvas.height = 0;
            }
          });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'The preview could not be prepared.');
      }
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo, rotation]);

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    cancelPending();
    const version = versionRef.current;
    setError(null);
    setLoading(true);
    setStatus('Opening your photo on this device…');
    try {
      const next = await loadPhoto(file);
      if (version !== versionRef.current) {
        next.dispose();
        return;
      }
      photoRef.current?.dispose();
      photoRef.current = next;
      setPhoto(next);
      setRotation(0);
      setCrop({ ...FULL_CROP });
      setSpecifyGrid(false);
      setLegend('');
      setStatus('Photo ready. Crop to your puzzle, then choose Interpret photo.');
    } catch (reason) {
      if (version === versionRef.current) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'This photo could not be opened. Choose another image.',
        );
        setStatus('');
      }
    } finally {
      if (version === versionRef.current) setLoading(false);
    }
  }

  async function interpret() {
    const source = photoRef.current;
    if (!source || !aiEnabled || loading || busy) return;
    cancelPending();
    const version = versionRef.current;
    const controller = new AbortController();
    requestRef.current = controller;
    const requestId = crypto.randomUUID();
    const started = performance.now();
    setError(null);
    setBusy(true);
    setStatus('Preparing your cropped photo…');
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resultUrl: string | null = null;
    try {
      const image = await preparePhoto(source, crop, rotation);
      if (version !== versionRef.current || controller.signal.aborted) return;
      setStatus('Reading your sketch. You’ll review the board before accepting it.');
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 45_000);
      const result = await interpretPhoto({
        image,
        requestId,
        grid: specifyGrid ? { width, height } : undefined,
        legend,
        signal: controller.signal,
      });
      if (version !== versionRef.current || controller.signal.aborted) return;
      resultUrl = URL.createObjectURL(image);
      onResult({
        ...result,
        previewUrl: resultUrl,
        metrics: { latencyMs: Math.round(performance.now() - started) },
      });
      resultUrl = null; // The reviewer now owns the sanitized crop's object URL.
      setStatus('Your interpretation is ready to review.');
    } catch (reason) {
      if (version !== versionRef.current) return;
      if (timedOut)
        setError(
          'This interpretation took too long. Your photo is still here; try again or build the board manually.',
        );
      else if (!controller.signal.aborted) {
        const message =
          reason instanceof Error
            ? reason.message
            : 'The photo could not be interpreted. Try again or build the board manually.';
        const retry =
          reason instanceof PhotoApiError && reason.retryAfter && reason.retryAfter > 0
            ? ` Try again in about ${Math.ceil(reason.retryAfter)} seconds.`
            : '';
        setError(message + retry);
      }
      setStatus('');
    } finally {
      if (timer) clearTimeout(timer);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      if (version === versionRef.current) {
        requestRef.current = null;
        setBusy(false);
      }
    }
  }

  const dimensions = photo ? orientedDimensions(photo.width, photo.height, rotation) : null;
  const cropStyle = {
    left: `${crop.left * 100}%`,
    top: `${crop.top * 100}%`,
    width: `${(crop.right - crop.left) * 100}%`,
    height: `${(crop.bottom - crop.top) * 100}%`,
  };
  const cropControls: { key: keyof CropBounds; name: string; min: number; max: number }[] = [
    { key: 'left', name: 'Left edge', min: 0, max: Math.round(crop.right * 100) - 5 },
    { key: 'right', name: 'Right edge', min: Math.round(crop.left * 100) + 5, max: 100 },
    { key: 'top', name: 'Top edge', min: 0, max: Math.round(crop.bottom * 100) - 5 },
    { key: 'bottom', name: 'Bottom edge', min: Math.round(crop.top * 100) + 5, max: 100 },
  ];

  return (
    <section className={styles.root} aria-labelledby={`${id}-title`}>
      <header className={styles.header}>
        <div>
          <h2 id={`${id}-title`}>From paper to puzzle</h2>
          <p>Bring a sketch. We’ll work out the grid together.</p>
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={close}
          aria-label="Close photo import"
        >
          ×
        </button>
      </header>

      {!aiEnabled && (
        <div className={styles.unavailable} role="status">
          <strong>Photo interpretation is unavailable right now.</strong> You can still create every
          part of your puzzle with the manual editor.{' '}
          <button type="button" onClick={close}>
            Open the manual editor
          </button>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept={PHOTO_ACCEPT}
        className={styles.fileInput}
        aria-label="Choose puzzle photo"
        onChange={selectPhoto}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className={styles.fileInput}
        aria-label="Take a puzzle photo"
        onChange={selectPhoto}
      />

      <div className={photo ? styles.workspace : styles.emptyWorkspace}>
        <div className={styles.imageColumn}>
          {photo && dimensions ? (
            <>
              <div className={styles.previewArea}>
                <div className={styles.photoFrame}>
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={`Your puzzle photo, ${photo.name}`}
                      draggable={false}
                    />
                  ) : (
                    <span className={styles.previewLoading}>Preparing preview…</span>
                  )}
                  {previewUrl && (
                    <div className={styles.cropWindow} style={cropStyle} aria-hidden="true">
                      {specifyGrid && (
                        <div
                          className={styles.grid}
                          style={{
                            gridTemplateColumns: `repeat(${width}, 1fr)`,
                            gridTemplateRows: `repeat(${height}, 1fr)`,
                          }}
                        >
                          {Array.from({ length: width * height }, (_, cell) => (
                            <span key={cell} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.photoTools}>
                <span className={styles.filename} title={photo.name}>
                  {photo.name}
                </span>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    changeInput(() => {
                      setRotation(((rotation + 1) % 4) as QuarterTurn);
                      setCrop({ ...FULL_CROP });
                    })
                  }
                  aria-label="Rotate photo clockwise 90 degrees"
                >
                  ↻ <span>Rotate</span>
                </button>
                <button type="button" onClick={() => fileInput.current?.click()}>
                  Change photo
                </button>
              </div>
              <p className={styles.cropHint}>
                Only the area inside the blue frame will be sent. The grid is a guide and won’t
                appear in your upload.
              </p>
            </>
          ) : (
            <div className={styles.empty}>
              <div className={styles.sketch} aria-hidden="true">
                <svg viewBox="0 0 120 100" fill="none">
                  <path d="M14 8 106 12 103 91 11 87Z" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="m14 35 91 3M12 61l92 3M44 9l-2 79M74 11l-2 79"
                    stroke="currentColor"
                    strokeWidth="1"
                    opacity=".25"
                  />
                  <circle cx="28" cy="23" r="7" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="m48 43 16 1-1 14-15-1ZM82 69h13v14H81ZM50 71l8 10 8-10M82 21h14M89 14v14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3>A pencil sketch is a good start.</h3>
              <p>
                Loose drawings welcome. Include a player and an exit; review any uncertain marks
                afterward.
              </p>
              <div className={styles.chooseButtons}>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => fileInput.current?.click()}
                  disabled={loading}
                >
                  Choose a photo
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => cameraInput.current?.click()}
                  disabled={loading}
                >
                  Take a photo
                </button>
              </div>
              <small>JPEG, PNG, WebP or HEIC · up to 15 MB</small>
            </div>
          )}
        </div>

        {photo && (
          <aside className={styles.adjustments} aria-label="Adjust your photo">
            <fieldset className={styles.cropControls} disabled={loading}>
              <legend>Frame your puzzle</legend>
              <p>Leave a little space around the outside walls.</p>
              {cropControls.map((control) => (
                <label
                  key={control.key}
                  htmlFor={`${id}-${control.key}`}
                  className={styles.sliderLabel}
                >
                  <span>
                    {control.name}
                    <output htmlFor={`${id}-${control.key}`}>
                      {Math.round(crop[control.key] * 100)}%
                    </output>
                  </span>
                  <input
                    id={`${id}-${control.key}`}
                    type="range"
                    min={control.min}
                    max={control.max}
                    step="1"
                    value={Math.round(crop[control.key] * 100)}
                    onChange={(event) =>
                      changeInput(() =>
                        setCrop((previous) => ({
                          ...previous,
                          [control.key]: Number(event.target.value) / 100,
                        })),
                      )
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                className={styles.textButton}
                onClick={() => changeInput(() => setCrop({ ...FULL_CROP }))}
              >
                Reset crop
              </button>
            </fieldset>

            <fieldset className={styles.gridControls} disabled={loading}>
              <legend>Grid size</legend>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={specifyGrid}
                  onChange={(event) => changeInput(() => setSpecifyGrid(event.target.checked))}
                />{' '}
                I know the grid size
              </label>
              {specifyGrid ? (
                <div className={styles.gridDimensions}>
                  <label>
                    Columns
                    <select
                      aria-label="Grid columns"
                      value={width}
                      onChange={(event) => changeInput(() => setWidth(Number(event.target.value)))}
                    >
                      {[4, 5, 6, 7, 8].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <span aria-hidden="true">×</span>
                  <label>
                    Rows
                    <select
                      aria-label="Grid rows"
                      value={height}
                      onChange={(event) => changeInput(() => setHeight(Number(event.target.value)))}
                    >
                      {[4, 5, 6, 7, 8].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <p>We’ll suggest a size from 4×4 to 8×8. You can correct it before playing.</p>
              )}
            </fieldset>

            <label className={styles.legendLabel} htmlFor={`${id}-legend`}>
              What do your marks mean? <span>Optional</span>
              <textarea
                id={`${id}-legend`}
                value={legend}
                maxLength={600}
                rows={3}
                placeholder="e.g. the star is the exit; the small square is a crate"
                onChange={(event) => changeInput(() => setLegend(event.target.value))}
              />
              <small>{legend.length}/600</small>
            </label>
          </aside>
        )}
      </div>

      <div className={styles.feedback}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <p className={styles.status} role="status" aria-live="polite">
          {status}
        </p>
      </div>
      <footer className={styles.footer}>
        <p className={styles.privacy}>
          Choosing a photo stays on this device. Interpret sends only your cropped image to
          Cloudflare for processing. Photos are never included in shared puzzles. Keep personal
          information out of the frame.
        </p>
        <div className={styles.footerActions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={
              busy
                ? () => {
                    cancelPending();
                    setStatus('Interpretation cancelled. Your photo is still here.');
                  }
                : close
            }
          >
            {busy ? 'Cancel interpretation' : 'Back to editor'}
          </button>
          {photo && (
            <button
              type="button"
              className={styles.primary}
              disabled={!aiEnabled || loading || busy || !previewUrl}
              onClick={interpret}
            >
              {busy ? 'Reading your sketch…' : 'Interpret photo'}
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}

export default PhotoImport;
