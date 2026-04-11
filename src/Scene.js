import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, OrbitControls, useGLTF } from "@react-three/drei";
import EnhancedProduct from "./EnhancedProduct";
import Particles from "./Particles";
import { Suspense, useEffect } from "react";
import * as THREE from "three";
import React from "react";
import {
  getCarouselItemWidth,
  getCarouselItemScale,
  CAROUSEL_LATERAL_COMPRESS,
  CAROUSEL_CAM_Z,
  CAROUSEL_FOV,
} from "./carouselLayout";
import { resolveGlbUrl } from "./EnhancedProduct";

/** World Y for product origins (rail) */
const CAROUSEL_RAIL_Y = 1.2;
/**
 * Camera look-at Y slightly below the rail so the row reads centered in the band
 * between the header and bottom controls (not stuck low in the full viewport).
 */
const CAROUSEL_LOOK_AT_Y = 1.0;

/* Camera Controller */
function CameraController({ isMobile }) {
  const { camera, mouse } = useThree();

  useFrame(() => {
    // Minimal parallax so the row stays read as one straight line
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, mouse.x * 0.12, 0.03);

    const targetY = isMobile ? 0.95 : 1.05;
    camera.position.y = THREE.MathUtils.lerp(
      camera.position.y,
      targetY + mouse.y * 0.05,
      0.03
    );

    camera.lookAt(0, CAROUSEL_LOOK_AT_Y, 0);
  });

  return null;
}

/* Camera Manager (Snaps camera on state change) */
function CameraManager({ isPreview, previewCamera, isMobile }) {
  const { camera } = useThree();

  React.useEffect(() => {
    if (isPreview) {
      const pos = previewCamera ? previewCamera.position : [0, 0.8, 4.2];
      const fov = previewCamera ? previewCamera.fov : 50;
      camera.position.set(pos[0], pos[1], pos[2]);
      camera.fov = fov;
      camera.updateProjectionMatrix();
    } else {
      const y = isMobile ? 0.95 : 1.05;
      const z = isMobile ? CAROUSEL_CAM_Z * 1.05 : CAROUSEL_CAM_Z;
      camera.position.set(0, y, z);
      camera.fov = CAROUSEL_FOV;
      camera.updateProjectionMatrix();
    }
  }, [isPreview, previewCamera, camera, isMobile]);

  return null;
}

/* Wrap helper */
function wrap(value, range) {
  const half = range / 2;
  return ((((value + half) % range) + range) % range) - half;
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
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const itemWidth = getCarouselItemWidth();
  const totalWidth = count * itemWidth;

  useEffect(() => {
    if (!count) return;

    const centerIndex = Math.round(offset / itemWidth);
    const preloadRadius = isMobile ? 2 : 4;

    for (let step = -preloadRadius; step <= preloadRadius; step += 1) {
      const idx = ((centerIndex + step) % count + count) % count;
      const product = products[idx];
      const url = product?.glbUrl ? resolveGlbUrl(product.glbUrl) : null;
      if (url) {
        useGLTF.preload(url);
      }
    }
  }, [count, isMobile, itemWidth, offset, products]);

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
    dpr={isMobile ? 1 : Math.min(window.devicePixelRatio, 1.5)}
    onCreated={({ gl }) => {
      // Better perceived brightness + correct output colors
      gl.outputColorSpace = THREE.SRGBColorSpace;
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = isPreview ? 1.25 : 1.0;
    }}
  >
  
      <Suspense
        fallback={
          <Html center>
            {/* Intentionally empty: rely on fullscreen boot loader */}
          </Html>
        }
      >
        <CameraManager isPreview={isPreview} previewCamera={previewCamera} isMobile={isMobile} />

        {/* Only show white background on main page, not in preview */}
      
        {!isPreview && <CameraController isMobile={isMobile} />}

        {/* Interactive rotate for preview modal */}
        {isPreview && interactive && (
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            enableRotate={false}
            autoRotate={true}
            autoRotateSpeed={2.5}
            rotateSpeed={0.8}
            dampingFactor={0.08}
            enableDamping
            target={[0, CAROUSEL_RAIL_Y, 0]}
          />
        )}

        {/* Lights */}
        <ambientLight intensity={isPreview ? 0.95 : 0.4} />
        <directionalLight 
          position={[5, 6, 5]} 
          intensity={isPreview ? 1.35 : 0.8}
          castShadow={false}
        />
        {isPreview && (
          <directionalLight
            position={[-5, 3, 3]}
            intensity={0.7}
            castShadow={false}
          />
        )}

        {/* Environment: keep for main + add for preview to avoid dark models */}
        {!isPreview && <Environment preset="apartment" blur={0.6} />}
        {isPreview && <Environment preset="studio" blur={0.2} />}

        {/* Particles ONLY for main scene */}
        {!isPreview && !isMobile && <Particles />}

        {/* ♾️ Infinite carousel */}
        {products.map((product, i) => {
          const rawX =
            forceCentered && isPreview ? 0 : wrap(i * itemWidth - offset, totalWidth);
          const dRaw = Math.abs(rawX);

          // On mobile, show only the centered product; neighbors are hidden.
          if (isMobile && dRaw > itemWidth * 0.4) {
            return null;
          }

          const scale = getCarouselItemScale(dRaw, itemWidth);
          // Mobile-specific size boost (25%) for better focus on a single product.
          const mobileScale = isMobile ? scale * 1.25 : scale;
          const compress = 1 - CAROUSEL_LATERAL_COMPRESS * (1 - scale);
          const x = rawX * compress;

          const railY = isMobile ? CAROUSEL_RAIL_Y + 0.18 : CAROUSEL_RAIL_Y + 0.2;
          return (
            <group key={product.id || i} position={[x, railY, 0]}>
              <group scale={[mobileScale, mobileScale, mobileScale]}>
                <EnhancedProduct
                  product={product}
                  position={0}
                  active={dRaw < itemWidth / 2}
                  index={i}
                  railY={0}
                  onClick={() => !isPreview && onSelect && onSelect(product)}
                />
              </group>
            </group>
          );
        })}
      </Suspense>
    </Canvas>
  );
}
