import React, { useEffect, useState } from "react";
import ProductDetail from "./ProductDetail";

const API_BASE = "http://localhost:4000";

const Shop = () => {
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

  const selectedProduct = products.find((p) => String(p.id) === String(selectedProductId)) || null;

  useEffect(() => {
    fetch(`${API_BASE}/api/products`)
      .then((response) => response.json())
      .then((data) => {
        console.log("Fetched products:", data);
        setProducts(data);
      })
      .catch((error) => console.error("Error fetching products:", error));
  }, []);

  const handleProductClick = (product) => {
    if (!product) return;
    setSelectedProductId(product.id);
    setIsBottomSheetOpen(true);
  };

  const handleCloseBottomSheet = () => {
    setIsBottomSheetOpen(false);
    // Clear after close animation so it cannot flash stale content
    setTimeout(() => setSelectedProductId(null), 300);
  };

  return (
    <div className="shop">
      {products.map((product) => (
        <div
          key={product.id}
          className="product"
          onClick={() => handleProductClick(product)}
          style={{ cursor: "pointer" }}
        >
          <div
            className="shop-thumb"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 160,
              aspectRatio: '1 / 1',
              overflow: 'hidden',
              borderRadius: 12,
              background: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 10,
            }}
          >
            <img
              src={`${API_BASE}${product.imageUrl}`}
              alt={product.name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                background: 'transparent',
                display: 'block',
              }}
              onError={(e) => {
                console.error('Image load error:', product.imageUrl);
                e.target.src = '/placeholder.png';
              }}
            />
          </div>
          <h2 onClick={(e) => e.stopPropagation()}>{product.name}</h2>
          <p onClick={(e) => e.stopPropagation()}>{product.description}</p>
          <p onClick={(e) => e.stopPropagation()}>${product.price}</p>
        </div>
      ))}

      {/* Bottom Sheet with Product Detail */}
      {selectedProduct && (
        <ProductDetail
          key={selectedProductId}
          product={selectedProduct}
          isOpen={isBottomSheetOpen}
          onClose={handleCloseBottomSheet}
        />
      )}
    </div>
  );
};

export default Shop;