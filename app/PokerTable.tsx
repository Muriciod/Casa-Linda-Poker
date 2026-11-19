"use client";

import {useEffect, useRef, useState, type ReactNode} from "react";
import {pokerTableLayout, PLAYMAT_SIZE} from "../lib/poker-table-layout";
import {PLAYMAT_MATRIX} from "../lib/playmat-projection";
import "./poker-table.css";

export type TablePlayer = {id:string; name:string; amountLabel:string; amountTitle:string; avatar:ReactNode};

export default function PokerTable({players}:{players:TablePlayer[]}) {
  const ref=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(320);
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    const measure=()=>setWidth(element.getBoundingClientRect().width);
    measure();const observer=new ResizeObserver(measure);observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  const visible=players.slice(0,10), layout=pokerTableLayout(width,visible.length);
  const {mat,portrait}=layout;
  return <section className="cl-table" aria-label="Representación de la mesa actual">
    <header className="cl-table-heading"><div><span>MESA ACTUAL</span><h3>Mesa Casa Linda</h3></div><small>{players.length} {players.length===1?'jugador':'jugadores'}</small></header>
    <div ref={ref} className="cl-table-viewport">
      <div className="cl-table-scene" style={{height:layout.height}} data-orientation={portrait?'portrait':'landscape'}>
        <div className="cl-table-playmat" role="img" aria-label="Playmat de Casa Linda Poker visto desde arriba" style={{left:mat.x,top:mat.y,width:mat.width,height:mat.height}}>
          <div className="cl-table-flat-art" style={{width:PLAYMAT_SIZE.width,height:PLAYMAT_SIZE.height,transform:portrait?`scale(${mat.width/PLAYMAT_SIZE.width})`:`scale(${mat.width/PLAYMAT_SIZE.height}) translateX(${PLAYMAT_SIZE.height}px) rotate(90deg)`}}>
            <img src="/images/table/playmat.webp" loading="lazy" decoding="async" alt="" width={PLAYMAT_SIZE.width} height={PLAYMAT_SIZE.height} style={{transform:PLAYMAT_MATRIX}} />
          </div>
        </div>
        <ol className="cl-table-seats" aria-label="Jugadores sentados">
          {visible.map((player,i)=>{const seat=layout.seats[i];return <li className="cl-table-seat" key={player.id} style={{left:seat.x,top:seat.y,width:seat.width,height:seat.height}} title={`Asiento ${seat.number} · ${player.name}: ${player.amountTitle}`}>
            <div className="cl-table-seat-identity"><span className="cl-table-avatar">{player.avatar}</span><span className="cl-table-seat-number">{String(seat.number).padStart(2,'0')}</span></div>
            <strong className="cl-table-player-name">{player.name}</strong>
            <span className="cl-table-player-amount" aria-label={player.amountTitle}>{player.amountLabel}</span>
          </li>;})}
        </ol>
      </div>
    </div>
    {players.length===0&&<p className="cl-table-caption">La mesa está lista. Añadí jugadores para comenzar.</p>}
    {players.length>10&&<p className="cl-table-caption">+{players.length-10} jugadores en la lista de la partida.</p>}
  </section>;
}
