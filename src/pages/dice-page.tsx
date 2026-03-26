import { ContactShadows, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CuboidCollider, Physics, type RapierRigidBody, RigidBody, useRapier } from "@react-three/rapier";
import { type MutableRefObject, startTransition, Suspense, useEffect, useEffectEvent, useRef, useState } from "react";
import * as THREE from "three";

type GravityVector = [number, number, number];
type InteractionMode = "desktop" | "motion-blocked" | "motion-pending" | "motion-ready";
type MotionPermissionState = "denied" | "granted";
type MotionPermissionRequestable = {
  requestPermission?: () => Promise<MotionPermissionState>;
};
type MotionPermissionRequester = {
  requestPermission: () => Promise<MotionPermissionState>;
};

type DiceBodyProps = {
  bodyRef: MutableRefObject<RapierRigidBody | null>;
  color: string;
  glow: string;
  initialPosition: [number, number, number];
};

type FaceLayout = {
  normal: readonly [number, number, number];
  pips: ReadonlyArray<readonly [number, number]>;
  rotation: readonly [number, number, number];
  right: readonly [number, number, number];
  up: readonly [number, number, number];
};

type DiceCameraFraming = {
  driftX: number;
  driftY: number;
  driftZ: number;
  fov: number;
  lookAtY: number;
  orbitSpeed: number;
  y: number;
  z: number;
};

const BASE_GRAVITY = 22;
const DEFAULT_GRAVITY: GravityVector = [0, -BASE_GRAVITY, 0];
const DICE_HALF_SIZE = 0.46;
const MAX_TILT_DEGREES = 30;
const SHAKE_COOLDOWN_MS = 900;
const SHAKE_THRESHOLD = 13.25;
const BETA_NEUTRAL = 72;
const GRAVITY_EASING = 0.16;
const FACE_PANEL_SURFACE = DICE_HALF_SIZE + 0.012;
const FACE_PANEL_SIZE = 0.77;
const DESKTOP_CAMERA_FRAMING: DiceCameraFraming = {
  driftX: 0.36,
  driftY: 0.18,
  driftZ: 0.24,
  fov: 40,
  lookAtY: 0.85,
  orbitSpeed: 0.22,
  y: 4.85,
  z: 6.15,
};
const MOBILE_CAMERA_FRAMING: DiceCameraFraming = {
  driftX: 0.12,
  driftY: 0.1,
  driftZ: 0.12,
  fov: 52,
  lookAtY: 1.3,
  orbitSpeed: 0.17,
  y: 5.6,
  z: 9.4,
};

const getResponsiveCameraFraming = (aspect: number): DiceCameraFraming => {
  const portraitFactor = THREE.MathUtils.clamp((1.18 - aspect) / 0.72, 0, 1);

  return {
    driftX: THREE.MathUtils.lerp(DESKTOP_CAMERA_FRAMING.driftX, MOBILE_CAMERA_FRAMING.driftX, portraitFactor),
    driftY: THREE.MathUtils.lerp(DESKTOP_CAMERA_FRAMING.driftY, MOBILE_CAMERA_FRAMING.driftY, portraitFactor),
    driftZ: THREE.MathUtils.lerp(DESKTOP_CAMERA_FRAMING.driftZ, MOBILE_CAMERA_FRAMING.driftZ, portraitFactor),
    fov: THREE.MathUtils.lerp(DESKTOP_CAMERA_FRAMING.fov, MOBILE_CAMERA_FRAMING.fov, portraitFactor),
    lookAtY: THREE.MathUtils.lerp(DESKTOP_CAMERA_FRAMING.lookAtY, MOBILE_CAMERA_FRAMING.lookAtY, portraitFactor),
    orbitSpeed: THREE.MathUtils.lerp(
      DESKTOP_CAMERA_FRAMING.orbitSpeed,
      MOBILE_CAMERA_FRAMING.orbitSpeed,
      portraitFactor,
    ),
    y: THREE.MathUtils.lerp(DESKTOP_CAMERA_FRAMING.y, MOBILE_CAMERA_FRAMING.y, portraitFactor),
    z: THREE.MathUtils.lerp(DESKTOP_CAMERA_FRAMING.z, MOBILE_CAMERA_FRAMING.z, portraitFactor),
  };
};

