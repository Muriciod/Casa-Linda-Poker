export type TableRect = { x: number; y: number; width: number; height: number };
export const PLAYMAT_SIZE = { width: 679, height: 1055 };

/** Presentation only. Opposing rails have their own space outside the artwork.
 * Every rail distributes its seats evenly, including odd player counts.
 * Narrow containers use the original portrait orientation; wide ones rotate
 * the complete artwork by 90 degrees, never changing its aspect ratio.
 */
export function pokerTableLayout(containerWidth: number, playerCount: number) {
  const width = Math.max(240, containerWidth);
  const count = Math.min(10, Math.max(0, Math.floor(playerCount)));
  const portrait = width < 620;
  const padding = 10, gap = 10;
  const cardWidth = portrait ? Math.min(110, Math.max(72, width * .22)) : 116;
  const cardHeight = 78;
  const endCount = portrait && count >= 8 ? 2 : Math.min(1, Math.floor(count / 2));
  const sideCount = count - endCount * 2;
  const firstSide = Math.ceil(sideCount / 2), secondSide = Math.floor(sideCount / 2);
  const seats: TableRect[] = [];
  const artWidth = portrait
    ? Math.min(260, width - 2 * (padding + cardWidth + gap))
    : width - 2 * (padding + cardWidth + gap);
  const artHeight = artWidth * (portrait ? PLAYMAT_SIZE.height / PLAYMAT_SIZE.width : PLAYMAT_SIZE.width / PLAYMAT_SIZE.height);
  const railHeight = portrait ? firstSide * cardHeight + Math.max(0, firstSide - 1) * gap : cardHeight;
  const middleHeight = Math.max(artHeight, railHeight);
  const height = middleHeight + 2 * (padding + cardHeight + gap);
  const mat = { x: (width - artWidth) / 2, y: (height - artHeight) / 2, width: artWidth, height: artHeight };
  const spread = (n: number, start: number, length: number) => Array.from({length:n}, (_,i)=>start+length*(i+.5)/n);
  const seat = (cx:number,cy:number) => seats.push({x:cx-cardWidth/2,y:cy-cardHeight/2,width:cardWidth,height:cardHeight});
  if (portrait) {
    for(const x of spread(endCount,padding,width-2*padding))seat(x,padding+cardHeight/2);
    for(const y of spread(firstSide,padding+cardHeight+gap,middleHeight))seat(padding+cardWidth/2,y);
    for(const x of spread(endCount,padding,width-2*padding).reverse())seat(x,height-padding-cardHeight/2);
    for(const y of spread(secondSide,padding+cardHeight+gap,middleHeight).reverse())seat(width-padding-cardWidth/2,y);
  } else {
    for(const x of spread(firstSide,padding,width-2*padding))seat(x,padding+cardHeight/2);
    for(const y of spread(endCount,padding+cardHeight+gap,middleHeight))seat(width-padding-cardWidth/2,y);
    for(const x of spread(secondSide,padding,width-2*padding).reverse())seat(x,height-padding-cardHeight/2);
    for(const y of spread(endCount,padding+cardHeight+gap,middleHeight))seat(padding+cardWidth/2,y);
  }
  return { width, height, portrait, mat, seats };
}
