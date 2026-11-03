export type EntryCurrency = "PYG" | "USD";
export type BuyInBB = 100 | 50;
export const USD_TO_PYG = 6000;
export const blindNumber = (value: number) => value.toLocaleString("es-PY", { maximumFractionDigits: 3 });

// All existing money calculations use guaraníes. Convert once on creation,
// retaining the input and fixed rate as metadata, never converting on reload.
export function calculateGameStakes(amount: number, inputCurrency: EntryCurrency, buyInBB: BuyInBB) {
  if (!["PYG", "USD"].includes(inputCurrency) || ![50, 100].includes(buyInBB) || !Number.isFinite(amount) || amount <= 0) return null;
  const precision = inputCurrency === "USD" ? 100 : 1;
  if (Math.abs(amount * precision - Math.round(amount * precision)) > 0.000001) return null;
  const exchangeRate = inputCurrency === "USD" ? USD_TO_PYG : 1;
  const standardBuyIn = Math.round(amount * exchangeRate);
  if (!Number.isSafeInteger(standardBuyIn) || standardBuyIn < 1) return null;
  const bigBlind = standardBuyIn / buyInBB;
  const smallBlind = bigBlind / 2;
  return { currency: "PYG" as const, inputCurrency, inputBuyIn: amount, exchangeRate, buyInBB, standardBuyIn, smallBlind, bigBlind,
    blinds: `${blindNumber(smallBlind)} / ${blindNumber(bigBlind)}` };
}
