import { useRef, useState, useEffect } from "react";

export default function EnhancedJoystick({ onArrowClick, menuOpen, setMenuOpen, onCenterClick }) {
  const wheelRef = useRef(null);
  const draggingRef = useRef(false);
  const lastAngleRef = useRef(0);
  const angleAccumulatorRef = useRef(0);
  const [rotation, setRotation] = useState(0);

  const getAngle = (clientX, clientY) => {
    if (!wheelRef.current) return 0;
    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    return Math.atan2(deltaY, deltaX) * (180 / Math.PI);
  };

  const normalizeAngle = (angle) => {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    draggingRef.current = true;
    lastAngleRef.current = getAngle(e.clientX, e.clientY);
    angleAccumulatorRef.current = 0;
  };

  const handlePointerMove = (e) => {
    if (!draggingRef.current) return;

    const currentAngle = getAngle(e.clientX, e.clientY);
    const angleDelta = normalizeAngle(currentAngle - lastAngleRef.current);
    
    lastAngleRef.current = currentAngle;
    angleAccumulatorRef.current += angleDelta;
    
    setRotation((prev) => prev + angleDelta);

    const THRESHOLD = 20;

    if (angleAccumulatorRef.current > THRESHOLD) {
      if (onArrowClick) onArrowClick(1);
      angleAccumulatorRef.current = 0;
    } else if (angleAccumulatorRef.current < -THRESHOLD) {
      if (onArrowClick) onArrowClick(-1);
      angleAccumulatorRef.current = 0;
    }
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
    angleAccumulatorRef.current = 0;
  };

  useEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel) return;

    wheel.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      wheel.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [onArrowClick]);

  return (
    <div className="ipod-container">
      <div className="ipod-wheel" ref={wheelRef}>

      <button
  className="menu-btn"
  onClick={() => setMenuOpen(!menuOpen)}
  aria-label={menuOpen ? "Close menu" : "Open menu"}
>
  {menuOpen ? (
    <span className="menu-close">✕</span>
  ) : (
    <span className="menu-label">MENU</span>
  )}
</button>


        {/* <div
          className="wheel-ring"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div className="rotation-indicator" />
        </div> */}

        <button
          className="control-btn prev-btn"
          onClick={() => onArrowClick && onArrowClick(1)}
        >
          ◀◀
        </button>

        <button
          className="control-btn next-btn"
          onClick={() => onArrowClick && onArrowClick(-1)}
        >
          ▶▶
        </button>

        <button
          className="center-btn"
          onClick={() => onCenterClick && onCenterClick()}
        />
      </div>
    </div>
  );
}