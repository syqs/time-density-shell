// === Full Code: TemporalResonatorScene_ToggleChargeThreshold_EasterEgg.tsx ===

import React, { useRef, useEffect, useMemo, Suspense, useState } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import * as THREE from 'three';
import ErrorBoundary from './errorBoundary'; // Adjust path if needed
import { useControls, Leva } from 'leva';
import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// --- BVH / CSG Setup ---
try {
  (THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
  (THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
  (THREE.Mesh.prototype as any).raycast = acceleratedRaycast;
} catch (error) {
  console.error("Error setting up BVH extensions:", error);
}

const csgEvaluator = new Evaluator();
csgEvaluator.useGroups = true;
extend({ OrbitControls });

// --- Constants ---
const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;

// --- Face Drag Coefficients ---
const FACE_DRAG_COEFFICIENTS = [
  0.8, 1.0, 0.9, 1.1, 0.6, 1.2,
  1.05, 0.75, 0.95, 1.3, 0.7, 1.15
];

// Helper: Compute effective drag multiplier based on face normals and magnetic field direction.
function computeEffectiveDrag(
  quat: THREE.Quaternion,
  magneticFieldDir: THREE.Vector3,
  faceData: { normal: THREE.Vector3 }[]
) {
  let dragSum = 0, weightSum = 0;
  faceData.forEach((face, index) => {
    const worldNormal = face.normal.clone().applyQuaternion(quat);
    const alignment = Math.max(0, worldNormal.dot(magneticFieldDir));
    dragSum += FACE_DRAG_COEFFICIENTS[index] * alignment;
    weightSum += alignment;
  });
  return weightSum > 0 ? dragSum / weightSum : 1.0;
}

// Helper: Get dodecahedron data (vertices and face centers/normals).
function getDodecahedronData(radius: number): {
  vertices: THREE.Vector3[];
  faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[];
} {
  if (typeof radius !== 'number' || radius <= 0 || !Number.isFinite(radius))
    throw new Error("Invalid radius provided to getDodecahedronData");
  const uniqueVerticesMap = new Map<string, THREE.Vector3>();
  const coords = [
    [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1],
    [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
    [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI],
    [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI],
    [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0]
  ];
  const distOriginToVertex = Math.sqrt(PHI * PHI + INV_PHI * INV_PHI);
  const scale = radius / distOriginToVertex;
  coords.forEach(v => {
    const x = v[0] * scale, y = v[1] * scale, z = v[2] * scale;
    const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
    if (!uniqueVerticesMap.has(key)) {
      uniqueVerticesMap.set(key, new THREE.Vector3(x, y, z));
    }
  });
  const vertices = Array.from(uniqueVerticesMap.values());
  const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
  const icoVerts = [
    [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
    [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
    [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
  ];
  const faceCenterDist = radius * 1.53 / distOriginToVertex;
  icoVerts.forEach(v => {
    const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize();
    const center = normal.clone().multiplyScalar(faceCenterDist);
    faceData.push({ center, normal });
  });
  return { vertices, faceData };
}

// --- OrbitControls Component ---
const Controls: React.FC = () => {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControls>(null);
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    (controlsRef as React.MutableRefObject<OrbitControls>).current = controls;
    return () => controls.dispose();
  }, [camera, gl]);
  useFrame(() => controlsRef.current?.update());
  return null;
};

// --- Roman Dodecahedron CSG Component ---
interface RomanDodecahedronProps {
  outerRadius: number;
  thickness: number;
  holeBaseDiameter: number;
  holeRatio: number;
  noduleRadius: number;
  material?: THREE.Material;
  wireframe?: boolean;
  [key: string]: any;
}

const RomanDodecahedron = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
  ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, wireframe = false, ...props }, ref) => {
    const [calculatedGeometry, setCalculatedGeometry] = useState<THREE.BufferGeometry | null>(null);
    useEffect(() => {
      if (
        typeof outerRadius !== 'number' || outerRadius <= 0 ||
        typeof thickness !== 'number' || thickness <= 0 ||
        typeof holeBaseDiameter !== 'number' || holeBaseDiameter <= 0 ||
        typeof holeRatio !== 'number' || holeRatio <= 0 ||
        typeof noduleRadius !== 'number' || noduleRadius <= 0
      ) {
        setCalculatedGeometry(null);
        return;
      }
      let geometry: THREE.BufferGeometry | null = null;
      const tempGeoList: THREE.BufferGeometry[] = [];
      try {
        const { vertices: mathVertices, faceData: mathFaceData } = getDodecahedronData(outerRadius);
        const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, 1);
        outerDodecGeo.computeBoundsTree();
        tempGeoList.push(outerDodecGeo);
        const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, 1);
        innerDodecGeo.computeBoundsTree();
        tempGeoList.push(innerDodecGeo);
        let outerBrush = new Brush(outerDodecGeo);
        let innerBrush = new Brush(innerDodecGeo);
        innerBrush.updateMatrixWorld();
        let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
        const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * holeRatio ** i);
        const cylinderHeight = thickness * 3.1;
        const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16);
        cylinderGeo.rotateX(Math.PI / 2);
        cylinderGeo.computeBoundsTree();
        tempGeoList.push(cylinderGeo);
        const tempQuat = new THREE.Quaternion();
        mathFaceData.forEach((face, index) => {
          const holeRadius = holeDiameters[index] / 2;
          if (!holeRadius || holeRadius <= 0) return;
          const holeBrush = new Brush(cylinderGeo);
          holeBrush.scale.set(holeRadius, holeRadius, 1);
          tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal);
          holeBrush.quaternion.copy(tempQuat);
          holeBrush.position.copy(face.center);
          holeBrush.updateMatrixWorld();
          shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION);
        });
        const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6);
        noduleGeo.computeBoundsTree();
        tempGeoList.push(noduleGeo);
        mathVertices.forEach(vertexPos => {
          const noduleBrush = new Brush(noduleGeo);
          noduleBrush.position.copy(vertexPos);
          noduleBrush.updateMatrixWorld();
          shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
        });
        geometry = shellBrush.geometry;
        geometry.computeVertexNormals();
        geometry.center();
      } catch (error) {
        geometry = null;
      } finally {
        tempGeoList.forEach(g => g.dispose());
      }
      setCalculatedGeometry(geometry);
      return () => {
        if (geometry && typeof geometry.dispose === 'function') {
          geometry.dispose();
        }
      };
    }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]);

    const meshMaterial = useMemo(() => {
      let baseMaterial: THREE.Material;
      if (material instanceof THREE.Material) {
        baseMaterial = material.clone();
      } else {
        baseMaterial = new THREE.MeshPhongMaterial({
          color: 0xb87333,
          specular: 0x444444,
          shininess: 40,
          name: "DefaultPhongCopper"
        });
      }
      baseMaterial.side = THREE.DoubleSide;
      if ("wireframe" in baseMaterial) {
        (baseMaterial as any).wireframe = wireframe;
      }
      return baseMaterial;
    }, [material, wireframe]);

    if (!calculatedGeometry) return null;
    return <mesh ref={ref} geometry={calculatedGeometry} material={meshMaterial} {...props} />;
  }
);

// --- Physics State Interface ---
interface PhysicsState {
  angularVelocity: THREE.Vector3;
  fieldAngle: number;
  currentTorque: THREE.Vector3;
}

// --- Main Simulation Component ---
// Accepts an onStatusUpdate callback.
interface ResonatorSimulationProps {
  onStatusUpdate: (status: { battery: number; angularVelocity: number }) => void;
}

const ResonatorSimulation: React.FC<ResonatorSimulationProps> = ({ onStatusUpdate }) => {
  const groupRef = useRef<THREE.Group>(null!);
  const dodecahedronMeshRef = useRef<THREE.Mesh>(null!);
  const particlesRef = useRef<THREE.Points>(null!);
  const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

  // Controls (including fieldActive toggle)
  const resonatorControls = useControls("Resonator Controls", {
    baseFieldSpeed: { value: 1.0, min: 0, max: 5, step: 0.1 },
    fieldIntensity: { value: 1.0, min: 0, max: 5, step: 0.1 },
    k_drag: { label: "Induction Strength", value: 0.5, min: 0, max: 2, step: 0.05 },
    inertiaScale: { label: "Inertia Scale", value: 1.0, min: 0.1, max: 5, step: 0.1 },
    damping: { value: 0.1, min: 0, max: 1, step: 0.01 },
    spinUpRate: { value: 0.5, min: 0, max: 2, step: 0.1 },
    velocityThreshold: { value: 1.5, min: 0, max: 10, step: 0.1 },
    thresholdFeedbackFactor: { value: 2.1, min: 0, max: 5, step: 0.1 },
    fieldActive: { value: true },
    noduleAntifieldStrength: { value: 0.2, min: 0, max: 2, step: 0.05 }
  });

  const shellControls = useControls("Shell Geometry", {
    outerRadius: { value: 1.0 },
    thickness: { value: 0.05 },
    holeBaseDiameter: { value: 0.1 },
    holeRatio: { value: 1.2 },
    noduleRadius: { value: 0.1 }
  });

  const vizControls = useControls("Visualization", {
    particleCount: { value: 1000, min: 100, max: 50000, step: 100 },
    particleSize: { value: 0.05, min: 0.01, max: 1.2, step: 0.01 },
    torusMajorRadius: { value: 1.5, min: 0.5, max: 5, step: 0.1 },
    torusMinorRadius: { value: 0.5, min: 0.1, max: 2, step: 0.05 },
    showParticles: { value: true },
    wireframe: { value: false }
  });

  const defaultShellParams = useMemo(() => ({
    outerRadius: 1.0,
    thickness: 0.05,
    holeBaseDiameter: 0.1,
    holeRatio: 1.2,
    noduleRadius: 0.1
  }), []);
  const finalShellParams = useMemo(() => ({
    outerRadius: shellControls.outerRadius,
    thickness: shellControls.thickness,
    holeBaseDiameter: shellControls.holeBaseDiameter,
    holeRatio: shellControls.holeRatio,
    noduleRadius: shellControls.noduleRadius
  }), [shellControls]);

  const effectiveInertia = useMemo(() => {
    return resonatorControls.inertiaScale *
      ((finalShellParams.outerRadius ** 5 - (finalShellParams.outerRadius - finalShellParams.thickness) ** 5) /
       finalShellParams.outerRadius ** 5);
  }, [resonatorControls.inertiaScale, finalShellParams.outerRadius, finalShellParams.thickness]);

  // --- Battery (energy) state ---
  const batteryRef = useRef(100);
  const DRAIN_RATE = 10;
  const RECHARGE_RATE = 5;

  // --- New: Threshold Modifier & Charging Mode ---
  const thresholdModifierRef = useRef(1); // multiplies the base threshold
  const chargingModeRef = useRef(false); // true when charging

  // --- Physics State ---
  const physicsState = useRef<PhysicsState>({
    angularVelocity: new THREE.Vector3(0, 0, 0),
    fieldAngle: 0,
    currentTorque: new THREE.Vector3(0, 0, 0)
  });

  // --- Particle Data ---
  const particleData = useMemo(() => {
    try {
      const data = [];
      const positions = new Float32Array(vizControls.particleCount * 3);
      for (let i = 0; i < vizControls.particleCount; i++) {
        const u = Math.random() * Math.PI * 2;
        const v = Math.random() * Math.PI * 2;
        const R = vizControls.torusMajorRadius;
        const r = vizControls.torusMinorRadius;
        const randR = R + (Math.random() - 0.5) * 0.2 * r;
        const randr = r * Math.sqrt(Math.random());
        positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u);
        positions[i * 3 + 1] = randr * Math.sin(v);
        positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);
        data.push({ u, v, R, r, yOffset: 0 }); // yOffset for easter egg mode.
      }
      return { positions, data };
    } catch (error) {
      return { positions: new Float32Array(0), data: [] };
    }
  }, [vizControls.particleCount, vizControls.torusMajorRadius, vizControls.torusMinorRadius]);

  useEffect(() => {
    if (particleGeoRef.current && particleData?.positions) {
      const existingAttribute = particleGeoRef.current.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (!existingAttribute || existingAttribute.array.length !== particleData.positions.length) {
        particleGeoRef.current.setAttribute("position", new THREE.BufferAttribute(particleData.positions, 3, false));
      }
      if (particleGeoRef.current.getAttribute("color")) {
        particleGeoRef.current.deleteAttribute("color");
      }
    } else {
      if (particleGeoRef.current?.getAttribute("position")) {
        particleGeoRef.current.deleteAttribute("position");
      }
    }
  }, [particleData]);

  // --- 3D Vector Physics Update with Energy, Threshold Modulation, and Easter Egg ---
  useFrame((state, delta) => {
    const ps = physicsState.current;
    const fieldActive = resonatorControls.fieldActive;
    const baseThreshold = resonatorControls.velocityThreshold;
    const actualThreshold = baseThreshold * thresholdModifierRef.current;

    // Check if shell speed exceeds the current threshold → enter charging mode.
    if (ps.angularVelocity.length() > actualThreshold) {
      chargingModeRef.current = true;
    }

    if (chargingModeRef.current) {
      // Charging: battery increases.
      batteryRef.current = Math.min(batteryRef.current + RECHARGE_RATE * delta, 100);
      // Once battery fully charges, exit charging mode, boost angular velocity, and increase threshold.
      if (batteryRef.current >= 100) {
        chargingModeRef.current = false;
        thresholdModifierRef.current += 0.2;
        ps.angularVelocity.multiplyScalar(1.1);
      }
    } else {
      // Draining: if field active and battery available.
      if (fieldActive && batteryRef.current > 0) {
        batteryRef.current = Math.max(batteryRef.current - DRAIN_RATE * delta, 0);
      } else {
        batteryRef.current = Math.min(batteryRef.current + RECHARGE_RATE * delta, 100);
      }
    }

    // Only update field angle if field is active and battery > 0.
    if (fieldActive && batteryRef.current > 0) {
      ps.fieldAngle += resonatorControls.spinUpRate * delta;
    }
    const magneticFieldDir = new THREE.Vector3(Math.cos(ps.fieldAngle), Math.sin(ps.fieldAngle), 0).normalize();
    const desiredAngularVel = fieldActive ? magneticFieldDir.clone().multiplyScalar(resonatorControls.baseFieldSpeed) : new THREE.Vector3(0, 0, 0);
    const error = desiredAngularVel.clone().sub(ps.angularVelocity);
    const { faceData } = getDodecahedronData(finalShellParams.outerRadius);
    const effectiveDragFactor = computeEffectiveDrag(groupRef.current.quaternion, magneticFieldDir, faceData);
    const dragTorque = error.clone().multiplyScalar(effectiveDragFactor * resonatorControls.k_drag * resonatorControls.fieldIntensity);
    const currentSpeed = ps.angularVelocity.length();
    let feedbackTorque = new THREE.Vector3(0, 0, 0);
    if (currentSpeed > actualThreshold) {
      const overage = currentSpeed - actualThreshold;
      feedbackTorque = ps.angularVelocity.clone().normalize().multiplyScalar(-resonatorControls.thresholdFeedbackFactor * overage);
    }
    let netTorque = dragTorque.add(feedbackTorque);
    // Nodule Antifield Torque:
    let noduleTorque = new THREE.Vector3(0, 0, 0);
    const nodulePositions = getDodecahedronData(finalShellParams.outerRadius).vertices;
    nodulePositions.forEach(nodulePos => {
      const worldPos = nodulePos.clone().applyQuaternion(groupRef.current.quaternion);
      const contribution = worldPos.clone().cross(magneticFieldDir).multiplyScalar(resonatorControls.noduleAntifieldStrength);
      noduleTorque.add(contribution);
    });
    netTorque.add(noduleTorque);
    ps.currentTorque.copy(netTorque);
    const angularAccel = netTorque.clone().divideScalar(effectiveInertia);
    ps.angularVelocity.add(angularAccel.multiplyScalar(delta));
    ps.angularVelocity.multiplyScalar(1 - resonatorControls.damping * delta);
    const deltaAngle = ps.angularVelocity.length() * delta;
    if (deltaAngle > 0) {
      const rotationAxis = ps.angularVelocity.clone().normalize();
      const deltaQuat = new THREE.Quaternion().setFromAxisAngle(rotationAxis, deltaAngle);
      groupRef.current.quaternion.multiply(deltaQuat);
    }
    // Optional emissive update.
    if (dodecahedronMeshRef.current) {
      const currentMaterial = dodecahedronMeshRef.current.material;
      if (currentMaterial instanceof THREE.MeshStandardMaterial || currentMaterial instanceof THREE.MeshPhysicalMaterial) {
        if (currentMaterial.emissive) {
          const maxTorqueEst = resonatorControls.k_drag * resonatorControls.fieldIntensity * (resonatorControls.baseFieldSpeed * 1.5 + 1);
          const emissionStrength = Math.min(netTorque.length() / (maxTorqueEst + 0.01), 1.0);
          currentMaterial.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5);
        }
      }
    }

    // --- Particle Update ---
    // Get particle positions array.
    const positions = particleGeoRef.current?.attributes.position?.array as Float32Array;
    const pData = particleData.data;
    // Easter Egg branch: if angular velocity becomes NaN, trigger special particle behavior.
    const easterEggActive = isNaN(ps.angularVelocity.length());
    if (easterEggActive) {
      // In this mode, particles escape along vertical "jets" and leave trails.
      for (let i = 0; i < pData.length; i++) {
        // Initialize a vertical offset property if not present.
        if (pData[i].yOffset === undefined) pData[i].yOffset = 0;
        // Increase vertical offset.
        pData[i].yOffset += 0.5 * delta; // Adjust speed as needed.
        // For a vertical jet effect, let horizontal offsets be small random values.
        if ((pData[i] as any).originalX === undefined) {
          (pData[i] as any).originalX = (Math.random() - 0.5) * 0.2;
          (pData[i] as any).originalZ = (Math.random() - 0.5) * 0.2;
        }
        positions[i * 3] = (pData[i] as any).originalX;
        positions[i * 3 + 1] = pData[i].yOffset;
        positions[i * 3 + 2] = (pData[i] as any).originalZ;
        // If a particle moves too far, reset it (simulate disappearing and respawning).
        if (pData[i].yOffset > 5) {
          pData[i].yOffset = 0;
          (pData[i] as any).originalX = (Math.random() - 0.5) * 0.2;
          (pData[i] as any).originalZ = (Math.random() - 0.5) * 0.2;
        }
      }
      particleGeoRef.current.attributes.position.needsUpdate = true;
    } else {
      // Normal particle update: toroidal swirl.
      const speed = resonatorControls.baseFieldSpeed * resonatorControls.fieldIntensity;
      if (pData && pData.length * 3 === positions.length) {
        const pointsMat = particlesRef.current.material as THREE.PointsMaterial;
        if (pointsMat) pointsMat.size = vizControls.particleSize * (1 + resonatorControls.fieldIntensity * 0.5);
        for (let i = 0; i < pData.length; i++) {
          const data = pData[i];
          data.u += speed * delta;
          const R = vizControls.torusMajorRadius;
          const r = vizControls.torusMinorRadius;
          const u = data.u;
          const v = data.v;
          const bufferIndex = i * 3;
          positions[bufferIndex] = (R + r * Math.cos(v)) * Math.cos(u);
          positions[bufferIndex + 1] = r * Math.sin(v);
          positions[bufferIndex + 2] = (R + r * Math.cos(v)) * Math.sin(u);
        }
        particleGeoRef.current.attributes.position.needsUpdate = true;
      }
    }

    // Report status.
    onStatusUpdate({
      battery: batteryRef.current,
      angularVelocity: ps.angularVelocity.length()
    });
  });

  return (
    <group ref={groupRef}>
      <RomanDodecahedron
        ref={dodecahedronMeshRef}
        outerRadius={finalShellParams.outerRadius}
        thickness={finalShellParams.thickness}
        holeBaseDiameter={finalShellParams.holeBaseDiameter}
        holeRatio={finalShellParams.holeRatio}
        noduleRadius={finalShellParams.noduleRadius}
        wireframe={vizControls.wireframe}
        castShadow
        receiveShadow
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
      />
      {vizControls.showParticles && (
        <points ref={particlesRef} name="FieldParticles">
          <bufferGeometry ref={particleGeoRef} />
          <pointsMaterial
            name="ParticleMaterial"
            color={0x00ffff}
            size={vizControls.particleSize}
            transparent
            opacity={0.7}
            blending={THREE.AdditiveBlending}
            sizeAttenuation={false}
            map={null}
          />
        </points>
      )}
    </group>
  );
};

const TemporalResonatorScene: React.FC = () => {
  const [status, setStatus] = useState({ battery: 100, angularVelocity: 0 });
  // Internal light toggle state.
  const [internalLightActive, setInternalLightActive] = useState(false);

  return (
    <>
      <Leva collapsed={false} titleBar={{ title: "Controls" }} />
      <Canvas
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "#111122",
          zIndex: 0
        }}
        camera={{ position: [3, 3, 5], fov: 75 }}
        gl={{ antialias: true }}
        shadows
      >
        {/* Lower ambient light so that without internal light the copper shell is dark */}
        <ambientLight intensity={0.0} />
        <hemisphereLight groundColor={0x404040} intensity={0.3} />
        <directionalLight
          position={[5, 10, 7.5]}
          intensity={0.8}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-far={25}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />
        {/* Internal light (heating effect) only on when toggled */}
        {internalLightActive && (
          <pointLight
            intensity={0.5}
            color={0xffddcc}
            distance={3}
            decay={1.5}
            position={[0, 0, 0]}
            name="InternalLight"
          />
        )}
        <ErrorBoundary>
          <Suspense fallback={<LoadingPlaceholder />}>
            <ResonatorSimulation onStatusUpdate={setStatus} />
          </Suspense>
        </ErrorBoundary>
        <Controls />
      </Canvas>
      <StatusOverlay
        status={status}
        internalLightActive={internalLightActive}
        setInternalLightActive={setInternalLightActive}
      />
    </>
  );
};

// --- Status Overlay Component ---
// Renders battery and angular velocity bars plus a button to toggle the internal light.
const StatusOverlay: React.FC<{
  status: { battery: number; angularVelocity: number };
  internalLightActive: boolean;
  setInternalLightActive: (active: boolean) => void;
}> = ({ status, internalLightActive, setInternalLightActive }) => {
  const batteryPercent = status.battery;
  const angularPercent = Math.min((status.angularVelocity / 10) * 100, 100);
  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 20,
    left: 20,
    color: '#fff',
    fontFamily: 'sans-serif',
    zIndex: 10
  };
  const barContainer: React.CSSProperties = {
    width: '200px',
    height: '20px',
    background: '#555',
    borderRadius: '10px',
    overflow: 'hidden',
    marginBottom: '10px'
  };
  const buttonStyle: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: '14px',
    borderRadius: '5px',
    cursor: 'pointer'
  };
  return (
    <div style={overlayStyle}>
      <div>
        <div>Battery: {batteryPercent.toFixed(0)}%</div>
        <div style={barContainer}>
          <div style={{ width: `${batteryPercent}%`, height: '100%', background: 'limegreen' }}></div>
        </div>
      </div>
      <div>
        <div>Angular Velocity: {status.angularVelocity.toFixed(2)}</div>
        <div style={barContainer}>
          <div style={{ width: `${angularPercent}%`, height: '100%', background: 'orange' }}></div>
        </div>
      </div>
      <div>
        <button style={buttonStyle} onClick={() => setInternalLightActive(!internalLightActive)}>
          {internalLightActive ? "Turn Off Internal Light" : "Turn On Internal Light"}
        </button>
      </div>
    </div>
  );
};

// --- Loading Placeholder Component ---
const LoadingPlaceholder: React.FC = () => {
  return (
    <mesh>
      <boxGeometry args={[0.1, 0.1, 0.1]} />
      <meshBasicMaterial color="orange" wireframe attach="material" />
    </mesh>
  );
};

export default TemporalResonatorScene;


// // === Full Code: TemporalResonatorScene_ToggleChargeThreshold.tsx ===

// import React, { useRef, useEffect, useMemo, Suspense, useState } from 'react';
// import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// import * as THREE from 'three';
// import ErrorBoundary from './errorBoundary'; // Adjust path if needed
// import { useControls, Leva } from 'leva';
// import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // --- BVH / CSG Setup ---
// try {
//   (THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
//   (THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
//   (THREE.Mesh.prototype as any).raycast = acceleratedRaycast;
// } catch (error) {
//   console.error("Error setting up BVH extensions:", error);
// }

// const csgEvaluator = new Evaluator();
// csgEvaluator.useGroups = true;
// extend({ OrbitControls });

// // --- Constants ---
// const PHI = (1 + Math.sqrt(5)) / 2;
// const INV_PHI = 1 / PHI;

// // --- Face Drag Coefficients ---
// const FACE_DRAG_COEFFICIENTS = [
//   0.8, 1.0, 0.9, 1.1, 0.6, 1.2,
//   1.05, 0.75, 0.95, 1.3, 0.7, 1.15
// ];

// // Helper: Compute effective drag multiplier based on face normals and magnetic field direction.
// function computeEffectiveDrag(
//   quat: THREE.Quaternion,
//   magneticFieldDir: THREE.Vector3,
//   faceData: { normal: THREE.Vector3 }[]
// ) {
//   let dragSum = 0, weightSum = 0;
//   faceData.forEach((face, index) => {
//     const worldNormal = face.normal.clone().applyQuaternion(quat);
//     const alignment = Math.max(0, worldNormal.dot(magneticFieldDir));
//     dragSum += FACE_DRAG_COEFFICIENTS[index] * alignment;
//     weightSum += alignment;
//   });
//   return weightSum > 0 ? dragSum / weightSum : 1.0;
// }

// // Helper: Generate dodecahedron math data.
// function getDodecahedronData(radius: number): {
//   vertices: THREE.Vector3[];
//   faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[];
// } {
//   if (typeof radius !== 'number' || radius <= 0 || !Number.isFinite(radius)) {
//     throw new Error("Invalid radius provided to getDodecahedronData");
//   }
//   const uniqueVerticesMap = new Map<string, THREE.Vector3>();
//   const coords = [
//     [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1],
//     [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
//     [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI],
//     [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI],
//     [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0]
//   ];
//   const distOriginToVertex = Math.sqrt(PHI * PHI + INV_PHI * INV_PHI);
//   const scale = radius / distOriginToVertex;
//   coords.forEach(v => {
//     const x = v[0] * scale, y = v[1] * scale, z = v[2] * scale;
//     const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
//     if (!uniqueVerticesMap.has(key)) uniqueVerticesMap.set(key, new THREE.Vector3(x, y, z));
//   });
//   const vertices = Array.from(uniqueVerticesMap.values());
//   const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
//   const icoVerts = [
//     [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
//     [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
//     [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
//   ];
//   const faceCenterDist = radius * 1.53 / distOriginToVertex;
//   icoVerts.forEach(v => {
//     const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize();
//     const center = normal.clone().multiplyScalar(faceCenterDist);
//     faceData.push({ center, normal });
//   });
//   return { vertices, faceData };
// }

// // --- OrbitControls Component ---
// const Controls: React.FC = () => {
//   const { camera, gl } = useThree();
//   const controlsRef = useRef<OrbitControls>(null);
//   useEffect(() => {
//     const controls = new OrbitControls(camera, gl.domElement);
//     controls.enableDamping = true;
//     controls.target.set(0, 0, 0);
//     (controlsRef as React.MutableRefObject<OrbitControls>).current = controls;
//     return () => controls.dispose();
//   }, [camera, gl]);
//   useFrame(() => controlsRef.current?.update());
//   return null;
// };

// // --- Roman Dodecahedron CSG Component ---
// interface RomanDodecahedronProps {
//   outerRadius: number;
//   thickness: number;
//   holeBaseDiameter: number;
//   holeRatio: number;
//   noduleRadius: number;
//   material?: THREE.Material;
//   wireframe?: boolean;
//   [key: string]: any;
// }

// const RomanDodecahedron = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
//   ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, wireframe = false, ...props }, ref) => {
//     const [calculatedGeometry, setCalculatedGeometry] = useState<THREE.BufferGeometry | null>(null);
//     useEffect(() => {
//       if (
//         typeof outerRadius !== 'number' || outerRadius <= 0 ||
//         typeof thickness !== 'number' || thickness <= 0 ||
//         typeof holeBaseDiameter !== 'number' || holeBaseDiameter <= 0 ||
//         typeof holeRatio !== 'number' || holeRatio <= 0 ||
//         typeof noduleRadius !== 'number' || noduleRadius <= 0
//       ) {
//         setCalculatedGeometry(null);
//         return;
//       }
//       let geometry: THREE.BufferGeometry | null = null;
//       const tempGeoList: THREE.BufferGeometry[] = [];
//       try {
//         const { vertices: mathVertices, faceData: mathFaceData } = getDodecahedronData(outerRadius);
//         const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, 1);
//         outerDodecGeo.computeBoundsTree();
//         tempGeoList.push(outerDodecGeo);
//         const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, 1);
//         innerDodecGeo.computeBoundsTree();
//         tempGeoList.push(innerDodecGeo);
//         let outerBrush = new Brush(outerDodecGeo);
//         let innerBrush = new Brush(innerDodecGeo);
//         innerBrush.updateMatrixWorld();
//         let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
//         const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * holeRatio ** i);
//         const cylinderHeight = thickness * 3.1;
//         const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16);
//         cylinderGeo.rotateX(Math.PI / 2);
//         cylinderGeo.computeBoundsTree();
//         tempGeoList.push(cylinderGeo);
//         const tempQuat = new THREE.Quaternion();
//         mathFaceData.forEach((face, index) => {
//           const holeRadius = holeDiameters[index] / 2;
//           if (!holeRadius || holeRadius <= 0) return;
//           const holeBrush = new Brush(cylinderGeo);
//           holeBrush.scale.set(holeRadius, holeRadius, 1);
//           tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal);
//           holeBrush.quaternion.copy(tempQuat);
//           holeBrush.position.copy(face.center);
//           holeBrush.updateMatrixWorld();
//           shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION);
//         });
//         const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6);
//         noduleGeo.computeBoundsTree();
//         tempGeoList.push(noduleGeo);
//         mathVertices.forEach(vertexPos => {
//           const noduleBrush = new Brush(noduleGeo);
//           noduleBrush.position.copy(vertexPos);
//           noduleBrush.updateMatrixWorld();
//           shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
//         });
//         geometry = shellBrush.geometry;
//         geometry.computeVertexNormals();
//         geometry.center();
//       } catch (error) {
//         geometry = null;
//       } finally {
//         tempGeoList.forEach(g => g.dispose());
//       }
//       setCalculatedGeometry(geometry);
//       return () => {
//         if (geometry && typeof geometry.dispose === 'function') {
//           geometry.dispose();
//         }
//       };
//     }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]);

//     const meshMaterial = useMemo(() => {
//       let baseMaterial: THREE.Material;
//       if (material instanceof THREE.Material) {
//         baseMaterial = material.clone();
//       } else {
//         baseMaterial = new THREE.MeshPhongMaterial({
//           color: 0xb87333,
//           specular: 0x444444,
//           shininess: 40,
//           name: "DefaultPhongCopper"
//         });
//       }
//       baseMaterial.side = THREE.DoubleSide;
//       if ("wireframe" in baseMaterial) {
//         (baseMaterial as any).wireframe = wireframe;
//       }
//       return baseMaterial;
//     }, [material, wireframe]);

//     if (!calculatedGeometry) return null;
//     return <mesh ref={ref} geometry={calculatedGeometry} material={meshMaterial} {...props} />;
//   }
// );

// // --- Physics State Interface ---
// interface PhysicsState {
//   angularVelocity: THREE.Vector3;
//   fieldAngle: number;
//   currentTorque: THREE.Vector3;
// }

// // --- Main Simulation Component ---
// // Accepts an onStatusUpdate callback to report battery and angular velocity.
// interface ResonatorSimulationProps {
//   onStatusUpdate: (status: { battery: number; angularVelocity: number }) => void;
// }

// const ResonatorSimulation: React.FC<ResonatorSimulationProps> = ({ onStatusUpdate }) => {
//   const groupRef = useRef<THREE.Group>(null!);
//   const dodecahedronMeshRef = useRef<THREE.Mesh>(null!);
//   const particlesRef = useRef<THREE.Points>(null!);
//   const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

//   // Controls (including fieldActive toggle)
//   const resonatorControls = useControls("Resonator Controls", {
//     baseFieldSpeed: { value: 1.0, min: 0, max: 5, step: 0.1 },
//     fieldIntensity: { value: 1.0, min: 0, max: 5, step: 0.1 },
//     k_drag: { label: "Induction Strength", value: 0.5, min: 0, max: 2, step: 0.05 },
//     inertiaScale: { label: "Inertia Scale", value: 1.0, min: 0.1, max: 5, step: 0.1 },
//     damping: { value: 0.1, min: 0, max: 1, step: 0.01 },
//     spinUpRate: { value: 0.5, min: 0, max: 2, step: 0.1 },
//     velocityThreshold: { value: 1.5, min: 0, max: 10, step: 0.1 },
//     thresholdFeedbackFactor: { value: 2.1, min: 0, max: 5, step: 0.1 },
//     fieldActive: { value: true },
//     noduleAntifieldStrength: { value: 0.2, min: 0, max: 2, step: 0.05 }
//   });

//   const shellControls = useControls("Shell Geometry", {
//     outerRadius: { value: 1.0 },
//     thickness: { value: 0.05 },
//     holeBaseDiameter: { value: 0.1 },
//     holeRatio: { value: 1.2 },
//     noduleRadius: { value: 0.1 }
//   });

//   const vizControls = useControls("Visualization", {
//     particleCount: { value: 1000, min: 100, max: 5000, step: 100 },
//     particleSize: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
//     torusMajorRadius: { value: 1.5, min: 0.5, max: 5, step: 0.1 },
//     torusMinorRadius: { value: 0.5, min: 0.1, max: 2, step: 0.05 },
//     showParticles: { value: true },
//     wireframe: { value: false }
//   });

//   const defaultShellParams = useMemo(() => ({
//     outerRadius: 1.0,
//     thickness: 0.05,
//     holeBaseDiameter: 0.1,
//     holeRatio: 1.2,
//     noduleRadius: 0.1
//   }), []);
//   const finalShellParams = useMemo(() => ({
//     outerRadius: shellControls.outerRadius,
//     thickness: shellControls.thickness,
//     holeBaseDiameter: shellControls.holeBaseDiameter,
//     holeRatio: shellControls.holeRatio,
//     noduleRadius: shellControls.noduleRadius
//   }), [shellControls]);

//   const effectiveInertia = useMemo(() => {
//     return resonatorControls.inertiaScale *
//       ((finalShellParams.outerRadius ** 5 -
//         (finalShellParams.outerRadius - finalShellParams.thickness) ** 5) /
//        finalShellParams.outerRadius ** 5);
//   }, [resonatorControls.inertiaScale, finalShellParams.outerRadius, finalShellParams.thickness]);

//   // --- Battery (energy) state ---
//   const batteryRef = useRef(100);
//   const DRAIN_RATE = 10;
//   const RECHARGE_RATE = 5;

//   // --- New: Threshold Modifier & Charging Mode ---
//   const thresholdModifierRef = useRef(1); // multiplies the base threshold
//   const chargingModeRef = useRef(false); // true when charging

//   // --- Physics State ---
//   const physicsState = useRef<PhysicsState>({
//     angularVelocity: new THREE.Vector3(0, 0, 0),
//     fieldAngle: 0,
//     currentTorque: new THREE.Vector3(0, 0, 0)
//   });

//   // --- Particle Data ---
//   const particleData = useMemo(() => {
//     try {
//       const data = [];
//       const positions = new Float32Array(vizControls.particleCount * 3);
//       for (let i = 0; i < vizControls.particleCount; i++) {
//         const u = Math.random() * Math.PI * 2;
//         const v = Math.random() * Math.PI * 2;
//         const R = vizControls.torusMajorRadius;
//         const r = vizControls.torusMinorRadius;
//         const randR = R + (Math.random() - 0.5) * 0.2 * r;
//         const randr = r * Math.sqrt(Math.random());
//         positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u);
//         positions[i * 3 + 1] = randr * Math.sin(v);
//         positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);
//         data.push({ u, v, R, r: randr });
//       }
//       return { positions, data };
//     } catch (error) {
//       return { positions: new Float32Array(0), data: [] };
//     }
//   }, [vizControls.particleCount, vizControls.torusMajorRadius, vizControls.torusMinorRadius]);

//   useEffect(() => {
//     if (particleGeoRef.current && particleData?.positions) {
//       const existingAttribute = particleGeoRef.current.getAttribute("position") as THREE.BufferAttribute | undefined;
//       if (!existingAttribute || existingAttribute.array.length !== particleData.positions.length) {
//         particleGeoRef.current.setAttribute("position", new THREE.BufferAttribute(particleData.positions, 3, false));
//       }
//       if (particleGeoRef.current.getAttribute("color")) {
//         particleGeoRef.current.deleteAttribute("color");
//       }
//     } else {
//       if (particleGeoRef.current?.getAttribute("position")) {
//         particleGeoRef.current.deleteAttribute("position");
//       }
//     }
//   }, [particleData]);

//   // --- 3D Vector Physics Update with Energy, Threshold Modulation, and Nodule Antifield ---
//   useFrame((state, delta) => {
//     const ps = physicsState.current;
//     const fieldActive = resonatorControls.fieldActive;
//     const baseThreshold = resonatorControls.velocityThreshold;
//     const actualThreshold = baseThreshold * thresholdModifierRef.current;

//     // Check if shell speed exceeds the current threshold → enter charging mode.
//     if (ps.angularVelocity.length() > actualThreshold) {
//       chargingModeRef.current = true;
//     }

//     if (chargingModeRef.current) {
//       // Charging: battery increases.
//       batteryRef.current = Math.min(batteryRef.current + RECHARGE_RATE * delta, 100);
//       // Once battery fully charges, exit charging mode and boost threshold and angular velocity.
//       if (batteryRef.current >= 100) {
//         chargingModeRef.current = false;
//         thresholdModifierRef.current += 0.2; // Increase required speed for next cycle.
//         // Boost angular velocity by 10% to simulate momentum.
//         ps.angularVelocity.multiplyScalar(1.1);
//       }
//     } else {
//       // Draining: if field active and battery > 0, battery decreases.
//       if (fieldActive && batteryRef.current > 0) {
//         batteryRef.current = Math.max(batteryRef.current - DRAIN_RATE * delta, 0);
//       } else {
//         // If not field active, battery slowly recharges.
//         batteryRef.current = Math.min(batteryRef.current + RECHARGE_RATE * delta, 100);
//       }
//     }

//     // Field evolution: if field active and battery available, update field angle.
//     if (fieldActive && batteryRef.current > 0) {
//       ps.fieldAngle += resonatorControls.spinUpRate * delta;
//     }
//     const magneticFieldDir = new THREE.Vector3(Math.cos(ps.fieldAngle), Math.sin(ps.fieldAngle), 0).normalize();
//     const desiredAngularVel = fieldActive ? magneticFieldDir.clone().multiplyScalar(resonatorControls.baseFieldSpeed) : new THREE.Vector3(0, 0, 0);
//     const error = desiredAngularVel.clone().sub(ps.angularVelocity);
//     const { faceData } = getDodecahedronData(finalShellParams.outerRadius);
//     const effectiveDragFactor = computeEffectiveDrag(groupRef.current.quaternion, magneticFieldDir, faceData);
//     const dragTorque = error.clone().multiplyScalar(effectiveDragFactor * resonatorControls.k_drag * resonatorControls.fieldIntensity);
//     const currentSpeed = ps.angularVelocity.length();
//     let feedbackTorque = new THREE.Vector3(0, 0, 0);
//     if (currentSpeed > actualThreshold) {
//       const overage = currentSpeed - actualThreshold;
//       feedbackTorque = ps.angularVelocity.clone().normalize().multiplyScalar(-resonatorControls.thresholdFeedbackFactor * overage);
//     }
//     let netTorque = dragTorque.add(feedbackTorque);
//     // Nodule Antifield Torque:
//     let noduleTorque = new THREE.Vector3(0, 0, 0);
//     const nodulePositions = getDodecahedronData(finalShellParams.outerRadius).vertices;
//     nodulePositions.forEach(nodulePos => {
//       const worldPos = nodulePos.clone().applyQuaternion(groupRef.current.quaternion);
//       const contribution = worldPos.clone().cross(magneticFieldDir).multiplyScalar(resonatorControls.noduleAntifieldStrength);
//       noduleTorque.add(contribution);
//     });
//     netTorque.add(noduleTorque);
//     ps.currentTorque.copy(netTorque);
//     const angularAccel = netTorque.clone().divideScalar(effectiveInertia);
//     ps.angularVelocity.add(angularAccel.multiplyScalar(delta));
//     ps.angularVelocity.multiplyScalar(1 - resonatorControls.damping * delta);
//     const deltaAngle = ps.angularVelocity.length() * delta;
//     if (deltaAngle > 0) {
//       const rotationAxis = ps.angularVelocity.clone().normalize();
//       const deltaQuat = new THREE.Quaternion().setFromAxisAngle(rotationAxis, deltaAngle);
//       groupRef.current.quaternion.multiply(deltaQuat);
//     }
//     // Optional emissive update.
//     if (dodecahedronMeshRef.current) {
//       const currentMaterial = dodecahedronMeshRef.current.material;
//       if (currentMaterial instanceof THREE.MeshStandardMaterial || currentMaterial instanceof THREE.MeshPhysicalMaterial) {
//         if (currentMaterial.emissive) {
//           const maxTorqueEst = resonatorControls.k_drag * resonatorControls.fieldIntensity * (resonatorControls.baseFieldSpeed * 1.5 + 1);
//           const emissionStrength = Math.min(netTorque.length() / (maxTorqueEst + 0.01), 1.0);
//           currentMaterial.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5);
//         }
//       }
//     }
//     // Update particle positions.
//     if (
//       vizControls.showParticles &&
//       particleGeoRef.current?.attributes.position &&
//       particlesRef.current &&
//       particleData?.data
//     ) {
//       const positions = particleGeoRef.current.attributes.position.array as Float32Array;
//       const speed = resonatorControls.baseFieldSpeed * resonatorControls.fieldIntensity;
//       const pData = particleData.data;
//       if (pData && pData.length * 3 === positions.length) {
//         const pointsMat = particlesRef.current.material as THREE.PointsMaterial;
//         if (pointsMat) pointsMat.size = vizControls.particleSize * (1 + resonatorControls.fieldIntensity * 0.5);
//         for (let i = 0; i < pData.length; i++) {
//           const data = pData[i];
//           data.u += speed * delta;
//           const R = vizControls.torusMajorRadius;
//           const r = data.r;
//           const u = data.u;
//           const v = data.v;
//           const bufferIndex = i * 3;
//           positions[bufferIndex] = (R + r * Math.cos(v)) * Math.cos(u);
//           positions[bufferIndex + 1] = r * Math.sin(v);
//           positions[bufferIndex + 2] = (R + r * Math.cos(v)) * Math.sin(u);
//         }
//         particleGeoRef.current.attributes.position.needsUpdate = true;
//       }
//     }
//     // Report status.
//     onStatusUpdate({
//       battery: batteryRef.current,
//       angularVelocity: ps.angularVelocity.length()
//     });
//   });

//   return (
//     <group ref={groupRef}>
//       <RomanDodecahedron
//         ref={dodecahedronMeshRef}
//         outerRadius={finalShellParams.outerRadius}
//         thickness={finalShellParams.thickness}
//         holeBaseDiameter={finalShellParams.holeBaseDiameter}
//         holeRatio={finalShellParams.holeRatio}
//         noduleRadius={finalShellParams.noduleRadius}
//         wireframe={vizControls.wireframe}
//         castShadow
//         receiveShadow
//         position={[0, 0, 0]}
//         rotation={[0, 0, 0]}
//       />
//       {/* Note: The internal (heating) light is now controlled via overlay below. */}
//       {vizControls.showParticles && (
//         <points ref={particlesRef} name="FieldParticles">
//           <bufferGeometry ref={particleGeoRef} />
//           <pointsMaterial
//             name="ParticleMaterial"
//             color={0x00ffff}
//             size={vizControls.particleSize}
//             transparent
//             opacity={0.7}
//             blending={THREE.AdditiveBlending}
//             sizeAttenuation={false}
//             map={null}
//           />
//         </points>
//       )}
//     </group>
//   );
// };

// const TemporalResonatorScene: React.FC = () => {
//   // Global status state.
//   const [status, setStatus] = useState({ battery: 100, angularVelocity: 0 });
//   // Internal light toggle state.
//   const [internalLightActive, setInternalLightActive] = useState(false);

//   return (
//     <>
//       <Leva collapsed={false} titleBar={{ title: "Controls" }} />
//       <Canvas
//         style={{
//           position: "absolute",
//           top: 0,
//           left: 0,
//           width: "100vw",
//           height: "100vh",
//           background: "#111122",
//           zIndex: 0
//         }}
//         camera={{ position: [3, 3, 5], fov: 75 }}
//         gl={{ antialias: true }}
//         shadows
//       >
//         {/** Lower ambient light so that without internal light the copper shell is dark */}
//         <ambientLight intensity={0.0} />
//         <hemisphereLight groundColor={0x404040} intensity={0.3} />
//         <directionalLight
//           position={[5, 10, 7.5]}
//           intensity={0.8}
//           castShadow
//           shadow-mapSize-width={1024}
//           shadow-mapSize-height={1024}
//           shadow-camera-far={25}
//           shadow-camera-left={-10}
//           shadow-camera-right={10}
//           shadow-camera-top={10}
//           shadow-camera-bottom={-10}
//         />
//         {/** Internal light (heating effect) renders only when toggled on */}
//         {internalLightActive && (
//           <pointLight
//             intensity={0.5}
//             color={0xffddcc}
//             distance={3}
//             decay={1.5}
//             position={[0, 0, 0]}
//             name="InternalLight"
//           />
//         )}
//         <ErrorBoundary>
//           <Suspense fallback={<LoadingPlaceholder />}>
//             <ResonatorSimulation onStatusUpdate={setStatus} />
//           </Suspense>
//         </ErrorBoundary>
//         <Controls />
//       </Canvas>
//       {/** Render overlay outside Canvas: battery & angular velocity bars plus a button */}
//       <StatusOverlay
//         status={status}
//         internalLightActive={internalLightActive}
//         setInternalLightActive={setInternalLightActive}
//       />
//     </>
//   );
// };

// // --- Status Overlay Component ---
// // Displays battery, angular velocity, and a button to toggle internal light.
// // Additionally, the battery logic now uses threshold-modulation (see main simulation).
// const StatusOverlay: React.FC<{
//   status: { battery: number; angularVelocity: number };
//   internalLightActive: boolean;
//   setInternalLightActive: (active: boolean) => void;
// }> = ({ status, internalLightActive, setInternalLightActive }) => {
//   const batteryPercent = status.battery;
//   const angularPercent = Math.min((status.angularVelocity / 10) * 100, 100);
//   const overlayStyle: React.CSSProperties = {
//     position: 'absolute',
//     top: 20,
//     left: 20,
//     color: '#fff',
//     fontFamily: 'sans-serif',
//     zIndex: 10
//   };
//   const barContainer: React.CSSProperties = {
//     width: '200px',
//     height: '20px',
//     background: '#555',
//     borderRadius: '10px',
//     overflow: 'hidden',
//     marginBottom: '10px'
//   };
//   const buttonStyle: React.CSSProperties = {
//     padding: '8px 16px',
//     fontSize: '14px',
//     borderRadius: '5px',
//     cursor: 'pointer'
//   };
//   return (
//     <div style={overlayStyle}>
//       <div>
//         <div>Battery: {batteryPercent.toFixed(0)}%</div>
//         <div style={barContainer}>
//           <div style={{ width: `${batteryPercent}%`, height: '100%', background: 'limegreen' }}></div>
//         </div>
//       </div>
//       <div>
//         <div>Angular Velocity: {status.angularVelocity.toFixed(2)}</div>
//         <div style={barContainer}>
//           <div style={{ width: `${angularPercent}%`, height: '100%', background: 'orange' }}></div>
//         </div>
//       </div>
//       <div>
//         <button style={buttonStyle} onClick={() => setInternalLightActive(!internalLightActive)}>
//           {internalLightActive ? "Turn Off Internal Light" : "Turn On Internal Light"}
//         </button>
//       </div>
//     </div>
//   );
// };

// // --- Loading Placeholder Component ---
// const LoadingPlaceholder: React.FC = () => {
//   return (
//     <mesh>
//       <boxGeometry args={[0.1, 0.1, 0.1]} />
//       <meshBasicMaterial color="orange" wireframe attach="material" />
//     </mesh>
//   );
// };

// export default TemporalResonatorScene;


// // // === Full Code: TemporalResonatorScene_EnhancedWithEnergyOverlay.tsx ===

// // import React, { useRef, useEffect, useMemo, Suspense, useState } from 'react';
// // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // import * as THREE from 'three';
// // import ErrorBoundary from './errorBoundary'; // Adjust path if needed
// // import { useControls, Leva } from 'leva';
// // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // // --- BVH / CSG Setup ---
// // try {
// //   (THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
// //   (THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
// //   (THREE.Mesh.prototype as any).raycast = acceleratedRaycast;
// // } catch (error) {
// //   console.error("Error setting up BVH extensions:", error);
// // }

// // const csgEvaluator = new Evaluator();
// // csgEvaluator.useGroups = true;
// // extend({ OrbitControls });

// // // --- Constants ---
// // const PHI = (1 + Math.sqrt(5)) / 2;
// // const INV_PHI = 1 / PHI;

// // // --- Face Drag Coefficients ---
// // const FACE_DRAG_COEFFICIENTS = [
// //   0.8, 1.0, 0.9, 1.1, 0.6, 1.2,
// //   1.05, 0.75, 0.95, 1.3, 0.7, 1.15
// // ];

// // // Helper: Compute effective drag multiplier based on face normals and field direction.
// // function computeEffectiveDrag(
// //   quat: THREE.Quaternion,
// //   magneticFieldDir: THREE.Vector3,
// //   faceData: { normal: THREE.Vector3 }[]
// // ) {
// //   let dragSum = 0, weightSum = 0;
// //   faceData.forEach((face, index) => {
// //     const worldNormal = face.normal.clone().applyQuaternion(quat);
// //     const alignment = Math.max(0, worldNormal.dot(magneticFieldDir));
// //     dragSum += FACE_DRAG_COEFFICIENTS[index] * alignment;
// //     weightSum += alignment;
// //   });
// //   return weightSum > 0 ? dragSum / weightSum : 1.0;
// // }

// // // Helper: Get Dodecahedron Data (vertices and face centers/normals)
// // function getDodecahedronData(radius: number): {
// //   vertices: THREE.Vector3[];
// //   faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[];
// // } {
// //   console.log(`--- Calculating Dodecahedron Data for radius: ${radius} ---`);
// //   if (typeof radius !== 'number' || radius <= 0 || !Number.isFinite(radius)) {
// //     console.error("Invalid radius passed to getDodecahedronData:", radius);
// //     throw new Error("Invalid radius provided to getDodecahedronData");
// //   }
// //   const uniqueVerticesMap = new Map<string, THREE.Vector3>();
// //   const coords = [
// //     [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1],
// //     [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
// //     [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI],
// //     [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI],
// //     [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0]
// //   ];
// //   const distOriginToVertex = Math.sqrt(PHI * PHI + INV_PHI * INV_PHI);
// //   const scale = radius / distOriginToVertex;
// //   if (!Number.isFinite(scale) || scale === 0) throw new Error("Invalid scale factor");
// //   coords.forEach(v => {
// //     const x = v[0] * scale, y = v[1] * scale, z = v[2] * scale;
// //     const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
// //     if (!uniqueVerticesMap.has(key)) uniqueVerticesMap.set(key, new THREE.Vector3(x, y, z));
// //   });
// //   const vertices = Array.from(uniqueVerticesMap.values());
// //   const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
// //   const icoVerts = [
// //     [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
// //     [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
// //     [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
// //   ];
// //   const faceCenterDist = radius * 1.53 / distOriginToVertex;
// //   icoVerts.forEach(v => {
// //     const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize();
// //     const center = normal.clone().multiplyScalar(faceCenterDist);
// //     faceData.push({ center, normal });
// //   });
// //   if (vertices.length !== 20 || faceData.length !== 12) {
// //     console.error("Vertex/Face generation failed.", vertices, faceData);
// //     throw new Error(`Incorrect data count: ${vertices.length} vertices, ${faceData.length} faces`);
// //   }
// //   console.log(`Generated ${vertices.length} vertices, ${faceData.length} faces.`);
// //   return { vertices, faceData };
// // }

// // // --- Controls Component ---
// // const Controls: React.FC = () => {
// //   const { camera, gl } = useThree();
// //   const controlsRef = useRef<OrbitControls>(null);
// //   useEffect(() => {
// //     const controls = new OrbitControls(camera, gl.domElement);
// //     controls.enableDamping = true;
// //     controls.target.set(0, 0, 0);
// //     (controlsRef as React.MutableRefObject<OrbitControls>).current = controls;
// //     return () => controls.dispose();
// //   }, [camera, gl]);
// //   useFrame(() => controlsRef.current?.update());
// //   return null;
// // };

// // // --- Roman Dodecahedron CSG Component ---
// // interface RomanDodecahedronProps {
// //   outerRadius: number;
// //   thickness: number;
// //   holeBaseDiameter: number;
// //   holeRatio: number;
// //   noduleRadius: number;
// //   material?: THREE.Material;
// //   wireframe?: boolean;
// //   [key: string]: any;
// // }

// // const RomanDodecahedron = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
// //   ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, wireframe = false, ...props }, ref) => {
// //     const [calculatedGeometry, setCalculatedGeometry] = useState<THREE.BufferGeometry | null>(null);
// //     useEffect(() => {
// //       console.log(`CSG Props: outerRadius=${outerRadius}, thickness=${thickness}, holeBaseDiameter=${holeBaseDiameter}, holeRatio=${holeRatio}, noduleRadius=${noduleRadius}`);
// //       if (
// //         typeof outerRadius !== 'number' || outerRadius <= 0 || !Number.isFinite(outerRadius) ||
// //         typeof thickness !== 'number' || thickness <= 0 || !Number.isFinite(thickness) ||
// //         typeof holeBaseDiameter !== 'number' || holeBaseDiameter <= 0 || !Number.isFinite(holeBaseDiameter) ||
// //         typeof holeRatio !== 'number' || holeRatio <= 0 || !Number.isFinite(holeRatio) ||
// //         typeof noduleRadius !== 'number' || noduleRadius <= 0 || !Number.isFinite(noduleRadius)
// //       ) {
// //         console.log("--> Skipping CSG: invalid props.");
// //         setCalculatedGeometry(null);
// //         return;
// //       }
// //       const detailLevel = 1;
// //       console.log(`Calculating CSG Geometry (Detail=${detailLevel}) for radius: ${outerRadius}`);
// //       let geometry: THREE.BufferGeometry | null = null;
// //       const tempGeoList: THREE.BufferGeometry[] = [];
// //       try {
// //         const { vertices: mathVertices, faceData: mathFaceData } = getDodecahedronData(outerRadius);
// //         const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, detailLevel);
// //         outerDodecGeo.computeBoundsTree();
// //         tempGeoList.push(outerDodecGeo);
// //         const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, detailLevel);
// //         innerDodecGeo.computeBoundsTree();
// //         tempGeoList.push(innerDodecGeo);
// //         let outerBrush = new Brush(outerDodecGeo);
// //         let innerBrush = new Brush(innerDodecGeo);
// //         innerBrush.updateMatrixWorld();
// //         let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
// //         const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * holeRatio ** i);
// //         console.log("Hole Diameters:", holeDiameters.map(d => d.toFixed(4)));
// //         const cylinderHeight = thickness * 3.1;
// //         const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16);
// //         cylinderGeo.rotateX(Math.PI / 2);
// //         cylinderGeo.computeBoundsTree();
// //         tempGeoList.push(cylinderGeo);
// //         const tempQuat = new THREE.Quaternion();
// //         let holesSubtracted = 0;
// //         mathFaceData.forEach((face, index) => {
// //           const holeRadius = holeDiameters[index] / 2;
// //           console.log(`Face ${index}: Radius=${holeRadius?.toFixed(4)}, Center=(${face.center.x.toFixed(2)},${face.center.y.toFixed(2)},${face.center.z.toFixed(2)}), Normal=(${face.normal.x.toFixed(2)},${face.normal.y.toFixed(2)},${face.normal.z.toFixed(2)})`);
// //           if (!holeRadius || holeRadius <= 0 || !Number.isFinite(holeRadius)) {
// //             console.warn(`--> Skipping Face ${index}`);
// //             return;
// //           }
// //           const holeBrush = new Brush(cylinderGeo);
// //           holeBrush.scale.set(holeRadius, holeRadius, 1);
// //           tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal);
// //           holeBrush.quaternion.copy(tempQuat);
// //           holeBrush.position.copy(face.center);
// //           holeBrush.updateMatrixWorld();
// //           try {
// //             shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION);
// //             holesSubtracted++;
// //             console.log(`--> Subtracted hole ${index}`);
// //           } catch (evalError) {
// //             console.error(`--> CSG subtraction FAILED for face ${index}:`, evalError);
// //           }
// //         });
// //         console.log(`Total holes subtracted: ${holesSubtracted}`);
// //         const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6);
// //         noduleGeo.computeBoundsTree();
// //         tempGeoList.push(noduleGeo);
// //         mathVertices.forEach(vertexPos => {
// //           const noduleBrush = new Brush(noduleGeo);
// //           noduleBrush.position.copy(vertexPos);
// //           noduleBrush.updateMatrixWorld();
// //           shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
// //         });
// //         geometry = shellBrush.geometry;
// //         geometry.computeVertexNormals();
// //         geometry.center();
// //         console.log("CSG Calculation Complete.");
// //       } catch (error) {
// //         console.error("CSG Error:", error);
// //         geometry = null;
// //       } finally {
// //         tempGeoList.forEach(g => g.dispose());
// //         console.log(`Disposed ${tempGeoList.length} temporary geometries.`);
// //       }
// //       setCalculatedGeometry(geometry);
// //       return () => {
// //         if (geometry && typeof geometry.dispose === 'function') {
// //           geometry.dispose();
// //           console.log("Disposed final CSG geometry on cleanup.");
// //         }
// //       };
// //     }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]);

// //     const meshMaterial = useMemo(() => {
// //       let baseMaterial: THREE.Material;
// //       if (material instanceof THREE.Material) {
// //         baseMaterial = material.clone();
// //         baseMaterial.side = THREE.DoubleSide;
// //       } else {
// //         baseMaterial = new THREE.MeshPhongMaterial({
// //           color: 0xb87333,
// //           side: THREE.DoubleSide,
// //           specular: 0x444444,
// //           shininess: 40,
// //           name: "DefaultPhongCopper"
// //         });
// //       }
// //       if ("wireframe" in baseMaterial) {
// //         (baseMaterial as any).wireframe = wireframe;
// //       }
// //       baseMaterial.side = THREE.DoubleSide;
// //       return baseMaterial;
// //     }, [material, wireframe]);

// //     useEffect(() => {
// //       return () => {
// //         meshMaterial?.dispose();
// //       };
// //     }, [meshMaterial]);

// //     if (!calculatedGeometry) return null;
// //     return <mesh ref={ref} geometry={calculatedGeometry} material={meshMaterial} {...props} />;
// //   }
// // );

// // // --- Physics State Interface ---
// // interface PhysicsState {
// //   angularVelocity: THREE.Vector3;
// //   fieldAngle: number;
// //   currentTorque: THREE.Vector3;
// // }

// // // --- Main Simulation Component ---
// // // Accepts an onStatusUpdate prop to report battery and angular velocity status.
// // interface ResonatorSimulationProps {
// //   onStatusUpdate: (status: { battery: number; angularVelocity: number }) => void;
// // }

// // const ResonatorSimulation: React.FC<ResonatorSimulationProps> = ({ onStatusUpdate }) => {
// //   const groupRef = useRef<THREE.Group>(null!);
// //   const dodecahedronMeshRef = useRef<THREE.Mesh>(null!);
// //   const particlesRef = useRef<THREE.Points>(null!);
// //   const particleGeoRef = useRef<THREE.BufferGeometry>(null!);
// //   // We'll store a boolean that indicates whether we're in "charging" mode
// //   const chargingModeRef = useRef(false);


// //   // Controls – including fieldActive toggle.
// //   const resonatorControls = useControls("Resonator Controls", {
// //     baseFieldSpeed: { value: 1.0, min: 0, max: 5, step: 0.1 },
// //     fieldIntensity: { value: 1.0, min: 0.0, max: 5, step: 0.1 },
// //     k_drag: { label: "Induction Strength", value: 0.5, min: 0, max: 2, step: 0.05 },
// //     inertiaScale: { label: "Inertia Scale", value: 1.0, min: 0.1, max: 5, step: 0.1 },
// //     damping: { value: 0.1, min: 0, max: 1, step: 0.01 },
// //     spinUpRate: { value: 0.5, min: 0, max: 2, step: 0.1 },
// //     velocityThreshold: { value: 1.5, min: 0, max: 10, step: 0.1 },
// //     thresholdFeedbackFactor: { value: 1.0, min: 0, max: 5, step: 0.1 },
// //     fieldActive: { value: true },
// //     noduleAntifieldStrength: { value: 0.2, min: 0, max: 2, step: 0.05 }
// //   });

// //   const shellControls = useControls("Shell Geometry", {
// //     outerRadius: 1.0,
// //     thickness: 0.05,
// //     holeBaseDiameter: 0.1,
// //     holeRatio: 1.2,
// //     noduleRadius: 0.1
// //   });

// //   const vizControls = useControls("Visualization", {
// //     particleCount: { value: 1000, min: 100, max: 5000, step: 100 },
// //     particleSize: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
// //     torusMajorRadius: { value: 1.5, min: 0.5, max: 5, step: 0.1 },
// //     torusMinorRadius: { value: 0.5, min: 0.1, max: 2, step: 0.05 },
// //     showParticles: true,
// //     wireframe: false
// //   });

// //   const defaultShellParams = useMemo(() => ({
// //     outerRadius: 1.0,
// //     thickness: 0.05,
// //     holeBaseDiameter: 0.1,
// //     holeRatio: 1.2,
// //     noduleRadius: 0.1
// //   }), []);
// //   const finalShellParams = useMemo(() => ({
// //     outerRadius:
// //       typeof shellControls.outerRadius === 'number' && Number.isFinite(shellControls.outerRadius)
// //         ? shellControls.outerRadius : defaultShellParams.outerRadius,
// //     thickness:
// //       typeof shellControls.thickness === 'number' && Number.isFinite(shellControls.thickness)
// //         ? shellControls.thickness : defaultShellParams.thickness,
// //     holeBaseDiameter:
// //       typeof shellControls.holeBaseDiameter === 'number' && Number.isFinite(shellControls.holeBaseDiameter)
// //         ? shellControls.holeBaseDiameter : defaultShellParams.holeBaseDiameter,
// //     holeRatio:
// //       typeof shellControls.holeRatio === 'number' && Number.isFinite(shellControls.holeRatio)
// //         ? shellControls.holeRatio : defaultShellParams.holeRatio,
// //     noduleRadius:
// //       typeof shellControls.noduleRadius === 'number' && Number.isFinite(shellControls.noduleRadius)
// //         ? shellControls.noduleRadius : defaultShellParams.noduleRadius
// //   }), [shellControls, defaultShellParams]);

// //   const effectiveInertia = useMemo(() => {
// //     return resonatorControls.inertiaScale *
// //       ((finalShellParams.outerRadius ** 5 - (finalShellParams.outerRadius - finalShellParams.thickness) ** 5) /
// //        finalShellParams.outerRadius ** 5);
// //   }, [resonatorControls.inertiaScale, finalShellParams.outerRadius, finalShellParams.thickness]);

// //   // --- Battery (energy) state (ref) ---
// //   const batteryRef = useRef(100); // 0-100
// //   const DRAIN_RATE = 10;
// //   const RECHARGE_RATE = 5;

// //   // --- Physics State (vector-based) ---
// //   const physicsState = useRef<PhysicsState>({
// //     angularVelocity: new THREE.Vector3(0, 0, 0),
// //     fieldAngle: 0,
// //     currentTorque: new THREE.Vector3(0, 0, 0)
// //   });

// //   // --- Particle Data ---
// //   const particleData = useMemo(() => {
// //     console.log(`Creating particle data for count: ${vizControls.particleCount}`);
// //     try {
// //       const data = [];
// //       const positions = new Float32Array(vizControls.particleCount * 3);
// //       for (let i = 0; i < vizControls.particleCount; i++) {
// //         const u = Math.random() * Math.PI * 2;
// //         const v = Math.random() * Math.PI * 2;
// //         const R = vizControls.torusMajorRadius;
// //         const r = vizControls.torusMinorRadius;
// //         const randR = R + (Math.random() - 0.5) * 0.2 * r;
// //         const randr = r * Math.sqrt(Math.random());
// //         positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u);
// //         positions[i * 3 + 1] = randr * Math.sin(v);
// //         positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);
// //         data.push({ u, v, R, r: randr });
// //       }
// //       return { positions, data };
// //     } catch (error) {
// //       console.error("Error creating particle data:", error);
// //       return { positions: new Float32Array(0), data: [] };
// //     }
// //   }, [vizControls.particleCount, vizControls.torusMajorRadius, vizControls.torusMinorRadius]);

// //   useEffect(() => {
// //     if (particleGeoRef.current && particleData?.positions) {
// //       const existingAttribute = particleGeoRef.current.getAttribute("position") as THREE.BufferAttribute | undefined;
// //       if (!existingAttribute || existingAttribute.array.length !== particleData.positions.length) {
// //         particleGeoRef.current.setAttribute("position", new THREE.BufferAttribute(particleData.positions, 3, false));
// //         console.log(`Particle position attribute CREATED/REPLACED (Count: ${particleData.positions.length / 3}).`);
// //       }
// //       if (particleGeoRef.current.getAttribute("color")) {
// //         particleGeoRef.current.deleteAttribute("color");
// //         console.log("Removed old particle color attribute.");
// //       }
// //     } else {
// //       if (particleGeoRef.current?.getAttribute("position")) {
// //         particleGeoRef.current.deleteAttribute("position");
// //         console.log("Particle position attribute removed.");
// //       }
// //     }
// //   }, [particleData]);

// //   // --- 3D Vector Physics Update with Energy and Nodule Antifield ---
// //   useFrame((state, delta) => {
    
// //     const ps = physicsState.current;
// //     const fieldActive = resonatorControls.fieldActive;
// //     if (fieldActive && batteryRef.current > 0) {
// //       ps.fieldAngle += resonatorControls.spinUpRate * delta;
// //       batteryRef.current = Math.max(batteryRef.current - DRAIN_RATE * delta, 0);
// //     } else {
// //       batteryRef.current = Math.min(batteryRef.current + RECHARGE_RATE * delta, 100);
// //     }
// //     const magneticFieldDir = new THREE.Vector3(Math.cos(ps.fieldAngle), Math.sin(ps.fieldAngle), 0).normalize();
// //     const desiredAngularVel = fieldActive ? magneticFieldDir.clone().multiplyScalar(resonatorControls.baseFieldSpeed) : new THREE.Vector3(0, 0, 0);
// //     const error = desiredAngularVel.clone().sub(ps.angularVelocity);
// //     const { faceData } = getDodecahedronData(finalShellParams.outerRadius);
// //     const effectiveDragFactor = computeEffectiveDrag(groupRef.current.quaternion, magneticFieldDir, faceData);
// //     const dragTorque = error.clone().multiplyScalar(effectiveDragFactor * resonatorControls.k_drag * resonatorControls.fieldIntensity);
// //     const currentSpeed = ps.angularVelocity.length();
// //     let feedbackTorque = new THREE.Vector3(0, 0, 0);
// //     if (currentSpeed > resonatorControls.velocityThreshold) {
// //       const overage = currentSpeed - resonatorControls.velocityThreshold;
// //       feedbackTorque = ps.angularVelocity.clone().normalize().multiplyScalar(-resonatorControls.thresholdFeedbackFactor * overage);
// //     }
// //     let netTorque = dragTorque.add(feedbackTorque);
// //     // --- Nodule Antifield Torque ---
// //     let noduleTorque = new THREE.Vector3(0, 0, 0);
// //     const nodulePositions = getDodecahedronData(finalShellParams.outerRadius).vertices;
// //     nodulePositions.forEach(nodulePos => {
// //       const worldPos = nodulePos.clone().applyQuaternion(groupRef.current.quaternion);
// //       const contribution = worldPos.clone().cross(magneticFieldDir).multiplyScalar(resonatorControls.noduleAntifieldStrength);
// //       noduleTorque.add(contribution);
// //     });
// //     netTorque.add(noduleTorque);
// //     ps.currentTorque.copy(netTorque);
// //     const angularAccel = netTorque.clone().divideScalar(effectiveInertia);
// //     ps.angularVelocity.add(angularAccel.multiplyScalar(delta));
// //     ps.angularVelocity.multiplyScalar(1 - resonatorControls.damping * delta);
// //     const deltaAngle = ps.angularVelocity.length() * delta;
// //     if (deltaAngle > 0) {
// //       const rotationAxis = ps.angularVelocity.clone().normalize();
// //       const deltaQuat = new THREE.Quaternion().setFromAxisAngle(rotationAxis, deltaAngle);
// //       groupRef.current.quaternion.multiply(deltaQuat);
// //     }
// //     // Optional emissive update.
// //     if (dodecahedronMeshRef.current) {
// //       const currentMaterial = dodecahedronMeshRef.current.material;
// //       if (currentMaterial instanceof THREE.MeshStandardMaterial || currentMaterial instanceof THREE.MeshPhysicalMaterial) {
// //         if (currentMaterial.emissive) {
// //           const maxTorqueEst = resonatorControls.k_drag * resonatorControls.fieldIntensity * (resonatorControls.baseFieldSpeed * 1.5 + 1);
// //           const emissionStrength = Math.min(netTorque.length() / (maxTorqueEst + 0.01), 1.0);
// //           currentMaterial.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5);
// //         }
// //       }
// //     }
// //     // Update particle positions.
// //     if (
// //       vizControls.showParticles &&
// //       particleGeoRef.current?.attributes.position &&
// //       particlesRef.current &&
// //       particleData?.data
// //     ) {
// //       const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// //       const speed = resonatorControls.baseFieldSpeed * resonatorControls.fieldIntensity;
// //       const pData = particleData.data;
// //       if (pData && pData.length * 3 === positions.length) {
// //         const pointsMat = particlesRef.current.material as THREE.PointsMaterial;
// //         if (pointsMat) pointsMat.size = vizControls.particleSize * (1 + resonatorControls.fieldIntensity * 0.5);
// //         for (let i = 0; i < pData.length; i++) {
// //           const data = pData[i];
// //           data.u += speed * delta;
// //           const R = vizControls.torusMajorRadius;
// //           const r = data.r;
// //           const u = data.u;
// //           const v = data.v;
// //           const bufferIndex = i * 3;
// //           positions[bufferIndex] = (R + r * Math.cos(v)) * Math.cos(u);
// //           positions[bufferIndex + 1] = r * Math.sin(v);
// //           positions[bufferIndex + 2] = (R + r * Math.cos(v)) * Math.sin(u);
// //         }
// //         particleGeoRef.current.attributes.position.needsUpdate = true;
// //       } else {
// //         console.warn("Mismatch in particle data/buffer length.");
// //       }
// //     }
// //     // Report status (battery and angular velocity magnitude) via callback.
// //     onStatusUpdate({
// //       battery: batteryRef.current,
// //       angularVelocity: ps.angularVelocity.length()
// //     });
// //   });

// //   return (
// //     <group ref={groupRef}>
// //       <RomanDodecahedron
// //         ref={dodecahedronMeshRef}
// //         outerRadius={finalShellParams.outerRadius}
// //         thickness={finalShellParams.thickness}
// //         holeBaseDiameter={finalShellParams.holeBaseDiameter}
// //         holeRatio={finalShellParams.holeRatio}
// //         noduleRadius={finalShellParams.noduleRadius}
// //         wireframe={vizControls.wireframe}
// //         castShadow
// //         receiveShadow
// //         position={[0, 0, 0]}
// //         rotation={[0, 0, 0]}
// //       />
// //       {/* Internal pointLight is now controlled externally */}
// //       {/** We do not render this light in the scene by default */}
// //       {vizControls.showParticles && (
// //         <points ref={particlesRef} name="FieldParticles">
// //           <bufferGeometry ref={particleGeoRef} />
// //           <pointsMaterial
// //             name="ParticleMaterial"
// //             color={0x00ffff}
// //             size={vizControls.particleSize}
// //             transparent
// //             opacity={0.7}
// //             blending={THREE.AdditiveBlending}
// //             sizeAttenuation={false}
// //             map={null}
// //           />
// //         </points>
// //       )}
// //     </group>
// //   );
// // };

// // const TemporalResonatorScene: React.FC = () => {
// //   // Lift status state outside Canvas.
// //   const [status, setStatus] = useState({ battery: 100, angularVelocity: 0 });
// //   // New state: toggle internal light (heating light)
// //   const [internalLightActive, setInternalLightActive] = useState(false);
// //   return (
// //     <>
// //       <Leva collapsed={false} titleBar={{ title: "Controls" }} />
// //       <Canvas
// //         style={{
// //           position: "absolute",
// //           top: 0,
// //           left: 0,
// //           width: "100vw",
// //           height: "100vh",
// //           background: "#111122",
// //           zIndex: 0
// //         }}
// //         camera={{ position: [3, 3, 5], fov: 75 }}
// //         gl={{ antialias: true }}
// //         shadows
// //       >
// //         {/** Reduce ambient light so that the copper shell remains dark when internal light is off */}
// //         <ambientLight intensity={0.0} />
// //         <hemisphereLight groundColor={0x404040} intensity={0.3} />
// //         <directionalLight
// //           position={[5, 10, 7.5]}
// //           intensity={0.8}
// //           castShadow
// //           shadow-mapSize-width={1024}
// //           shadow-mapSize-height={1024}
// //           shadow-camera-far={25}
// //           shadow-camera-left={-10}
// //           shadow-camera-right={10}
// //           shadow-camera-top={10}
// //           shadow-camera-bottom={-10}
// //         />
// //         {/** Internal light: only render when toggled on */}
// //         {internalLightActive && (
// //           <pointLight
// //             intensity={0.5}
// //             color={0xffddcc}
// //             distance={3}
// //             decay={1.5}
// //             position={[0, 0, 0]}
// //             name="InternalLight"
// //           />
// //         )}
// //         <ErrorBoundary>
// //           <Suspense fallback={<LoadingPlaceholder />}>
// //             <ResonatorSimulation onStatusUpdate={setStatus} />
// //           </Suspense>
// //         </ErrorBoundary>
// //         <Controls />
// //       </Canvas>
// //       {/** StatusOverlay rendered outside the Canvas */}
// //       <StatusOverlay status={status} internalLightActive={internalLightActive} setInternalLightActive={setInternalLightActive} />
// //     </>
// //   );
// // };

// // // --- Status Overlay Component ---
// // // Renders battery and angular velocity bars and adds a button to toggle the internal light.
// // const StatusOverlay: React.FC<{
// //   status: { battery: number; angularVelocity: number };
// //   internalLightActive: boolean;
// //   setInternalLightActive: (active: boolean) => void;
// // }> = ({ status, internalLightActive, setInternalLightActive }) => {
// //   const batteryPercent = status.battery;
// //   const angularPercent = Math.min((status.angularVelocity / 10) * 100, 100);
// //   const overlayStyle: React.CSSProperties = {
// //     position: 'absolute',
// //     top: 20,
// //     left: 20,
// //     color: '#fff',
// //     fontFamily: 'sans-serif',
// //     zIndex: 10
// //   };
// //   const barContainer: React.CSSProperties = {
// //     width: '200px',
// //     height: '20px',
// //     background: '#555',
// //     borderRadius: '10px',
// //     overflow: 'hidden',
// //     marginBottom: '10px'
// //   };
// //   const buttonStyle: React.CSSProperties = {
// //     padding: '8px 16px',
// //     fontSize: '14px',
// //     borderRadius: '5px',
// //     cursor: 'pointer'
// //   };
// //   return (
// //     <div style={overlayStyle}>
// //       <div>
// //         <div>Battery: {batteryPercent.toFixed(0)}%</div>
// //         <div style={barContainer}>
// //           <div style={{ width: `${batteryPercent}%`, height: '100%', background: 'limegreen' }}></div>
// //         </div>
// //       </div>
// //       <div>
// //         <div>Angular Velocity: {status.angularVelocity.toFixed(2)}</div>
// //         <div style={barContainer}>
// //           <div style={{ width: `${angularPercent}%`, height: '100%', background: 'orange' }}></div>
// //         </div>
// //       </div>
// //       <div>
// //         <button style={buttonStyle} onClick={() => setInternalLightActive(!internalLightActive)}>
// //           {internalLightActive ? "Turn Off Internal Light" : "Turn On Internal Light"}
// //         </button>
// //       </div>
// //     </div>
// //   );
// // };

// // // --- Loading Placeholder Component ---
// // const LoadingPlaceholder: React.FC = () => {
// //   return (
// //     <mesh>
// //       <boxGeometry args={[0.1, 0.1, 0.1]} />
// //       <meshBasicMaterial color="orange" wireframe attach="material" />
// //     </mesh>
// //   );
// // };

// // export default TemporalResonatorScene;



// // // // === Full Code: TemporalResonatorScene_EnhancedWithEnergyOverlay.tsx ===

// // // import React, { useRef, useEffect, useMemo, Suspense, useState } from 'react';
// // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // import * as THREE from 'three';
// // // import ErrorBoundary from './errorBoundary'; // Adjust path if needed
// // // import { useControls, Leva } from 'leva';
// // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// // // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // // // --- BVH / CSG Setup ---
// // // try {
// // //   (THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
// // //   (THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
// // //   (THREE.Mesh.prototype as any).raycast = acceleratedRaycast;
// // // } catch (error) {
// // //   console.error("Error setting up BVH extensions:", error);
// // // }

// // // const csgEvaluator = new Evaluator();
// // // csgEvaluator.useGroups = true;
// // // extend({ OrbitControls });

// // // // --- Constants ---
// // // const PHI = (1 + Math.sqrt(5)) / 2;
// // // const INV_PHI = 1 / PHI;

// // // // --- Face Drag Coefficients ---
// // // const FACE_DRAG_COEFFICIENTS = [
// // //   0.8, 1.0, 0.9, 1.1, 0.6, 1.2,
// // //   1.05, 0.75, 0.95, 1.3, 0.7, 1.15
// // // ];

// // // // Helper: Compute effective drag multiplier based on face normals and field direction.
// // // function computeEffectiveDrag(
// // //   quat: THREE.Quaternion,
// // //   magneticFieldDir: THREE.Vector3,
// // //   faceData: { normal: THREE.Vector3 }[]
// // // ) {
// // //   let dragSum = 0, weightSum = 0;
// // //   faceData.forEach((face, index) => {
// // //     const worldNormal = face.normal.clone().applyQuaternion(quat);
// // //     const alignment = Math.max(0, worldNormal.dot(magneticFieldDir));
// // //     dragSum += FACE_DRAG_COEFFICIENTS[index] * alignment;
// // //     weightSum += alignment;
// // //   });
// // //   return weightSum > 0 ? dragSum / weightSum : 1.0;
// // // }

// // // // Helper: Get Dodecahedron Data (vertices and face centers/normals)
// // // function getDodecahedronData(radius: number): {
// // //   vertices: THREE.Vector3[];
// // //   faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[];
// // // } {
// // //   console.log(`--- Calculating Dodecahedron Data for radius: ${radius} ---`);
// // //   if (typeof radius !== 'number' || radius <= 0 || !Number.isFinite(radius)) {
// // //     console.error("Invalid radius passed to getDodecahedronData:", radius);
// // //     throw new Error("Invalid radius provided to getDodecahedronData");
// // //   }
// // //   const uniqueVerticesMap = new Map<string, THREE.Vector3>();
// // //   const coords = [
// // //     [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1],
// // //     [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
// // //     [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI],
// // //     [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI],
// // //     [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0]
// // //   ];
// // //   const distOriginToVertex = Math.sqrt(PHI * PHI + INV_PHI * INV_PHI);
// // //   const scale = radius / distOriginToVertex;
// // //   if (!Number.isFinite(scale) || scale === 0) throw new Error("Invalid scale factor");
// // //   coords.forEach(v => {
// // //     const x = v[0] * scale, y = v[1] * scale, z = v[2] * scale;
// // //     const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
// // //     if (!uniqueVerticesMap.has(key)) uniqueVerticesMap.set(key, new THREE.Vector3(x, y, z));
// // //   });
// // //   const vertices = Array.from(uniqueVerticesMap.values());
// // //   const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
// // //   const icoVerts = [
// // //     [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
// // //     [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
// // //     [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
// // //   ];
// // //   const faceCenterDist = radius * 1.53 / distOriginToVertex;
// // //   icoVerts.forEach(v => {
// // //     const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize();
// // //     const center = normal.clone().multiplyScalar(faceCenterDist);
// // //     faceData.push({ center, normal });
// // //   });
// // //   if (vertices.length !== 20 || faceData.length !== 12) {
// // //     console.error("Vertex/Face generation failed.", vertices, faceData);
// // //     throw new Error(`Incorrect data count: ${vertices.length} vertices, ${faceData.length} faces`);
// // //   }
// // //   console.log(`Generated ${vertices.length} vertices, ${faceData.length} faces.`);
// // //   return { vertices, faceData };
// // // }

// // // // --- Controls Component ---
// // // const Controls: React.FC = () => {
// // //   const { camera, gl } = useThree();
// // //   const controlsRef = useRef<OrbitControls>(null);
// // //   useEffect(() => {
// // //     const controls = new OrbitControls(camera, gl.domElement);
// // //     controls.enableDamping = true;
// // //     controls.target.set(0, 0, 0);
// // //     (controlsRef as React.MutableRefObject<OrbitControls>).current = controls;
// // //     return () => controls.dispose();
// // //   }, [camera, gl]);
// // //   useFrame(() => controlsRef.current?.update());
// // //   return null;
// // // };

// // // // --- Roman Dodecahedron CSG Component ---
// // // interface RomanDodecahedronProps {
// // //   outerRadius: number;
// // //   thickness: number;
// // //   holeBaseDiameter: number;
// // //   holeRatio: number;
// // //   noduleRadius: number;
// // //   material?: THREE.Material;
// // //   wireframe?: boolean;
// // //   [key: string]: any;
// // // }

// // // const RomanDodecahedron = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
// // //   ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, wireframe = false, ...props }, ref) => {
// // //     const [calculatedGeometry, setCalculatedGeometry] = useState<THREE.BufferGeometry | null>(null);
// // //     useEffect(() => {
// // //       console.log(`CSG Props: outerRadius=${outerRadius}, thickness=${thickness}, holeBaseDiameter=${holeBaseDiameter}, holeRatio=${holeRatio}, noduleRadius=${noduleRadius}`);
// // //       if (
// // //         typeof outerRadius !== 'number' || outerRadius <= 0 || !Number.isFinite(outerRadius) ||
// // //         typeof thickness !== 'number' || thickness <= 0 || !Number.isFinite(thickness) ||
// // //         typeof holeBaseDiameter !== 'number' || holeBaseDiameter <= 0 || !Number.isFinite(holeBaseDiameter) ||
// // //         typeof holeRatio !== 'number' || holeRatio <= 0 || !Number.isFinite(holeRatio) ||
// // //         typeof noduleRadius !== 'number' || noduleRadius <= 0 || !Number.isFinite(noduleRadius)
// // //       ) {
// // //         console.log("--> Skipping CSG: invalid props.");
// // //         setCalculatedGeometry(null);
// // //         return;
// // //       }
// // //       const detailLevel = 1;
// // //       console.log(`Calculating CSG Geometry (Detail=${detailLevel}) for radius: ${outerRadius}`);
// // //       let geometry: THREE.BufferGeometry | null = null;
// // //       const tempGeoList: THREE.BufferGeometry[] = [];
// // //       try {
// // //         const { vertices: mathVertices, faceData: mathFaceData } = getDodecahedronData(outerRadius);
// // //         const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, detailLevel);
// // //         outerDodecGeo.computeBoundsTree();
// // //         tempGeoList.push(outerDodecGeo);
// // //         const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, detailLevel);
// // //         innerDodecGeo.computeBoundsTree();
// // //         tempGeoList.push(innerDodecGeo);
// // //         let outerBrush = new Brush(outerDodecGeo);
// // //         let innerBrush = new Brush(innerDodecGeo);
// // //         innerBrush.updateMatrixWorld();
// // //         let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
// // //         const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * holeRatio ** i);
// // //         console.log("Hole Diameters:", holeDiameters.map(d => d.toFixed(4)));
// // //         const cylinderHeight = thickness * 3.1;
// // //         const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16);
// // //         cylinderGeo.rotateX(Math.PI / 2);
// // //         cylinderGeo.computeBoundsTree();
// // //         tempGeoList.push(cylinderGeo);
// // //         const tempQuat = new THREE.Quaternion();
// // //         let holesSubtracted = 0;
// // //         mathFaceData.forEach((face, index) => {
// // //           const holeRadius = holeDiameters[index] / 2;
// // //           console.log(`Face ${index}: Radius=${holeRadius?.toFixed(4)}, Center=(${face.center.x.toFixed(2)},${face.center.y.toFixed(2)},${face.center.z.toFixed(2)}), Normal=(${face.normal.x.toFixed(2)},${face.normal.y.toFixed(2)},${face.normal.z.toFixed(2)})`);
// // //           if (!holeRadius || holeRadius <= 0 || !Number.isFinite(holeRadius)) {
// // //             console.warn(`--> Skipping Face ${index}`);
// // //             return;
// // //           }
// // //           const holeBrush = new Brush(cylinderGeo);
// // //           holeBrush.scale.set(holeRadius, holeRadius, 1);
// // //           tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal);
// // //           holeBrush.quaternion.copy(tempQuat);
// // //           holeBrush.position.copy(face.center);
// // //           holeBrush.updateMatrixWorld();
// // //           try {
// // //             shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION);
// // //             holesSubtracted++;
// // //             console.log(`--> Subtracted hole ${index}`);
// // //           } catch (evalError) {
// // //             console.error(`--> CSG subtraction FAILED for face ${index}:`, evalError);
// // //           }
// // //         });
// // //         console.log(`Total holes subtracted: ${holesSubtracted}`);
// // //         const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6);
// // //         noduleGeo.computeBoundsTree();
// // //         tempGeoList.push(noduleGeo);
// // //         mathVertices.forEach(vertexPos => {
// // //           const noduleBrush = new Brush(noduleGeo);
// // //           noduleBrush.position.copy(vertexPos);
// // //           noduleBrush.updateMatrixWorld();
// // //           shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
// // //         });
// // //         geometry = shellBrush.geometry;
// // //         geometry.computeVertexNormals();
// // //         geometry.center();
// // //         console.log("CSG Calculation Complete.");
// // //       } catch (error) {
// // //         console.error("CSG Error:", error);
// // //         geometry = null;
// // //       } finally {
// // //         tempGeoList.forEach(g => g.dispose());
// // //         console.log(`Disposed ${tempGeoList.length} temporary geometries.`);
// // //       }
// // //       setCalculatedGeometry(geometry);
// // //       return () => {
// // //         if (geometry && typeof geometry.dispose === 'function') {
// // //           geometry.dispose();
// // //           console.log("Disposed final CSG geometry on cleanup.");
// // //         }
// // //       };
// // //     }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]);

// // //     const meshMaterial = useMemo(() => {
// // //       let baseMaterial: THREE.Material;
// // //       if (material instanceof THREE.Material) {
// // //         baseMaterial = material.clone();
// // //         baseMaterial.side = THREE.DoubleSide;
// // //       } else {
// // //         baseMaterial = new THREE.MeshPhongMaterial({
// // //           color: 0xb87333,
// // //           side: THREE.DoubleSide,
// // //           specular: 0x444444,
// // //           shininess: 40,
// // //           name: "DefaultPhongCopper"
// // //         });
// // //       }
// // //       if ("wireframe" in baseMaterial) {
// // //         (baseMaterial as any).wireframe = wireframe;
// // //       }
// // //       baseMaterial.side = THREE.DoubleSide;
// // //       return baseMaterial;
// // //     }, [material, wireframe]);

// // //     useEffect(() => {
// // //       return () => {
// // //         meshMaterial?.dispose();
// // //       };
// // //     }, [meshMaterial]);

// // //     if (!calculatedGeometry) return null;
// // //     return <mesh ref={ref} geometry={calculatedGeometry} material={meshMaterial} {...props} />;
// // //   }
// // // );

// // // // --- Physics State Interface ---
// // // interface PhysicsState {
// // //   angularVelocity: THREE.Vector3;
// // //   fieldAngle: number;
// // //   currentTorque: THREE.Vector3;
// // // }

// // // // --- Main Simulation Component ---
// // // // Accepts an onStatusUpdate prop to report battery and angular velocity status.
// // // interface ResonatorSimulationProps {
// // //   onStatusUpdate: (status: { battery: number; angularVelocity: number }) => void;
// // // }

// // // const ResonatorSimulation: React.FC<ResonatorSimulationProps> = ({ onStatusUpdate }) => {
// // //   const groupRef = useRef<THREE.Group>(null!);
// // //   const dodecahedronMeshRef = useRef<THREE.Mesh>(null!);
// // //   const particlesRef = useRef<THREE.Points>(null!);
// // //   const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // //   // Controls – note new control "fieldActive" for start/stop and "noduleAntifieldStrength"
// // //   const resonatorControls = useControls("Resonator Controls", {
// // //     baseFieldSpeed: { value: 1.0, min: 0, max: 5, step: 0.1 },
// // //     fieldIntensity: { value: 1.0, min: 0.0, max: 5, step: 0.1 },
// // //     k_drag: { label: "Induction Strength", value: 0.5, min: 0, max: 2, step: 0.05 },
// // //     inertiaScale: { label: "Inertia Scale", value: 1.0, min: 0.1, max: 5, step: 0.1 },
// // //     damping: { value: 0.1, min: 0, max: 1, step: 0.01 },
// // //     spinUpRate: { value: 0.5, min: 0, max: 2, step: 0.1 },
// // //     velocityThreshold: { value: 1.5, min: 0, max: 10, step: 0.1 },
// // //     thresholdFeedbackFactor: { value: 1.0, min: 0, max: 5, step: 0.1 },
// // //     fieldActive: { value: true },
// // //     noduleAntifieldStrength: { value: 0.2, min: 0, max: 2, step: 0.05 }
// // //   });

// // //   const shellControls = useControls("Shell Geometry", {
// // //     outerRadius: 1.0,
// // //     thickness: 0.05,
// // //     holeBaseDiameter: 0.1,
// // //     holeRatio: 1.2,
// // //     noduleRadius: 0.1
// // //   });

// // //   const vizControls = useControls("Visualization", {
// // //     particleCount: { value: 1000, min: 100, max: 5000, step: 100 },
// // //     particleSize: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
// // //     torusMajorRadius: { value: 1.5, min: 0.5, max: 5, step: 0.1 },
// // //     torusMinorRadius: { value: 0.5, min: 0.1, max: 2, step: 0.05 },
// // //     showParticles: true,
// // //     wireframe: false
// // //   });

// // //   const defaultShellParams = useMemo(() => ({
// // //     outerRadius: 1.0,
// // //     thickness: 0.05,
// // //     holeBaseDiameter: 0.1,
// // //     holeRatio: 1.2,
// // //     noduleRadius: 0.1
// // //   }), []);
// // //   const finalShellParams = useMemo(() => ({
// // //     outerRadius:
// // //       typeof shellControls.outerRadius === 'number' && Number.isFinite(shellControls.outerRadius)
// // //         ? shellControls.outerRadius : defaultShellParams.outerRadius,
// // //     thickness:
// // //       typeof shellControls.thickness === 'number' && Number.isFinite(shellControls.thickness)
// // //         ? shellControls.thickness : defaultShellParams.thickness,
// // //     holeBaseDiameter:
// // //       typeof shellControls.holeBaseDiameter === 'number' && Number.isFinite(shellControls.holeBaseDiameter)
// // //         ? shellControls.holeBaseDiameter : defaultShellParams.holeBaseDiameter,
// // //     holeRatio:
// // //       typeof shellControls.holeRatio === 'number' && Number.isFinite(shellControls.holeRatio)
// // //         ? shellControls.holeRatio : defaultShellParams.holeRatio,
// // //     noduleRadius:
// // //       typeof shellControls.noduleRadius === 'number' && Number.isFinite(shellControls.noduleRadius)
// // //         ? shellControls.noduleRadius : defaultShellParams.noduleRadius
// // //   }), [shellControls, defaultShellParams]);

// // //   const effectiveInertia = useMemo(() => {
// // //     return resonatorControls.inertiaScale *
// // //       ((finalShellParams.outerRadius ** 5 - (finalShellParams.outerRadius - finalShellParams.thickness) ** 5) /
// // //        finalShellParams.outerRadius ** 5);
// // //   }, [resonatorControls.inertiaScale, finalShellParams.outerRadius, finalShellParams.thickness]);

// // //   // --- Battery (energy) state (ref) ---
// // //   const batteryRef = useRef(100); // 0-100
// // //   const DRAIN_RATE = 10;
// // //   const RECHARGE_RATE = 5;

// // //   // --- Physics State (vector-based) ---
// // //   const physicsState = useRef<PhysicsState>({
// // //     angularVelocity: new THREE.Vector3(0, 0, 0),
// // //     fieldAngle: 0,
// // //     currentTorque: new THREE.Vector3(0, 0, 0)
// // //   });

// // //   // --- Particle Data ---
// // //   const particleData = useMemo(() => {
// // //     console.log(`Creating particle data for count: ${vizControls.particleCount}`);
// // //     try {
// // //       const data = [];
// // //       const positions = new Float32Array(vizControls.particleCount * 3);
// // //       for (let i = 0; i < vizControls.particleCount; i++) {
// // //         const u = Math.random() * Math.PI * 2;
// // //         const v = Math.random() * Math.PI * 2;
// // //         const R = vizControls.torusMajorRadius;
// // //         const r = vizControls.torusMinorRadius;
// // //         const randR = R + (Math.random() - 0.5) * 0.2 * r;
// // //         const randr = r * Math.sqrt(Math.random());
// // //         positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u);
// // //         positions[i * 3 + 1] = randr * Math.sin(v);
// // //         positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);
// // //         data.push({ u, v, R, r: randr });
// // //       }
// // //       return { positions, data };
// // //     } catch (error) {
// // //       console.error("Error creating particle data:", error);
// // //       return { positions: new Float32Array(0), data: [] };
// // //     }
// // //   }, [vizControls.particleCount, vizControls.torusMajorRadius, vizControls.torusMinorRadius]);

// // //   useEffect(() => {
// // //     if (particleGeoRef.current && particleData?.positions) {
// // //       const existingAttribute = particleGeoRef.current.getAttribute("position") as THREE.BufferAttribute | undefined;
// // //       if (!existingAttribute || existingAttribute.array.length !== particleData.positions.length) {
// // //         particleGeoRef.current.setAttribute("position", new THREE.BufferAttribute(particleData.positions, 3, false));
// // //         console.log(`Particle position attribute CREATED/REPLACED (Count: ${particleData.positions.length / 3}).`);
// // //       }
// // //       if (particleGeoRef.current.getAttribute("color")) {
// // //         particleGeoRef.current.deleteAttribute("color");
// // //         console.log("Removed old particle color attribute.");
// // //       }
// // //     } else {
// // //       if (particleGeoRef.current?.getAttribute("position")) {
// // //         particleGeoRef.current.deleteAttribute("position");
// // //         console.log("Particle position attribute removed.");
// // //       }
// // //     }
// // //   }, [particleData]);

// // //   // --- 3D Vector Physics Update with Energy and Nodule Antifield ---
// // //   useFrame((state, delta) => {
// // //     const ps = physicsState.current;
// // //     const fieldActive = resonatorControls.fieldActive;
// // //     if (fieldActive && batteryRef.current > 0) {
// // //       ps.fieldAngle += resonatorControls.spinUpRate * delta;
// // //       batteryRef.current = Math.max(batteryRef.current - DRAIN_RATE * delta, 0);
// // //     } else {
// // //       batteryRef.current = Math.min(batteryRef.current + RECHARGE_RATE * delta, 100);
// // //     }
// // //     const magneticFieldDir = new THREE.Vector3(Math.cos(ps.fieldAngle), Math.sin(ps.fieldAngle), 0).normalize();
// // //     const desiredAngularVel = fieldActive ? magneticFieldDir.clone().multiplyScalar(resonatorControls.baseFieldSpeed) : new THREE.Vector3(0, 0, 0);
// // //     const error = desiredAngularVel.clone().sub(ps.angularVelocity);
// // //     const { faceData } = getDodecahedronData(finalShellParams.outerRadius);
// // //     const effectiveDragFactor = computeEffectiveDrag(groupRef.current.quaternion, magneticFieldDir, faceData);
// // //     const dragTorque = error.clone().multiplyScalar(effectiveDragFactor * resonatorControls.k_drag * resonatorControls.fieldIntensity);
// // //     const currentSpeed = ps.angularVelocity.length();
// // //     let feedbackTorque = new THREE.Vector3(0, 0, 0);
// // //     if (currentSpeed > resonatorControls.velocityThreshold) {
// // //       const overage = currentSpeed - resonatorControls.velocityThreshold;
// // //       feedbackTorque = ps.angularVelocity.clone().normalize().multiplyScalar(-resonatorControls.thresholdFeedbackFactor * overage);
// // //     }
// // //     let netTorque = dragTorque.add(feedbackTorque);
// // //     // --- Nodule Antifield Torque ---
// // //     let noduleTorque = new THREE.Vector3(0, 0, 0);
// // //     const nodulePositions = getDodecahedronData(finalShellParams.outerRadius).vertices;
// // //     nodulePositions.forEach(nodulePos => {
// // //       const worldPos = nodulePos.clone().applyQuaternion(groupRef.current.quaternion);
// // //       const contribution = worldPos.clone().cross(magneticFieldDir).multiplyScalar(resonatorControls.noduleAntifieldStrength);
// // //       noduleTorque.add(contribution);
// // //     });
// // //     netTorque.add(noduleTorque);
// // //     ps.currentTorque.copy(netTorque);
// // //     const angularAccel = netTorque.clone().divideScalar(effectiveInertia);
// // //     ps.angularVelocity.add(angularAccel.multiplyScalar(delta));
// // //     ps.angularVelocity.multiplyScalar(1 - resonatorControls.damping * delta);
// // //     const deltaAngle = ps.angularVelocity.length() * delta;
// // //     if (deltaAngle > 0) {
// // //       const rotationAxis = ps.angularVelocity.clone().normalize();
// // //       const deltaQuat = new THREE.Quaternion().setFromAxisAngle(rotationAxis, deltaAngle);
// // //       groupRef.current.quaternion.multiply(deltaQuat);
// // //     }
// // //     // Optional emissive update.
// // //     if (dodecahedronMeshRef.current) {
// // //       const currentMaterial = dodecahedronMeshRef.current.material;
// // //       if (currentMaterial instanceof THREE.MeshStandardMaterial || currentMaterial instanceof THREE.MeshPhysicalMaterial) {
// // //         if (currentMaterial.emissive) {
// // //           const maxTorqueEst = resonatorControls.k_drag * resonatorControls.fieldIntensity * (resonatorControls.baseFieldSpeed * 1.5 + 1);
// // //           const emissionStrength = Math.min(netTorque.length() / (maxTorqueEst + 0.01), 1.0);
// // //           currentMaterial.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5);
// // //         }
// // //       }
// // //     }
// // //     // Update particle positions.
// // //     if (
// // //       vizControls.showParticles &&
// // //       particleGeoRef.current?.attributes.position &&
// // //       particlesRef.current &&
// // //       particleData?.data
// // //     ) {
// // //       const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// // //       const speed = resonatorControls.baseFieldSpeed * resonatorControls.fieldIntensity;
// // //       const pData = particleData.data;
// // //       if (pData && pData.length * 3 === positions.length) {
// // //         const pointsMat = particlesRef.current.material as THREE.PointsMaterial;
// // //         if (pointsMat) pointsMat.size = vizControls.particleSize * (1 + resonatorControls.fieldIntensity * 0.5);
// // //         for (let i = 0; i < pData.length; i++) {
// // //           const data = pData[i];
// // //           data.u += speed * delta;
// // //           const R = vizControls.torusMajorRadius;
// // //           const r = data.r;
// // //           const u = data.u;
// // //           const v = data.v;
// // //           const bufferIndex = i * 3;
// // //           positions[bufferIndex] = (R + r * Math.cos(v)) * Math.cos(u);
// // //           positions[bufferIndex + 1] = r * Math.sin(v);
// // //           positions[bufferIndex + 2] = (R + r * Math.cos(v)) * Math.sin(u);
// // //         }
// // //         particleGeoRef.current.attributes.position.needsUpdate = true;
// // //       } else {
// // //         console.warn("Mismatch in particle data/buffer length.");
// // //       }
// // //     }
// // //     // Report status (battery and angular velocity magnitude) via callback.
// // //     onStatusUpdate({
// // //       battery: batteryRef.current,
// // //       angularVelocity: ps.angularVelocity.length()
// // //     });
// // //   });

// // //   return (
// // //     <group ref={groupRef}>
// // //       <RomanDodecahedron
// // //         ref={dodecahedronMeshRef}
// // //         outerRadius={finalShellParams.outerRadius}
// // //         thickness={finalShellParams.thickness}
// // //         holeBaseDiameter={finalShellParams.holeBaseDiameter}
// // //         holeRatio={finalShellParams.holeRatio}
// // //         noduleRadius={finalShellParams.noduleRadius}
// // //         wireframe={vizControls.wireframe}
// // //         castShadow
// // //         receiveShadow
// // //         position={[0, 0, 0]}
// // //         rotation={[0, 0, 0]}
// // //       />
// // //       <pointLight intensity={0.5} color={0xffddcc} distance={3} decay={1.5} position={[0, 0, 0]} name="InternalLight" />
// // //       {vizControls.showParticles && (
// // //         <points ref={particlesRef} name="FieldParticles">
// // //           <bufferGeometry ref={particleGeoRef} />
// // //           <pointsMaterial
// // //             name="ParticleMaterial"
// // //             color={0x00ffff}
// // //             size={vizControls.particleSize}
// // //             transparent
// // //             opacity={0.7}
// // //             blending={THREE.AdditiveBlending}
// // //             sizeAttenuation={false}
// // //             map={null}
// // //           />
// // //         </points>
// // //       )}
// // //     </group>
// // //   );
// // // };

// // // const TemporalResonatorScene: React.FC = () => {
// // //   // Lift status state outside Canvas.
// // //   const [status, setStatus] = useState({ battery: 100, angularVelocity: 0 });
// // //   return (
// // //     <>
// // //       <Leva collapsed={false} titleBar={{ title: "Controls" }} />
// // //       <Canvas
// // //         style={{
// // //           position: "absolute",
// // //           top: 0,
// // //           left: 0,
// // //           width: "100vw",
// // //           height: "100vh",
// // //           background: "#111122",
// // //           zIndex: 0
// // //         }}
// // //         camera={{ position: [3, 3, 5], fov: 75 }}
// // //         gl={{ antialias: true }}
// // //         shadows
// // //       >
// // //         <ambientLight intensity={0.4} />
// // //         <hemisphereLight groundColor={0x404040} intensity={0.8} />
// // //         <directionalLight
// // //           position={[5, 10, 7.5]}
// // //           intensity={1.2}
// // //           castShadow
// // //           shadow-mapSize-width={1024}
// // //           shadow-mapSize-height={1024}
// // //           shadow-camera-far={25}
// // //           shadow-camera-left={-10}
// // //           shadow-camera-right={10}
// // //           shadow-camera-top={10}
// // //           shadow-camera-bottom={-10}
// // //         />
// // //         <ErrorBoundary>
// // //           <Suspense fallback={<LoadingPlaceholder />}>
// // //             <ResonatorSimulation onStatusUpdate={setStatus} />
// // //           </Suspense>
// // //         </ErrorBoundary>
// // //         <Controls />
// // //       </Canvas>
// // //       {/* StatusOverlay is rendered outside the Canvas as standard HTML */}
// // //       <StatusOverlay status={status} />
// // //     </>
// // //   );
// // // };

// // // // --- Status Overlay Component ---
// // // const StatusOverlay: React.FC<{ status: { battery: number; angularVelocity: number } }> = ({ status }) => {
// // //   const batteryPercent = status.battery;
// // //   // Map angular velocity to percentage (assuming max ~10 for display)
// // //   const angularPercent = Math.min((status.angularVelocity / 10) * 100, 100);
// // //   const overlayStyle: React.CSSProperties = {
// // //     position: 'absolute',
// // //     top: 20,
// // //     left: 20,
// // //     color: '#fff',
// // //     fontFamily: 'sans-serif',
// // //     zIndex: 10
// // //   };
// // //   const barContainer: React.CSSProperties = {
// // //     width: '200px',
// // //     height: '20px',
// // //     background: '#555',
// // //     borderRadius: '10px',
// // //     overflow: 'hidden',
// // //     marginBottom: '10px'
// // //   };
// // //   return (
// // //     <div style={overlayStyle}>
// // //       <div>
// // //         <div>Battery: {batteryPercent.toFixed(0)}%</div>
// // //         <div style={barContainer}>
// // //           <div style={{ width: `${batteryPercent}%`, height: '100%', background: 'limegreen' }}></div>
// // //         </div>
// // //       </div>
// // //       <div>
// // //         <div>Angular Velocity: {status.angularVelocity.toFixed(2)}</div>
// // //         <div style={barContainer}>
// // //           <div style={{ width: `${angularPercent}%`, height: '100%', background: 'orange' }}></div>
// // //         </div>
// // //       </div>
// // //     </div>
// // //   );
// // // };

// // // // --- Loading Placeholder Component ---
// // // const LoadingPlaceholder: React.FC = () => {
// // //   return (
// // //     <mesh>
// // //       <boxGeometry args={[0.1, 0.1, 0.1]} />
// // //       <meshBasicMaterial color="orange" wireframe attach="material" />
// // //     </mesh>
// // //   );
// // // };

// // // export default TemporalResonatorScene;



// // // // // === Full Code: TemporalResonatorScene_VectorizedWithNodules.tsx ===

// // // // import React, { useRef, useEffect, useMemo, Suspense, useState } from 'react';
// // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // import * as THREE from 'three';
// // // // import ErrorBoundary from './errorBoundary'; // Adjust path if needed
// // // // import { useControls, Leva } from 'leva';
// // // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// // // // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // // // // --- BVH / CSG Setup ---
// // // // try {
// // // //   (THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
// // // //   (THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
// // // //   (THREE.Mesh.prototype as any).raycast = acceleratedRaycast;
// // // // } catch (error) {
// // // //   console.error("Error setting up BVH extensions:", error);
// // // // }

// // // // const csgEvaluator = new Evaluator();
// // // // csgEvaluator.useGroups = true;
// // // // extend({ OrbitControls });

// // // // // --- Constants ---
// // // // const PHI = (1 + Math.sqrt(5)) / 2;
// // // // const INV_PHI = 1 / PHI;

// // // // // --- Face Drag Coefficients ---
// // // // // Twelve coefficients corresponding to the 12 faces (holes) of the dodecahedron.
// // // // const FACE_DRAG_COEFFICIENTS = [
// // // //   0.8, 1.0, 0.9, 1.1, 0.6, 1.2,
// // // //   1.05, 0.75, 0.95, 1.3, 0.7, 1.15
// // // // ];

// // // // // Helper: Given an object’s quaternion and the dodecahedron’s face normals (in object space),
// // // // // compute an effective drag multiplier by weighting each face’s coefficient by its alignment
// // // // // with the magnetic field direction.
// // // // function computeEffectiveDrag(
// // // //   quat: THREE.Quaternion,
// // // //   magneticFieldDir: THREE.Vector3,
// // // //   faceData: { normal: THREE.Vector3 }[]
// // // // ) {
// // // //   let dragSum = 0, weightSum = 0;
// // // //   faceData.forEach((face, index) => {
// // // //     const worldNormal = face.normal.clone().applyQuaternion(quat);
// // // //     const alignment = Math.max(0, worldNormal.dot(magneticFieldDir));
// // // //     dragSum += FACE_DRAG_COEFFICIENTS[index] * alignment;
// // // //     weightSum += alignment;
// // // //   });
// // // //   return weightSum > 0 ? dragSum / weightSum : 1.0;
// // // // }

// // // // // --- Helper: Get Dodecahedron Math Data ---
// // // // function getDodecahedronData(radius: number): {
// // // //   vertices: THREE.Vector3[];
// // // //   faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[];
// // // // } {
// // // //   console.log(`--- Calculating Dodecahedron Data for radius: ${radius} ---`);
// // // //   if (typeof radius !== 'number' || radius <= 0 || !Number.isFinite(radius)) {
// // // //     console.error("Invalid radius passed to getDodecahedronData:", radius);
// // // //     throw new Error("Invalid radius provided to getDodecahedronData");
// // // //   }
// // // //   const uniqueVerticesMap = new Map<string, THREE.Vector3>();
// // // //   const coords = [
// // // //     [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1],
// // // //     [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
// // // //     [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI],
// // // //     [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI],
// // // //     [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0]
// // // //   ];
// // // //   const distOriginToVertex = Math.sqrt(PHI * PHI + INV_PHI * INV_PHI);
// // // //   const scale = radius / distOriginToVertex;
// // // //   if (!Number.isFinite(scale) || scale === 0) throw new Error("Invalid scale factor");
// // // //   coords.forEach(v => {
// // // //     const x = v[0] * scale, y = v[1] * scale, z = v[2] * scale;
// // // //     const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
// // // //     if (!uniqueVerticesMap.has(key)) uniqueVerticesMap.set(key, new THREE.Vector3(x, y, z));
// // // //   });
// // // //   const vertices = Array.from(uniqueVerticesMap.values());
// // // //   const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
// // // //   const icoVerts = [
// // // //     [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
// // // //     [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
// // // //     [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
// // // //   ];
// // // //   const faceCenterDist = radius * 1.53 / distOriginToVertex;
// // // //   icoVerts.forEach(v => {
// // // //     const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize();
// // // //     const center = normal.clone().multiplyScalar(faceCenterDist);
// // // //     faceData.push({ center, normal });
// // // //   });
// // // //   if (vertices.length !== 20 || faceData.length !== 12) {
// // // //     console.error("Vertex/Face generation failed.", vertices, faceData);
// // // //     throw new Error(`Incorrect data count: ${vertices.length} vertices, ${faceData.length} faces`);
// // // //   }
// // // //   console.log(`Generated ${vertices.length} vertices, ${faceData.length} faces.`);
// // // //   return { vertices, faceData };
// // // // }

// // // // // --- Controls Component ---
// // // // const Controls: React.FC = () => {
// // // //   const { camera, gl } = useThree();
// // // //   const controlsRef = useRef<OrbitControls>(null);
// // // //   useEffect(() => {
// // // //     const controls = new OrbitControls(camera, gl.domElement);
// // // //     controls.enableDamping = true;
// // // //     controls.target.set(0, 0, 0);
// // // //     (controlsRef as React.MutableRefObject<OrbitControls>).current = controls;
// // // //     return () => controls.dispose();
// // // //   }, [camera, gl]);
// // // //   useFrame(() => controlsRef.current?.update());
// // // //   return null;
// // // // };

// // // // // --- Roman Dodecahedron CSG Component ---
// // // // interface RomanDodecahedronProps {
// // // //   outerRadius: number;
// // // //   thickness: number;
// // // //   holeBaseDiameter: number;
// // // //   holeRatio: number;
// // // //   noduleRadius: number;
// // // //   material?: THREE.Material;
// // // //   wireframe?: boolean;
// // // //   [key: string]: any;
// // // // }

// // // // const RomanDodecahedron = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
// // // //   ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, wireframe = false, ...props }, ref) => {
// // // //     const [calculatedGeometry, setCalculatedGeometry] = useState<THREE.BufferGeometry | null>(null);
// // // //     useEffect(() => {
// // // //       console.log(`CSG Props: outerRadius=${outerRadius}, thickness=${thickness}, holeBaseDiameter=${holeBaseDiameter}, holeRatio=${holeRatio}, noduleRadius=${noduleRadius}`);
// // // //       if (
// // // //         typeof outerRadius !== 'number' || outerRadius <= 0 || !Number.isFinite(outerRadius) ||
// // // //         typeof thickness !== 'number' || thickness <= 0 || !Number.isFinite(thickness) ||
// // // //         typeof holeBaseDiameter !== 'number' || holeBaseDiameter <= 0 || !Number.isFinite(holeBaseDiameter) ||
// // // //         typeof holeRatio !== 'number' || holeRatio <= 0 || !Number.isFinite(holeRatio) ||
// // // //         typeof noduleRadius !== 'number' || noduleRadius <= 0 || !Number.isFinite(noduleRadius)
// // // //       ) {
// // // //         console.log("--> Skipping CSG: invalid props.");
// // // //         setCalculatedGeometry(null);
// // // //         return;
// // // //       }
// // // //       const detailLevel = 1;
// // // //       console.log(`Calculating CSG Geometry (Detail=${detailLevel}) for radius: ${outerRadius}`);
// // // //       let geometry: THREE.BufferGeometry | null = null;
// // // //       const tempGeoList: THREE.BufferGeometry[] = [];
// // // //       try {
// // // //         const { vertices: mathVertices, faceData: mathFaceData } = getDodecahedronData(outerRadius);
// // // //         const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, detailLevel);
// // // //         outerDodecGeo.computeBoundsTree();
// // // //         tempGeoList.push(outerDodecGeo);
// // // //         const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, detailLevel);
// // // //         innerDodecGeo.computeBoundsTree();
// // // //         tempGeoList.push(innerDodecGeo);
// // // //         let outerBrush = new Brush(outerDodecGeo);
// // // //         let innerBrush = new Brush(innerDodecGeo);
// // // //         innerBrush.updateMatrixWorld();
// // // //         let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
// // // //         const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * holeRatio ** i);
// // // //         console.log("Hole Diameters:", holeDiameters.map(d => d.toFixed(4)));
// // // //         const cylinderHeight = thickness * 3.1;
// // // //         const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16);
// // // //         cylinderGeo.rotateX(Math.PI / 2);
// // // //         cylinderGeo.computeBoundsTree();
// // // //         tempGeoList.push(cylinderGeo);
// // // //         const tempQuat = new THREE.Quaternion();
// // // //         let holesSubtracted = 0;
// // // //         mathFaceData.forEach((face, index) => {
// // // //           const holeRadius = holeDiameters[index] / 2;
// // // //           console.log(`Face ${index}: Radius=${holeRadius?.toFixed(4)}, Center=(${face.center.x.toFixed(2)},${face.center.y.toFixed(2)},${face.center.z.toFixed(2)}), Normal=(${face.normal.x.toFixed(2)},${face.normal.y.toFixed(2)},${face.normal.z.toFixed(2)})`);
// // // //           if (!holeRadius || holeRadius <= 0 || !Number.isFinite(holeRadius)) {
// // // //             console.warn(`--> Skipping Face ${index}`);
// // // //             return;
// // // //           }
// // // //           const holeBrush = new Brush(cylinderGeo);
// // // //           holeBrush.scale.set(holeRadius, holeRadius, 1);
// // // //           tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal);
// // // //           holeBrush.quaternion.copy(tempQuat);
// // // //           holeBrush.position.copy(face.center);
// // // //           holeBrush.updateMatrixWorld();
// // // //           try {
// // // //             shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION);
// // // //             holesSubtracted++;
// // // //             console.log(`--> Subtracted hole ${index}`);
// // // //           } catch (evalError) {
// // // //             console.error(`--> CSG subtraction FAILED for face ${index}:`, evalError);
// // // //           }
// // // //         });
// // // //         console.log(`Total holes subtracted: ${holesSubtracted}`);
// // // //         const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6);
// // // //         noduleGeo.computeBoundsTree();
// // // //         tempGeoList.push(noduleGeo);
// // // //         mathVertices.forEach(vertexPos => {
// // // //           const noduleBrush = new Brush(noduleGeo);
// // // //           noduleBrush.position.copy(vertexPos);
// // // //           noduleBrush.updateMatrixWorld();
// // // //           shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
// // // //         });
// // // //         geometry = shellBrush.geometry;
// // // //         geometry.computeVertexNormals();
// // // //         geometry.center();
// // // //         console.log("CSG Calculation Complete.");
// // // //       } catch (error) {
// // // //         console.error("CSG Error:", error);
// // // //         geometry = null;
// // // //       } finally {
// // // //         tempGeoList.forEach(g => g.dispose());
// // // //         console.log(`Disposed ${tempGeoList.length} temporary geometries.`);
// // // //       }
// // // //       setCalculatedGeometry(geometry);
// // // //       return () => {
// // // //         if (geometry && typeof geometry.dispose === 'function') {
// // // //           geometry.dispose();
// // // //           console.log("Disposed final CSG geometry on cleanup.");
// // // //         }
// // // //       };
// // // //     }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]);

// // // //     const meshMaterial = useMemo(() => {
// // // //       let baseMaterial: THREE.Material;
// // // //       if (material instanceof THREE.Material) {
// // // //         baseMaterial = material.clone();
// // // //         baseMaterial.side = THREE.DoubleSide;
// // // //       } else {
// // // //         baseMaterial = new THREE.MeshPhongMaterial({
// // // //           color: 0xb87333,
// // // //           side: THREE.DoubleSide,
// // // //           specular: 0x444444,
// // // //           shininess: 40,
// // // //           name: "DefaultPhongCopper"
// // // //         });
// // // //       }
// // // //       if ("wireframe" in baseMaterial) {
// // // //         (baseMaterial as any).wireframe = wireframe;
// // // //       }
// // // //       baseMaterial.side = THREE.DoubleSide;
// // // //       return baseMaterial;
// // // //     }, [material, wireframe]);

// // // //     useEffect(() => {
// // // //       return () => {
// // // //         meshMaterial?.dispose();
// // // //       };
// // // //     }, [meshMaterial]);

// // // //     if (!calculatedGeometry) return null;
// // // //     return <mesh ref={ref} geometry={calculatedGeometry} material={meshMaterial} {...props} />;
// // // //   }
// // // // );

// // // // // --- Physics State Interface ---
// // // // // Now we store a full vector angular velocity and a fieldAngle to drive the magnetic field.
// // // // interface PhysicsState {
// // // //   angularVelocity: THREE.Vector3;
// // // //   fieldAngle: number;
// // // //   currentTorque: THREE.Vector3;
// // // // }

// // // // // --- Main Simulation Component ---
// // // // const ResonatorSimulation: React.FC = () => {
// // // //   const groupRef = useRef<THREE.Group>(null!);
// // // //   const dodecahedronMeshRef = useRef<THREE.Mesh>(null!);
// // // //   const particlesRef = useRef<THREE.Points>(null!);
// // // //   const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // //   // Controls – note the new parameter noduleAntifieldStrength is added.
// // // //   const resonatorControls = useControls("Resonator Controls", {
// // // //     baseFieldSpeed: { value: 1.0, min: 0, max: 5, step: 0.1 },
// // // //     fieldIntensity: { value: 1.0, min: 0.0, max: 5, step: 0.1 },
// // // //     k_drag: { label: "Induction Strength", value: 0.5, min: 0, max: 2, step: 0.05 },
// // // //     inertiaScale: { label: "Inertia Scale", value: 1.0, min: 0.1, max: 5, step: 0.1 },
// // // //     damping: { value: 0.1, min: 0, max: 1, step: 0.01 },
// // // //     spinUpRate: { value: 0.5, min: 0, max: 2, step: 0.1 },
// // // //     velocityThreshold: { value: 1.5, min: 0, max: 10, step: 0.1 },
// // // //     thresholdFeedbackFactor: { value: 1.0, min: 0, max: 5, step: 0.1 },
// // // //     // New parameter for the nodules’ antifield effect:
// // // //     noduleAntifieldStrength: { value: 0.2, min: 0, max: 2, step: 0.05 }
// // // //   });

// // // //   const shellControls = useControls("Shell Geometry", {
// // // //     outerRadius: 1.0,
// // // //     thickness: 0.05,
// // // //     holeBaseDiameter: 0.1,
// // // //     holeRatio: 1.2,
// // // //     noduleRadius: 0.1
// // // //   });

// // // //   const vizControls = useControls("Visualization", {
// // // //     particleCount: { value: 1000, min: 100, max: 5000, step: 100 },
// // // //     particleSize: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
// // // //     torusMajorRadius: { value: 1.5, min: 0.5, max: 5, step: 0.1 },
// // // //     torusMinorRadius: { value: 0.5, min: 0.1, max: 2, step: 0.05 },
// // // //     showParticles: true,
// // // //     wireframe: false
// // // //   });

// // // //   const defaultShellParams = useMemo(() => ({
// // // //     outerRadius: 1.0,
// // // //     thickness: 0.05,
// // // //     holeBaseDiameter: 0.1,
// // // //     holeRatio: 1.2,
// // // //     noduleRadius: 0.1
// // // //   }), []);
// // // //   const finalShellParams = useMemo(() => ({
// // // //     outerRadius: (typeof shellControls.outerRadius === 'number' && Number.isFinite(shellControls.outerRadius))
// // // //       ? shellControls.outerRadius : defaultShellParams.outerRadius,
// // // //     thickness: (typeof shellControls.thickness === 'number' && Number.isFinite(shellControls.thickness))
// // // //       ? shellControls.thickness : defaultShellParams.thickness,
// // // //     holeBaseDiameter: (typeof shellControls.holeBaseDiameter === 'number' && Number.isFinite(shellControls.holeBaseDiameter))
// // // //       ? shellControls.holeBaseDiameter : defaultShellParams.holeBaseDiameter,
// // // //     holeRatio: (typeof shellControls.holeRatio === 'number' && Number.isFinite(shellControls.holeRatio))
// // // //       ? shellControls.holeRatio : defaultShellParams.holeRatio,
// // // //     noduleRadius: (typeof shellControls.noduleRadius === 'number' && Number.isFinite(shellControls.noduleRadius))
// // // //       ? shellControls.noduleRadius : defaultShellParams.noduleRadius
// // // //   }), [shellControls, defaultShellParams]);

// // // //   const effectiveInertia = useMemo(() => {
// // // //     return resonatorControls.inertiaScale *
// // // //       ((finalShellParams.outerRadius ** 5 - (finalShellParams.outerRadius - finalShellParams.thickness) ** 5) /
// // // //        finalShellParams.outerRadius ** 5);
// // // //   }, [resonatorControls.inertiaScale, finalShellParams.outerRadius, finalShellParams.thickness]);

// // // //   // New physics state: full vector angular velocity and field angle.
// // // //   const physicsState = useRef<PhysicsState>({
// // // //     angularVelocity: new THREE.Vector3(0, 0, 0),
// // // //     fieldAngle: 0,
// // // //     currentTorque: new THREE.Vector3(0, 0, 0)
// // // //   });

// // // //   // Particle Data (as before)
// // // //   const particleData = useMemo(() => {
// // // //     console.log(`Creating particle data for count: ${vizControls.particleCount}`);
// // // //     try {
// // // //       const data = [];
// // // //       const positions = new Float32Array(vizControls.particleCount * 3);
// // // //       for (let i = 0; i < vizControls.particleCount; i++) {
// // // //         const u = Math.random() * Math.PI * 2;
// // // //         const v = Math.random() * Math.PI * 2;
// // // //         const R = vizControls.torusMajorRadius;
// // // //         const r = vizControls.torusMinorRadius;
// // // //         const randR = R + (Math.random() - 0.5) * 0.2 * r;
// // // //         const randr = r * Math.sqrt(Math.random());
// // // //         positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u);
// // // //         positions[i * 3 + 1] = randr * Math.sin(v);
// // // //         positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);
// // // //         data.push({ u, v, R, r: randr });
// // // //       }
// // // //       return { positions, data };
// // // //     } catch (error) {
// // // //       console.error("Error creating particle data:", error);
// // // //       return { positions: new Float32Array(0), data: [] };
// // // //     }
// // // //   }, [vizControls.particleCount, vizControls.torusMajorRadius, vizControls.torusMinorRadius]);

// // // //   useEffect(() => {
// // // //     if (particleGeoRef.current && particleData?.positions) {
// // // //       const existingAttribute = particleGeoRef.current.getAttribute("position") as THREE.BufferAttribute | undefined;
// // // //       if (!existingAttribute || existingAttribute.array.length !== particleData.positions.length) {
// // // //         particleGeoRef.current.setAttribute("position", new THREE.BufferAttribute(particleData.positions, 3, false));
// // // //         console.log(`Particle position attribute CREATED/REPLACED (Count: ${particleData.positions.length / 3}).`);
// // // //       }
// // // //       if (particleGeoRef.current.getAttribute("color")) {
// // // //         particleGeoRef.current.deleteAttribute("color");
// // // //         console.log("Removed old particle color attribute.");
// // // //       }
// // // //     } else {
// // // //       if (particleGeoRef.current?.getAttribute("position")) {
// // // //         particleGeoRef.current.deleteAttribute("position");
// // // //         console.log("Particle position attribute removed.");
// // // //       }
// // // //     }
// // // //   }, [particleData]);

// // // //   // --- 3D Vector Physics Update with Nodule Antifield ---
// // // //   useFrame((state, delta) => {
// // // //     const ps = physicsState.current;

// // // //     // 1) Update the magnetic field's angle (spin-up)
// // // //     ps.fieldAngle += resonatorControls.spinUpRate * delta;
// // // //     const magneticFieldDir = new THREE.Vector3(Math.cos(ps.fieldAngle), Math.sin(ps.fieldAngle), 0).normalize();
// // // //     const desiredAngularVel = magneticFieldDir.clone().multiplyScalar(resonatorControls.baseFieldSpeed);

// // // //     // 2) Compute error between desired and current angular velocity
// // // //     const error = desiredAngularVel.clone().sub(ps.angularVelocity);

// // // //     // 3) Get effective drag factor based on current shell orientation
// // // //     const { faceData } = getDodecahedronData(finalShellParams.outerRadius);
// // // //     const effectiveDragFactor = computeEffectiveDrag(groupRef.current.quaternion, magneticFieldDir, faceData);
// // // //     const dragTorque = error.clone().multiplyScalar(effectiveDragFactor * resonatorControls.k_drag * resonatorControls.fieldIntensity);

// // // //     // 4) Threshold feedback torque (if angular speed exceeds threshold)
// // // //     const currentSpeed = ps.angularVelocity.length();
// // // //     let feedbackTorque = new THREE.Vector3(0, 0, 0);
// // // //     if (currentSpeed > resonatorControls.velocityThreshold) {
// // // //       const overage = currentSpeed - resonatorControls.velocityThreshold;
// // // //       feedbackTorque = ps.angularVelocity.clone().normalize().multiplyScalar(-resonatorControls.thresholdFeedbackFactor * overage);
// // // //     }

// // // //     // 5) Sum net torque from drag and threshold feedback
// // // //     const netTorque = dragTorque.add(feedbackTorque);

// // // //     // 6) --- NEW: Nodule Antifield Torque ---  
// // // //     // Get the nodule positions (using vertices from dodecahedron data) and add their influence.
// // // //     let noduleTorque = new THREE.Vector3(0, 0, 0);
// // // //     const nodulePositions = getDodecahedronData(finalShellParams.outerRadius).vertices;
// // // //     nodulePositions.forEach(nodulePos => {
// // // //       const worldPos = nodulePos.clone().applyQuaternion(groupRef.current.quaternion);
// // // //       // Compute torque contribution: cross product of worldPos and magnetic field direction
// // // //       const contribution = worldPos.clone().cross(magneticFieldDir).multiplyScalar(resonatorControls.noduleAntifieldStrength);
// // // //       noduleTorque.add(contribution);
// // // //     });
// // // //     netTorque.add(noduleTorque);
// // // //     ps.currentTorque.copy(netTorque);

// // // //     // 7) Compute angular acceleration (netTorque divided by inertia)
// // // //     const angularAccel = netTorque.clone().divideScalar(effectiveInertia);
// // // //     ps.angularVelocity.add(angularAccel.multiplyScalar(delta));

// // // //     // 8) Apply damping
// // // //     ps.angularVelocity.multiplyScalar(1 - resonatorControls.damping * delta);

// // // //     // 9) Integrate angular velocity to update shell orientation using quaternions
// // // //     const deltaAngle = ps.angularVelocity.length() * delta;
// // // //     if (deltaAngle > 0) {
// // // //       const rotationAxis = ps.angularVelocity.clone().normalize();
// // // //       const deltaQuat = new THREE.Quaternion().setFromAxisAngle(rotationAxis, deltaAngle);
// // // //       groupRef.current.quaternion.multiply(deltaQuat);
// // // //     }

// // // //     // --- Optional: Update emissive intensity ---
// // // //     if (dodecahedronMeshRef.current) {
// // // //       const currentMaterial = dodecahedronMeshRef.current.material;
// // // //       if (currentMaterial instanceof THREE.MeshStandardMaterial || currentMaterial instanceof THREE.MeshPhysicalMaterial) {
// // // //         if (currentMaterial.emissive) {
// // // //           const maxTorqueEst = resonatorControls.k_drag * resonatorControls.fieldIntensity * (resonatorControls.baseFieldSpeed * 1.5 + 1);
// // // //           const emissionStrength = Math.min(netTorque.length() / (maxTorqueEst + 0.01), 1.0);
// // // //           currentMaterial.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5);
// // // //         }
// // // //       }
// // // //     }

// // // //     // --- Update Particle Swirl (as before) ---
// // // //     if (
// // // //       vizControls.showParticles &&
// // // //       particleGeoRef.current?.attributes.position &&
// // // //       particlesRef.current &&
// // // //       particleData?.data
// // // //     ) {
// // // //       const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// // // //       const speed = resonatorControls.baseFieldSpeed * resonatorControls.fieldIntensity;
// // // //       const pData = particleData.data;
// // // //       if (pData && pData.length * 3 === positions.length) {
// // // //         const pointsMat = particlesRef.current.material as THREE.PointsMaterial;
// // // //         if (pointsMat) pointsMat.size = vizControls.particleSize * (1 + resonatorControls.fieldIntensity * 0.5);
// // // //         for (let i = 0; i < pData.length; i++) {
// // // //           const data = pData[i];
// // // //           data.u += speed * delta;
// // // //           const R = vizControls.torusMajorRadius;
// // // //           const r = data.r;
// // // //           const u = data.u;
// // // //           const v = data.v;
// // // //           const bufferIndex = i * 3;
// // // //           positions[bufferIndex] = (R + r * Math.cos(v)) * Math.cos(u);
// // // //           positions[bufferIndex + 1] = r * Math.sin(v);
// // // //           positions[bufferIndex + 2] = (R + r * Math.cos(v)) * Math.sin(u);
// // // //         }
// // // //         particleGeoRef.current.attributes.position.needsUpdate = true;
// // // //       } else {
// // // //         console.warn("Mismatch in particle data/buffer length.");
// // // //       }
// // // //     }
// // // //   });

// // // //   return (
// // // //     <group ref={groupRef}>
// // // //       <RomanDodecahedron
// // // //         ref={dodecahedronMeshRef}
// // // //         outerRadius={finalShellParams.outerRadius}
// // // //         thickness={finalShellParams.thickness}
// // // //         holeBaseDiameter={finalShellParams.holeBaseDiameter}
// // // //         holeRatio={finalShellParams.holeRatio}
// // // //         noduleRadius={finalShellParams.noduleRadius}
// // // //         wireframe={vizControls.wireframe}
// // // //         castShadow
// // // //         receiveShadow
// // // //         position={[0, 0, 0]}
// // // //         rotation={[0, 0, 0]}
// // // //       />
// // // //       <pointLight intensity={0.5} color={0xffddcc} distance={3} decay={1.5} position={[0, 0, 0]} name="InternalLight" />
// // // //       {vizControls.showParticles && (
// // // //         <points ref={particlesRef} name="FieldParticles">
// // // //           <bufferGeometry ref={particleGeoRef} />
// // // //           <pointsMaterial
// // // //             name="ParticleMaterial"
// // // //             color={0x00ffff}
// // // //             size={vizControls.particleSize}
// // // //             transparent
// // // //             opacity={0.7}
// // // //             blending={THREE.AdditiveBlending}
// // // //             sizeAttenuation={false}
// // // //             map={null}
// // // //           />
// // // //         </points>
// // // //       )}
// // // //     </group>
// // // //   );
// // // // };

// // // // const TemporalResonatorScene: React.FC = () => {
// // // //   return (
// // // //     <>
// // // //       <Leva collapsed={false} titleBar={{ title: "Controls" }} />
// // // //       <Canvas
// // // //         style={{
// // // //           position: "absolute",
// // // //           top: 0,
// // // //           left: 0,
// // // //           width: "100vw",
// // // //           height: "100vh",
// // // //           background: "#111122",
// // // //           zIndex: 0
// // // //         }}
// // // //         camera={{ position: [3, 3, 5], fov: 75 }}
// // // //         gl={{ antialias: true }}
// // // //         shadows
// // // //       >
// // // //         <ambientLight intensity={0.4} />
// // // //         <hemisphereLight groundColor={0x404040} intensity={0.8} />
// // // //         <directionalLight
// // // //           position={[5, 10, 7.5]}
// // // //           intensity={1.2}
// // // //           castShadow
// // // //           shadow-mapSize-width={1024}
// // // //           shadow-mapSize-height={1024}
// // // //           shadow-camera-far={25}
// // // //           shadow-camera-left={-10}
// // // //           shadow-camera-right={10}
// // // //           shadow-camera-top={10}
// // // //           shadow-camera-bottom={-10}
// // // //         />
// // // //         <ErrorBoundary>
// // // //           <Suspense fallback={<LoadingPlaceholder />}>
// // // //             <ResonatorSimulation />
// // // //           </Suspense>
// // // //         </ErrorBoundary>
// // // //         <Controls />
// // // //       </Canvas>
// // // //     </>
// // // //   );
// // // // };

// // // // // Loading Placeholder Component
// // // // const LoadingPlaceholder: React.FC = () => {
// // // //   return (
// // // //     <mesh>
// // // //       <boxGeometry args={[0.1, 0.1, 0.1]} />
// // // //       <meshBasicMaterial color="orange" wireframe attach="material" />
// // // //     </mesh>
// // // //   );
// // // // };

// // // // export default TemporalResonatorScene;


// // // // // // === Full Code: TemporalResonatorScene_Vectorized.tsx ===

// // // // // import React, { useRef, useEffect, useMemo, Suspense, useState } from 'react';
// // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // import * as THREE from 'three';
// // // // // import ErrorBoundary from './errorBoundary'; // Adjust path if needed
// // // // // import { useControls, Leva } from 'leva';
// // // // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// // // // // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // // // // // --- BVH / CSG Setup ---
// // // // // try {
// // // // //   (THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
// // // // //   (THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
// // // // //   (THREE.Mesh.prototype as any).raycast = acceleratedRaycast;
// // // // // } catch (error) {
// // // // //   console.error("Error setting up BVH extensions:", error);
// // // // // }

// // // // // const csgEvaluator = new Evaluator();
// // // // // csgEvaluator.useGroups = true;
// // // // // extend({ OrbitControls });

// // // // // // --- Constants ---
// // // // // const PHI = (1 + Math.sqrt(5)) / 2;
// // // // // const INV_PHI = 1 / PHI;

// // // // // // --- Face Drag Coefficients ---
// // // // // // Twelve coefficients corresponding to the 12 faces (holes) of the dodecahedron.
// // // // // // Adjust these to emphasize the effect of the holes.
// // // // // const FACE_DRAG_COEFFICIENTS = [
// // // // //   0.8, 1.0, 0.9, 1.1, 0.6, 1.2,
// // // // //   1.05, 0.75, 0.95, 1.3, 0.7, 1.15
// // // // // ];

// // // // // // Helper: Given an object’s quaternion and the dodecahedron’s face normals (in object space),
// // // // // // compute an effective drag multiplier. We weight each face’s coefficient by how aligned it is
// // // // // // with the magnetic field direction.
// // // // // function computeEffectiveDrag(
// // // // //   quat: THREE.Quaternion,
// // // // //   magneticFieldDir: THREE.Vector3,
// // // // //   faceData: { normal: THREE.Vector3 }[]
// // // // // ) {
// // // // //   let dragSum = 0, weightSum = 0;
// // // // //   faceData.forEach((face, index) => {
// // // // //     // Transform face normal from object to world space.
// // // // //     const worldNormal = face.normal.clone().applyQuaternion(quat);
// // // // //     // How much is this face “facing” the field?
// // // // //     const alignment = Math.max(0, worldNormal.dot(magneticFieldDir));
// // // // //     dragSum += FACE_DRAG_COEFFICIENTS[index] * alignment;
// // // // //     weightSum += alignment;
// // // // //   });
// // // // //   return weightSum > 0 ? dragSum / weightSum : 1.0;
// // // // // }

// // // // // // --- Helper: Get Dodecahedron Math Data ---
// // // // // function getDodecahedronData(radius: number): {
// // // // //   vertices: THREE.Vector3[];
// // // // //   faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[];
// // // // // } {
// // // // //   console.log(`--- Calculating Dodecahedron Data for radius: ${radius} ---`);
// // // // //   if (typeof radius !== 'number' || radius <= 0 || !Number.isFinite(radius)) {
// // // // //     console.error("Invalid radius passed to getDodecahedronData:", radius);
// // // // //     throw new Error("Invalid radius provided to getDodecahedronData");
// // // // //   }
// // // // //   const uniqueVerticesMap = new Map<string, THREE.Vector3>();
// // // // //   const coords = [
// // // // //     [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1],
// // // // //     [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
// // // // //     [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI],
// // // // //     [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI],
// // // // //     [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0]
// // // // //   ];
// // // // //   const distOriginToVertex = Math.sqrt(PHI * PHI + INV_PHI * INV_PHI);
// // // // //   const scale = radius / distOriginToVertex;
// // // // //   if (!Number.isFinite(scale) || scale === 0) throw new Error("Invalid scale factor");
// // // // //   coords.forEach(v => {
// // // // //     const x = v[0] * scale, y = v[1] * scale, z = v[2] * scale;
// // // // //     const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
// // // // //     if (!uniqueVerticesMap.has(key)) uniqueVerticesMap.set(key, new THREE.Vector3(x, y, z));
// // // // //   });
// // // // //   const vertices = Array.from(uniqueVerticesMap.values());
// // // // //   const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
// // // // //   const icoVerts = [
// // // // //     [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
// // // // //     [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
// // // // //     [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
// // // // //   ];
// // // // //   const faceCenterDist = radius * 1.53 / distOriginToVertex;
// // // // //   icoVerts.forEach(v => {
// // // // //     const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize();
// // // // //     const center = normal.clone().multiplyScalar(faceCenterDist);
// // // // //     faceData.push({ center, normal });
// // // // //   });
// // // // //   if (vertices.length !== 20 || faceData.length !== 12) {
// // // // //     console.error("Vertex/Face generation failed.", vertices, faceData);
// // // // //     throw new Error(`Incorrect data count: ${vertices.length} vertices, ${faceData.length} faces`);
// // // // //   }
// // // // //   console.log(`Generated ${vertices.length} vertices, ${faceData.length} faces.`);
// // // // //   return { vertices, faceData };
// // // // // }

// // // // // // --- Controls Component ---
// // // // // const Controls: React.FC = () => {
// // // // //   const { camera, gl } = useThree();
// // // // //   const controlsRef = useRef<OrbitControls>(null);
// // // // //   useEffect(() => {
// // // // //     const controls = new OrbitControls(camera, gl.domElement);
// // // // //     controls.enableDamping = true;
// // // // //     controls.target.set(0, 0, 0);
// // // // //     (controlsRef as React.MutableRefObject<OrbitControls>).current = controls;
// // // // //     return () => controls.dispose();
// // // // //   }, [camera, gl]);
// // // // //   useFrame(() => controlsRef.current?.update());
// // // // //   return null;
// // // // // };

// // // // // // --- Roman Dodecahedron CSG Component ---
// // // // // interface RomanDodecahedronProps {
// // // // //   outerRadius: number;
// // // // //   thickness: number;
// // // // //   holeBaseDiameter: number;
// // // // //   holeRatio: number;
// // // // //   noduleRadius: number;
// // // // //   material?: THREE.Material;
// // // // //   wireframe?: boolean;
// // // // //   [key: string]: any;
// // // // // }

// // // // // const RomanDodecahedron = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
// // // // //   ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, wireframe = false, ...props }, ref) => {
// // // // //     const [calculatedGeometry, setCalculatedGeometry] = useState<THREE.BufferGeometry | null>(null);
// // // // //     useEffect(() => {
// // // // //       console.log(`CSG Props: outerRadius=${outerRadius}, thickness=${thickness}, holeBaseDiameter=${holeBaseDiameter}, holeRatio=${holeRatio}, noduleRadius=${noduleRadius}`);
// // // // //       if (
// // // // //         typeof outerRadius !== 'number' || outerRadius <= 0 || !Number.isFinite(outerRadius) ||
// // // // //         typeof thickness !== 'number' || thickness <= 0 || !Number.isFinite(thickness) ||
// // // // //         typeof holeBaseDiameter !== 'number' || holeBaseDiameter <= 0 || !Number.isFinite(holeBaseDiameter) ||
// // // // //         typeof holeRatio !== 'number' || holeRatio <= 0 || !Number.isFinite(holeRatio) ||
// // // // //         typeof noduleRadius !== 'number' || noduleRadius <= 0 || !Number.isFinite(noduleRadius)
// // // // //       ) {
// // // // //         console.log("--> Skipping CSG: invalid props.");
// // // // //         setCalculatedGeometry(null);
// // // // //         return;
// // // // //       }
// // // // //       const detailLevel = 1;
// // // // //       console.log(`Calculating CSG Geometry (Detail=${detailLevel}) for radius: ${outerRadius}`);
// // // // //       let geometry: THREE.BufferGeometry | null = null;
// // // // //       const tempGeoList: THREE.BufferGeometry[] = [];
// // // // //       try {
// // // // //         const { vertices: mathVertices, faceData: mathFaceData } = getDodecahedronData(outerRadius);
// // // // //         const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, detailLevel);
// // // // //         outerDodecGeo.computeBoundsTree();
// // // // //         tempGeoList.push(outerDodecGeo);
// // // // //         const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, detailLevel);
// // // // //         innerDodecGeo.computeBoundsTree();
// // // // //         tempGeoList.push(innerDodecGeo);
// // // // //         let outerBrush = new Brush(outerDodecGeo);
// // // // //         let innerBrush = new Brush(innerDodecGeo);
// // // // //         innerBrush.updateMatrixWorld();
// // // // //         let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
// // // // //         const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * holeRatio ** i);
// // // // //         console.log("Hole Diameters:", holeDiameters.map(d => d.toFixed(4)));
// // // // //         const cylinderHeight = thickness * 3.1;
// // // // //         const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16);
// // // // //         cylinderGeo.rotateX(Math.PI / 2);
// // // // //         cylinderGeo.computeBoundsTree();
// // // // //         tempGeoList.push(cylinderGeo);
// // // // //         const tempQuat = new THREE.Quaternion();
// // // // //         let holesSubtracted = 0;
// // // // //         mathFaceData.forEach((face, index) => {
// // // // //           const holeRadius = holeDiameters[index] / 2;
// // // // //           console.log(`Face ${index}: Radius=${holeRadius?.toFixed(4)}, Center=(${face.center.x.toFixed(2)},${face.center.y.toFixed(2)},${face.center.z.toFixed(2)}), Normal=(${face.normal.x.toFixed(2)},${face.normal.y.toFixed(2)},${face.normal.z.toFixed(2)})`);
// // // // //           if (!holeRadius || holeRadius <= 0 || !Number.isFinite(holeRadius)) {
// // // // //             console.warn(`--> Skipping Face ${index}`);
// // // // //             return;
// // // // //           }
// // // // //           const holeBrush = new Brush(cylinderGeo);
// // // // //           holeBrush.scale.set(holeRadius, holeRadius, 1);
// // // // //           tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal);
// // // // //           holeBrush.quaternion.copy(tempQuat);
// // // // //           holeBrush.position.copy(face.center);
// // // // //           holeBrush.updateMatrixWorld();
// // // // //           try {
// // // // //             shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION);
// // // // //             holesSubtracted++;
// // // // //             console.log(`--> Subtracted hole ${index}`);
// // // // //           } catch (evalError) {
// // // // //             console.error(`--> CSG subtraction FAILED for face ${index}:`, evalError);
// // // // //           }
// // // // //         });
// // // // //         console.log(`Total holes subtracted: ${holesSubtracted}`);
// // // // //         const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6);
// // // // //         noduleGeo.computeBoundsTree();
// // // // //         tempGeoList.push(noduleGeo);
// // // // //         mathVertices.forEach(vertexPos => {
// // // // //           const noduleBrush = new Brush(noduleGeo);
// // // // //           noduleBrush.position.copy(vertexPos);
// // // // //           noduleBrush.updateMatrixWorld();
// // // // //           shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
// // // // //         });
// // // // //         geometry = shellBrush.geometry;
// // // // //         geometry.computeVertexNormals();
// // // // //         geometry.center();
// // // // //         console.log("CSG Calculation Complete.");
// // // // //       } catch (error) {
// // // // //         console.error("CSG Error:", error);
// // // // //         geometry = null;
// // // // //       } finally {
// // // // //         tempGeoList.forEach(g => g.dispose());
// // // // //         console.log(`Disposed ${tempGeoList.length} temporary geometries.`);
// // // // //       }
// // // // //       setCalculatedGeometry(geometry);
// // // // //       return () => {
// // // // //         if (geometry && typeof geometry.dispose === 'function') {
// // // // //           geometry.dispose();
// // // // //           console.log("Disposed final CSG geometry on cleanup.");
// // // // //         }
// // // // //       };
// // // // //     }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]);

// // // // //     const meshMaterial = useMemo(() => {
// // // // //       let baseMaterial: THREE.Material;
// // // // //       if (material instanceof THREE.Material) {
// // // // //         baseMaterial = material.clone();
// // // // //         baseMaterial.side = THREE.DoubleSide;
// // // // //       } else {
// // // // //         baseMaterial = new THREE.MeshPhongMaterial({
// // // // //           color: 0xb87333,
// // // // //           side: THREE.DoubleSide,
// // // // //           specular: 0x444444,
// // // // //           shininess: 40,
// // // // //           name: "DefaultPhongCopper"
// // // // //         });
// // // // //       }
// // // // //       if ("wireframe" in baseMaterial) {
// // // // //         (baseMaterial as any).wireframe = wireframe;
// // // // //       }
// // // // //       baseMaterial.side = THREE.DoubleSide;
// // // // //       return baseMaterial;
// // // // //     }, [material, wireframe]);

// // // // //     useEffect(() => {
// // // // //       return () => {
// // // // //         meshMaterial?.dispose();
// // // // //       };
// // // // //     }, [meshMaterial]);

// // // // //     if (!calculatedGeometry) return null;
// // // // //     return <mesh ref={ref} geometry={calculatedGeometry} material={meshMaterial} {...props} />;
// // // // //   }
// // // // // );

// // // // // // --- Physics State Interface ---
// // // // // // We now store a full angular velocity vector and a fieldAngle to drive the magnetic field.
// // // // // interface PhysicsState {
// // // // //   angularVelocity: THREE.Vector3;
// // // // //   fieldAngle: number;
// // // // //   currentTorque: THREE.Vector3;
// // // // // }

// // // // // // --- Main Simulation Component ---
// // // // // const ResonatorSimulation: React.FC = () => {
// // // // //   const groupRef = useRef<THREE.Group>(null!);
// // // // //   const dodecahedronMeshRef = useRef<THREE.Mesh>(null!);
// // // // //   const particlesRef = useRef<THREE.Points>(null!);
// // // // //   const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // //   // Controls (note additional controls for spin-up and threshold feedback)
// // // // //   const resonatorControls = useControls("Resonator Controls", {
// // // // //     baseFieldSpeed: { value: 1.0, min: 0, max: 5, step: 0.1 },
// // // // //     fieldIntensity: { value: 1.0, min: 0.0, max: 5, step: 0.1 },
// // // // //     k_drag: { label: "Induction Strength", value: 0.5, min: 0, max: 2, step: 0.05 },
// // // // //     inertiaScale: { label: "Inertia Scale", value: 1.0, min: 0.1, max: 5, step: 0.1 },
// // // // //     damping: { value: 0.1, min: 0, max: 1, step: 0.01 },
// // // // //     // These parameters affect how strongly the field forces the shell to align.
// // // // //     spinUpRate: { value: 0.5, min: 0, max: 2, step: 0.1 },
// // // // //     velocityThreshold: { value: 1.5, min: 0, max: 10, step: 0.1 },
// // // // //     thresholdFeedbackFactor: { value: 1.0, min: 0, max: 5, step: 0.1 }
// // // // //   });

// // // // //   const shellControls = useControls("Shell Geometry", {
// // // // //     outerRadius: 1.0,
// // // // //     thickness: 0.05,
// // // // //     holeBaseDiameter: 0.1,
// // // // //     holeRatio: 1.2,
// // // // //     noduleRadius: 0.1
// // // // //   });

// // // // //   const vizControls = useControls("Visualization", {
// // // // //     particleCount: { value: 1000, min: 100, max: 5000, step: 100 },
// // // // //     particleSize: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
// // // // //     torusMajorRadius: { value: 1.5, min: 0.5, max: 5, step: 0.1 },
// // // // //     torusMinorRadius: { value: 0.5, min: 0.1, max: 2, step: 0.05 },
// // // // //     showParticles: true,
// // // // //     wireframe: false
// // // // //   });

// // // // //   // Validate shell parameters
// // // // //   const defaultShellParams = useMemo(() => ({
// // // // //     outerRadius: 1.0,
// // // // //     thickness: 0.05,
// // // // //     holeBaseDiameter: 0.1,
// // // // //     holeRatio: 1.2,
// // // // //     noduleRadius: 0.1
// // // // //   }), []);
// // // // //   const finalShellParams = useMemo(() => ({
// // // // //     outerRadius: (typeof shellControls.outerRadius === 'number' && Number.isFinite(shellControls.outerRadius))
// // // // //       ? shellControls.outerRadius : defaultShellParams.outerRadius,
// // // // //     thickness: (typeof shellControls.thickness === 'number' && Number.isFinite(shellControls.thickness))
// // // // //       ? shellControls.thickness : defaultShellParams.thickness,
// // // // //     holeBaseDiameter: (typeof shellControls.holeBaseDiameter === 'number' && Number.isFinite(shellControls.holeBaseDiameter))
// // // // //       ? shellControls.holeBaseDiameter : defaultShellParams.holeBaseDiameter,
// // // // //     holeRatio: (typeof shellControls.holeRatio === 'number' && Number.isFinite(shellControls.holeRatio))
// // // // //       ? shellControls.holeRatio : defaultShellParams.holeRatio,
// // // // //     noduleRadius: (typeof shellControls.noduleRadius === 'number' && Number.isFinite(shellControls.noduleRadius))
// // // // //       ? shellControls.noduleRadius : defaultShellParams.noduleRadius
// // // // //   }), [shellControls, defaultShellParams]);

// // // // //   const effectiveInertia = useMemo(() => {
// // // // //     return resonatorControls.inertiaScale *
// // // // //       ((finalShellParams.outerRadius ** 5 - (finalShellParams.outerRadius - finalShellParams.thickness) ** 5) /
// // // // //        finalShellParams.outerRadius ** 5);
// // // // //   }, [resonatorControls.inertiaScale, finalShellParams.outerRadius, finalShellParams.thickness]);

// // // // //   // --- New Physics State: full vector angular velocity and field angle ---
// // // // //   const physicsState = useRef<PhysicsState>({
// // // // //     angularVelocity: new THREE.Vector3(0, 0, 0),
// // // // //     fieldAngle: 0,
// // // // //     currentTorque: new THREE.Vector3(0, 0, 0)
// // // // //   });

// // // // //   // Particle Data (remains as before)
// // // // //   const particleData = useMemo(() => {
// // // // //     console.log(`Creating particle data for count: ${vizControls.particleCount}`);
// // // // //     try {
// // // // //       const data = [];
// // // // //       const positions = new Float32Array(vizControls.particleCount * 3);
// // // // //       for (let i = 0; i < vizControls.particleCount; i++) {
// // // // //         const u = Math.random() * Math.PI * 2;
// // // // //         const v = Math.random() * Math.PI * 2;
// // // // //         const R = vizControls.torusMajorRadius;
// // // // //         const r = vizControls.torusMinorRadius;
// // // // //         const randR = R + (Math.random() - 0.5) * 0.2 * r;
// // // // //         const randr = r * Math.sqrt(Math.random());
// // // // //         positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u);
// // // // //         positions[i * 3 + 1] = randr * Math.sin(v);
// // // // //         positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);
// // // // //         data.push({ u, v, R, r: randr });
// // // // //       }
// // // // //       return { positions, data };
// // // // //     } catch (error) {
// // // // //       console.error("Error creating particle data:", error);
// // // // //       return { positions: new Float32Array(0), data: [] };
// // // // //     }
// // // // //   }, [vizControls.particleCount, vizControls.torusMajorRadius, vizControls.torusMinorRadius]);

// // // // //   useEffect(() => {
// // // // //     if (particleGeoRef.current && particleData?.positions) {
// // // // //       const existingAttribute = particleGeoRef.current.getAttribute("position") as THREE.BufferAttribute | undefined;
// // // // //       if (!existingAttribute || existingAttribute.array.length !== particleData.positions.length) {
// // // // //         particleGeoRef.current.setAttribute("position", new THREE.BufferAttribute(particleData.positions, 3, false));
// // // // //         console.log(`Particle position attribute CREATED/REPLACED (Count: ${particleData.positions.length / 3}).`);
// // // // //       }
// // // // //       if (particleGeoRef.current.getAttribute("color")) {
// // // // //         particleGeoRef.current.deleteAttribute("color");
// // // // //         console.log("Removed old particle color attribute.");
// // // // //       }
// // // // //     } else {
// // // // //       if (particleGeoRef.current?.getAttribute("position")) {
// // // // //         particleGeoRef.current.deleteAttribute("position");
// // // // //         console.log("Particle position attribute removed.");
// // // // //       }
// // // // //     }
// // // // //   }, [particleData]);

// // // // //   // --- New 3D Vector Physics Update ---
// // // // //   useFrame((state, delta) => {
// // // // //     const ps = physicsState.current;

// // // // //     // 1) Update the magnetic field's angle (spin-up)
// // // // //     ps.fieldAngle += resonatorControls.spinUpRate * delta;
// // // // //     // Magnetic field direction in XY plane:
// // // // //     const magneticFieldDir = new THREE.Vector3(Math.cos(ps.fieldAngle), Math.sin(ps.fieldAngle), 0).normalize();
// // // // //     const desiredAngularVel = magneticFieldDir.clone().multiplyScalar(resonatorControls.baseFieldSpeed);

// // // // //     // 2) Compute the error between desired and current angular velocity (vector)
// // // // //     const error = desiredAngularVel.clone().sub(ps.angularVelocity);

// // // // //     // 3) Get effective drag factor based on current shell orientation
// // // // //     // First, get the face data (using our dodecahedron math data)
// // // // //     const { faceData } = getDodecahedronData(finalShellParams.outerRadius);
// // // // //     const effectiveDragFactor = computeEffectiveDrag(groupRef.current.quaternion, magneticFieldDir, faceData);
// // // // //     // Torque from inductive drag:
// // // // //     const dragTorque = error.multiplyScalar(effectiveDragFactor * resonatorControls.k_drag * resonatorControls.fieldIntensity);

// // // // //     // 4) Threshold feedback: if the angular speed exceeds threshold, subtract a torque in the opposite direction.
// // // // //     const currentSpeed = ps.angularVelocity.length();
// // // // //     let feedbackTorque = new THREE.Vector3(0, 0, 0);
// // // // //     if (currentSpeed > resonatorControls.velocityThreshold) {
// // // // //       const overage = currentSpeed - resonatorControls.velocityThreshold;
// // // // //       feedbackTorque = ps.angularVelocity.clone().normalize().multiplyScalar(-resonatorControls.thresholdFeedbackFactor * overage);
// // // // //     }

// // // // //     // 5) Sum torques to get net torque (vector)
// // // // //     const netTorque = dragTorque.add(feedbackTorque);
// // // // //     ps.currentTorque.copy(netTorque);

// // // // //     // 6) Compute angular acceleration (vector) = netTorque / inertia
// // // // //     const angularAccel = netTorque.clone().divideScalar(effectiveInertia);
// // // // //     // 7) Update angular velocity vector
// // // // //     ps.angularVelocity.add(angularAccel.multiplyScalar(delta));
// // // // //     // 8) Apply damping
// // // // //     ps.angularVelocity.multiplyScalar(1 - resonatorControls.damping * delta);

// // // // //     // 9) Integrate the angular velocity to update the shell's orientation (using quaternions)
// // // // //     const deltaAngle = ps.angularVelocity.length() * delta;
// // // // //     if (deltaAngle > 0) {
// // // // //       const rotationAxis = ps.angularVelocity.clone().normalize();
// // // // //       const deltaQuat = new THREE.Quaternion().setFromAxisAngle(rotationAxis, deltaAngle);
// // // // //       groupRef.current.quaternion.multiply(deltaQuat);
// // // // //     }

// // // // //     // --- Optional: Update emissive intensity on the shell's material ---
// // // // //     if (dodecahedronMeshRef.current) {
// // // // //       const currentMaterial = dodecahedronMeshRef.current.material;
// // // // //       if (currentMaterial instanceof THREE.MeshStandardMaterial || currentMaterial instanceof THREE.MeshPhysicalMaterial) {
// // // // //         if (currentMaterial.emissive) {
// // // // //           const maxTorqueEst = resonatorControls.k_drag * resonatorControls.fieldIntensity * (resonatorControls.baseFieldSpeed * 1.5 + 1);
// // // // //           const emissionStrength = Math.min(netTorque.length() / (maxTorqueEst + 0.01), 1.0);
// // // // //           currentMaterial.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5);
// // // // //         }
// // // // //       }
// // // // //     }

// // // // //     // --- Update Particle Swirl (as before) ---
// // // // //     if (
// // // // //       vizControls.showParticles &&
// // // // //       particleGeoRef.current?.attributes.position &&
// // // // //       particlesRef.current &&
// // // // //       particleData?.data
// // // // //     ) {
// // // // //       const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// // // // //       // Use the desired field speed for particle swirl
// // // // //       const speed = resonatorControls.baseFieldSpeed * resonatorControls.fieldIntensity;
// // // // //       const pData = particleData.data;
// // // // //       if (pData && pData.length * 3 === positions.length) {
// // // // //         const pointsMat = particlesRef.current.material as THREE.PointsMaterial;
// // // // //         if (pointsMat) pointsMat.size = vizControls.particleSize * (1 + resonatorControls.fieldIntensity * 0.5);
// // // // //         for (let i = 0; i < pData.length; i++) {
// // // // //           const data = pData[i];
// // // // //           data.u += speed * delta;
// // // // //           const R = vizControls.torusMajorRadius;
// // // // //           const r = data.r;
// // // // //           const u = data.u;
// // // // //           const v = data.v;
// // // // //           const bufferIndex = i * 3;
// // // // //           positions[bufferIndex] = (R + r * Math.cos(v)) * Math.cos(u);
// // // // //           positions[bufferIndex + 1] = r * Math.sin(v);
// // // // //           positions[bufferIndex + 2] = (R + r * Math.cos(v)) * Math.sin(u);
// // // // //         }
// // // // //         particleGeoRef.current.attributes.position.needsUpdate = true;
// // // // //       } else {
// // // // //         console.warn("Mismatch in particle data/buffer length.");
// // // // //       }
// // // // //     }
// // // // //   });

// // // // //   return (
// // // // //     <group ref={groupRef}>
// // // // //       <RomanDodecahedron
// // // // //         ref={dodecahedronMeshRef}
// // // // //         outerRadius={finalShellParams.outerRadius}
// // // // //         thickness={finalShellParams.thickness}
// // // // //         holeBaseDiameter={finalShellParams.holeBaseDiameter}
// // // // //         holeRatio={finalShellParams.holeRatio}
// // // // //         noduleRadius={finalShellParams.noduleRadius}
// // // // //         wireframe={vizControls.wireframe}
// // // // //         castShadow
// // // // //         receiveShadow
// // // // //         position={[0, 0, 0]}
// // // // //         rotation={[0, 0, 0]}
// // // // //       />
// // // // //       <pointLight intensity={0.5} color={0xffddcc} distance={3} decay={1.5} position={[0, 0, 0]} name="InternalLight" />
// // // // //       {vizControls.showParticles && (
// // // // //         <points ref={particlesRef} name="FieldParticles">
// // // // //           <bufferGeometry ref={particleGeoRef} />
// // // // //           <pointsMaterial
// // // // //             name="ParticleMaterial"
// // // // //             color={0x00ffff}
// // // // //             size={vizControls.particleSize}
// // // // //             transparent
// // // // //             opacity={0.7}
// // // // //             blending={THREE.AdditiveBlending}
// // // // //             sizeAttenuation={false}
// // // // //             map={null}
// // // // //           />
// // // // //         </points>
// // // // //       )}
// // // // //     </group>
// // // // //   );
// // // // // };

// // // // // const TemporalResonatorScene: React.FC = () => {
// // // // //   return (
// // // // //     <>
// // // // //       <Leva collapsed={false} titleBar={{ title: "Controls" }} />
// // // // //       <Canvas
// // // // //         style={{
// // // // //           position: "absolute",
// // // // //           top: 0,
// // // // //           left: 0,
// // // // //           width: "100vw",
// // // // //           height: "100vh",
// // // // //           background: "#111122",
// // // // //           zIndex: 0
// // // // //         }}
// // // // //         camera={{ position: [3, 3, 5], fov: 75 }}
// // // // //         gl={{ antialias: true }}
// // // // //         shadows
// // // // //       >
// // // // //         <ambientLight intensity={0.4} />
// // // // //         <hemisphereLight groundColor={0x404040} intensity={0.8} />
// // // // //         <directionalLight
// // // // //           position={[5, 10, 7.5]}
// // // // //           intensity={1.2}
// // // // //           castShadow
// // // // //           shadow-mapSize-width={1024}
// // // // //           shadow-mapSize-height={1024}
// // // // //           shadow-camera-far={25}
// // // // //           shadow-camera-left={-10}
// // // // //           shadow-camera-right={10}
// // // // //           shadow-camera-top={10}
// // // // //           shadow-camera-bottom={-10}
// // // // //         />
// // // // //         <ErrorBoundary>
// // // // //           <Suspense fallback={<LoadingPlaceholder />}>
// // // // //             <ResonatorSimulation />
// // // // //           </Suspense>
// // // // //         </ErrorBoundary>
// // // // //         <Controls />
// // // // //       </Canvas>
// // // // //     </>
// // // // //   );
// // // // // };

// // // // // // Loading Placeholder Component
// // // // // const LoadingPlaceholder: React.FC = () => {
// // // // //   return (
// // // // //     <mesh>
// // // // //       <boxGeometry args={[0.1, 0.1, 0.1]} />
// // // // //       <meshBasicMaterial color="orange" wireframe attach="material" />
// // // // //     </mesh>
// // // // //   );
// // // // // };

// // // // // export default TemporalResonatorScene;


// // // // // // // === Full Code: TemporalResonatorScene_Upgraded.tsx ===

// // // // // // import React, { useRef, useEffect, useMemo, Suspense, useState } from 'react';
// // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // import * as THREE from 'three';
// // // // // // import ErrorBoundary from './errorBoundary'; // Adjust path if needed
// // // // // // import { useControls, Leva } from 'leva'; // Keep leva
// // // // // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// // // // // // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // // // // // // --- BVH / CSG Setup ---
// // // // // // try {
// // // // // //     (THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
// // // // // //     (THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
// // // // // //     (THREE.Mesh.prototype as any).raycast = acceleratedRaycast;
// // // // // // } catch (error) {
// // // // // //     console.error("Error setting up BVH extensions:", error);
// // // // // // }

// // // // // // const csgEvaluator = new Evaluator();
// // // // // // csgEvaluator.useGroups = true; // Use groups for efficiency with multiple operations
// // // // // // extend({ OrbitControls });

// // // // // // // --- Constants ---
// // // // // // const PHI = (1 + Math.sqrt(5)) / 2;
// // // // // // const INV_PHI = 1 / PHI;

// // // // // // // *** NEW/UPDATED ***
// // // // // // // For face-based weighting, we define 12 drag coefficients (one per face).
// // // // // // // You can adjust these values to reflect how big each face's hole is, etc.
// // // // // // const FACE_DRAG_COEFFICIENTS = [
// // // // // //   0.8, 1.0, 0.9, 1.1, 0.6, 1.2,
// // // // // //   1.05, 0.75, 0.95, 1.3, 0.7, 1.15
// // // // // // ];

// // // // // // // Simple helper to map rotation angle -> face index -> drag coefficient
// // // // // // function getDragCoefficientFromAngle(angle: number) {
// // // // // //   // Normalize angle to [0..2π]
// // // // // //   const normalizedAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
// // // // // //   // 12 faces around 360°, each face ~ 30°
// // // // // //   const faceIndex = Math.floor((normalizedAngle / (2 * Math.PI)) * 12);
// // // // // //   // Return the face-based drag
// // // // // //   return FACE_DRAG_COEFFICIENTS[faceIndex] ?? 1.0;
// // // // // // }

// // // // // // // --- Helper: Get Dodecahedron Math Data ---
// // // // // // function getDodecahedronData(radius: number): {
// // // // // //   vertices: THREE.Vector3[];
// // // // // //   faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[];
// // // // // // } {
// // // // // //   console.log(`--- Calculating Dodecahedron Data for radius: ${radius} ---`);
// // // // // //   if (typeof radius !== 'number' || radius <= 0 || !Number.isFinite(radius)) {
// // // // // //     console.error("!!! Invalid radius passed to getDodecahedronData:", radius);
// // // // // //     throw new Error("Invalid radius provided to getDodecahedronData");
// // // // // //   }

// // // // // //   // Use a Map to ensure vertex uniqueness
// // // // // //   const uniqueVerticesMap = new Map<string, THREE.Vector3>();
// // // // // //   const coords = [
// // // // // //     [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1],
// // // // // //     [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
// // // // // //     [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI],
// // // // // //     [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI],
// // // // // //     [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0]
// // // // // //   ];

// // // // // //   // Scale factor
// // // // // //   const distOriginToVertex = Math.sqrt(PHI * PHI + INV_PHI * INV_PHI);
// // // // // //   const scale = radius / distOriginToVertex;
// // // // // //   if (!Number.isFinite(scale) || scale === 0) {
// // // // // //     throw new Error("Invalid scale factor");
// // // // // //   }

// // // // // //   // Build unique vertices
// // // // // //   coords.forEach(v => {
// // // // // //     const x = v[0] * scale;
// // // // // //     const y = v[1] * scale;
// // // // // //     const z = v[2] * scale;
// // // // // //     const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
// // // // // //     if (!uniqueVerticesMap.has(key)) {
// // // // // //       uniqueVerticesMap.set(key, new THREE.Vector3(x, y, z));
// // // // // //     }
// // // // // //   });
// // // // // //   const vertices = Array.from(uniqueVerticesMap.values());

// // // // // //   // Face data from dual icosahedron
// // // // // //   const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
// // // // // //   const icoVerts = [
// // // // // //     [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
// // // // // //     [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
// // // // // //     [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
// // // // // //   ];
// // // // // //   const faceCenterDist = radius * 1.53 / distOriginToVertex;
// // // // // //   icoVerts.forEach(v => {
// // // // // //     const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize();
// // // // // //     const center = normal.clone().multiplyScalar(faceCenterDist);
// // // // // //     faceData.push({ center, normal });
// // // // // //   });

// // // // // //   if (vertices.length !== 20 || faceData.length !== 12) {
// // // // // //     console.error("!!! Vertex/Face generation failed. Vertices:", vertices, "Faces:", faceData);
// // // // // //     throw new Error(`Incorrect math data count: ${vertices.length} vertices, ${faceData.length} faces`);
// // // // // //   }
// // // // // //   console.log(`--- Generated ${vertices.length} vertices, ${faceData.length} faces. ---`);
// // // // // //   return { vertices, faceData };
// // // // // // }

// // // // // // // --- Controls Component ---
// // // // // // const Controls: React.FC = () => {
// // // // // //   const { camera, gl } = useThree();
// // // // // //   const controlsRef = useRef<OrbitControls>(null);
// // // // // //   useEffect(() => {
// // // // // //     const controls = new OrbitControls(camera, gl.domElement);
// // // // // //     controls.enableDamping = true;
// // // // // //     controls.target.set(0, 0, 0);
// // // // // //     (controlsRef as React.MutableRefObject<OrbitControls>).current = controls;
// // // // // //     return () => {
// // // // // //       controls.dispose();
// // // // // //     };
// // // // // //   }, [camera, gl]);

// // // // // //   useFrame(() => {
// // // // // //     controlsRef.current?.update();
// // // // // //   });
// // // // // //   return null;
// // // // // // };

// // // // // // // --- Roman Dodecahedron CSG Component ---
// // // // // // interface RomanDodecahedronProps {
// // // // // //   outerRadius: number;
// // // // // //   thickness: number;
// // // // // //   holeBaseDiameter: number;
// // // // // //   holeRatio: number;
// // // // // //   noduleRadius: number;
// // // // // //   material?: THREE.Material;
// // // // // //   wireframe?: boolean;
// // // // // //   [key: string]: any;
// // // // // // }

// // // // // // const RomanDodecahedron = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
// // // // // //   (
// // // // // //     {
// // // // // //       outerRadius,
// // // // // //       thickness,
// // // // // //       holeBaseDiameter,
// // // // // //       holeRatio,
// // // // // //       noduleRadius,
// // // // // //       material,
// // // // // //       wireframe = false,
// // // // // //       ...props
// // // // // //     },
// // // // // //     ref
// // // // // //   ) => {
// // // // // //     const [calculatedGeometry, setCalculatedGeometry] = useState<THREE.BufferGeometry | null>(null);

// // // // // //     // CSG calculation
// // // // // //     useEffect(() => {
// // // // // //       console.log(
// // // // // //         `useEffect Check: outerRadius=${outerRadius} (${typeof outerRadius}), thickness=${thickness}, holeBaseDiameter=${holeBaseDiameter}, holeRatio=${holeRatio}, noduleRadius=${noduleRadius}`
// // // // // //       );
// // // // // //       if (
// // // // // //         typeof outerRadius !== 'number' ||
// // // // // //         outerRadius <= 0 ||
// // // // // //         !Number.isFinite(outerRadius) ||
// // // // // //         typeof thickness !== 'number' ||
// // // // // //         thickness <= 0 ||
// // // // // //         !Number.isFinite(thickness) ||
// // // // // //         typeof holeBaseDiameter !== 'number' ||
// // // // // //         holeBaseDiameter <= 0 ||
// // // // // //         !Number.isFinite(holeBaseDiameter) ||
// // // // // //         typeof holeRatio !== 'number' ||
// // // // // //         holeRatio <= 0 ||
// // // // // //         !Number.isFinite(holeRatio) ||
// // // // // //         typeof noduleRadius !== 'number' ||
// // // // // //         noduleRadius <= 0 ||
// // // // // //         !Number.isFinite(noduleRadius)
// // // // // //       ) {
// // // // // //         console.log(`--> Skipping CSG calculation in useEffect: Invalid props detected.`);
// // // // // //         setCalculatedGeometry(null);
// // // // // //         return;
// // // // // //       }

// // // // // //       const detailLevel = 1;
// // // // // //       console.log(`Calculating CSG Geometry (Detail=${detailLevel}) for radius: ${outerRadius}`);
// // // // // //       let geometry: THREE.BufferGeometry | null = null;
// // // // // //       const tempGeoList: THREE.BufferGeometry[] = [];

// // // // // //       try {
// // // // // //         // Get positions/normals
// // // // // //         const { vertices: mathVertices, faceData: mathFaceData } = getDodecahedronData(outerRadius);

// // // // // //         // Create base shell
// // // // // //         const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, detailLevel);
// // // // // //         outerDodecGeo.computeBoundsTree();
// // // // // //         tempGeoList.push(outerDodecGeo);

// // // // // //         const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, detailLevel);
// // // // // //         innerDodecGeo.computeBoundsTree();
// // // // // //         tempGeoList.push(innerDodecGeo);

// // // // // //         let outerBrush = new Brush(outerDodecGeo);
// // // // // //         let innerBrush = new Brush(innerDodecGeo);
// // // // // //         innerBrush.updateMatrixWorld();

// // // // // //         let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);

// // // // // //         // Subtract holes
// // // // // //         const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * holeRatio ** i);
// // // // // //         console.log("Calculated Hole Diameters:", holeDiameters.map(d => d.toFixed(4)));
// // // // // //         const cylinderHeight = thickness * 3.1;
// // // // // //         const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16);
// // // // // //         cylinderGeo.rotateX(Math.PI / 2);
// // // // // //         cylinderGeo.computeBoundsTree();
// // // // // //         tempGeoList.push(cylinderGeo);

// // // // // //         const tempQuat = new THREE.Quaternion();
// // // // // //         let holesSubtracted = 0;

// // // // // //         mathFaceData.forEach((face, index) => {
// // // // // //           const holeRadius = holeDiameters[index] / 2;
// // // // // //           console.log(
// // // // // //             `  Processing Face ${index}: Radius=${holeRadius?.toFixed(
// // // // // //               4
// // // // // //             )}, Center=(${face.center.x.toFixed(2)},${face.center.y.toFixed(
// // // // // //               2
// // // // // //             )},${face.center.z.toFixed(2)}), Normal=(${face.normal.x.toFixed(
// // // // // //               2
// // // // // //             )},${face.normal.y.toFixed(2)},${face.normal.z.toFixed(2)})`
// // // // // //           );
// // // // // //           if (!holeRadius || holeRadius <= 0 || !Number.isFinite(holeRadius)) {
// // // // // //             console.warn(`    --> Skipping Face ${index}: Invalid radius.`);
// // // // // //             return;
// // // // // //           }

// // // // // //           const holeBrush = new Brush(cylinderGeo);
// // // // // //           holeBrush.scale.set(holeRadius, holeRadius, 1);
// // // // // //           tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal);
// // // // // //           holeBrush.quaternion.copy(tempQuat);
// // // // // //           holeBrush.position.copy(face.center);
// // // // // //           holeBrush.updateMatrixWorld();

// // // // // //           try {
// // // // // //             shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION);
// // // // // //             holesSubtracted++;
// // // // // //             console.log(`    --> Subtracted hole ${index}.`);
// // // // // //           } catch (evalError) {
// // // // // //             console.error(`    --> CSG subtraction FAILED for face ${index}:`, evalError);
// // // // // //           }
// // // // // //         });
// // // // // //         console.log(`Total holes subtracted successfully: ${holesSubtracted}`);

// // // // // //         // Add nodules
// // // // // //         const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6);
// // // // // //         noduleGeo.computeBoundsTree();
// // // // // //         tempGeoList.push(noduleGeo);

// // // // // //         mathVertices.forEach(vertexPos => {
// // // // // //           const noduleBrush = new Brush(noduleGeo);
// // // // // //           noduleBrush.position.copy(vertexPos);
// // // // // //           noduleBrush.updateMatrixWorld();
// // // // // //           shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
// // // // // //         });

// // // // // //         // Finalize geometry
// // // // // //         geometry = shellBrush.geometry;
// // // // // //         geometry.computeVertexNormals();
// // // // // //         geometry.center();
// // // // // //         console.log("CSG Calculation Complete.");
// // // // // //       } catch (error) {
// // // // // //         console.error("CSG Error in useEffect:", error);
// // // // // //         geometry = null;
// // // // // //       } finally {
// // // // // //         // Cleanup
// // // // // //         tempGeoList.forEach(g => g.dispose());
// // // // // //         console.log(`Disposed ${tempGeoList.length} temporary CSG geometries.`);
// // // // // //       }

// // // // // //       setCalculatedGeometry(geometry);

// // // // // //       return () => {
// // // // // //         if (geometry && typeof geometry.dispose === 'function') {
// // // // // //           geometry.dispose();
// // // // // //           console.log("Disposed final CSG geometry from useEffect cleanup.");
// // // // // //         }
// // // // // //       };
// // // // // //     }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]);

// // // // // //     // Memoize material
// // // // // //     const meshMaterial = useMemo(() => {
// // // // // //       let baseMaterial: THREE.Material;
// // // // // //       if (material instanceof THREE.Material) {
// // // // // //         baseMaterial = material.clone();
// // // // // //         baseMaterial.side = THREE.DoubleSide;
// // // // // //       } else {
// // // // // //         baseMaterial = new THREE.MeshPhongMaterial({
// // // // // //           color: 0xb87333,
// // // // // //           side: THREE.DoubleSide,
// // // // // //           specular: 0x444444,
// // // // // //           shininess: 40,
// // // // // //           name: "DefaultPhongCopper"
// // // // // //         });
// // // // // //       }
// // // // // //       if ("wireframe" in baseMaterial) {
// // // // // //         (baseMaterial as any).wireframe = wireframe;
// // // // // //       }
// // // // // //       baseMaterial.side = THREE.DoubleSide;
// // // // // //       return baseMaterial;
// // // // // //     }, [material, wireframe]);

// // // // // //     // Dispose material on unmount
// // // // // //     useEffect(() => {
// // // // // //       return () => {
// // // // // //         meshMaterial?.dispose();
// // // // // //       };
// // // // // //     }, [meshMaterial]);

// // // // // //     if (!calculatedGeometry) return null;

// // // // // //     return (
// // // // // //       <mesh ref={ref} geometry={calculatedGeometry} material={meshMaterial} {...props} />
// // // // // //     );
// // // // // //   }
// // // // // // );

// // // // // // // --- Physics State ---
// // // // // // interface PhysicsState {
// // // // // //   shell_angular_velocity_scalar: number;
// // // // // //   field_velocity_scalar: number;          // *** NEW/UPDATED *** (the "spin-up" field speed)
// // // // // //   current_torque_scalar: number;
// // // // // // }

// // // // // // // --- Main Simulation Component ---
// // // // // // const ResonatorSimulation: React.FC = () => {
// // // // // //   const groupRef = useRef<THREE.Group>(null!);
// // // // // //   const dodecahedronMeshRef = useRef<THREE.Mesh>(null!);
// // // // // //   const particlesRef = useRef<THREE.Points>(null!);
// // // // // //   const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // // //   // *** NEW/UPDATED ***
// // // // // //   // Added spinUpRate, velocityThreshold, thresholdFeedbackFactor
// // // // // //   const resonatorControls = useControls("Resonator Controls", {
// // // // // //     baseFieldSpeed: { value: 1.0, min: 0, max: 5, step: 0.1 },
// // // // // //     fieldIntensity: { value: 1.0, min: 0.0, max: 5, step: 0.1 },
// // // // // //     k_drag: { label: "Induction Strength", value: 0.5, min: 0, max: 2, step: 0.05 },
// // // // // //     inertiaScale: { label: "Inertia Scale", value: 1.0, min: 0.1, max: 5, step: 0.1 },
// // // // // //     damping: { value: 0.1, min: 0, max: 1, step: 0.01 },
// // // // // //     // We'll keep k_feedback if you still want a direct coupling,
// // // // // //     // but the threshold-based feedback is separate.
// // // // // //     k_feedback: { value: 0.0, min: -2, max: 2, step: 0.05 },

// // // // // //     // *** NEW/UPDATED *** spin-up & threshold feedback
// // // // // //     spinUpRate: { value: 0.5, min: 0, max: 2, step: 0.1 },
// // // // // //     velocityThreshold: { value: 1.5, min: 0, max: 10, step: 0.1 },
// // // // // //     thresholdFeedbackFactor: { value: 1.0, min: 0, max: 5, step: 0.1 }
// // // // // //   });

// // // // // //   const shellControls = useControls("Shell Geometry", {
// // // // // //     outerRadius: 1.0,
// // // // // //     thickness: 0.05,
// // // // // //     holeBaseDiameter: 0.1,
// // // // // //     holeRatio: 1.2,
// // // // // //     noduleRadius: 0.1
// // // // // //   });

// // // // // //   const vizControls = useControls("Visualization", {
// // // // // //     particleCount: { value: 1000, min: 100, max: 5000, step: 100 },
// // // // // //     particleSize: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
// // // // // //     torusMajorRadius: { value: 1.5, min: 0.5, max: 5, step: 0.1 },
// // // // // //     torusMinorRadius: { value: 0.5, min: 0.1, max: 2, step: 0.05 },
// // // // // //     showParticles: true,
// // // // // //     wireframe: false
// // // // // //   });

// // // // // //   // Validate shell params
// // // // // //   const defaultShellParams = useMemo(
// // // // // //     () => ({
// // // // // //       outerRadius: 1.0,
// // // // // //       thickness: 0.05,
// // // // // //       holeBaseDiameter: 0.1,
// // // // // //       holeRatio: 1.2,
// // // // // //       noduleRadius: 0.1
// // // // // //     }),
// // // // // //     []
// // // // // //   );
// // // // // //   const finalShellParams = useMemo(() => {
// // // // // //     return {
// // // // // //       outerRadius:
// // // // // //         typeof shellControls.outerRadius === "number" && Number.isFinite(shellControls.outerRadius)
// // // // // //           ? shellControls.outerRadius
// // // // // //           : defaultShellParams.outerRadius,
// // // // // //       thickness:
// // // // // //         typeof shellControls.thickness === "number" && Number.isFinite(shellControls.thickness)
// // // // // //           ? shellControls.thickness
// // // // // //           : defaultShellParams.thickness,
// // // // // //       holeBaseDiameter:
// // // // // //         typeof shellControls.holeBaseDiameter === "number" && Number.isFinite(shellControls.holeBaseDiameter)
// // // // // //           ? shellControls.holeBaseDiameter
// // // // // //           : defaultShellParams.holeBaseDiameter,
// // // // // //       holeRatio:
// // // // // //         typeof shellControls.holeRatio === "number" && Number.isFinite(shellControls.holeRatio)
// // // // // //           ? shellControls.holeRatio
// // // // // //           : defaultShellParams.holeRatio,
// // // // // //       noduleRadius:
// // // // // //         typeof shellControls.noduleRadius === "number" && Number.isFinite(shellControls.noduleRadius)
// // // // // //           ? shellControls.noduleRadius
// // // // // //           : defaultShellParams.noduleRadius
// // // // // //     };
// // // // // //   }, [shellControls, defaultShellParams]);

// // // // // //   // Effective inertia
// // // // // //   const effectiveInertia = useMemo(() => {
// // // // // //     return (
// // // // // //       resonatorControls.inertiaScale *
// // // // // //       ((finalShellParams.outerRadius ** 5 -
// // // // // //         (finalShellParams.outerRadius - finalShellParams.thickness) ** 5) /
// // // // // //         finalShellParams.outerRadius ** 5)
// // // // // //     );
// // // // // //   }, [resonatorControls.inertiaScale, finalShellParams.outerRadius, finalShellParams.thickness]);

// // // // // //   // *** NEW/UPDATED ***
// // // // // //   // We store the field velocity separately to handle spin-up.
// // // // // //   const physicsState = useRef<PhysicsState>({
// // // // // //     shell_angular_velocity_scalar: 0.0,
// // // // // //     field_velocity_scalar: 0.0, // Start from 0, will ramp up to baseFieldSpeed
// // // // // //     current_torque_scalar: 0.0
// // // // // //   });

// // // // // //   // Particle data
// // // // // //   const particleData = useMemo(() => {
// // // // // //     console.log(`Creating particle data for count: ${vizControls.particleCount}`);
// // // // // //     try {
// // // // // //       const data = [];
// // // // // //       const positions = new Float32Array(vizControls.particleCount * 3);
// // // // // //       for (let i = 0; i < vizControls.particleCount; i++) {
// // // // // //         const u = Math.random() * Math.PI * 2;
// // // // // //         const v = Math.random() * Math.PI * 2;
// // // // // //         const R = vizControls.torusMajorRadius;
// // // // // //         const r = vizControls.torusMinorRadius;
// // // // // //         const randR = R + (Math.random() - 0.5) * 0.2 * r;
// // // // // //         const randr = r * Math.sqrt(Math.random());

// // // // // //         positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u);
// // // // // //         positions[i * 3 + 1] = randr * Math.sin(v);
// // // // // //         positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);

// // // // // //         data.push({ u, v, R, r: randr });
// // // // // //       }
// // // // // //       return { positions, data };
// // // // // //     } catch (error) {
// // // // // //       console.error("Error creating particle data:", error);
// // // // // //       return { positions: new Float32Array(0), data: [] };
// // // // // //     }
// // // // // //   }, [vizControls.particleCount, vizControls.torusMajorRadius, vizControls.torusMinorRadius]);

// // // // // //   // Manage particle buffer attribute
// // // // // //   useEffect(() => {
// // // // // //     if (particleGeoRef.current && particleData?.positions) {
// // // // // //       const existingAttribute = particleGeoRef.current.getAttribute("position") as THREE.BufferAttribute | undefined;
// // // // // //       if (!existingAttribute || existingAttribute.array.length !== particleData.positions.length) {
// // // // // //         particleGeoRef.current.setAttribute("position", new THREE.BufferAttribute(particleData.positions, 3, false));
// // // // // //         console.log(`Particle position attribute CREATED/REPLACED (Count: ${particleData.positions.length / 3}).`);
// // // // // //       }
// // // // // //       if (particleGeoRef.current.getAttribute("color")) {
// // // // // //         particleGeoRef.current.deleteAttribute("color");
// // // // // //         console.log("Removed old particle color attribute.");
// // // // // //       }
// // // // // //     } else {
// // // // // //       if (particleGeoRef.current?.getAttribute("position")) {
// // // // // //         particleGeoRef.current.deleteAttribute("position");
// // // // // //         console.log("Particle position attribute removed.");
// // // // // //       }
// // // // // //     }
// // // // // //   }, [particleData]);

// // // // // //   // *** NEW/UPDATED ***: Spin-up + face-based weighting + threshold feedback
// // // // // //   useFrame((state, delta) => {
// // // // // //     const currentPhysics = physicsState.current;

// // // // // //     // 1) Spin up the field velocity from 0 to baseFieldSpeed
// // // // // //     const baseFieldSpeed = resonatorControls.baseFieldSpeed;
// // // // // //     if (currentPhysics.field_velocity_scalar < baseFieldSpeed) {
// // // // // //       currentPhysics.field_velocity_scalar += resonatorControls.spinUpRate * delta;
// // // // // //       // Clamp so it doesn't exceed baseFieldSpeed
// // // // // //       if (currentPhysics.field_velocity_scalar > baseFieldSpeed) {
// // // // // //         currentPhysics.field_velocity_scalar = baseFieldSpeed;
// // // // // //       }
// // // // // //     }

// // // // // //     // 2) Combine with linear feedback (k_feedback) if desired
// // // // // //     const effectiveFieldVelocity =
// // // // // //       currentPhysics.field_velocity_scalar + resonatorControls.k_feedback * currentPhysics.shell_angular_velocity_scalar;

// // // // // //     // 3) Face-based drag weighting
// // // // // //     // We'll read the current groupRef rotation.y to see which face is "aligned"
// // // // // //     const orientationAngle = groupRef.current?.rotation.y ?? 0;
// // // // // //     const faceDragFactor = getDragCoefficientFromAngle(orientationAngle);
// // // // // //     // Local drag = faceDragFactor * user-chosen k_drag
// // // // // //     const localDrag = faceDragFactor * resonatorControls.k_drag;

// // // // // //     // 4) Compute relative speed & base torque from drag
// // // // // //     const relativeSpeed = effectiveFieldVelocity - currentPhysics.shell_angular_velocity_scalar;
// // // // // //     let dragTorque = localDrag * resonatorControls.fieldIntensity * relativeSpeed;

// // // // // //     // 5) Threshold-based feedback torque
// // // // // //     let feedbackTorque = 0;
// // // // // //     const shellSpeed = Math.abs(currentPhysics.shell_angular_velocity_scalar);
// // // // // //     if (shellSpeed > resonatorControls.velocityThreshold) {
// // // // // //       const overage = shellSpeed - resonatorControls.velocityThreshold;
// // // // // //       // Negative torque that grows the further above threshold we are
// // // // // //       feedbackTorque =
// // // // // //         -Math.sign(currentPhysics.shell_angular_velocity_scalar) *
// // // // // //         resonatorControls.thresholdFeedbackFactor *
// // // // // //         overage;
// // // // // //     }

// // // // // //     // 6) Total torque
// // // // // //     const totalTorque = dragTorque + feedbackTorque;
// // // // // //     currentPhysics.current_torque_scalar = totalTorque;

// // // // // //     // 7) Update shell angular velocity
// // // // // //     const angularAcceleration = effectiveInertia > 0 ? totalTorque / effectiveInertia : 0;
// // // // // //     currentPhysics.shell_angular_velocity_scalar += angularAcceleration * delta;

// // // // // //     // 8) Damping
// // // // // //     currentPhysics.shell_angular_velocity_scalar *= 1 - resonatorControls.damping * delta;

// // // // // //     // 9) Apply rotation
// // // // // //     if (groupRef.current) {
// // // // // //       groupRef.current.rotation.y += currentPhysics.shell_angular_velocity_scalar * delta;
// // // // // //     }

// // // // // //     // Emissive update (optional)
// // // // // //     if (dodecahedronMeshRef.current) {
// // // // // //       const currentMaterial = dodecahedronMeshRef.current.material;
// // // // // //       if (currentMaterial instanceof THREE.MeshStandardMaterial || currentMaterial instanceof THREE.MeshPhysicalMaterial) {
// // // // // //         if (currentMaterial.emissive) {
// // // // // //           // Some heuristic for emission
// // // // // //           const maxTorqueEst =
// // // // // //             resonatorControls.k_drag *
// // // // // //             resonatorControls.fieldIntensity *
// // // // // //             (Math.abs(baseFieldSpeed) * 1.5 + 1);
// // // // // //           const emissionStrength = Math.min(
// // // // // //             Math.abs(currentPhysics.current_torque_scalar) / (maxTorqueEst + 0.01),
// // // // // //             1.0
// // // // // //           );
// // // // // //           currentMaterial.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5);
// // // // // //         }
// // // // // //       }
// // // // // //     }

// // // // // //     // 10) Update particle swirl
// // // // // //     if (
// // // // // //       vizControls.showParticles &&
// // // // // //       particleGeoRef.current?.attributes.position &&
// // // // // //       particlesRef.current &&
// // // // // //       particleData?.data
// // // // // //     ) {
// // // // // //       const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// // // // // //       const speed = effectiveFieldVelocity * resonatorControls.fieldIntensity;
// // // // // //       const pData = particleData.data;

// // // // // //       if (pData && pData.length * 3 === positions.length) {
// // // // // //         const pointsMat = particlesRef.current.material as THREE.PointsMaterial;
// // // // // //         if (pointsMat) {
// // // // // //           pointsMat.size = vizControls.particleSize * (1 + resonatorControls.fieldIntensity * 0.5);
// // // // // //         }

// // // // // //         for (let i = 0; i < pData.length; i++) {
// // // // // //           const data = pData[i];
// // // // // //           data.u += speed * delta;
// // // // // //           const R = vizControls.torusMajorRadius;
// // // // // //           const r = data.r;
// // // // // //           const u = data.u;
// // // // // //           const v = data.v;
// // // // // //           const bufferIndex = i * 3;

// // // // // //           positions[bufferIndex] = (R + r * Math.cos(v)) * Math.cos(u);
// // // // // //           positions[bufferIndex + 1] = r * Math.sin(v);
// // // // // //           positions[bufferIndex + 2] = (R + r * Math.cos(v)) * Math.sin(u);
// // // // // //         }
// // // // // //         particleGeoRef.current.attributes.position.needsUpdate = true;
// // // // // //       } else {
// // // // // //         console.warn("Mismatch particle data/buffer length in useFrame.");
// // // // // //       }
// // // // // //     }
// // // // // //   });

// // // // // //   return (
// // // // // //     <group ref={groupRef}>
// // // // // //       <RomanDodecahedron
// // // // // //         ref={dodecahedronMeshRef}
// // // // // //         outerRadius={finalShellParams.outerRadius}
// // // // // //         thickness={finalShellParams.thickness}
// // // // // //         holeBaseDiameter={finalShellParams.holeBaseDiameter}
// // // // // //         holeRatio={finalShellParams.holeRatio}
// // // // // //         noduleRadius={finalShellParams.noduleRadius}
// // // // // //         wireframe={vizControls.wireframe}
// // // // // //         castShadow
// // // // // //         receiveShadow
// // // // // //         position={[0, 0, 0]}
// // // // // //         rotation={[0, 0, 0]}
// // // // // //       />
// // // // // //       <pointLight
// // // // // //         intensity={0.5}
// // // // // //         color={0xffddcc}
// // // // // //         distance={3}
// // // // // //         decay={1.5}
// // // // // //         position={[0, 0, 0]}
// // // // // //         name="InternalLight"
// // // // // //       />
// // // // // //       {vizControls.showParticles && (
// // // // // //         <points ref={particlesRef} name="FieldParticles">
// // // // // //           <bufferGeometry ref={particleGeoRef} />
// // // // // //           <pointsMaterial
// // // // // //             name="ParticleMaterial"
// // // // // //             color={0x00ffff}
// // // // // //             size={vizControls.particleSize}
// // // // // //             transparent
// // // // // //             opacity={0.7}
// // // // // //             blending={THREE.AdditiveBlending}
// // // // // //             sizeAttenuation={false}
// // // // // //             map={null}
// // // // // //           />
// // // // // //         </points>
// // // // // //       )}
// // // // // //     </group>
// // // // // //   );
// // // // // // };

// // // // // // const TemporalResonatorScene: React.FC = () => {
// // // // // //   return (
// // // // // //     <>
// // // // // //       <Leva collapsed={false} titleBar={{ title: "Controls" }} />
// // // // // //       <Canvas
// // // // // //         style={{
// // // // // //           position: "absolute",
// // // // // //           top: 0,
// // // // // //           left: 0,
// // // // // //           width: "100vw",
// // // // // //           height: "100vh",
// // // // // //           background: "#111122",
// // // // // //           zIndex: 0
// // // // // //         }}
// // // // // //         camera={{ position: [3, 3, 5], fov: 75 }}
// // // // // //         gl={{ antialias: true }}
// // // // // //         shadows
// // // // // //       >
// // // // // //         <ambientLight intensity={0.4} />
// // // // // //         <hemisphereLight groundColor={0x404040} intensity={0.8} />
// // // // // //         <directionalLight
// // // // // //           position={[5, 10, 7.5]}
// // // // // //           intensity={1.2}
// // // // // //           castShadow
// // // // // //           shadow-mapSize-width={1024}
// // // // // //           shadow-mapSize-height={1024}
// // // // // //           shadow-camera-far={25}
// // // // // //           shadow-camera-left={-10}
// // // // // //           shadow-camera-right={10}
// // // // // //           shadow-camera-top={10}
// // // // // //           shadow-camera-bottom={-10}
// // // // // //         />
// // // // // //         <ErrorBoundary>
// // // // // //           <Suspense fallback={<LoadingPlaceholder />}>
// // // // // //             <ResonatorSimulation />
// // // // // //           </Suspense>
// // // // // //         </ErrorBoundary>
// // // // // //         <Controls />
// // // // // //         {/* <axesHelper args={[5]} /> */}
// // // // // //       </Canvas>
// // // // // //     </>
// // // // // //   );
// // // // // // };

// // // // // // // Loading placeholder
// // // // // // const LoadingPlaceholder: React.FC = () => {
// // // // // //   return (
// // // // // //     <mesh>
// // // // // //       <boxGeometry args={[0.1, 0.1, 0.1]} />
// // // // // //       <meshBasicMaterial color="orange" wireframe attach="material" />
// // // // // //     </mesh>
// // // // // //   );
// // // // // // };

// // // // // // export default TemporalResonatorScene;



// // // // // // // // === Full Code: TemporalResonatorScene_V2_CSG_Fixes_17_SingleField_Complete_NoSkips.tsx ===

// // // // // // // import React, { useRef, useEffect, useMemo, Suspense, useState } from 'react';
// // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // import * as THREE from 'three';
// // // // // // // import ErrorBoundary from './errorBoundary'; // Adjust path if needed
// // // // // // // import { useControls, Leva } from 'leva'; // Keep leva
// // // // // // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// // // // // // // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // // // // // // // --- BVH / CSG Setup ---
// // // // // // // try {
// // // // // // //     // Assign prototypes for BVH computation
// // // // // // //     (THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
// // // // // // //     (THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
// // // // // // //     (THREE.Mesh.prototype as any).raycast = acceleratedRaycast;
// // // // // // // } catch (error) {
// // // // // // //     console.error("Error setting up BVH extensions:", error);
// // // // // // // }
// // // // // // // const csgEvaluator = new Evaluator();
// // // // // // // csgEvaluator.useGroups = true; // Use groups for efficiency with multiple operations
// // // // // // // extend({ OrbitControls }); // Extend R3F for OrbitControls

// // // // // // // // --- Constants ---
// // // // // // // const PHI = (1 + Math.sqrt(5)) / 2;
// // // // // // // const INV_PHI = 1 / PHI;

// // // // // // // // --- Helper: Get Dodecahedron Math Data ---
// // // // // // // function getDodecahedronData(radius: number): { vertices: THREE.Vector3[]; faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] } {
// // // // // // //     console.log(`--- Calculating Dodecahedron Data for radius: ${radius} ---`);
// // // // // // //     // Validate input radius
// // // // // // //     if (typeof radius !== 'number' || radius <= 0 || !Number.isFinite(radius)) {
// // // // // // //         console.error("!!! Invalid radius passed to getDodecahedronData:", radius);
// // // // // // //         throw new Error("Invalid radius provided to getDodecahedronData");
// // // // // // //     }

// // // // // // //     // Use a Map to ensure vertex uniqueness based on precise coordinates
// // // // // // //     const uniqueVerticesMap = new Map<string, THREE.Vector3>();
// // // // // // //     // Define base coordinates for dodecahedron vertices
// // // // // // //     const coords = [
// // // // // // //         [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1], [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
// // // // // // //         [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI],
// // // // // // //         [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI],
// // // // // // //         [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0]
// // // // // // //     ];
// // // // // // //     // Calculate the scaling factor to match the desired radius
// // // // // // //     const distOriginToVertex = Math.sqrt(PHI * PHI + INV_PHI * INV_PHI);
// // // // // // //     const scale = radius / distOriginToVertex;
// // // // // // //     if (!Number.isFinite(scale) || scale === 0) { throw new Error("Invalid scale factor"); }

// // // // // // //     // Populate the map with unique, scaled vertices
// // // // // // //     coords.forEach(v => {
// // // // // // //         const x = v[0] * scale; const y = v[1] * scale; const z = v[2] * scale;
// // // // // // //         const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`; // Key for uniqueness
// // // // // // //         if (!uniqueVerticesMap.has(key)) { uniqueVerticesMap.set(key, new THREE.Vector3(x, y, z)); }
// // // // // // //     });
// // // // // // //     const vertices = Array.from(uniqueVerticesMap.values()); // Get unique vertices

// // // // // // //     // Calculate face centers and normals using the dual icosahedron's vertices
// // // // // // //     const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
// // // // // // //     const icoVerts = [ [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1] ];
// // // // // // //     // Estimate face center distance relative to the vertex distance (adjust factor if needed)
// // // // // // //     const faceCenterDist = radius * 1.53 / distOriginToVertex;
// // // // // // //     icoVerts.forEach(v => {
// // // // // // //         const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize();
// // // // // // //         const center = normal.clone().multiplyScalar(faceCenterDist);
// // // // // // //         faceData.push({ center, normal });
// // // // // // //     });

// // // // // // //     // Final validation of generated data counts
// // // // // // //     if (vertices.length !== 20 || faceData.length !== 12) {
// // // // // // //         console.error("!!! Vertex/Face generation failed. Vertices:", vertices, "Faces:", faceData);
// // // // // // //         throw new Error(`Incorrect math data count: ${vertices.length} vertices, ${faceData.length} faces`);
// // // // // // //     }
// // // // // // //     console.log(`--- Generated ${vertices.length} vertices, ${faceData.length} faces. ---`);
// // // // // // //     return { vertices, faceData };
// // // // // // // }

// // // // // // // // --- Controls Component ---
// // // // // // // const Controls: React.FC = () => {
// // // // // // //      const { camera, gl } = useThree();
// // // // // // //      const controlsRef = useRef<OrbitControls>(null);
// // // // // // //      useEffect(() => {
// // // // // // //          const controls = new OrbitControls(camera, gl.domElement);
// // // // // // //          controls.enableDamping = true;
// // // // // // //          controls.target.set(0, 0, 0); // Target the origin (where the group is)
// // // // // // //          (controlsRef as React.MutableRefObject<OrbitControls>).current = controls;
// // // // // // //          return () => { controls.dispose(); }; // Cleanup on unmount
// // // // // // //      }, [camera, gl]);
// // // // // // //      // Update controls in the animation loop for damping
// // // // // // //      useFrame(() => { controlsRef.current?.update(); });
// // // // // // //      return null;
// // // // // // // };

// // // // // // // // --- Roman Dodecahedron CSG Component ---
// // // // // // // interface RomanDodecahedronProps {
// // // // // // //     outerRadius: number; thickness: number; holeBaseDiameter: number;
// // // // // // //     holeRatio: number; noduleRadius: number; material?: THREE.Material;
// // // // // // //     wireframe?: boolean; [key: string]: any;
// // // // // // // }
// // // // // // // const RomanDodecahedron: React.FC<RomanDodecahedronProps> = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
// // // // // // //     ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, wireframe = false, ...props }, ref) => {

// // // // // // //     // State to hold the geometry calculated after mount/prop changes
// // // // // // //     const [calculatedGeometry, setCalculatedGeometry] = useState<THREE.BufferGeometry | null>(null);

// // // // // // //     // Effect to perform CSG calculation
// // // // // // //     useEffect(() => {
// // // // // // //         console.log(`useEffect Check: outerRadius=${outerRadius} (${typeof outerRadius}), thickness=${thickness}, holeBaseDiameter=${holeBaseDiameter}, holeRatio=${holeRatio}, noduleRadius=${noduleRadius}`);
// // // // // // //         // Guard against invalid props (potentially from initial Leva state)
// // // // // // //         if ( typeof outerRadius !== 'number' || outerRadius <= 0 || !Number.isFinite(outerRadius) || typeof thickness !== 'number' || thickness <= 0 || !Number.isFinite(thickness) || typeof holeBaseDiameter !== 'number' || holeBaseDiameter <= 0 || !Number.isFinite(holeBaseDiameter) || typeof holeRatio !== 'number' || holeRatio <= 0 || !Number.isFinite(holeRatio) || typeof noduleRadius !== 'number' || noduleRadius <= 0 || !Number.isFinite(noduleRadius) ) {
// // // // // // //             console.log(`--> Skipping CSG calculation in useEffect: Invalid props detected.`);
// // // // // // //             setCalculatedGeometry(null); // Ensure geometry is null if props invalid
// // // // // // //             return; // Exit effect
// // // // // // //         }

// // // // // // //         const detailLevel = 1; // Keep detail level 1 for performance/simplicity
// // // // // // //         console.log(`Calculating CSG Geometry (Detail=${detailLevel}) for radius: ${outerRadius}`);
// // // // // // //         let geometry: THREE.BufferGeometry | null = null;
// // // // // // //         let tempGeoList: THREE.BufferGeometry[] = []; // Track temp geos for disposal

// // // // // // //         try {
// // // // // // //             // Get mathematically correct positions/normals
// // // // // // //             const { vertices: mathVertices, faceData: mathFaceData } = getDodecahedronData(outerRadius);

// // // // // // //             // Create base shell
// // // // // // //             const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, detailLevel); outerDodecGeo.computeBoundsTree(); tempGeoList.push(outerDodecGeo);
// // // // // // //             const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, detailLevel); innerDodecGeo.computeBoundsTree(); tempGeoList.push(innerDodecGeo);
// // // // // // //             let outerBrush = new Brush(outerDodecGeo); let innerBrush = new Brush(innerDodecGeo); innerBrush.updateMatrixWorld();
// // // // // // //             let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);

// // // // // // //             // Create and subtract holes
// // // // // // //             const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * (holeRatio ** i));
// // // // // // //             console.log("Calculated Hole Diameters:", holeDiameters.map(d => d.toFixed(4))); // Log hole diameters
// // // // // // //             const cylinderHeight = thickness * 3.1; // Ensure cylinder goes through shell
// // // // // // //             const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16); cylinderGeo.rotateX(Math.PI / 2); cylinderGeo.computeBoundsTree(); tempGeoList.push(cylinderGeo);
// // // // // // //             const tempQuat = new THREE.Quaternion();
// // // // // // //             let holesSubtracted = 0; // Counter

// // // // // // //             mathFaceData.forEach((face, index) => {
// // // // // // //                 const holeRadius = holeDiameters[index] / 2;
// // // // // // //                 console.log(`  Processing Face ${index}: Radius=${holeRadius?.toFixed(4)}, Center=(${face.center.x.toFixed(2)},${face.center.y.toFixed(2)},${face.center.z.toFixed(2)}), Normal=(${face.normal.x.toFixed(2)},${face.normal.y.toFixed(2)},${face.normal.z.toFixed(2)})`);
// // // // // // //                 if (!holeRadius || holeRadius <= 0 || !Number.isFinite(holeRadius)) { console.warn(`    --> Skipping Face ${index}: Invalid radius.`); return; }

// // // // // // //                 const holeBrush = new Brush(cylinderGeo);
// // // // // // //                 holeBrush.scale.set(holeRadius, holeRadius, 1);
// // // // // // //                 tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal);
// // // // // // //                 holeBrush.quaternion.copy(tempQuat);
// // // // // // //                 holeBrush.position.copy(face.center);
// // // // // // //                 holeBrush.updateMatrixWorld();

// // // // // // //                 try {
// // // // // // //                     shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION); // Assign result back
// // // // // // //                     holesSubtracted++;
// // // // // // //                     console.log(`    --> Subtracted hole ${index}.`);
// // // // // // //                 } catch (evalError) {
// // // // // // //                      console.error(`    --> CSG subtraction FAILED for face ${index}:`, evalError);
// // // // // // //                 }
// // // // // // //             });
// // // // // // //             console.log(`Total holes subtracted successfully (based on code execution): ${holesSubtracted}`);

// // // // // // //             // Create and add nodules
// // // // // // //             const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6); noduleGeo.computeBoundsTree(); tempGeoList.push(noduleGeo);
// // // // // // //             mathVertices.forEach(vertexPos => {
// // // // // // //                 const noduleBrush = new Brush(noduleGeo); noduleBrush.position.copy(vertexPos);
// // // // // // //                 noduleBrush.updateMatrixWorld(); shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
// // // // // // //             });

// // // // // // //             // Finalize geometry
// // // // // // //             geometry = shellBrush.geometry;
// // // // // // //             geometry.computeVertexNormals(); // Crucial for lighting!
// // // // // // //             geometry.center(); // Center the final composite shape
// // // // // // //             console.log("CSG Calculation Complete.");

// // // // // // //         } catch (error) {
// // // // // // //             console.error("CSG Error in useEffect:", error);
// // // // // // //             geometry = null; // Ensure null on error
// // // // // // //         } finally {
// // // // // // //             // Clean up intermediate geometries used for CSG brushes
// // // // // // //             tempGeoList.forEach(g => g.dispose());
// // // // // // //             console.log(`Disposed ${tempGeoList.length} temporary CSG geometries.`);
// // // // // // //         }

// // // // // // //         // Update state with the calculated geometry (or null)
// // // // // // //         setCalculatedGeometry(geometry);

// // // // // // //         // Effect cleanup function: Dispose the *final* geometry when effect re-runs or unmounts
// // // // // // //         return () => {
// // // // // // //             if (geometry && typeof geometry.dispose === 'function') {
// // // // // // //                 geometry.dispose();
// // // // // // //                 console.log("Disposed final CSG geometry from useEffect cleanup.");
// // // // // // //             }
// // // // // // //         };
// // // // // // //     }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]); // Dependencies

// // // // // // //     // Memoize the material based on props, using Phong default
// // // // // // //     const meshMaterial = useMemo(() => {
// // // // // // //         let baseMaterial: THREE.Material;
// // // // // // //         if (material instanceof THREE.Material) {
// // // // // // //              baseMaterial = material.clone(); baseMaterial.side = THREE.DoubleSide;
// // // // // // //         } else {
// // // // // // //             baseMaterial = new THREE.MeshPhongMaterial({ color: 0xB87333, side: THREE.DoubleSide, specular: 0x444444, shininess: 40, name: "DefaultPhongCopper" });
// // // // // // //         }
// // // // // // //         // Use type guard for wireframe property
// // // // // // //         if ('wireframe' in baseMaterial) {
// // // // // // //             (baseMaterial as any).wireframe = wireframe;
// // // // // // //         }
// // // // // // //         baseMaterial.side = THREE.DoubleSide; // Ensure double side
// // // // // // //         return baseMaterial;
// // // // // // //     }, [material, wireframe]);

// // // // // // //     // Effect to dispose the memoized material
// // // // // // //     useEffect(() => { return () => { meshMaterial?.dispose(); } }, [meshMaterial]);

// // // // // // //     // Don't render if geometry calculation failed or hasn't completed
// // // // // // //     if (!calculatedGeometry) { return null; }

// // // // // // //     // Render the mesh using calculated geometry and memoized material
// // // // // // //     return <mesh ref={ref} geometry={calculatedGeometry} material={meshMaterial} {...props} />;
// // // // // // // });

// // // // // // // // --- Physics State Interface (Reverted) ---
// // // // // // // interface PhysicsState {
// // // // // // //     shell_angular_velocity_scalar: number;
// // // // // // //     effective_field_velocity_scalar: number;
// // // // // // //     current_torque_scalar: number;
// // // // // // // }

// // // // // // // // --- Main Simulation Component ---
// // // // // // // const ResonatorSimulation: React.FC = () => {
// // // // // // //     // Refs for scene objects
// // // // // // //     const groupRef = useRef<THREE.Group>(null!);
// // // // // // //     const dodecahedronMeshRef = useRef<THREE.Mesh>(null!);
// // // // // // //     const particlesRef = useRef<THREE.Points>(null!);
// // // // // // //     const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // // // //     // Leva controls setup - Reverted to single field controls
// // // // // // //     const resonatorControls = useControls('Resonator Controls', {
// // // // // // //         baseFieldSpeed: { value: 1.0, min: -5, max: 5, step: 0.1 }, // Single speed
// // // // // // //         fieldIntensity: { value: 1.0, min: 0.0, max: 5, step: 0.1 }, // Single intensity
// // // // // // //         k_drag: { label: 'Induction Strength', value: 0.5, min: 0, max: 2, step: 0.05 },
// // // // // // //         inertiaScale: { label: 'Inertia Scale', value: 1.0, min: 0.1, max: 5, step: 0.1 },
// // // // // // //         damping: { value: 0.1, min: 0, max: 1, step: 0.01 },
// // // // // // //         k_feedback: { value: -0.2, min: -2, max: 2, step: 0.05 },
// // // // // // //     });
// // // // // // //     const shellControls = useControls('Shell Geometry', { outerRadius: 1.0, thickness: 0.05, holeBaseDiameter: 0.1, holeRatio: 1.2, noduleRadius: 0.1 });
// // // // // // //     const vizControls = useControls('Visualization', {
// // // // // // //         particleCount: { value: 1000, min: 100, max: 5000, step: 100 },
// // // // // // //         particleSize: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
// // // // // // //         torusMajorRadius: { value: 1.5, min: 0.5, max: 5, step: 0.1 }, // Single torus radius
// // // // // // //         torusMinorRadius: { value: 0.5, min: 0.1, max: 2, step: 0.05 }, // Single torus radius
// // // // // // //         showParticles: true,
// // // // // // //         wireframe: false
// // // // // // //     });

// // // // // // //     // Ensure shell parameters are valid numbers, falling back to defaults
// // // // // // //     const defaultShellParams = useMemo(() => ({ outerRadius: 1.0, thickness: 0.05, holeBaseDiameter: 0.1, holeRatio: 1.2, noduleRadius: 0.1 }), []);
// // // // // // //     const finalShellParams = useMemo(() => ({
// // // // // // //         outerRadius: (typeof shellControls.outerRadius === 'number' && Number.isFinite(shellControls.outerRadius)) ? shellControls.outerRadius : defaultShellParams.outerRadius,
// // // // // // //         thickness: (typeof shellControls.thickness === 'number' && Number.isFinite(shellControls.thickness)) ? shellControls.thickness : defaultShellParams.thickness,
// // // // // // //         holeBaseDiameter: (typeof shellControls.holeBaseDiameter === 'number' && Number.isFinite(shellControls.holeBaseDiameter)) ? shellControls.holeBaseDiameter : defaultShellParams.holeBaseDiameter,
// // // // // // //         holeRatio: (typeof shellControls.holeRatio === 'number' && Number.isFinite(shellControls.holeRatio)) ? shellControls.holeRatio : defaultShellParams.holeRatio,
// // // // // // //         noduleRadius: (typeof shellControls.noduleRadius === 'number' && Number.isFinite(shellControls.noduleRadius)) ? shellControls.noduleRadius : defaultShellParams.noduleRadius,
// // // // // // //     }), [shellControls, defaultShellParams]);

// // // // // // //     // Calculate effective inertia
// // // // // // //     const effectiveInertia = useMemo(() => resonatorControls.inertiaScale * (finalShellParams.outerRadius ** 5 - (finalShellParams.outerRadius - finalShellParams.thickness) ** 5) / finalShellParams.outerRadius ** 5, [resonatorControls.inertiaScale, finalShellParams.outerRadius, finalShellParams.thickness]);

// // // // // // //     // Initialize physics state using a ref
// // // // // // //     const physicsState = useRef<PhysicsState>({
// // // // // // //          shell_angular_velocity_scalar: 0.0, // Starts at rest
// // // // // // //          effective_field_velocity_scalar: resonatorControls.baseFieldSpeed || 0,
// // // // // // //          current_torque_scalar: 0.0,
// // // // // // //     });

// // // // // // //     // Memoize particle data creation (single field version)
// // // // // // //     const particleData = useMemo<{ positions: Float32Array; data: any[] }>(() => {
// // // // // // //         console.log(`Creating particle data for count: ${vizControls.particleCount}`);
// // // // // // //         try {
// // // // // // //              const data = []; const positions = new Float32Array(vizControls.particleCount * 3);
// // // // // // //              for (let i = 0; i < vizControls.particleCount; i++) {
// // // // // // //                  const u = Math.random() * Math.PI * 2; const v = Math.random() * Math.PI * 2;
// // // // // // //                  const R = vizControls.torusMajorRadius; const r = vizControls.torusMinorRadius;
// // // // // // //                  const randR = R + (Math.random() - 0.5) * 0.2 * r;
// // // // // // //                  const randr = r * Math.sqrt(Math.random());
// // // // // // //                  positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u);
// // // // // // //                  positions[i * 3 + 1] = randr * Math.sin(v);
// // // // // // //                  positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);
// // // // // // //                  data.push({ u, v, R, r: randr }); // Only need position data
// // // // // // //             }
// // // // // // //              return { positions, data };
// // // // // // //         } catch (error) { console.error("Error creating particle data:", error); return { positions: new Float32Array(0), data: [] }; }
// // // // // // //      }, [vizControls.particleCount, vizControls.torusMajorRadius, vizControls.torusMinorRadius]);

// // // // // // //     // Effect to manage the particle buffer attribute (position only)
// // // // // // //      useEffect(() => {
// // // // // // //          if (particleGeoRef.current && particleData?.positions) {
// // // // // // //              const existingAttribute = particleGeoRef.current.getAttribute('position') as THREE.BufferAttribute | undefined;
// // // // // // //              if (!existingAttribute || existingAttribute.array.length !== particleData.positions.length) {
// // // // // // //                  particleGeoRef.current.setAttribute('position', new THREE.BufferAttribute(particleData.positions, 3, false));
// // // // // // //                  console.log(`Particle position attribute CREATED/REPLACED (Count: ${particleData.positions.length / 3}).`);
// // // // // // //              }
// // // // // // //              if (particleGeoRef.current.getAttribute('color')) { // Clean up color if it exists
// // // // // // //                   particleGeoRef.current.deleteAttribute('color');
// // // // // // //                   console.log("Removed old particle color attribute.");
// // // // // // //              }
// // // // // // //          } else { if (particleGeoRef.current?.getAttribute('position')) { particleGeoRef.current.deleteAttribute('position'); console.log("Particle position attribute removed."); } }
// // // // // // //      }, [particleData]);

// // // // // // //     // Main animation loop
// // // // // // //     useFrame((state, delta) => {
// // // // // // //         const currentPhysics = physicsState.current;

// // // // // // //         // --- Single Field Physics Calculations ---
// // // // // // //         currentPhysics.effective_field_velocity_scalar = resonatorControls.baseFieldSpeed + resonatorControls.k_feedback * currentPhysics.shell_angular_velocity_scalar;
// // // // // // //         const relative_speed = currentPhysics.effective_field_velocity_scalar - currentPhysics.shell_angular_velocity_scalar;
// // // // // // //         currentPhysics.current_torque_scalar = resonatorControls.k_drag * resonatorControls.fieldIntensity * relative_speed;
// // // // // // //         const angular_acceleration = effectiveInertia > 0 ? (currentPhysics.current_torque_scalar / effectiveInertia) : 0;
// // // // // // //         currentPhysics.shell_angular_velocity_scalar += angular_acceleration * delta;
// // // // // // //         currentPhysics.shell_angular_velocity_scalar *= (1 - resonatorControls.damping * delta);

// // // // // // //         // Rotate the Group
// // // // // // //         if (groupRef.current) {
// // // // // // //              // console.log("Ang Vel:", currentPhysics.shell_angular_velocity_scalar.toFixed(3));
// // // // // // //              groupRef.current.rotation.y += currentPhysics.shell_angular_velocity_scalar * delta;
// // // // // // //         }

// // // // // // //         // Update Emissive (Conditional - only for Standard/Physical Materials)
// // // // // // //         if (dodecahedronMeshRef.current) {
// // // // // // //              const currentMaterial = dodecahedronMeshRef.current.material;
// // // // // // //              if (currentMaterial instanceof THREE.MeshStandardMaterial || currentMaterial instanceof THREE.MeshPhysicalMaterial) {
// // // // // // //                  if (currentMaterial.emissive) {
// // // // // // //                       const maxTorqueEst = resonatorControls.k_drag * resonatorControls.fieldIntensity * (Math.abs(resonatorControls.baseFieldSpeed) * 1.5 + 1);
// // // // // // //                       const emissionStrength = Math.min(Math.abs(currentPhysics.current_torque_scalar) / (maxTorqueEst + 0.01), 1.0);
// // // // // // //                       currentMaterial.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5);
// // // // // // //                  }
// // // // // // //              }
// // // // // // //         }

// // // // // // //         // --- Single Field Particle Update ---
// // // // // // //         if (vizControls.showParticles && particleGeoRef.current?.attributes.position && particlesRef.current && particleData?.data) {
// // // // // // //             const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// // // // // // //             const speed = currentPhysics.effective_field_velocity_scalar * resonatorControls.fieldIntensity;
// // // // // // //             const pData = particleData.data; // Use optional chaining fixed earlier

// // // // // // //             if (pData && pData.length * 3 === positions.length) {
// // // // // // //                 const pointsMat = particlesRef.current.material as THREE.PointsMaterial;
// // // // // // //                 if (pointsMat) { pointsMat.size = vizControls.particleSize * (1 + resonatorControls.fieldIntensity * 0.5); }

// // // // // // //                 for (let i = 0; i < pData.length; i++) {
// // // // // // //                     const data = pData[i];
// // // // // // //                     data.u += speed * delta; // Use the single calculated speed
// // // // // // //                     const R = vizControls.torusMajorRadius; // Use global radius
// // // // // // //                     const r = data.r; const u = data.u; const v = data.v;
// // // // // // //                     const bufferIndex = i * 3;
// // // // // // //                     positions[bufferIndex]     = (R + r * Math.cos(v)) * Math.cos(u);
// // // // // // //                     positions[bufferIndex + 1] = r * Math.sin(v);
// // // // // // //                     positions[bufferIndex + 2] = (R + r * Math.cos(v)) * Math.sin(u);
// // // // // // //                 }
// // // // // // //                 particleGeoRef.current.attributes.position.needsUpdate = true;
// // // // // // //             } else { console.warn("Mismatch particle data/buffer length in useFrame."); }
// // // // // // //         }
// // // // // // //     });

// // // // // // //     return (
// // // // // // //         <group ref={groupRef}>
// // // // // // //             <RomanDodecahedron
// // // // // // //                 ref={dodecahedronMeshRef}
// // // // // // //                 outerRadius={finalShellParams.outerRadius}
// // // // // // //                 thickness={finalShellParams.thickness}
// // // // // // //                 holeBaseDiameter={finalShellParams.holeBaseDiameter}
// // // // // // //                 holeRatio={finalShellParams.holeRatio}
// // // // // // //                 noduleRadius={finalShellParams.noduleRadius}
// // // // // // //                 // Let component use its Phong default
// // // // // // //                 wireframe={vizControls.wireframe}
// // // // // // //                 castShadow receiveShadow
// // // // // // //                 position={[0,0,0]} rotation={[0,0,0]}
// // // // // // //             />
// // // // // // //             <pointLight intensity={0.5} color={0xffddcc} distance={3} decay={1.5} position={[0, 0, 0]} name="InternalLight" />
// // // // // // //             {vizControls.showParticles && (
// // // // // // //                  <points ref={particlesRef} name="FieldParticles">
// // // // // // //                      <bufferGeometry ref={particleGeoRef} />
// // // // // // //                      {/* Reverted PointsMaterial (single color) */}
// // // // // // //                      <pointsMaterial
// // // // // // //                          name="ParticleMaterial" color={0x00ffff}
// // // // // // //                          size={vizControls.particleSize} transparent opacity={0.7}
// // // // // // //                          blending={THREE.AdditiveBlending}
// // // // // // //                          sizeAttenuation={false}
// // // // // // //                          map={null}
// // // // // // //                      />
// // // // // // //                  </points>
// // // // // // //             )}
// // // // // // //         </group>
// // // // // // //     );
// // // // // // // };

// // // // // // // // --- Scene Component ---
// // // // // // // const TemporalResonatorScene: React.FC = () => {
// // // // // // //      return (
// // // // // // //         <>
// // // // // // //             <Leva collapsed={false} titleBar={{ title: 'Controls' }} />
// // // // // // //             <Canvas
// // // // // // //                  style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', background: '#111122', zIndex: 0 }}
// // // // // // //                  camera={{ position: [3, 3, 5], fov: 75 }}
// // // // // // //                  gl={{ antialias: true }} shadows
// // // // // // //             >
// // // // // // //                  {/* Lighting Setup */}
// // // // // // //                  <ambientLight intensity={0.4} />
// // // // // // //                  <hemisphereLight groundColor={0x404040} intensity={0.8} />
// // // // // // //                  <directionalLight
// // // // // // //                      position={[5, 10, 7.5]} intensity={1.2} castShadow
// // // // // // //                      shadow-mapSize-width={1024} shadow-mapSize-height={1024}
// // // // // // //                      shadow-camera-far={25} shadow-camera-left={-10} shadow-camera-right={10}
// // // // // // //                      shadow-camera-top={10} shadow-camera-bottom={-10}
// // // // // // //                  />
// // // // // // //                  <ErrorBoundary>
// // // // // // //                      <Suspense fallback={<LoadingPlaceholder />}>
// // // // // // //                           <ResonatorSimulation />
// // // // // // //                      </Suspense>
// // // // // // //                  </ErrorBoundary>
// // // // // // //                  <Controls />
// // // // // // //                  {/* <axesHelper args={[5]} /> */}
// // // // // // //             </Canvas>
// // // // // // //         </>
// // // // // // //      );
// // // // // // //  };
// // // // // // // // --- Loading Placeholder Component ---
// // // // // // // const LoadingPlaceholder: React.FC = () => {
// // // // // // //     return (
// // // // // // //         <mesh>
// // // // // // //             <boxGeometry args={[0.1, 0.1, 0.1]} />
// // // // // // //             <meshBasicMaterial color="orange" wireframe attach="material" />
// // // // // // //         </mesh>
// // // // // // //     );
// // // // // // // };

// // // // // // // export default TemporalResonatorScene;

// // // // // // // // // === Full Code: TemporalResonatorScene_V2_CSG_Fixes_13_Detail.tsx ===

// // // // // // // // import React, { useRef, useEffect, useMemo, Suspense, useState } from 'react';
// // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // // import * as THREE from 'three';
// // // // // // // // import ErrorBoundary from './errorBoundary'; // Adjust path if needed
// // // // // // // // import { useControls, Leva } from 'leva';
// // // // // // // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// // // // // // // // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // // // // // // // // --- BVH / CSG Setup ---
// // // // // // // // try {
// // // // // // // //     // Assign prototypes for BVH computation
// // // // // // // //     (THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
// // // // // // // //     (THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
// // // // // // // //     (THREE.Mesh.prototype as any).raycast = acceleratedRaycast;
// // // // // // // // } catch (error) {
// // // // // // // //     console.error("Error setting up BVH extensions:", error);
// // // // // // // // }
// // // // // // // // const csgEvaluator = new Evaluator();
// // // // // // // // csgEvaluator.useGroups = true; // Use groups for efficiency with multiple operations
// // // // // // // // extend({ OrbitControls }); // Extend R3F for OrbitControls

// // // // // // // // // --- Constants ---
// // // // // // // // const PHI = (1 + Math.sqrt(5)) / 2;
// // // // // // // // const INV_PHI = 1 / PHI;

// // // // // // // // // --- Helper: Get Dodecahedron Math Data ---
// // // // // // // // function getDodecahedronData(radius: number): { vertices: THREE.Vector3[]; faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] } {
// // // // // // // //     console.log(`--- Calculating Dodecahedron Data for radius: ${radius} ---`);
// // // // // // // //     // Validate input radius
// // // // // // // //     if (typeof radius !== 'number' || radius <= 0 || !Number.isFinite(radius)) {
// // // // // // // //         console.error("!!! Invalid radius passed to getDodecahedronData:", radius);
// // // // // // // //         throw new Error("Invalid radius provided to getDodecahedronData");
// // // // // // // //     }

// // // // // // // //     // Use a Map to ensure vertex uniqueness based on precise coordinates
// // // // // // // //     const uniqueVerticesMap = new Map<string, THREE.Vector3>();
// // // // // // // //     // Define base coordinates for dodecahedron vertices
// // // // // // // //     const coords = [
// // // // // // // //         [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1], [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
// // // // // // // //         [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI],
// // // // // // // //         [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI],
// // // // // // // //         [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0]
// // // // // // // //     ];
// // // // // // // //     // Calculate the scaling factor to match the desired radius
// // // // // // // //     const distOriginToVertex = Math.sqrt(PHI * PHI + INV_PHI * INV_PHI);
// // // // // // // //     const scale = radius / distOriginToVertex;
// // // // // // // //     if (!Number.isFinite(scale) || scale === 0) { throw new Error("Invalid scale factor"); }

// // // // // // // //     // Populate the map with unique, scaled vertices
// // // // // // // //     coords.forEach(v => {
// // // // // // // //         const x = v[0] * scale; const y = v[1] * scale; const z = v[2] * scale;
// // // // // // // //         const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`; // Key for uniqueness
// // // // // // // //         if (!uniqueVerticesMap.has(key)) { uniqueVerticesMap.set(key, new THREE.Vector3(x, y, z)); }
// // // // // // // //     });
// // // // // // // //     const vertices = Array.from(uniqueVerticesMap.values()); // Get unique vertices

// // // // // // // //     // Calculate face centers and normals using the dual icosahedron's vertices
// // // // // // // //     const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
// // // // // // // //     const icoVerts = [ [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1] ];
// // // // // // // //     // Estimate face center distance relative to the vertex distance (adjust factor if needed)
// // // // // // // //     const faceCenterDist = radius * 1.53 / distOriginToVertex;
// // // // // // // //     icoVerts.forEach(v => {
// // // // // // // //         const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize();
// // // // // // // //         const center = normal.clone().multiplyScalar(faceCenterDist);
// // // // // // // //         faceData.push({ center, normal });
// // // // // // // //     });

// // // // // // // //     // Final validation of generated data counts
// // // // // // // //     if (vertices.length !== 20 || faceData.length !== 12) {
// // // // // // // //         console.error("!!! Vertex/Face generation failed. Vertices:", vertices, "Faces:", faceData);
// // // // // // // //         throw new Error(`Incorrect math data count: ${vertices.length} vertices, ${faceData.length} faces`);
// // // // // // // //     }
// // // // // // // //     console.log(`--- Generated ${vertices.length} vertices, ${faceData.length} faces. ---`);
// // // // // // // //     return { vertices, faceData };
// // // // // // // // }

// // // // // // // // // --- Controls Component ---
// // // // // // // // const Controls: React.FC = () => {
// // // // // // // //      const { camera, gl } = useThree();
// // // // // // // //      const controlsRef = useRef<OrbitControls>(null);
// // // // // // // //      useEffect(() => {
// // // // // // // //          const controls = new OrbitControls(camera, gl.domElement);
// // // // // // // //          controls.enableDamping = true;
// // // // // // // //          controls.target.set(0, 0, 0); // Target the origin (where the group is)
// // // // // // // //          (controlsRef as React.MutableRefObject<OrbitControls>).current = controls;
// // // // // // // //          return () => { controls.dispose(); }; // Cleanup on unmount
// // // // // // // //      }, [camera, gl]);
// // // // // // // //      // Update controls in the animation loop for damping
// // // // // // // //      useFrame(() => { controlsRef.current?.update(); });
// // // // // // // //      return null;
// // // // // // // // };

// // // // // // // // // --- Roman Dodecahedron CSG Component ---
// // // // // // // // interface RomanDodecahedronProps {
// // // // // // // //     outerRadius: number; thickness: number; holeBaseDiameter: number;
// // // // // // // //     holeRatio: number; noduleRadius: number; material?: THREE.Material;
// // // // // // // //     wireframe?: boolean; [key: string]: any;
// // // // // // // // }
// // // // // // // // const RomanDodecahedron: React.FC<RomanDodecahedronProps> = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
// // // // // // // //     ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, wireframe = false, ...props }, ref) => {

// // // // // // // //     // State to hold the geometry calculated after mount/prop changes
// // // // // // // //     const [calculatedGeometry, setCalculatedGeometry] = useState<THREE.BufferGeometry | null>(null);

// // // // // // // //     // Effect to perform CSG calculation
// // // // // // // //     useEffect(() => {
// // // // // // // //         console.log(`useEffect Check: outerRadius=${outerRadius} (${typeof outerRadius}), thickness=${thickness}, ...`);
// // // // // // // //         // Guard against invalid props (potentially from initial Leva state)
// // // // // // // //         if ( typeof outerRadius !== 'number' || outerRadius <= 0 || !Number.isFinite(outerRadius) || typeof thickness !== 'number' || thickness <= 0 || !Number.isFinite(thickness) || typeof holeBaseDiameter !== 'number' || holeBaseDiameter <= 0 || !Number.isFinite(holeBaseDiameter) || typeof holeRatio !== 'number' || holeRatio <= 0 || !Number.isFinite(holeRatio) || typeof noduleRadius !== 'number' || noduleRadius <= 0 || !Number.isFinite(noduleRadius) ) {
// // // // // // // //             console.log(`--> Skipping CSG calculation in useEffect: Invalid props detected.`);
// // // // // // // //             setCalculatedGeometry(null); // Ensure geometry is null if props invalid
// // // // // // // //             return; // Exit effect
// // // // // // // //         }

// // // // // // // //         // --- **** Increased Detail Level **** ---
// // // // // // // //         const detailLevel = 2; // Increased from 1
// // // // // // // //         console.log(`Calculating CSG Geometry (Detail=${detailLevel}) for radius: ${outerRadius}`);
// // // // // // // //         // --- **** **** **** **** **** **** **** ---

// // // // // // // //         let geometry: THREE.BufferGeometry | null = null;
// // // // // // // //         let tempGeoList: THREE.BufferGeometry[] = []; // Track temp geos for disposal

// // // // // // // //         try {
// // // // // // // //             // Get mathematically correct positions/normals
// // // // // // // //             const { vertices: mathVertices, faceData: mathFaceData } = getDodecahedronData(outerRadius);

// // // // // // // //             // Create base shell using higher detail
// // // // // // // //             const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, detailLevel); outerDodecGeo.computeBoundsTree(); tempGeoList.push(outerDodecGeo);
// // // // // // // //             const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, detailLevel); innerDodecGeo.computeBoundsTree(); tempGeoList.push(innerDodecGeo);
// // // // // // // //             let outerBrush = new Brush(outerDodecGeo); let innerBrush = new Brush(innerDodecGeo); innerBrush.updateMatrixWorld();
// // // // // // // //             let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);

// // // // // // // //             // Create and subtract holes
// // // // // // // //             const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * (holeRatio ** i));
// // // // // // // //             const cylinderHeight = thickness * 3.1; // Ensure cylinder goes through shell
// // // // // // // //             // Cylinder detail doesn't need to match base detail
// // // // // // // //             const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16); cylinderGeo.rotateX(Math.PI / 2); cylinderGeo.computeBoundsTree(); tempGeoList.push(cylinderGeo);
// // // // // // // //             const tempQuat = new THREE.Quaternion();
// // // // // // // //             mathFaceData.forEach((face, index) => {
// // // // // // // //                 const holeRadius = holeDiameters[index] / 2; if (!holeRadius || holeRadius <= 0) return;
// // // // // // // //                 const holeBrush = new Brush(cylinderGeo); holeBrush.scale.set(holeRadius, holeRadius, 1);
// // // // // // // //                 tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal); holeBrush.quaternion.copy(tempQuat);
// // // // // // // //                 holeBrush.position.copy(face.center); holeBrush.updateMatrixWorld();
// // // // // // // //                 shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION);
// // // // // // // //             });

// // // // // // // //             // Create and add nodules (keep low detail)
// // // // // // // //             const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6); noduleGeo.computeBoundsTree(); tempGeoList.push(noduleGeo);
// // // // // // // //             mathVertices.forEach(vertexPos => {
// // // // // // // //                 const noduleBrush = new Brush(noduleGeo); noduleBrush.position.copy(vertexPos);
// // // // // // // //                 noduleBrush.updateMatrixWorld(); shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
// // // // // // // //             });

// // // // // // // //             // Finalize geometry
// // // // // // // //             geometry = shellBrush.geometry;
// // // // // // // //             geometry.computeVertexNormals(); // Crucial for lighting!
// // // // // // // //             geometry.center(); // Center the final composite shape
// // // // // // // //             console.log("CSG Calculation Complete.");

// // // // // // // //         } catch (error) {
// // // // // // // //             console.error("CSG Error in useEffect:", error);
// // // // // // // //             geometry = null; // Ensure null on error
// // // // // // // //         } finally {
// // // // // // // //             // Clean up intermediate geometries used for CSG brushes
// // // // // // // //             tempGeoList.forEach(g => g.dispose());
// // // // // // // //             console.log(`Disposed ${tempGeoList.length} temporary CSG geometries.`);
// // // // // // // //         }

// // // // // // // //         // Update state with the calculated geometry (or null)
// // // // // // // //         setCalculatedGeometry(geometry);

// // // // // // // //         // Effect cleanup function: Dispose the *final* geometry when effect re-runs or unmounts
// // // // // // // //         return () => {
// // // // // // // //             if (geometry && typeof geometry.dispose === 'function') {
// // // // // // // //                 geometry.dispose();
// // // // // // // //                 console.log("Disposed final CSG geometry from useEffect cleanup.");
// // // // // // // //             }
// // // // // // // //         };
// // // // // // // //     }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]); // Dependencies

// // // // // // // //     // Memoize the material based on props, using Phong default
// // // // // // // //     const meshMaterial = useMemo(() => {
// // // // // // // //         let baseMaterial: THREE.Material;
// // // // // // // //         if (material instanceof THREE.Material) {
// // // // // // // //              baseMaterial = material.clone(); baseMaterial.side = THREE.DoubleSide;
// // // // // // // //         } else {
// // // // // // // //             baseMaterial = new THREE.MeshPhongMaterial({ color: 0xB87333, side: THREE.DoubleSide, specular: 0x444444, shininess: 40, name: "DefaultPhongCopper" });
// // // // // // // //         }
// // // // // // // //         if ('wireframe' in baseMaterial) { (baseMaterial as any).wireframe = wireframe; }
// // // // // // // //         baseMaterial.side = THREE.DoubleSide; // Ensure double side
// // // // // // // //         return baseMaterial;
// // // // // // // //     }, [material, wireframe]);

// // // // // // // //     // Effect to dispose the memoized material
// // // // // // // //     useEffect(() => { return () => { meshMaterial?.dispose(); } }, [meshMaterial]);

// // // // // // // //     // Don't render if geometry calculation failed or hasn't completed
// // // // // // // //     if (!calculatedGeometry) { return null; }

// // // // // // // //     // Render the mesh using calculated geometry and memoized material
// // // // // // // //     return <mesh ref={ref} geometry={calculatedGeometry} material={meshMaterial} {...props} />;
// // // // // // // // });

// // // // // // // // // --- Physics State Interface ---
// // // // // // // // interface PhysicsState {
// // // // // // // //     shell_angular_velocity_scalar: number;
// // // // // // // //     effective_field_velocity_scalar: number;
// // // // // // // //     current_torque_scalar: number;
// // // // // // // // }

// // // // // // // // // --- Main Simulation Component ---
// // // // // // // // const ResonatorSimulation: React.FC = () => {
// // // // // // // //     // Refs for scene objects
// // // // // // // //     const groupRef = useRef<THREE.Group>(null!);
// // // // // // // //     const dodecahedronMeshRef = useRef<THREE.Mesh>(null!);
// // // // // // // //     const particlesRef = useRef<THREE.Points>(null!);
// // // // // // // //     const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // // // // //     // Leva controls setup
// // // // // // // //     const resonatorControls = useControls('Resonator Controls', { baseFieldSpeed: 1.0, fieldIntensity: 1.0, k_drag: 0.5, inertiaScale: 1.0, damping: 0.1, k_feedback: -0.2 });
// // // // // // // //     const shellControls = useControls('Shell Geometry', { outerRadius: 1.0, thickness: 0.05, holeBaseDiameter: 0.1, holeRatio: 1.2, noduleRadius: 0.1 });
// // // // // // // //     const vizControls = useControls('Visualization', { particleCount: 1000, particleSize: 0.05, torusMajorRadius: 1.5, torusMinorRadius: 0.5, showParticles: true, wireframe: false });

// // // // // // // //     // Ensure shell parameters are valid numbers, falling back to defaults
// // // // // // // //     const defaultShellParams = useMemo(() => ({ outerRadius: 1.0, thickness: 0.05, holeBaseDiameter: 0.1, holeRatio: 1.2, noduleRadius: 0.1 }), []);
// // // // // // // //     const finalShellParams = useMemo(() => ({
// // // // // // // //         outerRadius: (typeof shellControls.outerRadius === 'number' && Number.isFinite(shellControls.outerRadius)) ? shellControls.outerRadius : defaultShellParams.outerRadius,
// // // // // // // //         thickness: (typeof shellControls.thickness === 'number' && Number.isFinite(shellControls.thickness)) ? shellControls.thickness : defaultShellParams.thickness,
// // // // // // // //         holeBaseDiameter: (typeof shellControls.holeBaseDiameter === 'number' && Number.isFinite(shellControls.holeBaseDiameter)) ? shellControls.holeBaseDiameter : defaultShellParams.holeBaseDiameter,
// // // // // // // //         holeRatio: (typeof shellControls.holeRatio === 'number' && Number.isFinite(shellControls.holeRatio)) ? shellControls.holeRatio : defaultShellParams.holeRatio,
// // // // // // // //         noduleRadius: (typeof shellControls.noduleRadius === 'number' && Number.isFinite(shellControls.noduleRadius)) ? shellControls.noduleRadius : defaultShellParams.noduleRadius,
// // // // // // // //     }), [shellControls, defaultShellParams]);

// // // // // // // //     // Calculate effective inertia
// // // // // // // //     const effectiveInertia = useMemo(() => resonatorControls.inertiaScale * (finalShellParams.outerRadius ** 5 - (finalShellParams.outerRadius - finalShellParams.thickness) ** 5) / finalShellParams.outerRadius ** 5, [resonatorControls.inertiaScale, finalShellParams.outerRadius, finalShellParams.thickness]);

// // // // // // // //     // Initialize physics state using a ref
// // // // // // // //     const physicsState = useRef<PhysicsState>({
// // // // // // // //          shell_angular_velocity_scalar: 0.0,
// // // // // // // //          effective_field_velocity_scalar: resonatorControls.baseFieldSpeed || 0, // Use Leva value or 0
// // // // // // // //          current_torque_scalar: 0.0,
// // // // // // // //     });

// // // // // // // //     // Memoize particle data creation
// // // // // // // //     const particleData = useMemo<{ positions: Float32Array; data: any[] }>(() => {
// // // // // // // //         console.log(`Creating particle data for count: ${vizControls.particleCount}`);
// // // // // // // //         try {
// // // // // // // //              const data = []; const positions = new Float32Array(vizControls.particleCount * 3);
// // // // // // // //              for (let i = 0; i < vizControls.particleCount; i++) {
// // // // // // // //                  const u = Math.random() * Math.PI * 2; const v = Math.random() * Math.PI * 2; const R = vizControls.torusMajorRadius; const r = vizControls.torusMinorRadius; const randR = R + (Math.random() - 0.5) * 0.2; const randr = r * Math.sqrt(Math.random());
// // // // // // // //                  positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u); positions[i * 3 + 1] = randr * Math.sin(v); positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);
// // // // // // // //                  data.push({ u, v, R, r: randr, fieldIndex: 0 }); }
// // // // // // // //              return { positions, data };
// // // // // // // //         } catch (error) { console.error("Error creating particle data:", error); return { positions: new Float32Array(0), data: [] }; }
// // // // // // // //      }, [vizControls.particleCount, vizControls.torusMajorRadius, vizControls.torusMinorRadius]);

// // // // // // // //     // Effect to manage the particle buffer attribute
// // // // // // // //      useEffect(() => {
// // // // // // // //          if (particleGeoRef.current && particleData?.positions) {
// // // // // // // //              const existingAttribute = particleGeoRef.current.getAttribute('position') as THREE.BufferAttribute | undefined;
// // // // // // // //              if (!existingAttribute || existingAttribute.array.length !== particleData.positions.length) {
// // // // // // // //                  particleGeoRef.current.setAttribute('position', new THREE.BufferAttribute(particleData.positions, 3, false));
// // // // // // // //                  console.log(`Particle buffer attribute CREATED/REPLACED (Count: ${particleData.positions.length / 3}).`);
// // // // // // // //              }
// // // // // // // //          } else { if (particleGeoRef.current?.getAttribute('position')) { particleGeoRef.current.deleteAttribute('position'); console.log("Particle buffer attribute removed."); } }
// // // // // // // //      }, [particleData]);

// // // // // // // //     // Main animation loop
// // // // // // // //     useFrame((state, delta) => {
// // // // // // // //         const currentPhysics = physicsState.current;

// // // // // // // //         // V1 Physics Calculations (Scalar Y-axis rotation)
// // // // // // // //         const relative_speed = currentPhysics.effective_field_velocity_scalar - currentPhysics.shell_angular_velocity_scalar;
// // // // // // // //         currentPhysics.current_torque_scalar = resonatorControls.k_drag * resonatorControls.fieldIntensity * relative_speed;
// // // // // // // //         const angular_acceleration = effectiveInertia > 0 ? (currentPhysics.current_torque_scalar / effectiveInertia) : 0;
// // // // // // // //         currentPhysics.shell_angular_velocity_scalar += angular_acceleration * delta;
// // // // // // // //         currentPhysics.shell_angular_velocity_scalar *= (1 - resonatorControls.damping * delta); // Apply damping
// // // // // // // //         currentPhysics.effective_field_velocity_scalar = resonatorControls.baseFieldSpeed + resonatorControls.k_feedback * currentPhysics.shell_angular_velocity_scalar; // Feedback

// // // // // // // //         // Rotate the Group containing the dodecahedron
// // // // // // // //         if (groupRef.current) {
// // // // // // // //              // console.log("Ang Vel:", currentPhysics.shell_angular_velocity_scalar.toFixed(3)); // DEBUG Rotation
// // // // // // // //              groupRef.current.rotation.y += currentPhysics.shell_angular_velocity_scalar * delta;
// // // // // // // //         }

// // // // // // // //         // Update Emissive (Only if using Standard/Physical material - Phong doesn't have it)
// // // // // // // //         // If we stick with Phong, this block won't execute.
// // // // // // // //         if (dodecahedronMeshRef.current) {
// // // // // // // //              const currentMaterial = dodecahedronMeshRef.current.material;
// // // // // // // //              if (currentMaterial instanceof THREE.MeshStandardMaterial || currentMaterial instanceof THREE.MeshPhysicalMaterial) {
// // // // // // // //                  if (currentMaterial.emissive) { /* ... set emissive ... */ }
// // // // // // // //              }
// // // // // // // //         }

// // // // // // // //         // Particle Field Update
// // // // // // // //         if (vizControls.showParticles && particleGeoRef.current?.attributes.position && particlesRef.current && particleData?.data) {
// // // // // // // //             const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// // // // // // // //             const speed = currentPhysics.effective_field_velocity_scalar * resonatorControls.fieldIntensity; // Use speed
// // // // // // // //             const pData = particleData.data;

// // // // // // // //             if (pData.length * 3 === positions.length) { // Check array lengths match
// // // // // // // //                 const pointsMat = particlesRef.current.material as THREE.PointsMaterial;
// // // // // // // //                 if (pointsMat) { pointsMat.size = vizControls.particleSize * (1 + resonatorControls.fieldIntensity * 0.5); }

// // // // // // // //                 for (let i = 0; i < pData.length; i++) {
// // // // // // // //                     const data = pData[i];
// // // // // // // //                     data.u += speed * delta; // Update angle using speed
// // // // // // // //                     const R = data.R; const r = data.r; const u = data.u; const v = data.v;
// // // // // // // //                     positions[i * 3]     = (R + r * Math.cos(v)) * Math.cos(u);
// // // // // // // //                     positions[i * 3 + 1] = r * Math.sin(v);
// // // // // // // //                     positions[i * 3 + 2] = (R + r * Math.cos(v)) * Math.sin(u);
// // // // // // // //                 }
// // // // // // // //                 // Mark buffer attribute for update
// // // // // // // //                 particleGeoRef.current.attributes.position.needsUpdate = true;
// // // // // // // //             } else { console.warn("Mismatch between particle data length and buffer length in useFrame."); }
// // // // // // // //         }
// // // // // // // //     });

// // // // // // // //     return (
// // // // // // // //         // Group centers the object and handles rotation
// // // // // // // //         <group ref={groupRef}>
// // // // // // // //             <RomanDodecahedron
// // // // // // // //                 ref={dodecahedronMeshRef} // Ref to the mesh itself
// // // // // // // //                 outerRadius={finalShellParams.outerRadius}
// // // // // // // //                 thickness={finalShellParams.thickness}
// // // // // // // //                 holeBaseDiameter={finalShellParams.holeBaseDiameter}
// // // // // // // //                 holeRatio={finalShellParams.holeRatio}
// // // // // // // //                 noduleRadius={finalShellParams.noduleRadius}
// // // // // // // //                 // No material prop passed, will use internal default (Phong)
// // // // // // // //                 wireframe={vizControls.wireframe} // Control wireframe via Leva
// // // // // // // //                 castShadow receiveShadow
// // // // // // // //                 // Mesh position/rotation is relative to the group (should be 0)
// // // // // // // //                 position={[0,0,0]}
// // // // // // // //                 rotation={[0,0,0]}
// // // // // // // //             />
// // // // // // // //             {/* Point light inside the group to illuminate interior */}
// // // // // // // //             <pointLight intensity={0.5} color={0xffddcc} distance={3} decay={1.5} position={[0, 0, 0]} name="InternalLight" />

// // // // // // // //             {/* Particles are siblings of the group, not children */}
// // // // // // // //             {vizControls.showParticles && (
// // // // // // // //                  <points ref={particlesRef} name="FieldParticles">
// // // // // // // //                      <bufferGeometry ref={particleGeoRef} />
// // // // // // // //                      <pointsMaterial
// // // // // // // //                          name="ParticleMaterial" color={0x00ffff}
// // // // // // // //                          size={vizControls.particleSize} transparent opacity={0.7}
// // // // // // // //                          blending={THREE.AdditiveBlending}
// // // // // // // //                          sizeAttenuation={false} // Keep false for consistent size
// // // // // // // //                          map={null}
// // // // // // // //                      />
// // // // // // // //                  </points>
// // // // // // // //             )}
// // // // // // // //         </group>
// // // // // // // //     );
// // // // // // // // };

// // // // // // // // // --- Scene Component ---
// // // // // // // // const TemporalResonatorScene: React.FC = () => {
// // // // // // // //      return (
// // // // // // // //         <>
// // // // // // // //             {/* Leva GUI Panel */}
// // // // // // // //             <Leva collapsed={false} titleBar={{ title: 'Controls' }} />
// // // // // // // //             {/* Main Canvas */}
// // // // // // // //             <Canvas
// // // // // // // //                  style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', background: '#111122', zIndex: 0 }}
// // // // // // // //                  camera={{ position: [3, 3, 5], fov: 75 }}
// // // // // // // //                  gl={{ antialias: true }} shadows // Enable shadows
// // // // // // // //             >
// // // // // // // //                  {/* Lighting Setup */}
// // // // // // // //                  <ambientLight intensity={0.4} />
// // // // // // // //                  <hemisphereLight groundColor={0x404040} intensity={0.8} />
// // // // // // // //                  <directionalLight
// // // // // // // //                      position={[5, 10, 7.5]} intensity={1.2} castShadow
// // // // // // // //                      shadow-mapSize-width={1024} shadow-mapSize-height={1024}
// // // // // // // //                      shadow-camera-far={25} shadow-camera-left={-10} shadow-camera-right={10}
// // // // // // // //                      shadow-camera-top={10} shadow-camera-bottom={-10}
// // // // // // // //                  />
// // // // // // // //                  {/* Error Boundary and Suspense for loading */}
// // // // // // // //                  <ErrorBoundary>
// // // // // // // //                      <Suspense fallback={<LoadingPlaceholder />}>
// // // // // // // //                           <ResonatorSimulation />
// // // // // // // //                      </Suspense>
// // // // // // // //                  </ErrorBoundary>
// // // // // // // //                  {/* Camera Controls */}
// // // // // // // //                  <Controls />
// // // // // // // //                  {/* Optional Debug Helpers */}
// // // // // // // //                  {/* <axesHelper args={[5]} /> */}
// // // // // // // //                  {/* <gridHelper args={[10, 10]} /> */}
// // // // // // // //             </Canvas>
// // // // // // // //         </>
// // // // // // // //      );
// // // // // // // //  };

// // // // // // // // // --- Loading Placeholder Component ---
// // // // // // // // const LoadingPlaceholder: React.FC = () => {
// // // // // // // //     // Simple visual indicator while CSG calculates
// // // // // // // //     return (
// // // // // // // //         <mesh>
// // // // // // // //             <boxGeometry args={[0.1, 0.1, 0.1]} />
// // // // // // // //             <meshBasicMaterial color="orange" wireframe attach="material" />
// // // // // // // //         </mesh>
// // // // // // // //     );
// // // // // // // // };

// // // // // // // // export default TemporalResonatorScene;

// // // // // // // // // === Full Code: TemporalResonatorScene_V2_CSG_Fixes_12_Complete.tsx ===

// // // // // // // // import React, { useRef, useEffect, useMemo, Suspense, useState } from 'react';
// // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // // import * as THREE from 'three';
// // // // // // // // import ErrorBoundary from './errorBoundary'; // Adjust path if needed
// // // // // // // // import { useControls, Leva } from 'leva';
// // // // // // // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// // // // // // // // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // // // // // // // // --- BVH / CSG Setup ---
// // // // // // // // try {
// // // // // // // //     // Assign prototypes for BVH computation
// // // // // // // //     (THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
// // // // // // // //     (THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
// // // // // // // //     (THREE.Mesh.prototype as any).raycast = acceleratedRaycast;
// // // // // // // // } catch (error) {
// // // // // // // //     console.error("Error setting up BVH extensions:", error);
// // // // // // // // }
// // // // // // // // const csgEvaluator = new Evaluator();
// // // // // // // // csgEvaluator.useGroups = true; // Use groups for efficiency with multiple operations
// // // // // // // // extend({ OrbitControls }); // Extend R3F for OrbitControls

// // // // // // // // // --- Constants ---
// // // // // // // // const PHI = (1 + Math.sqrt(5)) / 2;
// // // // // // // // const INV_PHI = 1 / PHI;

// // // // // // // // // --- Helper: Get Dodecahedron Math Data ---
// // // // // // // // function getDodecahedronData(radius: number): { vertices: THREE.Vector3[]; faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] } {
// // // // // // // //     console.log(`--- Calculating Dodecahedron Data for radius: ${radius} ---`);
// // // // // // // //     // Validate input radius
// // // // // // // //     if (typeof radius !== 'number' || radius <= 0 || !Number.isFinite(radius)) {
// // // // // // // //         console.error("!!! Invalid radius passed to getDodecahedronData:", radius);
// // // // // // // //         throw new Error("Invalid radius provided to getDodecahedronData");
// // // // // // // //     }

// // // // // // // //     // Use a Map to ensure vertex uniqueness based on precise coordinates
// // // // // // // //     const uniqueVerticesMap = new Map<string, THREE.Vector3>();
// // // // // // // //     // Define base coordinates for dodecahedron vertices
// // // // // // // //     const coords = [
// // // // // // // //         [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1], [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
// // // // // // // //         [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI],
// // // // // // // //         [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI],
// // // // // // // //         [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0]
// // // // // // // //     ];
// // // // // // // //     // Calculate the scaling factor to match the desired radius
// // // // // // // //     const distOriginToVertex = Math.sqrt(PHI * PHI + INV_PHI * INV_PHI);
// // // // // // // //     const scale = radius / distOriginToVertex;
// // // // // // // //     if (!Number.isFinite(scale) || scale === 0) { throw new Error("Invalid scale factor"); }

// // // // // // // //     // Populate the map with unique, scaled vertices
// // // // // // // //     coords.forEach(v => {
// // // // // // // //         const x = v[0] * scale; const y = v[1] * scale; const z = v[2] * scale;
// // // // // // // //         const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`; // Key for uniqueness
// // // // // // // //         if (!uniqueVerticesMap.has(key)) { uniqueVerticesMap.set(key, new THREE.Vector3(x, y, z)); }
// // // // // // // //     });
// // // // // // // //     const vertices = Array.from(uniqueVerticesMap.values()); // Get unique vertices

// // // // // // // //     // Calculate face centers and normals using the dual icosahedron's vertices
// // // // // // // //     const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
// // // // // // // //     const icoVerts = [ [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1] ];
// // // // // // // //     // Estimate face center distance relative to the vertex distance (adjust factor if needed)
// // // // // // // //     const faceCenterDist = radius * 1.53 / distOriginToVertex;
// // // // // // // //     icoVerts.forEach(v => {
// // // // // // // //         const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize();
// // // // // // // //         const center = normal.clone().multiplyScalar(faceCenterDist);
// // // // // // // //         faceData.push({ center, normal });
// // // // // // // //     });

// // // // // // // //     // Final validation of generated data counts
// // // // // // // //     if (vertices.length !== 20 || faceData.length !== 12) {
// // // // // // // //         console.error("!!! Vertex/Face generation failed. Vertices:", vertices, "Faces:", faceData);
// // // // // // // //         throw new Error(`Incorrect math data count: ${vertices.length} vertices, ${faceData.length} faces`);
// // // // // // // //     }
// // // // // // // //     console.log(`--- Generated ${vertices.length} vertices, ${faceData.length} faces. ---`);
// // // // // // // //     return { vertices, faceData };
// // // // // // // // }

// // // // // // // // // --- Controls Component ---
// // // // // // // // const Controls: React.FC = () => {
// // // // // // // //      const { camera, gl } = useThree();
// // // // // // // //      const controlsRef = useRef<OrbitControls>(null);
// // // // // // // //      useEffect(() => {
// // // // // // // //          const controls = new OrbitControls(camera, gl.domElement);
// // // // // // // //          controls.enableDamping = true;
// // // // // // // //          controls.target.set(0, 0, 0); // Target the origin (where the group is)
// // // // // // // //          (controlsRef as React.MutableRefObject<OrbitControls>).current = controls;
// // // // // // // //          return () => { controls.dispose(); }; // Cleanup on unmount
// // // // // // // //      }, [camera, gl]);
// // // // // // // //      // Update controls in the animation loop for damping
// // // // // // // //      useFrame(() => { controlsRef.current?.update(); });
// // // // // // // //      return null;
// // // // // // // // };

// // // // // // // // // --- Roman Dodecahedron CSG Component ---
// // // // // // // // interface RomanDodecahedronProps {
// // // // // // // //     outerRadius: number; thickness: number; holeBaseDiameter: number;
// // // // // // // //     holeRatio: number; noduleRadius: number; material?: THREE.Material;
// // // // // // // //     wireframe?: boolean; [key: string]: any;
// // // // // // // // }
// // // // // // // // const RomanDodecahedron: React.FC<RomanDodecahedronProps> = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
// // // // // // // //     ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, wireframe = false, ...props }, ref) => {

// // // // // // // //     // State to hold the geometry calculated after mount/prop changes
// // // // // // // //     const [calculatedGeometry, setCalculatedGeometry] = useState<THREE.BufferGeometry | null>(null);

// // // // // // // //     // Effect to perform CSG calculation
// // // // // // // //     useEffect(() => {
// // // // // // // //         console.log(`useEffect Check: outerRadius=${outerRadius}, thickness=${thickness}, ...`);
// // // // // // // //         // Guard against invalid props (potentially from initial Leva state)
// // // // // // // //         if ( typeof outerRadius !== 'number' || outerRadius <= 0 || !Number.isFinite(outerRadius) || typeof thickness !== 'number' || thickness <= 0 || !Number.isFinite(thickness) || typeof holeBaseDiameter !== 'number' || holeBaseDiameter <= 0 || !Number.isFinite(holeBaseDiameter) || typeof holeRatio !== 'number' || holeRatio <= 0 || !Number.isFinite(holeRatio) || typeof noduleRadius !== 'number' || noduleRadius <= 0 || !Number.isFinite(noduleRadius) ) {
// // // // // // // //             console.log(`--> Skipping CSG calculation in useEffect: Invalid props detected.`);
// // // // // // // //             setCalculatedGeometry(null); // Ensure geometry is null if props invalid
// // // // // // // //             return; // Exit effect
// // // // // // // //         }

// // // // // // // //         console.log(`Calculating CSG Geometry in useEffect for outerRadius: ${outerRadius}`);
// // // // // // // //         let geometry: THREE.BufferGeometry | null = null;
// // // // // // // //         const detailLevel = 1; // Keep low detail for base shapes for performance
// // // // // // // //         let tempGeoList: THREE.BufferGeometry[] = []; // Track temp geos for disposal

// // // // // // // //         try {
// // // // // // // //             // Get mathematically correct positions/normals
// // // // // // // //             const { vertices: mathVertices, faceData: mathFaceData } = getDodecahedronData(outerRadius);

// // // // // // // //             // Create base shell
// // // // // // // //             const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, detailLevel); outerDodecGeo.computeBoundsTree(); tempGeoList.push(outerDodecGeo);
// // // // // // // //             const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, detailLevel); innerDodecGeo.computeBoundsTree(); tempGeoList.push(innerDodecGeo);
// // // // // // // //             let outerBrush = new Brush(outerDodecGeo); let innerBrush = new Brush(innerDodecGeo); innerBrush.updateMatrixWorld();
// // // // // // // //             let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);

// // // // // // // //             // Create and subtract holes
// // // // // // // //             const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * (holeRatio ** i));
// // // // // // // //             const cylinderHeight = thickness * 3.1; // Ensure cylinder goes through shell
// // // // // // // //             const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16); cylinderGeo.rotateX(Math.PI / 2); cylinderGeo.computeBoundsTree(); tempGeoList.push(cylinderGeo);
// // // // // // // //             const tempQuat = new THREE.Quaternion();
// // // // // // // //             mathFaceData.forEach((face, index) => {
// // // // // // // //                 const holeRadius = holeDiameters[index] / 2; if (!holeRadius || holeRadius <= 0) return;
// // // // // // // //                 const holeBrush = new Brush(cylinderGeo); holeBrush.scale.set(holeRadius, holeRadius, 1);
// // // // // // // //                 tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal); holeBrush.quaternion.copy(tempQuat);
// // // // // // // //                 holeBrush.position.copy(face.center); holeBrush.updateMatrixWorld();
// // // // // // // //                 shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION);
// // // // // // // //             });

// // // // // // // //             // Create and add nodules
// // // // // // // //             const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6); noduleGeo.computeBoundsTree(); tempGeoList.push(noduleGeo);
// // // // // // // //             mathVertices.forEach(vertexPos => {
// // // // // // // //                 const noduleBrush = new Brush(noduleGeo); noduleBrush.position.copy(vertexPos);
// // // // // // // //                 noduleBrush.updateMatrixWorld(); shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
// // // // // // // //             });

// // // // // // // //             // Finalize geometry
// // // // // // // //             geometry = shellBrush.geometry;
// // // // // // // //             geometry.computeVertexNormals(); // Crucial for lighting!
// // // // // // // //             geometry.center(); // Center the final composite shape
// // // // // // // //             console.log("CSG Calculation Complete.");

// // // // // // // //         } catch (error) {
// // // // // // // //             console.error("CSG Error in useEffect:", error);
// // // // // // // //             geometry = null; // Ensure null on error
// // // // // // // //         } finally {
// // // // // // // //             // Clean up intermediate geometries used for CSG brushes
// // // // // // // //             tempGeoList.forEach(g => g.dispose());
// // // // // // // //             console.log(`Disposed ${tempGeoList.length} temporary CSG geometries.`);
// // // // // // // //         }

// // // // // // // //         // Update state with the calculated geometry (or null)
// // // // // // // //         setCalculatedGeometry(geometry);

// // // // // // // //         // Effect cleanup function: Dispose the *final* geometry when effect re-runs or unmounts
// // // // // // // //         return () => {
// // // // // // // //             if (geometry && typeof geometry.dispose === 'function') {
// // // // // // // //                 geometry.dispose();
// // // // // // // //                 console.log("Disposed final CSG geometry from useEffect cleanup.");
// // // // // // // //             }
// // // // // // // //         };
// // // // // // // //     }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]); // Dependencies

// // // // // // // //     // Memoize the material based on props
// // // // // // // //     const meshMaterial = useMemo(() => {
// // // // // // // //         let baseMaterial: THREE.Material;

// // // // // // // //         // --- DIAGNOSTIC: Uncomment next line to use NormalMaterial ---
// // // // // // // //         // return new THREE.MeshNormalMaterial({ name:"NormalMat", side: THREE.DoubleSide, wireframe: wireframe });

// // // // // // // //         // Use provided material or default to Phong for smoother shading
// // // // // // // //         if (material instanceof THREE.Material) {
// // // // // // // //              baseMaterial = material.clone(); // Clone if possible
// // // // // // // //              baseMaterial.side = THREE.DoubleSide;
// // // // // // // //              console.log("Using provided material clone.");
// // // // // // // //         } else {
// // // // // // // //             console.log("Creating default MeshPhongMaterial.");
// // // // // // // //             baseMaterial = new THREE.MeshPhongMaterial({
// // // // // // // //                 color: 0xB87333, side: THREE.DoubleSide, specular: 0x444444, shininess: 40, name: "DefaultPhongCopper"
// // // // // // // //              });
// // // // // // // //         }

// // // // // // // //         // Apply wireframe if property exists (using type guard)
// // // // // // // //         if ('wireframe' in baseMaterial) {
// // // // // // // //             (baseMaterial as any).wireframe = wireframe;
// // // // // // // //         }
// // // // // // // //         // Ensure DoubleSide is set
// // // // // // // //         baseMaterial.side = THREE.DoubleSide;

// // // // // // // //         return baseMaterial;
// // // // // // // //     }, [material, wireframe]); // Recreate if base material or wireframe changes

// // // // // // // //     // Effect to dispose the memoized material
// // // // // // // //     useEffect(() => { return () => { meshMaterial?.dispose(); } }, [meshMaterial]);

// // // // // // // //     // Don't render if geometry calculation failed or hasn't completed
// // // // // // // //     if (!calculatedGeometry) { return null; }

// // // // // // // //     // Render the mesh using calculated geometry and memoized material
// // // // // // // //     return <mesh ref={ref} geometry={calculatedGeometry} material={meshMaterial} {...props} />;
// // // // // // // // });

// // // // // // // // // --- Physics State Interface ---
// // // // // // // // interface PhysicsState {
// // // // // // // //     shell_angular_velocity_scalar: number;
// // // // // // // //     effective_field_velocity_scalar: number;
// // // // // // // //     current_torque_scalar: number;
// // // // // // // // }

// // // // // // // // // --- Main Simulation Component ---
// // // // // // // // const ResonatorSimulation: React.FC = () => {
// // // // // // // //     // Refs for scene objects
// // // // // // // //     const groupRef = useRef<THREE.Group>(null!); // Group to handle rotation/centering
// // // // // // // //     const dodecahedronMeshRef = useRef<THREE.Mesh>(null!); // Ref to the actual CSG mesh
// // // // // // // //     const particlesRef = useRef<THREE.Points>(null!);
// // // // // // // //     const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // // // // //     // Leva controls setup
// // // // // // // //     const resonatorControls = useControls('Resonator Controls', { baseFieldSpeed: 1.0, fieldIntensity: 1.0, k_drag: 0.5, inertiaScale: 1.0, damping: 0.1, k_feedback: -0.2 });
// // // // // // // //     const shellControls = useControls('Shell Geometry', { outerRadius: 1.0, thickness: 0.05, holeBaseDiameter: 0.1, holeRatio: 1.2, noduleRadius: 0.1 });
// // // // // // // //     const vizControls = useControls('Visualization', { particleCount: 1000, particleSize: 0.05, torusMajorRadius: 1.5, torusMinorRadius: 0.5, showParticles: true, wireframe: false });

// // // // // // // //     // Ensure shell parameters are valid numbers, falling back to defaults
// // // // // // // //     const defaultShellParams = useMemo(() => ({ outerRadius: 1.0, thickness: 0.05, holeBaseDiameter: 0.1, holeRatio: 1.2, noduleRadius: 0.1 }), []);
// // // // // // // //     const finalShellParams = useMemo(() => ({
// // // // // // // //         outerRadius: (typeof shellControls.outerRadius === 'number' && Number.isFinite(shellControls.outerRadius)) ? shellControls.outerRadius : defaultShellParams.outerRadius,
// // // // // // // //         thickness: (typeof shellControls.thickness === 'number' && Number.isFinite(shellControls.thickness)) ? shellControls.thickness : defaultShellParams.thickness,
// // // // // // // //         holeBaseDiameter: (typeof shellControls.holeBaseDiameter === 'number' && Number.isFinite(shellControls.holeBaseDiameter)) ? shellControls.holeBaseDiameter : defaultShellParams.holeBaseDiameter,
// // // // // // // //         holeRatio: (typeof shellControls.holeRatio === 'number' && Number.isFinite(shellControls.holeRatio)) ? shellControls.holeRatio : defaultShellParams.holeRatio,
// // // // // // // //         noduleRadius: (typeof shellControls.noduleRadius === 'number' && Number.isFinite(shellControls.noduleRadius)) ? shellControls.noduleRadius : defaultShellParams.noduleRadius,
// // // // // // // //     }), [shellControls, defaultShellParams]);

// // // // // // // //     // Calculate effective inertia
// // // // // // // //     const effectiveInertia = useMemo(() => resonatorControls.inertiaScale * (finalShellParams.outerRadius ** 5 - (finalShellParams.outerRadius - finalShellParams.thickness) ** 5) / finalShellParams.outerRadius ** 5, [resonatorControls.inertiaScale, finalShellParams.outerRadius, finalShellParams.thickness]);

// // // // // // // //     // Initialize physics state using a ref
// // // // // // // //     const physicsState = useRef<PhysicsState>({
// // // // // // // //          shell_angular_velocity_scalar: 0.0,
// // // // // // // //          effective_field_velocity_scalar: resonatorControls.baseFieldSpeed || 0, // Use Leva value or 0
// // // // // // // //          current_torque_scalar: 0.0,
// // // // // // // //     });

// // // // // // // //     // Memoize particle data creation
// // // // // // // //     const particleData = useMemo<{ positions: Float32Array; data: any[] }>(() => {
// // // // // // // //         console.log(`Creating particle data for count: ${vizControls.particleCount}`);
// // // // // // // //         try {
// // // // // // // //              const data = []; const positions = new Float32Array(vizControls.particleCount * 3);
// // // // // // // //              for (let i = 0; i < vizControls.particleCount; i++) { /* ... populate particles ... */
// // // // // // // //                  const u = Math.random() * Math.PI * 2; const v = Math.random() * Math.PI * 2; const R = vizControls.torusMajorRadius; const r = vizControls.torusMinorRadius; const randR = R + (Math.random() - 0.5) * 0.2; const randr = r * Math.sqrt(Math.random());
// // // // // // // //                  positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u); positions[i * 3 + 1] = randr * Math.sin(v); positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);
// // // // // // // //                  data.push({ u, v, R, r: randr, fieldIndex: 0 }); }
// // // // // // // //              return { positions, data };
// // // // // // // //         } catch (error) { console.error("Error creating particle data:", error); return { positions: new Float32Array(0), data: [] }; }
// // // // // // // //      }, [vizControls.particleCount, vizControls.torusMajorRadius, vizControls.torusMinorRadius]);

// // // // // // // //     // Effect to manage the particle buffer attribute
// // // // // // // //      useEffect(() => {
// // // // // // // //          if (particleGeoRef.current && particleData?.positions) {
// // // // // // // //              const existingAttribute = particleGeoRef.current.getAttribute('position') as THREE.BufferAttribute | undefined;
// // // // // // // //              if (!existingAttribute || existingAttribute.array.length !== particleData.positions.length) {
// // // // // // // //                  particleGeoRef.current.setAttribute('position', new THREE.BufferAttribute(particleData.positions, 3, false));
// // // // // // // //                  console.log(`Particle buffer attribute CREATED/REPLACED (Count: ${particleData.positions.length / 3}).`);
// // // // // // // //              }
// // // // // // // //          } else { if (particleGeoRef.current?.getAttribute('position')) { particleGeoRef.current.deleteAttribute('position'); console.log("Particle buffer attribute removed."); } }
// // // // // // // //      }, [particleData]);

// // // // // // // //     // Main animation loop
// // // // // // // //     useFrame((state, delta) => {
// // // // // // // //         const currentPhysics = physicsState.current;

// // // // // // // //         // V1 Physics Calculations (Scalar Y-axis rotation)
// // // // // // // //         const relative_speed = currentPhysics.effective_field_velocity_scalar - currentPhysics.shell_angular_velocity_scalar;
// // // // // // // //         currentPhysics.current_torque_scalar = resonatorControls.k_drag * resonatorControls.fieldIntensity * relative_speed;
// // // // // // // //         const angular_acceleration = effectiveInertia > 0 ? (currentPhysics.current_torque_scalar / effectiveInertia) : 0;
// // // // // // // //         currentPhysics.shell_angular_velocity_scalar += angular_acceleration * delta;
// // // // // // // //         currentPhysics.shell_angular_velocity_scalar *= (1 - resonatorControls.damping * delta); // Apply damping
// // // // // // // //         currentPhysics.effective_field_velocity_scalar = resonatorControls.baseFieldSpeed + resonatorControls.k_feedback * currentPhysics.shell_angular_velocity_scalar; // Feedback

// // // // // // // //         // Rotate the Group containing the dodecahedron
// // // // // // // //         if (groupRef.current) {
// // // // // // // //              // console.log("Ang Vel:", currentPhysics.shell_angular_velocity_scalar.toFixed(3)); // DEBUG Rotation
// // // // // // // //              groupRef.current.rotation.y += currentPhysics.shell_angular_velocity_scalar * delta;
// // // // // // // //         }

// // // // // // // //         // Update Emissive (Only if using Standard/Physical material)
// // // // // // // //         if (dodecahedronMeshRef.current) {
// // // // // // // //              const currentMaterial = dodecahedronMeshRef.current.material;
// // // // // // // //              if (currentMaterial instanceof THREE.MeshStandardMaterial || currentMaterial instanceof THREE.MeshPhysicalMaterial) {
// // // // // // // //                  if (currentMaterial.emissive) {
// // // // // // // //                      const maxTorqueEst = resonatorControls.k_drag * resonatorControls.fieldIntensity * (Math.abs(resonatorControls.baseFieldSpeed) * 1.5 + 1);
// // // // // // // //                      const emissionStrength = Math.min(Math.abs(currentPhysics.current_torque_scalar) / (maxTorqueEst + 0.01), 1.0);
// // // // // // // //                      currentMaterial.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5);
// // // // // // // //                  }
// // // // // // // //              }
// // // // // // // //         }

// // // // // // // //         // Particle Field Update
// // // // // // // //         if (vizControls.showParticles && particleGeoRef.current?.attributes.position && particlesRef.current && particleData?.data) {
// // // // // // // //             const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// // // // // // // //             const speed = currentPhysics.effective_field_velocity_scalar * resonatorControls.fieldIntensity; // Use speed
// // // // // // // //             const pData = particleData.data;

// // // // // // // //             if (pData.length * 3 === positions.length) { // Check array lengths match
// // // // // // // //                 const pointsMat = particlesRef.current.material as THREE.PointsMaterial;
// // // // // // // //                 if (pointsMat) { pointsMat.size = vizControls.particleSize * (1 + resonatorControls.fieldIntensity * 0.5); }

// // // // // // // //                 for (let i = 0; i < pData.length; i++) {
// // // // // // // //                     const data = pData[i];
// // // // // // // //                     data.u += speed * delta; // Update angle using speed
// // // // // // // //                     const R = data.R; const r = data.r; const u = data.u; const v = data.v;
// // // // // // // //                     positions[i * 3]     = (R + r * Math.cos(v)) * Math.cos(u);
// // // // // // // //                     positions[i * 3 + 1] = r * Math.sin(v);
// // // // // // // //                     positions[i * 3 + 2] = (R + r * Math.cos(v)) * Math.sin(u);
// // // // // // // //                 }
// // // // // // // //                 // Mark buffer attribute for update
// // // // // // // //                 particleGeoRef.current.attributes.position.needsUpdate = true;
// // // // // // // //             } else { console.warn("Mismatch between particle data length and buffer length in useFrame."); }
// // // // // // // //         }
// // // // // // // //     });

// // // // // // // //     // No need to memoize copperMaterial here, RomanDodecahedron handles its default/passed material

// // // // // // // //     return (
// // // // // // // //         // Group centers the object and handles rotation
// // // // // // // //         <group ref={groupRef}>
// // // // // // // //             <RomanDodecahedron
// // // // // // // //                 ref={dodecahedronMeshRef} // Ref to the mesh itself
// // // // // // // //                 outerRadius={finalShellParams.outerRadius}
// // // // // // // //                 thickness={finalShellParams.thickness}
// // // // // // // //                 holeBaseDiameter={finalShellParams.holeBaseDiameter}
// // // // // // // //                 holeRatio={finalShellParams.holeRatio}
// // // // // // // //                 noduleRadius={finalShellParams.noduleRadius}
// // // // // // // //                 // No material prop passed, will use internal default (Phong)
// // // // // // // //                 wireframe={vizControls.wireframe} // Control wireframe via Leva
// // // // // // // //                 castShadow receiveShadow
// // // // // // // //                 // Mesh position/rotation is relative to the group (should be 0)
// // // // // // // //                 position={[0,0,0]}
// // // // // // // //                 rotation={[0,0,0]}
// // // // // // // //             />
// // // // // // // //             {/* Point light inside the group to illuminate interior */}
// // // // // // // //             <pointLight intensity={0.5} color={0xffddcc} distance={3} decay={1.5} position={[0, 0, 0]} name="InternalLight" />

// // // // // // // //             {/* Particles are siblings of the group, not children */}
// // // // // // // //             {vizControls.showParticles && (
// // // // // // // //                  <points ref={particlesRef} name="FieldParticles">
// // // // // // // //                      <bufferGeometry ref={particleGeoRef} />
// // // // // // // //                      <pointsMaterial
// // // // // // // //                          name="ParticleMaterial" color={0x00ffff}
// // // // // // // //                          size={vizControls.particleSize} transparent opacity={0.7}
// // // // // // // //                          blending={THREE.AdditiveBlending}
// // // // // // // //                          sizeAttenuation={false} // Keep false for consistent size
// // // // // // // //                          map={null}
// // // // // // // //                      />
// // // // // // // //                  </points>
// // // // // // // //             )}
// // // // // // // //         </group>
// // // // // // // //     );
// // // // // // // // };

// // // // // // // // // --- Scene Component ---
// // // // // // // // const TemporalResonatorScene: React.FC = () => {
// // // // // // // //      return (
// // // // // // // //         <>
// // // // // // // //             {/* Leva GUI Panel */}
// // // // // // // //             <Leva collapsed={false} titleBar={{ title: 'Controls' }} />
// // // // // // // //             {/* Main Canvas */}
// // // // // // // //             <Canvas
// // // // // // // //                  style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', background: '#111122', zIndex: 0 }}
// // // // // // // //                  camera={{ position: [3, 3, 5], fov: 75 }}
// // // // // // // //                  gl={{ antialias: true }} shadows // Enable shadows
// // // // // // // //             >
// // // // // // // //                  {/* Lighting Setup */}
// // // // // // // //                  <ambientLight intensity={0.4} />
// // // // // // // //                  <hemisphereLight groundColor={0x404040} intensity={0.8} />
// // // // // // // //                  <directionalLight
// // // // // // // //                      position={[5, 10, 7.5]} intensity={1.2} castShadow
// // // // // // // //                      shadow-mapSize-width={1024} shadow-mapSize-height={1024}
// // // // // // // //                      shadow-camera-far={25} shadow-camera-left={-10} shadow-camera-right={10}
// // // // // // // //                      shadow-camera-top={10} shadow-camera-bottom={-10}
// // // // // // // //                  />
// // // // // // // //                  {/* Error Boundary and Suspense for loading */}
// // // // // // // //                  <ErrorBoundary>
// // // // // // // //                      <Suspense fallback={<LoadingPlaceholder />}>
// // // // // // // //                           <ResonatorSimulation />
// // // // // // // //                      </Suspense>
// // // // // // // //                  </ErrorBoundary>
// // // // // // // //                  {/* Camera Controls */}
// // // // // // // //                  <Controls />
// // // // // // // //                  {/* Optional Debug Helpers */}
// // // // // // // //                  {/* <axesHelper args={[5]} /> */}
// // // // // // // //                  {/* <gridHelper args={[10, 10]} /> */}
// // // // // // // //             </Canvas>
// // // // // // // //         </>
// // // // // // // //      );
// // // // // // // //  };

// // // // // // // // // --- Loading Placeholder Component ---
// // // // // // // // const LoadingPlaceholder: React.FC = () => {
// // // // // // // //     // Simple visual indicator while CSG calculates
// // // // // // // //     return (
// // // // // // // //         <mesh>
// // // // // // // //             <boxGeometry args={[0.1, 0.1, 0.1]} />
// // // // // // // //             <meshBasicMaterial color="orange" wireframe attach="material" />
// // // // // // // //         </mesh>
// // // // // // // //     );
// // // // // // // // };

// // // // // // // // export default TemporalResonatorScene;

// // // // // // // // // // === Full Code: TemporalResonatorScene_V2_CSG_Fixes_11.tsx ===

// // // // // // // // // import React, { useRef, useEffect, useMemo, Suspense, useState } from 'react';
// // // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // // // import * as THREE from 'three';
// // // // // // // // // import ErrorBoundary from './errorBoundary'; // Adjust path if needed
// // // // // // // // // import { useControls, Leva } from 'leva';
// // // // // // // // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// // // // // // // // // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // // // // // // // // // --- BVH / CSG Setup ---
// // // // // // // // // try {
// // // // // // // // //     THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
// // // // // // // // //     THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
// // // // // // // // //     THREE.Mesh.prototype.raycast = acceleratedRaycast;
// // // // // // // // // } catch (error) { console.error("Error setting up BVH extensions:", error); }
// // // // // // // // // const csgEvaluator = new Evaluator();
// // // // // // // // // csgEvaluator.useGroups = true;
// // // // // // // // // extend({ OrbitControls });

// // // // // // // // // // --- Constants ---
// // // // // // // // // const PHI = (1 + Math.sqrt(5)) / 2;
// // // // // // // // // const INV_PHI = 1 / PHI;

// // // // // // // // // // --- Helper: Get Dodecahedron Math Data ---
// // // // // // // // // function getDodecahedronData(radius: number): { vertices: THREE.Vector3[]; faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] } {
// // // // // // // // //     // --- Unchanged from previous working version ---
// // // // // // // // //     console.log(`--- Calculating Dodecahedron Data for radius: ${radius} ---`);
// // // // // // // // //     if (typeof radius !== 'number' || radius <= 0 || !Number.isFinite(radius)) { throw new Error("Invalid radius"); }
// // // // // // // // //     const uniqueVerticesMap = new Map<string, THREE.Vector3>();
// // // // // // // // //     const coords = [ [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1], [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1], [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI], [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI], [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0] ];
// // // // // // // // //     const distOriginToVertex = Math.sqrt(PHI * PHI + INV_PHI * INV_PHI);
// // // // // // // // //     const scale = radius / distOriginToVertex;
// // // // // // // // //     if (!Number.isFinite(scale) || scale === 0) { throw new Error("Invalid scale factor"); }
// // // // // // // // //     coords.forEach(v => { const x = v[0] * scale; const y = v[1] * scale; const z = v[2] * scale; const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`; if (!uniqueVerticesMap.has(key)) { uniqueVerticesMap.set(key, new THREE.Vector3(x, y, z)); } });
// // // // // // // // //     const vertices = Array.from(uniqueVerticesMap.values());
// // // // // // // // //     const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
// // // // // // // // //     const icoVerts = [ [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1] ];
// // // // // // // // //     const faceCenterDist = radius * 1.53 / distOriginToVertex;
// // // // // // // // //     icoVerts.forEach(v => { const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize(); const center = normal.clone().multiplyScalar(faceCenterDist); faceData.push({ center, normal }); });
// // // // // // // // //     if (vertices.length !== 20 || faceData.length !== 12) { console.error("!!! Vertex/Face generation failed. Vertices:", vertices, "Faces:", faceData); throw new Error(`Incorrect math data count: ${vertices.length} vertices, ${faceData.length} faces`); }
// // // // // // // // //     console.log(`--- Generated ${vertices.length} vertices, ${faceData.length} faces. ---`);
// // // // // // // // //     return { vertices, faceData };
// // // // // // // // // }

// // // // // // // // // // --- Controls Component ---
// // // // // // // // // const Controls: React.FC = () => {
// // // // // // // // //      const { camera, gl } = useThree(); const controlsRef = useRef<OrbitControls>(null);
// // // // // // // // //      useEffect(() => {
// // // // // // // // //          const controls = new OrbitControls(camera, gl.domElement);
// // // // // // // // //          controls.enableDamping = true;
// // // // // // // // //          // Target the origin [0,0,0] which is where our group will be
// // // // // // // // //          controls.target.set(0, 0, 0);
// // // // // // // // //          (controlsRef as React.MutableRefObject<OrbitControls>).current = controls;
// // // // // // // // //          return () => { controls.dispose(); };
// // // // // // // // //      }, [camera, gl]);
// // // // // // // // //      useFrame(() => { controlsRef.current?.update(); });
// // // // // // // // //      return null;
// // // // // // // // // };

// // // // // // // // // // --- Roman Dodecahedron CSG Component ---
// // // // // // // // // interface RomanDodecahedronProps { outerRadius: number; thickness: number; holeBaseDiameter: number; holeRatio: number; noduleRadius: number; material?: THREE.Material; wireframe?: boolean; [key: string]: any; }
// // // // // // // // // const RomanDodecahedron: React.FC<RomanDodecahedronProps> = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
// // // // // // // // //     ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, wireframe = false, ...props }, ref) => {
// // // // // // // // //     const [calculatedGeometry, setCalculatedGeometry] = useState<THREE.BufferGeometry | null>(null);

// // // // // // // // //     useEffect(() => {
// // // // // // // // //         console.log(`useEffect Check: outerRadius=${outerRadius} (${typeof outerRadius}), thickness=${thickness}, ...`);
// // // // // // // // //         if ( typeof outerRadius !== 'number' || /* ... guards ... */ typeof noduleRadius !== 'number' || noduleRadius <= 0 || !Number.isFinite(noduleRadius) ) {
// // // // // // // // //             console.log(`--> Skipping CSG calculation: Invalid props.`); setCalculatedGeometry(null); return;
// // // // // // // // //         }
// // // // // // // // //         console.log(`Calculating CSG Geometry for radius: ${outerRadius}`);
// // // // // // // // //         let geometry: THREE.BufferGeometry | null = null; const detailLevel = 1; let tempGeoList: THREE.BufferGeometry[] = [];
// // // // // // // // //         try {
// // // // // // // // //             const { vertices: mathVertices, faceData: mathFaceData } = getDodecahedronData(outerRadius);
// // // // // // // // //             const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, detailLevel); outerDodecGeo.computeBoundsTree(); tempGeoList.push(outerDodecGeo);
// // // // // // // // //             const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, detailLevel); innerDodecGeo.computeBoundsTree(); tempGeoList.push(innerDodecGeo);
// // // // // // // // //             let outerBrush = new Brush(outerDodecGeo); let innerBrush = new Brush(innerDodecGeo); innerBrush.updateMatrixWorld();
// // // // // // // // //             let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
// // // // // // // // //             const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * (holeRatio ** i));
// // // // // // // // //             const cylinderHeight = thickness * 3.1; // Slightly more than 3x thickness
// // // // // // // // //             const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16); cylinderGeo.rotateX(Math.PI / 2); cylinderGeo.computeBoundsTree(); tempGeoList.push(cylinderGeo);
// // // // // // // // //             const tempQuat = new THREE.Quaternion();
// // // // // // // // //             mathFaceData.forEach((face, index) => { const holeRadius = holeDiameters[index] / 2; if (!holeRadius || holeRadius <= 0) return; const holeBrush = new Brush(cylinderGeo); holeBrush.scale.set(holeRadius, holeRadius, 1); tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal); holeBrush.quaternion.copy(tempQuat); holeBrush.position.copy(face.center); holeBrush.updateMatrixWorld(); shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION); });
// // // // // // // // //             const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6); noduleGeo.computeBoundsTree(); tempGeoList.push(noduleGeo);
// // // // // // // // //             mathVertices.forEach(vertexPos => { const noduleBrush = new Brush(noduleGeo); noduleBrush.position.copy(vertexPos); noduleBrush.updateMatrixWorld(); shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION); });
// // // // // // // // //             geometry = shellBrush.geometry;
// // // // // // // // //             geometry.computeVertexNormals(); // Compute normals AFTER all CSG ops
// // // // // // // // //             geometry.center(); // Center AFTER all CSG ops
// // // // // // // // //             console.log("CSG Calculation Complete.");
// // // // // // // // //         } catch (error) { console.error("CSG Error in useEffect:", error); geometry = null; }
// // // // // // // // //         finally { tempGeoList.forEach(g => g.dispose()); console.log(`Disposed ${tempGeoList.length} temporary CSG geometries.`); }
// // // // // // // // //         setCalculatedGeometry(geometry);
// // // // // // // // //         return () => { if (geometry && typeof geometry.dispose === 'function') { geometry.dispose(); console.log("Disposed final CSG geometry from useEffect cleanup."); } };
// // // // // // // // //     }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]);

// // // // // // // // //     const meshMaterial = useMemo(() => {
// // // // // // // // //         let baseMaterial: THREE.Material;
// // // // // // // // //         // --- DIAGNOSTIC: Uncomment next line to use NormalMaterial ---
// // // // // // // // //         // return new THREE.MeshNormalMaterial({ side: THREE.DoubleSide, wireframe: wireframe });

// // // // // // // // //         // Default/Copper material logic
// // // // // // // // //         if (material instanceof THREE.Material) {
// // // // // // // // //             baseMaterial = material.clone();
// // // // // // // // //         } else {
// // // // // // // // //             // Default copper material if none provided
// // // // // // // // //             baseMaterial = new THREE.MeshStandardMaterial({ color: 0xB87333, side: THREE.DoubleSide, name: "DefaultCopper" });
// // // // // // // // //         }

// // // // // // // // //         if ('wireframe' in baseMaterial) {
// // // // // // // // //             (baseMaterial as any).wireframe = wireframe;
// // // // // // // // //         }
// // // // // // // // //         if (baseMaterial instanceof THREE.MeshStandardMaterial) {
// // // // // // // // //              baseMaterial.metalness = wireframe ? 0.1 : 0.8;
// // // // // // // // //              baseMaterial.roughness = wireframe ? 0.8 : 0.3;
// // // // // // // // //              // Ensure double side is set
// // // // // // // // //              baseMaterial.side = THREE.DoubleSide;
// // // // // // // // //         } else if (baseMaterial instanceof THREE.MeshPhysicalMaterial) {
// // // // // // // // //             // Add similar adjustments if using physical material
// // // // // // // // //             baseMaterial.side = THREE.DoubleSide;
// // // // // // // // //         } else {
// // // // // // // // //              // For other materials like Basic, Lambert - ensure side is set if needed
// // // // // // // // //              baseMaterial.side = THREE.DoubleSide;
// // // // // // // // //         }

// // // // // // // // //         return baseMaterial;
// // // // // // // // //     }, [material, wireframe]);

// // // // // // // // //     useEffect(() => { return () => { meshMaterial?.dispose(); } }, [meshMaterial]);

// // // // // // // // //     if (!calculatedGeometry) { return null; }
// // // // // // // // //     // Use ref on the mesh, group rotation will handle overall transform
// // // // // // // // //     return <mesh ref={ref} geometry={calculatedGeometry} material={meshMaterial} {...props} />;
// // // // // // // // // });

// // // // // // // // // // --- Physics State Interface ---
// // // // // // // // // interface PhysicsState { shell_angular_velocity_scalar: number; effective_field_velocity_scalar: number; current_torque_scalar: number; }

// // // // // // // // // // --- Main Simulation Component ---
// // // // // // // // // const ResonatorSimulation: React.FC = () => {
// // // // // // // // //     // --- FIX: Group Ref for Rotation ---
// // // // // // // // //     const groupRef = useRef<THREE.Group>(null!); // Use Group type
// // // // // // // // //     const dodecahedronMeshRef = useRef<THREE.Mesh>(null!); // Keep ref for mesh if needed later
// // // // // // // // //     const particlesRef = useRef<THREE.Points>(null!);
// // // // // // // // //     const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // // // // // //     // Leva controls
// // // // // // // // //     const resonatorControls = useControls('Resonator Controls', { baseFieldSpeed: 1.0, fieldIntensity: 1.0, k_drag: 0.5, inertiaScale: 1.0, damping: 0.1, k_feedback: -0.2 });
// // // // // // // // //     const shellControls = useControls('Shell Geometry', { outerRadius: 1.0, thickness: 0.05, holeBaseDiameter: 0.1, holeRatio: 1.2, noduleRadius: 0.1 });
// // // // // // // // //     const vizControls = useControls('Visualization', { particleCount: 1000, particleSize: 0.05, torusMajorRadius: 1.5, torusMinorRadius: 0.5, showParticles: true, wireframe: false });

// // // // // // // // //     // Combine controls with defaults
// // // // // // // // //     const defaultShellParams = useMemo(() => ({ outerRadius: 1.0, thickness: 0.05, holeBaseDiameter: 0.1, holeRatio: 1.2, noduleRadius: 0.1 }), []);
// // // // // // // // //     const finalShellParams = useMemo(() => ({ /* ... merge logic ... */ outerRadius: shellControls.outerRadius ?? defaultShellParams.outerRadius, thickness: shellControls.thickness ?? defaultShellParams.thickness, holeBaseDiameter: shellControls.holeBaseDiameter ?? defaultShellParams.holeBaseDiameter, holeRatio: shellControls.holeRatio ?? defaultShellParams.holeRatio, noduleRadius: shellControls.noduleRadius ?? defaultShellParams.noduleRadius }), [shellControls, defaultShellParams]);

// // // // // // // // //     // Inertia calculation
// // // // // // // // //     const effectiveInertia = useMemo(() => resonatorControls.inertiaScale * (finalShellParams.outerRadius ** 5 - (finalShellParams.outerRadius - finalShellParams.thickness) ** 5) / finalShellParams.outerRadius ** 5, [resonatorControls.inertiaScale, finalShellParams.outerRadius, finalShellParams.thickness]);
// // // // // // // // //     // Physics state
// // // // // // // // //     const physicsState = useRef<PhysicsState>({ shell_angular_velocity_scalar: 0.0, effective_field_velocity_scalar: resonatorControls.baseFieldSpeed || 0, current_torque_scalar: 0.0 });
// // // // // // // // //     // Particle data
// // // // // // // // //     const particleData = useMemo<{ positions: Float32Array; data: any[] }>(() => {
// // // // // // // // //         // ... create particle data ...
// // // // // // // // //         // Example placeholder: replace with the actual creation logic:
// // // // // // // // //         const positions = new Float32Array(vizControls.particleCount * 3);
// // // // // // // // //         const data: any[] = [];
// // // // // // // // //         // Populate positions and data as needed.
// // // // // // // // //         return { positions, data };
// // // // // // // // //     }, [vizControls.particleCount, vizControls.torusMajorRadius, vizControls.torusMinorRadius]);
// // // // // // // // //     // Particle buffer effect
// // // // // // // // //     useEffect(() => { /* ... particle buffer update effect ... */ }, [particleData]);

// // // // // // // // //     // Animation loop
// // // // // // // // //     useFrame((state, delta) => {
// // // // // // // // //         const currentPhysics = physicsState.current;
// // // // // // // // //         // V1 Physics Calculations
// // // // // // // // //         const relative_speed = currentPhysics.effective_field_velocity_scalar - currentPhysics.shell_angular_velocity_scalar;
// // // // // // // // //         currentPhysics.current_torque_scalar = resonatorControls.k_drag * resonatorControls.fieldIntensity * relative_speed;
// // // // // // // // //         const angular_acceleration = effectiveInertia > 0 ? (currentPhysics.current_torque_scalar / effectiveInertia) : 0; // Avoid divide by zero
// // // // // // // // //         currentPhysics.shell_angular_velocity_scalar += angular_acceleration * delta;
// // // // // // // // //         currentPhysics.shell_angular_velocity_scalar *= (1 - resonatorControls.damping * delta);
// // // // // // // // //         currentPhysics.effective_field_velocity_scalar = resonatorControls.baseFieldSpeed + resonatorControls.k_feedback * currentPhysics.shell_angular_velocity_scalar;

// // // // // // // // //         // --- FIX: Rotate the Group ---
// // // // // // // // //         if (groupRef.current) {
// // // // // // // // //              // console.log("Ang Vel:", currentPhysics.shell_angular_velocity_scalar); // DEBUG Rotation
// // // // // // // // //              groupRef.current.rotation.y += currentPhysics.shell_angular_velocity_scalar * delta;
// // // // // // // // //         }

// // // // // // // // //         // Emissive effect (applied to mesh material directly)
// // // // // // // // //         if (dodecahedronMeshRef.current) { // Use the mesh ref here
// // // // // // // // //              const material = dodecahedronMeshRef.current.material as THREE.MeshStandardMaterial;
// // // // // // // // //              if (material?.emissive) {
// // // // // // // // //                  const maxTorqueEst = resonatorControls.k_drag * resonatorControls.fieldIntensity * (Math.abs(resonatorControls.baseFieldSpeed) * 1.5 + 1);
// // // // // // // // //                  const emissionStrength = Math.min(Math.abs(currentPhysics.current_torque_scalar) / (maxTorqueEst + 0.01), 1.0);
// // // // // // // // //                  material.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5);
// // // // // // // // //              }
// // // // // // // // //         }

// // // // // // // // //         // Particle Field Update
// // // // // // // // //         if (vizControls.showParticles && /* ... other checks ... */ particleGeoRef.current?.attributes.position) {
// // // // // // // // //             /* ... particle position updates ... */
// // // // // // // // //             const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// // // // // // // // //             const speed = currentPhysics.effective_field_velocity_scalar * resonatorControls.fieldIntensity;
// // // // // // // // //             const pData = particleData?.data; // Check particleData exists
// // // // // // // // //             if (pData && pData.length * 3 === positions.length) {
// // // // // // // // //                 // Update material properties (can be done less frequently if performance matters)
// // // // // // // // //                 const pointsMat = particlesRef.current?.material as THREE.PointsMaterial;
// // // // // // // // //                 if(pointsMat) {
// // // // // // // // //                     pointsMat.size = vizControls.particleSize * (1 + resonatorControls.fieldIntensity * 0.5);
// // // // // // // // //                     // pointsMat.needsUpdate = true; // Usually not needed for size/color uniform changes
// // // // // // // // //                 }
// // // // // // // // //                 for (let i = 0; i < pData.length; i++) { /* ... update particle positions ... */ }
// // // // // // // // //                 particleGeoRef.current.attributes.position.needsUpdate = true;
// // // // // // // // //             }
// // // // // // // // //         }
// // // // // // // // //     });

// // // // // // // // //     // Memoized Copper Material
// // // // // // // // //     const copperMaterial = useMemo(() => new THREE.MeshStandardMaterial({ name: 'Copper CSG Material', color: 0xB87333, metalness: 0.8, roughness: 0.3, emissive: 0x000000, emissiveIntensity: 1.0, side: THREE.DoubleSide }), []);

// // // // // // // // //     return (
// // // // // // // // //         // --- FIX: Wrap Dodecahedron in a Group ---
// // // // // // // // //         <group ref={groupRef}>
// // // // // // // // //             <RomanDodecahedron
// // // // // // // // //                 ref={dodecahedronMeshRef} // Pass mesh ref here
// // // // // // // // //                 outerRadius={finalShellParams.outerRadius}
// // // // // // // // //                 thickness={finalShellParams.thickness}
// // // // // // // // //                 holeBaseDiameter={finalShellParams.holeBaseDiameter}
// // // // // // // // //                 holeRatio={finalShellParams.holeRatio}
// // // // // // // // //                 noduleRadius={finalShellParams.noduleRadius}
// // // // // // // // //                 material={copperMaterial}
// // // // // // // // //                 wireframe={vizControls.wireframe}
// // // // // // // // //                 castShadow receiveShadow
// // // // // // // // //                 // Position/rotation of the mesh itself should be zero, group handles it
// // // // // // // // //                 position={[0,0,0]}
// // // // // // // // //                 rotation={[0,0,0]}
// // // // // // // // //             />
// // // // // // // // //             {/* --- FIX: Add PointLight inside the group --- */}
// // // // // // // // //             <pointLight intensity={0.4} color={0xffaa88} distance={3} decay={1.5} position={[0, 0, 0]} />
// // // // // // // // //             {/* Particles remain children of the main simulation component, not the group */}
// // // // // // // // //             {vizControls.showParticles && (
// // // // // // // // //                  <points ref={particlesRef} name="FieldParticles">
// // // // // // // // //                      <bufferGeometry ref={particleGeoRef} />
// // // // // // // // //                      <pointsMaterial name="ParticleMaterial" color={0x00ffff} size={vizControls.particleSize} transparent opacity={0.7} blending={THREE.AdditiveBlending} sizeAttenuation={false} map={null} />
// // // // // // // // //                  </points>
// // // // // // // // //             )}
// // // // // // // // //         </group> // End group
// // // // // // // // //     );
// // // // // // // // // };

// // // // // // // // // // --- Scene Component ---
// // // // // // // // // const TemporalResonatorScene: React.FC = () => {
// // // // // // // // //      return ( /* ... Canvas, Leva, Lights etc ... */
// // // // // // // // //         <>
// // // // // // // // //             <Leva collapsed={false} titleBar={{ title: 'Controls' }} />
// // // // // // // // //             <Canvas style={{ /*...*/ }} camera={{ position: [3, 3, 5], fov: 75 }} gl={{ antialias: true }} shadows >
// // // // // // // // //                  <ambientLight intensity={0.4} /> {/* Slightly less ambient */}
// // // // // // // // //                  <hemisphereLight groundColor={0x404040} intensity={0.8} /> {/* Slightly less hemi */}
// // // // // // // // //                  <directionalLight position={[5, 10, 7.5]} intensity={1.2} castShadow /*...*/ />
// // // // // // // // //                  <ErrorBoundary> <Suspense fallback={<LoadingPlaceholder />}> <ResonatorSimulation /> </Suspense> </ErrorBoundary>
// // // // // // // // //                  <Controls />
// // // // // // // // //                  <axesHelper args={[5]} />
// // // // // // // // //             </Canvas>
// // // // // // // // //         </>
// // // // // // // // //      );
// // // // // // // // //  };
// // // // // // // // // // --- Loading Placeholder ---
// // // // // // // // // const LoadingPlaceholder: React.FC = () => { return <div>Loading...</div>; };
// // // // // // // // // export default TemporalResonatorScene;


// // // // // // // // // // // === Full Code: TemporalResonatorScene_V2_CSG_Fixes_10.tsx ===

// // // // // // // // // // import React, { useRef, useEffect, useMemo, Suspense, useState } from 'react';
// // // // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // // // // import * as THREE from 'three';
// // // // // // // // // // import ErrorBoundary from './errorBoundary'; // Adjust path if needed
// // // // // // // // // // import { useControls, Leva } from 'leva';
// // // // // // // // // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// // // // // // // // // // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // // // // // // // // // // --- BVH / CSG Setup ---
// // // // // // // // // // try {
// // // // // // // // // //     THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
// // // // // // // // // //     THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
// // // // // // // // // //     THREE.Mesh.prototype.raycast = acceleratedRaycast;
// // // // // // // // // // } catch (error) { console.error("Error setting up BVH extensions:", error); }
// // // // // // // // // // const csgEvaluator = new Evaluator();
// // // // // // // // // // csgEvaluator.useGroups = true;
// // // // // // // // // // extend({ OrbitControls });

// // // // // // // // // // // --- Constants ---
// // // // // // // // // // const PHI = (1 + Math.sqrt(5)) / 2;
// // // // // // // // // // const INV_PHI = 1 / PHI;

// // // // // // // // // // // --- Helper: Get Dodecahedron Math Data ---
// // // // // // // // // // function getDodecahedronData(radius: number): { vertices: THREE.Vector3[]; faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] } {
// // // // // // // // // //     console.log(`--- Calculating Dodecahedron Data for radius: ${radius} ---`);
// // // // // // // // // //     if (typeof radius !== 'number' || radius <= 0 || !Number.isFinite(radius)) {
// // // // // // // // // //         throw new Error("Invalid radius provided to getDodecahedronData");
// // // // // // // // // //     }
// // // // // // // // // //     const uniqueVerticesMap = new Map<string, THREE.Vector3>();
// // // // // // // // // //     const coords = [ [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1], [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1], [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI], [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI], [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0] ];
// // // // // // // // // //     const distOriginToVertex = Math.sqrt(PHI * PHI + INV_PHI * INV_PHI);
// // // // // // // // // //     const scale = radius / distOriginToVertex;
// // // // // // // // // //     if (!Number.isFinite(scale) || scale === 0) { throw new Error("Invalid scale factor"); }
// // // // // // // // // //     coords.forEach(v => { const x = v[0] * scale; const y = v[1] * scale; const z = v[2] * scale; const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`; if (!uniqueVerticesMap.has(key)) { uniqueVerticesMap.set(key, new THREE.Vector3(x, y, z)); } });
// // // // // // // // // //     const vertices = Array.from(uniqueVerticesMap.values());
// // // // // // // // // //     const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
// // // // // // // // // //     const icoVerts = [ [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1] ];
// // // // // // // // // //     const faceCenterDist = radius * 1.53 / distOriginToVertex;
// // // // // // // // // //     icoVerts.forEach(v => { const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize(); const center = normal.clone().multiplyScalar(faceCenterDist); faceData.push({ center, normal }); });
// // // // // // // // // //     if (vertices.length !== 20 || faceData.length !== 12) { console.error("!!! Vertex/Face generation failed. Vertices:", vertices, "Faces:", faceData); throw new Error(`Incorrect math data count: ${vertices.length} vertices, ${faceData.length} faces`); }
// // // // // // // // // //     console.log(`--- Generated ${vertices.length} vertices, ${faceData.length} faces. ---`);
// // // // // // // // // //     return { vertices, faceData };
// // // // // // // // // // }

// // // // // // // // // // // --- Controls Component ---
// // // // // // // // // // const Controls: React.FC = () => {
// // // // // // // // // //      const { camera, gl } = useThree(); const controlsRef = useRef<OrbitControls>(null);
// // // // // // // // // //      useEffect(() => { const controls = new OrbitControls(camera, gl.domElement); controls.enableDamping = true; (controlsRef as any).current = controls; return () => { controls.dispose(); }; }, [camera, gl]);
// // // // // // // // // //      useFrame(() => { controlsRef.current?.update(); }); return null;
// // // // // // // // // // };

// // // // // // // // // // // --- Roman Dodecahedron CSG Component ---
// // // // // // // // // // interface RomanDodecahedronProps { outerRadius: number; thickness: number; holeBaseDiameter: number; holeRatio: number; noduleRadius: number; material?: THREE.Material; wireframe?: boolean; [key: string]: any; } // Added wireframe prop
// // // // // // // // // // const RomanDodecahedron: React.FC<RomanDodecahedronProps> = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
// // // // // // // // // //     ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, wireframe = false, ...props }, ref) => { // Default wireframe to false
// // // // // // // // // //     const [calculatedGeometry, setCalculatedGeometry] = useState<THREE.BufferGeometry | null>(null);

// // // // // // // // // //     useEffect(() => {
// // // // // // // // // //         console.log(`useEffect Check: outerRadius=${outerRadius} (${typeof outerRadius}), thickness=${thickness}, ...`);
// // // // // // // // // //         if ( typeof outerRadius !== 'number' || outerRadius <= 0 || !Number.isFinite(outerRadius) || typeof thickness !== 'number' || thickness <= 0 || !Number.isFinite(thickness) || typeof holeBaseDiameter !== 'number' || holeBaseDiameter <= 0 || !Number.isFinite(holeBaseDiameter) || typeof holeRatio !== 'number' || holeRatio <= 0 || !Number.isFinite(holeRatio) || typeof noduleRadius !== 'number' || noduleRadius <= 0 || !Number.isFinite(noduleRadius) ) {
// // // // // // // // // //             console.log(`--> Skipping CSG calculation in useEffect: Invalid props detected.`); setCalculatedGeometry(null); return;
// // // // // // // // // //         }
// // // // // // // // // //         console.log(`Calculating CSG Geometry in useEffect for outerRadius: ${outerRadius}`);
// // // // // // // // // //         let geometry: THREE.BufferGeometry | null = null; const detailLevel = 1; let tempGeoList: THREE.BufferGeometry[] = [];
// // // // // // // // // //         try {
// // // // // // // // // //             const { vertices: mathVertices, faceData: mathFaceData } = getDodecahedronData(outerRadius);
// // // // // // // // // //             const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, detailLevel); outerDodecGeo.computeBoundsTree(); tempGeoList.push(outerDodecGeo);
// // // // // // // // // //             const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, detailLevel); innerDodecGeo.computeBoundsTree(); tempGeoList.push(innerDodecGeo);
// // // // // // // // // //             let outerBrush = new Brush(outerDodecGeo); let innerBrush = new Brush(innerDodecGeo); innerBrush.updateMatrixWorld();
// // // // // // // // // //             let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
// // // // // // // // // //             const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * (holeRatio ** i));
// // // // // // // // // //             const cylinderHeight = thickness * 3; const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16); cylinderGeo.rotateX(Math.PI / 2); cylinderGeo.computeBoundsTree(); tempGeoList.push(cylinderGeo);
// // // // // // // // // //             const tempQuat = new THREE.Quaternion();
// // // // // // // // // //             mathFaceData.forEach((face, index) => { const holeRadius = holeDiameters[index] / 2; if (!holeRadius || holeRadius <= 0) return; const holeBrush = new Brush(cylinderGeo); holeBrush.scale.set(holeRadius, holeRadius, 1); tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal); holeBrush.quaternion.copy(tempQuat); holeBrush.position.copy(face.center); holeBrush.updateMatrixWorld(); shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION); });
// // // // // // // // // //             const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6); noduleGeo.computeBoundsTree(); tempGeoList.push(noduleGeo);
// // // // // // // // // //             mathVertices.forEach(vertexPos => { const noduleBrush = new Brush(noduleGeo); noduleBrush.position.copy(vertexPos); noduleBrush.updateMatrixWorld(); shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION); });
// // // // // // // // // //             geometry = shellBrush.geometry; geometry.computeVertexNormals(); geometry.center();
// // // // // // // // // //             console.log("CSG Calculation Complete.");
// // // // // // // // // //         } catch (error) { console.error("CSG Error in useEffect:", error); geometry = null; }
// // // // // // // // // //         finally { tempGeoList.forEach(g => g.dispose()); console.log(`Disposed ${tempGeoList.length} temporary CSG geometries.`); }
// // // // // // // // // //         setCalculatedGeometry(geometry);
// // // // // // // // // //         return () => { if (geometry && typeof geometry.dispose === 'function') { geometry.dispose(); console.log("Disposed final CSG geometry from useEffect cleanup."); } };
// // // // // // // // // //     }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]);

// // // // // // // // // //     // Memoize the material instance based on wireframe prop
// // // // // // // // // //     const meshMaterial = useMemo(() => {
// // // // // // // // // //         const baseMaterial = material instanceof THREE.Material ? material.clone() : new THREE.MeshStandardMaterial({ color: 0xB87333, side: THREE.DoubleSide });
// // // // // // // // // //         // Modify the cloned or default material if it is a MeshStandardMaterial
// // // // // // // // // //         if (baseMaterial instanceof THREE.MeshStandardMaterial) {
// // // // // // // // // //              baseMaterial.wireframe = wireframe; // Set wireframe based on prop
// // // // // // // // // //              baseMaterial.metalness = wireframe ? 0.1 : 0.8; // Reduce metalness in wireframe
// // // // // // // // // //              baseMaterial.roughness = wireframe ? 0.8 : 0.3; // Increase roughness
// // // // // // // // // //         }
// // // // // // // // // //         return baseMaterial;
// // // // // // // // // //     }, [material, wireframe]); // Recreate material if base material or wireframe changes

// // // // // // // // // //     useEffect(() => {
// // // // // // // // // //          // Cleanup for memoized material
// // // // // // // // // //          return () => { meshMaterial?.dispose(); }
// // // // // // // // // //     }, [meshMaterial]);

// // // // // // // // // //     if (!calculatedGeometry) { return null; }
// // // // // // // // // //     return <mesh ref={ref} geometry={calculatedGeometry} material={meshMaterial} {...props} />;
// // // // // // // // // // });

// // // // // // // // // // // --- Physics State Interface ---
// // // // // // // // // // interface PhysicsState { shell_angular_velocity_scalar: number; effective_field_velocity_scalar: number; current_torque_scalar: number; }

// // // // // // // // // // // --- Main Simulation Component ---
// // // // // // // // // // const ResonatorSimulation: React.FC = () => {
// // // // // // // // // //     const dodecahedronRef = useRef<THREE.Mesh>(null!);
// // // // // // // // // //     const particlesRef = useRef<THREE.Points>(null!);
// // // // // // // // // //     const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // // // // // // //     // Leva controls definition
// // // // // // // // // //     const resonatorControls = useControls('Resonator Controls', { /* ... */ });
// // // // // // // // // //     const shellControls = useControls('Shell Geometry', { /* ... */ });
// // // // // // // // // //     const vizControls = useControls('Visualization', {
// // // // // // // // // //         particleCount: { value: 1000, min: 100, max: 5000, step: 100 },
// // // // // // // // // //         particleSize: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
// // // // // // // // // //         torusMajorRadius: { value: 1.5, min: 0.5, max: 5, step: 0.1 },
// // // // // // // // // //         torusMinorRadius: { value: 0.5, min: 0.1, max: 2, step: 0.05 },
// // // // // // // // // //         showParticles: true,
// // // // // // // // // //         wireframe: false, // Add wireframe toggle
// // // // // // // // // //     });

// // // // // // // // // //     // Combine leva controls with defaults
// // // // // // // // // //     const defaultShellParams = useMemo(() => ({ outerRadius: 1.0, thickness: 0.05, holeBaseDiameter: 0.1, holeRatio: 1.2, noduleRadius: 0.1 }), []);
// // // // // // // // // //     const finalShellParams = useMemo(() => ({
// // // // // // // // // //         outerRadius: (typeof (shellControls as any).outerRadius === 'number' && Number.isFinite((shellControls as any).outerRadius)) ? (shellControls as any).outerRadius : defaultShellParams.outerRadius,
// // // // // // // // // //         thickness: (typeof (shellControls as any).thickness === 'number' && Number.isFinite((shellControls as any).thickness)) ? (shellControls as any).thickness : defaultShellParams.thickness,
// // // // // // // // // //         holeBaseDiameter: (typeof (shellControls as any).holeBaseDiameter === 'number' && Number.isFinite((shellControls as any).holeBaseDiameter)) ? (shellControls as any).holeBaseDiameter : defaultShellParams.holeBaseDiameter,
// // // // // // // // // //         holeRatio: (typeof (shellControls as any).holeRatio === 'number' && Number.isFinite((shellControls as any).holeRatio)) ? (shellControls as any).holeRatio : defaultShellParams.holeRatio,
// // // // // // // // // //         noduleRadius: (typeof (shellControls as any).noduleRadius === 'number' && Number.isFinite((shellControls as any).noduleRadius)) ? (shellControls as any).noduleRadius : defaultShellParams.noduleRadius,
// // // // // // // // // //     }), [shellControls, defaultShellParams]);

// // // // // // // // // //     // Inertia calculation (cast resonatorControls to any to avoid unknown type error)
// // // // // // // // // //     const effectiveInertia = useMemo(() => (resonatorControls as any).inertiaScale * (finalShellParams.outerRadius ** 5 - (finalShellParams.outerRadius - finalShellParams.thickness) ** 5) / finalShellParams.outerRadius ** 5, [(resonatorControls as any).inertiaScale, finalShellParams.outerRadius, finalShellParams.thickness]);
// // // // // // // // // //     // Physics state (cast resonatorControls to any)
// // // // // // // // // //     const physicsState = useRef<PhysicsState>({ shell_angular_velocity_scalar: 0.0, effective_field_velocity_scalar: (resonatorControls as any).baseFieldSpeed || 0, current_torque_scalar: 0.0 });
// // // // // // // // // //     // Particle data (unused variables; remove these if you do not plan to use them to avoid warnings)
// // // // // // // // // //     const particleData = useMemo(() => { /* ... create particle data ... */ }, [vizControls.particleCount, vizControls.torusMajorRadius, vizControls.torusMinorRadius]);
// // // // // // // // // //     // Particle buffer effect
// // // // // // // // // //     useEffect(() => { /* ... particle buffer update effect ... */ }, [particleData]);
// // // // // // // // // //     // Animation loop
// // // // // // // // // //     useFrame((state, delta) => { /* ... V1 physics + Visual updates ... */ });
// // // // // // // // // //     // Copper Material
// // // // // // // // // //     const copperMaterial = useMemo(() => new THREE.MeshStandardMaterial({ name: 'Copper CSG Material', color: 0xB87333, metalness: 0.8, roughness: 0.3, emissive: 0x000000, emissiveIntensity: 1.0, side: THREE.DoubleSide }), []);

// // // // // // // // // //     return (
// // // // // // // // // //         <>
// // // // // // // // // //             <RomanDodecahedron
// // // // // // // // // //                 ref={dodecahedronRef}
// // // // // // // // // //                 outerRadius={finalShellParams.outerRadius}
// // // // // // // // // //                 thickness={finalShellParams.thickness}
// // // // // // // // // //                 holeBaseDiameter={finalShellParams.holeBaseDiameter}
// // // // // // // // // //                 holeRatio={finalShellParams.holeRatio}
// // // // // // // // // //                 noduleRadius={finalShellParams.noduleRadius}
// // // // // // // // // //                 material={copperMaterial} // Pass the base copper material
// // // // // // // // // //                 wireframe={vizControls.wireframe} // Control wireframe via leva
// // // // // // // // // //                 castShadow receiveShadow
// // // // // // // // // //             />
// // // // // // // // // //             {vizControls.showParticles && (
// // // // // // // // // //                  <points ref={particlesRef} name="FieldParticles">
// // // // // // // // // //                      <bufferGeometry ref={particleGeoRef} />
// // // // // // // // // //                      <pointsMaterial
// // // // // // // // // //                          name="ParticleMaterial" color={0x00ffff} size={vizControls.particleSize}
// // // // // // // // // //                          transparent opacity={0.7} blending={THREE.AdditiveBlending}
// // // // // // // // // //                          sizeAttenuation={false} // <-- Set to false
// // // // // // // // // //                          map={null}
// // // // // // // // // //                      />
// // // // // // // // // //                  </points>
// // // // // // // // // //             )}
// // // // // // // // // //         </>
// // // // // // // // // //     );
// // // // // // // // // // };

// // // // // // // // // // // --- Scene Component ---
// // // // // // // // // // const TemporalResonatorScene: React.FC = () => { /* ... */
// // // // // // // // // //      return (
// // // // // // // // // //          <>
// // // // // // // // // //              <Leva collapsed={false} titleBar={{ title: 'Controls' }} />
// // // // // // // // // //              <Canvas style={{ /*...*/ }} camera={{ /*...*/ }} gl={{ antialias: true }} shadows >
// // // // // // // // // //                  {/* Lights */}
// // // // // // // // // //                  <ambientLight intensity={0.5} />
// // // // // // // // // //                  <hemisphereLight groundColor={0x404040} intensity={1.0} />
// // // // // // // // // //                  <directionalLight position={[5, 10, 7.5]} intensity={1.5} castShadow /*...*/ />
// // // // // // // // // //                  <ErrorBoundary>
// // // // // // // // // //                      <Suspense fallback={<LoadingPlaceholder />}>
// // // // // // // // // //                           <ResonatorSimulation />
// // // // // // // // // //                      </Suspense>
// // // // // // // // // //                  </ErrorBoundary>
// // // // // // // // // //                  <Controls />
// // // // // // // // // //                  {/* <axesHelper args={[5]} /> */}
// // // // // // // // // //                  {/* <gridHelper args={[10, 10]} /> */}
// // // // // // // // // //              </Canvas>
// // // // // // // // // //          </>
// // // // // // // // // //      );
// // // // // // // // // //  };

// // // // // // // // // // // --- Loading Placeholder ---
// // // // // // // // // // const LoadingPlaceholder: React.FC = () => { return <div>Loading...</div>; };

// // // // // // // // // // export default TemporalResonatorScene;


// // // // // // // // // // // === Full Code: TemporalResonatorScene_V2_CSG_Complete.tsx ===

// // // // // // // // // // // Ensure imports are correct for your project structure
// // // // // // // // // // import React, { useRef, useEffect, useMemo, Suspense, useState } from 'react';
// // // // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // // // // import * as THREE from 'three';
// // // // // // // // // // import ErrorBoundary from './errorBoundary'; // Adjust path if needed
// // // // // // // // // // import { useControls, Leva } from 'leva';
// // // // // // // // // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// // // // // // // // // // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // // // // // // // // // // --- BVH / CSG Setup ---
// // // // // // // // // // // Ensure these run reliably at the top level
// // // // // // // // // // try {
// // // // // // // // // //     THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
// // // // // // // // // //     THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
// // // // // // // // // //     THREE.Mesh.prototype.raycast = acceleratedRaycast;
// // // // // // // // // // } catch (error) {
// // // // // // // // // //     console.error("Error setting up BVH extensions:", error);
// // // // // // // // // // }
// // // // // // // // // // const csgEvaluator = new Evaluator();
// // // // // // // // // // csgEvaluator.useGroups = true;
// // // // // // // // // // extend({ OrbitControls }); // Extend R3F for OrbitControls

// // // // // // // // // // // --- Constants ---
// // // // // // // // // // const PHI = (1 + Math.sqrt(5)) / 2;
// // // // // // // // // // const INV_PHI = 1 / PHI;

// // // // // // // // // // // --- Helper: Get Dodecahedron Math Data ---
// // // // // // // // // // function getDodecahedronData(radius: number): { vertices: THREE.Vector3[]; faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] } {
// // // // // // // // // //     console.log(`--- Calculating Dodecahedron Data for radius: ${radius} ---`);
// // // // // // // // // //     if (typeof radius !== 'number' || radius <= 0 || !Number.isFinite(radius)) {
// // // // // // // // // //         console.error("!!! Invalid radius passed to getDodecahedronData:", radius);
// // // // // // // // // //         throw new Error("Invalid radius provided to getDodecahedronData");
// // // // // // // // // //     }

// // // // // // // // // //     const uniqueVerticesMap = new Map<string, THREE.Vector3>();
// // // // // // // // // //     const coords = [
// // // // // // // // // //         [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1], [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
// // // // // // // // // //         [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI],
// // // // // // // // // //         [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI],
// // // // // // // // // //         [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0]
// // // // // // // // // //     ];
// // // // // // // // // //     const distOriginToVertex = Math.sqrt(PHI * PHI + INV_PHI * INV_PHI);
// // // // // // // // // //     const scale = radius / distOriginToVertex;
// // // // // // // // // //     if (!Number.isFinite(scale) || scale === 0) { throw new Error("Invalid scale factor"); }

// // // // // // // // // //     coords.forEach(v => {
// // // // // // // // // //         const x = v[0] * scale; const y = v[1] * scale; const z = v[2] * scale;
// // // // // // // // // //         const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
// // // // // // // // // //         if (!uniqueVerticesMap.has(key)) { uniqueVerticesMap.set(key, new THREE.Vector3(x, y, z)); }
// // // // // // // // // //     });
// // // // // // // // // //     const vertices = Array.from(uniqueVerticesMap.values());

// // // // // // // // // //     const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
// // // // // // // // // //     const icoVerts = [ [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1] ];
// // // // // // // // // //     const faceCenterDist = radius * 1.53 / distOriginToVertex; // Relative positioning

// // // // // // // // // //     icoVerts.forEach(v => {
// // // // // // // // // //         const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize();
// // // // // // // // // //         const center = normal.clone().multiplyScalar(faceCenterDist);
// // // // // // // // // //         faceData.push({ center, normal });
// // // // // // // // // //     });

// // // // // // // // // //     if (vertices.length !== 20 || faceData.length !== 12) {
// // // // // // // // // //         console.error("!!! Vertex/Face generation failed. Vertices:", vertices, "Faces:", faceData);
// // // // // // // // // //         throw new Error(`Incorrect math data count: ${vertices.length} vertices, ${faceData.length} faces`);
// // // // // // // // // //     }
// // // // // // // // // //     console.log(`--- Generated ${vertices.length} vertices, ${faceData.length} faces. ---`);
// // // // // // // // // //     return { vertices, faceData };
// // // // // // // // // // }

// // // // // // // // // // // --- Controls Component ---
// // // // // // // // // // const Controls: React.FC = () => {
// // // // // // // // // //      const { camera, gl } = useThree();
// // // // // // // // // //      const controlsRef = useRef<OrbitControls>(null);
// // // // // // // // // //      useEffect(() => {
// // // // // // // // // //        const controls = new OrbitControls(camera, gl.domElement);
// // // // // // // // // //        controls.enableDamping = true;
// // // // // // // // // //        (controlsRef as React.MutableRefObject<OrbitControls>).current = controls;
// // // // // // // // // //        return () => { controls.dispose(); };
// // // // // // // // // //      }, [camera, gl]);
// // // // // // // // // //      useFrame(() => { controlsRef.current?.update(); });
// // // // // // // // // //      return null;
// // // // // // // // // // };

// // // // // // // // // // // --- Roman Dodecahedron CSG Component ---
// // // // // // // // // // interface RomanDodecahedronProps {
// // // // // // // // // //     outerRadius: number; thickness: number; holeBaseDiameter: number;
// // // // // // // // // //     holeRatio: number; noduleRadius: number; material?: THREE.Material;
// // // // // // // // // //     [key: string]: any;
// // // // // // // // // // }
// // // // // // // // // // const RomanDodecahedron: React.FC<RomanDodecahedronProps> = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
// // // // // // // // // //     ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, ...props }, ref) => {
// // // // // // // // // //     const [calculatedGeometry, setCalculatedGeometry] = useState<THREE.BufferGeometry | null>(null);

// // // // // // // // // //     useEffect(() => {
// // // // // // // // // //         console.log(`useEffect Check: outerRadius=${outerRadius} (${typeof outerRadius}), thickness=${thickness}, ...`);
// // // // // // // // // //         if ( typeof outerRadius !== 'number' || outerRadius <= 0 || !Number.isFinite(outerRadius) || typeof thickness !== 'number' || thickness <= 0 || !Number.isFinite(thickness) || typeof holeBaseDiameter !== 'number' || holeBaseDiameter <= 0 || !Number.isFinite(holeBaseDiameter) || typeof holeRatio !== 'number' || holeRatio <= 0 || !Number.isFinite(holeRatio) || typeof noduleRadius !== 'number' || noduleRadius <= 0 || !Number.isFinite(noduleRadius) ) {
// // // // // // // // // //             console.log(`--> Skipping CSG calculation in useEffect: Invalid props detected.`);
// // // // // // // // // //             setCalculatedGeometry(null); return;
// // // // // // // // // //         }

// // // // // // // // // //         console.log(`Calculating CSG Geometry in useEffect for outerRadius: ${outerRadius}`);
// // // // // // // // // //         let geometry: THREE.BufferGeometry | null = null;
// // // // // // // // // //         const detailLevel = 1;
// // // // // // // // // //         let tempGeoList: THREE.BufferGeometry[] = []; // Keep track of temp geos to dispose

// // // // // // // // // //         try {
// // // // // // // // // //             const { vertices: mathVertices, faceData: mathFaceData } = getDodecahedronData(outerRadius);

// // // // // // // // // //             const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, detailLevel); outerDodecGeo.computeBoundsTree(); tempGeoList.push(outerDodecGeo);
// // // // // // // // // //             const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, detailLevel); innerDodecGeo.computeBoundsTree(); tempGeoList.push(innerDodecGeo);
// // // // // // // // // //             let outerBrush = new Brush(outerDodecGeo); let innerBrush = new Brush(innerDodecGeo); innerBrush.updateMatrixWorld();
// // // // // // // // // //             let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);

// // // // // // // // // //             const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * (holeRatio ** i));
// // // // // // // // // //             const cylinderHeight = thickness * 3;
// // // // // // // // // //             const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16); cylinderGeo.rotateX(Math.PI / 2); cylinderGeo.computeBoundsTree(); tempGeoList.push(cylinderGeo);
// // // // // // // // // //             const tempQuat = new THREE.Quaternion();

// // // // // // // // // //             mathFaceData.forEach((face, index) => {
// // // // // // // // // //                 const holeRadius = holeDiameters[index] / 2; if (!holeRadius || holeRadius <= 0) return;
// // // // // // // // // //                 const holeBrush = new Brush(cylinderGeo); holeBrush.scale.set(holeRadius, holeRadius, 1);
// // // // // // // // // //                 tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal); holeBrush.quaternion.copy(tempQuat);
// // // // // // // // // //                 holeBrush.position.copy(face.center); holeBrush.updateMatrixWorld();
// // // // // // // // // //                 shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION);
// // // // // // // // // //             });

// // // // // // // // // //             const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6); noduleGeo.computeBoundsTree(); tempGeoList.push(noduleGeo);
// // // // // // // // // //             mathVertices.forEach(vertexPos => {
// // // // // // // // // //                 const noduleBrush = new Brush(noduleGeo); noduleBrush.position.copy(vertexPos);
// // // // // // // // // //                 noduleBrush.updateMatrixWorld(); shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
// // // // // // // // // //             });

// // // // // // // // // //             geometry = shellBrush.geometry;
// // // // // // // // // //             geometry.computeVertexNormals(); // Crucial for lighting
// // // // // // // // // //             geometry.center(); // Center the final shape
// // // // // // // // // //             console.log("CSG Calculation Complete.");

// // // // // // // // // //         } catch (error) {
// // // // // // // // // //             console.error("CSG Error in useEffect:", error);
// // // // // // // // // //             geometry = null;
// // // // // // // // // //         } finally {
// // // // // // // // // //              // Dispose all temporary geometries used for brushes
// // // // // // // // // //              tempGeoList.forEach(g => g.dispose());
// // // // // // // // // //              console.log(`Disposed ${tempGeoList.length} temporary CSG geometries.`);
// // // // // // // // // //         }

// // // // // // // // // //         setCalculatedGeometry(geometry);

// // // // // // // // // //         // Cleanup function disposes the *final* geometry state if it exists
// // // // // // // // // //         return () => {
// // // // // // // // // //             // The 'geometry' variable here refers to the one calculated in *this* effect run
// // // // // // // // // //             if (geometry && typeof geometry.dispose === 'function') {
// // // // // // // // // //                 geometry.dispose();
// // // // // // // // // //                 console.log("Disposed final CSG geometry from useEffect cleanup.");
// // // // // // // // // //             }
// // // // // // // // // //         };
// // // // // // // // // //     }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]);

// // // // // // // // // //     if (!calculatedGeometry) { return null; }
// // // // // // // // // //     // Default to a basic red material if none provided, easier to see than black
// // // // // // // // // //     const meshMaterial = material || new THREE.MeshStandardMaterial({ color: 0xff0000, side: THREE.DoubleSide });
// // // // // // // // // //     return <mesh ref={ref} geometry={calculatedGeometry} material={meshMaterial} {...props} />;
// // // // // // // // // // });

// // // // // // // // // // // --- Physics State Interface ---
// // // // // // // // // // interface PhysicsState {
// // // // // // // // // //     shell_angular_velocity_scalar: number;
// // // // // // // // // //     effective_field_velocity_scalar: number;
// // // // // // // // // //     current_torque_scalar: number;
// // // // // // // // // // }

// // // // // // // // // // // --- Main Simulation Component ---
// // // // // // // // // // const ResonatorSimulation: React.FC = () => {
// // // // // // // // // //     const dodecahedronRef = useRef<THREE.Mesh>(null!);
// // // // // // // // // //     const particlesRef = useRef<THREE.Points>(null!);
// // // // // // // // // //     const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // // // // // // //     // Leva controls definition
// // // // // // // // // //     const resonatorControls = useControls('Resonator Controls', {
// // // // // // // // // //         baseFieldSpeed: { value: 1.0, min: -5, max: 5, step: 0.1 },
// // // // // // // // // //         fieldIntensity: { value: 1.0, min: 0.1, max: 5, step: 0.1 },
// // // // // // // // // //         k_drag: { label: 'Induction Strength', value: 0.5, min: 0, max: 2, step: 0.05 },
// // // // // // // // // //         inertiaScale: { label: 'Inertia Scale', value: 1.0, min: 0.1, max: 5, step: 0.1 },
// // // // // // // // // //         damping: { value: 0.1, min: 0, max: 1, step: 0.01 },
// // // // // // // // // //         k_feedback: { value: -0.2, min: -2, max: 2, step: 0.05 },
// // // // // // // // // //     });
// // // // // // // // // //     const shellControls = useControls('Shell Geometry', {
// // // // // // // // // //          outerRadius: { value: 1.0, min: 0.5, max: 2.0, step: 0.1 },
// // // // // // // // // //          thickness: { value: 0.05, min: 0.01, max: 0.3, step: 0.01 },
// // // // // // // // // //          holeBaseDiameter: { value: 0.1, min: 0.01, max: 0.3, step: 0.01 },
// // // // // // // // // //          holeRatio: { value: 1.2, min: 1.0, max: 1.6, step: 0.01 },
// // // // // // // // // //          noduleRadius: { value: 0.1, min: 0.01, max: 0.3, step: 0.01 },
// // // // // // // // // //      });
// // // // // // // // // //     const vizControls = useControls('Visualization', {
// // // // // // // // // //         particleCount: { value: 1000, min: 100, max: 5000, step: 100 },
// // // // // // // // // //         particleSize: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
// // // // // // // // // //         torusMajorRadius: { value: 1.5, min: 0.5, max: 5, step: 0.1 },
// // // // // // // // // //         torusMinorRadius: { value: 0.5, min: 0.1, max: 2, step: 0.05 },
// // // // // // // // // //         showParticles: true, // Add toggle for particles
// // // // // // // // // //     });

// // // // // // // // // //     // Combine leva controls with defaults (useMemo ensures this runs correctly)
// // // // // // // // // //     const defaultShellParams = useMemo(() => ({ outerRadius: 1.0, thickness: 0.05, holeBaseDiameter: 0.1, holeRatio: 1.2, noduleRadius: 0.1 }), []);
// // // // // // // // // //     const finalShellParams = useMemo(() => ({
// // // // // // // // // //         outerRadius: (typeof shellControls.outerRadius === 'number' && Number.isFinite(shellControls.outerRadius)) ? shellControls.outerRadius : defaultShellParams.outerRadius,
// // // // // // // // // //         thickness: (typeof shellControls.thickness === 'number' && Number.isFinite(shellControls.thickness)) ? shellControls.thickness : defaultShellParams.thickness,
// // // // // // // // // //         holeBaseDiameter: (typeof shellControls.holeBaseDiameter === 'number' && Number.isFinite(shellControls.holeBaseDiameter)) ? shellControls.holeBaseDiameter : defaultShellParams.holeBaseDiameter,
// // // // // // // // // //         holeRatio: (typeof shellControls.holeRatio === 'number' && Number.isFinite(shellControls.holeRatio)) ? shellControls.holeRatio : defaultShellParams.holeRatio,
// // // // // // // // // //         noduleRadius: (typeof shellControls.noduleRadius === 'number' && Number.isFinite(shellControls.noduleRadius)) ? shellControls.noduleRadius : defaultShellParams.noduleRadius,
// // // // // // // // // //     }), [shellControls, defaultShellParams]);

// // // // // // // // // //     // Inertia calculation using final params
// // // // // // // // // //     const effectiveInertia = useMemo(() => resonatorControls.inertiaScale * (finalShellParams.outerRadius ** 5 - (finalShellParams.outerRadius - finalShellParams.thickness) ** 5) / finalShellParams.outerRadius ** 5,
// // // // // // // // // //                                  [resonatorControls.inertiaScale, finalShellParams.outerRadius, finalShellParams.thickness]);

// // // // // // // // // //     // Physics state initialization
// // // // // // // // // //     const physicsState = useRef<PhysicsState>({
// // // // // // // // // //          shell_angular_velocity_scalar: 0.0,
// // // // // // // // // //          effective_field_velocity_scalar: resonatorControls.baseFieldSpeed || 0,
// // // // // // // // // //          current_torque_scalar: 0.0,
// // // // // // // // // //     });

// // // // // // // // // //     // Particle data memoization
// // // // // // // // // //     const particleData = useMemo(() => {
// // // // // // // // // //         console.log(`Creating particle data for count: ${vizControls.particleCount}`);
// // // // // // // // // //         try {
// // // // // // // // // //              const data = [];
// // // // // // // // // //              const positions = new Float32Array(vizControls.particleCount * 3);
// // // // // // // // // //              for (let i = 0; i < vizControls.particleCount; i++) {
// // // // // // // // // //                  const u = Math.random() * Math.PI * 2; const v = Math.random() * Math.PI * 2;
// // // // // // // // // //                  const R = vizControls.torusMajorRadius; const r = vizControls.torusMinorRadius;
// // // // // // // // // //                  const randR = R + (Math.random() - 0.5) * 0.2; const randr = r * Math.sqrt(Math.random());
// // // // // // // // // //                  positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u);
// // // // // // // // // //                  positions[i * 3 + 1] = randr * Math.sin(v);
// // // // // // // // // //                  positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);
// // // // // // // // // //                  data.push({ u, v, R, r: randr, fieldIndex: 0 });
// // // // // // // // // //              }
// // // // // // // // // //              return { positions, data };
// // // // // // // // // //         } catch (error) { console.error("Error creating particle data:", error); return { positions: new Float32Array(0), data: [] }; }
// // // // // // // // // //      }, [vizControls.particleCount, vizControls.torusMajorRadius, vizControls.torusMinorRadius]); // Use specific control values

// // // // // // // // // //     // Particle buffer update effect
// // // // // // // // // //      useEffect(() => {
// // // // // // // // // //          if (particleGeoRef.current && particleData && particleData.positions) {
// // // // // // // // // //              const existingAttribute = particleGeoRef.current.getAttribute('position') as THREE.BufferAttribute | undefined;
// // // // // // // // // //              // Always update if attribute exists but size differs, or if attribute doesn't exist
// // // // // // // // // //              if (!existingAttribute || existingAttribute.array.length !== particleData.positions.length) {
// // // // // // // // // //                  particleGeoRef.current.setAttribute('position', new THREE.BufferAttribute(particleData.positions, 3, false));
// // // // // // // // // //                  console.log(`Particle buffer attribute CREATED/REPLACED (Count: ${particleData.positions.length / 3}).`);
// // // // // // // // // //              } else {
// // // // // // // // // //                  // Optional: If sizes match, could potentially update content if needed, but usually creation is enough
// // // // // // // // // //                  // console.log("Particle buffer exists and size matches.");
// // // // // // // // // //              }
// // // // // // // // // //          } else {
// // // // // // // // // //              if (particleGeoRef.current?.getAttribute('position')) {
// // // // // // // // // //                   particleGeoRef.current.deleteAttribute('position'); console.log("Particle buffer attribute removed.");
// // // // // // // // // //              }
// // // // // // // // // //          }
// // // // // // // // // //      }, [particleData]); // Depend only on particleData object ref

// // // // // // // // // //     // Animation loop
// // // // // // // // // //     useFrame((state, delta) => {
// // // // // // // // // //         const currentPhysics = physicsState.current;
// // // // // // // // // //         // V1 Physics Calculations
// // // // // // // // // //         const relative_speed = currentPhysics.effective_field_velocity_scalar - currentPhysics.shell_angular_velocity_scalar;
// // // // // // // // // //         currentPhysics.current_torque_scalar = resonatorControls.k_drag * resonatorControls.fieldIntensity * relative_speed;
// // // // // // // // // //         const angular_acceleration = currentPhysics.current_torque_scalar / effectiveInertia;
// // // // // // // // // //         currentPhysics.shell_angular_velocity_scalar += angular_acceleration * delta;
// // // // // // // // // //         currentPhysics.shell_angular_velocity_scalar *= (1 - resonatorControls.damping * delta);
// // // // // // // // // //         currentPhysics.effective_field_velocity_scalar = resonatorControls.baseFieldSpeed + resonatorControls.k_feedback * currentPhysics.shell_angular_velocity_scalar;

// // // // // // // // // //         // Dodecahedron Visual Update
// // // // // // // // // //         if (dodecahedronRef.current) {
// // // // // // // // // //              dodecahedronRef.current.rotation.y += currentPhysics.shell_angular_velocity_scalar * delta;
// // // // // // // // // //              const material = dodecahedronRef.current.material as THREE.MeshStandardMaterial;
// // // // // // // // // //              if (material?.emissive) { // Check material exists too
// // // // // // // // // //                  const maxTorqueEst = resonatorControls.k_drag * resonatorControls.fieldIntensity * (Math.abs(resonatorControls.baseFieldSpeed) * 1.5 + 1); // Safer estimation
// // // // // // // // // //                  const emissionStrength = Math.min(Math.abs(currentPhysics.current_torque_scalar) / (maxTorqueEst + 0.01), 1.0);
// // // // // // // // // //                  material.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5);
// // // // // // // // // //              }
// // // // // // // // // //         }

// // // // // // // // // //         // Particle Field Update
// // // // // // // // // //         if (vizControls.showParticles && particleGeoRef.current?.attributes.position && particlesRef.current && particleData?.data) {
// // // // // // // // // //              const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// // // // // // // // // //              const speed = currentPhysics.effective_field_velocity_scalar * resonatorControls.fieldIntensity;
// // // // // // // // // //              const pData = particleData.data;
// // // // // // // // // //              (particlesRef.current.material as THREE.PointsMaterial).size = vizControls.particleSize * (1 + resonatorControls.fieldIntensity * 0.5);
// // // // // // // // // //              (particlesRef.current.material as THREE.PointsMaterial).needsUpdate = true; // Ensure material updates take effect

// // // // // // // // // //              if (pData.length * 3 === positions.length) { // Ensure data and buffer match
// // // // // // // // // //                  for (let i = 0; i < pData.length; i++) {
// // // // // // // // // //                      const data = pData[i]; data.u += speed * delta;
// // // // // // // // // //                      const R = data.R; const r = data.r; const u = data.u; const v = data.v;
// // // // // // // // // //                      positions[i * 3]     = (R + r * Math.cos(v)) * Math.cos(u);
// // // // // // // // // //                      positions[i * 3 + 1] = r * Math.sin(v);
// // // // // // // // // //                      positions[i * 3 + 2] = (R + r * Math.cos(v)) * Math.sin(u);
// // // // // // // // // //                  }
// // // // // // // // // //                  particleGeoRef.current.attributes.position.needsUpdate = true;
// // // // // // // // // //              } else {
// // // // // // // // // //                   console.warn("Mismatch between particle data length and buffer length in useFrame.");
// // // // // // // // // //              }
// // // // // // // // // //         }
// // // // // // // // // //     });

// // // // // // // // // //     // Memoized Copper Material
// // // // // // // // // //     const copperMaterial = useMemo(() => new THREE.MeshStandardMaterial({
// // // // // // // // // //         name: 'Copper CSG Material', // Add name for debugging
// // // // // // // // // //         color: 0xB87333, metalness: 0.8, roughness: 0.3,
// // // // // // // // // //         emissive: 0x000000, emissiveIntensity: 1.0,
// // // // // // // // // //         side: THREE.DoubleSide
// // // // // // // // // //     }), []);

// // // // // // // // // //     return (
// // // // // // // // // //         <>
// // // // // // // // // //             <RomanDodecahedron
// // // // // // // // // //                 ref={dodecahedronRef}
// // // // // // // // // //                 outerRadius={finalShellParams.outerRadius}
// // // // // // // // // //                 thickness={finalShellParams.thickness}
// // // // // // // // // //                 holeBaseDiameter={finalShellParams.holeBaseDiameter}
// // // // // // // // // //                 holeRatio={finalShellParams.holeRatio}
// // // // // // // // // //                 noduleRadius={finalShellParams.noduleRadius}
// // // // // // // // // //                 material={copperMaterial} // Pass the memoized material
// // // // // // // // // //                 castShadow receiveShadow
// // // // // // // // // //             />
// // // // // // // // // //             {/* Conditionally render particles based on leva toggle */}
// // // // // // // // // //             {vizControls.showParticles && (
// // // // // // // // // //                  <points ref={particlesRef} name="FieldParticles"> {/* Add name */}
// // // // // // // // // //                      <bufferGeometry ref={particleGeoRef} />
// // // // // // // // // //                      <pointsMaterial
// // // // // // // // // //                          name="ParticleMaterial" // Add name
// // // // // // // // // //                          color={0x00ffff}
// // // // // // // // // //                          size={vizControls.particleSize} // Size managed in useFrame
// // // // // // // // // //                          transparent opacity={0.7}
// // // // // // // // // //                          blending={THREE.AdditiveBlending}
// // // // // // // // // //                          sizeAttenuation={true}
// // // // // // // // // //                          map={null}
// // // // // // // // // //                      />
// // // // // // // // // //                  </points>
// // // // // // // // // //             )}
// // // // // // // // // //         </>
// // // // // // // // // //     );
// // // // // // // // // // };

// // // // // // // // // // // --- Scene Component ---
// // // // // // // // // // const TemporalResonatorScene: React.FC = () => {
// // // // // // // // // //     return (
// // // // // // // // // //     <>
// // // // // // // // // //         <Leva collapsed={false} titleBar={{ title: 'Controls' }} />
// // // // // // // // // //         <Canvas
// // // // // // // // // //              style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', background: '#111122', zIndex: 0 }}
// // // // // // // // // //              camera={{ position: [3, 3, 5], fov: 75 }}
// // // // // // // // // //              gl={{ antialias: true }} shadows
// // // // // // // // // //         >
// // // // // // // // // //              {/* Increased Light Intensity */}
// // // // // // // // // //              <ambientLight intensity={0.5} />
// // // // // // // // // //              <hemisphereLight groundColor={0x404040} intensity={1.0} />
// // // // // // // // // //              <directionalLight
// // // // // // // // // //                  position={[5, 10, 7.5]} intensity={1.5} // Increased intensity
// // // // // // // // // //                  castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024}
// // // // // // // // // //                  shadow-camera-far={25} shadow-camera-left={-10} shadow-camera-right={10}
// // // // // // // // // //                  shadow-camera-top={10} shadow-camera-bottom={-10}
// // // // // // // // // //              />
// // // // // // // // // //              <ErrorBoundary>
// // // // // // // // // //                  <Suspense fallback={<LoadingPlaceholder />}>
// // // // // // // // // //                       <ResonatorSimulation />
// // // // // // // // // //                  </Suspense>
// // // // // // // // // //              </ErrorBoundary>
// // // // // // // // // //              <Controls />
// // // // // // // // // //              {/* Optional: Add helpers for debugging */}
// // // // // // // // // //              {/* <axesHelper args={[5]} /> */}
// // // // // // // // // //              {/* <gridHelper args={[10, 10]} /> */}
// // // // // // // // // //         </Canvas>
// // // // // // // // // //     </>
// // // // // // // // // // )};

// // // // // // // // // // // --- Loading Placeholder ---
// // // // // // // // // // const LoadingPlaceholder: React.FC = () => {
// // // // // // // // // //     return (
// // // // // // // // // //         <mesh>
// // // // // // // // // //             <boxGeometry args={[0.1, 0.1, 0.1]} />
// // // // // // // // // //             <meshBasicMaterial color="orange" wireframe attach="material" /> {/* Use attach */}
// // // // // // // // // //         </mesh>
// // // // // // // // // //     );
// // // // // // // // // // };

// // // // // // // // // // export default TemporalResonatorScene;


// // // // // // // // // // // // TemporalResonatorScene_V2_CSG_Fixes_4.tsx
// // // // // // // // // // // import React, { useRef, useState, useEffect, useMemo, Suspense } from 'react';
// // // // // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // // // // // import * as THREE from 'three';
// // // // // // // // // // // import ErrorBoundary from './errorBoundary';
// // // // // // // // // // // import { useControls, Leva } from 'leva';
// // // // // // // // // // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// // // // // // // // // // // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // // // // // // // // // // THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
// // // // // // // // // // // THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
// // // // // // // // // // // THREE.Mesh.prototype.raycast = acceleratedRaycast;

// // // // // // // // // // // const csgEvaluator = new Evaluator();
// // // // // // // // // // // csgEvaluator.useGroups = true;

// // // // // // // // // // // extend({ OrbitControls });

// // // // // // // // // // // // --- Constants ---
// // // // // // // // // // // const PHI = (1 + Math.sqrt(5)) / 2;
// // // // // // // // // // // const INV_PHI = 1 / PHI;

// // // // // // // // // // // // --- Helper: Get Dodecahedron Math Data (WITH DEBUGGING) ---
// // // // // // // // // // // function getDodecahedronData(radius: number) {
// // // // // // // // // // //     console.log(`--- Calculating Dodecahedron Data for radius: ${radius} ---`); // DEBUG START
// // // // // // // // // // //     if (radius <= 0 || !Number.isFinite(radius)) {
// // // // // // // // // // //         console.error("!!! Invalid radius passed:", radius);
// // // // // // // // // // //         throw new Error("Invalid radius");
// // // // // // // // // // //     }

// // // // // // // // // // //     const uniqueVerticesMap = new Map<string, THREE.Vector3>();
// // // // // // // // // // //     console.log(`PHI: ${PHI.toFixed(6)}, INV_PHI: ${INV_PHI.toFixed(6)}`); // DEBUG

// // // // // // // // // // //     const coords = [
// // // // // // // // // // //         [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1], [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
// // // // // // // // // // //         [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI],
// // // // // // // // // // //         [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI],
// // // // // // // // // // //         [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0]
// // // // // // // // // // //     ];

// // // // // // // // // // //     const distOriginToVertex = Math.sqrt(PHI*PHI + INV_PHI*INV_PHI);
// // // // // // // // // // //     const scale = radius / distOriginToVertex;
// // // // // // // // // // //     console.log(`distOriginToVertex: ${distOriginToVertex.toFixed(6)}, scale: ${scale.toFixed(6)}`); // DEBUG
// // // // // // // // // // //     if (!Number.isFinite(scale) || scale === 0) {
// // // // // // // // // // //         console.error("!!! Invalid scale factor calculated:", scale);
// // // // // // // // // // //         throw new Error("Invalid scale factor");
// // // // // // // // // // //     }

// // // // // // // // // // //     coords.forEach((v, index) => {
// // // // // // // // // // //         const x = v[0] * scale;
// // // // // // // // // // //         const y = v[1] * scale;
// // // // // // // // // // //         const z = v[2] * scale;
// // // // // // // // // // //         const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
// // // // // // // // // // //         // console.log(`Vertex ${index}: Scaled [${x.toFixed(6)}, ${y.toFixed(6)}, ${z.toFixed(6)}] -> Key: ${key}`); // DEBUG (Verbose)
// // // // // // // // // // //         if (!uniqueVerticesMap.has(key)) {
// // // // // // // // // // //             uniqueVerticesMap.set(key, new THREE.Vector3(x, y, z));
// // // // // // // // // // //         } else {
// // // // // // // // // // //              // This should ideally not happen often if coordinates are distinct
// // // // // // // // // // //              console.warn(` -> Key ${key} collision detected at index ${index}!`); // DEBUG COLLISION
// // // // // // // // // // //         }
// // // // // // // // // // //     });

// // // // // // // // // // //     const vertices = Array.from(uniqueVerticesMap.values());
// // // // // // // // // // //     console.log(`--- Generated ${vertices.length} unique vertices. ---`); // DEBUG COUNT

// // // // // // // // // // //     // ... face data calculation ...
// // // // // // // // // // //     const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
// // // // // // // // // // //     const icoVerts = [ [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1] ];
// // // // // // // // // // //     const faceCenterDist = radius * 1.53 / 1.902;
// // // // // // // // // // //     // console.log(`Calculated faceCenterDist: ${faceCenterDist.toFixed(6)}`); // DEBUG
// // // // // // // // // // //     icoVerts.forEach(v => { const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize(); const center = normal.clone().multiplyScalar(faceCenterDist); faceData.push({ center, normal }); });
// // // // // // // // // // //     // console.log(`Generated ${faceData.length} face data entries.`); // DEBUG

// // // // // // // // // // //     if (vertices.length !== 20 || faceData.length !== 12) {
// // // // // // // // // // //          // Log the generated vertices if the count is wrong
// // // // // // // // // // //          console.error("!!! Vertex generation failed. Generated vertices:", vertices);
// // // // // // // // // // //          throw new Error(`Incorrect math data count: ${vertices.length} vertices, ${faceData.length} faces`);
// // // // // // // // // // //     }
// // // // // // // // // // //     console.log("--- Dodecahedron Data Calculation Successful ---"); // DEBUG SUCCESS
// // // // // // // // // // //     return { vertices, faceData };
// // // // // // // // // // // }


// // // // // // // // // // // // --- Controls Component (Unchanged) ---
// // // // // // // // // // // const Controls = () => { /* ... */
// // // // // // // // // // //      const { camera, gl } = useThree(); const controlsRef = useRef<OrbitControls>(null);
// // // // // // // // // // //      useEffect(() => { const controls = new OrbitControls(camera, gl.domElement); controls.enableDamping = true; (controlsRef as any).current = controls; return () => { controls.dispose(); }; }, [camera, gl]);
// // // // // // // // // // //      useFrame(() => { controlsRef.current?.update(); }); return null;
// // // // // // // // // // //  };

// // // // // // // // // // // // --- Roman Dodecahedron CSG Component (Guard in useEffect might now be redundant but safe) ---
// // // // // // // // // // // interface RomanDodecahedronProps { outerRadius: number; thickness: number; holeBaseDiameter: number; holeRatio: number; noduleRadius: number; material?: THREE.Material; [key: string]: any;} // Make material optional too
// // // // // // // // // // // const RomanDodecahedron: React.FC<RomanDodecahedronProps> = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
// // // // // // // // // // //     ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, ...props }, ref) => {
// // // // // // // // // // //         const [calculatedGeometry, setCalculatedGeometry] = useState<THREE.BufferGeometry | null>(null);
// // // // // // // // // // //         useEffect(() => {
// // // // // // // // // // //             // Guard still useful as a safety check
// // // // // // // // // // //             if ( typeof outerRadius !== 'number' || /* ... other checks ... */ typeof noduleRadius !== 'number' || noduleRadius <= 0 || !Number.isFinite(noduleRadius) ) {
// // // // // // // // // // //                 console.log(`Skipping CSG calculation in useEffect: Invalid props received.`);
// // // // // // // // // // //                 setCalculatedGeometry(null); return;
// // // // // // // // // // //             }
// // // // // // // // // // //             console.log(`Calculating CSG Geometry in useEffect for outerRadius: ${outerRadius}`);
// // // // // // // // // // //             let geometry: THREE.BufferGeometry | null = null;
// // // // // // // // // // //             let shellBrush = { geometry: new THREE.DodecahedronGeometry(outerRadius, 1) };
// // // // // // // // // // //             try { /* ... CSG Logic ... */ geometry = shellBrush.geometry; geometry.computeVertexNormals(); geometry.center(); console.log("CSG Calculation Complete."); }
// // // // // // // // // // //             catch(error) { console.error("CSG Error in useEffect:", error); geometry = null; }
// // // // // // // // // // //             setCalculatedGeometry(geometry);
// // // // // // // // // // //             return () => { /* ... dispose previous geometry ... */ };
// // // // // // // // // // //         }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]);

// // // // // // // // // // //         if (!calculatedGeometry) { return null; }
// // // // // // // // // // //         // Use default material if none provided
// // // // // // // // // // //         const meshMaterial = material || new THREE.MeshStandardMaterial({ color: 0xff0000 });
// // // // // // // // // // //         return <mesh ref={ref} geometry={calculatedGeometry} material={meshMaterial} {...props} />;
// // // // // // // // // // // });

// // // // // // // // // // // // --- Physics State Interface (Unchanged) ---
// // // // // // // // // // // interface PhysicsState { /* ... */ shell_angular_velocity_scalar: number; effective_field_velocity_scalar: number; current_torque_scalar: number;}

// // // // // // // // // // // // --- Main Simulation Component (Provide Defaults) ---
// // // // // // // // // // // const ResonatorSimulation = () => {
// // // // // // // // // // //     const dodecahedronRef = useRef<THREE.Mesh>(null!);
// // // // // // // // // // //     const particlesRef = useRef<THREE.Points>(null!);
// // // // // // // // // // //     const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // // // // // // // //     // Leva controls
// // // // // // // // // // //     const params = useControls('Resonator Controls', { /* ... */
// // // // // // // // // // //         baseFieldSpeed: { value: 1.0, min: -5, max: 5, step: 0.1 },
// // // // // // // // // // //         fieldIntensity: { value: 1.0, min: 0.1, max: 5, step: 0.1 },
// // // // // // // // // // //         k_drag: { label: 'Induction Strength', value: 0.5, min: 0, max: 2, step: 0.05 },
// // // // // // // // // // //         inertiaScale: { label: 'Inertia Scale', value: 1.0, min: 0.1, max: 5, step: 0.1 },
// // // // // // // // // // //         damping: { value: 0.1, min: 0, max: 1, step: 0.01 },
// // // // // // // // // // //         k_feedback: { value: -0.2, min: -2, max: 2, step: 0.05 },
// // // // // // // // // // //     });
// // // // // // // // // // //     // Get potentially undefined values from Leva first
// // // // // // // // // // //     const shellParamsFromLeva = useControls('Shell Geometry', {
// // // // // // // // // // //          outerRadius: { value: 1.0, min: 0.5, max: 2.0, step: 0.1 },
// // // // // // // // // // //          thickness: { value: 0.05, min: 0.01, max: 0.3, step: 0.01 },
// // // // // // // // // // //          holeBaseDiameter: { value: 0.1, min: 0.01, max: 0.3, step: 0.01 },
// // // // // // // // // // //          holeRatio: { value: 1.2, min: 1.0, max: 1.6, step: 0.01 },
// // // // // // // // // // //          noduleRadius: { value: 0.1, min: 0.01, max: 0.3, step: 0.01 },
// // // // // // // // // // //      });
// // // // // // // // // // //     const vizParams = useControls('Visualization', { /* ... */
// // // // // // // // // // //         particleCount: { value: 1000, min: 100, max: 5000, step: 100 },
// // // // // // // // // // //         particleSize: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
// // // // // // // // // // //         torusMajorRadius: { value: 1.5, min: 0.5, max: 5, step: 0.1 },
// // // // // // // // // // //         torusMinorRadius: { value: 0.5, min: 0.1, max: 2, step: 0.05 },
// // // // // // // // // // //     });

// // // // // // // // // // //     // --- FIX: Define hardcoded defaults ---
// // // // // // // // // // //     const defaultShellParams = useMemo(() => ({
// // // // // // // // // // //         outerRadius: 1.0,
// // // // // // // // // // //         thickness: 0.05,
// // // // // // // // // // //         holeBaseDiameter: 0.1,
// // // // // // // // // // //         holeRatio: 1.2,
// // // // // // // // // // //         noduleRadius: 0.1,
// // // // // // // // // // //     }), []); // Empty dependency array - create only once

// // // // // // // // // // //     // --- FIX: Create final params, merging leva values over defaults ---
// // // // // // // // // // //     const finalShellParams = useMemo(() => ({
// // // // // // // // // // //         outerRadius: (typeof shellParamsFromLeva.outerRadius === 'number' && Number.isFinite(shellParamsFromLeva.outerRadius)) ? shellParamsFromLeva.outerRadius : defaultShellParams.outerRadius,
// // // // // // // // // // //         thickness: (typeof shellParamsFromLeva.thickness === 'number' && Number.isFinite(shellParamsFromLeva.thickness)) ? shellParamsFromLeva.thickness : defaultShellParams.thickness,
// // // // // // // // // // //         holeBaseDiameter: (typeof shellParamsFromLeva.holeBaseDiameter === 'number' && Number.isFinite(shellParamsFromLeva.holeBaseDiameter)) ? shellParamsFromLeva.holeBaseDiameter : defaultShellParams.holeBaseDiameter,
// // // // // // // // // // //         holeRatio: (typeof shellParamsFromLeva.holeRatio === 'number' && Number.isFinite(shellParamsFromLeva.holeRatio)) ? shellParamsFromLeva.holeRatio : defaultShellParams.holeRatio,
// // // // // // // // // // //         noduleRadius: (typeof shellParamsFromLeva.noduleRadius === 'number' && Number.isFinite(shellParamsFromLeva.noduleRadius)) ? shellParamsFromLeva.noduleRadius : defaultShellParams.noduleRadius,
// // // // // // // // // // //     }), [shellParamsFromLeva, defaultShellParams]); // Re-calculate if leva values change

// // // // // // // // // // //     // Typed assertions (still used for convenience)
// // // // // // // // // // //     const typedParams = params as any;
// // // // // // // // // // //     // const typedShellParams = shellParams as any; // Use finalShellParams now
// // // // // // // // // // //     const typedVizParams = vizParams as any;

// // // // // // // // // // //     // Inertia - Use finalShellParams
// // // // // // // // // // //     const effectiveInertia = useMemo(() => typedParams.inertiaScale * (finalShellParams.outerRadius ** 5 - (finalShellParams.outerRadius - finalShellParams.thickness) ** 5) / finalShellParams.outerRadius ** 5,
// // // // // // // // // // //                                  [typedParams.inertiaScale, finalShellParams.outerRadius, finalShellParams.thickness]); // Depend on final params

// // // // // // // // // // //     // Physics state ref - Use finalShellParams for initial derived values if needed
// // // // // // // // // // //     const physicsState = useRef<PhysicsState>({
// // // // // // // // // // //          shell_angular_velocity_scalar: 0.0,
// // // // // // // // // // //          effective_field_velocity_scalar: typedParams.baseFieldSpeed || 0,
// // // // // // // // // // //          current_torque_scalar: 0.0,
// // // // // // // // // // //     });

// // // // // // // // // // //     // Particle data memoization
// // // // // // // // // // //     const particleData = useMemo(() => { /* ... unchanged ... */ }, [typedVizParams.particleCount, typedVizParams.torusMajorRadius, typedVizParams.torusMinorRadius]);
// // // // // // // // // // //     // Particle buffer effect
// // // // // // // // // // //     useEffect(() => { /* ... unchanged ... */ }, [particleData]);
// // // // // // // // // // //     // Animation loop
// // // // // // // // // // //     useFrame((state, delta) => { /* ... V1 physics + Visual updates ... */ });
// // // // // // // // // // //     // Material
// // // // // // // // // // //     const copperMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xB87333, metalness: 0.8, roughness: 0.3, emissive: 0x000000, emissiveIntensity: 1.0, side: THREE.DoubleSide }), []);

// // // // // // // // // // //     return (
// // // // // // // // // // //         <>
// // // // // // // // // // //             {/* Pass the guaranteed valid finalShellParams */}
// // // // // // // // // // //             <RomanDodecahedron
// // // // // // // // // // //                 ref={dodecahedronRef}
// // // // // // // // // // //                 outerRadius={finalShellParams.outerRadius}
// // // // // // // // // // //                 thickness={finalShellParams.thickness}
// // // // // // // // // // //                 holeBaseDiameter={finalShellParams.holeBaseDiameter}
// // // // // // // // // // //                 holeRatio={finalShellParams.holeRatio}
// // // // // // // // // // //                 noduleRadius={finalShellParams.noduleRadius}
// // // // // // // // // // //                 material={copperMaterial}
// // // // // // // // // // //                 castShadow receiveShadow
// // // // // // // // // // //             />
// // // // // // // // // // //             {/* Points */}
// // // // // // // // // // //             <points ref={particlesRef}>
// // // // // // // // // // //                  <bufferGeometry ref={particleGeoRef} />
// // // // // // // // // // //                  <pointsMaterial color={0x00ffff} size={typedVizParams.particleSize} transparent opacity={0.7} blending={THREE.AdditiveBlending} sizeAttenuation={true} map={null} />
// // // // // // // // // // //             </points>
// // // // // // // // // // //         </>
// // // // // // // // // // //     );
// // // // // // // // // // // };

// // // // // // // // // // // // --- Scene Component (Container - Unchanged) ---
// // // // // // // // // // // const TemporalResonatorScene: React.FC = () => { /* ... */ return (<>{/* Leva */}<Canvas>{/* Lights */}<ErrorBoundary><Suspense fallback={<LoadingPlaceholder />}><ResonatorSimulation /></Suspense></ErrorBoundary><Controls /></Canvas></>);};
// // // // // // // // // // // const LoadingPlaceholder = () => { /* ... */ return (<mesh><boxGeometry args={[0.1, 0.1, 0.1]} /><meshBasicMaterial color="orange" wireframe /></mesh>);};
// // // // // // // // // // // export default TemporalResonatorScene;


// // // // // // // // // // // // // TemporalResonatorScene_V2_CSG_Fixes_4.tsx
// // // // // // // // // // // // import React, { useRef, useEffect, useMemo, Suspense } from 'react';
// // // // // // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // // // // // // import * as THREE from 'three';
// // // // // // // // // // // // import ErrorBoundary from './errorBoundary';
// // // // // // // // // // // // import { useControls, Leva } from 'leva';
// // // // // // // // // // // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// // // // // // // // // // // // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // // // // // // // // // // // THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
// // // // // // // // // // // // THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
// // // // // // // // // // // // THREE.Mesh.prototype.raycast = acceleratedRaycast;

// // // // // // // // // // // // const csgEvaluator = new Evaluator();
// // // // // // // // // // // // csgEvaluator.useGroups = true;

// // // // // // // // // // // // extend({ OrbitControls });

// // // // // // // // // // // // // --- Constants ---
// // // // // // // // // // // // const PHI = (1 + Math.sqrt(5)) / 2;
// // // // // // // // // // // // const INV_PHI = 1 / PHI;

// // // // // // // // // // // // // --- Helper: Get Dodecahedron Math Data (FIXED Vertex Uniqueness) ---
// // // // // // // // // // // // function getDodecahedronData(radius: number) {
// // // // // // // // // // // //     const uniqueVerticesMap = new Map<string, THREE.Vector3>(); // Use Map for uniqueness

// // // // // // // // // // // //     // Standard vertex coordinates components
// // // // // // // // // // // //     const coords = [
// // // // // // // // // // // //         [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1],
// // // // // // // // // // // //         [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1], // (±1, ±1, ±1)
// // // // // // // // // // // //         [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI], // (0, ±φ, ±1/φ)
// // // // // // // // // // // //         [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI], // (±1/φ, 0, ±φ)
// // // // // // // // // // // //         [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0]  // (±φ, ±1/φ, 0)
// // // // // // // // // // // //     ];

// // // // // // // // // // // //     // Find scale factor (distance from origin to a known vertex like (PHI, INV_PHI, 0))
// // // // // // // // // // // //     const distOriginToVertex = Math.sqrt(PHI*PHI + INV_PHI*INV_PHI); // ~1.9021
// // // // // // // // // // // //     const scale = radius / distOriginToVertex;

// // // // // // // // // // // //     coords.forEach(v => {
// // // // // // // // // // // //         const x = v[0] * scale;
// // // // // // // // // // // //         const y = v[1] * scale;
// // // // // // // // // // // //         const z = v[2] * scale;
// // // // // // // // // // // //         // Use a precise key for the Map
// // // // // // // // // // // //         const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
// // // // // // // // // // // //         if (!uniqueVerticesMap.has(key)) {
// // // // // // // // // // // //             uniqueVerticesMap.set(key, new THREE.Vector3(x, y, z));
// // // // // // // // // // // //         }
// // // // // // // // // // // //     });

// // // // // // // // // // // //     const vertices = Array.from(uniqueVerticesMap.values()); // Convert Map values to array

// // // // // // // // // // // //     // Face centers & normals (dual icosahedron vertices)
// // // // // // // // // // // //     const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
// // // // // // // // // // // //     const icoVerts = [ // Coordinates for icosahedron vertices (will be scaled)
// // // // // // // // // // // //         [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
// // // // // // // // // // // //         [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
// // // // // // // // // // // //         [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
// // // // // // // // // // // //     ];

// // // // // // // // // // // //     // Estimate face center distance (approx relation to radius)
// // // // // // // // // // // //     const faceCenterDist = radius * 1.53 / 1.902; // Adjust if needed

// // // // // // // // // // // //     icoVerts.forEach(v => {
// // // // // // // // // // // //         const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize();
// // // // // // // // // // // //         const center = normal.clone().multiplyScalar(faceCenterDist);
// // // // // // // // // // // //         faceData.push({ center, normal });
// // // // // // // // // // // //     });

// // // // // // // // // // // //     // Final check (should pass now)
// // // // // // // // // // // //     if (vertices.length !== 20 || faceData.length !== 12) {
// // // // // // // // // // // //          // Throw error ONLY if count is wrong after the Map fix
// // // // // // // // // // // //          throw new Error(`Incorrect math data count: ${vertices.length} vertices, ${faceData.length} faces`);
// // // // // // // // // // // //     }

// // // // // // // // // // // //     return { vertices, faceData };
// // // // // // // // // // // // }


// // // // // // // // // // // // // --- Controls Component (Unchanged) ---
// // // // // // // // // // // // const Controls = () => { /* ... */
// // // // // // // // // // // //      const { camera, gl } = useThree(); const controlsRef = useRef<OrbitControls>(null);
// // // // // // // // // // // //      useEffect(() => { const controls = new OrbitControls(camera, gl.domElement); controls.enableDamping = true; (controlsRef as any).current = controls; return () => { controls.dispose(); }; }, [camera, gl]);
// // // // // // // // // // // //      useFrame(() => { controlsRef.current?.update(); }); return null;
// // // // // // // // // // // //  };

// // // // // // // // // // // // // --- Roman Dodecahedron CSG Component (Unchanged, relies on fixed helper) ---
// // // // // // // // // // // // interface RomanDodecahedronProps { /* ... */ outerRadius: number; thickness: number; holeBaseDiameter: number; holeRatio: number; noduleRadius: number; material: THREE.Material; [key: string]: any;}
// // // // // // // // // // // // const RomanDodecahedron: React.FC<RomanDodecahedronProps> = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>( /* ... CSG logic using math data ... */
// // // // // // // // // // // //     ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, ...props }, ref) => {
// // // // // // // // // // // //         const geometry = useMemo(() => {
// // // // // // // // // // // //              console.log("Recalculating CSG Geometry using Math Data...");
// // // // // // // // // // // //              const detailLevel = 1;
// // // // // // // // // // // //              try {
// // // // // // // // // // // //                  const { vertices: mathVertices, faceData: mathFaceData } = getDodecahedronData(outerRadius); // Use fixed helper
// // // // // // // // // // // //                  // Base shell
// // // // // // // // // // // //                  const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, detailLevel); outerDodecGeo.computeBoundsTree();
// // // // // // // // // // // //                  const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, detailLevel); innerDodecGeo.computeBoundsTree();
// // // // // // // // // // // //                  let outerBrush = new Brush(outerDodecGeo); let innerBrush = new Brush(innerDodecGeo); innerBrush.updateMatrixWorld();
// // // // // // // // // // // //                  let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
// // // // // // // // // // // //                  outerBrush.geometry.dispose(); innerBrush.geometry.dispose();
// // // // // // // // // // // //                  // Holes
// // // // // // // // // // // //                  const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * (holeRatio ** i));
// // // // // // // // // // // //                  const cylinderHeight = thickness * 3; const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16);
// // // // // // // // // // // //                  cylinderGeo.rotateX(Math.PI / 2); cylinderGeo.computeBoundsTree(); const tempQuat = new THREE.Quaternion();
// // // // // // // // // // // //                  mathFaceData.forEach((face, index) => { /* ... subtract holes ... */
// // // // // // // // // // // //                       const holeRadius = holeDiameters[index] / 2; if (!holeRadius || holeRadius <= 0) { return; }
// // // // // // // // // // // //                       const holeBrush = new Brush(cylinderGeo); holeBrush.scale.set(holeRadius, holeRadius, 1);
// // // // // // // // // // // //                       tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal); holeBrush.quaternion.copy(tempQuat);
// // // // // // // // // // // //                       holeBrush.position.copy(face.center); holeBrush.updateMatrixWorld();
// // // // // // // // // // // //                       shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION);
// // // // // // // // // // // //                   });
// // // // // // // // // // // //                  cylinderGeo.dispose();
// // // // // // // // // // // //                  // Nodules
// // // // // // // // // // // //                  const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6); noduleGeo.computeBoundsTree();
// // // // // // // // // // // //                  mathVertices.forEach(vertexPos => { /* ... add nodules ... */
// // // // // // // // // // // //                       const noduleBrush = new Brush(noduleGeo); noduleBrush.position.copy(vertexPos);
// // // // // // // // // // // //                       noduleBrush.updateMatrixWorld(); shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
// // // // // // // // // // // //                   });
// // // // // // // // // // // //                  noduleGeo.dispose();
// // // // // // // // // // // //                  // Final Geometry & Recenter
// // // // // // // // // // // //                  const finalGeometry = shellBrush.geometry; finalGeometry.computeVertexNormals(); finalGeometry.center();
// // // // // // // // // // // //                  console.log("CSG Geometry Recalculation Complete & Centered."); return finalGeometry;
// // // // // // // // // // // //              } catch(error) { console.error("CSG Error:", error); return new THREE.BufferGeometry(); }
// // // // // // // // // // // //          }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]);
// // // // // // // // // // // //         useEffect(() => { /* ... dispose geometry ... */ return () => { if (geometry && typeof (geometry as any).dispose === 'function') { (geometry as any).dispose(); console.log("Disposed CSG geometry"); } }; }, [geometry]);
// // // // // // // // // // // //         return <mesh ref={ref} geometry={geometry} material={material} {...props} />;
// // // // // // // // // // // // });

// // // // // // // // // // // // // --- Physics State Interface (Unchanged) ---
// // // // // // // // // // // // interface PhysicsState { /* ... */ shell_angular_velocity_scalar: number; effective_field_velocity_scalar: number; current_torque_scalar: number;}

// // // // // // // // // // // // // --- Main Simulation Component (Particle Buffer Fix) ---
// // // // // // // // // // // // const ResonatorSimulation = () => {
// // // // // // // // // // // //     const dodecahedronRef = useRef<THREE.Mesh>(null!);
// // // // // // // // // // // //     const particlesRef = useRef<THREE.Points>(null!);
// // // // // // // // // // // //     const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // // // // // // // // //     // Leva controls
// // // // // // // // // // // //     const params = useControls('Resonator Controls', { /* ... */ });
// // // // // // // // // // // //     const shellParams = useControls('Shell Geometry', { /* ... */ });
// // // // // // // // // // // //     const vizParams = useControls('Visualization', { /* ... */ });
// // // // // // // // // // // //     // Typed assertions (workaround)
// // // // // // // // // // // //     const typedParams = params as any; const typedShellParams = shellParams as any; const typedVizParams = vizParams as any;
// // // // // // // // // // // //     // Inertia calculation
// // // // // // // // // // // //     const effectiveInertia = useMemo(() => typedParams.inertiaScale * (typedShellParams.outerRadius ** 5 - (typedShellParams.outerRadius - typedShellParams.thickness) ** 5) / typedShellParams.outerRadius ** 5, [typedParams.inertiaScale, typedShellParams.outerRadius, typedShellParams.thickness]);
// // // // // // // // // // // //     // Physics state ref
// // // // // // // // // // // //     const physicsState = useRef<PhysicsState>({ shell_angular_velocity_scalar: 0.0, effective_field_velocity_scalar: typedParams.baseFieldSpeed, current_torque_scalar: 0.0, });

// // // // // // // // // // // //     // Particle data memoization
// // // // // // // // // // // //     const particleData = useMemo(() => {
// // // // // // // // // // // //         try { /* ... create particle positions and data ... */
// // // // // // // // // // // //              const data = []; const positions = new Float32Array(typedVizParams.particleCount * 3);
// // // // // // // // // // // //              for (let i = 0; i < typedVizParams.particleCount; i++) {
// // // // // // // // // // // //                  const u = Math.random() * Math.PI * 2; const v = Math.random() * Math.PI * 2; const R = typedVizParams.torusMajorRadius; const r = typedVizParams.torusMinorRadius; const randR = R + (Math.random() - 0.5) * 0.2; const randr = r * Math.sqrt(Math.random());
// // // // // // // // // // // //                  positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u); positions[i * 3 + 1] = randr * Math.sin(v); positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);
// // // // // // // // // // // //                  data.push({ u, v, R, r: randr, fieldIndex: 0 }); }
// // // // // // // // // // // //              return { positions, data };
// // // // // // // // // // // //         } catch (error) { console.error("Error creating particle data:", error); return { positions: new Float32Array(0), data: [] }; }
// // // // // // // // // // // //      }, [typedVizParams.particleCount, typedVizParams.torusMajorRadius, typedVizParams.torusMinorRadius]);


// // // // // // // // // // // //     // --- FIX: Particle Buffer Update Effect ---
// // // // // // // // // // // //      useEffect(() => {
// // // // // // // // // // // //          // Ensure geometry and data are ready
// // // // // // // // // // // //          if (particleGeoRef.current && particleData && particleData.positions) {
// // // // // // // // // // // //              // Check if attribute exists and if size matches
// // // // // // // // // // // //              const existingAttribute = particleGeoRef.current.getAttribute('position') as THREE.BufferAttribute | undefined;
// // // // // // // // // // // //              if (existingAttribute && existingAttribute.array.length === particleData.positions.length) {
// // // // // // // // // // // //                  // If size matches, just update the array content (if needed, though initial set is main goal)
// // // // // // // // // // // //                  // existingAttribute.copyArray(particleData.positions); // Alternative to full replace
// // // // // // // // // // // //                  // existingAttribute.needsUpdate = true;
// // // // // // // // // // // //                  // console.log("Particle buffer array content updated (size matched).");
// // // // // // // // // // // //              } else {
// // // // // // // // // // // //                  // If attribute doesn't exist or size differs, create/replace it
// // // // // // // // // // // //                  particleGeoRef.current.setAttribute('position', new THREE.BufferAttribute(particleData.positions, 3, false)); // normalize = false
// // // // // // // // // // // //                  console.log("Particle buffer attribute CREATED/REPLACED.");
// // // // // // // // // // // //              }
// // // // // // // // // // // //          } else {
// // // // // // // // // // // //               // Clean up old attribute if data is gone? Optional.
// // // // // // // // // // // //               if (particleGeoRef.current?.getAttribute('position')) {
// // // // // // // // // // // //                    particleGeoRef.current.deleteAttribute('position');
// // // // // // // // // // // //                    console.log("Particle buffer attribute removed (no data).");
// // // // // // // // // // // //               }
// // // // // // // // // // // //          }
// // // // // // // // // // // //      }, [particleData]); // Rerun ONLY when the particleData object reference changes


// // // // // // // // // // // //     useFrame((state, delta) => {
// // // // // // // // // // // //         const currentPhysics = physicsState.current;
// // // // // // // // // // // //         // V1 Physics Placeholder
// // // // // // // // // // // //         /* ... physics calculations ... */
// // // // // // // // // // // //         const relative_speed = currentPhysics.effective_field_velocity_scalar - currentPhysics.shell_angular_velocity_scalar; currentPhysics.current_torque_scalar = typedParams.k_drag * typedParams.fieldIntensity * relative_speed; const angular_acceleration = currentPhysics.current_torque_scalar / effectiveInertia; currentPhysics.shell_angular_velocity_scalar += angular_acceleration * delta; currentPhysics.shell_angular_velocity_scalar *= (1 - typedParams.damping * delta); currentPhysics.effective_field_velocity_scalar = typedParams.baseFieldSpeed + typedParams.k_feedback * currentPhysics.shell_angular_velocity_scalar;

// // // // // // // // // // // //         // Visuals Update
// // // // // // // // // // // //         if (dodecahedronRef.current) { /* ... rotation + emissive */ dodecahedronRef.current.rotation.y += currentPhysics.shell_angular_velocity_scalar * delta; const material = dodecahedronRef.current.material as THREE.MeshStandardMaterial; if (material.emissive) { const maxExpectedTorque = typedParams.k_drag * typedParams.fieldIntensity * (typedParams.baseFieldSpeed * 1.5); const emissionStrength = Math.min(Math.abs(currentPhysics.current_torque_scalar) / (maxExpectedTorque + 0.01), 1.0); material.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5); } }

// // // // // // // // // // // //         // Particle Field Update
// // // // // // // // // // // //         if (particleGeoRef.current?.attributes.position && particlesRef.current && particleData?.data) {
// // // // // // // // // // // //              const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// // // // // // // // // // // //              // --- FIX: Remove the size check and attribute reset from here ---
// // // // // // // // // // // //              // if (positions.length === typedVizParams.particleCount * 3) { // REMOVED CHECK
// // // // // // // // // // // //                  const speed = currentPhysics.effective_field_velocity_scalar * typedParams.fieldIntensity;
// // // // // // // // // // // //                  const pData = particleData.data;
// // // // // // // // // // // //                  (particlesRef.current.material as THREE.PointsMaterial).size = typedVizParams.particleSize * (1 + typedParams.fieldIntensity * 0.5);

// // // // // // // // // // // //                  for (let i = 0; i < pData.length; i++) { // Iterate based on pData length
// // // // // // // // // // // //                      // Check array bounds just in case
// // // // // // // // // // // //                      if (i * 3 + 2 >= positions.length) break;

// // // // // // // // // // // //                      const data = pData[i]; data.u += speed * delta;
// // // // // // // // // // // //                      const R = data.R; const r = data.r; const u = data.u; const v = data.v;
// // // // // // // // // // // //                      positions[i * 3]     = (R + r * Math.cos(v)) * Math.cos(u);
// // // // // // // // // // // //                      positions[i * 3 + 1] = r * Math.sin(v);
// // // // // // // // // // // //                      positions[i * 3 + 2] = (R + r * Math.cos(v)) * Math.sin(u);
// // // // // // // // // // // //                  }
// // // // // // // // // // // //                  particleGeoRef.current.attributes.position.needsUpdate = true;
// // // // // // // // // // // //             // } else { // REMOVED ELSE BLOCK
// // // // // // // // // // // //             //    console.warn("Particle buffer size mismatch inside useFrame."); // Should not happen now
// // // // // // // // // // // //             // }
// // // // // // // // // // // //         }
// // // // // // // // // // // //     });

// // // // // // // // // // // //     const copperMaterial = useMemo(() => new THREE.MeshStandardMaterial({ /* ... */ color: 0xB87333, metalness: 0.8, roughness: 0.3, emissive: 0x000000, emissiveIntensity: 1.0, side: THREE.DoubleSide }), []);

// // // // // // // // // // // //     return (
// // // // // // // // // // // //         <>
// // // // // // // // // // // //             <RomanDodecahedron ref={dodecahedronRef} outerRadius={typedShellParams.outerRadius} thickness={typedShellParams.thickness} holeBaseDiameter={typedShellParams.holeBaseDiameter} holeRatio={typedShellParams.holeRatio} noduleRadius={typedShellParams.noduleRadius} material={copperMaterial} castShadow receiveShadow />
// // // // // // // // // // // //             <points ref={particlesRef}>
// // // // // // // // // // // //                  {/* Geometry ref is enough, attribute is handled by effect */}
// // // // // // // // // // // //                  <bufferGeometry ref={particleGeoRef} />
// // // // // // // // // // // //                  <pointsMaterial color={0x00ffff} size={typedVizParams.particleSize} transparent opacity={0.7} blending={THREE.AdditiveBlending} sizeAttenuation={true} map={null} />
// // // // // // // // // // // //             </points>
// // // // // // // // // // // //         </>
// // // // // // // // // // // //     );
// // // // // // // // // // // // };

// // // // // // // // // // // // // --- Scene Component (Container - Unchanged) ---
// // // // // // // // // // // // const TemporalResonatorScene: React.FC = () => { /* ... */ return (<>{/* Leva */}<Canvas>{/* Lights */}<ErrorBoundary><Suspense fallback={<LoadingPlaceholder />}><ResonatorSimulation /></Suspense></ErrorBoundary><Controls /></Canvas></>);};
// // // // // // // // // // // // const LoadingPlaceholder = () => { /* ... */ return (<mesh><boxGeometry args={[0.1, 0.1, 0.1]} /><meshBasicMaterial color="orange" wireframe /></mesh>);};
// // // // // // // // // // // // export default TemporalResonatorScene;


// // // // // // // // // // // // // // TemporalResonatorScene_V2_CSG_Fixes_3.tsx
// // // // // // // // // // // // // import React, { useRef, useEffect, useMemo, Suspense } from 'react';
// // // // // // // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // // // // // // // import * as THREE from 'three';
// // // // // // // // // // // // // import ErrorBoundary from './errorBoundary';
// // // // // // // // // // // // // import { useControls, Leva } from 'leva';
// // // // // // // // // // // // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// // // // // // // // // // // // // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // // // // // // // // // // // // THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
// // // // // // // // // // // // // THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
// // // // // // // // // // // // // THREE.Mesh.prototype.raycast = acceleratedRaycast;

// // // // // // // // // // // // // const csgEvaluator = new Evaluator();
// // // // // // // // // // // // // csgEvaluator.useGroups = true;

// // // // // // // // // // // // // extend({ OrbitControls });

// // // // // // // // // // // // // // --- Constants ---
// // // // // // // // // // // // // const PHI = (1 + Math.sqrt(5)) / 2; // Golden ratio
// // // // // // // // // // // // // const INV_PHI = 1 / PHI;

// // // // // // // // // // // // // // --- Helper: Get Dodecahedron Math Data ---
// // // // // // // // // // // // // function getDodecahedronData(radius: number) {
// // // // // // // // // // // // //     const vertices: THREE.Vector3[] = [];
// // // // // // // // // // // // //     // Vertices based on permutations (scaled for radius 1 initially, then scaled by actual radius)
// // // // // // // // // // // // //     // Standard vertex positions for radius sqrt(3)
// // // // // // // // // // // // //     const baseVerts = [
// // // // // // // // // // // // //         [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1],
// // // // // // // // // // // // //         [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1]
// // // // // // // // // // // // //     ];
// // // // // // // // // // // // //     const phiVerts = [
// // // // // // // // // // // // //         [0, PHI, INV_PHI], [0, -PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, -INV_PHI],
// // // // // // // // // // // // //         [INV_PHI, 0, PHI], [-INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, -PHI],
// // // // // // // // // // // // //         [PHI, INV_PHI, 0], [-PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, -INV_PHI, 0]
// // // // // // // // // // // // //     ];

// // // // // // // // // // // // //     // Calculate scale factor: DodecahedronGeometry(1) seems to have vertices at distance ~1.902 from origin.
// // // // // // // // // // // // //     // Let's use the PHI-based vertices which naturally give radius ~sqrt(3)? No, needs scaling.
// // // // // // // // // // // // //     // Let vertex (PHI, INV_PHI, 0) define the radius. dist = sqrt(PHI^2 + INV_PHI^2)
// // // // // // // // // // // // //     const distOriginToVertex = Math.sqrt(PHI*PHI + INV_PHI*INV_PHI); // ~1.9021
// // // // // // // // // // // // //     const scale = radius / distOriginToVertex;

// // // // // // // // // // // // //     [...baseVerts, ...phiVerts].forEach(v => {
// // // // // // // // // // // // //         // Filter unique vertices based on rounded coords (handles permutations creating duplicates)
// // // // // // // // // // // // //         const x = v[0] * scale, y = v[1] * scale, z = v[2] * scale;
// // // // // // // // // // // // //         const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
// // // // // // // // // // // // //         // Use a Map to check uniqueness easily
// // // // // // // // // // // // //         if (!vertices.some(existingV => `${existingV.x.toFixed(4)},${existingV.y.toFixed(4)},${existingV.z.toFixed(4)}` === key)) {
// // // // // // // // // // // // //              vertices.push(new THREE.Vector3(x, y, z));
// // // // // // // // // // // // //         }
// // // // // // // // // // // // //     });
// // // // // // // // // // // // //      // Ensure exactly 20 unique vertices
// // // // // // // // // // // // //      if (vertices.length !== 20) {
// // // // // // // // // // // // //           console.warn(`Expected 20 vertices, but calculated ${vertices.length}. Using generated vertices anyway.`);
// // // // // // // // // // // // //           // Fallback might be needed if vertex calc is wrong.
// // // // // // // // // // // // //      }


// // // // // // // // // // // // //     // Face centers & normals (points towards vertices of dual icosahedron)
// // // // // // // // // // // // //     const faceData: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
// // // // // // // // // // // // //     const icoVerts = [
// // // // // // // // // // // // //         [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
// // // // // // // // // // // // //         [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
// // // // // // // // // // // // //         [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
// // // // // // // // // // // // //     ];

// // // // // // // // // // // // //     // Calculate distance from origin to face center for radius R
// // // // // // // // // // // // //     // Inradius of dodecahedron = R * PHI^2 / sqrt(3) ? No, that's circumradius relation.
// // // // // // // // // // // // //     // Inradius = edgeLength * PHI^2 / (2 * sqrt(3-PHI))
// // // // // // // // // // // // //     // Simpler: Face center distance = scale * sqrt(2 + PHI) ? No.
// // // // // // // // // // // // //     // Let's scale the NORMAL vector from the icosahedron vertex to an appropriate length.
// // // // // // // // // // // // //     // How far is face center in DodecahedronGeometry(1)? Let's estimate ~1.53
// // // // // // // // // // // // //     const faceCenterDist = radius * 1.53 / 1.902; // Scale proportionally

// // // // // // // // // // // // //     icoVerts.forEach(v => {
// // // // // // // // // // // // //         const normal = new THREE.Vector3(v[0], v[1], v[2]).normalize();
// // // // // // // // // // // // //         const center = normal.clone().multiplyScalar(faceCenterDist); // Place center along normal
// // // // // // // // // // // // //         faceData.push({ center, normal });
// // // // // // // // // // // // //     });

// // // // // // // // // // // // //     return { vertices, faceData };
// // // // // // // // // // // // // }


// // // // // // // // // // // // // // --- Controls Component (Unchanged) ---
// // // // // // // // // // // // // const Controls = () => { /* ... */
// // // // // // // // // // // // //      const { camera, gl } = useThree(); const controlsRef = useRef<OrbitControls>(null);
// // // // // // // // // // // // //      useEffect(() => { const controls = new OrbitControls(camera, gl.domElement); controls.enableDamping = true; (controlsRef as any).current = controls; return () => { controls.dispose(); }; }, [camera, gl]);
// // // // // // // // // // // // //      useFrame(() => { controlsRef.current?.update(); }); return null;
// // // // // // // // // // // // //  };

// // // // // // // // // // // // // // --- Roman Dodecahedron CSG Component (Using Math Data) ---
// // // // // // // // // // // // // interface RomanDodecahedronProps { /* ... */ outerRadius: number; thickness: number; holeBaseDiameter: number; holeRatio: number; noduleRadius: number; material: THREE.Material; [key: string]: any;}
// // // // // // // // // // // // // const RomanDodecahedron: React.FC<RomanDodecahedronProps> = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
// // // // // // // // // // // // //     ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, ...props }, ref) => {

// // // // // // // // // // // // //     const geometry = useMemo(() => {
// // // // // // // // // // // // //         console.log("Recalculating CSG Geometry using Math Data...");
// // // // // // // // // // // // //         const detailLevel = 1; // Keep detail low for CSG base

// // // // // // // // // // // // //         try {
// // // // // // // // // // // // //             // 0. Get Math Data
// // // // // // // // // // // // //             const { vertices: mathVertices, faceData: mathFaceData } = getDodecahedronData(outerRadius);
// // // // // // // // // // // // //             if (mathVertices.length !== 20 || mathFaceData.length !== 12) {
// // // // // // // // // // // // //                  throw new Error(`Incorrect math data count: ${mathVertices.length} vertices, ${mathFaceData.length} faces`);
// // // // // // // // // // // // //             }

// // // // // // // // // // // // //             // 1. Base Shell Brushes
// // // // // // // // // // // // //             const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, detailLevel);
// // // // // // // // // // // // //             outerDodecGeo.computeBoundsTree();
// // // // // // // // // // // // //             const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, detailLevel);
// // // // // // // // // // // // //             innerDodecGeo.computeBoundsTree();
// // // // // // // // // // // // //             let outerBrush = new Brush(outerDodecGeo); let innerBrush = new Brush(innerDodecGeo);
// // // // // // // // // // // // //             innerBrush.updateMatrixWorld();
// // // // // // // // // // // // //             let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
// // // // // // // // // // // // //             outerBrush.geometry.dispose(); innerBrush.geometry.dispose();

// // // // // // // // // // // // //             // 2. Holes (Cylinders - Using Math Face Data)
// // // // // // // // // // // // //             const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * (holeRatio ** i));
// // // // // // // // // // // // //             const cylinderHeight = thickness * 3; // Ensure it goes through
// // // // // // // // // // // // //             const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16);
// // // // // // // // // // // // //             cylinderGeo.rotateX(Math.PI / 2); cylinderGeo.computeBoundsTree();
// // // // // // // // // // // // //             const tempQuat = new THREE.Quaternion();

// // // // // // // // // // // // //             mathFaceData.forEach((face, index) => {
// // // // // // // // // // // // //                 const holeRadius = holeDiameters[index] / 2;
// // // // // // // // // // // // //                 if (!holeRadius || holeRadius <= 0) {
// // // // // // // // // // // // //                     console.warn(`Skipping hole ${index} due to invalid radius: ${holeRadius}`);
// // // // // // // // // // // // //                     return; // Skip this hole
// // // // // // // // // // // // //                 }
// // // // // // // // // // // // //                 const holeBrush = new Brush(cylinderGeo);
// // // // // // // // // // // // //                 holeBrush.scale.set(holeRadius, holeRadius, 1);
// // // // // // // // // // // // //                 // Align cylinder's Z-axis to the calculated face normal
// // // // // // // // // // // // //                 tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal);
// // // // // // // // // // // // //                 holeBrush.quaternion.copy(tempQuat);
// // // // // // // // // // // // //                 // Position cylinder at the calculated face center
// // // // // // // // // // // // //                 holeBrush.position.copy(face.center);
// // // // // // // // // // // // //                 holeBrush.updateMatrixWorld();
// // // // // // // // // // // // //                 shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION);
// // // // // // // // // // // // //             });
// // // // // // // // // // // // //             cylinderGeo.dispose(); // Dispose template geo

// // // // // // // // // // // // //             // 3. Nodules (Spheres - Using Math Vertex Data)
// // // // // // // // // // // // //             const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6);
// // // // // // // // // // // // //             noduleGeo.computeBoundsTree();
// // // // // // // // // // // // //             mathVertices.forEach(vertexPos => {
// // // // // // // // // // // // //                 const noduleBrush = new Brush(noduleGeo);
// // // // // // // // // // // // //                 noduleBrush.position.copy(vertexPos);
// // // // // // // // // // // // //                 noduleBrush.updateMatrixWorld();
// // // // // // // // // // // // //                 shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
// // // // // // // // // // // // //             });
// // // // // // // // // // // // //             noduleGeo.dispose(); // Dispose template geo

// // // // // // // // // // // // //             // 4. Final Geometry & Recenter
// // // // // // // // // // // // //             const finalGeometry = shellBrush.geometry;
// // // // // // // // // // // // //             finalGeometry.computeVertexNormals();
// // // // // // // // // // // // //             // --- FIX: Recenter the final geometry ---
// // // // // // // // // // // // //             finalGeometry.center();

// // // // // // // // // // // // //             console.log("CSG Geometry Recalculation Complete & Centered.");
// // // // // // // // // // // // //             return finalGeometry;

// // // // // // // // // // // // //         } catch(error) {
// // // // // // // // // // // // //             console.error("CSG Error:", error);
// // // // // // // // // // // // //             return new THREE.BufferGeometry();
// // // // // // // // // // // // //         }

// // // // // // // // // // // // //     }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]); // Dependencies

// // // // // // // // // // // // //     useEffect(() => { /* ... dispose effect ... */ return () => { if (geometry && typeof (geometry as any).dispose === 'function') { (geometry as any).dispose(); console.log("Disposed CSG geometry"); } }; }, [geometry]);

// // // // // // // // // // // // //     return <mesh ref={ref} geometry={geometry} material={material} {...props} />;
// // // // // // // // // // // // // });

// // // // // // // // // // // // // // --- Physics State Interface (Unchanged) ---
// // // // // // // // // // // // // interface PhysicsState { /* ... */ shell_angular_velocity_scalar: number; effective_field_velocity_scalar: number; current_torque_scalar: number;}

// // // // // // // // // // // // // // --- Main Simulation Component (Unchanged from previous attempt) ---
// // // // // // // // // // // // // const ResonatorSimulation = () => {
// // // // // // // // // // // // //     const dodecahedronRef = useRef<THREE.Mesh>(null!);
// // // // // // // // // // // // //     const particlesRef = useRef<THREE.Points>(null!);
// // // // // // // // // // // // //     const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // // // // // // // // // //     const params = useControls('Resonator Controls', { /* ... */ });
// // // // // // // // // // // // //     const shellParams = useControls('Shell Geometry', { /* ... */ });
// // // // // // // // // // // // //     const vizParams = useControls('Visualization', { /* ... */ });
// // // // // // // // // // // // //     const typedParams = params as any; const typedShellParams = shellParams as any; const typedVizParams = vizParams as any;
// // // // // // // // // // // // //     const effectiveInertia = useMemo(() => { /* ... */ return typedParams.inertiaScale * (typedShellParams.outerRadius ** 5 - (typedShellParams.outerRadius - typedShellParams.thickness) ** 5) / typedShellParams.outerRadius ** 5; }, [typedParams.inertiaScale, typedShellParams.outerRadius, typedShellParams.thickness]);
// // // // // // // // // // // // //     const physicsState = useRef<PhysicsState>({ shell_angular_velocity_scalar: 0.0, effective_field_velocity_scalar: typedParams.baseFieldSpeed, current_torque_scalar: 0.0, });
// // // // // // // // // // // // //     const particleData = useMemo(() => { try { /* ... create particle data ... */ const data = []; const positions = new Float32Array(typedVizParams.particleCount * 3); for (let i = 0; i < typedVizParams.particleCount; i++) { const u = Math.random() * Math.PI * 2; const v = Math.random() * Math.PI * 2; const R = typedVizParams.torusMajorRadius; const r = typedVizParams.torusMinorRadius; const randR = R + (Math.random() - 0.5) * 0.2; const randr = r * Math.sqrt(Math.random()); positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u); positions[i * 3 + 1] = randr * Math.sin(v); positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u); data.push({ u, v, R, r: randr, fieldIndex: 0 }); } return { positions, data }; } catch (error) { console.error("Error creating particle data:", error); return { positions: new Float32Array(0), data: [] }; } }, [typedVizParams.particleCount, typedVizParams.torusMajorRadius, typedVizParams.torusMinorRadius]);

// // // // // // // // // // // // //     useFrame((state, delta) => { /* ... V1 physics + Visual updates ... */
// // // // // // // // // // // // //         const currentPhysics = physicsState.current;
// // // // // // // // // // // // //         const relative_speed = currentPhysics.effective_field_velocity_scalar - currentPhysics.shell_angular_velocity_scalar;
// // // // // // // // // // // // //         currentPhysics.current_torque_scalar = typedParams.k_drag * typedParams.fieldIntensity * relative_speed;
// // // // // // // // // // // // //         const angular_acceleration = currentPhysics.current_torque_scalar / effectiveInertia;
// // // // // // // // // // // // //         currentPhysics.shell_angular_velocity_scalar += angular_acceleration * delta;
// // // // // // // // // // // // //         currentPhysics.shell_angular_velocity_scalar *= (1 - typedParams.damping * delta);
// // // // // // // // // // // // //         currentPhysics.effective_field_velocity_scalar = typedParams.baseFieldSpeed + typedParams.k_feedback * currentPhysics.shell_angular_velocity_scalar;
// // // // // // // // // // // // //         if (dodecahedronRef.current) { dodecahedronRef.current.rotation.y += currentPhysics.shell_angular_velocity_scalar * delta; const material = dodecahedronRef.current.material as THREE.MeshStandardMaterial; if (material.emissive) { const maxExpectedTorque = typedParams.k_drag * typedParams.fieldIntensity * (typedParams.baseFieldSpeed * 1.5); const emissionStrength = Math.min(Math.abs(currentPhysics.current_torque_scalar) / (maxExpectedTorque + 0.01), 1.0); material.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5); } }
// // // // // // // // // // // // //         if (particleGeoRef.current && particlesRef.current && particleData && particleData.positions) { const positions = particleGeoRef.current.attributes.position.array as Float32Array; if (positions.length === typedVizParams.particleCount * 3) { const speed = currentPhysics.effective_field_velocity_scalar * typedParams.fieldIntensity; const pData = particleData.data; (particlesRef.current.material as THREE.PointsMaterial).size = typedVizParams.particleSize * (1 + typedParams.fieldIntensity * 0.5); for (let i = 0; i < typedVizParams.particleCount; i++) { const data = pData[i]; data.u += speed * delta; const R = data.R; const r = data.r; const u = data.u; const v = data.v; positions[i * 3] = (R + r * Math.cos(v)) * Math.cos(u); positions[i * 3 + 1] = r * Math.sin(v); positions[i * 3 + 2] = (R + r * Math.cos(v)) * Math.sin(u); } particleGeoRef.current.attributes.position.needsUpdate = true; } else if (particleGeoRef.current.attributes.position) { console.warn("Particle buffer size mismatch."); particleGeoRef.current.setAttribute('position', new THREE.BufferAttribute(particleData.positions, 3)); } }
// // // // // // // // // // // // //      });

// // // // // // // // // // // // //     const copperMaterial = useMemo(() => new THREE.MeshStandardMaterial({ /* ... */ color: 0xB87333, metalness: 0.8, roughness: 0.3, emissive: 0x000000, emissiveIntensity: 1.0, side: THREE.DoubleSide }), []);
// // // // // // // // // // // // //     useEffect(() => { if (particleGeoRef.current && particleData && particleData.positions) { particleGeoRef.current.setAttribute('position', new THREE.BufferAttribute(particleData.positions, 3)); console.log("Particle buffer attribute updated/created."); } }, [particleData]);

// // // // // // // // // // // // //     return (
// // // // // // // // // // // // //         <>
// // // // // // // // // // // // //             <RomanDodecahedron
// // // // // // // // // // // // //                 ref={dodecahedronRef}
// // // // // // // // // // // // //                 outerRadius={typedShellParams.outerRadius} thickness={typedShellParams.thickness}
// // // // // // // // // // // // //                 holeBaseDiameter={typedShellParams.holeBaseDiameter} holeRatio={typedShellParams.holeRatio}
// // // // // // // // // // // // //                 noduleRadius={typedShellParams.noduleRadius}
// // // // // // // // // // // // //                 material={copperMaterial}
// // // // // // // // // // // // //                 castShadow receiveShadow
// // // // // // // // // // // // //             />
// // // // // // // // // // // // //             <points ref={particlesRef}>
// // // // // // // // // // // // //                  <bufferGeometry ref={particleGeoRef} /> {/* Attribute set by useEffect */}
// // // // // // // // // // // // //                  <pointsMaterial
// // // // // // // // // // // // //                      color={0x00ffff} size={typedVizParams.particleSize}
// // // // // // // // // // // // //                      transparent opacity={0.7} blending={THREE.AdditiveBlending}
// // // // // // // // // // // // //                      sizeAttenuation={true} // Keep true for distance scaling
// // // // // // // // // // // // //                      map={null}
// // // // // // // // // // // // //                  />
// // // // // // // // // // // // //             </points>
// // // // // // // // // // // // //         </>
// // // // // // // // // // // // //     );
// // // // // // // // // // // // // };

// // // // // // // // // // // // // // --- Scene Component (Container - Added Hemisphere Light) ---
// // // // // // // // // // // // // const TemporalResonatorScene: React.FC = () => (
// // // // // // // // // // // // //     <>
// // // // // // // // // // // // //         <Leva collapsed={false} titleBar={{ title: 'Controls' }} />
// // // // // // // // // // // // //         <Canvas
// // // // // // // // // // // // //              style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', background: '#111122', zIndex: 0 }}
// // // // // // // // // // // // //              camera={{ position: [3, 3, 5], fov: 75 }}
// // // // // // // // // // // // //              gl={{ antialias: true }} shadows
// // // // // // // // // // // // //         >
// // // // // // // // // // // // //              <ambientLight intensity={0.2} /> {/* Lower ambient slightly */}
// // // // // // // // // // // // //              {/* --- FIX: Add Hemisphere Light --- */}
// // // // // // // // // // // // //              <hemisphereLight groundColor={0x404040} intensity={0.6} />
// // // // // // // // // // // // //              <directionalLight
// // // // // // // // // // // // //                  position={[5, 10, 7.5]} intensity={0.8} // Slightly lower directional
// // // // // // // // // // // // //                  castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024}
// // // // // // // // // // // // //                  shadow-camera-far={25} shadow-camera-left={-10} shadow-camera-right={10}
// // // // // // // // // // // // //                  shadow-camera-top={10} shadow-camera-bottom={-10}
// // // // // // // // // // // // //              />
// // // // // // // // // // // // //              <ErrorBoundary>
// // // // // // // // // // // // //                  <Suspense fallback={<LoadingPlaceholder />}>
// // // // // // // // // // // // //                       <ResonatorSimulation />
// // // // // // // // // // // // //                  </Suspense>
// // // // // // // // // // // // //              </ErrorBoundary>
// // // // // // // // // // // // //              <Controls />
// // // // // // // // // // // // //         </Canvas>
// // // // // // // // // // // // //     </>
// // // // // // // // // // // // // );
// // // // // // // // // // // // // const LoadingPlaceholder = () => { /* ... */ return (<mesh><boxGeometry args={[0.1, 0.1, 0.1]} /><meshBasicMaterial color="orange" wireframe /></mesh>);};

// // // // // // // // // // // // // export default TemporalResonatorScene;


// // // // // // // // // // // // // // // TemporalResonatorScene_V2_CSG_Fixes_2.tsx
// // // // // // // // // // // // // // import React, { useRef, useEffect, useMemo, Suspense } from 'react';
// // // // // // // // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // // // // // // // // import * as THREE from 'three';
// // // // // // // // // // // // // // import ErrorBoundary from './errorBoundary';
// // // // // // // // // // // // // // import { useControls, Leva } from 'leva';
// // // // // // // // // // // // // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
// // // // // // // // // // // // // // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// // // // // // // // // // // // // // THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
// // // // // // // // // // // // // // THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
// // // // // // // // // // // // // // THREE.Mesh.prototype.raycast = acceleratedRaycast;

// // // // // // // // // // // // // // const csgEvaluator = new Evaluator();
// // // // // // // // // // // // // // csgEvaluator.useGroups = true;

// // // // // // // // // // // // // // extend({ OrbitControls });

// // // // // // // // // // // // // // // --- Controls Component (Unchanged) ---
// // // // // // // // // // // // // // const Controls = () => { /* ... */
// // // // // // // // // // // // // //     const { camera, gl } = useThree();
// // // // // // // // // // // // // //     const controlsRef = useRef<OrbitControls>(null);
// // // // // // // // // // // // // //     useEffect(() => { /* ... create and dispose controls ... */
// // // // // // // // // // // // // //       const controls = new OrbitControls(camera, gl.domElement); controls.enableDamping = true;
// // // // // // // // // // // // // //       (controlsRef as React.MutableRefObject<OrbitControls>).current = controls;
// // // // // // // // // // // // // //       return () => { controls.dispose(); };
// // // // // // // // // // // // // //      }, [camera, gl]);
// // // // // // // // // // // // // //     useFrame(() => { controlsRef.current?.update(); });
// // // // // // // // // // // // // //     return null;
// // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // --- Roman Dodecahedron CSG Component (Unchanged from previous attempt) ---
// // // // // // // // // // // // // // interface RomanDodecahedronProps { /* ... */
// // // // // // // // // // // // // //     outerRadius: number; thickness: number; holeBaseDiameter: number;
// // // // // // // // // // // // // //     holeRatio: number; noduleRadius: number; material: THREE.Material;
// // // // // // // // // // // // // //     [key: string]: any;
// // // // // // // // // // // // // //  }
// // // // // // // // // // // // // // const RomanDodecahedron: React.FC<RomanDodecahedronProps> = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
// // // // // // // // // // // // // //     ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, ...props }, ref) => {
// // // // // // // // // // // // // //         const geometry = useMemo(() => { /* ... CSG logic ... */
// // // // // // // // // // // // // //              console.log("Recalculating CSG Geometry...");
// // // // // // // // // // // // // //              const detailLevel = 1; // Stick to detail 1 for reliable face indexing for now
// // // // // // // // // // // // // //              try {
// // // // // // // // // // // // // //                 // Base shell
// // // // // // // // // // // // // //                 const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, detailLevel);
// // // // // // // // // // // // // //                 outerDodecGeo.computeBoundsTree();
// // // // // // // // // // // // // //                 const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, detailLevel);
// // // // // // // // // // // // // //                 innerDodecGeo.computeBoundsTree();
// // // // // // // // // // // // // //                 let outerBrush = new Brush(outerDodecGeo); let innerBrush = new Brush(innerDodecGeo);
// // // // // // // // // // // // // //                 innerBrush.updateMatrixWorld();
// // // // // // // // // // // // // //                 let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
// // // // // // // // // // // // // //                 outerBrush.geometry.dispose(); innerBrush.geometry.dispose();

// // // // // // // // // // // // // //                 // Holes
// // // // // // // // // // // // // //                 const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * (holeRatio ** i));
// // // // // // // // // // // // // //                 const cylinderHeight = thickness * 3;
// // // // // // // // // // // // // //                 const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16);
// // // // // // // // // // // // // //                 cylinderGeo.rotateX(Math.PI / 2); cylinderGeo.computeBoundsTree();
// // // // // // // // // // // // // //                 const tempPos = new THREE.Vector3(); const tempQuat = new THREE.Quaternion();
// // // // // // // // // // // // // //                 const vertices = outerDodecGeo.attributes.position.array;
// // // // // // // // // // // // // //                 const indices = outerDodecGeo.index ? outerDodecGeo.index.array : null;
// // // // // // // // // // // // // //                 let faceIndex = 0;
// // // // // // // // // // // // // //                 if (!indices) throw new Error("Dodec lacks indices");

// // // // // // // // // // // // // //                 for (let i = 0; i < indices.length; i += 9) { // Step 9 for detail 1
// // // // // // // // // // // // // //                     if (faceIndex >= 12) break;
// // // // // // // // // // // // // //                     const vIndices = new Set<number>();
// // // // // // // // // // // // // //                     for(let j=0; j<9; j++){ vIndices.add(indices[i+j]); }
// // // // // // // // // // // // // //                     const center = new THREE.Vector3(0,0,0); let vertexCount = 0;
// // // // // // // // // // // // // //                     vIndices.forEach((idx) => { /* ... get vertex, add to center ... */
// // // // // // // // // // // // // //                          if (idx * 3 + 2 < vertices.length) {
// // // // // // // // // // // // // //                              tempPos.set(vertices[idx * 3], vertices[idx * 3 + 1], vertices[idx * 3 + 2]);
// // // // // // // // // // // // // //                              center.add(tempPos); vertexCount++;
// // // // // // // // // // // // // //                          } });
// // // // // // // // // // // // // //                     if (vertexCount === 0) { faceIndex++; continue; } center.divideScalar(vertexCount);
// // // // // // // // // // // // // //                     const normal = center.clone().normalize(); const holeRadius = holeDiameters[faceIndex] / 2;
// // // // // // // // // // // // // //                     if (!holeRadius || holeRadius <= 0) { faceIndex++; continue; }

// // // // // // // // // // // // // //                     const holeBrush = new Brush(cylinderGeo); holeBrush.scale.set(holeRadius, holeRadius, 1);
// // // // // // // // // // // // // //                     tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
// // // // // // // // // // // // // //                     holeBrush.quaternion.copy(tempQuat); holeBrush.position.copy(center);
// // // // // // // // // // // // // //                     holeBrush.updateMatrixWorld();
// // // // // // // // // // // // // //                     shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION);
// // // // // // // // // // // // // //                     faceIndex++;
// // // // // // // // // // // // // //                 }
// // // // // // // // // // // // // //                  cylinderGeo.dispose();

// // // // // // // // // // // // // //                 // Nodules
// // // // // // // // // // // // // //                  const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6); noduleGeo.computeBoundsTree();
// // // // // // // // // // // // // //                  const uniqueVertices = new Map<string, THREE.Vector3>();
// // // // // // // // // // // // // //                  for (let i = 0; i < outerDodecGeo.attributes.position.count; i++) { /* ... find unique vertices ... */
// // // // // // // // // // // // // //                       tempPos.fromBufferAttribute(outerDodecGeo.attributes.position, i);
// // // // // // // // // // // // // //                       const key = `${tempPos.x.toFixed(4)},${tempPos.y.toFixed(4)},${tempPos.z.toFixed(4)}`;
// // // // // // // // // // // // // //                       if (!uniqueVertices.has(key)) { uniqueVertices.set(key, tempPos.clone()); }
// // // // // // // // // // // // // //                  }
// // // // // // // // // // // // // //                  uniqueVertices.forEach(vertexPos => { /* ... add nodule brushes ... */
// // // // // // // // // // // // // //                      const noduleBrush = new Brush(noduleGeo); noduleBrush.position.copy(vertexPos);
// // // // // // // // // // // // // //                      noduleBrush.updateMatrixWorld();
// // // // // // // // // // // // // //                      shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
// // // // // // // // // // // // // //                  });
// // // // // // // // // // // // // //                  noduleGeo.dispose();

// // // // // // // // // // // // // //                 const finalGeometry = shellBrush.geometry; finalGeometry.computeVertexNormals();
// // // // // // // // // // // // // //                 outerDodecGeo.dispose(); // Dispose the temporary high-detail outer geo
// // // // // // // // // // // // // //                 console.log("CSG Geometry Recalculation Complete.");
// // // // // // // // // // // // // //                 return finalGeometry;
// // // // // // // // // // // // // //              } catch(error) {
// // // // // // // // // // // // // //                  console.error("CSG Error:", error);
// // // // // // // // // // // // // //                  // Attempt cleanup on error
// // // // // // // // // // // // // //                  // cylinderGeo?.dispose(); outerDodecGeo?.dispose(); innerDodecGeo?.dispose(); noduleGeo?.dispose();
// // // // // // // // // // // // // //                  return new THREE.BufferGeometry(); // Return empty
// // // // // // // // // // // // // //              }
// // // // // // // // // // // // // //         }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]);

// // // // // // // // // // // // // //         useEffect(() => { /* ... dispose effect ... */
// // // // // // // // // // // // // //             return () => { if (geometry && typeof (geometry as THREE.BufferGeometry).dispose === 'function') { (geometry as THREE.BufferGeometry).dispose(); console.log("Disposed CSG geometry"); } };
// // // // // // // // // // // // // //         }, [geometry]);

// // // // // // // // // // // // // //         return <mesh ref={ref} geometry={geometry} material={material} {...props} />;
// // // // // // // // // // // // // // });


// // // // // // // // // // // // // // // --- FIX 4: Define Physics State Interface ---
// // // // // // // // // // // // // // interface PhysicsState {
// // // // // // // // // // // // // //     shell_angular_velocity_scalar: number;
// // // // // // // // // // // // // //     effective_field_velocity_scalar: number;
// // // // // // // // // // // // // //     current_torque_scalar: number;
// // // // // // // // // // // // // //     // Add V2 state later:
// // // // // // // // // // // // // //     // shell_angular_velocity: THREE.Vector3;
// // // // // // // // // // // // // //     // shell_orientation: THREE.Quaternion;
// // // // // // // // // // // // // //     // current_torque: THREE.Vector3;
// // // // // // // // // // // // // // }

// // // // // // // // // // // // // // // --- Main Simulation Component ---
// // // // // // // // // // // // // // const ResonatorSimulation = () => {
// // // // // // // // // // // // // //     const dodecahedronRef = useRef<THREE.Mesh>(null!);
// // // // // // // // // // // // // //     const particlesRef = useRef<THREE.Points>(null!);
// // // // // // // // // // // // // //     const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // // // // // // // // // // //     // --- Leva Controls (Still potentially 'unknown' to TS, but access should work) ---
// // // // // // // // // // // // // //     const params = useControls('Resonator Controls', { /* ... */
// // // // // // // // // // // // // //         baseFieldSpeed: { value: 1.0, min: -5, max: 5, step: 0.1 },
// // // // // // // // // // // // // //         fieldIntensity: { value: 1.0, min: 0.1, max: 5, step: 0.1 },
// // // // // // // // // // // // // //         k_drag: { label: 'Induction Strength', value: 0.5, min: 0, max: 2, step: 0.05 },
// // // // // // // // // // // // // //         inertiaScale: { label: 'Inertia Scale', value: 1.0, min: 0.1, max: 5, step: 0.1 },
// // // // // // // // // // // // // //         damping: { value: 0.1, min: 0, max: 1, step: 0.01 },
// // // // // // // // // // // // // //         k_feedback: { value: -0.2, min: -2, max: 2, step: 0.05 }, });
// // // // // // // // // // // // // //     const shellParams = useControls('Shell Geometry', { /* ... */
// // // // // // // // // // // // // //          outerRadius: { value: 1.0, min: 0.5, max: 2.0, step: 0.1 },
// // // // // // // // // // // // // //          thickness: { value: 0.05, min: 0.01, max: 0.3, step: 0.01 },
// // // // // // // // // // // // // //          holeBaseDiameter: { value: 0.1, min: 0.01, max: 0.3, step: 0.01 },
// // // // // // // // // // // // // //          holeRatio: { value: 1.2, min: 1.0, max: 1.6, step: 0.01 },
// // // // // // // // // // // // // //          noduleRadius: { value: 0.1, min: 0.01, max: 0.3, step: 0.01 }, });
// // // // // // // // // // // // // //     const vizParams = useControls('Visualization', { /* ... */
// // // // // // // // // // // // // //         particleCount: { value: 1000, min: 100, max: 5000, step: 100 },
// // // // // // // // // // // // // //         particleSize: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
// // // // // // // // // // // // // //         torusMajorRadius: { value: 1.5, min: 0.5, max: 5, step: 0.1 },
// // // // // // // // // // // // // //         torusMinorRadius: { value: 0.5, min: 0.1, max: 2, step: 0.05 }, });

// // // // // // // // // // // // // //     // Explicit type assertion for leva results (Workaround for TS18046 if needed)
// // // // // // // // // // // // // //     const typedParams = params as any;
// // // // // // // // // // // // // //     const typedShellParams = shellParams as any;
// // // // // // // // // // // // // //     const typedVizParams = vizParams as any;

// // // // // // // // // // // // // //     const effectiveInertia = useMemo(() => typedParams.inertiaScale * (typedShellParams.outerRadius ** 5 - (typedShellParams.outerRadius - typedShellParams.thickness) ** 5) / typedShellParams.outerRadius ** 5,
// // // // // // // // // // // // // //                                  [typedParams.inertiaScale, typedShellParams.outerRadius, typedShellParams.thickness]);

// // // // // // // // // // // // // //     // --- FIX 4: Initialize physicsState ref with correct shape ---
// // // // // // // // // // // // // //     const physicsState = useRef<PhysicsState>({
// // // // // // // // // // // // // //         shell_angular_velocity_scalar: 0.0,
// // // // // // // // // // // // // //         effective_field_velocity_scalar: typedParams.baseFieldSpeed, // Use initial value
// // // // // // // // // // // // // //         current_torque_scalar: 0.0,
// // // // // // // // // // // // // //     }); // No .current needed here for initialization

// // // // // // // // // // // // // //     // --- FIX 1 & 3: Ensure particleData useMemo returns object ---
// // // // // // // // // // // // // //     const particleData = useMemo(() => {
// // // // // // // // // // // // // //         try { // Add try-catch within useMemo
// // // // // // // // // // // // // //             const data = [];
// // // // // // // // // // // // // //             const positions = new Float32Array(typedVizParams.particleCount * 3);
// // // // // // // // // // // // // //             for (let i = 0; i < typedVizParams.particleCount; i++) {
// // // // // // // // // // // // // //                 const u = Math.random() * Math.PI * 2; const v = Math.random() * Math.PI * 2;
// // // // // // // // // // // // // //                 const R = typedVizParams.torusMajorRadius; const r = typedVizParams.torusMinorRadius;
// // // // // // // // // // // // // //                 const randR = R + (Math.random() - 0.5) * 0.2;
// // // // // // // // // // // // // //                 const randr = r * Math.sqrt(Math.random());
// // // // // // // // // // // // // //                 positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u);
// // // // // // // // // // // // // //                 positions[i * 3 + 1] = randr * Math.sin(v);
// // // // // // // // // // // // // //                 positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);
// // // // // // // // // // // // // //                 data.push({ u, v, R, r: randr, fieldIndex: 0 });
// // // // // // // // // // // // // //             }
// // // // // // // // // // // // // //             // Always return the object
// // // // // // // // // // // // // //             return { positions, data };
// // // // // // // // // // // // // //         } catch (error) {
// // // // // // // // // // // // // //             console.error("Error creating particle data:", error);
// // // // // // // // // // // // // //             // Return a default/empty state if error occurs
// // // // // // // // // // // // // //             return { positions: new Float32Array(0), data: [] };
// // // // // // // // // // // // // //         }
// // // // // // // // // // // // // //      }, [typedVizParams.particleCount, typedVizParams.torusMajorRadius, typedVizParams.torusMinorRadius]); // Use typed params in dep array


// // // // // // // // // // // // // //     useFrame((state, delta) => {
// // // // // // // // // // // // // //         // Access physics state via .current
// // // // // // // // // // // // // //         const currentPhysics = physicsState.current;

// // // // // // // // // // // // // //         // V1 Physics Placeholder
// // // // // // // // // // // // // //         const relative_speed = currentPhysics.effective_field_velocity_scalar - currentPhysics.shell_angular_velocity_scalar;
// // // // // // // // // // // // // //         currentPhysics.current_torque_scalar = typedParams.k_drag * typedParams.fieldIntensity * relative_speed;
// // // // // // // // // // // // // //         const angular_acceleration = currentPhysics.current_torque_scalar / effectiveInertia;
// // // // // // // // // // // // // //         currentPhysics.shell_angular_velocity_scalar += angular_acceleration * delta;
// // // // // // // // // // // // // //         currentPhysics.shell_angular_velocity_scalar *= (1 - typedParams.damping * delta);
// // // // // // // // // // // // // //         currentPhysics.effective_field_velocity_scalar = typedParams.baseFieldSpeed + typedParams.k_feedback * currentPhysics.shell_angular_velocity_scalar;

// // // // // // // // // // // // // //         // Visuals Update
// // // // // // // // // // // // // //         if (dodecahedronRef.current) {
// // // // // // // // // // // // // //              dodecahedronRef.current.rotation.y += currentPhysics.shell_angular_velocity_scalar * delta;
// // // // // // // // // // // // // //             const material = dodecahedronRef.current.material as THREE.MeshStandardMaterial;
// // // // // // // // // // // // // //             if (material.emissive) {
// // // // // // // // // // // // // //                  const maxExpectedTorque = typedParams.k_drag * typedParams.fieldIntensity * (typedParams.baseFieldSpeed * 1.5);
// // // // // // // // // // // // // //                  const emissionStrength = Math.min(Math.abs(currentPhysics.current_torque_scalar) / (maxExpectedTorque + 0.01), 1.0);
// // // // // // // // // // // // // //                  material.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5);
// // // // // // // // // // // // // //             }
// // // // // // // // // // // // // //         }

// // // // // // // // // // // // // //         // Particle Field Update
// // // // // // // // // // // // // //         // --- FIX 1: Check if particleData and positions exist ---
// // // // // // // // // // // // // //         if (particleGeoRef.current && particlesRef.current && particleData && particleData.positions) {
// // // // // // // // // // // // // //             const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// // // // // // // // // // // // // //             // Check if buffer size matches expected size before updating
// // // // // // // // // // // // // //             if (positions.length === typedVizParams.particleCount * 3) {
// // // // // // // // // // // // // //                 const speed = currentPhysics.effective_field_velocity_scalar * typedParams.fieldIntensity;
// // // // // // // // // // // // // //                 const pData = particleData.data; // Now safe to access .data
// // // // // // // // // // // // // //                  (particlesRef.current.material as THREE.PointsMaterial).size = typedVizParams.particleSize * (1 + typedParams.fieldIntensity * 0.5);

// // // // // // // // // // // // // //                 for (let i = 0; i < typedVizParams.particleCount; i++) {
// // // // // // // // // // // // // //                     const data = pData[i]; data.u += speed * delta;
// // // // // // // // // // // // // //                     const R = data.R; const r = data.r; const u = data.u; const v = data.v;
// // // // // // // // // // // // // //                     positions[i * 3] = (R + r * Math.cos(v)) * Math.cos(u);
// // // // // // // // // // // // // //                     positions[i * 3 + 1] = r * Math.sin(v);
// // // // // // // // // // // // // //                     positions[i * 3 + 2] = (R + r * Math.cos(v)) * Math.sin(u);
// // // // // // // // // // // // // //                 }
// // // // // // // // // // // // // //                 particleGeoRef.current.attributes.position.needsUpdate = true;
// // // // // // // // // // // // // //             } else if (particleGeoRef.current.attributes.position) {
// // // // // // // // // // // // // //                  // If size mismatch, likely need to recreate buffer attribute (see below)
// // // // // // // // // // // // // //                  console.warn("Particle buffer size mismatch. Expected:", typedVizParams.particleCount * 3, "Got:", positions.length);
// // // // // // // // // // // // // //                  // Force recreation by updating the attribute (though this is inefficient)
// // // // // // // // // // // // // //                  particleGeoRef.current.setAttribute('position', new THREE.BufferAttribute(particleData.positions, 3));
// // // // // // // // // // // // // //             }
// // // // // // // // // // // // // //         }
// // // // // // // // // // // // // //     });

// // // // // // // // // // // // // //     const copperMaterial = useMemo(() => new THREE.MeshStandardMaterial({ /* ... */ color: 0xB87333, metalness: 0.8, roughness: 0.3, emissive: 0x000000, emissiveIntensity: 1.0, side: THREE.DoubleSide }), []);

// // // // // // // // // // // // // //     // --- FIX 1 & 3: Effect to update buffer attribute when particleData changes ---
// // // // // // // // // // // // // //     // This handles the case where particleCount changes and useMemo returns new arrays
// // // // // // // // // // // // // //      useEffect(() => {
// // // // // // // // // // // // // //          if (particleGeoRef.current && particleData && particleData.positions) {
// // // // // // // // // // // // // //              particleGeoRef.current.setAttribute('position', new THREE.BufferAttribute(particleData.positions, 3));
// // // // // // // // // // // // // //              console.log("Particle buffer attribute updated/created.");
// // // // // // // // // // // // // //          }
// // // // // // // // // // // // // //      }, [particleData]); // Rerun when particleData object reference changes


// // // // // // // // // // // // // //     return (
// // // // // // // // // // // // // //         <>
// // // // // // // // // // // // // //             {/* --- FIX 7: Pass shellParams props individually --- */}
// // // // // // // // // // // // // //             <RomanDodecahedron
// // // // // // // // // // // // // //                 ref={dodecahedronRef}
// // // // // // // // // // // // // //                 outerRadius={typedShellParams.outerRadius}
// // // // // // // // // // // // // //                 thickness={typedShellParams.thickness}
// // // // // // // // // // // // // //                 holeBaseDiameter={typedShellParams.holeBaseDiameter}
// // // // // // // // // // // // // //                 holeRatio={typedShellParams.holeRatio}
// // // // // // // // // // // // // //                 noduleRadius={typedShellParams.noduleRadius}
// // // // // // // // // // // // // //                 material={copperMaterial}
// // // // // // // // // // // // // //                 castShadow receiveShadow
// // // // // // // // // // // // // //             />

// // // // // // // // // // // // // //             <points ref={particlesRef}>
// // // // // // // // // // // // // //                  {/* Ensure geometry ref is set before attribute */}
// // // // // // // // // // // // // //                  <bufferGeometry ref={particleGeoRef}>
// // // // // // // // // // // // // //                      {/* --- FIX 1: Conditionally render attribute or use effect ---
// // // // // // // // // // // // // //                          The useEffect above handles creating/updating the attribute now.
// // // // // // // // // // // // // //                          We only need the attach="attributes-position" if creating declaratively,
// // // // // // // // // // // // // //                          which might race with useMemo. Let effect handle it.
// // // // // // // // // // // // // //                      */}
// // // // // // // // // // // // // //                      {/* <bufferAttribute attach="attributes-position" ... /> */}
// // // // // // // // // // // // // //                  </bufferGeometry>
// // // // // // // // // // // // // //                  <pointsMaterial
// // // // // // // // // // // // // //                      color={0x00ffff}
// // // // // // // // // // // // // //                      size={typedVizParams.particleSize} // Use typed param
// // // // // // // // // // // // // //                      transparent opacity={0.7}
// // // // // // // // // // // // // //                      blending={THREE.AdditiveBlending} sizeAttenuation
// // // // // // // // // // // // // //                      map={null}
// // // // // // // // // // // // // //                  />
// // // // // // // // // // // // // //             </points>
// // // // // // // // // // // // // //         </>
// // // // // // // // // // // // // //     );
// // // // // // // // // // // // // // };


// // // // // // // // // // // // // // // --- Scene Component (Container - unchanged) ---
// // // // // // // // // // // // // // const TemporalResonatorScene: React.FC = () => { /* ... */ return (<>{/* Leva */}<Canvas>{/* Lights */}<ErrorBoundary><Suspense fallback={<LoadingPlaceholder />}><ResonatorSimulation /></Suspense></ErrorBoundary><Controls /></Canvas></>);};
// // // // // // // // // // // // // // const LoadingPlaceholder = () => { /* ... */ return (<mesh><boxGeometry args={[0.1, 0.1, 0.1]} /><meshBasicMaterial color="orange" wireframe /></mesh>);};

// // // // // // // // // // // // // // export default TemporalResonatorScene;


// // // // // // // // // // // // // // // // TemporalResonatorScene_V2_CSG_Fixed.tsx
// // // // // // // // // // // // // // // import React, { useRef, useEffect, useMemo, Suspense } from 'react'; // Import Suspense
// // // // // // // // // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // // // // // // // // // import * as THREE from 'three';
// // // // // // // // // // // // // // // import ErrorBoundary from './errorBoundary'; // Assuming path is correct
// // // // // // // // // // // // // // // import { useControls, Leva } from 'leva';
// // // // // // // // // // // // // // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';

// // // // // // // // // // // // // // // // --- FIX 1: Explicitly import and assign BVH functions ---
// // // // // // // // // // // // // // // import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
// // // // // // // // // // // // // // // THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
// // // // // // // // // // // // // // // THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
// // // // // // // // // // // // // // // THREE.Mesh.prototype.raycast = acceleratedRaycast; // Also recommended for performance

// // // // // // // // // // // // // // // const csgEvaluator = new Evaluator();
// // // // // // // // // // // // // // // csgEvaluator.useGroups = true;

// // // // // // // // // // // // // // // extend({ OrbitControls });

// // // // // // // // // // // // // // // // --- Controls Component (Unchanged) ---
// // // // // // // // // // // // // // // const Controls = () => {
// // // // // // // // // // // // // // //     const { camera, gl } = useThree();
// // // // // // // // // // // // // // //     const controlsRef = useRef<OrbitControls>(null);

// // // // // // // // // // // // // // //     useEffect(() => {
// // // // // // // // // // // // // // //       const controls = new OrbitControls(camera, gl.domElement);
// // // // // // // // // // // // // // //       controls.enableDamping = true;
// // // // // // // // // // // // // // //       (controlsRef as React.MutableRefObject<OrbitControls>).current = controls;

// // // // // // // // // // // // // // //       return () => {
// // // // // // // // // // // // // // //         controls.dispose();
// // // // // // // // // // // // // // //       };
// // // // // // // // // // // // // // //     }, [camera, gl]);

// // // // // // // // // // // // // // //     useFrame(() => {
// // // // // // // // // // // // // // //       controlsRef.current?.update();
// // // // // // // // // // // // // // //     });

// // // // // // // // // // // // // // //     return null;
// // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // --- Roman Dodecahedron CSG Component ---
// // // // // // // // // // // // // // // interface RomanDodecahedronProps {
// // // // // // // // // // // // // // //   outerRadius: number;
// // // // // // // // // // // // // // //   thickness: number;
// // // // // // // // // // // // // // //   holeBaseDiameter: number;
// // // // // // // // // // // // // // //   holeRatio: number;
// // // // // // // // // // // // // // //   noduleRadius: number;
// // // // // // // // // // // // // // //   material: THREE.Material;
// // // // // // // // // // // // // // //   [key: string]: any; // Allow other mesh props like position, rotation etc.
// // // // // // // // // // // // // // // }

// // // // // // // // // // // // // // // const RomanDodecahedron: React.FC<RomanDodecahedronProps> = React.forwardRef<THREE.Mesh, RomanDodecahedronProps>(
// // // // // // // // // // // // // // //     ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, ...props }, ref) => {

// // // // // // // // // // // // // // //     const geometry = useMemo(() => {
// // // // // // // // // // // // // // //         console.log("Recalculating CSG Geometry...");

// // // // // // // // // // // // // // //         // 1. Base Shell Brushes
// // // // // // // // // // // // // // //         // Use slightly higher detail maybe? 1->2 for smoother holes? Test performance.
// // // // // // // // // // // // // // //         const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, 1);
// // // // // // // // // // // // // // //         outerDodecGeo.computeBoundsTree(); // Now this should exist
// // // // // // // // // // // // // // //         const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, 1);
// // // // // // // // // // // // // // //         innerDodecGeo.computeBoundsTree();

// // // // // // // // // // // // // // //         let outerBrush = new Brush(outerDodecGeo);
// // // // // // // // // // // // // // //         let innerBrush = new Brush(innerDodecGeo);
// // // // // // // // // // // // // // //         innerBrush.updateMatrixWorld();

// // // // // // // // // // // // // // //         // Create Shell
// // // // // // // // // // // // // // //         let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
// // // // // // // // // // // // // // //         outerBrush.geometry.dispose(); // Dispose intermediate geometries
// // // // // // // // // // // // // // //         innerBrush.geometry.dispose();

// // // // // // // // // // // // // // //         // 2. Holes (Cylinders)
// // // // // // // // // // // // // // //         const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * (holeRatio ** i));
// // // // // // // // // // // // // // //         const cylinderHeight = thickness * 3; // Ensure it goes through
// // // // // // // // // // // // // // //         // Create ONE cylinder geometry, reuse it
// // // // // // // // // // // // // // //         const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16);
// // // // // // // // // // // // // // //         cylinderGeo.rotateX(Math.PI / 2); // Align along Z
// // // // // // // // // // // // // // //         cylinderGeo.computeBoundsTree(); // Compute BVH once

// // // // // // // // // // // // // // //         const tempMatrix = new THREE.Matrix4();
// // // // // // // // // // // // // // //         const tempPos = new THREE.Vector3();
// // // // // // // // // // // // // // //         const tempQuat = new THREE.Quaternion();

// // // // // // // // // // // // // // //         const vertices = outerDodecGeo.attributes.position.array;
// // // // // // // // // // // // // // //         const indices = outerDodecGeo.index ? outerDodecGeo.index.array : null; // Null check
// // // // // // // // // // // // // // //         let faceIndex = 0;

// // // // // // // // // // // // // // //         if (!indices) {
// // // // // // // // // // // // // // //             console.error("Dodecahedron geometry lacks indices!");
// // // // // // // // // // // // // // //             // Dispose temporary geometry before returning empty
// // // // // // // // // // // // // // //             cylinderGeo.dispose();
// // // // // // // // // // // // // // //             return new THREE.BufferGeometry();
// // // // // // // // // // // // // // //         }

// // // // // // // // // // // // // // //         try { // Add try-catch around CSG operations
// // // // // // // // // // // // // // //             for (let i = 0; i < indices.length; i += 9) { // Step by 9 indices (3 triangles per pent face)
// // // // // // // // // // // // // // //                 if (faceIndex >= 12) break;

// // // // // // // // // // // // // // //                 const vIndices = new Set<number>();
// // // // // // // // // // // // // // //                 for(let j=0; j<9; j++){
// // // // // // // // // // // // // // //                     vIndices.add(indices[i+j]);
// // // // // // // // // // // // // // //                 }

// // // // // // // // // // // // // // //                 const center = new THREE.Vector3(0,0,0);
// // // // // // // // // // // // // // //                 let vertexCount = 0;
// // // // // // // // // // // // // // //                 vIndices.forEach((idx) => {
// // // // // // // // // // // // // // //                     if (idx * 3 + 2 < vertices.length) {
// // // // // // // // // // // // // // //                         tempPos.set(vertices[idx * 3], vertices[idx * 3 + 1], vertices[idx * 3 + 2]);
// // // // // // // // // // // // // // //                         center.add(tempPos);
// // // // // // // // // // // // // // //                         vertexCount++;
// // // // // // // // // // // // // // //                     } else {
// // // // // // // // // // // // // // //                         console.warn(`Index ${idx} out of bounds for vertices array.`);
// // // // // // // // // // // // // // //                     }
// // // // // // // // // // // // // // //                 });

// // // // // // // // // // // // // // //                 if (vertexCount === 0) {
// // // // // // // // // // // // // // //                      console.warn(`No valid vertices found for face index ${faceIndex}`);
// // // // // // // // // // // // // // //                      faceIndex++; // Increment even if skipped
// // // // // // // // // // // // // // //                      continue; // Skip this face
// // // // // // // // // // // // // // //                 }
// // // // // // // // // // // // // // //                 center.divideScalar(vertexCount);

// // // // // // // // // // // // // // //                 const normal = center.clone().normalize();
// // // // // // // // // // // // // // //                 const holeRadius = holeDiameters[faceIndex] / 2;

// // // // // // // // // // // // // // //                 // Check if hole radius is valid
// // // // // // // // // // // // // // //                 if (!holeRadius || holeRadius <= 0) {
// // // // // // // // // // // // // // //                     console.warn(`Invalid hole radius calculated for face ${faceIndex}: ${holeRadius}`);
// // // // // // // // // // // // // // //                     faceIndex++;
// // // // // // // // // // // // // // //                     continue;
// // // // // // // // // // // // // // //                 }

// // // // // // // // // // // // // // //                 const holeBrush = new Brush(cylinderGeo); // Reuse geometry
// // // // // // // // // // // // // // //                 holeBrush.scale.set(holeRadius, holeRadius, 1);
// // // // // // // // // // // // // // //                 tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
// // // // // // // // // // // // // // //                 holeBrush.quaternion.copy(tempQuat);
// // // // // // // // // // // // // // //                 holeBrush.position.copy(center);
// // // // // // // // // // // // // // //                 holeBrush.updateMatrixWorld();

// // // // // // // // // // // // // // //                 // Subtract hole
// // // // // // // // // // // // // // //                 shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION);
// // // // // // // // // // // // // // //                 faceIndex++;
// // // // // // // // // // // // // // //             }

// // // // // // // // // // // // // // //             // Dispose the template cylinder geometry (brushes hold references)
// // // // // // // // // // // // // // //             cylinderGeo.dispose();

// // // // // // // // // // // // // // //             // 3. Nodules (Spheres)
// // // // // // // // // // // // // // //             // Lower detail nodules
// // // // // // // // // // // // // // //             const noduleGeo = new THREE.SphereGeometry(noduleRadius, 6, 6);
// // // // // // // // // // // // // // //             noduleGeo.computeBoundsTree();
// // // // // // // // // // // // // // //             const uniqueVertices = new Map<string, THREE.Vector3>();

// // // // // // // // // // // // // // //             // Use outerDodecGeo vertices directly
// // // // // // // // // // // // // // //              for (let i = 0; i < outerDodecGeo.attributes.position.count; i++) {
// // // // // // // // // // // // // // //                  tempPos.fromBufferAttribute(outerDodecGeo.attributes.position, i);
// // // // // // // // // // // // // // //                  const key = `${tempPos.x.toFixed(4)},${tempPos.y.toFixed(4)},${tempPos.z.toFixed(4)}`;
// // // // // // // // // // // // // // //                  if (!uniqueVertices.has(key)) {
// // // // // // // // // // // // // // //                      uniqueVertices.set(key, tempPos.clone());
// // // // // // // // // // // // // // //                  }
// // // // // // // // // // // // // // //              }


// // // // // // // // // // // // // // //             uniqueVertices.forEach(vertexPos => {
// // // // // // // // // // // // // // //                 const noduleBrush = new Brush(noduleGeo);
// // // // // // // // // // // // // // //                 noduleBrush.position.copy(vertexPos);
// // // // // // // // // // // // // // //                 noduleBrush.updateMatrixWorld();
// // // // // // // // // // // // // // //                 shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
// // // // // // // // // // // // // // //             });

// // // // // // // // // // // // // // //              // Dispose the template nodule geometry
// // // // // // // // // // // // // // //              noduleGeo.dispose();


// // // // // // // // // // // // // // //             // --- FIX 3: Get geometry directly from the final brush ---
// // // // // // // // // // // // // // //             const finalGeometry = shellBrush.geometry;
// // // // // // // // // // // // // // //             finalGeometry.computeVertexNormals(); // Recalculate normals
// // // // // // // // // // // // // // //             // Clean up the original outer geometry used for vertices/indices
// // // // // // // // // // // // // // //             outerDodecGeo.dispose();

// // // // // // // // // // // // // // //             console.log("CSG Geometry Recalculation Complete.");
// // // // // // // // // // // // // // //             return finalGeometry;

// // // // // // // // // // // // // // //         } catch (error) {
// // // // // // // // // // // // // // //             console.error("Error during CSG evaluation:", error);
// // // // // // // // // // // // // // //             // Dispose geometries if error occurs
// // // // // // // // // // // // // // //             cylinderGeo?.dispose();
// // // // // // // // // // // // // // //             outerDodecGeo?.dispose();
// // // // // // // // // // // // // // //             innerDodecGeo?.dispose();
// // // // // // // // // // // // // // //             // noduleGeo?.dispose(); // Might already be disposed
// // // // // // // // // // // // // // //             return new THREE.BufferGeometry(); // Return empty on error
// // // // // // // // // // // // // // //         }

// // // // // // // // // // // // // // //     }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]);

// // // // // // // // // // // // // // //     // Need to dispose of the geometry when the component unmounts or params change
// // // // // // // // // // // // // // //     useEffect(() => {
// // // // // // // // // // // // // // //         return () => {
// // // // // // // // // // // // // // //             // Check if geometry is a BufferGeometry and has a dispose method
// // // // // // // // // // // // // // //             if (geometry && typeof (geometry as THREE.BufferGeometry).dispose === 'function') {
// // // // // // // // // // // // // // //                 (geometry as THREE.BufferGeometry).dispose();
// // // // // // // // // // // // // // //                 console.log("Disposed CSG geometry");
// // // // // // // // // // // // // // //             }
// // // // // // // // // // // // // // //         };
// // // // // // // // // // // // // // //     }, [geometry]); // Run effect when geometry changes (which happens on param change)


// // // // // // // // // // // // // // //     return <mesh ref={ref} geometry={geometry} material={material} {...props} />;
// // // // // // // // // // // // // // // });


// // // // // // // // // // // // // // // // --- Main Simulation Component (Minor adjustments) ---
// // // // // // // // // // // // // // // const ResonatorSimulation = () => {
// // // // // // // // // // // // // // //     const dodecahedronRef = useRef<THREE.Mesh>(null!);
// // // // // // // // // // // // // // //     const particlesRef = useRef<THREE.Points>(null!);
// // // // // // // // // // // // // // //     const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // // // // // // // // // // // //     const params = useControls('Resonator Controls', { /* ... as before ... */
// // // // // // // // // // // // // // //         baseFieldSpeed: { value: 1.0, min: -5, max: 5, step: 0.1 },
// // // // // // // // // // // // // // //         fieldIntensity: { value: 1.0, min: 0.1, max: 5, step: 0.1 },
// // // // // // // // // // // // // // //         k_drag: { label: 'Induction Strength', value: 0.5, min: 0, max: 2, step: 0.05 },
// // // // // // // // // // // // // // //         inertiaScale: { label: 'Inertia Scale', value: 1.0, min: 0.1, max: 5, step: 0.1 },
// // // // // // // // // // // // // // //         damping: { value: 0.1, min: 0, max: 1, step: 0.01 },
// // // // // // // // // // // // // // //         k_feedback: { value: -0.2, min: -2, max: 2, step: 0.05 }, });
// // // // // // // // // // // // // // //     const shellParams = useControls('Shell Geometry', { /* ... as before ... */
// // // // // // // // // // // // // // //          outerRadius: { value: 1.0, min: 0.5, max: 2.0, step: 0.1, /* editable: false */ }, // Allow editing if desired
// // // // // // // // // // // // // // //          thickness: { value: 0.05, min: 0.01, max: 0.3, step: 0.01 },
// // // // // // // // // // // // // // //          holeBaseDiameter: { value: 0.1, min: 0.01, max: 0.3, step: 0.01 },
// // // // // // // // // // // // // // //          holeRatio: { value: 1.2, min: 1.0, max: 1.6, step: 0.01 },
// // // // // // // // // // // // // // //          noduleRadius: { value: 0.1, min: 0.01, max: 0.3, step: 0.01 }, });
// // // // // // // // // // // // // // //     const vizParams = useControls('Visualization', { /* ... as before ... */
// // // // // // // // // // // // // // //         particleCount: { value: 1000, min: 100, max: 5000, step: 100 },
// // // // // // // // // // // // // // //         particleSize: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
// // // // // // // // // // // // // // //         torusMajorRadius: { value: 1.5, min: 0.5, max: 5, step: 0.1 },
// // // // // // // // // // // // // // //         torusMinorRadius: { value: 0.5, min: 0.1, max: 2, step: 0.05 }, });

// // // // // // // // // // // // // // //     const effectiveInertia = useMemo(() => params.inertiaScale * (shellParams.outerRadius ** 5 - (shellParams.outerRadius - shellParams.thickness) ** 5) / shellParams.outerRadius ** 5,
// // // // // // // // // // // // // // //                                  [params.inertiaScale, shellParams.outerRadius, shellParams.thickness]);

// // // // // // // // // // // // // // //     const physicsState = useRef({ shell_angular_velocity_scalar: 0.0, effective_field_velocity_scalar: params.baseFieldSpeed, current_torque_scalar: 0.0, }).current;

// // // // // // // // // // // // // // //     const particleData = useMemo(() => { /* ... as before ... */
// // // // // // // // // // // // // // //         const data = [];
// // // // // // // // // // // // // // //         const positions = new Float32Array(vizParams.particleCount * 3);
// // // // // // // // // // // // // // //         for (let i = 0; i < vizParams.particleCount; i++) {
// // // // // // // // // // // // // // //             const u = Math.random() * Math.PI * 2; const v = Math.random() * Math.PI * 2;
// // // // // // // // // // // // // // //             const R = vizParams.torusMajorRadius; const r = vizParams.torusMinorRadius;
// // // // // // // // // // // // // // //             const randR = R + (Math.random() - 0.5) * 0.2;
// // // // // // // // // // // // // // //             const randr = r * Math.sqrt(Math.random());
// // // // // // // // // // // // // // //             positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u);
// // // // // // // // // // // // // // //             positions[i * 3 + 1] = randr * Math.sin(v);
// // // // // // // // // // // // // // //             positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);
// // // // // // // // // // // // // // //             data.push({ u, v, R, r: randr, fieldIndex: 0 });
// // // // // // // // // // // // // // //         }
// // // // // // // // // // // // // // //         return { positions, data };
// // // // // // // // // // // // // // //      }, [vizParams.particleCount, vizParams.torusMajorRadius, vizParams.torusMinorRadius]);


// // // // // // // // // // // // // // //     useFrame((state, delta) => {
// // // // // // // // // // // // // // //         // V1 Physics Placeholder
// // // // // // // // // // // // // // //         const relative_speed = physicsState.effective_field_velocity_scalar - physicsState.shell_angular_velocity_scalar;
// // // // // // // // // // // // // // //         physicsState.current_torque_scalar = params.k_drag * params.fieldIntensity * relative_speed;
// // // // // // // // // // // // // // //         const angular_acceleration = physicsState.current_torque_scalar / effectiveInertia;
// // // // // // // // // // // // // // //         physicsState.shell_angular_velocity_scalar += angular_acceleration * delta;
// // // // // // // // // // // // // // //         physicsState.shell_angular_velocity_scalar *= (1 - params.damping * delta);
// // // // // // // // // // // // // // //         physicsState.effective_field_velocity_scalar = params.baseFieldSpeed + params.k_feedback * physicsState.shell_angular_velocity_scalar;

// // // // // // // // // // // // // // //         // Visuals Update
// // // // // // // // // // // // // // //         if (dodecahedronRef.current) {
// // // // // // // // // // // // // // //              dodecahedronRef.current.rotation.y += physicsState.shell_angular_velocity_scalar * delta;
// // // // // // // // // // // // // // //             const material = dodecahedronRef.current.material as THREE.MeshStandardMaterial;
// // // // // // // // // // // // // // //             if (material.emissive) { // Check if emissive exists
// // // // // // // // // // // // // // //                  const maxExpectedTorque = params.k_drag * params.fieldIntensity * (params.baseFieldSpeed * 1.5);
// // // // // // // // // // // // // // //                  const emissionStrength = Math.min(Math.abs(physicsState.current_torque_scalar) / (maxExpectedTorque + 0.01), 1.0);
// // // // // // // // // // // // // // //                  material.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5);
// // // // // // // // // // // // // // //             }
// // // // // // // // // // // // // // //         }

// // // // // // // // // // // // // // //         // Particle Field Update Placeholder
// // // // // // // // // // // // // // //         if (particleGeoRef.current && particlesRef.current) {
// // // // // // // // // // // // // // //             const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// // // // // // // // // // // // // // //             const speed = physicsState.effective_field_velocity_scalar * params.fieldIntensity;
// // // // // // // // // // // // // // //             const pData = particleData.data;
// // // // // // // // // // // // // // //              (particlesRef.current.material as THREE.PointsMaterial).size = vizParams.particleSize * (1 + params.fieldIntensity * 0.5);

// // // // // // // // // // // // // // //             for (let i = 0; i < vizParams.particleCount; i++) {
// // // // // // // // // // // // // // //                 const data = pData[i]; data.u += speed * delta;
// // // // // // // // // // // // // // //                 const R = data.R; const r = data.r; const u = data.u; const v = data.v;
// // // // // // // // // // // // // // //                 positions[i * 3] = (R + r * Math.cos(v)) * Math.cos(u);
// // // // // // // // // // // // // // //                 positions[i * 3 + 1] = r * Math.sin(v);
// // // // // // // // // // // // // // //                 positions[i * 3 + 2] = (R + r * Math.cos(v)) * Math.sin(u);
// // // // // // // // // // // // // // //             }
// // // // // // // // // // // // // // //             particleGeoRef.current.attributes.position.needsUpdate = true;
// // // // // // // // // // // // // // //         }
// // // // // // // // // // // // // // //     });

// // // // // // // // // // // // // // //     const copperMaterial = useMemo(() => new THREE.MeshStandardMaterial({
// // // // // // // // // // // // // // //             color: 0xB87333, metalness: 0.8, roughness: 0.3,
// // // // // // // // // // // // // // //             emissive: 0x000000, emissiveIntensity: 1.0,
// // // // // // // // // // // // // // //             side: THREE.DoubleSide
// // // // // // // // // // // // // // //         }), []);

// // // // // // // // // // // // // // //     return (
// // // // // // // // // // // // // // //         <>
// // // // // // // // // // // // // // //             {/* Use forwardRef for the CSG Component */}
// // // // // // // // // // // // // // //             <RomanDodecahedron
// // // // // // // // // // // // // // //                 ref={dodecahedronRef} // Apply the ref here
// // // // // // // // // // // // // // //                 outerRadius={shellParams.outerRadius}
// // // // // // // // // // // // // // //                 thickness={shellParams.thickness}
// // // // // // // // // // // // // // //                 holeBaseDiameter={shellParams.holeBaseDiameter}
// // // // // // // // // // // // // // //                 holeRatio={shellParams.holeRatio}
// // // // // // // // // // // // // // //                 noduleRadius={shellParams.noduleRadius}
// // // // // // // // // // // // // // //                 material={copperMaterial}
// // // // // // // // // // // // // // //                 castShadow // Allow the detailed mesh to cast shadows
// // // // // // // // // // // // // // //                 receiveShadow // Allow it to receive shadows
// // // // // // // // // // // // // // //             />

// // // // // // // // // // // // // // //             {/* Particle Field */}
// // // // // // // // // // // // // // //             <points ref={particlesRef}>
// // // // // // // // // // // // // // //                  <bufferGeometry ref={particleGeoRef}>
// // // // // // // // // // // // // // //                      <bufferAttribute
// // // // // // // // // // // // // // //                          attach="attributes-position"
// // // // // // // // // // // // // // //                          count={vizParams.particleCount}
// // // // // // // // // // // // // // //                          array={particleData.positions}
// // // // // // // // // // // // // // //                          itemSize={3}
// // // // // // // // // // // // // // //                          usage={THREE.DynamicDrawUsage} // Hint for frequent updates
// // // // // // // // // // // // // // //                      />
// // // // // // // // // // // // // // //                  </bufferGeometry>
// // // // // // // // // // // // // // //                  <pointsMaterial
// // // // // // // // // // // // // // //                      color={0x00ffff}
// // // // // // // // // // // // // // //                      size={vizParams.particleSize}
// // // // // // // // // // // // // // //                      transparent opacity={0.7}
// // // // // // // // // // // // // // //                      blending={THREE.AdditiveBlending} sizeAttenuation
// // // // // // // // // // // // // // //                  />
// // // // // // // // // // // // // // //             </points>
// // // // // // // // // // // // // // //         </>
// // // // // // // // // // // // // // //     );
// // // // // // // // // // // // // // // };


// // // // // // // // // // // // // // // // --- Scene Component (Container) ---
// // // // // // // // // // // // // // // const TemporalResonatorScene: React.FC = () => (
// // // // // // // // // // // // // // //     <>
// // // // // // // // // // // // // // //         <Leva collapsed={false} titleBar={{ title: 'Controls' }} />
// // // // // // // // // // // // // // //         <Canvas
// // // // // // // // // // // // // // //              style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', background: '#111122', zIndex: 0 }}
// // // // // // // // // // // // // // //              camera={{ position: [3, 3, 5], fov: 75 }}
// // // // // // // // // // // // // // //              gl={{ antialias: true, /* alpha: false */ }} // Consider alpha false if no transparency needed behind canvas
// // // // // // // // // // // // // // //              shadows
// // // // // // // // // // // // // // //         >
// // // // // // // // // // // // // // //              <ambientLight intensity={0.4} />
// // // // // // // // // // // // // // //              <directionalLight
// // // // // // // // // // // // // // //                  position={[5, 10, 7.5]}
// // // // // // // // // // // // // // //                  intensity={1.0}
// // // // // // // // // // // // // // //                  castShadow
// // // // // // // // // // // // // // //                  shadow-mapSize-width={1024} shadow-mapSize-height={1024}
// // // // // // // // // // // // // // //                  shadow-camera-far={25} // Adjust shadow camera if needed
// // // // // // // // // // // // // // //                  shadow-camera-left={-10} shadow-camera-right={10}
// // // // // // // // // // // // // // //                  shadow-camera-top={10} shadow-camera-bottom={-10}
// // // // // // // // // // // // // // //              />
// // // // // // // // // // // // // // //              <ErrorBoundary>
// // // // // // // // // // // // // // //                  {/* Use Suspense directly around the component causing potential long calculation */}
// // // // // // // // // // // // // // //                  <Suspense fallback={<LoadingPlaceholder />}>
// // // // // // // // // // // // // // //                       <ResonatorSimulation />
// // // // // // // // // // // // // // //                  </Suspense>
// // // // // // // // // // // // // // //              </ErrorBoundary>
// // // // // // // // // // // // // // //              <Controls />
// // // // // // // // // // // // // // //         </Canvas>
// // // // // // // // // // // // // // //     </>
// // // // // // // // // // // // // // // );

// // // // // // // // // // // // // // // // Simple placeholder for Suspense
// // // // // // // // // // // // // // // const LoadingPlaceholder = () => {
// // // // // // // // // // // // // // //     return (
// // // // // // // // // // // // // // //         <mesh>
// // // // // // // // // // // // // // //             <boxGeometry args={[0.1, 0.1, 0.1]} />
// // // // // // // // // // // // // // //             <meshBasicMaterial color="orange" wireframe />
// // // // // // // // // // // // // // //         </mesh>
// // // // // // // // // // // // // // //     );
// // // // // // // // // // // // // // // };


// // // // // // // // // // // // // // // export default TemporalResonatorScene;


// // // // // // // // // // // // // // // // // TemporalResonatorScene_V2_CSG.tsx
// // // // // // // // // // // // // // // // import React, { useRef, useEffect, useMemo } from 'react';
// // // // // // // // // // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // // // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // // // // // // // // // // import * as THREE from 'three';

// // // // // // // // // // // // // // // // import { useControls, Leva } from 'leva';
// // // // // // // // // // // // // // // // import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg'; // Import CSG
// // // // // // // // // // // // // // // // import { MeshBVH } from 'three-mesh-bvh'; // Need BVH compute function
// // // // // // // // // // // // // // // // import ErrorBoundary from './errorBoundary';

// // // // // // // // // // // // // // // // // Required setup for three-bvh-csg (as per its docs)
// // // // // // // // // // // // // // // // (THREE.BufferGeometry.prototype as any).computeBoundsTree = (MeshBVH as any).computeBoundsTree;
// // // // // // // // // // // // // // // // (THREE.BufferGeometry.prototype as any).disposeBoundsTree = (MeshBVH as any).disposeBoundsTree;
// // // // // // // // // // // // // // // // const csgEvaluator = new Evaluator();
// // // // // // // // // // // // // // // // csgEvaluator.useGroups = true; // Important for multiple subtractions/additions

// // // // // // // // // // // // // // // // extend({ OrbitControls });

// // // // // // // // // // // // // // // // // --- Controls Component (Unchanged) ---
// // // // // // // // // // // // // // // // const Controls = () => {
// // // // // // // // // // // // // // // //      // ... (same as before)
// // // // // // // // // // // // // // // //      const { camera, gl } = useThree();
// // // // // // // // // // // // // // // //      const controlsRef = useRef<OrbitControls>(null); // Use OrbitControls type

// // // // // // // // // // // // // // // //      useEffect(() => {
// // // // // // // // // // // // // // // //        const controls = new OrbitControls(camera, gl.domElement);
// // // // // // // // // // // // // // // //        controls.enableDamping = true;
// // // // // // // // // // // // // // // //        (controlsRef as React.MutableRefObject<OrbitControls>).current = controls; // Assign to ref

// // // // // // // // // // // // // // // //        return () => {
// // // // // // // // // // // // // // // //          controls.dispose();
// // // // // // // // // // // // // // // //        };
// // // // // // // // // // // // // // // //      }, [camera, gl]);

// // // // // // // // // // // // // // // //      useFrame(() => {
// // // // // // // // // // // // // // // //        controlsRef.current?.update(); // Safely call update if controls exist
// // // // // // // // // // // // // // // //      });

// // // // // // // // // // // // // // // //      return null;
// // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // --- Roman Dodecahedron CSG Component ---
// // // // // // // // // // // // // // // // interface RomanDodecahedronProps {
// // // // // // // // // // // // // // // //   outerRadius: number;
// // // // // // // // // // // // // // // //   thickness: number;
// // // // // // // // // // // // // // // //   holeBaseDiameter: number;
// // // // // // // // // // // // // // // //   holeRatio: number;
// // // // // // // // // // // // // // // //   noduleRadius: number;
// // // // // // // // // // // // // // // //   material: THREE.Material;
// // // // // // // // // // // // // // // //   [key: string]: any;
// // // // // // // // // // // // // // // // }

// // // // // // // // // // // // // // // // const RomanDodecahedron: React.FC<RomanDodecahedronProps> = ({ outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius, material, ...props }) => {

// // // // // // // // // // // // // // // //     const geometry = useMemo(() => {
// // // // // // // // // // // // // // // //         console.log("Recalculating CSG Geometry..."); // Debug log

// // // // // // // // // // // // // // // //         // 1. Base Shell Brushes
// // // // // // // // // // // // // // // //         const outerDodecGeo = new THREE.DodecahedronGeometry(outerRadius, 1); // Detail 1 might be enough
// // // // // // // // // // // // // // // //         outerDodecGeo.computeBoundsTree(); // Compute BVH for CSG base
// // // // // // // // // // // // // // // //         const innerDodecGeo = new THREE.DodecahedronGeometry(outerRadius - thickness, 1);
// // // // // // // // // // // // // // // //         innerDodecGeo.computeBoundsTree();

// // // // // // // // // // // // // // // //         const outerBrush = new Brush(outerDodecGeo);
// // // // // // // // // // // // // // // //         const innerBrush = new Brush(innerDodecGeo);
// // // // // // // // // // // // // // // //         innerBrush.updateMatrixWorld(); // Ensure matrix is updated

// // // // // // // // // // // // // // // //         // Create Shell
// // // // // // // // // // // // // // // //         let shellBrush = csgEvaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);

// // // // // // // // // // // // // // // //         // 2. Holes (Cylinders)
// // // // // // // // // // // // // // // //         const holeDiameters = Array.from({ length: 12 }, (_, i) => holeBaseDiameter * (holeRatio ** i));
// // // // // // // // // // // // // // // //         // Create ONE cylinder geometry, reuse it for brushes
// // // // // // // // // // // // // // // //         const cylinderHeight = thickness * 3; // Ensure it goes through the shell
// // // // // // // // // // // // // // // //         const cylinderGeo = new THREE.CylinderGeometry(1, 1, cylinderHeight, 16); // Base radius 1
// // // // // // // // // // // // // // // //         cylinderGeo.rotateX(Math.PI / 2); // Align along Z-axis
// // // // // // // // // // // // // // // //         cylinderGeo.computeBoundsTree(); // Compute BVH once for the geometry

// // // // // // // // // // // // // // // //         const tempMatrix = new THREE.Matrix4();
// // // // // // // // // // // // // // // //         const tempPos = new THREE.Vector3();
// // // // // // // // // // // // // // // //         const tempQuat = new THREE.Quaternion();
// // // // // // // // // // // // // // // //         const up = new THREE.Vector3(0, 1, 0);

// // // // // // // // // // // // // // // //         // Iterate through faces to get centers and normals (for DodecahedronGeometry)
// // // // // // // // // // // // // // // //         // Vertices are ordered per face: 0,1,2,3,4 / 0,5,6,7,1 / 1,7,8,9,2 / ...
// // // // // // // // // // // // // // // //         const vertices = outerDodecGeo.attributes.position.array;
// // // // // // // // // // // // // // // //         const indices = outerDodecGeo.index ? outerDodecGeo.index.array : [];
// // // // // // // // // // // // // // // //         let faceIndex = 0;

// // // // // // // // // // // // // // // //         if (!indices) {
// // // // // // // // // // // // // // // //             console.error("Dodecahedron geometry lacks indices for face processing!");
// // // // // // // // // // // // // // // //             return new THREE.BufferGeometry(); // Return empty on error
// // // // // // // // // // // // // // // //         }

// // // // // // // // // // // // // // // //         // Dodecahedron has 12 faces, 3 triangles per pentagonal face = 36 triangles
// // // // // // // // // // // // // // // //         // Process 12 pentagonal faces
// // // // // // // // // // // // // // // //         for (let i = 0; i < indices.length; i += 3 * 3) { // Step by 9 indices (3 triangles per pent face)
// // // // // // // // // // // // // // // //              if (faceIndex >= 12) break; // Should not happen, but safety

// // // // // // // // // // // // // // // //             const faceVertices = [];
// // // // // // // // // // // // // // // //             // Get the 5 unique vertices for this pentagonal face
// // // // // // // // // // // // // // // //             const vIndices = new Set();
// // // // // // // // // // // // // // // //             for(let j=0; j<9; j++){ // Indices for the 3 triangles making the pentagon
// // // // // // // // // // // // // // // //                  vIndices.add(indices[i+j]);
// // // // // // // // // // // // // // // //             }
// // // // // // // // // // // // // // // //             if (vIndices.size !== 5) {
// // // // // // // // // // // // // // // //                  console.warn("Unexpected vertex count for face", faceIndex, vIndices.size);
// // // // // // // // // // // // // // // //                  // Simple fallback: use first vertex index? This is inaccurate.
// // // // // // // // // // // // // // // //                  // Better: Calculate center from the 3 triangles' centers?
// // // // // // // // // // // // // // // //                  // For now, we'll likely get misaligned holes if this happens.
// // // // // // // // // // // // // // // //             }

// // // // // // // // // // // // // // // //             const center = new THREE.Vector3(0,0,0);
// // // // // // // // // // // // // // // //             vIndices.forEach((idx:any) => {
// // // // // // // // // // // // // // // //                  tempPos.set(vertices[idx * 3], vertices[idx * 3 + 1], vertices[idx * 3 + 2]);
// // // // // // // // // // // // // // // //                  faceVertices.push(tempPos.clone());
// // // // // // // // // // // // // // // //                  center.add(tempPos);
// // // // // // // // // // // // // // // //             });
// // // // // // // // // // // // // // // //             center.divideScalar(faceVertices.length || 1); // Average position = face center

// // // // // // // // // // // // // // // //              // Calculate face normal (average of triangle normals or cross product)
// // // // // // // // // // // // // // // //              // Simplified: Vector from origin to center (works for convex shape centered at origin)
// // // // // // // // // // // // // // // //              const normal = center.clone().normalize();

// // // // // // // // // // // // // // // //             // Create and position Hole Brush
// // // // // // // // // // // // // // // //             const holeRadius = holeDiameters[faceIndex] / 2;
// // // // // // // // // // // // // // // //             const holeBrush = new Brush(cylinderGeo); // Reuse geometry
// // // // // // // // // // // // // // // //             holeBrush.scale.set(holeRadius, holeRadius, 1); // Scale radius

// // // // // // // // // // // // // // // //             // Align cylinder's Z-axis (after rotation) to the face normal
// // // // // // // // // // // // // // // //             tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
// // // // // // // // // // // // // // // //             holeBrush.quaternion.copy(tempQuat);
// // // // // // // // // // // // // // // //             holeBrush.position.copy(center);
// // // // // // // // // // // // // // // //             holeBrush.updateMatrixWorld();

// // // // // // // // // // // // // // // //             // Subtract hole
// // // // // // // // // // // // // // // //             shellBrush = csgEvaluator.evaluate(shellBrush, holeBrush, SUBTRACTION);
// // // // // // // // // // // // // // // //             faceIndex++;
// // // // // // // // // // // // // // // //         }


// // // // // // // // // // // // // // // //         // 3. Nodules (Spheres)
// // // // // // // // // // // // // // // //         const noduleGeo = new THREE.SphereGeometry(noduleRadius, 8, 8); // Lower detail for nodules
// // // // // // // // // // // // // // // //         noduleGeo.computeBoundsTree();
// // // // // // // // // // // // // // // //         const uniqueVertices = new Map(); // Store unique vertex positions

// // // // // // // // // // // // // // // //         for (let i = 0; i < vertices.length; i += 3) {
// // // // // // // // // // // // // // // //             const x = vertices[i];
// // // // // // // // // // // // // // // //             const y = vertices[i+1];
// // // // // // // // // // // // // // // //             const z = vertices[i+2];
// // // // // // // // // // // // // // // //             const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`; // Key to handle floating point inaccuracies
// // // // // // // // // // // // // // // //             if (!uniqueVertices.has(key)) {
// // // // // // // // // // // // // // // //                 uniqueVertices.set(key, new THREE.Vector3(x, y, z));
// // // // // // // // // // // // // // // //             }
// // // // // // // // // // // // // // // //         }

// // // // // // // // // // // // // // // //         uniqueVertices.forEach(vertexPos => {
// // // // // // // // // // // // // // // //             const noduleBrush = new Brush(noduleGeo);
// // // // // // // // // // // // // // // //             noduleBrush.position.copy(vertexPos);
// // // // // // // // // // // // // // // //             noduleBrush.updateMatrixWorld();
// // // // // // // // // // // // // // // //             shellBrush = csgEvaluator.evaluate(shellBrush, noduleBrush, ADDITION);
// // // // // // // // // // // // // // // //         });

// // // // // // // // // // // // // // // //         // 4. Final Geometry
// // // // // // // // // // // // // // // //         const finalMesh = csgEvaluator.evaluate(shellBrush, new Brush(new THREE.BufferGeometry()), ADDITION); // Result is a Mesh
// // // // // // // // // // // // // // // //         finalMesh.geometry.computeVertexNormals(); // Recalculate normals for proper shading

// // // // // // // // // // // // // // // //         console.log("CSG Geometry Recalculation Complete.");
// // // // // // // // // // // // // // // //         return finalMesh.geometry; // Return the final BufferGeometry

// // // // // // // // // // // // // // // //     }, [outerRadius, thickness, holeBaseDiameter, holeRatio, noduleRadius]); // Dependencies for useMemo

// // // // // // // // // // // // // // // //     // Pass material and any other mesh props down
// // // // // // // // // // // // // // // //     return <mesh geometry={geometry} material={material} {...props} />;
// // // // // // // // // // // // // // // // };


// // // // // // // // // // // // // // // // // --- Main Simulation Component (Updated to use Leva and new component) ---
// // // // // // // // // // // // // // // // const ResonatorSimulation = () => {
// // // // // // // // // // // // // // // //     const dodecahedronRef = useRef<THREE.Mesh>(null!); // Ref for the CSG mesh
// // // // // // // // // // // // // // // //     // ... (particle refs remain the same)
// // // // // // // // // // // // // // // //     const particlesRef = useRef<THREE.Points>(null!);
// // // // // // // // // // // // // // // //     const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // // // // // // // // // // // // //     // --- Leva Controls (Added Shell Thickness) ---
// // // // // // // // // // // // // // // //     const params = useControls('Resonator Controls', {
// // // // // // // // // // // // // // // //         // ... (previous controls)
// // // // // // // // // // // // // // // //         baseFieldSpeed: { value: 1.0, min: -5, max: 5, step: 0.1 },
// // // // // // // // // // // // // // // //         fieldIntensity: { value: 1.0, min: 0.1, max: 5, step: 0.1 },
// // // // // // // // // // // // // // // //         k_drag: { label: 'Induction Strength', value: 0.5, min: 0, max: 2, step: 0.05 },
// // // // // // // // // // // // // // // //         inertiaScale: { label: 'Inertia Scale', value: 1.0, min: 0.1, max: 5, step: 0.1 }, // Scaler for inertia
// // // // // // // // // // // // // // // //         damping: { value: 0.1, min: 0, max: 1, step: 0.01 },
// // // // // // // // // // // // // // // //         k_feedback: { value: -0.2, min: -2, max: 2, step: 0.05 },
// // // // // // // // // // // // // // // //     });

// // // // // // // // // // // // // // // //      const shellParams = useControls('Shell Geometry', {
// // // // // // // // // // // // // // // //          outerRadius: { value: 1.0, min: 0.5, max: 2.0, step: 0.1, editable: false }, // Keep outer radius fixed for now?
// // // // // // // // // // // // // // // //          thickness: { value: 0.05, min: 0.01, max: 0.3, step: 0.01 },
// // // // // // // // // // // // // // // //          holeBaseDiameter: { value: 0.1, min: 0.01, max: 0.3, step: 0.01 },
// // // // // // // // // // // // // // // //          holeRatio: { value: 1.2, min: 1.0, max: 1.6, step: 0.01 },
// // // // // // // // // // // // // // // //          noduleRadius: { value: 0.1, min: 0.01, max: 0.3, step: 0.01 },
// // // // // // // // // // // // // // // //      });

// // // // // // // // // // // // // // // //     // Calculate derived inertia based on scale and thickness (simple model)
// // // // // // // // // // // // // // // //     const effectiveInertia = useMemo(() => params.inertiaScale * (shellParams.outerRadius ** 5 - (shellParams.outerRadius - shellParams.thickness) ** 5) / shellParams.outerRadius ** 5, // Rough spherical shell inertia scaling
// // // // // // // // // // // // // // // //                                  [params.inertiaScale, shellParams.outerRadius, shellParams.thickness]);


// // // // // // // // // // // // // // // //     // --- Physics State (Still V1 placeholders) ---
// // // // // // // // // // // // // // // //     const physicsState = useRef({
// // // // // // // // // // // // // // // //         shell_angular_velocity_scalar: 0.0,
// // // // // // // // // // // // // // // //         effective_field_velocity_scalar: params.baseFieldSpeed,
// // // // // // // // // // // // // // // //         current_torque_scalar: 0.0,
// // // // // // // // // // // // // // // //     }).current;

// // // // // // // // // // // // // // // //     // --- Particle Data (Still V1 placeholders) ---
// // // // // // // // // // // // // // // //     const vizParams = useControls('Visualization', { /* ... as before ... */
// // // // // // // // // // // // // // // //         particleCount: { value: 1000, min: 100, max: 5000, step: 100 },
// // // // // // // // // // // // // // // //         particleSize: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
// // // // // // // // // // // // // // // //         torusMajorRadius: { value: 1.5, min: 0.5, max: 5, step: 0.1 }, // Placeholder - will adapt for nested
// // // // // // // // // // // // // // // //         torusMinorRadius: { value: 0.5, min: 0.1, max: 2, step: 0.05 }, // Placeholder
// // // // // // // // // // // // // // // //     });
// // // // // // // // // // // // // // // //      const particleData = useMemo(() => { /* ... as before ... */
// // // // // // // // // // // // // // // //         const data = [];
// // // // // // // // // // // // // // // //         const positions = new Float32Array(vizParams.particleCount * 3);
// // // // // // // // // // // // // // // //         for (let i = 0; i < vizParams.particleCount; i++) {
// // // // // // // // // // // // // // // //             const u = Math.random() * Math.PI * 2;
// // // // // // // // // // // // // // // //             const v = Math.random() * Math.PI * 2;
// // // // // // // // // // // // // // // //             const R = vizParams.torusMajorRadius;
// // // // // // // // // // // // // // // //             const r = vizParams.torusMinorRadius;
// // // // // // // // // // // // // // // //             const randR = R + (Math.random() - 0.5) * 0.2;
// // // // // // // // // // // // // // // //             const randr = r * Math.sqrt(Math.random());

// // // // // // // // // // // // // // // //             positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u);
// // // // // // // // // // // // // // // //             positions[i * 3 + 1] = randr * Math.sin(v); // Y is the torus axis
// // // // // // // // // // // // // // // //             positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);

// // // // // // // // // // // // // // // //             // V2: Need field index, different axes, offsets etc.
// // // // // // // // // // // // // // // //             data.push({ u, v, R, r: randr, fieldIndex: 0 }); // Add fieldIndex
// // // // // // // // // // // // // // // //         }
// // // // // // // // // // // // // // // //         return { positions, data };
// // // // // // // // // // // // // // // //      }, [vizParams.particleCount, vizParams.torusMajorRadius, vizParams.torusMinorRadius]);


// // // // // // // // // // // // // // // //     // --- Animation and Physics Loop (Still V1 placeholders) ---
// // // // // // // // // // // // // // // //     useFrame((state, delta) => {
// // // // // // // // // // // // // // // //         // --- V1 Physics (Using effectiveInertia now) ---
// // // // // // // // // // // // // // // //         const relative_speed = physicsState.effective_field_velocity_scalar - physicsState.shell_angular_velocity_scalar;
// // // // // // // // // // // // // // // //         physicsState.current_torque_scalar = params.k_drag * params.fieldIntensity * relative_speed;
// // // // // // // // // // // // // // // //         const angular_acceleration = physicsState.current_torque_scalar / effectiveInertia; // Use calculated inertia
// // // // // // // // // // // // // // // //         physicsState.shell_angular_velocity_scalar += angular_acceleration * delta;
// // // // // // // // // // // // // // // //         physicsState.shell_angular_velocity_scalar *= (1 - params.damping * delta);
// // // // // // // // // // // // // // // //         physicsState.effective_field_velocity_scalar = params.baseFieldSpeed + params.k_feedback * physicsState.shell_angular_velocity_scalar;
// // // // // // // // // // // // // // // //         // --- END V1 PHYSICS ---

// // // // // // // // // // // // // // // //         // --- Visuals Update ---
// // // // // // // // // // // // // // // //         if (dodecahedronRef.current) {
// // // // // // // // // // // // // // // //              dodecahedronRef.current.rotation.y += physicsState.shell_angular_velocity_scalar * delta;
// // // // // // // // // // // // // // // //             // ... emissive update ...
// // // // // // // // // // // // // // // //             const material = dodecahedronRef.current.material as THREE.MeshStandardMaterial;
// // // // // // // // // // // // // // // //             const maxExpectedTorque = params.k_drag * params.fieldIntensity * (params.baseFieldSpeed * 1.5); // Rough estimate
// // // // // // // // // // // // // // // //             const emissionStrength = Math.min(Math.abs(physicsState.current_torque_scalar) / (maxExpectedTorque + 0.01), 1.0);
// // // // // // // // // // // // // // // //             material.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5);
// // // // // // // // // // // // // // // //         }

// // // // // // // // // // // // // // // //         // --- Particle Field Update (V1 Placeholders) ---
// // // // // // // // // // // // // // // //         // ... (same particle update logic as before for now) ...
// // // // // // // // // // // // // // // //         if (particleGeoRef.current && particlesRef.current) {
// // // // // // // // // // // // // // // //             const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// // // // // // // // // // // // // // // //             const speed = physicsState.effective_field_velocity_scalar * params.fieldIntensity; // Use scalar for now
// // // // // // // // // // // // // // // //             const pData = particleData.data;

// // // // // // // // // // // // // // // //              (particlesRef.current.material as THREE.PointsMaterial).size = vizParams.particleSize * (1 + params.fieldIntensity * 0.5);

// // // // // // // // // // // // // // // //             for (let i = 0; i < vizParams.particleCount; i++) {
// // // // // // // // // // // // // // // //                 const data = pData[i];
// // // // // // // // // // // // // // // //                 data.u += speed * delta; // Update toroidal angle (V1 logic)

// // // // // // // // // // // // // // // //                 const R = data.R; const r = data.r; const u = data.u; const v = data.v;
// // // // // // // // // // // // // // // //                 positions[i * 3] = (R + r * Math.cos(v)) * Math.cos(u);
// // // // // // // // // // // // // // // //                 positions[i * 3 + 1] = r * Math.sin(v);
// // // // // // // // // // // // // // // //                 positions[i * 3 + 2] = (R + r * Math.cos(v)) * Math.sin(u);
// // // // // // // // // // // // // // // //                 // V2: Needs different colors based on fieldIndex, different update logic per field
// // // // // // // // // // // // // // // //             }
// // // // // // // // // // // // // // // //             particleGeoRef.current.attributes.position.needsUpdate = true;
// // // // // // // // // // // // // // // //         }

// // // // // // // // // // // // // // // //     });

// // // // // // // // // // // // // // // //     // --- Define the Copper Material Once ---
// // // // // // // // // // // // // // // //      const copperMaterial = useMemo(() => new THREE.MeshStandardMaterial({
// // // // // // // // // // // // // // // //             color: 0xB87333,
// // // // // // // // // // // // // // // //             metalness: 0.8,
// // // // // // // // // // // // // // // //             roughness: 0.3,
// // // // // // // // // // // // // // // //             emissive: 0x000000,
// // // // // // // // // // // // // // // //             emissiveIntensity: 1.0,
// // // // // // // // // // // // // // // //             side: THREE.DoubleSide // Important for seeing inside through holes
// // // // // // // // // // // // // // // //         }), []);


// // // // // // // // // // // // // // // //     return (
// // // // // // // // // // // // // // // //         <>
// // // // // // // // // // // // // // // //             {/* Use the new CSG Component */}
// // // // // // // // // // // // // // // //             <RomanDodecahedron
// // // // // // // // // // // // // // // //                 ref={dodecahedronRef} // Forward the ref if needed, or manage rotation inside
// // // // // // // // // // // // // // // //                 outerRadius={shellParams.outerRadius}
// // // // // // // // // // // // // // // //                 thickness={shellParams.thickness}
// // // // // // // // // // // // // // // //                 holeBaseDiameter={shellParams.holeBaseDiameter}
// // // // // // // // // // // // // // // //                 holeRatio={shellParams.holeRatio}
// // // // // // // // // // // // // // // //                 noduleRadius={shellParams.noduleRadius}
// // // // // // // // // // // // // // // //                 material={copperMaterial} // Pass the material
// // // // // // // // // // // // // // // //                 // Rotation is handled in useFrame for now
// // // // // // // // // // // // // // // //             />

// // // // // // // // // // // // // // // //             {/* Particle Field (Unchanged for now) */}
// // // // // // // // // // // // // // // //             <points ref={particlesRef}>
// // // // // // // // // // // // // // // //                  <bufferGeometry ref={particleGeoRef}>
// // // // // // // // // // // // // // // //                      <bufferAttribute
// // // // // // // // // // // // // // // //                          attach="attributes-position"
// // // // // // // // // // // // // // // //                          count={vizParams.particleCount}
// // // // // // // // // // // // // // // //                          array={particleData.positions}
// // // // // // // // // // // // // // // //                          itemSize={3}
// // // // // // // // // // // // // // // //                      />
// // // // // // // // // // // // // // // //                  </bufferGeometry>
// // // // // // // // // // // // // // // //                  <pointsMaterial // Update dynamically? or use shader
// // // // // // // // // // // // // // // //                      color={0x00ffff} // V2: Will be vertex colors
// // // // // // // // // // // // // // // //                      size={vizParams.particleSize} // Updated dynamically in useFrame
// // // // // // // // // // // // // // // //                      transparent opacity={0.7}
// // // // // // // // // // // // // // // //                      blending={THREE.AdditiveBlending} sizeAttenuation
// // // // // // // // // // // // // // // //                      // vertexColors={true} // Enable for V2
// // // // // // // // // // // // // // // //                  />
// // // // // // // // // // // // // // // //             </points>
// // // // // // // // // // // // // // // //         </>
// // // // // // // // // // // // // // // //     );
// // // // // // // // // // // // // // // // };


// // // // // // // // // // // // // // // // // --- Scene Component (Container - Unchanged) ---
// // // // // // // // // // // // // // // // const TemporalResonatorScene: React.FC = () => (
// // // // // // // // // // // // // // // //     <>
// // // // // // // // // // // // // // // //         <Leva collapsed={false} />
// // // // // // // // // // // // // // // //         <Canvas
// // // // // // // // // // // // // // // //              style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', background: '#111122', zIndex: 0 }}
// // // // // // // // // // // // // // // //              camera={{ position: [3, 3, 5], fov: 75 }}
// // // // // // // // // // // // // // // //              gl={{ antialias: true }}
// // // // // // // // // // // // // // // //              shadows // Enable shadows if needed for directional light
// // // // // // // // // // // // // // // //         >
// // // // // // // // // // // // // // // //              <ambientLight intensity={0.4} /> {/* Slightly lower ambient */}
// // // // // // // // // // // // // // // //              <directionalLight
// // // // // // // // // // // // // // // //                  position={[5, 10, 7.5]}
// // // // // // // // // // // // // // // //                  intensity={1.0} // Stronger directional
// // // // // // // // // // // // // // // //                  castShadow // Enable shadow casting
// // // // // // // // // // // // // // // //                  shadow-mapSize-width={1024}
// // // // // // // // // // // // // // // //                  shadow-mapSize-height={1024}
// // // // // // // // // // // // // // // //              />
// // // // // // // // // // // // // // // //              <ErrorBoundary>
// // // // // // // // // // // // // // // //                  <React.Suspense fallback={null}> {/* Suspense might be needed if CSG is slow or async */}
// // // // // // // // // // // // // // // //                       <ResonatorSimulation />
// // // // // // // // // // // // // // // //                  </React.Suspense>
// // // // // // // // // // // // // // // //              </ErrorBoundary>
// // // // // // // // // // // // // // // //              <Controls />
// // // // // // // // // // // // // // // //         </Canvas>
// // // // // // // // // // // // // // // //     </>
// // // // // // // // // // // // // // // // );

// // // // // // // // // // // // // // // // export default TemporalResonatorScene;

// // // // // // // // // // // // // // // // // // TemporalResonatorScene_V2.tsx (Starting Point)
// // // // // // // // // // // // // // // // // import React, { useRef, useEffect, useMemo } from 'react';
// // // // // // // // // // // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // // // // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // // // // // // // // // // // import * as THREE from 'three';
// // // // // // // // // // // // // // // // // import { useControls, Leva } from 'leva'; // Import leva
// // // // // // // // // // // // // // // // // import ErrorBoundary from './errorBoundary';


// // // // // // // // // // // // // // // // // extend({ OrbitControls });

// // // // // // // // // // // // // // // // // // --- Controls Component (Unchanged) ---
// // // // // // // // // // // // // // // // // const Controls = () => {
// // // // // // // // // // // // // // // // //     // ... (same as before)
// // // // // // // // // // // // // // // // //     const { camera, gl } = useThree();
// // // // // // // // // // // // // // // // //     const controlsRef = useRef<OrbitControls>(null); // Use OrbitControls type

// // // // // // // // // // // // // // // // //     useEffect(() => {
// // // // // // // // // // // // // // // // //       const controls = new OrbitControls(camera, gl.domElement);
// // // // // // // // // // // // // // // // //       controls.enableDamping = true;
// // // // // // // // // // // // // // // // //       (controlsRef as React.MutableRefObject<OrbitControls>).current = controls; // Assign to ref

// // // // // // // // // // // // // // // // //       return () => {
// // // // // // // // // // // // // // // // //         controls.dispose();
// // // // // // // // // // // // // // // // //       };
// // // // // // // // // // // // // // // // //     }, [camera, gl]);

// // // // // // // // // // // // // // // // //     useFrame(() => {
// // // // // // // // // // // // // // // // //       controlsRef.current?.update(); // Safely call update if controls exist
// // // // // // // // // // // // // // // // //     });

// // // // // // // // // // // // // // // // //     return null;
// // // // // // // // // // // // // // // // // };


// // // // // // // // // // // // // // // // // // --- Main Simulation Component ---
// // // // // // // // // // // // // // // // // const ResonatorSimulation = () => {
// // // // // // // // // // // // // // // // //     const dodecahedronRef = useRef<THREE.Mesh>(null!);
// // // // // // // // // // // // // // // // //     const particlesRef = useRef<THREE.Points>(null!);
// // // // // // // // // // // // // // // // //     const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // // // // // // // // // // // // // //     // --- Leva Controls ---
// // // // // // // // // // // // // // // // //     const params = useControls('Resonator Controls', {
// // // // // // // // // // // // // // // // //         baseFieldSpeed: { value: 1.0, min: -5, max: 5, step: 0.1 },
// // // // // // // // // // // // // // // // //         fieldIntensity: { value: 1.0, min: 0.1, max: 5, step: 0.1 },
// // // // // // // // // // // // // // // // //         k_drag: { label: 'Induction Strength', value: 0.5, min: 0, max: 2, step: 0.05 },
// // // // // // // // // // // // // // // // //         inertia: { value: 1.0, min: 0.1, max: 5, step: 0.1 }, // Will link to thickness later
// // // // // // // // // // // // // // // // //         damping: { value: 0.1, min: 0, max: 1, step: 0.01 },
// // // // // // // // // // // // // // // // //         k_feedback: { value: -0.2, min: -2, max: 2, step: 0.05 },
// // // // // // // // // // // // // // // // //         // --- Placeholders for V2 ---
// // // // // // // // // // // // // // // // //         // shellThickness: { value: 1.0, min: 0.1, max: 2.0, step: 0.1 }, // Add later
// // // // // // // // // // // // // // // // //         // ... per-field controls ...
// // // // // // // // // // // // // // // // //     });

// // // // // // // // // // // // // // // // //      const vizParams = useControls('Visualization', {
// // // // // // // // // // // // // // // // //         particleCount: { value: 1000, min: 100, max: 5000, step: 100 },
// // // // // // // // // // // // // // // // //         particleSize: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
// // // // // // // // // // // // // // // // //         torusMajorRadius: { value: 1.5, min: 0.5, max: 5, step: 0.1 }, // Placeholder - will adapt for nested
// // // // // // // // // // // // // // // // //         torusMinorRadius: { value: 0.5, min: 0.1, max: 2, step: 0.05 }, // Placeholder
// // // // // // // // // // // // // // // // //      });


// // // // // // // // // // // // // // // // //     // --- Physics State (Using refs for mutable state within useFrame) ---
// // // // // // // // // // // // // // // // //     const physicsState = useRef({
// // // // // // // // // // // // // // // // //         // --- V1 State (will be replaced/expanded) ---
// // // // // // // // // // // // // // // // //         shell_angular_velocity_scalar: 0.0, // Will become Vector3
// // // // // // // // // // // // // // // // //         effective_field_velocity_scalar: params.baseFieldSpeed, // Will become per-field
// // // // // // // // // // // // // // // // //         current_torque_scalar: 0.0, // Will become Vector3
// // // // // // // // // // // // // // // // //         // --- V2 State (Placeholders) ---
// // // // // // // // // // // // // // // // //         // shell_angular_velocity: new THREE.Vector3(0,0,0),
// // // // // // // // // // // // // // // // //         // shell_orientation: new THREE.Quaternion(),
// // // // // // // // // // // // // // // // //         // effective_field_velocities: [params.baseFieldSpeed, ...], // Per field
// // // // // // // // // // // // // // // // //         // current_torque: new THREE.Vector3(0,0,0),
// // // // // // // // // // // // // // // // //     }).current;

// // // // // // // // // // // // // // // // //     // --- Particle Data (Memoized - will need rework for nested fields) ---
// // // // // // // // // // // // // // // // //      const particleData = useMemo(() => {
// // // // // // // // // // // // // // // // //         const data = [];
// // // // // // // // // // // // // // // // //         const positions = new Float32Array(vizParams.particleCount * 3);
// // // // // // // // // // // // // // // // //         for (let i = 0; i < vizParams.particleCount; i++) {
// // // // // // // // // // // // // // // // //             const u = Math.random() * Math.PI * 2;
// // // // // // // // // // // // // // // // //             const v = Math.random() * Math.PI * 2;
// // // // // // // // // // // // // // // // //             const R = vizParams.torusMajorRadius;
// // // // // // // // // // // // // // // // //             const r = vizParams.torusMinorRadius;
// // // // // // // // // // // // // // // // //             const randR = R + (Math.random() - 0.5) * 0.2;
// // // // // // // // // // // // // // // // //             const randr = r * Math.sqrt(Math.random());

// // // // // // // // // // // // // // // // //             positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u);
// // // // // // // // // // // // // // // // //             positions[i * 3 + 1] = randr * Math.sin(v); // Y is the torus axis
// // // // // // // // // // // // // // // // //             positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);

// // // // // // // // // // // // // // // // //             // V2: Need field index, different axes, offsets etc.
// // // // // // // // // // // // // // // // //             //es-lint-disable-next-line
// // // // // // // // // // // // // // // // //             data.push({ u: u, v: v, R: R, r: randr, fieldIndex: 0 }); // Add fieldIndex
// // // // // // // // // // // // // // // // //         }
// // // // // // // // // // // // // // // // //         return { positions, data };
// // // // // // // // // // // // // // // // //      }, [vizParams.particleCount, vizParams.torusMajorRadius, vizParams.torusMinorRadius]);


// // // // // // // // // // // // // // // // //     // --- Animation and Physics Loop ---
// // // // // // // // // // // // // // // // //     useFrame((state, delta) => {
// // // // // // // // // // // // // // // // //         // --- V1 Physics (PLACEHOLDER - TO BE REPLACED BY 3D) ---
// // // // // // // // // // // // // // // // //         const relative_speed = physicsState.effective_field_velocity_scalar - physicsState.shell_angular_velocity_scalar;
// // // // // // // // // // // // // // // // //         physicsState.current_torque_scalar = params.k_drag * params.fieldIntensity * relative_speed;
// // // // // // // // // // // // // // // // //         const angular_acceleration = physicsState.current_torque_scalar / params.inertia;
// // // // // // // // // // // // // // // // //         physicsState.shell_angular_velocity_scalar += angular_acceleration * delta;
// // // // // // // // // // // // // // // // //         physicsState.shell_angular_velocity_scalar *= (1 - params.damping * delta);
// // // // // // // // // // // // // // // // //         physicsState.effective_field_velocity_scalar = params.baseFieldSpeed + params.k_feedback * physicsState.shell_angular_velocity_scalar;
// // // // // // // // // // // // // // // // //         // --- END V1 PHYSICS PLACEHOLDER ---

// // // // // // // // // // // // // // // // //         // --- Visuals Update ---
// // // // // // // // // // // // // // // // //         if (dodecahedronRef.current) {
// // // // // // // // // // // // // // // // //              // V1 Rotation:
// // // // // // // // // // // // // // // // //              dodecahedronRef.current.rotation.y += physicsState.shell_angular_velocity_scalar * delta;
// // // // // // // // // // // // // // // // //              // V2 Rotation (using Quaternion - Placeholder):
// // // // // // // // // // // // // // // // //              // dodecahedronRef.current.quaternion.multiply(...)

// // // // // // // // // // // // // // // // //             // Induction Effect (Emissive - using scalar torque for now)
// // // // // // // // // // // // // // // // //             const material = dodecahedronRef.current.material as THREE.MeshStandardMaterial;
// // // // // // // // // // // // // // // // //             const maxExpectedTorque = params.k_drag * params.fieldIntensity * (params.baseFieldSpeed * 1.5); // Rough estimate
// // // // // // // // // // // // // // // // //             const emissionStrength = Math.min(Math.abs(physicsState.current_torque_scalar) / (maxExpectedTorque + 0.01), 1.0);
// // // // // // // // // // // // // // // // //             material.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5);
// // // // // // // // // // // // // // // // //         }

// // // // // // // // // // // // // // // // //         // --- Particle Field Update (V1 PLACEHOLDER - Needs major rework for V2) ---
// // // // // // // // // // // // // // // // //         if (particleGeoRef.current && particlesRef.current) {
// // // // // // // // // // // // // // // // //             const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// // // // // // // // // // // // // // // // //             const speed = physicsState.effective_field_velocity_scalar * params.fieldIntensity; // Use scalar for now
// // // // // // // // // // // // // // // // //             const pData = particleData.data;

// // // // // // // // // // // // // // // // //              (particlesRef.current.material as THREE.PointsMaterial).size = vizParams.particleSize * (1 + params.fieldIntensity * 0.5);

// // // // // // // // // // // // // // // // //             for (let i = 0; i < vizParams.particleCount; i++) {
// // // // // // // // // // // // // // // // //                 const data = pData[i];
// // // // // // // // // // // // // // // // //                 data.u += speed * delta; // Update toroidal angle (V1 logic)

// // // // // // // // // // // // // // // // //                 const R = data.R; const r = data.r; const u = data.u; const v = data.v;
// // // // // // // // // // // // // // // // //                 positions[i * 3] = (R + r * Math.cos(v)) * Math.cos(u);
// // // // // // // // // // // // // // // // //                 positions[i * 3 + 1] = r * Math.sin(v);
// // // // // // // // // // // // // // // // //                 positions[i * 3 + 2] = (R + r * Math.cos(v)) * Math.sin(u);
// // // // // // // // // // // // // // // // //                 // V2: Needs different colors based on fieldIndex, different update logic per field
// // // // // // // // // // // // // // // // //             }
// // // // // // // // // // // // // // // // //             particleGeoRef.current.attributes.position.needsUpdate = true;
// // // // // // // // // // // // // // // // //         }
// // // // // // // // // // // // // // // // //         // --- END PARTICLE UPDATE PLACEHOLDER ---
// // // // // // // // // // // // // // // // //     });

// // // // // // // // // // // // // // // // //     return (
// // // // // // // // // // // // // // // // //         <>
// // // // // // // // // // // // // // // // //             {/* Dodecahedron Mesh (Still using basic geometry) */}
// // // // // // // // // // // // // // // // //             <mesh ref={dodecahedronRef} /* rotation/quaternion updated in useFrame */ >
// // // // // // // // // // // // // // // // //                 <dodecahedronGeometry args={[1]} />
// // // // // // // // // // // // // // // // //                 {/* V2: Replace with CSG or Loaded Model */}
// // // // // // // // // // // // // // // // //                 <meshStandardMaterial
// // // // // // // // // // // // // // // // //                     color={0xB87333} metalness={0.8} roughness={0.3}
// // // // // // // // // // // // // // // // //                     emissive={0x000000} emissiveIntensity={1.0}
// // // // // // // // // // // // // // // // //                 />
// // // // // // // // // // // // // // // // //             </mesh>

// // // // // // // // // // // // // // // // //             {/* Particle Field (Using basic geometry setup for now) */}
// // // // // // // // // // // // // // // // //             <points ref={particlesRef}>
// // // // // // // // // // // // // // // // //                 <bufferGeometry ref={particleGeoRef}>
// // // // // // // // // // // // // // // // //                     <bufferAttribute
// // // // // // // // // // // // // // // // //                         attach="attributes-position"
// // // // // // // // // // // // // // // // //                         count={vizParams.particleCount}
// // // // // // // // // // // // // // // // //                         array={particleData.positions}
// // // // // // // // // // // // // // // // //                         itemSize={3}
// // // // // // // // // // // // // // // // //                     />
// // // // // // // // // // // // // // // // //                     {/* V2: Need color attribute */}
// // // // // // // // // // // // // // // // //                 </bufferGeometry>
// // // // // // // // // // // // // // // // //                 <pointsMaterial // Update dynamically? or use shader
// // // // // // // // // // // // // // // // //                     color={0x00ffff} // V2: Will be vertex colors
// // // // // // // // // // // // // // // // //                     size={vizParams.particleSize} // Updated dynamically in useFrame
// // // // // // // // // // // // // // // // //                     transparent opacity={0.7}
// // // // // // // // // // // // // // // // //                     blending={THREE.AdditiveBlending} sizeAttenuation
// // // // // // // // // // // // // // // // //                     vertexColors // Enable for V2
// // // // // // // // // // // // // // // // //                 />
// // // // // // // // // // // // // // // // //             </points>
// // // // // // // // // // // // // // // // //         </>
// // // // // // // // // // // // // // // // //     );
// // // // // // // // // // // // // // // // // };


// // // // // // // // // // // // // // // // // // --- Scene Component (Container) ---
// // // // // // // // // // // // // // // // // const TemporalResonatorScene: React.FC = () => (
// // // // // // // // // // // // // // // // //     <> {/* Need fragment to render Leva alongside Canvas */}
// // // // // // // // // // // // // // // // //         {/* Leva GUI Panel - Positioned automatically */}
// // // // // // // // // // // // // // // // //         <Leva collapsed={false} /* Optional: theme={...} */ />

// // // // // // // // // // // // // // // // //         <Canvas
// // // // // // // // // // // // // // // // //             style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', background: '#111122', zIndex: 0 }} // Ensure canvas is behind leva
// // // // // // // // // // // // // // // // //             camera={{ position: [3, 3, 5], fov: 75 }}
// // // // // // // // // // // // // // // // //             gl={{ antialias: true }}
// // // // // // // // // // // // // // // // //         >
// // // // // // // // // // // // // // // // //             <ambientLight intensity={0.5} />
// // // // // // // // // // // // // // // // //             <directionalLight position={[5, 10, 7.5]} intensity={0.8} />
// // // // // // // // // // // // // // // // //             <ErrorBoundary>
// // // // // // // // // // // // // // // // //                 <ResonatorSimulation />
// // // // // // // // // // // // // // // // //             </ErrorBoundary>
// // // // // // // // // // // // // // // // //             <Controls />
// // // // // // // // // // // // // // // // //         </Canvas>
// // // // // // // // // // // // // // // // //     </>
// // // // // // // // // // // // // // // // // );

// // // // // // // // // // // // // // // // // export default TemporalResonatorScene;

// // // // // // // // // // // // // // // // // // // TemporalResonatorScene.tsx
// // // // // // // // // // // // // // // // // // import React, { useRef, useEffect, useState, useMemo } from 'react';
// // // // // // // // // // // // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // // // // // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'; // Using your import style
// // // // // // // // // // // // // // // // // // import * as THREE from 'three';
// // // // // // // // // // // // // // // // // // import ErrorBoundary from './errorBoundary'; // Assuming this path is correct

// // // // // // // // // // // // // // // // // // // Extend Three.js components for R3F declarative use
// // // // // // // // // // // // // // // // // // extend({ OrbitControls });

// // // // // // // // // // // // // // // // // // // --- Reusable Controls Component (Adapted from your BlackHoleScene) ---
// // // // // // // // // // // // // // // // // // const Controls = () => {
// // // // // // // // // // // // // // // // // //   const { camera, gl } = useThree();
// // // // // // // // // // // // // // // // // //   const controlsRef = useRef<OrbitControls>(null); // Use OrbitControls type

// // // // // // // // // // // // // // // // // //   useEffect(() => {
// // // // // // // // // // // // // // // // // //     // Ensure controlsRef.current is correctly typed if possible, or use 'any' if necessary
// // // // // // // // // // // // // // // // // //     const controls = new OrbitControls(camera, gl.domElement);
// // // // // // // // // // // // // // // // // //     controls.enableDamping = true;
// // // // // // // // // // // // // // // // // //     (controlsRef as React.MutableRefObject<OrbitControls>).current = controls; // Assign to ref

// // // // // // // // // // // // // // // // // //     return () => {
// // // // // // // // // // // // // // // // // //       controls.dispose();
// // // // // // // // // // // // // // // // // //     };
// // // // // // // // // // // // // // // // // //   }, [camera, gl]);

// // // // // // // // // // // // // // // // // //   useFrame(() => {
// // // // // // // // // // // // // // // // // //     controlsRef.current?.update(); // Safely call update if controls exist
// // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // //   return null;
// // // // // // // // // // // // // // // // // // };


// // // // // // // // // // // // // // // // // // // --- Main Simulation Component ---
// // // // // // // // // // // // // // // // // // const ResonatorSimulation = () => {
// // // // // // // // // // // // // // // // // //   const dodecahedronRef = useRef<THREE.Mesh>(null!);
// // // // // // // // // // // // // // // // // //   const particlesRef = useRef<THREE.Points>(null!);
// // // // // // // // // // // // // // // // // //   const particleGeoRef = useRef<THREE.BufferGeometry>(null!);

// // // // // // // // // // // // // // // // // //   // --- State for Controllable Parameters (Replaces lil-gui) ---
// // // // // // // // // // // // // // // // // //   const [params] = useState({ // Use useState if you plan to add UI controls later
// // // // // // // // // // // // // // // // // //       baseFieldSpeed: 1.0,
// // // // // // // // // // // // // // // // // //       fieldIntensity: 1.0,
// // // // // // // // // // // // // // // // // //       k_drag: 0.5,
// // // // // // // // // // // // // // // // // //       inertia: 1.0,
// // // // // // // // // // // // // // // // // //       damping: 0.1,
// // // // // // // // // // // // // // // // // //       k_feedback: -0.2,
// // // // // // // // // // // // // // // // // //       particleCount: 1000,
// // // // // // // // // // // // // // // // // //       particleSize: 0.05,
// // // // // // // // // // // // // // // // // //       torusMajorRadius: 1.5,
// // // // // // // // // // // // // // // // // //       torusMinorRadius: 0.5,
// // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // //   // --- Physics State (Using refs for mutable state within useFrame) ---
// // // // // // // // // // // // // // // // // //   const physicsState = useRef({
// // // // // // // // // // // // // // // // // //       shell_angular_velocity: 0.0,
// // // // // // // // // // // // // // // // // //       effective_field_velocity: params.baseFieldSpeed,
// // // // // // // // // // // // // // // // // //       current_torque: 0.0,
// // // // // // // // // // // // // // // // // //   }).current; // .current makes it directly accessible

// // // // // // // // // // // // // // // // // //   // --- Particle Data (Memoized to avoid recalculation) ---
// // // // // // // // // // // // // // // // // //   const particleData = useMemo(() => {
// // // // // // // // // // // // // // // // // //       const data = [];
// // // // // // // // // // // // // // // // // //       const positions = new Float32Array(params.particleCount * 3);
// // // // // // // // // // // // // // // // // //       for (let i = 0; i < params.particleCount; i++) {
// // // // // // // // // // // // // // // // // //           const u = Math.random() * Math.PI * 2;
// // // // // // // // // // // // // // // // // //           const v = Math.random() * Math.PI * 2;
// // // // // // // // // // // // // // // // // //           const R = params.torusMajorRadius;
// // // // // // // // // // // // // // // // // //           const r = params.torusMinorRadius;
// // // // // // // // // // // // // // // // // //           const randR = R + (Math.random() - 0.5) * 0.2;
// // // // // // // // // // // // // // // // // //           const randr = r * Math.sqrt(Math.random());

// // // // // // // // // // // // // // // // // //           positions[i * 3] = (randR + randr * Math.cos(v)) * Math.cos(u);
// // // // // // // // // // // // // // // // // //           positions[i * 3 + 1] = randr * Math.sin(v); // Y is the torus axis
// // // // // // // // // // // // // // // // // //           positions[i * 3 + 2] = (randR + randr * Math.cos(v)) * Math.sin(u);
// // // // // // // // // // // // // // // // // //           // eslint-disable-next-line
// // // // // // // // // // // // // // // // // //           data.push({ u: u, v: v, R: R, r: randr }); // Store initial angles/radii
// // // // // // // // // // // // // // // // // //       }
// // // // // // // // // // // // // // // // // //       return { positions, data };
// // // // // // // // // // // // // // // // // //   }, [params.particleCount, params.torusMajorRadius, params.torusMinorRadius]); // Recalculate only if these change


// // // // // // // // // // // // // // // // // //   // --- Animation and Physics Loop ---
// // // // // // // // // // // // // // // // // //   useFrame((state, delta) => {
// // // // // // // // // // // // // // // // // //     // --- Physics Update ---
// // // // // // // // // // // // // // // // // //     const relative_speed = physicsState.effective_field_velocity - physicsState.shell_angular_velocity;
// // // // // // // // // // // // // // // // // //     physicsState.current_torque = params.k_drag * params.fieldIntensity * relative_speed;
// // // // // // // // // // // // // // // // // //     const angular_acceleration = physicsState.current_torque / params.inertia;
// // // // // // // // // // // // // // // // // //     physicsState.shell_angular_velocity += angular_acceleration * delta;
// // // // // // // // // // // // // // // // // //     physicsState.shell_angular_velocity *= (1 - params.damping * delta);
// // // // // // // // // // // // // // // // // //     physicsState.effective_field_velocity = params.baseFieldSpeed + params.k_feedback * physicsState.shell_angular_velocity;

// // // // // // // // // // // // // // // // // //     // --- Visuals Update ---
// // // // // // // // // // // // // // // // // //     // Dodecahedron Rotation
// // // // // // // // // // // // // // // // // //     if (dodecahedronRef.current) {
// // // // // // // // // // // // // // // // // //       dodecahedronRef.current.rotation.y += physicsState.shell_angular_velocity * delta;

// // // // // // // // // // // // // // // // // //       // Induction Effect (Emissive)
// // // // // // // // // // // // // // // // // //       const material = dodecahedronRef.current.material as THREE.MeshStandardMaterial;
// // // // // // // // // // // // // // // // // //       const maxExpectedTorque = params.k_drag * params.fieldIntensity * (params.baseFieldSpeed * 1.5);
// // // // // // // // // // // // // // // // // //       const emissionStrength = Math.min(Math.abs(physicsState.current_torque) / (maxExpectedTorque + 0.01), 1.0);
// // // // // // // // // // // // // // // // // //       material.emissive.setHSL(0.1, 1.0, emissionStrength * 0.5); // Glow orange/yellow
// // // // // // // // // // // // // // // // // //     }

// // // // // // // // // // // // // // // // // //     // Particle Field Update
// // // // // // // // // // // // // // // // // //     if (particleGeoRef.current && particlesRef.current) {
// // // // // // // // // // // // // // // // // //         const positions = particleGeoRef.current.attributes.position.array as Float32Array;
// // // // // // // // // // // // // // // // // //         const speed = physicsState.effective_field_velocity * params.fieldIntensity;
// // // // // // // // // // // // // // // // // //         const pData = particleData.data; // Access memoized data

// // // // // // // // // // // // // // // // // //         // Update particle size based on intensity via material ref
// // // // // // // // // // // // // // // // // //         (particlesRef.current.material as THREE.PointsMaterial).size = params.particleSize * (1 + params.fieldIntensity * 0.5);

// // // // // // // // // // // // // // // // // //         for (let i = 0; i < params.particleCount; i++) {
// // // // // // // // // // // // // // // // // //             const data = pData[i];
// // // // // // // // // // // // // // // // // //             data.u += speed * delta; // Update toroidal angle

// // // // // // // // // // // // // // // // // //             const R = data.R;
// // // // // // // // // // // // // // // // // //             const r = data.r;
// // // // // // // // // // // // // // // // // //             const u = data.u;
// // // // // // // // // // // // // // // // // //             const v = data.v;

// // // // // // // // // // // // // // // // // //             positions[i * 3] = (R + r * Math.cos(v)) * Math.cos(u);
// // // // // // // // // // // // // // // // // //             positions[i * 3 + 1] = r * Math.sin(v);
// // // // // // // // // // // // // // // // // //             positions[i * 3 + 2] = (R + r * Math.cos(v)) * Math.sin(u);
// // // // // // // // // // // // // // // // // //         }
// // // // // // // // // // // // // // // // // //         particleGeoRef.current.attributes.position.needsUpdate = true; // IMPORTANT!
// // // // // // // // // // // // // // // // // //     }
// // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // //   // --- Reset Logic (Example - could be triggered by a button) ---
// // // // // // // // // // // // // // // // // //   // const resetSimulation = () => {
// // // // // // // // // // // // // // // // // //   //     physicsState.shell_angular_velocity = 0;
// // // // // // // // // // // // // // // // // //   //     if (dodecahedronRef.current) dodecahedronRef.current.rotation.y = 0;
// // // // // // // // // // // // // // // // // //   //     // Reset particle positions if needed
// // // // // // // // // // // // // // // // // //   // };

// // // // // // // // // // // // // // // // // //   return (
// // // // // // // // // // // // // // // // // //     <>
// // // // // // // // // // // // // // // // // //       {/* Dodecahedron Mesh */}
// // // // // // // // // // // // // // // // // //       <mesh ref={dodecahedronRef}>
// // // // // // // // // // // // // // // // // //         <dodecahedronGeometry args={[1]} />
// // // // // // // // // // // // // // // // // //         <meshStandardMaterial
// // // // // // // // // // // // // // // // // //           color={0xB87333}
// // // // // // // // // // // // // // // // // //           metalness={0.8}
// // // // // // // // // // // // // // // // // //           roughness={0.3}
// // // // // // // // // // // // // // // // // //           emissive={0x000000} // Initial emissive state
// // // // // // // // // // // // // // // // // //           emissiveIntensity={1.0}
// // // // // // // // // // // // // // // // // //         />
// // // // // // // // // // // // // // // // // //       </mesh>

// // // // // // // // // // // // // // // // // //       {/* Particle Field */}
// // // // // // // // // // // // // // // // // //       <points ref={particlesRef}>
// // // // // // // // // // // // // // // // // //         <bufferGeometry ref={particleGeoRef}>
// // // // // // // // // // // // // // // // // //             {/* Use attach to set the attribute */}
// // // // // // // // // // // // // // // // // //             <bufferAttribute
// // // // // // // // // // // // // // // // // //                 attach="attributes-position"
// // // // // // // // // // // // // // // // // //                 count={params.particleCount}
// // // // // // // // // // // // // // // // // //                 array={particleData.positions} // Use memoized initial positions
// // // // // // // // // // // // // // // // // //                 itemSize={3}
// // // // // // // // // // // // // // // // // //             />
// // // // // // // // // // // // // // // // // //         </bufferGeometry>
// // // // // // // // // // // // // // // // // //         <pointsMaterial
// // // // // // // // // // // // // // // // // //             color={0x00ffff}
// // // // // // // // // // // // // // // // // //             size={params.particleSize}
// // // // // // // // // // // // // // // // // //             transparent
// // // // // // // // // // // // // // // // // //             opacity={0.7}
// // // // // // // // // // // // // // // // // //             blending={THREE.AdditiveBlending}
// // // // // // // // // // // // // // // // // //             sizeAttenuation
// // // // // // // // // // // // // // // // // //         />
// // // // // // // // // // // // // // // // // //       </points>
// // // // // // // // // // // // // // // // // //     </>
// // // // // // // // // // // // // // // // // //   );
// // // // // // // // // // // // // // // // // // };


// // // // // // // // // // // // // // // // // // // --- Scene Component (Container) ---
// // // // // // // // // // // // // // // // // // const TemporalResonatorScene: React.FC = () => (
// // // // // // // // // // // // // // // // // //   <Canvas
// // // // // // // // // // // // // // // // // //     style={{ width: '100vw', height: '100vh', background: '#111122' }} // Match background
// // // // // // // // // // // // // // // // // //     camera={{ position: [3, 3, 5], fov: 75 }} // Match camera setup
// // // // // // // // // // // // // // // // // //     gl={{ antialias: true }} // Match renderer option
// // // // // // // // // // // // // // // // // //   >
// // // // // // // // // // // // // // // // // //     {/* Lighting */}
// // // // // // // // // // // // // // // // // //     <ambientLight intensity={0.5} />
// // // // // // // // // // // // // // // // // //     <directionalLight position={[5, 10, 7.5]} intensity={0.8} />

// // // // // // // // // // // // // // // // // //     {/* Error Boundary wrapping the simulation */}
// // // // // // // // // // // // // // // // // //     <ErrorBoundary>
// // // // // // // // // // // // // // // // // //       <ResonatorSimulation />
// // // // // // // // // // // // // // // // // //     </ErrorBoundary>

// // // // // // // // // // // // // // // // // //     {/* Controls */}
// // // // // // // // // // // // // // // // // //     <Controls />
// // // // // // // // // // // // // // // // // //   </Canvas>
// // // // // // // // // // // // // // // // // // );

// // // // // // // // // // // // // // // // // // export default TemporalResonatorScene;

// // // // // // // // // // // // // // // // // // // // BlackHoleScene.tsx

// // // // // // // // // // // // // // // // // // // // import React, { useState, useEffect, useRef, useMemo } from 'react';
// // // // // // // // // // // // // // // // // // // // import {
// // // // // // // // // // // // // // // // // // // //   ShaderMaterial,
// // // // // // // // // // // // // // // // // // // //   Vector2,
// // // // // // // // // // // // // // // // // // // //   AdditiveBlending,
// // // // // // // // // // // // // // // // // // // //   Mesh,
// // // // // // // // // // // // // // // // // // // //   Points,
// // // // // // // // // // // // // // // // // // // //   BufferGeometry,
// // // // // // // // // // // // // // // // // // // //   BufferAttribute,
// // // // // // // // // // // // // // // // // // // //   PointsMaterial,
// // // // // // // // // // // // // // // // // // // //   Color,
// // // // // // // // // // // // // // // // // // // //   Vector3,
// // // // // // // // // // // // // // // // // // // //   DoubleSide,
// // // // // // // // // // // // // // // // // // // // } from 'three';
// // // // // // // // // // // // // // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // // // // // // // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // // // // // // // // // // // // // // import { EffectComposer, Bloom } from '@react-three/postprocessing';
// // // // // // // // // // // // // // // // // // // // import ErrorBoundary from './errorBoundary';

// // // // // // // // // // // // // // // // // // // // extend({ OrbitControls });

// // // // // // // // // // // // // // // // // // // // const Controls = () => {
// // // // // // // // // // // // // // // // // // // //   const { camera, gl } = useThree();
// // // // // // // // // // // // // // // // // // // //   const controlsRef = useRef<any>(null);

// // // // // // // // // // // // // // // // // // // //   useEffect(() => {
// // // // // // // // // // // // // // // // // // // //     controlsRef.current = new OrbitControls(camera, gl.domElement);
// // // // // // // // // // // // // // // // // // // //     controlsRef.current.enableDamping = true;
// // // // // // // // // // // // // // // // // // // //     return () => {
// // // // // // // // // // // // // // // // // // // //       controlsRef.current.dispose();
// // // // // // // // // // // // // // // // // // // //     };
// // // // // // // // // // // // // // // // // // // //   }, [camera, gl]);

// // // // // // // // // // // // // // // // // // // //   useFrame(() => {
// // // // // // // // // // // // // // // // // // // //     controlsRef.current.update();
// // // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // // //   return null;
// // // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // // const BlackHole = () => {
// // // // // // // // // // // // // // // // // // // //   const meshRef = useRef<Mesh>(null);

// // // // // // // // // // // // // // // // // // // //   // Custom shader material for the black hole with gravitational lensing
// // // // // // // // // // // // // // // // // // // //   const blackHoleMaterial = useMemo(
// // // // // // // // // // // // // // // // // // // //     () =>
// // // // // // // // // // // // // // // // // // // //       new ShaderMaterial({
// // // // // // // // // // // // // // // // // // // //         uniforms: {
// // // // // // // // // // // // // // // // // // // //           u_time: { value: 0 },
// // // // // // // // // // // // // // // // // // // //           u_resolution: { value: new Vector2(window.innerWidth, window.innerHeight) },
// // // // // // // // // // // // // // // // // // // //           u_cameraPos: { value: new Vector3() },
// // // // // // // // // // // // // // // // // // // //           u_blackHolePos: { value: new Vector3(0, 0, 0) },
// // // // // // // // // // // // // // // // // // // //         },
// // // // // // // // // // // // // // // // // // // //         vertexShader: `
// // // // // // // // // // // // // // // // // // // //           varying vec3 vWorldPosition;
// // // // // // // // // // // // // // // // // // // //           void main() {
// // // // // // // // // // // // // // // // // // // //             vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
// // // // // // // // // // // // // // // // // // // //             gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
// // // // // // // // // // // // // // // // // // // //           }
// // // // // // // // // // // // // // // // // // // //         `,
// // // // // // // // // // // // // // // // // // // //         fragmentShader: `
// // // // // // // // // // // // // // // // // // // //           varying vec3 vWorldPosition;
// // // // // // // // // // // // // // // // // // // //           uniform vec3 u_cameraPos;
// // // // // // // // // // // // // // // // // // // //           uniform vec3 u_blackHolePos;
// // // // // // // // // // // // // // // // // // // //           void main() {
// // // // // // // // // // // // // // // // // // // //             // Simplified gravitational lensing effect
// // // // // // // // // // // // // // // // // // // //             vec3 dir = normalize(vWorldPosition - u_cameraPos);
// // // // // // // // // // // // // // // // // // // //             float dist = length(vWorldPosition - u_blackHolePos);
// // // // // // // // // // // // // // // // // // // //             float lensing = clamp(1.0 / (dist * dist * 100.0), 0.0, 1.0);
// // // // // // // // // // // // // // // // // // // //             gl_FragColor = vec4(vec3(0.0), 1.0 - lensing);
// // // // // // // // // // // // // // // // // // // //           }
// // // // // // // // // // // // // // // // // // // //         `,
// // // // // // // // // // // // // // // // // // // //         side: DoubleSide,
// // // // // // // // // // // // // // // // // // // //       }),
// // // // // // // // // // // // // // // // // // // //     []
// // // // // // // // // // // // // // // // // // // //   );

// // // // // // // // // // // // // // // // // // // //   useFrame(({ clock, camera }) => {
// // // // // // // // // // // // // // // // // // // //     blackHoleMaterial.uniforms.u_time.value = clock.getElapsedTime();
// // // // // // // // // // // // // // // // // // // //     blackHoleMaterial.uniforms.u_cameraPos.value.copy(camera.position);
// // // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // // //   return (
// // // // // // // // // // // // // // // // // // // //     <mesh ref={meshRef} material={blackHoleMaterial}>
// // // // // // // // // // // // // // // // // // // //       <sphereGeometry args={[2, 64, 64]} />
// // // // // // // // // // // // // // // // // // // //     </mesh>
// // // // // // // // // // // // // // // // // // // //   );
// // // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // // interface AccretionDiskProps {
// // // // // // // // // // // // // // // // // // // //   blackHoleRadius: number;
// // // // // // // // // // // // // // // // // // // //   capturedParticles: Float32Array;
// // // // // // // // // // // // // // // // // // // //   capturedColors: Float32Array;
// // // // // // // // // // // // // // // // // // // // }

// // // // // // // // // // // // // // // // // // // // const AccretionDisk: React.FC<AccretionDiskProps> = ({ blackHoleRadius, capturedParticles, capturedColors }) => {
// // // // // // // // // // // // // // // // // // // //   const particlesRef = useRef<Points>(null);
// // // // // // // // // // // // // // // // // // // //   const initialParticleCount = 20000;

// // // // // // // // // // // // // // // // // // // //   // Generate initial particles for the accretion disk
// // // // // // // // // // // // // // // // // // // //   const { positions, colors } = useMemo(() => {
// // // // // // // // // // // // // // // // // // // //     const positionsArray = new Float32Array(initialParticleCount * 3);
// // // // // // // // // // // // // // // // // // // //     const colorsArray = new Float32Array(initialParticleCount * 3);

// // // // // // // // // // // // // // // // // // // //     const innerRadius = blackHoleRadius + 0.2;
// // // // // // // // // // // // // // // // // // // //     const outerRadius = blackHoleRadius + 5;

// // // // // // // // // // // // // // // // // // // //     for (let i = 0; i < initialParticleCount; i++) {
// // // // // // // // // // // // // // // // // // // //       // Generate a radius with higher density closer to the EH
// // // // // // // // // // // // // // // // // // // //       const t = Math.random();
// // // // // // // // // // // // // // // // // // // //       const radius = innerRadius + (1 - Math.pow(t, 2)) * (outerRadius - innerRadius);

// // // // // // // // // // // // // // // // // // // //       const angle = Math.random() * 2 * Math.PI;

// // // // // // // // // // // // // // // // // // // //       positionsArray[i * 3] = radius * Math.cos(angle);
// // // // // // // // // // // // // // // // // // // //       positionsArray[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
// // // // // // // // // // // // // // // // // // // //       positionsArray[i * 3 + 2] = radius * Math.sin(angle);

// // // // // // // // // // // // // // // // // // // //       // Color gradient
// // // // // // // // // // // // // // // // // // // //       const normalizedRadius = (radius - innerRadius) / (outerRadius - innerRadius);
// // // // // // // // // // // // // // // // // // // //       const color = new Color().setHSL(0.1 * (1 - normalizedRadius), 1.0, 0.5 + 0.5 * (1 - normalizedRadius));
// // // // // // // // // // // // // // // // // // // //       colorsArray[i * 3] = color.r;
// // // // // // // // // // // // // // // // // // // //       colorsArray[i * 3 + 1] = color.g;
// // // // // // // // // // // // // // // // // // // //       colorsArray[i * 3 + 2] = color.b;
// // // // // // // // // // // // // // // // // // // //     }

// // // // // // // // // // // // // // // // // // // //     return { positions: positionsArray, colors: colorsArray };
// // // // // // // // // // // // // // // // // // // //   }, [initialParticleCount, blackHoleRadius]);

// // // // // // // // // // // // // // // // // // // //   // Combine initial particles with captured particles
// // // // // // // // // // // // // // // // // // // //   const [particleGeometry] = useState(() => {
// // // // // // // // // // // // // // // // // // // //     const geom = new BufferGeometry();
// // // // // // // // // // // // // // // // // // // //     geom.setAttribute('position', new BufferAttribute(positions, 3));
// // // // // // // // // // // // // // // // // // // //     geom.setAttribute('color', new BufferAttribute(colors, 3));
// // // // // // // // // // // // // // // // // // // //     return geom;
// // // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // // //   useFrame(() => {
// // // // // // // // // // // // // // // // // // // //     if (capturedParticles.length > 0) {
// // // // // // // // // // // // // // // // // // // //       // Merge captured particles into the accretion disk
// // // // // // // // // // // // // // // // // // // //       const currentPositions = particleGeometry.attributes.position.array as Float32Array;
// // // // // // // // // // // // // // // // // // // //       const currentColors = particleGeometry.attributes.color.array as Float32Array;

// // // // // // // // // // // // // // // // // // // //       const newParticleCount = capturedParticles.length / 3;
// // // // // // // // // // // // // // // // // // // //       const totalParticles = currentPositions.length / 3 + newParticleCount;

// // // // // // // // // // // // // // // // // // // //       const mergedPositions = new Float32Array(totalParticles * 3);
// // // // // // // // // // // // // // // // // // // //       const mergedColors = new Float32Array(totalParticles * 3);

// // // // // // // // // // // // // // // // // // // //       mergedPositions.set(currentPositions);
// // // // // // // // // // // // // // // // // // // //       mergedPositions.set(capturedParticles, currentPositions.length);
// // // // // // // // // // // // // // // // // // // //       mergedColors.set(currentColors);
// // // // // // // // // // // // // // // // // // // //       mergedColors.set(capturedColors, currentColors.length);

// // // // // // // // // // // // // // // // // // // //       particleGeometry.setAttribute('position', new BufferAttribute(mergedPositions, 3));
// // // // // // // // // // // // // // // // // // // //       particleGeometry.setAttribute('color', new BufferAttribute(mergedColors, 3));

// // // // // // // // // // // // // // // // // // // //       // Clear captured particles
// // // // // // // // // // // // // // // // // // // //       capturedParticles.length = 0;
// // // // // // // // // // // // // // // // // // // //       capturedColors.length = 0;
// // // // // // // // // // // // // // // // // // // //     }

// // // // // // // // // // // // // // // // // // // //     if (particlesRef.current) {
// // // // // // // // // // // // // // // // // // // //       particlesRef.current.rotation.y += 0.002; // Slow rotation
// // // // // // // // // // // // // // // // // // // //     }
// // // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // // //   const particleMaterial = useMemo(
// // // // // // // // // // // // // // // // // // // //     () =>
// // // // // // // // // // // // // // // // // // // //       new PointsMaterial({
// // // // // // // // // // // // // // // // // // // //         size: 0.05,
// // // // // // // // // // // // // // // // // // // //         vertexColors: true,
// // // // // // // // // // // // // // // // // // // //         blending: AdditiveBlending,
// // // // // // // // // // // // // // // // // // // //         transparent: true,
// // // // // // // // // // // // // // // // // // // //       }),
// // // // // // // // // // // // // // // // // // // //     []
// // // // // // // // // // // // // // // // // // // //   );

// // // // // // // // // // // // // // // // // // // //   return <points ref={particlesRef} geometry={particleGeometry} material={particleMaterial} />;
// // // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // // interface StarProps {
// // // // // // // // // // // // // // // // // // // //   positionRef: React.MutableRefObject<Vector3>;
// // // // // // // // // // // // // // // // // // // //   blackHoleRadius: number;
// // // // // // // // // // // // // // // // // // // // }

// // // // // // // // // // // // // // // // // // // // const Star: React.FC<StarProps> = ({ positionRef, blackHoleRadius }) => {
// // // // // // // // // // // // // // // // // // // //   const starRef = useRef<Mesh>(null);

// // // // // // // // // // // // // // // // // // // //   useFrame(({ clock }) => {
// // // // // // // // // // // // // // // // // // // //     if (starRef.current) {
// // // // // // // // // // // // // // // // // // // //       const t = clock.getElapsedTime();

// // // // // // // // // // // // // // // // // // // //       // Decaying orbit parameters
// // // // // // // // // // // // // // // // // // // //       const initialRadius = 10;
// // // // // // // // // // // // // // // // // // // //       const decayRate = 0.05;

// // // // // // // // // // // // // // // // // // // //       const radius = Math.max(blackHoleRadius, initialRadius - decayRate * t);
// // // // // // // // // // // // // // // // // // // //       const angularSpeed = 0.8;

// // // // // // // // // // // // // // // // // // // //       const angle = angularSpeed * t;

// // // // // // // // // // // // // // // // // // // //       // Convert polar to Cartesian coordinates
// // // // // // // // // // // // // // // // // // // //       const x = radius * Math.cos(angle);
// // // // // // // // // // // // // // // // // // // //       const z = radius * Math.sin(angle);

// // // // // // // // // // // // // // // // // // // //       starRef.current.position.set(x, 0, z);

// // // // // // // // // // // // // // // // // // // //       // Update the shared positionRef
// // // // // // // // // // // // // // // // // // // //       positionRef.current.copy(starRef.current.position);

// // // // // // // // // // // // // // // // // // // //       // Calculate scale based on distance to black hole
// // // // // // // // // // // // // // // // // // // //       const distanceToBH = radius - blackHoleRadius;
// // // // // // // // // // // // // // // // // // // //       const initialScale = 1.0;
// // // // // // // // // // // // // // // // // // // //       const scale = (distanceToBH / (initialRadius - blackHoleRadius)) * initialScale;
// // // // // // // // // // // // // // // // // // // //       starRef.current.scale.set(scale, scale, scale);
// // // // // // // // // // // // // // // // // // // //     }
// // // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // // //   return (
// // // // // // // // // // // // // // // // // // // //     <mesh ref={starRef}>
// // // // // // // // // // // // // // // // // // // //       <sphereGeometry args={[1.5, 32, 32]} />
// // // // // // // // // // // // // // // // // // // //       <meshStandardMaterial
// // // // // // // // // // // // // // // // // // // //         color="#ffff00"
// // // // // // // // // // // // // // // // // // // //         emissive="#ffff00"
// // // // // // // // // // // // // // // // // // // //         emissiveIntensity={2}
// // // // // // // // // // // // // // // // // // // //       />
// // // // // // // // // // // // // // // // // // // //     </mesh>
// // // // // // // // // // // // // // // // // // // //   );
// // // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // // interface ParticleSystemProps {
// // // // // // // // // // // // // // // // // // // //   starPositionRef: React.MutableRefObject<Vector3>;
// // // // // // // // // // // // // // // // // // // //   blackHoleRadius: number;
// // // // // // // // // // // // // // // // // // // //   capturedParticlesRef: React.MutableRefObject<Float32Array>;
// // // // // // // // // // // // // // // // // // // //   capturedColorsRef: React.MutableRefObject<Float32Array>;
// // // // // // // // // // // // // // // // // // // // }

// // // // // // // // // // // // // // // // // // // // const ParticleSystem: React.FC<ParticleSystemProps> = ({
// // // // // // // // // // // // // // // // // // // //   starPositionRef,
// // // // // // // // // // // // // // // // // // // //   blackHoleRadius,
// // // // // // // // // // // // // // // // // // // //   capturedParticlesRef,
// // // // // // // // // // // // // // // // // // // //   capturedColorsRef,
// // // // // // // // // // // // // // // // // // // // }) => {
// // // // // // // // // // // // // // // // // // // //   const particlesRef = useRef<Points>(null);

// // // // // // // // // // // // // // // // // // // //   const particleCount = 5000;
// // // // // // // // // // // // // // // // // // // //   const positions = useRef<Float32Array>(new Float32Array(particleCount * 3));
// // // // // // // // // // // // // // // // // // // //   const velocities = useRef<Float32Array>(new Float32Array(particleCount * 3));

// // // // // // // // // // // // // // // // // // // //   // Initialize particles only once
// // // // // // // // // // // // // // // // // // // //   // eslint-disable-next-line react-hooks/exhaustive-deps
// // // // // // // // // // // // // // // // // // // //   useEffect(() => {
// // // // // // // // // // // // // // // // // // // //     for (let i = 0; i < particleCount; i += 1) {
// // // // // // // // // // // // // // // // // // // //       positions.current[i * 3] = starPositionRef.current.x;
// // // // // // // // // // // // // // // // // // // //       positions.current[i * 3 + 1] = starPositionRef.current.y;
// // // // // // // // // // // // // // // // // // // //       positions.current[i * 3 + 2] = starPositionRef.current.z;

// // // // // // // // // // // // // // // // // // // //       velocities.current[i * 3] = -(Math.random() * 0.02 + 0.01);
// // // // // // // // // // // // // // // // // // // //       velocities.current[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
// // // // // // // // // // // // // // // // // // // //       velocities.current[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
// // // // // // // // // // // // // // // // // // // //     }
// // // // // // // // // // // // // // // // // // // //   }, []);

// // // // // // // // // // // // // // // // // // // //   const particleGeometry = useMemo(() => {
// // // // // // // // // // // // // // // // // // // //     const geom = new BufferGeometry();
// // // // // // // // // // // // // // // // // // // //     geom.setAttribute('position', new BufferAttribute(positions.current, 3));
// // // // // // // // // // // // // // // // // // // //     return geom;
// // // // // // // // // // // // // // // // // // // //   }, []);

// // // // // // // // // // // // // // // // // // // //   const particleMaterial = useMemo(
// // // // // // // // // // // // // // // // // // // //     () =>
// // // // // // // // // // // // // // // // // // // //       new PointsMaterial({
// // // // // // // // // // // // // // // // // // // //         color: '#ffa500',
// // // // // // // // // // // // // // // // // // // //         size: 0.1,
// // // // // // // // // // // // // // // // // // // //         blending: AdditiveBlending,
// // // // // // // // // // // // // // // // // // // //         transparent: true,
// // // // // // // // // // // // // // // // // // // //       }),
// // // // // // // // // // // // // // // // // // // //     []
// // // // // // // // // // // // // // // // // // // //   );

// // // // // // // // // // // // // // // // // // // //   useFrame(() => {
// // // // // // // // // // // // // // // // // // // //     const posArray = particleGeometry.attributes.position.array as Float32Array;

// // // // // // // // // // // // // // // // // // // //     for (let i = 0; i < particleCount; i += 1) {
// // // // // // // // // // // // // // // // // // // //       // Update positions based on velocities
// // // // // // // // // // // // // // // // // // // //       posArray[i * 3] += velocities.current[i * 3];
// // // // // // // // // // // // // // // // // // // //       posArray[i * 3 + 1] += velocities.current[i * 3 + 1];
// // // // // // // // // // // // // // // // // // // //       posArray[i * 3 + 2] += velocities.current[i * 3 + 2];

// // // // // // // // // // // // // // // // // // // //       // Compute distance to black hole
// // // // // // // // // // // // // // // // // // // //       const dx = posArray[i * 3];
// // // // // // // // // // // // // // // // // // // //       const dy = posArray[i * 3 + 1];
// // // // // // // // // // // // // // // // // // // //       const dz = posArray[i * 3 + 2];
// // // // // // // // // // // // // // // // // // // //       const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

// // // // // // // // // // // // // // // // // // // //       // Simple gravity towards the black hole
// // // // // // // // // // // // // // // // // // // //       const force = (0.02 / dist) * 0.1;
// // // // // // // // // // // // // // // // // // // //       velocities.current[i * 3] += (-dx / dist) * force;
// // // // // // // // // // // // // // // // // // // //       velocities.current[i * 3 + 1] += (-dy / dist) * force;
// // // // // // // // // // // // // // // // // // // //       velocities.current[i * 3 + 2] += (-dz / dist) * force;

// // // // // // // // // // // // // // // // // // // //       // Check if particle should be captured into accretion disk
// // // // // // // // // // // // // // // // // // // //       if (dist < blackHoleRadius + 5 && dist > blackHoleRadius + 0.2) {
// // // // // // // // // // // // // // // // // // // //         // Particle is in the accretion disk zone
// // // // // // // // // // // // // // // // // // // //         const captureChance = 0.02; // Adjust this value to control capture rate
// // // // // // // // // // // // // // // // // // // //         if (Math.random() < captureChance) {
// // // // // // // // // // // // // // // // // // // //           // Capture particle
// // // // // // // // // // // // // // // // // // // //           const capturedPosition = new Float32Array(3);
// // // // // // // // // // // // // // // // // // // //           capturedPosition[0] = posArray[i * 3];
// // // // // // // // // // // // // // // // // // // //           capturedPosition[1] = posArray[i * 3 + 1];
// // // // // // // // // // // // // // // // // // // //           capturedPosition[2] = posArray[i * 3 + 2];
// // // // // // // // // // // // // // // // // // // //           capturedParticlesRef.current = Float32Array.from([
// // // // // // // // // // // // // // // // // // // //             ...capturedParticlesRef.current,
// // // // // // // // // // // // // // // // // // // //             ...capturedPosition,
// // // // // // // // // // // // // // // // // // // //           ]);

// // // // // // // // // // // // // // // // // // // //           // Assign color based on position
// // // // // // // // // // // // // // // // // // // //           const normalizedRadius = (dist - (blackHoleRadius + 0.2)) / (5 - 0.2);
// // // // // // // // // // // // // // // // // // // //           const color = new Color().setHSL(0.1 * (1 - normalizedRadius), 1.0, 0.5 + 0.5 * (1 - normalizedRadius));
// // // // // // // // // // // // // // // // // // // //           const capturedColor = new Float32Array([color.r, color.g, color.b]);
// // // // // // // // // // // // // // // // // // // //           capturedColorsRef.current = Float32Array.from([
// // // // // // // // // // // // // // // // // // // //             ...capturedColorsRef.current,
// // // // // // // // // // // // // // // // // // // //             ...capturedColor,
// // // // // // // // // // // // // // // // // // // //           ]);

// // // // // // // // // // // // // // // // // // // //           // Remove particle from particle system by resetting it
// // // // // // // // // // // // // // // // // // // //           posArray[i * 3] = starPositionRef.current.x;
// // // // // // // // // // // // // // // // // // // //           posArray[i * 3 + 1] = starPositionRef.current.y;
// // // // // // // // // // // // // // // // // // // //           posArray[i * 3 + 2] = starPositionRef.current.z;

// // // // // // // // // // // // // // // // // // // //           velocities.current[i * 3] = -(Math.random() * 0.02 + 0.01);
// // // // // // // // // // // // // // // // // // // //           velocities.current[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
// // // // // // // // // // // // // // // // // // // //           velocities.current[i * 3 + 2] = (Math.random() - 0.5) * 0.02;

// // // // // // // // // // // // // // // // // // // //           continue; // Skip further processing for this particle
// // // // // // // // // // // // // // // // // // // //         }
// // // // // // // // // // // // // // // // // // // //       }

// // // // // // // // // // // // // // // // // // // //       // Reset particle if it's too close to the black hole
// // // // // // // // // // // // // // // // // // // //       if (dist < blackHoleRadius) {
// // // // // // // // // // // // // // // // // // // //         posArray[i * 3] = starPositionRef.current.x;
// // // // // // // // // // // // // // // // // // // //         posArray[i * 3 + 1] = starPositionRef.current.y;
// // // // // // // // // // // // // // // // // // // //         posArray[i * 3 + 2] = starPositionRef.current.z;

// // // // // // // // // // // // // // // // // // // //         velocities.current[i * 3] = -(Math.random() * 0.02 + 0.01);
// // // // // // // // // // // // // // // // // // // //         velocities.current[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
// // // // // // // // // // // // // // // // // // // //         velocities.current[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
// // // // // // // // // // // // // // // // // // // //       }
// // // // // // // // // // // // // // // // // // // //     }

// // // // // // // // // // // // // // // // // // // //     particleGeometry.attributes.position.needsUpdate = true;
// // // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // // //   return <points ref={particlesRef} geometry={particleGeometry} material={particleMaterial} />;
// // // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // // const BlackHoleScene: React.FC = () => {
// // // // // // // // // // // // // // // // // // // //   const starPositionRef = useRef<Vector3>(new Vector3(10, 0, 0));
// // // // // // // // // // // // // // // // // // // //   const blackHoleRadius = 2;

// // // // // // // // // // // // // // // // // // // //   const capturedParticlesRef = useRef<Float32Array>(new Float32Array());
// // // // // // // // // // // // // // // // // // // //   const capturedColorsRef = useRef<Float32Array>(new Float32Array());

// // // // // // // // // // // // // // // // // // // //   return (
// // // // // // // // // // // // // // // // // // // //     <Canvas
// // // // // // // // // // // // // // // // // // // //       style={{ width: '100vw', height: '100vh', background: '#000000' }}
// // // // // // // // // // // // // // // // // // // //       camera={{ position: [0, 5, 25], fov: 60 }}
// // // // // // // // // // // // // // // // // // // //     >
// // // // // // // // // // // // // // // // // // // //       <ambientLight intensity={0.2} />
// // // // // // // // // // // // // // // // // // // //       <pointLight position={[0, 0, 0]} intensity={1} color="#ffffff" />
// // // // // // // // // // // // // // // // // // // //       <ErrorBoundary>
// // // // // // // // // // // // // // // // // // // //         <BlackHole />
// // // // // // // // // // // // // // // // // // // //         <AccretionDisk
// // // // // // // // // // // // // // // // // // // //           blackHoleRadius={blackHoleRadius}
// // // // // // // // // // // // // // // // // // // //           capturedParticles={capturedParticlesRef.current}
// // // // // // // // // // // // // // // // // // // //           capturedColors={capturedColorsRef.current}
// // // // // // // // // // // // // // // // // // // //         />
// // // // // // // // // // // // // // // // // // // //         <Star positionRef={starPositionRef} blackHoleRadius={blackHoleRadius} />
// // // // // // // // // // // // // // // // // // // //         <ParticleSystem
// // // // // // // // // // // // // // // // // // // //           starPositionRef={starPositionRef}
// // // // // // // // // // // // // // // // // // // //           blackHoleRadius={blackHoleRadius}
// // // // // // // // // // // // // // // // // // // //           capturedParticlesRef={capturedParticlesRef}
// // // // // // // // // // // // // // // // // // // //           capturedColorsRef={capturedColorsRef}
// // // // // // // // // // // // // // // // // // // //         />
// // // // // // // // // // // // // // // // // // // //       </ErrorBoundary>
// // // // // // // // // // // // // // // // // // // //       <EffectComposer>
// // // // // // // // // // // // // // // // // // // //         <Bloom
// // // // // // // // // // // // // // // // // // // //           luminanceThreshold={0.5}
// // // // // // // // // // // // // // // // // // // //           luminanceSmoothing={0.1}
// // // // // // // // // // // // // // // // // // // //           intensity={1.5}
// // // // // // // // // // // // // // // // // // // //           height={300}
// // // // // // // // // // // // // // // // // // // //         />
// // // // // // // // // // // // // // // // // // // //       </EffectComposer>
// // // // // // // // // // // // // // // // // // // //       <Controls />
// // // // // // // // // // // // // // // // // // // //     </Canvas>
// // // // // // // // // // // // // // // // // // // //   );
// // // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // // export default BlackHoleScene;


// // // // // // // // // // // // // // // // // // // // BlackHoleScene.tsx

// // // // // // // // // // // // // // // // // // // import React, { useState, useEffect, useRef, useMemo } from 'react';
// // // // // // // // // // // // // // // // // // // import {
// // // // // // // // // // // // // // // // // // //   ShaderMaterial,
// // // // // // // // // // // // // // // // // // //   Vector2,
// // // // // // // // // // // // // // // // // // //   AdditiveBlending,
// // // // // // // // // // // // // // // // // // //   Mesh,
// // // // // // // // // // // // // // // // // // //   Points,
// // // // // // // // // // // // // // // // // // //   BufferGeometry,
// // // // // // // // // // // // // // // // // // //   BufferAttribute,
// // // // // // // // // // // // // // // // // // //   PointsMaterial,
// // // // // // // // // // // // // // // // // // //   Color,
// // // // // // // // // // // // // // // // // // //   Vector3,
// // // // // // // // // // // // // // // // // // //   DoubleSide,
// // // // // // // // // // // // // // // // // // // } from 'three';
// // // // // // // // // // // // // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // // // // // // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // // // // // // // // // // // // // import { EffectComposer, Bloom } from '@react-three/postprocessing';
// // // // // // // // // // // // // // // // // // // import ErrorBoundary from './errorBoundary';

// // // // // // // // // // // // // // // // // // // extend({ OrbitControls });

// // // // // // // // // // // // // // // // // // // const Controls = () => {
// // // // // // // // // // // // // // // // // // //   const { camera, gl } = useThree();
// // // // // // // // // // // // // // // // // // //   const controlsRef = useRef<any>(null);

// // // // // // // // // // // // // // // // // // //   useEffect(() => {
// // // // // // // // // // // // // // // // // // //     controlsRef.current = new OrbitControls(camera, gl.domElement);
// // // // // // // // // // // // // // // // // // //     controlsRef.current.enableDamping = true;
// // // // // // // // // // // // // // // // // // //     return () => {
// // // // // // // // // // // // // // // // // // //       controlsRef.current.dispose();
// // // // // // // // // // // // // // // // // // //     };
// // // // // // // // // // // // // // // // // // //   }, [camera, gl]);

// // // // // // // // // // // // // // // // // // //   useFrame(() => {
// // // // // // // // // // // // // // // // // // //     controlsRef.current.update();
// // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // //   return null;
// // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // const BlackHole = () => {
// // // // // // // // // // // // // // // // // // //   const meshRef = useRef<Mesh>(null);

// // // // // // // // // // // // // // // // // // //   // Custom shader material for the black hole with gravitational lensing
// // // // // // // // // // // // // // // // // // //   const blackHoleMaterial = useMemo(
// // // // // // // // // // // // // // // // // // //     () =>
// // // // // // // // // // // // // // // // // // //       new ShaderMaterial({
// // // // // // // // // // // // // // // // // // //         uniforms: {
// // // // // // // // // // // // // // // // // // //           u_time: { value: 0 },
// // // // // // // // // // // // // // // // // // //           u_resolution: { value: new Vector2(window.innerWidth, window.innerHeight) },
// // // // // // // // // // // // // // // // // // //           u_cameraPos: { value: new Vector3() }, // Initialize with default value
// // // // // // // // // // // // // // // // // // //           u_blackHolePos: { value: new Vector3(0, 0, 0) },
// // // // // // // // // // // // // // // // // // //         },
// // // // // // // // // // // // // // // // // // //         vertexShader: `
// // // // // // // // // // // // // // // // // // //           varying vec3 vWorldPosition;
// // // // // // // // // // // // // // // // // // //           void main() {
// // // // // // // // // // // // // // // // // // //             vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
// // // // // // // // // // // // // // // // // // //             gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
// // // // // // // // // // // // // // // // // // //           }
// // // // // // // // // // // // // // // // // // //         `,
// // // // // // // // // // // // // // // // // // //         fragmentShader: `
// // // // // // // // // // // // // // // // // // //           varying vec3 vWorldPosition;
// // // // // // // // // // // // // // // // // // //           uniform vec3 u_cameraPos;
// // // // // // // // // // // // // // // // // // //           uniform vec3 u_blackHolePos;
// // // // // // // // // // // // // // // // // // //           void main() {
// // // // // // // // // // // // // // // // // // //             // Simplified gravitational lensing effect
// // // // // // // // // // // // // // // // // // //             vec3 dir = normalize(vWorldPosition - u_cameraPos);
// // // // // // // // // // // // // // // // // // //             float dist = length(vWorldPosition - u_blackHolePos);
// // // // // // // // // // // // // // // // // // //             float lensing = clamp(1.0 / (dist * dist * 100.0), 0.0, 1.0);
// // // // // // // // // // // // // // // // // // //             gl_FragColor = vec4(vec3(0.0), 1.0 - lensing);
// // // // // // // // // // // // // // // // // // //           }
// // // // // // // // // // // // // // // // // // //         `,
// // // // // // // // // // // // // // // // // // //         side: DoubleSide,
// // // // // // // // // // // // // // // // // // //       }),
// // // // // // // // // // // // // // // // // // //     []
// // // // // // // // // // // // // // // // // // //   );

// // // // // // // // // // // // // // // // // // //   useFrame(({ clock, camera }) => {
// // // // // // // // // // // // // // // // // // //     blackHoleMaterial.uniforms.u_time.value = clock.getElapsedTime();
// // // // // // // // // // // // // // // // // // //     blackHoleMaterial.uniforms.u_cameraPos.value.copy(camera.position);
// // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // //   return (
// // // // // // // // // // // // // // // // // // //     <mesh ref={meshRef} material={blackHoleMaterial}>
// // // // // // // // // // // // // // // // // // //       <sphereGeometry args={[2, 64, 64]} />
// // // // // // // // // // // // // // // // // // //     </mesh>
// // // // // // // // // // // // // // // // // // //   );
// // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // interface AccretionDiskProps {
// // // // // // // // // // // // // // // // // // //   blackHoleRadius: number;
// // // // // // // // // // // // // // // // // // // }

// // // // // // // // // // // // // // // // // // // const AccretionDisk: React.FC<AccretionDiskProps> = ({ blackHoleRadius }) => {
// // // // // // // // // // // // // // // // // // //   const particlesRef = useRef<Points>(null);
// // // // // // // // // // // // // // // // // // //   const particleCount = 20000; // Increased for smoother density gradient

// // // // // // // // // // // // // // // // // // //   // Generate positions, colors, and activation times for particles in a disk shape
// // // // // // // // // // // // // // // // // // //   const { positions, colors, activationTimes } = useMemo(() => {
// // // // // // // // // // // // // // // // // // //     const positionsArray = new Float32Array(particleCount * 3);
// // // // // // // // // // // // // // // // // // //     const colorsArray = new Float32Array(particleCount * 3);
// // // // // // // // // // // // // // // // // // //     const activationTimesArray = new Float32Array(particleCount);

// // // // // // // // // // // // // // // // // // //     const innerRadius = blackHoleRadius + 0.2;
// // // // // // // // // // // // // // // // // // //     const outerRadius = blackHoleRadius + 5;

// // // // // // // // // // // // // // // // // // //     for (let i = 0; i < particleCount; i++) {
// // // // // // // // // // // // // // // // // // //       // Generate a radius with higher density closer to the EH
// // // // // // // // // // // // // // // // // // //       const t = Math.random();
// // // // // // // // // // // // // // // // // // //       const radius = innerRadius + (1 - t ** 2) * (outerRadius - innerRadius);

// // // // // // // // // // // // // // // // // // //       const angle = Math.random() * 2 * Math.PI;

// // // // // // // // // // // // // // // // // // //       positionsArray[i * 3] = radius * Math.cos(angle);
// // // // // // // // // // // // // // // // // // //       positionsArray[i * 3 + 1] = (Math.random() - 0.5) * 0.2; // Slight vertical spread
// // // // // // // // // // // // // // // // // // //       positionsArray[i * 3 + 2] = radius * Math.sin(angle);

// // // // // // // // // // // // // // // // // // //       // Color gradient from white (hot) near black hole to orange (cooler) outward
// // // // // // // // // // // // // // // // // // //       const normalizedRadius = (radius - innerRadius) / (outerRadius - innerRadius);
// // // // // // // // // // // // // // // // // // //       const color = new Color().setHSL(0.1 * (1 - normalizedRadius), 1.0, 0.5 + 0.5 * (1 - normalizedRadius));
// // // // // // // // // // // // // // // // // // //       colorsArray[i * 3] = color.r;
// // // // // // // // // // // // // // // // // // //       colorsArray[i * 3 + 1] = color.g;
// // // // // // // // // // // // // // // // // // //       colorsArray[i * 3 + 2] = color.b;

// // // // // // // // // // // // // // // // // // //       // Assign activation times to build up the disk over time
// // // // // // // // // // // // // // // // // // //       activationTimesArray[i] = normalizedRadius * 10; // Particles closer to EH activate earlier
// // // // // // // // // // // // // // // // // // //     }

// // // // // // // // // // // // // // // // // // //     return { positions: positionsArray, colors: colorsArray, activationTimes: activationTimesArray };
// // // // // // // // // // // // // // // // // // //   }, [particleCount, blackHoleRadius]);

// // // // // // // // // // // // // // // // // // //   const particleGeometry = useMemo(() => {
// // // // // // // // // // // // // // // // // // //     const geom = new BufferGeometry();
// // // // // // // // // // // // // // // // // // //     geom.setAttribute('position', new BufferAttribute(positions, 3));
// // // // // // // // // // // // // // // // // // //     geom.setAttribute('color', new BufferAttribute(colors, 3));
// // // // // // // // // // // // // // // // // // //     geom.setAttribute('activationTime', new BufferAttribute(activationTimes, 1));
// // // // // // // // // // // // // // // // // // //     return geom;
// // // // // // // // // // // // // // // // // // //   }, [positions, colors, activationTimes]);

// // // // // // // // // // // // // // // // // // //   const particleMaterial = useMemo(
// // // // // // // // // // // // // // // // // // //     () =>
// // // // // // // // // // // // // // // // // // //       new ShaderMaterial({
// // // // // // // // // // // // // // // // // // //         uniforms: {
// // // // // // // // // // // // // // // // // // //           u_time: { value: 0 },
// // // // // // // // // // // // // // // // // // //         },
// // // // // // // // // // // // // // // // // // //         vertexShader: `
// // // // // // // // // // // // // // // // // // //           attribute float activationTime;
// // // // // // // // // // // // // // // // // // //           varying float vOpacity;
// // // // // // // // // // // // // // // // // // //           void main() {
// // // // // // // // // // // // // // // // // // //             if (activationTime <= u_time) {
// // // // // // // // // // // // // // // // // // //               vOpacity = 1.0;
// // // // // // // // // // // // // // // // // // //             } else {
// // // // // // // // // // // // // // // // // // //               vOpacity = 0.0;
// // // // // // // // // // // // // // // // // // //             }
// // // // // // // // // // // // // // // // // // //             gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
// // // // // // // // // // // // // // // // // // //             gl_PointSize = ${window.devicePixelRatio} * 0.5;
// // // // // // // // // // // // // // // // // // //           }
// // // // // // // // // // // // // // // // // // //         `,
// // // // // // // // // // // // // // // // // // //         fragmentShader: `
// // // // // // // // // // // // // // // // // // //           varying float vOpacity;
// // // // // // // // // // // // // // // // // // //           varying vec3 vColor;
// // // // // // // // // // // // // // // // // // //           void main() {
// // // // // // // // // // // // // // // // // // //             gl_FragColor = vec4(vColor, vOpacity);
// // // // // // // // // // // // // // // // // // //           }
// // // // // // // // // // // // // // // // // // //         `,
// // // // // // // // // // // // // // // // // // //         transparent: true,
// // // // // // // // // // // // // // // // // // //         vertexColors: true,
// // // // // // // // // // // // // // // // // // //         blending: AdditiveBlending,
// // // // // // // // // // // // // // // // // // //       }),
// // // // // // // // // // // // // // // // // // //     []
// // // // // // // // // // // // // // // // // // //   );

// // // // // // // // // // // // // // // // // // //   useFrame(({ clock }) => {
// // // // // // // // // // // // // // // // // // //     particleMaterial.uniforms.u_time.value = clock.getElapsedTime();
// // // // // // // // // // // // // // // // // // //     if (particlesRef.current) {
// // // // // // // // // // // // // // // // // // //       particlesRef.current.rotation.y += 0.002; // Slow rotation
// // // // // // // // // // // // // // // // // // //     }
// // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // //   return (
// // // // // // // // // // // // // // // // // // //     <points ref={particlesRef} geometry={particleGeometry} material={particleMaterial} />
// // // // // // // // // // // // // // // // // // //   );
// // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // interface StarProps {
// // // // // // // // // // // // // // // // // // //   positionRef: React.MutableRefObject<Vector3>;
// // // // // // // // // // // // // // // // // // //   blackHoleRadius: number;
// // // // // // // // // // // // // // // // // // // }

// // // // // // // // // // // // // // // // // // // const Star: React.FC<StarProps> = ({ positionRef, blackHoleRadius }) => {
// // // // // // // // // // // // // // // // // // //   const starRef = useRef<Mesh>(null);

// // // // // // // // // // // // // // // // // // //   useFrame(({ clock }) => {
// // // // // // // // // // // // // // // // // // //     if (starRef.current) {
// // // // // // // // // // // // // // // // // // //       const t = clock.getElapsedTime();

// // // // // // // // // // // // // // // // // // //       // Decaying orbit parameters
// // // // // // // // // // // // // // // // // // //       const initialRadius = 10;
// // // // // // // // // // // // // // // // // // //       const decayRate = 0.05; // Adjust for slower decay

// // // // // // // // // // // // // // // // // // //       const radius = Math.max(blackHoleRadius, initialRadius - decayRate * t);
// // // // // // // // // // // // // // // // // // //       const angularSpeed = 0.8; // Adjust for slower orbit

// // // // // // // // // // // // // // // // // // //       const angle = angularSpeed * t;

// // // // // // // // // // // // // // // // // // //       // Convert polar to Cartesian coordinates
// // // // // // // // // // // // // // // // // // //       const x = radius * Math.cos(angle);
// // // // // // // // // // // // // // // // // // //       const z = radius * Math.sin(angle);

// // // // // // // // // // // // // // // // // // //       starRef.current.position.set(x, 0, z);

// // // // // // // // // // // // // // // // // // //       // Update the shared positionRef
// // // // // // // // // // // // // // // // // // //       positionRef.current.copy(starRef.current.position);

// // // // // // // // // // // // // // // // // // //       // Calculate scale based on distance to black hole
// // // // // // // // // // // // // // // // // // //       const distanceToBH = radius - blackHoleRadius;
// // // // // // // // // // // // // // // // // // //       const initialScale = 1.0;
// // // // // // // // // // // // // // // // // // //       const scale = (distanceToBH / (initialRadius - blackHoleRadius)) * initialScale;
// // // // // // // // // // // // // // // // // // //       starRef.current.scale.set(scale, scale, scale);
// // // // // // // // // // // // // // // // // // //     }
// // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // //   return (
// // // // // // // // // // // // // // // // // // //     <mesh ref={starRef}>
// // // // // // // // // // // // // // // // // // //       <sphereGeometry args={[1.5, 32, 32]} />
// // // // // // // // // // // // // // // // // // //       <meshStandardMaterial
// // // // // // // // // // // // // // // // // // //         color="#ffff00"
// // // // // // // // // // // // // // // // // // //         emissive="#ffff00"
// // // // // // // // // // // // // // // // // // //         emissiveIntensity={2} // Increased intensity for bloom effect
// // // // // // // // // // // // // // // // // // //       />
// // // // // // // // // // // // // // // // // // //     </mesh>
// // // // // // // // // // // // // // // // // // //   );
// // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // interface ParticleSystemProps {
// // // // // // // // // // // // // // // // // // //   starPositionRef: React.MutableRefObject<Vector3>;
// // // // // // // // // // // // // // // // // // // }

// // // // // // // // // // // // // // // // // // // const ParticleSystem: React.FC<ParticleSystemProps> = ({ starPositionRef }) => {
// // // // // // // // // // // // // // // // // // //   const particlesRef = useRef<Points>(null);

// // // // // // // // // // // // // // // // // // //   const particleCount = 5000;
// // // // // // // // // // // // // // // // // // //   const positions = useRef<Float32Array>(new Float32Array(particleCount * 3));
// // // // // // // // // // // // // // // // // // //   const velocities = useRef<Float32Array>(new Float32Array(particleCount * 3));

// // // // // // // // // // // // // // // // // // //   // Initialize particles only once
// // // // // // // // // // // // // // // // // // //   // eslint-disable-next-line react-hooks/exhaustive-deps
// // // // // // // // // // // // // // // // // // //   useEffect(() => {
// // // // // // // // // // // // // // // // // // //     for (let i = 0; i < particleCount; i += 1) {
// // // // // // // // // // // // // // // // // // //       positions.current[i * 3] = starPositionRef.current.x;
// // // // // // // // // // // // // // // // // // //       positions.current[i * 3 + 1] = starPositionRef.current.y;
// // // // // // // // // // // // // // // // // // //       positions.current[i * 3 + 2] = starPositionRef.current.z;

// // // // // // // // // // // // // // // // // // //       velocities.current[i * 3] = -(Math.random() * 0.02 + 0.01);
// // // // // // // // // // // // // // // // // // //       velocities.current[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
// // // // // // // // // // // // // // // // // // //       velocities.current[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
// // // // // // // // // // // // // // // // // // //     }
// // // // // // // // // // // // // // // // // // //   }); // Empty dependency array to run only once

// // // // // // // // // // // // // // // // // // //   const particleGeometry = useMemo(() => {
// // // // // // // // // // // // // // // // // // //     const geom = new BufferGeometry();
// // // // // // // // // // // // // // // // // // //     geom.setAttribute('position', new BufferAttribute(positions.current, 3));
// // // // // // // // // // // // // // // // // // //     return geom;
// // // // // // // // // // // // // // // // // // //   }, []);

// // // // // // // // // // // // // // // // // // //   const particleMaterial = useMemo(
// // // // // // // // // // // // // // // // // // //     () =>
// // // // // // // // // // // // // // // // // // //       new PointsMaterial({
// // // // // // // // // // // // // // // // // // //         color: '#ffa500',
// // // // // // // // // // // // // // // // // // //         size: 0.1,
// // // // // // // // // // // // // // // // // // //         blending: AdditiveBlending,
// // // // // // // // // // // // // // // // // // //         transparent: true,
// // // // // // // // // // // // // // // // // // //       }),
// // // // // // // // // // // // // // // // // // //     []
// // // // // // // // // // // // // // // // // // //   );

// // // // // // // // // // // // // // // // // // //   useFrame(() => {
// // // // // // // // // // // // // // // // // // //     const posArray = particleGeometry.attributes.position.array as Float32Array;

// // // // // // // // // // // // // // // // // // //     for (let i = 0; i < particleCount; i += 1) {
// // // // // // // // // // // // // // // // // // //       // Update positions based on velocities
// // // // // // // // // // // // // // // // // // //       posArray[i * 3] += velocities.current[i * 3];
// // // // // // // // // // // // // // // // // // //       posArray[i * 3 + 1] += velocities.current[i * 3 + 1];
// // // // // // // // // // // // // // // // // // //       posArray[i * 3 + 2] += velocities.current[i * 3 + 2];

// // // // // // // // // // // // // // // // // // //       // Simple gravity towards the black hole
// // // // // // // // // // // // // // // // // // //       const dx = posArray[i * 3];
// // // // // // // // // // // // // // // // // // //       const dy = posArray[i * 3 + 1];
// // // // // // // // // // // // // // // // // // //       const dz = posArray[i * 3 + 2];
// // // // // // // // // // // // // // // // // // //       const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
// // // // // // // // // // // // // // // // // // //       const force = (0.02 / dist) * 0.1;

// // // // // // // // // // // // // // // // // // //       velocities.current[i * 3] += (-dx / dist) * force;
// // // // // // // // // // // // // // // // // // //       velocities.current[i * 3 + 1] += (-dy / dist) * force;
// // // // // // // // // // // // // // // // // // //       velocities.current[i * 3 + 2] += (-dz / dist) * force;

// // // // // // // // // // // // // // // // // // //       // Reset particle if it's too close to the black hole
// // // // // // // // // // // // // // // // // // //       if (dist < 2) {
// // // // // // // // // // // // // // // // // // //         posArray[i * 3] = starPositionRef.current.x;
// // // // // // // // // // // // // // // // // // //         posArray[i * 3 + 1] = starPositionRef.current.y;
// // // // // // // // // // // // // // // // // // //         posArray[i * 3 + 2] = starPositionRef.current.z;

// // // // // // // // // // // // // // // // // // //         velocities.current[i * 3] = -(Math.random() * 0.02 + 0.01);
// // // // // // // // // // // // // // // // // // //         velocities.current[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
// // // // // // // // // // // // // // // // // // //         velocities.current[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
// // // // // // // // // // // // // // // // // // //       }
// // // // // // // // // // // // // // // // // // //     }

// // // // // // // // // // // // // // // // // // //     particleGeometry.attributes.position.needsUpdate = true;
// // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // //   return (
// // // // // // // // // // // // // // // // // // //     <points ref={particlesRef} geometry={particleGeometry} material={particleMaterial} />
// // // // // // // // // // // // // // // // // // //   );
// // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // const BlackHoleScene: React.FC = () => {
// // // // // // // // // // // // // // // // // // //   const starPositionRef = useRef<Vector3>(new Vector3(10, 0, 0));
// // // // // // // // // // // // // // // // // // //   const blackHoleRadius = 2;

// // // // // // // // // // // // // // // // // // //   return (
// // // // // // // // // // // // // // // // // // //     <Canvas
// // // // // // // // // // // // // // // // // // //       style={{ width: '100vw', height: '100vh', background: '#000000' }}
// // // // // // // // // // // // // // // // // // //       camera={{ position: [20, 55, 25], fov: 60 }}
// // // // // // // // // // // // // // // // // // //     >
// // // // // // // // // // // // // // // // // // //       <ambientLight intensity={0.2} />
// // // // // // // // // // // // // // // // // // //       <pointLight position={[0, 0, 0]} intensity={1} color="#ffffff" />
// // // // // // // // // // // // // // // // // // //       <ErrorBoundary>
// // // // // // // // // // // // // // // // // // //         <BlackHole />
// // // // // // // // // // // // // // // // // // //         <AccretionDisk blackHoleRadius={blackHoleRadius} />
// // // // // // // // // // // // // // // // // // //         <Star positionRef={starPositionRef} blackHoleRadius={blackHoleRadius} />
// // // // // // // // // // // // // // // // // // //         <ParticleSystem starPositionRef={starPositionRef} />
// // // // // // // // // // // // // // // // // // //       </ErrorBoundary>
// // // // // // // // // // // // // // // // // // //       <EffectComposer>
// // // // // // // // // // // // // // // // // // //         <Bloom
// // // // // // // // // // // // // // // // // // //           luminanceThreshold={0.5}
// // // // // // // // // // // // // // // // // // //           luminanceSmoothing={0.1}
// // // // // // // // // // // // // // // // // // //           intensity={1.5}
// // // // // // // // // // // // // // // // // // //           height={300}
// // // // // // // // // // // // // // // // // // //         />
// // // // // // // // // // // // // // // // // // //       </EffectComposer>
// // // // // // // // // // // // // // // // // // //       <Controls />
// // // // // // // // // // // // // // // // // // //     </Canvas>
// // // // // // // // // // // // // // // // // // //   );
// // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // export default BlackHoleScene;


// // // // // // // // // // // // // // // // // // // // // BlackHoleScene.tsx

// // // // // // // // // // // // // // // // // // // // import React, { useState, useEffect, useRef, useMemo } from 'react';
// // // // // // // // // // // // // // // // // // // // import {
// // // // // // // // // // // // // // // // // // // //   ShaderMaterial,
// // // // // // // // // // // // // // // // // // // //   Vector2,
// // // // // // // // // // // // // // // // // // // //   AdditiveBlending,
// // // // // // // // // // // // // // // // // // // //   Mesh,
// // // // // // // // // // // // // // // // // // // //   Points,
// // // // // // // // // // // // // // // // // // // //   BufferGeometry,
// // // // // // // // // // // // // // // // // // // //   BufferAttribute,
// // // // // // // // // // // // // // // // // // // //   PointsMaterial,
// // // // // // // // // // // // // // // // // // // //   Color,
// // // // // // // // // // // // // // // // // // // //   Vector3,
// // // // // // // // // // // // // // // // // // // //   DoubleSide,
// // // // // // // // // // // // // // // // // // // // } from 'three';
// // // // // // // // // // // // // // // // // // // // import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
// // // // // // // // // // // // // // // // // // // // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// // // // // // // // // // // // // // // // // // // // import { EffectComposer, Bloom } from '@react-three/postprocessing';
// // // // // // // // // // // // // // // // // // // // import ErrorBoundary from './errorBoundary';

// // // // // // // // // // // // // // // // // // // // extend({ OrbitControls });

// // // // // // // // // // // // // // // // // // // // const Controls = () => {
// // // // // // // // // // // // // // // // // // // //   const { camera, gl } = useThree();
// // // // // // // // // // // // // // // // // // // //   const controlsRef = useRef<any>(null);

// // // // // // // // // // // // // // // // // // // //   useEffect(() => {
// // // // // // // // // // // // // // // // // // // //     controlsRef.current = new OrbitControls(camera, gl.domElement);
// // // // // // // // // // // // // // // // // // // //     controlsRef.current.enableDamping = true;
// // // // // // // // // // // // // // // // // // // //     return () => {
// // // // // // // // // // // // // // // // // // // //       controlsRef.current.dispose();
// // // // // // // // // // // // // // // // // // // //     };
// // // // // // // // // // // // // // // // // // // //   }, [camera, gl]);

// // // // // // // // // // // // // // // // // // // //   useFrame(() => {
// // // // // // // // // // // // // // // // // // // //     controlsRef.current.update();
// // // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // // //   return null;
// // // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // // const BlackHole = () => {
// // // // // // // // // // // // // // // // // // // //   const meshRef = useRef<Mesh>(null);

// // // // // // // // // // // // // // // // // // // //   // Custom shader material for the black hole with gravitational lensing
// // // // // // // // // // // // // // // // // // // //   const blackHoleMaterial = useMemo(
// // // // // // // // // // // // // // // // // // // //     () =>
// // // // // // // // // // // // // // // // // // // //       new ShaderMaterial({
// // // // // // // // // // // // // // // // // // // //         uniforms: {
// // // // // // // // // // // // // // // // // // // //           u_time: { value: 0 },
// // // // // // // // // // // // // // // // // // // //           u_resolution: { value: new Vector2(window.innerWidth, window.innerHeight) },
// // // // // // // // // // // // // // // // // // // //           u_cameraPos: { value: new Vector3() }, // Initialize with default value
// // // // // // // // // // // // // // // // // // // //           u_blackHolePos: { value: new Vector3(0, 0, 0) },
// // // // // // // // // // // // // // // // // // // //         },
// // // // // // // // // // // // // // // // // // // //         vertexShader: `
// // // // // // // // // // // // // // // // // // // //           varying vec3 vWorldPosition;
// // // // // // // // // // // // // // // // // // // //           void main() {
// // // // // // // // // // // // // // // // // // // //             vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
// // // // // // // // // // // // // // // // // // // //             gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
// // // // // // // // // // // // // // // // // // // //           }
// // // // // // // // // // // // // // // // // // // //         `,
// // // // // // // // // // // // // // // // // // // //         fragmentShader: `
// // // // // // // // // // // // // // // // // // // //           varying vec3 vWorldPosition;
// // // // // // // // // // // // // // // // // // // //           uniform vec3 u_cameraPos;
// // // // // // // // // // // // // // // // // // // //           uniform vec3 u_blackHolePos;
// // // // // // // // // // // // // // // // // // // //           void main() {
// // // // // // // // // // // // // // // // // // // //             // Simplified gravitational lensing effect
// // // // // // // // // // // // // // // // // // // //             vec3 dir = normalize(vWorldPosition - u_cameraPos);
// // // // // // // // // // // // // // // // // // // //             float dist = length(vWorldPosition - u_blackHolePos);
// // // // // // // // // // // // // // // // // // // //             float lensing = clamp(1.0 / (dist * dist * 100.0), 0.0, 1.0);
// // // // // // // // // // // // // // // // // // // //             gl_FragColor = vec4(vec3(0.0), 1.0 - lensing);
// // // // // // // // // // // // // // // // // // // //           }
// // // // // // // // // // // // // // // // // // // //         `,
// // // // // // // // // // // // // // // // // // // //         side: DoubleSide,
// // // // // // // // // // // // // // // // // // // //       }),
// // // // // // // // // // // // // // // // // // // //     []
// // // // // // // // // // // // // // // // // // // //   );

// // // // // // // // // // // // // // // // // // // //   useFrame(({ clock, camera }) => {
// // // // // // // // // // // // // // // // // // // //     blackHoleMaterial.uniforms.u_time.value = clock.getElapsedTime();
// // // // // // // // // // // // // // // // // // // //     blackHoleMaterial.uniforms.u_cameraPos.value.copy(camera.position);
// // // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // // //   return (
// // // // // // // // // // // // // // // // // // // //     <mesh ref={meshRef} material={blackHoleMaterial}>
// // // // // // // // // // // // // // // // // // // //       <sphereGeometry args={[2, 64, 64]} />
// // // // // // // // // // // // // // // // // // // //     </mesh>
// // // // // // // // // // // // // // // // // // // //   );
// // // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // // interface AccretionDiskProps {
// // // // // // // // // // // // // // // // // // // //   blackHoleRadius: number;
// // // // // // // // // // // // // // // // // // // // }

// // // // // // // // // // // // // // // // // // // // const AccretionDisk: React.FC<AccretionDiskProps> = ({ blackHoleRadius }) => {
// // // // // // // // // // // // // // // // // // // //   const particlesRef = useRef<Points>(null);
// // // // // // // // // // // // // // // // // // // //   const particleCount = 10000;

// // // // // // // // // // // // // // // // // // // //   // Generate positions and colors for particles in a disk shape
// // // // // // // // // // // // // // // // // // // //   const positionColorData = useMemo(() => {
// // // // // // // // // // // // // // // // // // // //     const positionsArray = new Float32Array(particleCount * 3);
// // // // // // // // // // // // // // // // // // // //     const colorsArray = new Float32Array(particleCount * 3);

// // // // // // // // // // // // // // // // // // // //     const innerRadius = blackHoleRadius + 0.2;
// // // // // // // // // // // // // // // // // // // //     const outerRadius = blackHoleRadius + 5;

// // // // // // // // // // // // // // // // // // // //     for (let i = 0; i < particleCount; i++) {
// // // // // // // // // // // // // // // // // // // //       const angle = Math.random() * 2 * Math.PI;
// // // // // // // // // // // // // // // // // // // //       const radius = Math.sqrt(
// // // // // // // // // // // // // // // // // // // //         Math.random() * (outerRadius ** 2 - innerRadius ** 2) + innerRadius ** 2
// // // // // // // // // // // // // // // // // // // //       );

// // // // // // // // // // // // // // // // // // // //       positionsArray[i * 3] = radius * Math.cos(angle);
// // // // // // // // // // // // // // // // // // // //       positionsArray[i * 3 + 1] = (Math.random() - 0.5) * 0.2; // Slight vertical spread
// // // // // // // // // // // // // // // // // // // //       positionsArray[i * 3 + 2] = radius * Math.sin(angle);

// // // // // // // // // // // // // // // // // // // //       // Color gradient from white (hot) near black hole to orange (cooler) outward
// // // // // // // // // // // // // // // // // // // //       const t = (radius - innerRadius) / (outerRadius - innerRadius);
// // // // // // // // // // // // // // // // // // // //       const color = new Color().setHSL(0.1 * (1 - t), 1.0, 0.5 + 0.5 * (1 - t));
// // // // // // // // // // // // // // // // // // // //       colorsArray[i * 3] = color.r;
// // // // // // // // // // // // // // // // // // // //       colorsArray[i * 3 + 1] = color.g;
// // // // // // // // // // // // // // // // // // // //       colorsArray[i * 3 + 2] = color.b;
// // // // // // // // // // // // // // // // // // // //     }

// // // // // // // // // // // // // // // // // // // //     return { positions: positionsArray, colors: colorsArray };
// // // // // // // // // // // // // // // // // // // //   }, [particleCount, blackHoleRadius]);

// // // // // // // // // // // // // // // // // // // //   const positions = positionColorData.positions;
// // // // // // // // // // // // // // // // // // // //   const colors = positionColorData.colors;

// // // // // // // // // // // // // // // // // // // //   const particleGeometry = useMemo(() => {
// // // // // // // // // // // // // // // // // // // //     const geom = new BufferGeometry();
// // // // // // // // // // // // // // // // // // // //     geom.setAttribute('position', new BufferAttribute(positions, 3));
// // // // // // // // // // // // // // // // // // // //     geom.setAttribute('color', new BufferAttribute(colors, 3));
// // // // // // // // // // // // // // // // // // // //     return geom;
// // // // // // // // // // // // // // // // // // // //   }, [positions, colors]);

// // // // // // // // // // // // // // // // // // // //   const particleMaterial = useMemo(
// // // // // // // // // // // // // // // // // // // //     () =>
// // // // // // // // // // // // // // // // // // // //       new PointsMaterial({
// // // // // // // // // // // // // // // // // // // //         size: 0.05,
// // // // // // // // // // // // // // // // // // // //         vertexColors: true,
// // // // // // // // // // // // // // // // // // // //         blending: AdditiveBlending,
// // // // // // // // // // // // // // // // // // // //         transparent: true,
// // // // // // // // // // // // // // // // // // // //       }),
// // // // // // // // // // // // // // // // // // // //     []
// // // // // // // // // // // // // // // // // // // //   );

// // // // // // // // // // // // // // // // // // // //   useFrame(() => {
// // // // // // // // // // // // // // // // // // // //     if (particlesRef.current) {
// // // // // // // // // // // // // // // // // // // //       particlesRef.current.rotation.y += 0.002; // Slow rotation
// // // // // // // // // // // // // // // // // // // //     }
// // // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // // //   return (
// // // // // // // // // // // // // // // // // // // //     <points ref={particlesRef} geometry={particleGeometry} material={particleMaterial} />
// // // // // // // // // // // // // // // // // // // //   );
// // // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // // interface StarProps {
// // // // // // // // // // // // // // // // // // // //   positionRef: React.MutableRefObject<Vector3>;
// // // // // // // // // // // // // // // // // // // // }

// // // // // // // // // // // // // // // // // // // // const Star: React.FC<StarProps> = ({ positionRef }) => {
// // // // // // // // // // // // // // // // // // // //   const starRef = useRef<Mesh>(null);

// // // // // // // // // // // // // // // // // // // //   useFrame(({ clock }) => {
// // // // // // // // // // // // // // // // // // // //     if (starRef.current) {
// // // // // // // // // // // // // // // // // // // //       const t = clock.getElapsedTime();

// // // // // // // // // // // // // // // // // // // //       // Decaying orbit parameters
// // // // // // // // // // // // // // // // // // // //       const initialRadius = 10;
// // // // // // // // // // // // // // // // // // // //       const decayRate = 0.05; // Adjust for slower decay

// // // // // // // // // // // // // // // // // // // //       const radius = Math.max(2.5, initialRadius - decayRate * t);
// // // // // // // // // // // // // // // // // // // //       const angularSpeed = 0.8; // Adjust for slower orbit

// // // // // // // // // // // // // // // // // // // //       const angle = angularSpeed * t;

// // // // // // // // // // // // // // // // // // // //       // Convert polar to Cartesian coordinates
// // // // // // // // // // // // // // // // // // // //       const x = radius * Math.cos(angle);
// // // // // // // // // // // // // // // // // // // //       const z = radius * Math.sin(angle);

// // // // // // // // // // // // // // // // // // // //       starRef.current.position.set(x, 0, z);

// // // // // // // // // // // // // // // // // // // //       // Update the shared positionRef
// // // // // // // // // // // // // // // // // // // //       positionRef.current.copy(starRef.current.position);

// // // // // // // // // // // // // // // // // // // //       // Simple pulsating effect
// // // // // // // // // // // // // // // // // // // //       const scale = 1 + Math.sin(t * 5) * 0.1;
// // // // // // // // // // // // // // // // // // // //       starRef.current.scale.set(scale, scale, scale);
// // // // // // // // // // // // // // // // // // // //     }
// // // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // // //   return (
// // // // // // // // // // // // // // // // // // // //     <mesh ref={starRef}>
// // // // // // // // // // // // // // // // // // // //       <sphereGeometry args={[1.5, 32, 32]} />
// // // // // // // // // // // // // // // // // // // //       <meshStandardMaterial
// // // // // // // // // // // // // // // // // // // //         color="#ffff00"
// // // // // // // // // // // // // // // // // // // //         emissive="#ffff00"
// // // // // // // // // // // // // // // // // // // //         emissiveIntensity={2} // Increased intensity for bloom effect
// // // // // // // // // // // // // // // // // // // //       />
// // // // // // // // // // // // // // // // // // // //     </mesh>
// // // // // // // // // // // // // // // // // // // //   );
// // // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // // interface ParticleSystemProps {
// // // // // // // // // // // // // // // // // // // //   starPositionRef: React.MutableRefObject<Vector3>;
// // // // // // // // // // // // // // // // // // // // }

// // // // // // // // // // // // // // // // // // // // const ParticleSystem: React.FC<ParticleSystemProps> = ({ starPositionRef }) => {
// // // // // // // // // // // // // // // // // // // //   const particlesRef = useRef<Points>(null);

// // // // // // // // // // // // // // // // // // // //   const particleCount = 5000;
// // // // // // // // // // // // // // // // // // // //   const positions = useRef<Float32Array>(new Float32Array(particleCount * 3));
// // // // // // // // // // // // // // // // // // // //   const velocities = useRef<Float32Array>(new Float32Array(particleCount * 3));

// // // // // // // // // // // // // // // // // // // //   // Initialize particles only once
// // // // // // // // // // // // // // // // // // // //   // eslint-disable-next-line react-hooks/exhaustive-deps
// // // // // // // // // // // // // // // // // // // //   useEffect(() => {
// // // // // // // // // // // // // // // // // // // //     for (let i = 0; i < particleCount; i += 1) {
// // // // // // // // // // // // // // // // // // // //       positions.current[i * 3] = starPositionRef.current.x;
// // // // // // // // // // // // // // // // // // // //       positions.current[i * 3 + 1] = starPositionRef.current.y;
// // // // // // // // // // // // // // // // // // // //       positions.current[i * 3 + 2] = starPositionRef.current.z;

// // // // // // // // // // // // // // // // // // // //       velocities.current[i * 3] = -(Math.random() * 0.02 + 0.01);
// // // // // // // // // // // // // // // // // // // //       velocities.current[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
// // // // // // // // // // // // // // // // // // // //       velocities.current[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
// // // // // // // // // // // // // // // // // // // //     }
// // // // // // // // // // // // // // // // // // // //   }); // Empty dependency array to run only once

// // // // // // // // // // // // // // // // // // // //   const particleGeometry = useMemo(() => {
// // // // // // // // // // // // // // // // // // // //     const geom = new BufferGeometry();
// // // // // // // // // // // // // // // // // // // //     geom.setAttribute('position', new BufferAttribute(positions.current, 3));
// // // // // // // // // // // // // // // // // // // //     return geom;
// // // // // // // // // // // // // // // // // // // //   }, []);

// // // // // // // // // // // // // // // // // // // //   const particleMaterial = useMemo(
// // // // // // // // // // // // // // // // // // // //     () =>
// // // // // // // // // // // // // // // // // // // //       new PointsMaterial({
// // // // // // // // // // // // // // // // // // // //         color: '#ffa500',
// // // // // // // // // // // // // // // // // // // //         size: 0.1,
// // // // // // // // // // // // // // // // // // // //         blending: AdditiveBlending,
// // // // // // // // // // // // // // // // // // // //         transparent: true,
// // // // // // // // // // // // // // // // // // // //       }),
// // // // // // // // // // // // // // // // // // // //     []
// // // // // // // // // // // // // // // // // // // //   );

// // // // // // // // // // // // // // // // // // // //   useFrame(() => {
// // // // // // // // // // // // // // // // // // // //     const posArray = particleGeometry.attributes.position.array as Float32Array;

// // // // // // // // // // // // // // // // // // // //     for (let i = 0; i < particleCount; i += 1) {
// // // // // // // // // // // // // // // // // // // //       // Update positions based on velocities
// // // // // // // // // // // // // // // // // // // //       posArray[i * 3] += velocities.current[i * 3];
// // // // // // // // // // // // // // // // // // // //       posArray[i * 3 + 1] += velocities.current[i * 3 + 1];
// // // // // // // // // // // // // // // // // // // //       posArray[i * 3 + 2] += velocities.current[i * 3 + 2];

// // // // // // // // // // // // // // // // // // // //       // Simple gravity towards the black hole
// // // // // // // // // // // // // // // // // // // //       const dx = posArray[i * 3];
// // // // // // // // // // // // // // // // // // // //       const dy = posArray[i * 3 + 1];
// // // // // // // // // // // // // // // // // // // //       const dz = posArray[i * 3 + 2];
// // // // // // // // // // // // // // // // // // // //       const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
// // // // // // // // // // // // // // // // // // // //       const force = (0.02 / dist) * 0.1;

// // // // // // // // // // // // // // // // // // // //       velocities.current[i * 3] += (-dx / dist) * force;
// // // // // // // // // // // // // // // // // // // //       velocities.current[i * 3 + 1] += (-dy / dist) * force;
// // // // // // // // // // // // // // // // // // // //       velocities.current[i * 3 + 2] += (-dz / dist) * force;

// // // // // // // // // // // // // // // // // // // //       // Reset particle if it's too close to the black hole
// // // // // // // // // // // // // // // // // // // //       if (dist < 2) {
// // // // // // // // // // // // // // // // // // // //         posArray[i * 3] = starPositionRef.current.x;
// // // // // // // // // // // // // // // // // // // //         posArray[i * 3 + 1] = starPositionRef.current.y;
// // // // // // // // // // // // // // // // // // // //         posArray[i * 3 + 2] = starPositionRef.current.z;

// // // // // // // // // // // // // // // // // // // //         velocities.current[i * 3] = -(Math.random() * 0.02 + 0.01);
// // // // // // // // // // // // // // // // // // // //         velocities.current[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
// // // // // // // // // // // // // // // // // // // //         velocities.current[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
// // // // // // // // // // // // // // // // // // // //       }
// // // // // // // // // // // // // // // // // // // //     }

// // // // // // // // // // // // // // // // // // // //     particleGeometry.attributes.position.needsUpdate = true;
// // // // // // // // // // // // // // // // // // // //   });

// // // // // // // // // // // // // // // // // // // //   return (
// // // // // // // // // // // // // // // // // // // //     <points ref={particlesRef} geometry={particleGeometry} material={particleMaterial} />
// // // // // // // // // // // // // // // // // // // //   );
// // // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // // const BlackHoleScene: React.FC = () => {
// // // // // // // // // // // // // // // // // // // //   const starPositionRef = useRef<Vector3>(new Vector3(10, 0, 0));
// // // // // // // // // // // // // // // // // // // //   const blackHoleRadius = 2;

// // // // // // // // // // // // // // // // // // // //   return (
// // // // // // // // // // // // // // // // // // // //     <Canvas
// // // // // // // // // // // // // // // // // // // //       style={{ width: '100vw', height: '100vh', background: '#000000' }}
// // // // // // // // // // // // // // // // // // // //       camera={{ position: [0, 5, 25], fov: 60 }}
// // // // // // // // // // // // // // // // // // // //     >
// // // // // // // // // // // // // // // // // // // //       <ambientLight intensity={0.2} />
// // // // // // // // // // // // // // // // // // // //       <pointLight position={[0, 0, 0]} intensity={1} color="#ffffff" />
// // // // // // // // // // // // // // // // // // // //       <ErrorBoundary>
// // // // // // // // // // // // // // // // // // // //         <BlackHole />
// // // // // // // // // // // // // // // // // // // //         <AccretionDisk blackHoleRadius={blackHoleRadius} />
// // // // // // // // // // // // // // // // // // // //         <Star positionRef={starPositionRef} />
// // // // // // // // // // // // // // // // // // // //         <ParticleSystem starPositionRef={starPositionRef} />
// // // // // // // // // // // // // // // // // // // //       </ErrorBoundary>
// // // // // // // // // // // // // // // // // // // //       <EffectComposer>
// // // // // // // // // // // // // // // // // // // //         <Bloom
// // // // // // // // // // // // // // // // // // // //           luminanceThreshold={0.5}
// // // // // // // // // // // // // // // // // // // //           luminanceSmoothing={0.1}
// // // // // // // // // // // // // // // // // // // //           intensity={1.5}
// // // // // // // // // // // // // // // // // // // //           height={300}
// // // // // // // // // // // // // // // // // // // //         />
// // // // // // // // // // // // // // // // // // // //       </EffectComposer>
// // // // // // // // // // // // // // // // // // // //       <Controls />
// // // // // // // // // // // // // // // // // // // //     </Canvas>
// // // // // // // // // // // // // // // // // // // //   );
// // // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // // export default BlackHoleScene;


// // // // // // // // // // // // // // // // // // // const SolarView: React.FC = () => {
// // // // // // // // // // // // // // // // // // //   const [timeSpeed, setTimeSpeed] = useState<number>(1);

// // // // // // // // // // // // // // // // // // //   return (
// // // // // // // // // // // // // // // // // // //     <>
// // // // // // // // // // // // // // // // // // //       <Canvas
// // // // // // // // // // // // // // // // // // //         shadows
// // // // // // // // // // // // // // // // // // //         style={{ width: '100vw', height: '100vh', background: '#21272f' }}
// // // // // // // // // // // // // // // // // // //         camera={{ position: [0, 20, 40], fov: 60 }}
// // // // // // // // // // // // // // // // // // //       >
// // // // // // // // // // // // // // // // // // //         <ambientLight intensity={0.4} />

// // // // // // // // // // // // // // // // // // //         <pointLight
// // // // // // // // // // // // // // // // // // //           position={[0, 0, 0]}
// // // // // // // // // // // // // // // // // // //           intensity={2}
// // // // // // // // // // // // // // // // // // //           color="white"
// // // // // // // // // // // // // // // // // // //           castShadow
// // // // // // // // // // // // // // // // // // //           shadow-mapSize-width={2048}
// // // // // // // // // // // // // // // // // // //           shadow-mapSize-height={2048}
// // // // // // // // // // // // // // // // // // //           shadow-camera-near={0.1}
// // // // // // // // // // // // // // // // // // //           shadow-camera-far={500}
// // // // // // // // // // // // // // // // // // //         />

// // // // // // // // // // // // // // // // // // //         <ErrorBoundary>
// // // // // // // // // // // // // // // // // // //           {/* <SolarSystem timeSpeed={timeSpeed} /> */}
// // // // // // // // // // // // // // // // // // //         </ErrorBoundary>

// // // // // // // // // // // // // // // // // // //         <Controls />
// // // // // // // // // // // // // // // // // // //       </Canvas>
// // // // // // // // // // // // // // // // // // //       {/* <Slider
// // // // // // // // // // // // // // // // // // //         value={timeSpeed}
// // // // // // // // // // // // // // // // // // //         onChange={(e, newValue) => setTimeSpeed(newValue as number)}
// // // // // // // // // // // // // // // // // // //         min={0.1}
// // // // // // // // // // // // // // // // // // //         max={10}
// // // // // // // // // // // // // // // // // // //         step={0.1}
// // // // // // // // // // // // // // // // // // //         aria-labelledby="time-speed-slider"
// // // // // // // // // // // // // // // // // // //       /> */}
// // // // // // // // // // // // // // // // // // //     </>
// // // // // // // // // // // // // // // // // // //   );
// // // // // // // // // // // // // // // // // // // };

// // // // // // // // // // // // // // // // // // // // export default SolarView;


// // // // // // // // // // // // // // // // // // // // const Controls = () => {
// // // // // // // // // // // // // // // // // // // //   const { camera, gl } = useThree();
// // // // // // // // // // // // // // // // // // // //   const controlsRef = useRef<OrbitControls | null>(null);

// // // // // // // // // // // // // // // // // // // //   useEffect(() => {
// // // // // // // // // // // // // // // // // // // //     controlsRef.current = new OrbitControls(camera, gl.domElement);

// // // // // // // // // // // // // // // // // // // //     return () => {
// // // // // // // // // // // // // // // // // // // //       controlsRef.current?.dispose();
// // // // // // // // // // // // // // // // // // // //     };
// // // // // // // // // // // // // // // // // // // //   }, [camera, gl]);

// // // // // // // // // // // // // // // // // // // //   return null;
// // // // // // // // // // // // // // // // // // // // };