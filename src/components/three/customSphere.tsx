import React, { forwardRef } from 'react';
import { Mesh, Texture, BackSide } from 'three';
import { MeshStandardMaterialProps, MeshBasicMaterialProps } from '@react-three/fiber';


// interface CustomSphereProps {
//   radius: number;
//   widthSegments: number;
//   heightSegments: number;
//   position?: [number, number, number];
//   color?: string;
//   texture?: Texture;
//   materialType?: 'basic' | 'standard';
//   materialProps?: JSX.IntrinsicElements['meshBasicMaterial'] | JSX.IntrinsicElements['meshStandardMaterial'];
// }


interface CustomSphereProps {

    position: [number, number, number];
  
    radius: number;
  
    widthSegments: number;
  
    heightSegments: number;
  
    material?: any;
  
    castShadow?: boolean;
  
    receiveShadow?: boolean;
    args?: any;
    normalMap?: Texture;
    
      color?: string;
  texture?: Texture;
  materialType?: 'basic' | 'standard';
  materialProps?: JSX.IntrinsicElements['meshBasicMaterial'] | JSX.IntrinsicElements['meshStandardMaterial'];
  
  }

const CustomSphere = forwardRef<Mesh, CustomSphereProps>(
  (
    {
      radius,
      widthSegments,
      heightSegments,
      position,
      color,
      args,
      texture,
      materialType = 'standard',
      materialProps = {},
    },
    ref
  ) => (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[radius, widthSegments, heightSegments]} />
      {materialType === 'basic' ? (
        <meshBasicMaterial attach="material" side={BackSide} map={texture} color={color} {...materialProps as MeshBasicMaterialProps} />
      ) : (
        <meshStandardMaterial map={texture} color={color} {...materialProps as MeshStandardMaterialProps} />
      )}
    </mesh>
  )
);

CustomSphere.displayName = 'CustomSphere';
export default CustomSphere;

// import React from 'react';
// import { MeshProps, useLoader } from '@react-three/fiber';
// import { TextureLoader, Mesh } from 'three';

// interface CustomSphereProps extends MeshProps {
//   radius: number;
//   widthSegments: number;
//   heightSegments: number;
//   textureUrl?: string;
//   color?: string;
//   materialType?: 'basic' | 'standard';
//   materialProps?: JSX.IntrinsicElements['meshBasicMaterial'] | JSX.IntrinsicElements['meshStandardMaterial'];
// }

// const CustomSphere = React.forwardRef<Mesh, CustomSphereProps>(
//   (
//     {
//       radius,
//       widthSegments,
//       heightSegments,
//       textureUrl,
//       color,
//       materialType = 'standard',
//       materialProps = {}, 
//       ...props
//     },
//     ref
//   ) => {
//     const texture = useLoader(TextureLoader, textureUrl || '');
//     // const texture = textureUrl ? useLoader(TextureLoader, textureUrl) : undefined;

//     return (
//       <mesh {...props} ref={ref}>
//         <sphereGeometry attach="geometry" args={[radius, widthSegments, heightSegments]} />
//         {materialType === 'basic' ? (
//           <meshBasicMaterial
//             attach="material"
//             map={texture}
//             color={color}
//             {...(materialProps as JSX.IntrinsicElements['meshBasicMaterial'])}
//           />
//         ) : (
//           <meshStandardMaterial
//             map={texture}
//             color={color}
//             {...(materialProps as JSX.IntrinsicElements['meshStandardMaterial'])}
//           />
//         )}
//       </mesh>
//     );
//   }
// );
  
// CustomSphere.displayName = 'CustomSphere';
// export default CustomSphere;