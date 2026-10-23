import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileUp } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { importB3 } from "@/functions/b3.functions";
import { formatDateBR } from "@/lib/format";

type ImportResult = Awaited<ReturnType<typeof importB3>>;

/** Uploads the B3 movement statement (.xlsx); only new rows are added. */
export function B3ImportButton({
  variant = "outline",
  onImported,
}: {
  variant?: "outline" | "default";
  onImported?: (result: ImportResult) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const importFn = useServerFn(importB3);

  const mutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return importFn({ data: form });
    },
    onMutate: () => toast.loading("Importando extrato da B3…", { id: "b3" }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      toast.success(
        `${result.rowsInserted} novos lançamentos (de ${result.rowsRead}) · ${formatDateBR(result.periodStart)} a ${formatDateBR(result.periodEnd)}`,
        { id: "b3" },
      );
      onImported?.(result);
    },
    onError: (error) => toast.error(error.message, { id: "b3" }),
    onSettled: () => {
      if (input.current) input.current.value = "";
    },
  });

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) mutation.mutate(file);
        }}
      />
      <Button
        variant={variant}
        onClick={() => input.current?.click()}
        disabled={mutation.isPending}
      >
        <FileUp className="h-4 w-4" />
        {mutation.isPending ? "Importando…" : "Importar extrato B3"}
      </Button>
    </>
  );
}
