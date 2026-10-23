import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addConnection } from "@/functions/connections.functions";
import { ExternalLink, Field, FormError, Instructions, SecretField } from "./parts";

// Pluggy forms, used by the first-run setup, Configurações and Conexões.
// Credentials are tested by the server before being saved, and never shown back.

export function MeuPluggyInstructions() {
  return (
    <Instructions>
      <li>
        Crie sua conta gratuita no{" "}
        <ExternalLink href="https://meu.pluggy.ai">Meu Pluggy</ExternalLink>, o app de uso pessoal
        da Pluggy.
      </li>
      <li>
        Conecte seus bancos, cartões e corretoras pelo Open Finance (até 5 conexões). O acesso é
        somente leitura: nada pode ser movimentado.
      </li>
      <li>Espere cada conexão aparecer como atualizada no Meu Pluggy.</li>
    </Instructions>
  );
}

export function PluggyCredentialsInstructions() {
  return (
    <Instructions>
      <li>
        Entre em <ExternalLink href="https://dashboard.pluggy.ai">dashboard.pluggy.ai</ExternalLink>{" "}
        (conta gratuita de desenvolvedor).
      </li>
      <li>
        Em <strong>Applications</strong>, crie uma aplicação (ou abra a que já existe).
      </li>
      <li>
        Copie o <strong>Client ID</strong> e o <strong>Client Secret</strong> e cole abaixo.
      </li>
    </Instructions>
  );
}

export function ItemIdInstructions() {
  return (
    <Instructions>
      <li>
        Em <ExternalLink href="https://dashboard.pluggy.ai">dashboard.pluggy.ai</ExternalLink>, abra{" "}
        <strong>Applications → sua aplicação → Demo</strong>.
      </li>
      <li>
        Se ainda não fez, conecte o <strong>MeuPluggy</strong> ali (entre com a conta do Meu Pluggy
        e autorize as conexões).
      </li>
      <li>
        Em <strong>Itens conectados</strong>, clique em cada item e copie o <strong>ID</strong> (um
        UUID). Cole um de cada vez abaixo.
      </li>
    </Instructions>
  );
}

export function PluggyCredentialsForm({
  configured,
  submit,
  onSaved,
  actions,
}: {
  configured?: boolean;
  submit: (data: { clientId: string; clientSecret: string }) => Promise<unknown>;
  onSaved: () => void | Promise<void>;
  /** Extra buttons next to the submit button. */
  actions?: ReactNode;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const save = useMutation({
    mutationFn: submit,
    onSuccess: async () => {
      setClientId("");
      setClientSecret("");
      await onSaved();
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate({ clientId, clientSecret });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field
        id="pluggy-client-id"
        label="Client ID"
        autoComplete="off"
        spellCheck={false}
        required
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        placeholder={configured ? "Configurado: preencha para trocar" : undefined}
      />
      <SecretField
        id="pluggy-client-secret"
        label="Client Secret"
        required
        value={clientSecret}
        onChange={(e) => setClientSecret(e.target.value)}
      />
      <FormError error={save.error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Testando…" : "Testar e salvar"}
        </Button>
        {actions}
      </div>
    </form>
  );
}

/** Adds a Meu Pluggy item by id; the server checks it belongs to the Pluggy application. */
export function AddConnectionForm({ onAdded }: { onAdded?: () => void | Promise<void> }) {
  const queryClient = useQueryClient();
  const addFn = useServerFn(addConnection);
  const [itemId, setItemId] = useState("");
  const add = useMutation({
    mutationFn: () => addFn({ data: { itemId } }),
    onSuccess: async ({ name }) => {
      setItemId("");
      toast.success(`${name} adicionada.`);
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      await queryClient.invalidateQueries({ queryKey: ["app"] });
      await onAdded?.();
    },
  });

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    add.mutate();
  }

  return (
    <form onSubmit={handleAdd} className="space-y-2">
      <Field
        id="itemId"
        label="ID do item (itemId)"
        placeholder="00000000-0000-0000-0000-000000000000"
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        required
        className="font-mono text-xs"
      />
      <FormError error={add.error} />
      <Button type="submit" disabled={add.isPending}>
        {add.isPending ? "Verificando…" : "Adicionar conexão"}
      </Button>
      <p className="text-xs text-muted-foreground">
        A Pluggy não lista as conexões do Meu Pluggy pela API, por isso o ID é informado aqui.
        Sozinho ele não dá acesso a nada sem as credenciais da sua aplicação.
      </p>
    </form>
  );
}
