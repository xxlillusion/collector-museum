import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useProgress } from '@react-three/drei';

// Helpers shared by Scene (museum) and VendorScene (convention hall).

/**
 * Shadow maps are rendered on demand (gl.shadowMap.autoUpdate = false in
 * onCreated) since the scenes are static — this saves a full shadow render
 * pass every frame. Re-render shadows for a while whenever `trigger` changes
 * (layout/textures streaming in).
 */
export function ShadowRefresh({ trigger }: { trigger: unknown }) {
  const { gl } = useThree();
  const frames = useRef(0);
  useEffect(() => {
    frames.current = 0;
  }, [trigger]);
  useFrame(() => {
    if (frames.current < 120) {
      gl.shadowMap.needsUpdate = true;
      frames.current++;
    }
  });
  return null;
}

/** DOM overlay shown while textures stream in (useProgress is a global store). */
export function LoadingOverlay({ label = 'LIGHTING THE GALLERY…' }: { label?: string }) {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0d0b0a',
      color: '#d4af37',
      fontFamily: 'Georgia, serif',
      letterSpacing: '0.1em',
      zIndex: 50,
      gap: '12px',
    }}>
      <div style={{ fontSize: '15px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: '#8a7a55' }}>{Math.round(progress)}%</div>
    </div>
  );
}
