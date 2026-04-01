import React, { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

const API_BASE = (process.env.REACT_APP_API_URL || "http://localhost:4000").replace(/\/$/, "");

function resolveImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http")) return imageUrl;
  if (imageUrl.startsWith("/")) return `${API_BASE}${imageUrl}`;
  return imageUrl;
}

function resolveGlbUrl(glbUrl) {
  if (!glbUrl) return null;
  if (glbUrl.startsWith("http")) return glbUrl;
  if (glbUrl.startsWith("/uploads/")) return `${API_BASE}${glbUrl}`;
  // Support legacy/metafield values like "/models/t_shirt.glb" by serving via API host
  if (glbUrl.startsWith("/models/")) return `${API_BASE}${glbUrl}`;
  return glbUrl;
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
  const { scene } = useGLTF(url);

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

function EnhancedProduct({ position, active, onClick, product, index = 0, railY }) {
  const meshRef = useRef();
  const { mouse } = useThree();

  const hasGlb = !!product?.glbUrl;
  const baseY = typeof railY === "number" ? railY : 0.6;

  useFrame((state) => {
    if (!meshRef.current || !hasGlb) return;

    if (!active) {
      meshRef.current.rotation.y = 0;
      return;
    }

    const baseSpin = state.clock.elapsedTime * 0.3;
    const mouseInfluence = mouse.x * 0.2;
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
          <ProductModel glbUrl={product.glbUrl} active={active} />
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
