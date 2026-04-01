import React, { useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

const API_BASE = "http://localhost:4000";

function ProductModel({ imageUrl }) {
  const [texture, setTexture] = useState(null);

  useEffect(() => {
    let cancelled = false;

    if (imageUrl) {
      const fullImageUrl = imageUrl.startsWith('http') ? imageUrl : `${API_BASE}${imageUrl}`;
      console.log("Loading texture from:", fullImageUrl);
      const loader = new THREE.TextureLoader();
      loader.load(
        fullImageUrl,
        (loadedTexture) => {
          if (cancelled) return;
          console.log("Texture loaded successfully");

          // Ensure texture is interpreted as sRGB (fixes dark/high-contrast look)
          // three r152+ uses `colorSpace`; older versions use `encoding`.
          if ('colorSpace' in loadedTexture) {
            loadedTexture.colorSpace = THREE.SRGBColorSpace;
          } else {
            loadedTexture.encoding = THREE.sRGBEncoding;
          }
          loadedTexture.needsUpdate = true;

          setTexture(loadedTexture);
        },
        undefined,
        (error) => {
          console.error("Error loading texture:", error);
        }
      );
    }

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return (
    <mesh rotation={[0, 0, 0]}>
      <boxGeometry args={[2, 3, 0.1]} />
      {/* Use a non-metallic material for accurate texture color */}
      <meshStandardMaterial map={texture} metalness={0} roughness={1} toneMapped={false} />
    </mesh>
  );
}

const ProductDetail = ({ product, isOpen, onClose }) => {
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    // Reset size and quantity when product changes
    if (product) {
      console.log("ProductDetail received product:", product);
      setSelectedSize("");
      setQuantity(1);
    }
  }, [product]);

  // mobile: shift panel higher and reduce height to leave more top space
  const baseBottom = isMobile ? 300 : 0;
  const panelHeight = isOpen ? (isMobile ? "50vh" : "80vh") : "0vh";

  return (
    <div
      style={{
        position: "fixed",
        bottom: baseBottom,
        left: 0,
        right: 0,
        height: panelHeight,
        background: "#fff",
        borderRadius: "20px 20px 0 0",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.1)",
        transition: "height 0.3s ease",
        overflow: "hidden",
        zIndex: 1000,
      }}
    >
      {product && (
        <div style={{ display: "flex", height: "100%", flexDirection: "column" }}>
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              background: "rgba(0,0,0,0.5)",
              color: "#fff",
              border: "none",
              borderRadius: "50%",
              width: 40,
              height: 40,
              fontSize: 24,
              cursor: "pointer",
              zIndex: 10,
            }}
          >
            ×
          </button>

          {/* 3D View */}
          <div style={{ flex: 1, background: "#f5f5f5" }}>
            <Canvas
              camera={{ position: [0, 0, 5], fov: 50 }}
              gl={{ antialias: true, alpha: true }}
              onCreated={({ gl }) => {
                // Match browser color output for textures
                gl.toneMapping = THREE.NoToneMapping;
                gl.toneMappingExposure = 1;
                if ('outputColorSpace' in gl) {
                  gl.outputColorSpace = THREE.SRGBColorSpace;
                } else {
                  gl.outputEncoding = THREE.sRGBEncoding;
                }
              }}
            >
              {/* Softer, more even lighting to avoid dark/high-contrast look */}
              <ambientLight intensity={0.9} />
              <directionalLight position={[5, 5, 5]} intensity={0.6} />
              <directionalLight position={[-5, 2, 5]} intensity={0.4} />
              <ProductModel imageUrl={product.imageUrl} />
              <OrbitControls enableZoom={false} />
            </Canvas>
          </div>

          {/* Product Info */}
          <div style={{ padding: 24, maxHeight: "40%", overflowY: "auto" }}>
            <h2 style={{ margin: "0 0 12px 0", fontSize: 24 }}>{product.name}</h2>
            <p style={{ color: "#666", marginBottom: 16 }}>{product.desc || product.description}</p>
            <p style={{ fontSize: 28, fontWeight: "bold", marginBottom: 20 }}>
              ₹{product.price}
            </p>

            {/* Size Selection */}
            {product.sizes && product.sizes.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", marginBottom: 8, fontWeight: "600" }}>
                  Select Size:
                </label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {product.sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      style={{
                        padding: "10px 20px",
                        border: selectedSize === size ? "2px solid #000" : "1px solid #ddd",
                        background: selectedSize === size ? "#000" : "#fff",
                        color: selectedSize === size ? "#fff" : "#000",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontWeight: "600",
                      }}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 8, fontWeight: "600" }}>
                Quantity:
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  padding: 10,
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  width: 100,
                  fontSize: 16,
                }}
              />
            </div>

            {/* Add to Cart Button */}
            <button
              style={{
                width: "100%",
                padding: 16,
                background: "#000",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 18,
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              Add to Cart
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductDetail;