"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = __importStar(require("react"));
var fiber_1 = require("@react-three/fiber");
var three_1 = require("three");
var customSphere_1 = __importDefault(require("./customSphere"));
var Planet = function (_a) {
    var position = _a.position, args = _a.args, textureUrl = _a.textureUrl, normalMapUrl = _a.normalMapUrl, orbitSpeed = _a.orbitSpeed, rotationSpeed = _a.rotationSpeed, timeSpeed = _a.timeSpeed;
    var planetRef = (0, react_1.useRef)(null);
    var orbitRef = (0, react_1.useRef)(null);
    // Load textures unconditionally
    var texture = (0, fiber_1.useLoader)(three_1.TextureLoader, textureUrl);
    var normalMap = (0, fiber_1.useLoader)(three_1.TextureLoader, normalMapUrl || '');
    (0, fiber_1.useFrame)(function (_a) {
        var clock = _a.clock;
        var elapsedTime = clock.getElapsedTime() * timeSpeed;
        if (planetRef.current) {
            planetRef.current.rotation.y += rotationSpeed * timeSpeed;
        }
        if (orbitRef.current) {
            orbitRef.current.rotation.y = elapsedTime * orbitSpeed;
        }
    });
    return (react_1.default.createElement("group", { ref: orbitRef },
        react_1.default.createElement(customSphere_1.default, { position: position, ref: planetRef, castShadow: true, args: args, texture: texture, normalMap: normalMap || undefined, radius: args[0], widthSegments: args[1], heightSegments: args[2] })));
};
exports.default = Planet;
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
