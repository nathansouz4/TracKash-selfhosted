// Classification of B3 listed assets: class (stock, FII, ETF, BDR) and sector or
// FII segment. Pluggy's subtype is sometimes wrong (it reports some FIIs as
// stocks), so the B3 product name and a curated table take precedence.

export type EquityClass = "Ações" | "FIIs" | "ETFs" | "BDRs";

type Profile = { assetClass: EquityClass; sector: string };

/** Curated profiles (sector for stocks, segment for FIIs, exposure for ETFs). */
const KNOWN: Record<string, Profile> = {
  // Stocks
  ITUB3: { assetClass: "Ações", sector: "Bancos" },
  ITUB4: { assetClass: "Ações", sector: "Bancos" },
  BBDC3: { assetClass: "Ações", sector: "Bancos" },
  BBDC4: { assetClass: "Ações", sector: "Bancos" },
  BBAS3: { assetClass: "Ações", sector: "Bancos" },
  SANB3: { assetClass: "Ações", sector: "Bancos" },
  SANB4: { assetClass: "Ações", sector: "Bancos" },
  SANB11: { assetClass: "Ações", sector: "Bancos" },
  BPAC11: { assetClass: "Ações", sector: "Bancos" },
  ITSA3: { assetClass: "Ações", sector: "Holdings financeiras" },
  ITSA4: { assetClass: "Ações", sector: "Holdings financeiras" },
  BBSE3: { assetClass: "Ações", sector: "Seguros" },
  CXSE3: { assetClass: "Ações", sector: "Seguros" },
  PSSA3: { assetClass: "Ações", sector: "Seguros" },
  CMIG3: { assetClass: "Ações", sector: "Energia elétrica" },
  CMIG4: { assetClass: "Ações", sector: "Energia elétrica" },
  CPLE3: { assetClass: "Ações", sector: "Energia elétrica" },
  CPLE6: { assetClass: "Ações", sector: "Energia elétrica" },
  TAEE11: { assetClass: "Ações", sector: "Energia elétrica" },
  ENGI11: { assetClass: "Ações", sector: "Energia elétrica" },
  EGIE3: { assetClass: "Ações", sector: "Energia elétrica" },
  TRPL4: { assetClass: "Ações", sector: "Energia elétrica" },
  ISAE4: { assetClass: "Ações", sector: "Energia elétrica" },
  ELET3: { assetClass: "Ações", sector: "Energia elétrica" },
  SAPR11: { assetClass: "Ações", sector: "Saneamento" },
  SBSP3: { assetClass: "Ações", sector: "Saneamento" },
  PETR3: { assetClass: "Ações", sector: "Petróleo e gás" },
  PETR4: { assetClass: "Ações", sector: "Petróleo e gás" },
  PRIO3: { assetClass: "Ações", sector: "Petróleo e gás" },
  VALE3: { assetClass: "Ações", sector: "Mineração" },
  WEGE3: { assetClass: "Ações", sector: "Bens industriais" },
  EMBJ3: { assetClass: "Ações", sector: "Bens industriais" },
  EMBR3: { assetClass: "Ações", sector: "Bens industriais" },
  VIVT3: { assetClass: "Ações", sector: "Telecomunicações" },
  TIMS3: { assetClass: "Ações", sector: "Telecomunicações" },
  ABEV3: { assetClass: "Ações", sector: "Bebidas" },
  // FIIs (segment)
  XPML11: { assetClass: "FIIs", sector: "Shoppings" },
  VISC11: { assetClass: "FIIs", sector: "Shoppings" },
  HGBS11: { assetClass: "FIIs", sector: "Shoppings" },
  HGLG11: { assetClass: "FIIs", sector: "Logística" },
  BTLG11: { assetClass: "FIIs", sector: "Logística" },
  XPLG11: { assetClass: "FIIs", sector: "Logística" },
  MXRF11: { assetClass: "FIIs", sector: "Recebíveis (papel)" },
  KNCR11: { assetClass: "FIIs", sector: "Recebíveis (papel)" },
  KNIP11: { assetClass: "FIIs", sector: "Recebíveis (papel)" },
  CPTS11: { assetClass: "FIIs", sector: "Recebíveis (papel)" },
  PCIP11: { assetClass: "FIIs", sector: "Recebíveis (papel)" },
  CVBI11: { assetClass: "FIIs", sector: "Recebíveis (papel)" },
  GARE11: { assetClass: "FIIs", sector: "Híbrido / renda urbana" },
  // ETFs (exposure)
  NASD11: { assetClass: "ETFs", sector: "ETF internacional" },
  IVVB11: { assetClass: "ETFs", sector: "ETF internacional" },
  BOVA11: { assetClass: "ETFs", sector: "ETF Brasil" },
  AUVP11: { assetClass: "ETFs", sector: "ETF Brasil" },
  // BDRs
  ROXO34: { assetClass: "BDRs", sector: "Bancos" },
};

/**
 * Best-effort profile from the ticker, the B3 product name and Pluggy's subtype.
 * Unknown stocks/FIIs fall into "Outros" sector rather than being guessed.
 */
export function assetProfile(
  ticker: string,
  productName?: string | null,
  pluggySubtype?: string | null,
): Profile {
  const known = KNOWN[ticker];
  if (known) return known;

  const name = (productName ?? "").toUpperCase();
  const suffix = Number(/\d+$/.exec(ticker)?.[0] ?? 0);
  if (/\bFII\b|IMOB|IMOBILI/.test(name)) return { assetClass: "FIIs", sector: "Outros" };
  if (/INDICE|ÍNDICE|\bETF\b|FDO\.? ?IND/.test(name))
    return { assetClass: "ETFs", sector: "Outros" };
  if (suffix >= 31 && suffix <= 39) return { assetClass: "BDRs", sector: "Outros" };
  if (pluggySubtype === "REAL_ESTATE_FUND") return { assetClass: "FIIs", sector: "Outros" };
  if (pluggySubtype === "ETF" || pluggySubtype === "ETF_FUND")
    return { assetClass: "ETFs", sector: "Outros" };
  if (pluggySubtype === "BDR") return { assetClass: "BDRs", sector: "Outros" };
  return { assetClass: "Ações", sector: "Outros" };
}
