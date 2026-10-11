import { getPreferences, setPreferences } from './player-preferences.js';
import { getLoginScreen } from './login-screen.js';

// Select quality before importing Three.js or allocating the world.
const quality = document.getElementById('login-graphics');
quality.value = getPreferences().graphicsQuality;
function updateQuality() {
  setPreferences({ graphicsQuality: quality.value });
  document.getElementById('graphics-current').textContent = quality.options[quality.selectedIndex].text.split(' ·')[0];
}
updateQuality();
quality.addEventListener('change', updateQuality);
let loaded = false;
getLoginScreen({ loadGame: async () => {
  if (!loaded) {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) throw new Error('This browser cannot start 3D graphics. Try updating your browser or enabling hardware acceleration.');
    if (!(typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) && !gl.getExtension('ANGLE_instanced_arrays')) {
      throw new Error('This device does not support the instanced graphics needed by the game.');
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    await import('./main.js');
    loaded = true;
  }
} });