const FACE_LAYOUTS: ReadonlyArray<FaceLayout> = [
  {
    normal: [0, 0, 1],
    pips: [[0, 0]],
    rotation: [0, 0, 0],
    right: [1, 0, 0],
    up: [0, 1, 0],
  },
  {
    normal: [1, 0, 0],
    pips: [[-1, -1], [1, 1]],
    rotation: [0, Math.PI / 2, 0],
    right: [0, 0, -1],
    up: [0, 1, 0],
  },
  {
    normal: [-1, 0, 0],
    pips: [[-1, -1], [0, 0], [1, 1]],
    rotation: [0, -Math.PI / 2, 0],
    right: [0, 0, 1],
    up: [0, 1, 0],
  },
  {
    normal: [0, 1, 0],
    pips: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    rotation: [-Math.PI / 2, 0, 0],
    right: [1, 0, 0],
    up: [0, 0, -1],
  },
  {
    normal: [0, -1, 0],
    pips: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
    rotation: [Math.PI / 2, 0, 0],
    right: [1, 0, 0],
    up: [0, 0, 1],
  },
  {
    normal: [0, 0, -1],
    pips: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
    rotation: [0, Math.PI, 0],
    right: [-1, 0, 0],
    up: [0, 1, 0],
  },
];

const buildFacePosition = (normal: readonly [number, number, number]): [number, number, number] => {
  return [
    normal[0] * FACE_PANEL_SURFACE,
    normal[1] * FACE_PANEL_SURFACE,
    normal[2] * FACE_PANEL_SURFACE,
  ];
};

const drawRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
};

