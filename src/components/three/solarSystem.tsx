import React, { useRef, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Mesh, Group, BackSide, TextureLoader } from 'three';
import CustomSphere from './customSphere';

interface SolarSystemProps {
  timeSpeed: number;
}

const SolarSystem: React.FC<SolarSystemProps> = ({ timeSpeed }) => {
  const earthRef = useRef<Mesh>(null!);
  const earthOrbitRef = useRef<Group>(null!);
  const marsRef = useRef<Mesh>(null!);
  const marsOrbitRef = useRef<Group>(null!);
  const starTexture = useLoader(
    TextureLoader,
    `/assets/textures/planets/wil-stewart-RpDA3uYkJWM-unsplash.jpg`
  );

  useEffect(() => {
    console.log('SolarSystem component mounted');
  }, []);

  useFrame(({ clock }) => {
    const elapsedTime = clock.getElapsedTime() * timeSpeed;

    if (earthRef.current) {
      earthRef.current.rotation.y += 0.01 * timeSpeed;
    }
    if (earthOrbitRef.current) {
      earthOrbitRef.current.rotation.y = elapsedTime * 0.1;
    }

    if (marsRef.current) {
      marsRef.current.rotation.y += 0.008 * timeSpeed;
    }
    if (marsOrbitRef.current) {
      marsOrbitRef.current.rotation.y = elapsedTime * 0.08;
    }
  });

  return (
    <>
      {/* <CustomSphere
        radius={500}
        widthSegments={64}
        heightSegments={64}
        
        materialType="basic"
        materialProps={{ side: BackSide }}
        position={[0, 0, 0]}
        material="standard"
        texture={starTexture}
      /> */}

      <CustomSphere
        radius={2}
        widthSegments={32}
        heightSegments={32}
        color="yellow"
        position={[0, 0, 0]}
        material="standard"
        materialProps={{
          emissive: 'yellow',
          emissiveIntensity: 2,
        }}
        
      />
        {/* PointLight at the Sun's Position */}
        <pointLight
        position={[0, 0, 0]}
        intensity={200}
        color="white"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={500}
      />

      <group ref={earthOrbitRef}>
        <CustomSphere
          radius={1}
          widthSegments={32}
          heightSegments={32}
          position={[10, 0, 0]}
          ref={earthRef}
          color="blue"
          castShadow
          receiveShadow
          materialType="standard"
        />
      </group>

      <group ref={marsOrbitRef}>
        <CustomSphere
          radius={0.8}
          widthSegments={32}
          heightSegments={32}
          position={[15, 0, 0]}
          color="red"
          ref={marsRef}
          castShadow
          receiveShadow
          materialType="standard"
        />
      </group>
    </>
  );
};

export default SolarSystem;
