import { z } from "zod";

// Input of the Pluggy credentials form, shared by the setup and Configurações.

const credential = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .max(512)
    .regex(/^[\x21-\x7e]+$/, "Valor inválido: copie a chave sem espaços nem quebras de linha.");

export const pluggySchema = z.object({
  clientId: credential("Informe o Client ID."),
  clientSecret: credential("Informe o Client Secret."),
});