const createFaceTexture = (baseColor: string, pips: ReadonlyArray<readonly [number, number]>) => {
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;

  const context = canvas.getContext("2d");

  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  const bodyColor = new THREE.Color(baseColor);
  const highlight = bodyColor.clone().lerp(new THREE.Color("#ffffff"), 0.2);
  const midtone = bodyColor.clone().lerp(new THREE.Color("#ffffff"), 0.08);
  const shadow = bodyColor.clone().multiplyScalar(0.72);
  const outline = bodyColor.clone().multiplyScalar(0.58);
  const faceMargin = 26;
  const faceRadius = 88;
  const holeRadius = 38;

  context.clearRect(0, 0, canvas.width, canvas.height);

  drawRoundedRect(context, faceMargin, faceMargin, 512 - faceMargin * 2, 512 - faceMargin * 2, faceRadius);
  context.save();
  context.clip();

  const faceGradient = context.createLinearGradient(0, 0, 512, 512);
  faceGradient.addColorStop(0, `#${highlight.getHexString()}`);
  faceGradient.addColorStop(0.48, `#${midtone.getHexString()}`);
  faceGradient.addColorStop(1, `#${shadow.getHexString()}`);
  context.fillStyle = faceGradient;
  context.fillRect(0, 0, 512, 512);

  const sheenGradient = context.createLinearGradient(64, 84, 430, 448);
  sheenGradient.addColorStop(0, "rgba(255, 255, 255, 0.14)");
  sheenGradient.addColorStop(0.3, "rgba(255, 255, 255, 0)");
  sheenGradient.addColorStop(1, "rgba(0, 0, 0, 0.14)");
  context.fillStyle = sheenGradient;
  context.fillRect(0, 0, 512, 512);

  const pipOrigin = 256;
  const pipSpread = 112;

  pips.forEach(([u, v]) => {
    const x = pipOrigin + u * pipSpread;
    const y = pipOrigin + v * pipSpread;

    const shadowGlow = context.createRadialGradient(
      x,
      y + holeRadius * 0.12,
      holeRadius * 0.15,
      x,
      y,
      holeRadius * 1.3,
    );
    shadowGlow.addColorStop(0, "rgba(3, 7, 12, 0.18)");
    shadowGlow.addColorStop(1, "rgba(3, 7, 12, 0)");
    context.fillStyle = shadowGlow;
    context.beginPath();
    context.arc(x, y, holeRadius * 1.28, 0, Math.PI * 2);
    context.fill();

    const cavityGradient = context.createRadialGradient(
      x - holeRadius * 0.24,
      y - holeRadius * 0.28,
      holeRadius * 0.16,
      x,
      y,
      holeRadius,
    );
    cavityGradient.addColorStop(0, "rgba(35, 48, 64, 0.92)");
    cavityGradient.addColorStop(0.42, "rgba(11, 18, 29, 0.98)");
    cavityGradient.addColorStop(1, "rgba(2, 6, 12, 1)");
    context.fillStyle = cavityGradient;
    context.beginPath();
    context.arc(x, y, holeRadius, 0, Math.PI * 2);
    context.fill();

    context.lineWidth = 5;
    context.strokeStyle = "rgba(255, 255, 255, 0.18)";
    context.beginPath();
    context.arc(x, y, holeRadius - 1.5, Math.PI * 1.12, Math.PI * 1.92);
    context.stroke();

    context.lineWidth = 7;
    context.strokeStyle = "rgba(0, 0, 0, 0.24)";
    context.beginPath();
    context.arc(x, y, holeRadius - 1.5, Math.PI * 0.14, Math.PI * 1.08);
    context.stroke();

    const innerHighlight = context.createRadialGradient(
      x - holeRadius * 0.32,
      y - holeRadius * 0.42,
      0,
      x - holeRadius * 0.2,
      y - holeRadius * 0.22,
      holeRadius * 0.72,
    );
    innerHighlight.addColorStop(0, "rgba(255, 255, 255, 0.12)");
    innerHighlight.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = innerHighlight;
    context.beginPath();
    context.arc(x, y, holeRadius * 0.92, 0, Math.PI * 2);
    context.fill();
  });

  context.restore();

  context.lineWidth = 8;
  context.strokeStyle = `#${outline.getHexString()}`;
  drawRoundedRect(context, faceMargin, faceMargin, 512 - faceMargin * 2, 512 - faceMargin * 2, faceRadius);
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  return texture;
};

const useFaceTextures = (baseColor: string) => {
  const texturesRef = useRef<THREE.CanvasTexture[] | null>(null);

  if (texturesRef.current === null) {
    texturesRef.current = FACE_LAYOUTS.map((face) => createFaceTexture(baseColor, face.pips));
  }

  useEffect(() => {
    const textures = texturesRef.current;

    return () => {
      textures?.forEach((texture) => texture.dispose());
    };
  }, []);

  return texturesRef.current;
};

const isMotionCapablePhone = () => {
  const userAgent = globalThis.navigator.userAgent.toLowerCase();
  const isMobileAgent = /android|iphone|ipad|ipod|mobile/.test(userAgent);
  const isCoarsePointer = globalThis.matchMedia?.("(pointer: coarse)").matches ?? false;
  const hasTouch = globalThis.navigator.maxTouchPoints > 0;
  const hasTiltApi = "DeviceOrientationEvent" in globalThis;

  return hasTiltApi && (isMobileAgent || (hasTouch && isCoarsePointer));
};

const hasPermissionRequester = (
  requester: MotionPermissionRequestable | undefined,
): requester is MotionPermissionRequester => {
  return typeof requester?.requestPermission === "function";
};

const tossDie = (body: RapierRigidBody, index: number, intensity = 1) => {
  const lateralBias = index === 0 ? -1 : 1;
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    ),
  );

  body.setTranslation(
    {
      x: lateralBias * 0.72 + (Math.random() - 0.5) * 0.18,
      y: 2.2 + Math.random() * 0.75,
      z: (Math.random() - 0.5) * 0.45,
    },
    true,
  );
  body.setRotation(quaternion, true);
  body.setLinvel(
    {
      x: lateralBias * (0.75 + Math.random() * 0.7) * intensity,
      y: (6.5 + Math.random() * 1.8) * intensity,
      z: (Math.random() - 0.5) * 2.8 * intensity,
    },
    true,
  );
  body.setAngvel(
    {
      x: (Math.random() - 0.5) * 22 * intensity,
      y: (Math.random() - 0.5) * 24 * intensity,
      z: (Math.random() - 0.5) * 22 * intensity,
    },
    true,
  );
  body.applyImpulse(
    {
      x: lateralBias * 0.45 * intensity,
      y: 1.9 * intensity,
      z: (Math.random() - 0.5) * 0.75 * intensity,
    },
    true,
  );
};

const GravityController = ({ gravity }: { gravity: GravityVector }) => {
  const { rapier, world } = useRapier();

  useEffect(() => {
    world.gravity = new rapier.Vector3(gravity[0], gravity[1], gravity[2]);
  }, [gravity, rapier, world]);

  return null;
};

const CameraRig = () => {
  const { camera } = useThree();
  const targetPositionRef = useRef(new THREE.Vector3(0, DESKTOP_CAMERA_FRAMING.y, DESKTOP_CAMERA_FRAMING.z));
  const lookAtRef = useRef(new THREE.Vector3(0, DESKTOP_CAMERA_FRAMING.lookAtY, 0));

  useFrame((state, delta) => {
    const framing = getResponsiveCameraFraming(state.size.width / Math.max(state.size.height, 1));
    const time = state.clock.getElapsedTime() * framing.orbitSpeed;
    const driftX = Math.sin(time) * framing.driftX;
    const driftY = framing.y + Math.sin(time * 1.5) * framing.driftY;
    const driftZ = framing.z + Math.cos(time * 1.2) * framing.driftZ;

    targetPositionRef.current.set(driftX, driftY, driftZ);
    lookAtRef.current.y = THREE.MathUtils.damp(lookAtRef.current.y, framing.lookAtY, 4, delta);
    camera.position.lerp(targetPositionRef.current, 1 - Math.exp(-delta * 2.25));

    if (camera instanceof THREE.PerspectiveCamera) {
      const nextFov = THREE.MathUtils.damp(camera.fov, framing.fov, 4.8, delta);

      if (Math.abs(nextFov - camera.fov) > 0.01) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
      }
    }

    camera.lookAt(lookAtRef.current);
  });

  return null;
};

