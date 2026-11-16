import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/poker-table-layout.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {pokerTableLayout,PLAYMAT_SIZE}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const overlaps=(a,b)=>a.x<b.x+b.width-.001&&a.x+a.width>b.x+.001&&a.y<b.y+b.height-.001&&a.y+a.height>b.y+.001;

test('all player counts fit without overlapping seats or artwork across responsive widths',()=>{
  for(let width=240;width<=1500;width+=5)for(let count=0;count<=10;count++){
    const layout=pokerTableLayout(width,count),context=`${width}px/${count} players`;
    assert.equal(layout.seats.length,count,context);
    assert.ok(layout.mat.width>0&&layout.mat.height>0);
    for(const [i,seat] of layout.seats.entries()){
      assert.ok(seat.x>=0&&seat.y>=0&&seat.x+seat.width<=width+.001&&seat.y+seat.height<=layout.height+.001,context);
      assert.ok(!overlaps(seat,layout.mat),context);
      for(const previous of layout.seats.slice(0,i))assert.ok(!overlaps(seat,previous),context);
    }
  }
});
test('official playmat keeps the source aspect ratio, centered, in both orientations',()=>{
  const bytes=readFileSync(new URL('../public/images/table/playmat-official.png',import.meta.url));
  assert.equal(bytes.readUInt32BE(16),PLAYMAT_SIZE.width);assert.equal(bytes.readUInt32BE(20),PLAYMAT_SIZE.height);
  for(const width of [280,320,390,619,620,768,1100,1280])for(const count of [2,4,6,8,9,10]){
    const l=pokerTableLayout(width,count),m=l.mat;
    const ratio=l.portrait?679/1055:1055/679;
    assert.ok(Math.abs(m.width/m.height-ratio)<1e-10);
    assert.equal(m.x+m.width/2,width/2);assert.equal(m.y+m.height/2,l.height/2);
    assert.ok(l.seats.every(s=>s.width===l.seats[0].width&&s.height===l.seats[0].height));
  }
});
test('empty, single and overflow tables have deterministic presentation without mutating inputs',()=>{
  assert.equal(pokerTableLayout(390,0).seats.length,0);
  assert.equal(pokerTableLayout(390,1).seats.length,1);
  assert.equal(pokerTableLayout(390,12).seats.length,10);
  assert.deepEqual(pokerTableLayout(768,9),pokerTableLayout(768,9));
});
