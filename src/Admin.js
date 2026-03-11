import React, { useState, useEffect } from "react";

const API_BASE = "http://localhost:4000";

const AdminPanel = () => {
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState({
    name: "",
    price: "",
    description: "",
    image: null,
  });
  const [worldImages, setWorldImages] = useState([]);
  const [worldImageFile, setWorldImageFile] = useState(null);

  useEffect(() => {
    loadProducts();
    loadWorldImages();
  }, []);

  // Fetch products
  const loadProducts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/products`);
      if (res.ok) {
        const data = await res.json();
        console.log("Loaded products:", data); // Debug log
        // Log the full image URLs being constructed
        data.forEach(p => {
          console.log(`Product: ${p.name}, Image URL: ${API_BASE}${p.imageUrl}`);
        });
        setProducts(data || []);
      } else {
        console.error("Failed to fetch products:", res.status);
      }
    } catch (e) {
      console.error("Failed to load products", e);
    }
  };

  // Fetch world images
  const loadWorldImages = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/world-images`);
      if (res.ok) {
        const data = await res.json();
        console.log("Loaded world images:", data); // Debug log
        setWorldImages(data || []);
      } else {
        console.error("Failed to fetch world images:", res.status);
      }
    } catch (e) {
      console.error("Failed to load world images", e);
    }
  };

  // Upload product
  const handleUploadProduct = async (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price || !newProduct.image) {
      alert("Please fill all fields and select an image");
      return;
    }

    const formData = new FormData();
    formData.append("name", newProduct.name);
    formData.append("price", newProduct.price);
    formData.append("description", newProduct.description || "");
    formData.append("image", newProduct.image);

    try {
      const res = await fetch(`${API_BASE}/api/products`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const uploadedProduct = await res.json();
        console.log("Product uploaded successfully:", uploadedProduct); // Debug log
        alert("Product uploaded successfully!");
        setNewProduct({ name: "", price: "", description: "", image: null });
        // Reset file input
        const fileInput = document.querySelector('input[type="file"][accept="image/*"]');
        if (fileInput) fileInput.value = "";
        // Reload products to show the new one
        await loadProducts();
      } else {
        const error = await res.text();
        console.error("Upload failed:", error);
        alert(`Upload failed: ${error}`);
      }
    } catch (e) {
      console.error("Error uploading product:", e);
      alert("Error uploading product");
    }
  };

  // Upload world image
  const handleUploadWorldImage = async (e) => {
    e.preventDefault();
    if (!worldImageFile) {
      alert("Please select an image");
      return;
    }

    const formData = new FormData();
    formData.append("image", worldImageFile);

    try {
      const res = await fetch(`${API_BASE}/api/world-images`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const uploadedImage = await res.json();
        console.log("World image uploaded successfully:", uploadedImage); // Debug log
        alert("World image uploaded successfully!");
        setWorldImageFile(null);
        // Reset file input
        const fileInput = document.querySelector('input[type="file"][accept="image/*"]:last-of-type');
        if (fileInput) fileInput.value = "";
        // Reload world images to show the new one
        await loadWorldImages();
      } else {
        const error = await res.text();
        console.error("Upload failed:", error);
        alert(`Upload failed: ${error}`);
      }
    } catch (e) {
      console.error("Error uploading world image:", e);
      alert("Error uploading world image");
    }
  };

  // Delete product
  const handleDeleteProduct = async (id) => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;

    try {
      const res = await fetch(`${API_BASE}/api/products/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        alert("Product deleted successfully!");
        // Reload products to reflect the deletion
        await loadProducts();
      } else {
        const error = await res.text();
        console.error("Delete failed:", error);
        alert(`Delete failed: ${error}`);
      }
    } catch (e) {
      console.error("Error deleting product:", e);
      alert("Error deleting product");
    }
  };

  // Delete world image
  const handleDeleteWorldImage = async (id) => {
    if (!window.confirm("Are you sure you want to delete this world image?")) return;

    try {
      const res = await fetch(`${API_BASE}/api/world-images/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        alert("World image deleted successfully!");
        // Reload world images to reflect the deletion
        await loadWorldImages();
      } else {
        const error = await res.text();
        console.error("Delete failed:", error);
        alert(`Delete failed: ${error}`);
      }
    } catch (e) {
      console.error("Error deleting world image:", e);
      alert("Error deleting world image");
    }
  };

  return (
    <div>
      <h1>Admin Panel</h1>

      <h2>Products</h2>
      <form onSubmit={handleUploadProduct}>
        <input
          type="text"
          placeholder="Name"
          value={newProduct.name}
          onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
        />
        <input
          type="number"
          placeholder="Price"
          value={newProduct.price}
          onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
        />
        <textarea
          placeholder="Description"
          value={newProduct.description}
          onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setNewProduct({ ...newProduct, image: e.target.files[0] })}
        />
        <button type="submit">Upload Product</button>
      </form>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {products.map((p) => (
          <div
            key={p.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 12,
              width: 200,
              background: "#fff",
            }}
          >
            <img
              src={`${API_BASE}${p.imageUrl}`}
              alt={p.name}
              style={{
                width: "100%",
                height: 150,
                objectFit: "cover",
                borderRadius: 6,
                marginBottom: 8,
                background: "#f0f0f0",
              }}
              onError={(e) => {
                console.error("Image load error for product:", p.name, `${API_BASE}${p.imageUrl}`);
                e.target.onerror = null; // Prevent infinite loop
                e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150'%3E%3Crect fill='%23f0f0f0' width='200' height='150'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' fill='%23999' style='font-size:14px'%3ENo Image%3C/text%3E%3C/svg%3E";
              }}
              onLoad={() => {
                console.log(`Image loaded successfully: ${p.name}`);
              }}
            />
            <h4 style={{ margin: "0 0 4px 0", fontSize: 14 }}>{p.name}</h4>
            <p style={{ margin: 0, fontSize: 12, color: "#666" }}>
              ${p.price}
            </p>
            <button
              onClick={() => handleDeleteProduct(p.id)}
              style={{
                marginTop: 8,
                padding: "6px 12px",
                background: "#ff4444",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      <h2>World Images</h2>
      <form onSubmit={handleUploadWorldImage}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setWorldImageFile(e.target.files[0])}
        />
        <button type="submit">Upload World Image</button>
      </form>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {worldImages.map((img) => (
          <div
            key={img.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 12,
              width: 200,
              background: "#fff",
            }}
          >
            <img
              src={`${API_BASE}${img.imageUrl}`}
              alt={`World ${img.id}`}
              style={{
                width: "100%",
                height: 150,
                objectFit: "cover",
                borderRadius: 6,
                marginBottom: 8,
                background: "#f0f0f0",
              }}
              onError={(e) => {
                console.error("Image load error for world image:", img.id, img.imageUrl);
                e.target.src = "/placeholder.png";
              }}
            />
            <button
              onClick={() => handleDeleteWorldImage(img.id)}
              style={{
                marginTop: 8,
                padding: "6px 12px",
                background: "#ff4444",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminPanel;