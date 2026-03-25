import { ContactShadows, Html } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import eagleSvgText from "../assets/coin-eagle-ref.svg?raw";
import headSvgText from "../assets/coin-head-ref.svg?raw";

const EDGE_RIDGE_COUNT = 120;
const RELIEF_EXTRUDE_SETTINGS = {
  bevelEnabled: true,
  bevelSegments: 4,
  bevelSize: 0.055,
  bevelThickness: 0.05,
  curveSegments: 10,
  depth: 1,
  steps: 1,
} as const;
const RELIEF_CURVE_SEGMENTS = 18;
const RELIEF_MAX_SHAPES = 24;
const RELIEF_MAX_OUTER_POINTS = 220;
const RELIEF_MAX_HOLE_POINTS = 88;
type ReliefNormalizationOptions = {
  curveSegments?: number;
  maxHolePoints?: number;
  maxOuterPoints?: number;
  maxShapes?: number;
  minAreaRatio?: number;
};
type ReliefShapePoints = {
  holes: THREE.Vector2[][];
  outer: THREE.Vector2[];
};
type NormalizedReliefShape = {
  area: number;
  shape: THREE.Shape;
};

type ReliefStampProps = {
  color: string;
  depth: number;
  emissive: string;
  position: [number, number, number];
  roughness: number;
  rotation?: [number, number, number];
  scale: number;
  shapes: THREE.Shape[];
};

type CoinFaceProps = {
  fieldRadius: number;
  planeOffset: number;
  reliefDepth: number;
  type: "heads" | "tails";
  texture: THREE.CanvasTexture;
};

const cleanLoop = (points: THREE.Vector2[]) => {
  const deduped = points.filter((point, index) => {
    if (index === 0) {
      return true;
    }

    return point.distanceToSquared(points[index - 1]!) > 1e-7;
  });

  if (deduped.length > 1 && deduped[0]!.distanceToSquared(deduped[deduped.length - 1]!) <= 1e-7) {
    deduped.pop();
  }

  return deduped;
};

const sampleLoop = (points: THREE.Vector2[], maxPoints: number) => {
  const cleaned = cleanLoop(points);

  if (cleaned.length <= maxPoints) {
    return cleaned;
  }

  const sampled: THREE.Vector2[] = [];
  const step = cleaned.length / maxPoints;

  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(cleaned[Math.floor(index * step)]!.clone());
  }

  return sampled;
};

const applyLoopToPath = (path: THREE.Path, points: THREE.Vector2[]) => {
  if (points.length < 3) {
    return;
  }

  path.moveTo(points[0]!.x, points[0]!.y);

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    path.lineTo(point.x, point.y);
  }

  path.closePath();
};

const createShapeFromTuples = (points: Array<[number, number]>) => {
  const shape = new THREE.Shape();
  applyLoopToPath(
    shape,
    points.map(([x, y]) => new THREE.Vector2(x, y)),
  );
  return shape;
};

const normalizeReliefShapes = (svgText: string, options: ReliefNormalizationOptions = {}) => {
  const {
    curveSegments = RELIEF_CURVE_SEGMENTS,
    maxHolePoints = RELIEF_MAX_HOLE_POINTS,
    maxOuterPoints = RELIEF_MAX_OUTER_POINTS,
    maxShapes = RELIEF_MAX_SHAPES,
    minAreaRatio = 0.0012,
  } = options;
  const loader = new SVGLoader();
  const parsed = loader.parse(svgText);
  const extractedShapes = parsed.paths
    .filter((path: THREE.ShapePath) => {
      const fill = path.userData?.style?.fill;
      return typeof fill === "string" && fill !== "none" && !fill.startsWith("url(");
    })
    .flatMap((path: THREE.ShapePath) => SVGLoader.createShapes(path))
    .map((shape: THREE.Shape) => shape.extractPoints(curveSegments))
    .map(({ holes, shape }: { holes: THREE.Vector2[][]; shape: THREE.Vector2[] }): ReliefShapePoints => ({
      holes: holes
        .map((holePoints: THREE.Vector2[]) => sampleLoop(holePoints, maxHolePoints))
        .filter((holePoints: THREE.Vector2[]) => holePoints.length >= 3),
      outer: sampleLoop(shape, maxOuterPoints),
    }))
    .filter(({ outer }: ReliefShapePoints) => outer.length >= 3);

  const allPoints = extractedShapes.flatMap(({ holes, outer }: ReliefShapePoints) => [...outer, ...holes.flat()]);

  if (allPoints.length === 0) {
    return [] as THREE.Shape[];
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  allPoints.forEach((point: THREE.Vector2) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  });

  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const scale = 2 / Math.max(maxX - minX, maxY - minY);

  const toNormalizedLoop = (points: THREE.Vector2[]) =>
    points.map((point) =>
      new THREE.Vector2(
        (point.x - centerX) * scale,
        (centerY - point.y) * scale,
      )
    );

  const normalized = extractedShapes
    .map(({ holes, outer }: ReliefShapePoints): NormalizedReliefShape => {
      const normalizedOuter = toNormalizedLoop(outer);
      const normalizedHoles = holes.map((holePoints: THREE.Vector2[]) => toNormalizedLoop(holePoints));
      const reliefShape = new THREE.Shape();
      const outerBounds = normalizedOuter.reduce((bounds, point) => ({
        maxX: Math.max(bounds.maxX, point.x),
        maxY: Math.max(bounds.maxY, point.y),
        minX: Math.min(bounds.minX, point.x),
        minY: Math.min(bounds.minY, point.y),
      }), {
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
      });
      const outerWidth = outerBounds.maxX - outerBounds.minX;
      const outerHeight = outerBounds.maxY - outerBounds.minY;
      const outerArea = Math.abs(THREE.ShapeUtils.area(normalizedOuter));

      applyLoopToPath(reliefShape, normalizedOuter);
      normalizedHoles.forEach((holePoints: THREE.Vector2[]) => {
        const hole = new THREE.Path();
        applyLoopToPath(hole, holePoints);
        reliefShape.holes.push(hole);
      });

      const isFrameShape = outerWidth > 0.95 && outerHeight > 1.65 && outerArea / (outerWidth * outerHeight) > 0.84;

      return {
        area: isFrameShape ? 0 : outerArea,
        shape: reliefShape,
      };
    })
    .sort((left: NormalizedReliefShape, right: NormalizedReliefShape) => right.area - left.area);

  const largestArea = normalized[0]?.area ?? 0;

  return normalized
    .filter(({ area }: NormalizedReliefShape) => area >= largestArea * minAreaRatio)
    .slice(0, maxShapes)
    .map(({ shape }: NormalizedReliefShape) => shape);
};

const HEAD_RELIEF_SHAPES = normalizeReliefShapes(headSvgText, {
  maxShapes: 18,
  minAreaRatio: 0.0014,
});
const EAGLE_RELIEF_SHAPES = normalizeReliefShapes(eagleSvgText, {
  curveSegments: 14,
  maxHolePoints: 64,
  maxOuterPoints: 240,
  maxShapes: 18,
  minAreaRatio: 0.0006,
});
const EAGLE_DETAIL_SHAPES = EAGLE_RELIEF_SHAPES.slice(1, 10);
const HEAD_FACE_RELIEF_SHAPE = createShapeFromTuples([
  [-0.1, 0.48],
  [-0.2, 0.44],
  [-0.28, 0.3],
  [-0.33, 0.14],
  [-0.4, 0.03],
  [-0.37, -0.12],
  [-0.25, -0.18],
  [-0.31, -0.33],
  [-0.21, -0.48],
  [-0.03, -0.52],
  [0.06, -0.36],
  [0.01, -0.18],
  [0.04, -0.02],
  [0, 0.17],
  [0.02, 0.34],
]);
const HEAD_HAIR_RELIEF_SHAPE = createShapeFromTuples([
  [-0.5, 0.66],
  [-0.3, 0.8],
  [-0.02, 0.82],
  [0.17, 0.73],
  [0.28, 0.56],
  [0.08, 0.53],
  [-0.12, 0.55],
  [-0.31, 0.55],
  [-0.45, 0.58],
]);
const HEAD_NECK_RELIEF_SHAPE = createShapeFromTuples([
  [-0.16, -0.19],
  [0.02, -0.12],
  [0.11, -0.33],
  [0.06, -0.52],
  [-0.11, -0.59],
  [-0.24, -0.48],
  [-0.24, -0.31],
]);
const HEAD_COLLAR_RELIEF_SHAPE = createShapeFromTuples([
  [-0.18, -0.56],
  [0.13, -0.56],
  [0.29, -0.83],
  [-0.02, -0.87],
  [-0.22, -0.72],
]);

const createCoinFieldTexture = () => {
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;

  const context = canvas.getContext("2d");

  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  const base = new THREE.Color("#e0b54d");
  const highlight = base.clone().lerp(new THREE.Color("#fff1ba"), 0.42);
  const midtone = base.clone().lerp(new THREE.Color("#ffe08f"), 0.32);
  const shadow = base.clone().multiplyScalar(0.82);
  const deepShadow = base.clone().multiplyScalar(0.68);

  context.clearRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.beginPath();
  context.arc(512, 512, 490, 0, Math.PI * 2);
  context.clip();

  const faceGradient = context.createRadialGradient(398, 340, 84, 512, 512, 540);
  faceGradient.addColorStop(0, `#${highlight.getHexString()}`);
  faceGradient.addColorStop(0.42, `#${midtone.getHexString()}`);
  faceGradient.addColorStop(0.82, `#${shadow.getHexString()}`);
  faceGradient.addColorStop(1, `#${deepShadow.getHexString()}`);
  context.fillStyle = faceGradient;
  context.fillRect(0, 0, 1024, 1024);

  const sheen = context.createLinearGradient(148, 92, 840, 920);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.22)");
  sheen.addColorStop(0.24, "rgba(255, 255, 255, 0.06)");
  sheen.addColorStop(0.58, "rgba(255, 214, 112, 0.02)");
  sheen.addColorStop(1, "rgba(74, 32, 0, 0.12)");
  context.fillStyle = sheen;
  context.fillRect(0, 0, 1024, 1024);

  context.lineWidth = 8;
  [278, 372, 448].forEach((radius, index) => {
    context.beginPath();
    context.strokeStyle = index === 1 ? "rgba(255, 246, 208, 0.18)" : "rgba(94, 52, 12, 0.1)";
    context.arc(512, 512, radius, 0, Math.PI * 2);
    context.stroke();
  });

  context.restore();

  context.beginPath();
  context.arc(512, 512, 490, 0, Math.PI * 2);
  context.lineWidth = 18;
  context.strokeStyle = "rgba(94, 52, 12, 0.22)";
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
};

const useCoinFieldTexture = () => {
  const textureRef = useRef<THREE.CanvasTexture | null>(null);

  if (textureRef.current === null) {
    textureRef.current = createCoinFieldTexture();
  }

  useEffect(() => {
    const texture = textureRef.current;

    return () => texture?.dispose();
  }, []);

  return textureRef.current;
};

const ReliefStamp = ({
  color,
  depth,
  emissive,
  position,
  roughness,
  rotation = [0, 0, 0],
  scale,
  shapes,
}: ReliefStampProps) => {
  return (
    <group position={position} rotation={rotation} scale={[scale, scale, depth]}>
      {shapes.map((shape, index) => (
        <mesh castShadow key={`${index}-${shape.uuid}`} receiveShadow>
          <extrudeGeometry args={[shape, RELIEF_EXTRUDE_SETTINGS]} />
          <meshPhysicalMaterial
            clearcoat={0.34}
            clearcoatRoughness={0.32}
            color={color}
            emissive={emissive}
            emissiveIntensity={0.08}
            metalness={0.95}
            roughness={roughness}
          />
        </mesh>
      ))}
    </group>
  );
};

const CoinFace = ({ fieldRadius, planeOffset, reliefDepth, texture, type }: CoinFaceProps) => {
  const isHeads = type === "heads";
  const reliefLift = reliefDepth * 0.45;
  const outerRingLift = reliefDepth * 0.2;
  const innerRingLift = reliefDepth * 0.12;
  const groupRotation: [number, number, number] = isHeads ? [-Math.PI / 2, 0, 0] : [Math.PI / 2, 0, Math.PI];
  const groupPosition: [number, number, number] = [0, isHeads ? planeOffset : -planeOffset, 0];

  return (
    <group position={groupPosition} rotation={groupRotation}>
      <mesh castShadow position={[0, 0, reliefDepth * 0.05]} receiveShadow>
        <circleGeometry args={[fieldRadius, 96]} />
        <meshPhysicalMaterial
          clearcoat={0.5}
          clearcoatRoughness={0.22}
          color="#f0c257"
          map={texture}
          metalness={1}
          roughness={0.3}
        />
      </mesh>

      <mesh castShadow position={[0, 0, outerRingLift]} receiveShadow>
        <torusGeometry args={[fieldRadius * 0.92, reliefDepth * 0.26, 18, 108]} />
        <meshPhysicalMaterial
          clearcoat={0.8}
          clearcoatRoughness={0.18}
          color="#ffe6aa"
          emissive="#f6d77d"
          emissiveIntensity={0.07}
          metalness={1}
          roughness={0.16}
        />
      </mesh>

      <mesh castShadow position={[0, 0, innerRingLift]} receiveShadow>
        <torusGeometry args={[fieldRadius * 0.56, reliefDepth * 0.16, 16, 84]} />
        <meshPhysicalMaterial
          clearcoat={0.7}
          clearcoatRoughness={0.18}
          color="#c88b24"
          metalness={1}
          roughness={0.22}
        />
      </mesh>

      {isHeads
        ? (
          <>
            <ReliefStamp
              color="#8d5d15"
              depth={reliefDepth * 0.52}
              emissive="#5b3506"
              position={[-fieldRadius * 0.1, -fieldRadius * 0.11, reliefLift * 0.56]}
              roughness={0.36}
              scale={fieldRadius * 0.66}
              shapes={HEAD_RELIEF_SHAPES}
            />
            <ReliefStamp
              color="#f6dda2"
              depth={reliefDepth * 0.88}
              emissive="#edc55a"
              position={[-fieldRadius * 0.06, -fieldRadius * 0.07, reliefLift * 0.92]}
              roughness={0.24}
              scale={fieldRadius * 0.62}
              shapes={HEAD_RELIEF_SHAPES}
            />
            <ReliefStamp
              color="#9b6b22"
              depth={reliefDepth * 0.34}
              emissive="#6a430b"
              position={[-fieldRadius * 0.08, -fieldRadius * 0.08, reliefLift * 1.02]}
              roughness={0.3}
              scale={fieldRadius * 0.48}
              shapes={HEAD_RELIEF_SHAPES}
            />
            <ReliefStamp
              color="#6b430f"
              depth={reliefDepth * 0.18}
              emissive="#2b1200"
              position={[-fieldRadius * 0.12, -fieldRadius * 0.07, reliefLift * 1.06]}
              roughness={0.4}
              scale={fieldRadius * 0.56}
              shapes={[HEAD_HAIR_RELIEF_SHAPE]}
            />
            <ReliefStamp
              color="#553006"
              depth={reliefDepth * 0.18}
              emissive="#1c0900"
              position={[-fieldRadius * 0.15, -fieldRadius * 0.04, reliefLift * 1.1]}
              roughness={0.42}
              scale={fieldRadius * 0.5}
              shapes={[HEAD_FACE_RELIEF_SHAPE]}
            />
            <ReliefStamp
              color="#a47327"
              depth={reliefDepth * 0.22}
              emissive="#70460c"
              position={[-fieldRadius * 0.03, -fieldRadius * 0.19, reliefLift * 1.02]}
              roughness={0.24}
              scale={fieldRadius * 0.38}
              shapes={[HEAD_NECK_RELIEF_SHAPE]}
            />
            <ReliefStamp
              color="#bc8b34"
              depth={reliefDepth * 0.2}
              emissive="#85540f"
              position={[0, -fieldRadius * 0.28, reliefLift * 0.96]}
              roughness={0.2}
              scale={fieldRadius * 0.42}
              shapes={[HEAD_COLLAR_RELIEF_SHAPE]}
            />
          </>
        )
        : (
          <>
            <ReliefStamp
              color="#8c5c15"
              depth={reliefDepth * 0.52}
              emissive="#5f3907"
              position={[-fieldRadius * 0.03, -fieldRadius * 0.03, reliefLift * 0.54]}
              roughness={0.34}
              scale={fieldRadius * 0.6}
              shapes={EAGLE_RELIEF_SHAPES}
            />
            <ReliefStamp
              color="#f0d089"
              depth={reliefDepth * 0.84}
              emissive="#ddb34e"
              position={[0, -fieldRadius * 0.01, reliefLift * 0.9]}
              roughness={0.2}
              scale={fieldRadius * 0.56}
              shapes={EAGLE_RELIEF_SHAPES}
            />
            <ReliefStamp
              color="#9f6e1e"
              depth={reliefDepth * 0.28}
              emissive="#6b4209"
              position={[fieldRadius * 0.01, fieldRadius * 0.03, reliefLift * 1.06]}
              roughness={0.28}
              scale={fieldRadius * 0.54}
              shapes={EAGLE_DETAIL_SHAPES}
            />
          </>
        )}
    </group>
  );
};

