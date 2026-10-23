// pt-BR labels for Pluggy's top-level categories, used when the category
// catalog has no translation. Unknown names are shown as they come.

const LABELS: Record<string, string> = {
  income: "Renda",
  salary: "Salário",
  "loans and financing": "Empréstimos e financiamentos",
  investments: "Investimentos",
  "same person transfer": "Transferência entre contas próprias",
  transfers: "Transferências",
  "legal obligations": "Obrigações legais",
  services: "Serviços",
  shopping: "Compras",
  "digital services": "Serviços digitais",
  groceries: "Supermercado",
  "food and drinks": "Alimentação",
  "eating out": "Restaurantes",
  "food delivery": "Delivery",
  travel: "Viagem",
  donations: "Doações",
  gambling: "Apostas",
  taxes: "Impostos",
  "bank fees": "Tarifas bancárias",
  housing: "Moradia",
  healthcare: "Saúde",
  transportation: "Transporte",
  transport: "Transporte",
  insurance: "Seguros",
  leisure: "Lazer",
  education: "Educação",
  utilities: "Contas de consumo",
  telecommunications: "Telecomunicações",
  "credit card payment": "Pagamento de fatura",
  "credit card": "Cartão de crédito",
  pets: "Pets",
  "personal care": "Cuidados pessoais",
  "proceeds interests and dividends": "Proventos e juros",
};

export function categoryLabel(name: string | null | undefined): string {
  if (!name) return "Sem categoria";
  return LABELS[name.trim().toLowerCase()] ?? name;
}
