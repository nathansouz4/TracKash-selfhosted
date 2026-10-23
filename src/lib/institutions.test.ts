import { describe, expect, it } from "vitest";
import {
  bankCode,
  matchConnector,
  resolveInstitutionName,
  type ConnectorInfo,
} from "./institutions";

describe("bankCode", () => {
  it("reads the COMPE code from the transfer number", () => {
    expect(bankCode("260/0001/1234567-8")).toBe("260");
    expect(bankCode("33/1234/5678")).toBe("033");
    expect(bankCode(null)).toBeNull();
  });
});

describe("resolveInstitutionName", () => {
  it("prefers the bank code of bank accounts", () => {
    expect(
      resolveInstitutionName([
        { type: "CREDIT", name: "VISA INFINITE", transferNumber: null },
        { type: "BANK", name: "Banco Bradesco", transferNumber: "237/1234/56789-0" },
      ]),
    ).toBe("Bradesco");
  });

  it("falls back to keywords in account names", () => {
    expect(
      resolveInstitutionName([
        { type: "CREDIT", name: "SANTANDER CARTAO VISA", transferNumber: null },
      ]),
    ).toBe("Santander");
    expect(
      resolveInstitutionName([{ type: "CREDIT", name: "platinum", transferNumber: null }]),
    ).toBeNull();
  });
});

describe("matchConnector", () => {
  const catalog: ConnectorInfo[] = [
    {
      name: "Nubank Empresas",
      type: "BUSINESS_BANK",
      isOpenFinance: true,
      imageUrl: "b.svg",
      primaryColor: null,
    },
    {
      name: "Nubank",
      type: "PERSONAL_BANK",
      isOpenFinance: true,
      imageUrl: "212.svg",
      primaryColor: "820ad1",
    },
    {
      name: "BTGPactual",
      type: "INVESTMENT",
      isOpenFinance: false,
      imageUrl: "214i.svg",
      primaryColor: null,
    },
    {
      name: "BTGPactual",
      type: "PERSONAL_BANK",
      isOpenFinance: true,
      imageUrl: "214.svg",
      primaryColor: null,
    },
    {
      name: "Itaú",
      type: "PERSONAL_BANK",
      isOpenFinance: true,
      imageUrl: "itau.svg",
      primaryColor: null,
    },
  ];

  it("picks the personal Open Finance connector", () => {
    expect(matchConnector("Nubank", catalog)?.imageUrl).toBe("212.svg");
    expect(matchConnector("BTG Pactual", catalog)?.imageUrl).toBe("214.svg");
  });

  it("ignores accents and returns null when nothing matches", () => {
    expect(matchConnector("Itau", catalog)?.imageUrl).toBe("itau.svg");
    expect(matchConnector("Sicoob", catalog)).toBeNull();
  });
});
