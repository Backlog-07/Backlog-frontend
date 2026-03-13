import { useRef, useMemo, useEffect } from "react";
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
        <planeGeometry args={[0.62, 0.98]} />
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

  // Center model and compute baseline so it doesn't float too high/low
  const { object: centered, baselineY } = useMemo(() => {
    const root = cloned.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Move pivot to center
    root.position.sub(center);

    // Recompute box after centering and compute "bottom" so we can align it near y=0
    const box2 = new THREE.Box3().setFromObject(root);
    const minY = box2.min.y;

    // baselineY is the offset required to bring the model's bottom to y=0
    const baselineY = -minY;

    // Apply baseline once (we still animate bob on top of it)
    root.position.y += baselineY;

    return { object: root, baselineY };
  }, [cloned]);

  useEffect(() => {
    centered.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        if (obj.material) obj.material.side = THREE.FrontSide;
      }
    });
  }, [centered]);

  // Manual extra drop so it matches legacy tile height better
  const DROP = 1.15;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const bob = active ? Math.sin(t * 1.6) * 0.03 : 0;
    centered.position.y = baselineY - DROP + bob;
  });

  return (
    <primitive
      object={centered}
      scale={1.1}
      position={[0, 0, 0]}
      rotation={[0, Math.PI, 0]}
    />
  );
}

function LegacyTile({ active }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.6, 0.95, 0.175]} />
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

export default function EnhancedProduct({ position, active, onClick, product, index = 0 }) {
  const meshRef = useRef();
  const { mouse } = useThree();

  const hasGlb = !!product?.glbUrl;

  useFrame((state) => {
    if (!meshRef.current) return;

    meshRef.current.position.x = position;
    // Slightly lower the baseline so models don't sit too high
    meshRef.current.position.y = 0.35;
    meshRef.current.position.z = 0;

    // Spin ONLY for 3D models
    if (hasGlb) {
      const baseSpin = state.clock.elapsedTime * 0.3;
      const mouseInfluence = active ? mouse.x * 0.2 : 0;
      meshRef.current.rotation.y = baseSpin + mouseInfluence;
    } else {
      meshRef.current.rotation.y = 0;
    }

    const targetScale = active ? 1.3 : 0.95;
    meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);
  });

  const hasImage = !!product?.imageUrl;

  return (
    <group ref={meshRef} position={[position, 0.35, 0]} frustumCulled={true}>
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
