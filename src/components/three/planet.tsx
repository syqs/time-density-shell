import React, { useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { TextureLoader, Mesh, Group, Clock } from 'three';
import CustomSphere from './customSphere';

interface PlanetProps {
  position: [number, number, number];
  args: [number, number, number, number?, number?, number?, number?];
  textureUrl: string;
  normalMapUrl?: string;
  orbitSpeed: number;
  rotationSpeed: number;
  timeSpeed: number;
}

const Planet: React.FC<PlanetProps> = ({
  position,
  args,
  textureUrl,
  normalMapUrl,
  orbitSpeed,
  rotationSpeed,
  timeSpeed,
}) => {
  const planetRef = useRef<Mesh>(null!);
  const orbitRef = useRef<Group>(null!);

  // Load textures unconditionally
  const texture = useLoader(TextureLoader, textureUrl);
  const normalMap = useLoader(TextureLoader, normalMapUrl || '');

  useFrame(({ clock }: { clock: Clock }) => {
    const elapsedTime = clock.getElapsedTime() * timeSpeed;
    if (planetRef.current) {
      planetRef.current.rotation.y += rotationSpeed * timeSpeed;
    }
    if (orbitRef.current) {
      orbitRef.current.rotation.y = elapsedTime * orbitSpeed;
    }
  });

  return (
    <group ref={orbitRef}>
      <CustomSphere
        position={position}
        ref={planetRef}
        castShadow
        args={args}
        texture={texture}
        normalMap={normalMap || undefined}
        radius={args[0]} // Assuming the first element in args is the radius
        widthSegments={args[1]} // Assuming the second element in args is the widthSegments
        heightSegments={args[2]} // Assuming the third element in args is the heightSegments
      />
    </group>
  );
};

export default Planet;



// import React, { useRef } from 'react';
// import { useFrame, useLoader } from '@react-three/fiber';
// import { TextureLoader, Mesh, Group, Clock } from 'three';
// import CustomSphere from './customSphere';

// interface PlanetProps {
//   position: [number, number, number];
//   args?: [number, number, number, number?, number?, number?, number?];
//   textureUrl: string;
//   normalMapUrl?: string;
//   orbitSpeed: number;
//   rotationSpeed: number;
//   timeSpeed: number;
// }

// const Planet: React.FC<PlanetProps> = ({
//   position,
//   args,
//   textureUrl,
//   normalMapUrl,
//   orbitSpeed,
//   rotationSpeed,
//   timeSpeed,
// }) => {
//   const planetRef = useRef<Mesh>(null!);
//   const orbitRef = useRef<Group>(null!);

//   // Load textures unconditionally
//   const texture = useLoader(TextureLoader, textureUrl);
//   const normalMap = useLoader(TextureLoader, normalMapUrl || '');

//   useFrame(({ clock }: { clock: Clock }) => {
//     const elapsedTime = clock.getElapsedTime() * timeSpeed;
//     if (planetRef.current) {
//       planetRef.current.rotation.y += rotationSpeed * timeSpeed;
//     }
//     if (orbitRef.current) {
//       orbitRef.current.rotation.y = elapsedTime * orbitSpeed;
//     }
//   });

//   return (
//     <group ref={orbitRef}>
//       <CustomSphere
//         position={position}
//         ref={planetRef}
//         castShadow
//         args={args}
//         texture={texture}
//         normalMap={normalMap || undefined}
//       />
//     </group>
//   );
// };

// export default Planet;


// // @ts-ignore
// import React, { useRef } from 'react';
// import { useFrame, useLoader } from '@react-three/fiber';
// import { TextureLoader, Mesh, Group, Clock } from 'three';
// import CustomSphere from './customSphere';

// interface PlanetProps {
//   position: [number, number, number];
//   args: [number, number, number, number?, number?, number?, number?];
//   textureUrl: string;
//   normalMapUrl?: string;
//   orbitSpeed: number;
//   rotationSpeed: number;
//   timeSpeed: number;
// }

// const Planet: React.FC<PlanetProps> = ({
//   position,
//   args,
//   textureUrl,
//   normalMapUrl,
//   orbitSpeed,
//   rotationSpeed,
//   timeSpeed,
// }) => {
//   const planetRef = useRef<Mesh>(null!);
//   const orbitRef = useRef<Group>(null!);

//   const texture = useLoader(TextureLoader, textureUrl);
//   const normalMap = normalMapUrl ? useLoader(TextureLoader, normalMapUrl) : null;

//   useFrame(({ clock }:{ clock: Clock}) => {
//     const elapsedTime = clock.getElapsedTime() * timeSpeed;
//     if (planetRef.current) {
//       planetRef.current.rotation.y += rotationSpeed * timeSpeed;
//     }
//     if (orbitRef.current) {
//       orbitRef.current.rotation.y = elapsedTime * orbitSpeed;
//     }
//   });

//   return (
//     <group ref={orbitRef}>
//       <CustomSphere
//         position={position}
//         ref={planetRef}
//         castShadow
//         receiveShadow
//         radius={args[0]}
//         widthSegments={args[1]}
//         heightSegments={args[2]}
//         material={
//           <meshStandardMaterial
//             map={texture}
//             normalMap={normalMap}
//             roughness={0.8}
//             metalness={0}
//           />
//         }
//       />
//     </group>
//   );
// };

// export default Planet;


// // @ts-nocheck
// /* eslint-disable no-alert */
// import React, { useRef, useEffect, useState } from 'react';
// import { Mesh, Group, Clock } from 'three';

// const Planet: React.FC<any> = ({
//   position,
//   args,
//   textureUrl,
//   normalMapUrl,
//   orbitSpeed,
//   rotationSpeed,
//   timeSpeed,
// }) => {
//   const [THREE, setTHREE] = useState<any>(null!);
//   const [useFrame, setUseFrame] = useState<any>(null!);
//   const [useLoader, setUseLoader] = useState<any>(null!);
//   const [Sphere, setSphere] = useState<any>(null!);

//   useEffect(() => {
//     (async () => {
//       const { useFrame, useLoader } = await import('@react-three/fiber');
//       const THREE = await import('three');
//       setUseFrame(() => useFrame);
//       setUseLoader(() => useLoader);
//       setSphere(() => Sphere);
//       setTHREE(() => THREE);
//     })();
//   }, []);

//   const planetRef = useRef<Mesh>(null!);
//   const orbitRef = useRef<Group>(null!);

//   if (!THREE || !useFrame || !useLoader || !Sphere) {
//     return null; // or a loading spinner
//   }

//   const texture = useLoader(THREE.TextureLoader, textureUrl);
//   const normalMap = normalMapUrl ? useLoader(THREE.TextureLoader, normalMapUrl) : null;

//   useFrame(({ clock }: { clock: Clock }) => {
//     const elapsedTime = clock.getElapsedTime() * timeSpeed;
//     if (planetRef.current) {
//       planetRef.current.rotation.y += rotationSpeed * timeSpeed;
//     }
//     if (orbitRef.current) {
//       orbitRef.current.rotation.y = elapsedTime * orbitSpeed;
//     }
//   });

//   return (
//     <group ref={orbitRef}>
//       <Sphere
//         args={args}
//         position={position}
//         ref={planetRef}
//       >
//         <meshStandardMaterial
//           map={texture}
//           normalMap={normalMap || undefined}
//         />
//       </Sphere>
//     </group>
//   );
// };

// export default Planet;