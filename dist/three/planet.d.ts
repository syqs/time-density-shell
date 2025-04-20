import React from 'react';
interface PlanetProps {
    position: [number, number, number];
    args: [number, number, number, number?, number?, number?, number?];
    textureUrl: string;
    normalMapUrl?: string;
    orbitSpeed: number;
    rotationSpeed: number;
    timeSpeed: number;
}
declare const Planet: React.FC<PlanetProps>;
export default Planet;
