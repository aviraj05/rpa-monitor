/**
 * BootSequence.jsx
 * Terminal-style loading animation shown while the CSV is being fetched and parsed.
 * Exits via a fade-out once the first stream tick arrives.
 */

import { useEffect, useRef, useState } from 'react';

const BOOT_LINES = [
  { delay: 0,    type: 'prompt', text: 'rpa-ctl init --env=production' },
  { delay: 180,  type: 'ok',    text: 'System kernel loaded. Memory pool ready.' },
  { delay: 340,  type: 'info',  text: 'Connecting to telemetry pipeline...' },
  { delay: 550,  type: 'prompt',text: 'fetch ./automation_projects.csv' },
  { delay: 700,  type: 'info',  text: 'Transfer in progress — 9.4 MB baseline schema' },
  { delay: 1100, type: 'ok',    text: 'CSV schema validated. Parsing 50,000 RPA records...' },
  { delay: 1500, type: 'ok',    text: 'Memory pool indexed. Telemetry stream armed.' },
  { delay: 1750, type: 'info',  text: 'Starting 200ms high-frequency dispatch loop...' },
];

const ASCII_LOGO = `██████╗ ██████╗  █████╗      ██████╗████████╗██╗     
██╔══██╗██╔══██╗██╔══██╗    ██╔════╝╚══██╔══╝██║     
██████╔╝██████╔╝███████║    ██║        ██║   ██║     
██╔══██╗██╔═══╝ ██╔══██║    ██║        ██║   ██║     
██║  ██║██║     ██║  ██║    ╚██████╗   ██║   ███████╗
╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝     ╚═════╝   ╚═╝   ╚══════╝`;

export default function BootSequence({ onComplete, streamReady }) {
  const [visibleLines, setVisibleLines] = useState([]);
  const [progress, setProgress]         = useState(0);
  const [progressLabel, setProgressLabel] = useState('Initializing...');
  const [exiting, setExiting]           = useState(false);
  const timersRef = useRef([]);
  const exitedRef = useRef(false);

  useEffect(() => {
    // Schedule boot lines
    BOOT_LINES.forEach((line, i) => {
      const t = setTimeout(() => {
        setVisibleLines(prev => [...prev, line]);
      }, line.delay);
      timersRef.current.push(t);
    });

    // Animate progress bar
    const steps = [
      { at: 100,  pct: 15,  label: 'Loading CSV schema...' },
      { at: 400,  pct: 35,  label: 'Fetching 9.4 MB dataset...' },
      { at: 800,  pct: 60,  label: 'Parsing records...' },
      { at: 1200, pct: 80,  label: 'Indexing memory pool...' },
      { at: 1600, pct: 92,  label: 'Arming stream...' },
    ];
    steps.forEach(({ at, pct, label }) => {
      const t = setTimeout(() => {
        setProgress(pct);
        setProgressLabel(label);
      }, at);
      timersRef.current.push(t);
    });

    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  // Exit when stream becomes ready
  useEffect(() => {
    if (streamReady && !exitedRef.current) {
      exitedRef.current = true;
      setProgress(100);
      setProgressLabel('Stream LIVE ✓');
      const t = setTimeout(() => {
        setExiting(true);
        const t2 = setTimeout(onComplete, 520);
        timersRef.current.push(t2);
      }, 600);
      timersRef.current.push(t);
    }
  }, [streamReady, onComplete]);

  return (
    <div className={`boot-overlay${exiting ? ' exiting' : ''}`}>
      <div className="boot-terminal">
        {/* Title bar */}
        <div className="boot-terminal-bar">
          <div className="boot-dot boot-dot-r" />
          <div className="boot-dot boot-dot-y" />
          <div className="boot-dot boot-dot-g" />
          <span className="boot-title">rpa-control-terminal — bash</span>
        </div>

        {/* Body */}
        <div className="boot-body">
          <div className="boot-logo-ascii">
            <pre style={{ fontSize: 8, lineHeight: 1.2 }}>{ASCII_LOGO}</pre>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              Enterprise RPA Control Terminal v2.0
            </div>
          </div>

          {visibleLines.map((line, i) => (
            <div
              key={i}
              className="boot-line"
              style={{ animationDelay: '0ms' }}
            >
              {line.type === 'prompt' && (
                <>
                  <span className="boot-prompt">$</span>
                  <span className="boot-text">{line.text}</span>
                </>
              )}
              {line.type === 'ok' && (
                <>
                  <span className="boot-ok">✓</span>
                  <span className="boot-text">{line.text}</span>
                </>
              )}
              {line.type === 'info' && (
                <>
                  <span className="boot-info">→</span>
                  <span className="boot-text">{line.text}</span>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="boot-progress-wrap">
          <div className="boot-progress-label">{progressLabel}</div>
          <div className="loading-bar">
            <div
              className="loading-bar-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
