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
// BlackHoleScene.tsx
var react_1 = __importStar(require("react"));
var fiber_1 = require("@react-three/fiber");
var three_1 = require("three");
var OrbitControls_1 = require("three/examples/jsm/controls/OrbitControls");
var THREE = __importStar(require("three"));
var errorBoundary_1 = __importDefault(require("./errorBoundary"));
(0, fiber_1.extend)({ OrbitControls: OrbitControls_1.OrbitControls });
var Controls = function () {
    var _a = (0, fiber_1.useThree)(), camera = _a.camera, gl = _a.gl;
    var controlsRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(function () {
        controlsRef.current = new OrbitControls_1.OrbitControls(camera, gl.domElement);
        controlsRef.current.enableDamping = true;
        return function () {
            controlsRef.current.dispose();
        };
    }, [camera, gl]);
    (0, fiber_1.useFrame)(function () {
        controlsRef.current.update();
    });
    return null;
};
var BlackHole = function () {
    var meshRef = (0, react_1.useRef)(null);
    // Custom shader material for the black hole
    var blackHoleMaterial = new three_1.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            resolution: { value: new three_1.Vector2(window.innerWidth, window.innerHeight) },
        },
        vertexShader: "\n      varying vec2 vUv;\n      void main() {\n        vUv = uv;\n        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n      }\n    ",
        fragmentShader: "\n      uniform float time;\n      varying vec2 vUv;\n      void main() {\n        float dist = distance(vUv, vec2(0.5));\n        float strength = smoothstep(0.4, 0.5, dist);\n        gl_FragColor = vec4(0.0, 0.0, 0.0, strength);\n      }\n    ",
    });
    (0, fiber_1.useFrame)(function (_a) {
        var clock = _a.clock;
        blackHoleMaterial.uniforms.time.value = clock.getElapsedTime();
    });
    return (react_1.default.createElement("mesh", { ref: meshRef, position: [0, 0, 0], material: blackHoleMaterial },
        react_1.default.createElement("sphereGeometry", { args: [2, 64, 64] })));
};
var AccretionDisk = function () {
    var diskRef = (0, react_1.useRef)(null);
    (0, fiber_1.useFrame)(function () {
        if (diskRef.current) {
            diskRef.current.rotation.y += 0.01;
        }
    });
    return (react_1.default.createElement("mesh", { ref: diskRef, rotation: [Math.PI / 2, 0, 0] },
        react_1.default.createElement("torusGeometry", { args: [3, 1, 64, 100] }),
        react_1.default.createElement("meshStandardMaterial", { color: "#ff4500", emissive: "#ff4500", emissiveIntensity: 1 })));
};
var Star = function () {
    var starRef = (0, react_1.useRef)(null);
    (0, fiber_1.useFrame)(function (_a) {
        var clock = _a.clock;
        if (starRef.current) {
            var t = clock.getElapsedTime();
            // Move the star towards the black hole
            starRef.current.position.x = 10 - t * 0.5;
            // Simple pulsating effect
            var scale = 1 + Math.sin(t * 5) * 0.1;
            starRef.current.scale.set(scale, scale, scale);
        }
    });
    return (react_1.default.createElement("mesh", { ref: starRef, position: [10, 0, 0] },
        react_1.default.createElement("sphereGeometry", { args: [1.5, 32, 32] }),
        react_1.default.createElement("meshStandardMaterial", { color: "#ffff00", emissive: "#ffff00", emissiveIntensity: 1 })));
};
var ParticleSystem = function () {
    var particlesRef = (0, react_1.useRef)(null);
    var particleCount = 5000;
    var positions = new Float32Array(particleCount * 3);
    var velocities = new Float32Array(particleCount * 3);
    for (var i = 0; i < particleCount; i += 1) {
        positions[i * 3] = 10; // Start at the star's position
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
        velocities[i * 3] = -(Math.random() * 0.02 + 0.01);
        velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
    }
    var particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var particleMaterial = new THREE.PointsMaterial({
        color: '#ffa500',
        size: 0.1,
        blending: three_1.AdditiveBlending,
        transparent: true,
    });
    (0, fiber_1.useFrame)(function () {
        var posArray = particleGeometry.attributes.position.array;
        for (var i = 0; i < particleCount; i += 1) {
            // Update positions based on velocities
            posArray[i * 3] += velocities[i * 3];
            posArray[i * 3 + 1] += velocities[i * 3 + 1];
            posArray[i * 3 + 2] += velocities[i * 3 + 2];
            // Simple gravity towards the black hole
            var dx = posArray[i * 3];
            var dy = posArray[i * 3 + 1];
            var dz = posArray[i * 3 + 2];
            var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            var force = (0.02 / dist) * 0.1;
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
    return (react_1.default.createElement("points", { ref: particlesRef, geometry: particleGeometry, material: particleMaterial }));
};
var BlackHoleScene = function () { return (react_1.default.createElement(fiber_1.Canvas, { style: { width: '100vw', height: '100vh', background: '#000000' }, camera: { position: [0, 5, 20], fov: 60 } },
    react_1.default.createElement("ambientLight", { intensity: 0.2 }),
    react_1.default.createElement("pointLight", { position: [0, 0, 0], intensity: 1, color: "#ffffff" }),
    react_1.default.createElement(errorBoundary_1.default, null,
        react_1.default.createElement(BlackHole, null),
        react_1.default.createElement(AccretionDisk, null),
        react_1.default.createElement(Star, null),
        react_1.default.createElement(ParticleSystem, null)),
    react_1.default.createElement(Controls, null))); };
exports.default = BlackHoleScene;
