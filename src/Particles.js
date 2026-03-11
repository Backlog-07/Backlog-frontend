import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

export default function Particles() {
  const particlesRef = useRef();
  const count = 50; // Reduced from 100

  // Generate random particle positions
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 20; // x
    positions[i * 3 + 1] = Math.random() * 10 - 2; // y
    positions[i * 3 + 2] = (Math.random() - 0.5) * 20; // z
  }

  // Very slow rotation animation - minimal impact
  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y = state.clock.elapsedTime * 0.02;
    }
  });

  return (
    <points ref={particlesRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial 
        size={0.03} 
        color="#ffffff" 
        transparent 
        opacity={0.4}
        sizeAttenuation={true}
        fog={false}
      />
    </points>
  );
}