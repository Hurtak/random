import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import "./app.css";

// Responsive coin component that fits viewport
const Coin = () => {
  const coinRef = useRef<THREE.Mesh>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { viewport } = useThree();

  // Animation physics refs
  const spinSpeedRef = useRef(0);
  const totalRotationRef = useRef(0);
  const targetSpinsRef = useRef(0);
  const decelerationRef = useRef(0);

  // Calculate responsive coin size based on viewport
  const coinSize = Math.min(viewport.width, viewport.height) * 0.35;
  const coinThickness = coinSize * 0.1;
  const detailSize = coinSize * 0.9;

  // Initialize coin to face the camera
  useEffect(() => {
    if (coinRef.current) {
      // Set initial rotation to show flat side to camera (90 degrees or PI/2 on X axis)
      coinRef.current.rotation.x = Math.PI / 2;
    }
  }, []);

  // Handle click on the coin
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (isSpinning) return;

    // Reset state
    setIsSpinning(true);
    setResult(null);

    // Initialize spin parameters
    spinSpeedRef.current = 30; // Increased initial rotation speed
    totalRotationRef.current = coinRef.current?.rotation.x || Math.PI / 2; // Start from current rotation

    // Determine number of spins (between 3-6)
    targetSpinsRef.current = 3 + Math.random() * 3;

    // Calculate deceleration rate to stop at target spins
    // Using physics formula: v²=u²+2as where v=0 at end
    // Rearranged: a = -u²/(2s) where u=initial speed, s=distance
    const initialSpeed = spinSpeedRef.current;
    const targetRotation = targetSpinsRef.current * Math.PI * 2;
    decelerationRef.current =
      -(initialSpeed * initialSpeed) / (2 * targetRotation);
  };

  // Animation frame update
  useFrame((_, delta) => {
    if (!isSpinning || !coinRef.current) return;

    // Apply current rotation speed
    const rotationThisFrame = spinSpeedRef.current * delta;
    coinRef.current.rotation.x += rotationThisFrame;
    totalRotationRef.current += rotationThisFrame;

    // Apply physics (deceleration)
    spinSpeedRef.current += decelerationRef.current * delta;

    // Check if the coin should stop spinning
    if (spinSpeedRef.current <= 0) {
      spinSpeedRef.current = 0;
      setIsSpinning(false);

      // Calculate how many quarter turns we've done (each π/2)
      // We want to end on either π/2 (heads) or 3π/2 (tails) to show flat side
      const quarterTurns = Math.round(
        coinRef.current.rotation.x / (Math.PI / 2)
      );

      // Ensure we land on π/2 or 3π/2 (so the flat side faces the camera)
      const targetRotation =
        quarterTurns % 4 === 1 || quarterTurns % 4 === 3
          ? quarterTurns * (Math.PI / 2)
          : (quarterTurns + 1) * (Math.PI / 2);

      // Smoothly set final rotation
      coinRef.current.rotation.x = targetRotation;

      // Determine result - if rotation is π/2 (mod 2π) it's heads, if it's 3π/2 (mod 2π) it's tails
      const normalizedRotation = targetRotation % (Math.PI * 2);
      const isHeads = Math.abs(normalizedRotation - Math.PI / 2) < 0.01;
      setResult(isHeads ? "Heads" : "Tails");
    }
  });

  return (
    <group>
      <mesh
        ref={coinRef}
        onClick={handleClick}
        rotation={[Math.PI / 2, 0, 0]} // Start with flat side facing camera
        position={[0, 0, 0]}
      >
        {/* Coin body */}
        <cylinderGeometry args={[coinSize, coinSize, coinThickness, 64]} />
        <meshStandardMaterial color="#FFD700" metalness={1} roughness={0.2} />

        {/* Heads side detail */}
        <mesh
          position={[0, coinThickness / 2 + 0.01, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[detailSize, 32]} />
          <meshStandardMaterial
            color="#E6C200"
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>

        {/* Tails side detail */}
        <mesh
          position={[0, -coinThickness / 2 - 0.01, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[detailSize, 32]} />
          <meshStandardMaterial
            color="#E6C200"
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>
      </mesh>

      {/* Result display */}
      {result && (
        <Html position={[0, coinSize * 1.5, 0]} center>
          <div className="result">{result}</div>
        </Html>
      )}
    </group>
  );
};

// Camera setup component to ensure proper framing
const CameraSetup = () => {
  const { size } = useThree();
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);

  useEffect(() => {
    if (cameraRef.current) {
      // Adjust camera to frame the coin properly
      cameraRef.current.lookAt(0, 0, 0);
    }
  }, [size]);

  return <perspectiveCamera ref={cameraRef} position={[0, 0, 10]} />;
};

export const App = () => {
  return (
    <div className="canvas">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 45 }}
        dpr={[1, 2]} // Better performance on high-DPI screens
      >
        <CameraSetup />
        <Coin />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <directionalLight
          position={[-5, -5, 5]}
          intensity={0.5}
          color="#FFF9E5"
        />
      </Canvas>
    </div>
  );
};
