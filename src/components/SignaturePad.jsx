import { useRef } from "react";

// Hand-rolled signature pad — no library needed for a single canvas.
// Shared by CreateBolModal.jsx (driver, pickup) and CompleteDeliveryModal.jsx
// (receiver, delivery).
export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  const getPoint = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches?.[0];
    return { x: (t?.clientX ?? e.clientX) - rect.left, y: (t?.clientY ?? e.clientY) - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getPoint(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getPoint(e, canvas);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onChange(canvasRef.current.toDataURL());
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400}
        height={140}
        className="w-full bg-white rounded-lg border border-gray-700 touch-none"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <button type="button" onClick={clear} className="mt-1 text-xs text-gray-400 hover:text-gray-200">Clear signature</button>
    </div>
  );
}