const RoomShell = () => {
  return (
    <>
      <RigidBody colliders={false} type="fixed">
        <CuboidCollider args={[5.8, 0.35, 5.8]} friction={1.3} position={[0, -0.35, 0]} />
        <CuboidCollider args={[5.8, 3.2, 0.28]} friction={1.1} position={[0, 3.05, -5.55]} />
        <CuboidCollider args={[0.28, 3.2, 5.8]} friction={1.1} position={[-5.55, 3.05, 0]} />
        <CuboidCollider args={[0.28, 3.2, 5.8]} friction={1.1} position={[5.55, 3.05, 0]} />
        <CuboidCollider args={[5.8, 0.2, 5.8]} position={[0, 6.25, 0]} />

        <mesh position={[0, -0.35, 0]} receiveShadow>
          <boxGeometry args={[11.6, 0.7, 11.6]} />
          <meshStandardMaterial color="#06131d" metalness={0.18} roughness={0.85} />
        </mesh>

        <mesh position={[0, 3.1, -5.56]} receiveShadow>
          <boxGeometry args={[11.6, 6.4, 0.18]} />
          <meshStandardMaterial color="#091725" metalness={0.24} roughness={0.58} />
        </mesh>

        <mesh position={[-5.56, 3.1, 0]} receiveShadow>
          <boxGeometry args={[0.18, 6.4, 11.6]} />
          <meshStandardMaterial color="#081826" metalness={0.18} roughness={0.62} />
        </mesh>

        <mesh position={[5.56, 3.1, 0]} receiveShadow>
          <boxGeometry args={[0.18, 6.4, 11.6]} />
          <meshStandardMaterial color="#081826" metalness={0.18} roughness={0.62} />
        </mesh>

        <mesh position={[0, 6.25, 0]} receiveShadow>
          <boxGeometry args={[11.6, 0.18, 11.6]} />
          <meshStandardMaterial color="#07111b" metalness={0.14} roughness={0.55} />
        </mesh>
      </RigidBody>

      <mesh position={[-4.45, 2.55, -3.55]} rotation={[0, 0, Math.PI / 28]}>
        <boxGeometry args={[0.2, 3.4, 0.2]} />
        <meshStandardMaterial
          color="#5dd8ff"
          emissive="#5dd8ff"
          emissiveIntensity={1.35}
          metalness={0.12}
          roughness={0.18}
        />
      </mesh>

      <mesh position={[4.4, 2.3, -3.85]} rotation={[0, 0, -Math.PI / 26]}>
        <boxGeometry args={[0.18, 2.9, 0.18]} />
        <meshStandardMaterial
          color="#39d886"
          emissive="#39d886"
          emissiveIntensity={1.15}
          metalness={0.12}
          roughness={0.18}
        />
      </mesh>

      <mesh position={[0, 4.65, -2.4]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.15, 0.08, 24, 90]} />
        <meshStandardMaterial
          color="#0f2a40"
          emissive="#2676a5"
          emissiveIntensity={0.72}
          metalness={0.24}
          roughness={0.34}
        />
      </mesh>

      <mesh position={[0, 1.15, -4.85]} rotation={[0, Math.PI / 7, 0]}>
        <boxGeometry args={[3.2, 0.08, 1.4]} />
        <meshStandardMaterial
          color="#163448"
          emissive="#2b91d3"
          emissiveIntensity={0.55}
          metalness={0.22}
          roughness={0.28}
        />
      </mesh>
    </>
  );
};

const DiceBody = ({ bodyRef, color, glow, initialPosition }: DiceBodyProps) => {
  const faceTextures = useFaceTextures(color);

  return (
    <RigidBody
      angularDamping={1.9}
      canSleep
      ccd
      colliders={false}
      friction={1.22}
      linearDamping={1.15}
      position={initialPosition}
      ref={bodyRef}
      restitution={0.2}
    >
      <CuboidCollider args={[DICE_HALF_SIZE, DICE_HALF_SIZE, DICE_HALF_SIZE]} friction={1.22} restitution={0.2} />

      <RoundedBox args={[0.92, 0.92, 0.92]} castShadow radius={0.12} receiveShadow smoothness={5}>
        <meshPhysicalMaterial
          clearcoat={1}
          clearcoatRoughness={0.12}
          color={color}
          emissive={glow}
          emissiveIntensity={0.26}
          metalness={0.1}
          roughness={0.32}
        />
      </RoundedBox>

      {FACE_LAYOUTS.map((face, faceIndex) => (
        <mesh
          key={faceIndex}
          position={buildFacePosition(face.normal)}
          renderOrder={1}
          rotation={face.rotation}
        >
          <planeGeometry args={[FACE_PANEL_SIZE, FACE_PANEL_SIZE]} />
          <meshStandardMaterial
            alphaTest={0.04}
            map={faceTextures[faceIndex]}
            metalness={0.04}
            polygonOffset
            polygonOffsetFactor={-1}
            roughness={0.3}
            transparent
          />
        </mesh>
      ))}
    </RigidBody>
  );
};

