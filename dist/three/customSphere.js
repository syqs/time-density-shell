"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = __importStar(require("react"));
var three_1 = require("three");
var CustomSphere = (0, react_1.forwardRef)(function (_a, ref) {
    var radius = _a.radius, widthSegments = _a.widthSegments, heightSegments = _a.heightSegments, position = _a.position, color = _a.color, args = _a.args, texture = _a.texture, _b = _a.materialType, materialType = _b === void 0 ? 'standard' : _b, _c = _a.materialProps, materialProps = _c === void 0 ? {} : _c;
    return (react_1.default.createElement("mesh", { ref: ref, position: position },
        react_1.default.createElement("sphereGeometry", { args: [radius, widthSegments, heightSegments] }),
        materialType === 'basic' ? (react_1.default.createElement("meshBasicMaterial", __assign({ attach: "material", side: three_1.BackSide, map: texture, color: color }, materialProps))) : (react_1.default.createElement("meshStandardMaterial", __assign({ map: texture, color: color }, materialProps)))));
});
CustomSphere.displayName = 'CustomSphere';
exports.default = CustomSphere;
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
