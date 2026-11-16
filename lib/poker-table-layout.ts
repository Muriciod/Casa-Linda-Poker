export type TableRect = { x: number; y: number; width: number; height: number };
export const PLAYMAT_SIZE = { width: 679, height: 1055 };

type Rail = 'top' | 'right' | 'bottom' | 'left';
type Anchor = { rail: Rail; fraction: number };

// The physical table as seen in landscape, numbered clockwise from top center.
const anchors: readonly Anchor[] = [
  {rail:'top',fraction:1/2}, {rail:'top',fraction:5/6},
  {rail:'right',fraction:1/4}, {rail:'right',fraction:3/4},
  {rail:'bottom',fraction:5/6}, {rail:'bottom',fraction:1/2}, {rail:'bottom',fraction:1/6},
  {rail:'left',fraction:3/4}, {rail:'left',fraction:1/4}, {rail:'top',fraction:1/6},
];
const portraitRail: Record<Rail, Rail> = {top:'left',right:'top',bottom:'right',left:'bottom'};

/** The seats rotate with the artwork and remain outside it at any width. */
export function pokerTableLayout(containerWidth: number, playerCount: number) {
  const width = Math.max(240, containerWidth);
  const count = Math.min(10, Math.max(0, Math.floor(playerCount)));
  const portrait = width < 620;
  const padding = 10, gap = 10;
  const cardWidth = portrait ? Math.min(110, Math.max(72, width * .22)) : 116;
  const cardHeight = 78;
  const artWidth = portrait
    ? Math.min(260, width - 2 * (padding + cardWidth + gap))
    : width - 2 * (padding + cardWidth + gap);
  const artHeight = artWidth * (portrait ? PLAYMAT_SIZE.height / PLAYMAT_SIZE.width : PLAYMAT_SIZE.width / PLAYMAT_SIZE.height);
  // At narrow widths give the cards room without stretching the playmat.
  const horizontalSpan = Math.max(artWidth, (portrait ? 2 : 3) * (cardWidth + gap));
  const verticalSpan = Math.max(artHeight, (portrait ? 3 : 2) * (cardHeight + gap));
  const height = verticalSpan + 2 * (padding + cardHeight + gap);
  const mat = { x: (width - artWidth) / 2, y: (height - artHeight) / 2, width: artWidth, height: artHeight };
  const seats = Array.from({length:count}, (_,i) => {
    // For fewer players, leave evenly spaced gaps in the same numbered ring.
    const index = Math.round(i * anchors.length / count);
    const anchor = anchors[index];
    const rail = portrait ? portraitRail[anchor.rail] : anchor.rail;
    const fraction = portrait && (anchor.rail==='top' || anchor.rail==='bottom') ? 1-anchor.fraction : anchor.fraction;
    const x = rail==='left' ? padding : rail==='right' ? width-padding-cardWidth
      : (width-cardWidth)/2 + horizontalSpan*(fraction-.5);
    const y = rail==='top' ? padding : rail==='bottom' ? height-padding-cardHeight
      : (height-cardHeight)/2 + verticalSpan*(fraction-.5);
    return {number:index+1,x,y,width:cardWidth,height:cardHeight};
  });
  return { width, height, portrait, mat, seats };
}