const DiceScene = ({
  blueDieRef,
  gravity,
  greenDieRef,
}: {
  blueDieRef: MutableRefObject<RapierRigidBody | null>;
  gravity: GravityVector;
  greenDieRef: MutableRefObject<RapierRigidBody | null>;
}) => {
  return (
    <>
      <color attach="background" args={["#040a11"]} />
      <fog attach="fog" args={["#040910", 10, 20]} />

      <CameraRig />

      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#9ddfff", "#03111c", 0.88]} />
      <directionalLight
        castShadow
        intensity={2.2}
        position={[4.5, 8, 4]}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
      />
      <spotLight
        angle={0.55}
        castShadow
        color="#e8f6ff"
        distance={24}
        intensity={40}
        penumbra={0.95}
        position={[0, 8.4, 2.8]}
      />
      <pointLight color="#46c5ff" distance={12} intensity={16} position={[-3.25, 2.4, 1.8]} />
      <pointLight color="#2fe081" distance={11} intensity={13} position={[3.35, 2.1, -0.2]} />

      <Suspense fallback={null}>
        <Physics colliders={false} gravity={DEFAULT_GRAVITY}>
          <GravityController gravity={gravity} />
          <RoomShell />
          <DiceBody bodyRef={blueDieRef} color="#2d74ff" glow="#57baff" initialPosition={[-0.95, 2.4, -0.2]} />
          <DiceBody bodyRef={greenDieRef} color="#19b86a" glow="#7fffb3" initialPosition={[1.05, 2.7, 0.35]} />
        </Physics>
      </Suspense>

      <ContactShadows blur={2.8} color="#001626" far={8.5} opacity={0.52} position={[0, -0.34, 0]} scale={8.6} />
    </>
  );
};

