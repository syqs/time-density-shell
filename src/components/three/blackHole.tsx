// BlackHoleScene.tsx
import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { ShaderMaterial, Vector2, AdditiveBlending } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import * as THREE from 'three';
import ErrorBoundary from './errorBoundary';

extend({ OrbitControls });

const Controls = () => {
  const { camera, gl } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    controlsRef.current = new OrbitControls(camera, gl.domElement);
    controlsRef.current.enableDamping = true;
    return () => {
      controlsRef.current.dispose();
    };
  }, [camera, gl]);

  useFrame(() => {
    controlsRef.current.update();
  });

  return null;
};

const BlackHole = () => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Custom shader material for the black hole
  const blackHoleMaterial = new ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      resolution: { value: new Vector2(window.innerWidth, window.innerHeight) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      void main() {
        float dist = distance(vUv, vec2(0.5));
        float strength = smoothstep(0.4, 0.5, dist);
        gl_FragColor = vec4(0.0, 0.0, 0.0, strength);
      }
    `,
  });

  useFrame(({ clock }) => {
    blackHoleMaterial.uniforms.time.value = clock.getElapsedTime();
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]} material={blackHoleMaterial}>
      <sphereGeometry args={[2, 64, 64]} />
    </mesh>
  );
};

const AccretionDisk = () => {
  const diskRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (diskRef.current) {
      diskRef.current.rotation.y += 0.01;
    }
  });

  return (
    <mesh ref={diskRef} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[3, 1, 64, 100]} />
      <meshStandardMaterial color="#ff4500" emissive="#ff4500" emissiveIntensity={1} />
    </mesh>
  );
};

const Star = () => {
  const starRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (starRef.current) {
      const t = clock.getElapsedTime();
      // Move the star towards the black hole
      starRef.current.position.x = 10 - t * 0.5;
      // Simple pulsating effect
      const scale = 1 + Math.sin(t * 5) * 0.1;
      starRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <mesh ref={starRef} position={[10, 0, 0]}>
      <sphereGeometry args={[1.5, 32, 32]} />
      <meshStandardMaterial color="#ffff00" emissive="#ffff00" emissiveIntensity={1} />
    </mesh>
  );
};

const ParticleSystem = () => {
  const particlesRef = useRef<THREE.Points>(null);

  const particleCount = 5000;
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i += 1) {
    positions[i * 3] = 10; // Start at the star's position
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;

    velocities[i * 3] = -(Math.random() * 0.02 + 0.01);
    velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
  }

  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const particleMaterial = new THREE.PointsMaterial({
    color: '#ffa500',
    size: 0.1,
    blending: AdditiveBlending,
    transparent: true,
  });

  useFrame(() => {
    const posArray = particleGeometry.attributes.position.array as Float32Array;

    for (let i = 0; i < particleCount; i += 1) {
      // Update positions based on velocities
      posArray[i * 3] += velocities[i * 3];
      posArray[i * 3 + 1] += velocities[i * 3 + 1];
      posArray[i * 3 + 2] += velocities[i * 3 + 2];

      // Simple gravity towards the black hole
      const dx = posArray[i * 3];
      const dy = posArray[i * 3 + 1];
      const dz = posArray[i * 3 + 2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const force = (0.02 / dist) * 0.1;

      velocities[i * 3] += (-dx / dist) * force;
      velocities[i * 3 + 1] += (-dy / dist) * force;
      velocities[i * 3 + 2] += (-dz / dist) * force;

      // Reset particle if it's too close to the black hole
      if (dist < 2) {
        posArray[i * 3] = 10;
        posArray[i * 3 + 1] = 0;
        posArray[i * 3 + 2] = 0;

        velocities[i * 3] = -(Math.random() * 0.02 + 0.01);
        velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
      }
    }

    particleGeometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={particlesRef} geometry={particleGeometry} material={particleMaterial} />
  );
};

const BlackHoleScene: React.FC = () => (
  <Canvas
    style={{ width: '100vw', height: '100vh', background: '#000000' }}
    camera={{ position: [0, 5, 20], fov: 60 }}
  >
    <ambientLight intensity={0.2} />
    <pointLight position={[0, 0, 0]} intensity={1} color="#ffffff" />
    <ErrorBoundary>
      <BlackHole />
      <AccretionDisk />
      <Star />
      <ParticleSystem />
    </ErrorBoundary>
    <Controls />
  </Canvas>
);

export default BlackHoleScene;
