import { GameMapView } from '@gamemap/map-engine-gl'
import '@gamemap/map-engine-gl/engine-gl.css'

// The CSS import lives here rather than in MapPage so Vite emits it into this
// lazy chunk alongside three.js, instead of the calculator's entry bundle.
export default GameMapView
