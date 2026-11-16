import {PLAYMAT_SIZE} from './poker-table-layout';

// Rectify the photograph's trapezoidal perspective in the rendering layer.
// The straight sides project from x=89/574 at the top to x=0/679 at the bottom.
// A homography (rather than an affine stretch) also corrects the longitudinal
// foreshortening. All original artwork pixels remain in the source asset.
const topLeft=89, topRight=574;
const topWidth=topRight-topLeft;
const scale=PLAYMAT_SIZE.width/topWidth;
export const PLAYMAT_PROJECTION = {
  scale,
  shear:scale*topLeft/PLAYMAT_SIZE.height,
  shift:-scale*topLeft,
  perspective:(PLAYMAT_SIZE.width-topWidth)/(PLAYMAT_SIZE.height*topWidth),
};
const {shear,shift,perspective}=PLAYMAT_PROJECTION;
export const PLAYMAT_MATRIX=`matrix3d(${scale},0,0,0,${shear},${scale},0,${perspective},0,0,1,0,${shift},0,0,1)`;