const Coin = () => {
  const coinRef = useRef<THREE.Group>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fieldTexture = useCoinFieldTexture();
  const { viewport } = useThree();

  const spinSpeedRef = useRef(0);
  const targetSpinsRef = useRef(0);
  const decelerationRef = useRef(0);

  const coinRadius = Math.min(viewport.width, viewport.height) * 0.36;
  const coinThickness = coinRadius * 0.15;
  const halfThickness = coinThickness / 2;
  const facePlaneOffset = halfThickness * 0.82;
  const fieldRadius = coinRadius * 0.81;
  const reliefDepth = coinThickness * 0.18;
  const ridgeRadius = coinRadius * 0.996;
  const ridgeHeight = coinThickness * 0.8;
  const ridgeWidth = coinRadius * 0.028;
  const ridgeDepth = coinRadius * 0.018;
  const shadowScale = coinRadius * 3.8;
  const shadowHeight = coinRadius * 1.08;

  const coinProfile = [
    new THREE.Vector2(0, facePlaneOffset),
    new THREE.Vector2(coinRadius * 0.46, facePlaneOffset),
    new THREE.Vector2(coinRadius * 0.76, halfThickness * 0.88),
    new THREE.Vector2(coinRadius * 0.9, halfThickness * 0.94),
    new THREE.Vector2(coinRadius * 0.97, halfThickness * 0.98),
    new THREE.Vector2(coinRadius, halfThickness),
    new THREE.Vector2(coinRadius, -halfThickness),
    new THREE.Vector2(coinRadius * 0.97, -halfThickness * 0.98),
    new THREE.Vector2(coinRadius * 0.9, -halfThickness * 0.94),
    new THREE.Vector2(coinRadius * 0.76, -halfThickness * 0.88),
    new THREE.Vector2(coinRadius * 0.46, -facePlaneOffset),
    new THREE.Vector2(0, -facePlaneOffset),
  ];

  const edgeRidges = Array.from({ length: EDGE_RIDGE_COUNT }, (_, index) => {
    const angle = (index / EDGE_RIDGE_COUNT) * Math.PI * 2;

    return {
      angle,
      key: index,
      position: [
        Math.cos(angle) * ridgeRadius,
        0,
        Math.sin(angle) * ridgeRadius,
      ] as [number, number, number],
      rotation: [0, angle + Math.PI / 2, 0] as [number, number, number],
    };
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();

    if (isSpinning) {
      return;
    }

    setIsSpinning(true);
    setResult(null);

    spinSpeedRef.current = 28;
    targetSpinsRef.current = 3.4 + Math.random() * 2.2;

    const targetRotation = targetSpinsRef.current * Math.PI * 2;
    decelerationRef.current = -(spinSpeedRef.current * spinSpeedRef.current) / (2 * targetRotation);
  };

  useFrame((_, delta) => {
    if (!isSpinning || !coinRef.current) {
      return;
    }

    coinRef.current.rotation.x += spinSpeedRef.current * delta;
    spinSpeedRef.current += decelerationRef.current * delta;

    if (spinSpeedRef.current > 0) {
      return;
    }

    spinSpeedRef.current = 0;
    setIsSpinning(false);

    const quarterTurns = Math.round(coinRef.current.rotation.x / (Math.PI / 2));
    const normalizedQuarterTurn = THREE.MathUtils.euclideanModulo(quarterTurns, 4);
    const snappedQuarterTurn = normalizedQuarterTurn % 2 === 1 ? quarterTurns : quarterTurns + 1;
    const snappedRotation = snappedQuarterTurn * (Math.PI / 2);

    coinRef.current.rotation.x = snappedRotation;
    setResult(THREE.MathUtils.euclideanModulo(snappedQuarterTurn, 4) === 1 ? "Heads" : "Tails");
  });

  return (
    <group>
      <group onClick={handleClick} ref={coinRef} rotation={[Math.PI / 2, 0, 0]}>
        <mesh castShadow receiveShadow>
          <latheGeometry args={[coinProfile, 160]} />
          <meshPhysicalMaterial
            clearcoat={0.78}
            clearcoatRoughness={0.16}
            color="#e7b74d"
            emissive="#c0821f"
            emissiveIntensity={0.09}
            metalness={1}
            roughness={0.18}
          />
        </mesh>

        {edgeRidges.map((ridge) => (
          <mesh
            castShadow
            key={ridge.key}
            position={ridge.position}
            receiveShadow
            rotation={ridge.rotation}
          >
            <boxGeometry args={[ridgeWidth, ridgeHeight, ridgeDepth]} />
            <meshPhysicalMaterial
              clearcoat={0.45}
              clearcoatRoughness={0.22}
              color="#ffdfa0"
              emissive="#bf8320"
              emissiveIntensity={0.04}
              metalness={1}
              roughness={0.24}
            />
          </mesh>
        ))}

        <CoinFace
          fieldRadius={fieldRadius}
          planeOffset={facePlaneOffset}
          reliefDepth={reliefDepth}
          texture={fieldTexture}
          type="heads"
        />
        <CoinFace
          fieldRadius={fieldRadius}
          planeOffset={facePlaneOffset}
          reliefDepth={reliefDepth}
          texture={fieldTexture}
          type="tails"
        />
      </group>

      <ContactShadows
        blur={2.8}
        color="#7b4310"
        far={coinRadius * 2.4}
        opacity={0.34}
        position={[0, -shadowHeight, 0]}
        scale={shadowScale}
      />

      {result && (
        <Html center position={[0, coinRadius * 1.92, 0]}>
          <div className="result">{result}</div>
        </Html>
      )}
    </group>
  );
};

const CameraSetup = () => {
  const { camera } = useThree();
  const timeRef = useRef(0);
  const orbit = useRef({
    arcAngle: 11 * (Math.PI / 180),
    radius: 9.35,
    speed: 0.55,
    yOffset: 0.42,
  });

  useFrame((_, delta) => {
    timeRef.current += delta * orbit.current.speed;

    const angleOffset = Math.sin(timeRef.current) * orbit.current.arcAngle;
    const x = Math.sin(angleOffset) * orbit.current.radius;
    const y = Math.sin(timeRef.current * 1.15) * orbit.current.yOffset;
    const z = Math.cos(angleOffset) * orbit.current.radius;

    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
  });

  return null;
};

export const CoinPage = () => {
  return (
    <section className="page-shell coin-page">
      <div className="canvas">
        <Canvas camera={{ fov: 42, position: [0, 0, 9.35] }} dpr={[1, 2]} shadows>
          <CameraSetup />
          <Coin />
          <ambientLight intensity={0.72} />
          <hemisphereLight args={["#fff2c4", "#140904", 1.18]} />
          <directionalLight
            castShadow
            intensity={2.8}
            position={[4.4, 6.6, 5.2]}
            shadow-mapSize-height={2048}
            shadow-mapSize-width={2048}
          />
          <pointLight color="#ffcf69" distance={16} intensity={18} position={[-4.2, 1.8, 3.5]} />
          <pointLight color="#fff6dd" distance={16} intensity={12} position={[3.8, -1.6, 4.4]} />
          <pointLight color="#fff0bf" distance={18} intensity={2.5} position={[0.2, 0, 6.4]} />
          <spotLight
            angle={0.52}
            castShadow
            color="#fff8e8"
            distance={22}
            intensity={22}
            penumbra={0.95}
            position={[0.25, 6.8, 4.4]}
          />
        </Canvas>
      </div>
    </section>
  );
};
