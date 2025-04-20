import React from 'react';
import { Mesh, Texture } from 'three';
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
declare const CustomSphere: React.ForwardRefExoticComponent<CustomSphereProps & React.RefAttributes<Mesh<import("three").BufferGeometry<import("three").NormalBufferAttributes>, import("three").Material | import("three").Material[], import("three").Object3DEventMap>>>;
export default CustomSphere;
