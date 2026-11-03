"use client";

import { calculateGameStakes, blindNumber, USD_TO_PYG, type EntryCurrency, type BuyInBB } from "../lib/game-stakes";

export default function StakeFields({ amount, currency, buyInBB, onAmount, onCurrency, onBuyInBB }: {
  amount: string; currency: EntryCurrency; buyInBB: BuyInBB;
  onAmount: (amount: string) => void; onCurrency: (currency: EntryCurrency) => void; onBuyInBB: (value: BuyInBB) => void;
}) {
  const stakes = calculateGameStakes(Number(amount), currency, buyInBB);
  const updateAmount = (value: string) => onAmount(value);
  return <>
    <label>Buy-in estándar ({currency === "USD" ? "USD" : "Gs."})<input name="buyin" type="number" inputMode={currency === "USD" ? "decimal" : "numeric"} min={currency === "USD" ? "0.01" : "1"} step={currency === "USD" ? "0.01" : "1"} required value={amount} placeholder={currency === "USD" ? "Ej.: 20" : "Ej.: 120000"} onInput={e => updateAmount(e.currentTarget.value)} onChange={e => updateAmount(e.target.value)} /></label>
    <label>Moneda<select name="currency" value={currency} onChange={e => onCurrency(e.target.value as EntryCurrency)}><option value="PYG">Guaraníes (Gs.)</option><option value="USD">Dólares (USD)</option></select></label>
    {currency === "USD" && <div className="stake-conversion full" role="status"><strong>1 USD = {blindNumber(USD_TO_PYG)} Gs. · cambio fijo</strong><span>{stakes ? `Buy-in convertido: ${blindNumber(stakes.standardBuyIn)} Gs.` : "Ingresá el buy-in en USD para ver la conversión."}</span><small>La mesa, los cash-outs y las estadísticas se calculan en guaraníes.</small></div>}
    <fieldset className="stake-bb-options full"><legend>El buy-in estándar equivale a</legend>{([100, 50] as const).map(value => <label key={value} className={buyInBB === value ? "selected" : ""}><input type="radio" name="buyInBB" value={value} checked={buyInBB === value} onChange={() => onBuyInBB(value)} /><span><strong>{value} BB</strong><small>{value} ciegas grandes</small></span></label>)}</fieldset>
    <label className="full">Blinds iniciales (Gs.)<input name="blinds" readOnly value={stakes?.blinds || ""} placeholder="Se calculan al ingresar el buy-in" aria-describedby="blind-calculation" /><small id="blind-calculation">Small blind / Big blind · BB = buy-in ÷ {buyInBB}; SB = BB ÷ 2.</small>{currency === "USD" && stakes && <small>Equivalente en USD: {(stakes.smallBlind / USD_TO_PYG).toLocaleString("es-PY", { maximumFractionDigits: 6 })} / {(stakes.bigBlind / USD_TO_PYG).toLocaleString("es-PY", { maximumFractionDigits: 6 })}.</small>}</label>
    {amount && !stakes && <p className="full stake-error" role="alert">Ingresá un monto positivo válido{currency === "USD" ? ", con hasta 2 decimales" : ", en guaraníes enteros"}.</p>}
  </>;
}
