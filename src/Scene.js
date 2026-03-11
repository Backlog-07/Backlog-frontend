import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, OrbitControls } from "@react-three/drei";
import EnhancedProduct from "./EnhancedProduct";
import Particles from "./Particles";
import { Suspense } from "react";
import * as THREE from "three";

/* Camera Controller */
function CameraController() {
  const { camera, mouse } = useThree();

  useFrame(() => {
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, mouse.x * 0.5, 0.03);
    camera.position.y = THREE.MathUtils.lerp(
      camera.position.y,
      1.6 + mouse.y * 0.3,
      0.03
    );
    camera.lookAt(0, 0, 0);
  });

  return null;
}

/* Wrap helper */
function wrap(value, range) {
  const half = range / 2;
  return ((((value + half) % range) + range) % range) - half;
}

// Base spacing between items in world units.
// Computed dynamically from viewport so the centered item snaps perfectly on any screen.
function getDynamicItemWidth() {
  if (typeof window === 'undefined') return 1.75;
  const w = window.innerWidth || 1024;
  // Slightly tighter on small screens, a bit wider on large screens.
  return THREE.MathUtils.clamp(1.55 + (w / 1400) * 0.25, 1.55, 1.85);
}

export default function Scene({ 
  offset = 0, 
  products = [], 
  onSelect, 
  isPreview = false,
  forceCentered = false,
  interactive = false,
  previewCamera
}) {
  const count = products.length;

  // Dynamic spacing so snap-to-center is consistent across screens
  const itemWidth = getDynamicItemWidth();
  const totalWidth = count * itemWidth;

  if (count === 0) {
    return (
      <Canvas
        camera={{ position: [0, 1.6, 7], fov: 35 }}
        gl={{ 
          powerPreference: "high-performance",
          antialias: false,
          alpha: true,
          stencil: false,
          depth: true,
          clearColor: 0x000000,
          clearAlpha: 0,
        }}
        style={{
          background: "transparent",
        }}
      />
    );
  }

  return (
    <Canvas
    frameloop="always"
    camera={
      previewCamera
        ? previewCamera
        : {
            position: isPreview ? [0, 0, 4] : [0, 0, 6],
            fov: isPreview ? 50 : 45,
          }
    }
    shadows={false}
    gl={{
      antialias: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
      logarithmicDepthBuffer: false,
      alpha: true,          // ✅ REQUIRED
      stencil: false,
      depth: true,
    }}
    style={{
      position: isPreview ? "relative" : "fixed",
      inset: isPreview ? "auto" : 0,
      background: "transparent",   // ✅ REQUIRED
    }}
    dpr={Math.min(window.devicePixelRatio, 1.5)}
  >
  
      <Suspense
        fallback={
          <Html center>
            {/* Intentionally empty: rely on fullscreen boot loader */}
          </Html>
        }
      >
        {/* Only show white background on main page, not in preview */}
      
        {!isPreview && <CameraController />}

        {/* Interactive rotate for preview modal */}
        {isPreview && interactive && (
          <OrbitControls
            enableZoom={true}
            enablePan={false}
            rotateSpeed={0.8}
            dampingFactor={0.08}
            enableDamping
          />
        )}

        {/* Optimized Lights */}
        <ambientLight intensity={0.4} />
        <directionalLight 
          position={[5, 6, 5]} 
          intensity={0.8}
          castShadow={false}
        />

        {/* Environment ONLY for main scene */}
        {!isPreview && <Environment preset="apartment" blur={0.6} />}

        {/* Particles ONLY for main scene */}
        {!isPreview && <Particles />}

        {/* ♾️ Infinite carousel */}
        {products.map((product, i) => {
          // For preview mode with forceCentered, always show at center (x = 0)
          const x = forceCentered && isPreview ? 0 : wrap(i * itemWidth - offset, totalWidth);
          
          const distance = Math.abs(x);
          // Slightly larger center emphasis
          const scale = distance < 0.5 
            ? 1.08 
            : Math.max(0.42, 1 - distance * 0.15);

          const shouldRender = forceCentered || !isPreview || Math.abs(distance) < 5;

          if (!shouldRender) return null;

          return (
            <group
              key={product.id || i}
              position={[x, 0, 0]}
              scale={[scale, scale, scale]}
            >
              <EnhancedProduct
                product={product}
                position={0}
                active={distance < itemWidth / 2}
                index={i}
                onClick={() => !isPreview && onSelect && onSelect(product)}
              />
            </group>
          );
        })}
      </Suspense>
    </Canvas>
  );
}
