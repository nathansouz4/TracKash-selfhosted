import { createServerFn } from "@tanstack/react-start";
import { importB3Statement, MAX_STATEMENT_BYTES } from "@/backend/b3.server";
import { B3FormatError } from "@/lib/b3";

/** Upload of the B3 movement statement (.xlsx). Idempotent: only new rows are added. */
export const importB3 = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Envie o arquivo do extrato.");
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("Envie o arquivo do extrato.");
    if (file.size === 0 || file.size > MAX_STATEMENT_BYTES)
      throw new Error("Arquivo vazio ou maior que 5 MB.");
    if (!/\.xlsx$/i.test(file.name)) throw new Error("Envie o arquivo .xlsx exportado pela B3.");
    return file;
  })
  .handler(async ({ data }) => {
    try {
      const buffer = Buffer.from(await data.arrayBuffer());
      return await importB3Statement(data.name, buffer);
    } catch (error) {
      if (error instanceof B3FormatError) throw new Error(error.message);
      console.error(error);
      throw new Error("Não foi possível importar o extrato.");
    }
  });
