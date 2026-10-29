import type { PetStyle } from './types.js';

export const petStyles: Record<PetStyle, { name: string; description: string }> = {
  crystal: { name: 'Cristal', description: 'Vidrio azul y aletas de luz.' },
  cloud: { name: 'Nube', description: 'Suave, redonda y de tonos perlados.' },
  orbit: { name: 'Órbita', description: 'Caparazón lunar y antenas luminosas.' },
  sprite: { name: 'Lucero', description: 'Pequeña exploradora con manos y botitas de luz.' },
  bloom: { name: 'Flor', description: 'Pétalos suaves, brazos y pasos juguetones.' },
};
