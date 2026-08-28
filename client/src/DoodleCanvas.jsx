import { useRef, useState, useEffect } from "react";

const COLORS = ["#e63950", "#ffffff", "#000000", "#ffb703", "#2a9d8f", "#3a86ff"];

export default function DoodleCanvas({ onSend, onClose, sending }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(6);

  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      const parent = canvas.parentElement;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#1a0a0f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  };

  const draw = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };

  const stopDraw = () => {
    drawing.current = false;
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1a0a0f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const handleSend = () => {
    canvasRef.current.toBlob((blob) => {
      if (blob) onSend(blob);
    }, "image/png");
  };

  return (
    <div className="doodle-overlay">
      <div className="doodle-header">
        <button onClick={onClose} className="doodle-close">✕</button>
        <span className="doodle-title">Doodle</span>
        <button onClick={handleClear} className="doodle-clear">Clear</button>
      </div>
      <div className="doodle-canvas-wrap">
        <canvas
          ref={canvasRef}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
      </div>
      <div className="doodle-controls">
        <div className="doodle-colors">
          {COLORS.map((c) => (
            <span
              key={c}
              className={`doodle-swatch ${color === c ? "active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <input
          type="range"
          min="2"
          max="24"
          value={lineWidth}
          onChange={(e) => setLineWidth(Number(e.target.value))}
          className="doodle-width"
        />
        <button onClick={handleSend} disabled={sending} className="doodle-send">
          {sending ? "Sending..." : "Send 💌"}
        </button>
      </div>
    </div>
  );
}
