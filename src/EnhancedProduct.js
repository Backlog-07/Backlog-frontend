import React, { useRef, useMemo, useEffect, Suspense } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

const API_BASE = (process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' ? '' : `http://${window.location.hostname}:4000`)).replace(/\/$/, "");

export function resolveImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http")) return imageUrl;
  if (imageUrl.startsWith("/")) return `${API_BASE}${imageUrl}`;
  return imageUrl;
}

export function resolveGlbUrl(glbUrl) {
  if (!glbUrl) return null;
  const raw = String(glbUrl).trim();
  if (!raw) return null;

  // Handle protocol-relative URLs from CMS fields.
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("http")) return raw;

  // Handle CDN host values without scheme, e.g. "cdn.example.com/file.glb".
  if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(raw)) return `https://${raw}`;

  if (raw.startsWith("/uploads/")) return `${API_BASE}${raw}`;
  // Support legacy/metafield values like "/models/t_shirt.glb" by serving via API host
  if (raw.startsWith("/models/")) return `${API_BASE}${raw}`;

  if (raw.startsWith("uploads/")) return `${API_BASE}/${raw}`;
  if (raw.startsWith("models/")) return `${API_BASE}/${raw}`;
  return raw;
}

class ModelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}

function ImageTile({ imageUrl, active }) {
  const url = useMemo(() => resolveImageUrl(imageUrl), [imageUrl]);
  const texture = useMemo(() => {
    if (!url) return null;
    const loader = new THREE.TextureLoader();
    const t = loader.load(url);
    // better quality defaults
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [url]);

  // Match legacy tile-ish proportions
  return (
    <group>
      <mesh>
        {/* Wider 2D tile so images don't look squeezed */}
        <planeGeometry args={[0.88, 0.97]} />
        {texture ? (
          <meshBasicMaterial
            map={texture}
            transparent
            opacity={1}
            side={THREE.DoubleSide}
            alphaTest={0.05}
          />
        ) : (
          <meshBasicMaterial color="#e8e8e8" transparent opacity={1} side={THREE.DoubleSide} />
        )}
      </mesh>
      {/* no glow/border to avoid any tint */}
    </group>
  );
}

function ProductModel({ glbUrl, active }) {
  const url = useMemo(() => resolveGlbUrl(glbUrl), [glbUrl]);
  const { scene } = useGLTF(url, "https://www.gstatic.com/draco/versioned/decoders/1.5.5/");

  const cloned = useMemo(() => scene.clone(true), [scene]);

  // Center model perfectly natively on (0,0,0) and scale safely
  const wrapper = useMemo(() => {
    const root = cloned.clone(true);
    
    // 1. Initial size check
    const initialBox = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    initialBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // 2. Normalize model size (smaller footprint on the rail)
    const targetScale = 0.92 / (maxDim || 1);
    root.scale.setScalar(targetScale);
    
    // Force Three.js to apply the scale so the next calculations don't fail!
    root.updateMatrixWorld(true);

    // 3. Now compute the actual geometry center after it shrunk
    const scaledBox = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    scaledBox.getCenter(center);

    // 4. Offset it so it spins flawlessly around 0,0,0
    root.position.sub(center);

    // Encapsulate deeply into a clean group so it never wobbles
    const group = new THREE.Group();
    group.add(root);

    return group;
  }, [cloned]);

  useEffect(() => {
    wrapper.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        if (obj.material) obj.material.side = THREE.FrontSide;
      }
    });
  }, [wrapper]);

  // Clean uniform passback, we removed useFrame bouncing so they don't 'go up or down'
  return (
    <primitive
      object={wrapper}
      position={[0, 0, 0]}
      rotation={[0, Math.PI, 0]}
    />
  );
}

function LegacyTile({ active }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.60, 0.93, 0.165]} />
        <meshStandardMaterial
          color="#e8e8e8"
          metalness={0.8}
          roughness={0.15}
          transparent
          opacity={1}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* no glow/border to avoid any tint */}
    </group>
  );
}

function ModelSkeleton({ active }) {
  const groupRef = useRef();
  const bodyRef = useRef();
  const accentRef = useRef();

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = 0.5 + Math.sin(t * 2.2) * 0.07;

    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.45) * 0.04;
      groupRef.current.position.y = Math.sin(t * 1.2) * 0.008;
    }

    if (bodyRef.current?.material) {
      bodyRef.current.material.opacity = active ? 0.92 : 0.84 + pulse * 0.08;
    }

    if (accentRef.current?.material) {
      accentRef.current.material.opacity = active ? 0.75 : 0.62 + pulse * 0.06;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={bodyRef}>
        <boxGeometry args={[0.62, 0.98, 0.18]} />
        <meshStandardMaterial
          color="#dedede"
          roughness={0.95}
          metalness={0.02}
          transparent
          opacity={0.88}
          side={THREE.FrontSide}
        />
      </mesh>
      <mesh ref={accentRef} position={[0, 0.34, 0.02]}>
        <boxGeometry args={[0.34, 0.2, 0.12]} />
        <meshStandardMaterial
          color="#eeeeee"
          roughness={0.98}
          metalness={0.01}
          transparent
          opacity={0.7}
          side={THREE.FrontSide}
        />
      </mesh>
      <mesh position={[0, -0.22, 0.03]}>
        <boxGeometry args={[0.24, 0.08, 0.08]} />
        <meshStandardMaterial
          color="#cfcfcf"
          roughness={1}
          metalness={0}
          transparent
          opacity={0.55}
          side={THREE.FrontSide}
        />
      </mesh>
    </group>
  );
}

function EnhancedProduct({ position, active, onClick, product, index = 0, railY }) {
  const meshRef = useRef();
  const { mouse } = useThree();

  const hasGlb = !!product?.glbUrl;
  const baseY = typeof railY === "number" ? railY : 0.6;

  useFrame((state) => {
    if (!meshRef.current) return;

    // Rotate ONLY 3D models (GLB). Keep 2D tiles (image/legacy) static.
    if (!hasGlb) {
      meshRef.current.rotation.y = 0;
      return;
    }

    // Mouse influence is strongest on the active item.
    const spinSpeed = 0.55;
    const baseSpin = state.clock.elapsedTime * spinSpeed;
    const mouseInfluence = active ? mouse.x * 0.2 : 0;
    meshRef.current.rotation.y = baseSpin + mouseInfluence;
  });

  const hasImage = !!product?.imageUrl;

  return (
    <group ref={meshRef} position={[position, baseY, 0]} frustumCulled={true}>
      <group
        onPointerDown={(e) => {
          e.stopPropagation();
          if (onClick && active) onClick();
        }}
        onPointerEnter={() => {
          document.body.style.cursor = active ? "pointer" : "auto";
        }}
        onPointerLeave={() => {
          document.body.style.cursor = "auto";
        }}
      >
        {hasGlb ? (
          <ModelErrorBoundary
            resetKey={product.glbUrl}
            fallback={hasImage ? <ImageTile imageUrl={product.imageUrl} active={active} /> : <LegacyTile active={active} />}
          >
            <Suspense fallback={<ModelSkeleton active={active} />}>
              <ProductModel glbUrl={product.glbUrl} active={active} />
            </Suspense>
          </ModelErrorBoundary>
        ) : hasImage ? (
          <ImageTile imageUrl={product.imageUrl} active={active} />
        ) : (
          <LegacyTile active={active} />
        )}
      </group>
    </group>
  );
}

export default React.memo(EnhancedProduct);
