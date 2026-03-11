import React, { useRef, Suspense, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { TextureLoader } from 'three/src/loaders/TextureLoader';
// import * as THREE from 'three';

const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

function Box({ product, small }) {
  const mesh = useRef();
  const [texture, setTexture] = useState(null);
  const textureRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    if (product.imageUrl) {
      const loader = new TextureLoader();
      let src = product.imageUrl;
      if (product.imageUrl.startsWith('/')) {
        if (API_BASE) {
          src = API_BASE + product.imageUrl;
        } else if (typeof window !== 'undefined') {
          src = `${window.location.protocol}//${window.location.hostname}:4000${product.imageUrl}`;
        }
      }
      loader.load(
        src,
        (tex) => {
          if (!mounted) return;
          textureRef.current = tex;
          setTexture(tex);
        },
        undefined,
        () => {
          // on error, keep texture null
        }
      );
    } else {
      setTexture(null);
    }

    return () => {
      mounted = false;
      if (textureRef.current) {
        try { textureRef.current.dispose(); } catch (e) {}
        textureRef.current = null;
      }
    };
  }, [product.imageUrl]);

  useFrame((state, delta) => {
    if (!mesh.current) return;

    // If a 2D image is provided (admin uploaded) keep it still.
    // Use both the presence of imageUrl and the fact that a texture was loaded.
    const has2DImage = Boolean(product?.imageUrl) || Boolean(texture);

    if (has2DImage) {
      // Ensure we don't keep a previous rotation from a prior render/product.
      mesh.current.rotation.y = 0;
      return;
    }

    mesh.current.rotation.y += 0.6 * delta;
  });

  const color = product.color || (product.colors && product.colors[0]) || '#dddddd';

  return (
    <mesh ref={mesh} frustumCulled={true}>
      <boxGeometry args={[1.1, 1.7, 0.35]} />
      {texture ? (
        <meshStandardMaterial 
          map={texture} 
          metalness={0.6} 
          roughness={0.3}
          toneMapped={true}
        />
      ) : (
        <meshStandardMaterial 
          color={color} 
          metalness={0.2} 
          roughness={0.5}
          toneMapped={true}
        />
      )}
    </mesh>
  );
}

export default function ProductPreview({ product = {}, small = false }) {
  const size = small ? { width: 200, height: 240 } : { width: 360, height: 420 };

  return (
    <div style={{ width: size.width, height: size.height, borderRadius: 8, overflow: 'hidden' }}>
      <Canvas 
        camera={{ position: [0, 0, 4], fov: 35 }} 
        gl={{ 
          antialias: false,
          alpha: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
          logarithmicDepthBuffer: false,
          stencil: false,
        }}
        dpr={Math.min(window.devicePixelRatio, 1.3)}
      >
        <color attach="background" args={["#ffffff"]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[2, 4, 2]} intensity={0.8} castShadow={false} />
        <Suspense fallback={null}>
          <Box product={product} small={small} />
        </Suspense>
      </Canvas>
    </div>
  );
}
