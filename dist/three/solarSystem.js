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
var SolarSystem = function (_a) {
    var timeSpeed = _a.timeSpeed;
    var earthRef = (0, react_1.useRef)(null);
    var earthOrbitRef = (0, react_1.useRef)(null);
    var marsRef = (0, react_1.useRef)(null);
    var marsOrbitRef = (0, react_1.useRef)(null);
    var starTexture = (0, fiber_1.useLoader)(three_1.TextureLoader, "/assets/textures/planets/wil-stewart-RpDA3uYkJWM-unsplash.jpg");
    (0, react_1.useEffect)(function () {
        console.log('SolarSystem component mounted');
    }, []);
    (0, fiber_1.useFrame)(function (_a) {
        var clock = _a.clock;
        var elapsedTime = clock.getElapsedTime() * timeSpeed;
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
    return (react_1.default.createElement(react_1.default.Fragment, null,
        react_1.default.createElement(customSphere_1.default, { radius: 2, widthSegments: 32, heightSegments: 32, color: "yellow", position: [0, 0, 0], material: "standard", materialProps: {
                emissive: 'yellow',
                emissiveIntensity: 2,
            } }),
        react_1.default.createElement("pointLight", { position: [0, 0, 0], intensity: 200, color: "white", castShadow: true, "shadow-mapSize-width": 2048, "shadow-mapSize-height": 2048, "shadow-camera-near": 0.1, "shadow-camera-far": 500 }),
        react_1.default.createElement("group", { ref: earthOrbitRef },
            react_1.default.createElement(customSphere_1.default, { radius: 1, widthSegments: 32, heightSegments: 32, position: [10, 0, 0], ref: earthRef, color: "blue", castShadow: true, receiveShadow: true, materialType: "standard" })),
        react_1.default.createElement("group", { ref: marsOrbitRef },
            react_1.default.createElement(customSphere_1.default, { radius: 0.8, widthSegments: 32, heightSegments: 32, position: [15, 0, 0], color: "red", ref: marsRef, castShadow: true, receiveShadow: true, materialType: "standard" }))));
};
exports.default = SolarSystem;