export const DicePage = () => {
  const blueDieRef = useRef<RapierRigidBody | null>(null);
  const greenDieRef = useRef<RapierRigidBody | null>(null);
  const [gravity, setGravity] = useState<GravityVector>(DEFAULT_GRAVITY);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("desktop");
  const gravityRef = useRef<GravityVector>(DEFAULT_GRAVITY);
  const shakeCooldownRef = useRef(0);

  const shuffleDice = useEffectEvent((intensity = 1.05) => {
    if (!blueDieRef.current || !greenDieRef.current) {
      return;
    }

    tossDie(blueDieRef.current, 0, intensity);
    tossDie(greenDieRef.current, 1, intensity);
  });

  const updateGravityFromTilt = useEffectEvent((event: DeviceOrientationEvent) => {
    if (event.beta === null || event.gamma === null) {
      return;
    }

    const lateralX = THREE.MathUtils.clamp(event.gamma / MAX_TILT_DEGREES, -1, 1) * (BASE_GRAVITY * 0.5);
    const lateralZ = THREE.MathUtils.clamp((event.beta - BETA_NEUTRAL) / MAX_TILT_DEGREES, -1, 1) *
      (BASE_GRAVITY * 0.42);
    const downward = -Math.sqrt(
      Math.max((BASE_GRAVITY ** 2) - (lateralX ** 2) - (lateralZ ** 2), (BASE_GRAVITY ** 2) * 0.48),
    );
    const current = gravityRef.current;
    const next: GravityVector = [
      THREE.MathUtils.lerp(current[0], lateralX, GRAVITY_EASING),
      THREE.MathUtils.lerp(current[1], downward, GRAVITY_EASING),
      THREE.MathUtils.lerp(current[2], lateralZ, GRAVITY_EASING),
    ];
    const totalDelta = Math.abs(next[0] - current[0]) + Math.abs(next[1] - current[1]) + Math.abs(next[2] - current[2]);

    if (totalDelta < 0.08) {
      return;
    }

    gravityRef.current = next;
    startTransition(() => setGravity(next));
  });

  const handleShake = useEffectEvent((event: DeviceMotionEvent) => {
    const now = Date.now();

    if (now - shakeCooldownRef.current < SHAKE_COOLDOWN_MS) {
      return;
    }

    const acceleration = event.acceleration;
    const accelerationWithGravity = event.accelerationIncludingGravity;
    const rawMagnitude = acceleration
      ? Math.hypot(acceleration.x ?? 0, acceleration.y ?? 0, acceleration.z ?? 0)
      : Math.abs(
        Math.hypot(
          accelerationWithGravity?.x ?? 0,
          accelerationWithGravity?.y ?? 0,
          accelerationWithGravity?.z ?? 0,
        ) - 9.81,
      );

    if (rawMagnitude < SHAKE_THRESHOLD) {
      return;
    }

    shakeCooldownRef.current = now;
    shuffleDice(1.2);
  });

  useEffect(() => {
    if (!isMotionCapablePhone()) {
      setInteractionMode("desktop");
      return;
    }

    const orientationCtor = globalThis.DeviceOrientationEvent as MotionPermissionRequestable | undefined;
    const motionCtor = globalThis.DeviceMotionEvent as MotionPermissionRequestable | undefined;
    const requiresPermission = typeof orientationCtor?.requestPermission === "function" ||
      typeof motionCtor?.requestPermission === "function";

    setInteractionMode(requiresPermission ? "motion-pending" : "motion-ready");
  }, []);

  useEffect(() => {
    let attempts = 0;
    const intervalId = globalThis.setInterval(() => {
      if (blueDieRef.current && greenDieRef.current) {
        shuffleDice(1.05);
        globalThis.clearInterval(intervalId);
        return;
      }

      attempts += 1;

      if (attempts > 20) {
        globalThis.clearInterval(intervalId);
      }
    }, 120);

    return () => {
      globalThis.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (interactionMode !== "motion-ready") {
      return;
    }

    const onOrientation = (event: Event) => {
      updateGravityFromTilt(event as DeviceOrientationEvent);
    };
    const onMotion = (event: Event) => {
      handleShake(event as DeviceMotionEvent);
    };

    globalThis.addEventListener("deviceorientation", onOrientation, true);
    globalThis.addEventListener("devicemotion", onMotion, true);

    return () => {
      globalThis.removeEventListener("deviceorientation", onOrientation, true);
      globalThis.removeEventListener("devicemotion", onMotion, true);
    };
  }, [interactionMode]);

  const requestMotionAccess = async () => {
    const orientationCtor = globalThis.DeviceOrientationEvent as MotionPermissionRequestable | undefined;
    const motionCtor = globalThis.DeviceMotionEvent as MotionPermissionRequestable | undefined;
    const requesters = [orientationCtor, motionCtor].filter((requester) => hasPermissionRequester(requester));

    if (requesters.length === 0) {
      setInteractionMode("motion-ready");
      return;
    }

    try {
      const permissionResults = await Promise.all(requesters.map((requester) => requester.requestPermission!()));
      const isGranted = permissionResults.every((result) => result === "granted");

      setInteractionMode(isGranted ? "motion-ready" : "motion-blocked");
    } catch {
      setInteractionMode("motion-blocked");
    }
  };

  const isDesktopMode = interactionMode === "desktop";

  return (
    <section
      aria-label="Dice physics room"
      className={`page-shell dice-page${isDesktopMode ? " dice-page--clickable" : ""}`}
      onClick={isDesktopMode ? () => shuffleDice(1.14) : undefined}
    >
      <div className="canvas">
        <Canvas camera={{ fov: 40, position: [0, 4.85, 6.15] }} dpr={[1, 2]} shadows>
          <DiceScene blueDieRef={blueDieRef} gravity={gravity} greenDieRef={greenDieRef} />
        </Canvas>
      </div>

      <div className="dice-overlay">
        <div className="dice-copy">
          <p className="dice-kicker">Dice</p>
          <h1 className="dice-title">Abstract room. Real rigid-body dice.</h1>
          <p className="dice-description">
            Heavier gravity keeps the blue and green cubes landing with weight instead of drifting forever.
          </p>
        </div>

        <div className="dice-controls">
          <span className="dice-chip">Blue and green dice</span>
          <span className="dice-chip">
            {isDesktopMode ? "Desktop: click anywhere to shuffle" : "Phone: tilt to steer, shake to reshuffle"}
          </span>

          {interactionMode === "motion-pending" && (
            <button
              className="dice-cta"
              onClick={(event) => {
                event.stopPropagation();
                void requestMotionAccess();
              }}
              type="button"
            >
              Enable motion
            </button>
          )}

          {interactionMode === "motion-blocked" && (
            <p className="dice-warning">
              Motion access is blocked on this device, so the scene stays passive until sensor permission is enabled.
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
