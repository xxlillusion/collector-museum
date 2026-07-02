import { useEffect, useRef } from 'react';
import { create as createJoystick } from 'nipplejs';
import { mobileInput, mobileLook, isTouchDevice } from './GalleryControls';

export default function MobileControls() {
  const joystickRef = useRef<HTMLDivElement>(null);

  // Joystick (bottom-left) → movement
  useEffect(() => {
    if (!isTouchDevice || !joystickRef.current) return;

    const manager = createJoystick({
      zone: joystickRef.current,
      mode: 'static',
      position: { left: '70px', bottom: '70px' },
      color: 'rgba(255,255,255,0.5)',
      size: 110,
    });

    manager.on('move', (evt) => {
      const { vector } = evt.data;
      if (!vector) return;
      mobileInput.x = vector.x;
      mobileInput.z = -vector.y; // nipplejs Y is up-positive
    });

    manager.on('end', () => {
      mobileInput.x = 0;
      mobileInput.z = 0;
    });

    return () => {
      manager.destroy();
      mobileInput.x = 0;
      mobileInput.z = 0;
    };
  }, []);

  // Touch-drag anywhere outside the joystick → camera look.
  // Listeners are on window so taps still reach the canvas for card clicks.
  useEffect(() => {
    if (!isTouchDevice) return;

    let touchId: number | null = null;
    let lastX = 0;
    let lastY = 0;

    const inJoystickZone = (x: number, y: number) =>
      x < 180 && y > window.innerHeight - 180;

    const onStart = (e: TouchEvent) => {
      if (touchId !== null) return;
      const t = e.changedTouches[0];
      if (inJoystickZone(t.clientX, t.clientY)) return;
      touchId = t.identifier;
      lastX = t.clientX;
      lastY = t.clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (touchId === null) return;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== touchId) continue;
        mobileLook.dx += t.clientX - lastX;
        mobileLook.dy += t.clientY - lastY;
        lastX = t.clientX;
        lastY = t.clientY;
      }
    };

    const onEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === touchId) touchId = null;
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  if (!isTouchDevice) return null;

  return (
    <div
      ref={joystickRef}
      style={{
        position: 'fixed',
        left: 0,
        bottom: 0,
        width: '180px',
        height: '180px',
        zIndex: 20,
      }}
    />
  );
}
