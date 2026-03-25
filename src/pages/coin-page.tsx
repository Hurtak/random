import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const Coin = () => {
  const coinRef = useRef<THREE.Mesh>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { viewport } = useThree();

  const spinSpeedRef = useRef(0);
  const targetSpinsRef = useRef(0);
  const decelerationRef = useRef(0);

  const coinSize = Math.min(viewport.width, viewport.height) * 0.35;
  const coinThickness = coinSize * 0.1;
  const detailSize = coinSize * 0.9;

  useEffect(() => {
    if (coinRef.current) {
      coinRef.current.rotation.x = Math.PI / 2;
    }
  }, []);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();

    if (isSpinning) {
      return;
    }

    setIsSpinning(true);
    setResult(null);

    spinSpeedRef.current = 30;
    targetSpinsRef.current = 3 + Math.random() * 3;

    const initialSpeed = spinSpeedRef.current;
    const targetRotation = targetSpinsRef.current * Math.PI * 2;
    decelerationRef.current = -(initialSpeed * initialSpeed) / (2 * targetRotation);
  };

  useFrame((_, delta) => {
    if (!isSpinning || !coinRef.current) {
      return;
    }

    const rotationThisFrame = spinSpeedRef.current * delta;
    coinRef.current.rotation.x += rotationThisFrame;

    spinSpeedRef.current += decelerationRef.current * delta;

    if (spinSpeedRef.current <= 0) {
      spinSpeedRef.current = 0;
      setIsSpinning(false);

      const quarterTurns = Math.round(coinRef.current.rotation.x / (Math.PI / 2));
      const targetRotation = quarterTurns % 4 === 1 || quarterTurns % 4 === 3
        ? quarterTurns * (Math.PI / 2)
        : (quarterTurns + 1) * (Math.PI / 2);

      coinRef.current.rotation.x = targetRotation;

      const normalizedRotation = targetRotation % (Math.PI * 2);
      const isHeads = Math.abs(normalizedRotation - Math.PI / 2) < 0.01;
      setResult(isHeads ? "Heads" : "Tails");
    }
  });

  return (
    <group>
      <mesh
        onClick={handleClick}
        position={[0, 0, 0]}
        ref={coinRef}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[coinSize, coinSize, coinThickness, 64]} />
        <meshStandardMaterial
          color="#ffd700"
          emissive="#ffc107"
          emissiveIntensity={0.2}
          metalness={0.85}
          roughness={0.2}
        />

        <mesh
          position={[0, coinThickness / 2 + 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[detailSize, 32]} />
          <meshStandardMaterial color="#e6c200" metalness={0.8} roughness={0.3} />
        </mesh>

        <mesh
          position={[0, -coinThickness / 2 - 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[detailSize, 32]} />
          <meshStandardMaterial color="#e6c200" metalness={0.8} roughness={0.3} />
        </mesh>
      </mesh>

      {result && (
        <Html center position={[0, coinSize * 1.85, 0]}>
          <div className="result">{result}</div>
        </Html>
      )}
    </group>
  );
};

const CameraSetup = () => {
  const { camera, size } = useThree();
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const timeRef = useRef(0);

  const params = useRef({
    arcAngle: 15 * (Math.PI / 180),
    radius: 10,
    speed: 2,
    yOffset: 0.8,
  });

  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.lookAt(0, 0, 0);
    }
  }, [size]);

  useFrame((_, delta) => {
    timeRef.current += delta * params.current.speed;

    const angleOffset = Math.sin(timeRef.current) * params.current.arcAngle;
    const z = Math.cos(angleOffset) * params.current.radius;
    const x = Math.sin(angleOffset) * params.current.radius;
    const y = Math.sin(timeRef.current * 0.5) * params.current.yOffset;

    if (cameraRef.current) {
      cameraRef.current.position.set(x, y, z);
      cameraRef.current.lookAt(0, 0, 0);
    }

    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
  });

  return <perspectiveCamera position={[0, 0, 10]} ref={cameraRef} />;
};

export const CoinPage = () => {
  return (
    <section className="page-shell coin-page">
      <div className="canvas">
        <Canvas camera={{ fov: 70, position: [0, 0, 10] }} dpr={[1, 2]}>
          <CameraSetup />
          <Coin />
          <ambientLight intensity={1.2} />
          <directionalLight color="#ffffff" intensity={2} position={[5, 5, 5]} />
          <directionalLight color="#fff9e5" intensity={1} position={[-5, -5, 5]} />
          <spotLight angle={0.6} color="#ffffff" distance={20} intensity={1} position={[0, 5, 5]} />
        </Canvas>
      </div>
    </section>
  );
};
